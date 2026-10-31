package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Adaptador somente leitura para os endpoints públicos usados pelo MangaLivre.blog.
 * A integração é não oficial: nenhuma URL ou resposta da origem faz parte do contrato do NekoFlow.
 */
@Component
public class MangaLivreApiClient {
    // O WordPress devolve alguns slugs com caracteres UTF-8 ainda percent-encoded.
    private static final Pattern SAFE_SLUG = Pattern.compile("(?:[a-z0-9]|%[0-9a-f]{2})+(?:-(?:[a-z0-9]|%[0-9a-f]{2})+)*",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHAPTER_NUMBER = Pattern.compile("(?i)cap(?:í|i)tulo\\s+([^:–—\\s]+)");
    private static final int MAX_CACHE_ENTRIES = 512;

    public record MangaSummary(long id, String slug, String title, String url, OffsetDateTime modifiedAt,
                               String synopsis, String coverUrl, List<String> markers) {}
    public record MangaPage(List<MangaSummary> items, int page, int size, long totalElements, int totalPages) {}
    public record MangaDetail(long id, String slug, String title, String synopsis, String coverUrl,
                              String url, int chapterCount) {}
    public record ChapterSummary(String slug, String number, String title, String url, String publishedLabel) {}
    public record ChapterPage(List<ChapterSummary> items, int offset, int nextOffset,
                              int totalElements, boolean hasMore) {}
    public record ReaderPage(int index, String imageUrl, String alt) {}
    public record ReaderChapter(String slug, String title, String mangaTitle, String mangaUrl,
                                String chapterNumber, String previousChapterUrl, String nextChapterUrl,
                                List<ReaderPage> pages) {}
    public record Health(String status, long latencyMs, long catalogSize) {}

    private final ObjectMapper mapper;
    private final HttpClient http;
    private final String origin;
    private final Duration timeout;
    private final Duration cacheTtl;
    private final boolean enabled;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    @Autowired
    public MangaLivreApiClient(ObjectMapper mapper,
                               @Value("${nekoflow.mangalivre.origin:https://mangalivre.blog}") String origin,
                               @Value("${nekoflow.mangalivre.request-timeout-seconds:20}") long timeoutSeconds,
                               @Value("${nekoflow.mangalivre.cache-ttl-seconds:120}") long cacheTtlSeconds,
                               @Value("${nekoflow.mangalivre.enabled:true}") boolean enabled) {
        this(mapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(timeoutSeconds)).build(),
                origin, Duration.ofSeconds(timeoutSeconds), Duration.ofSeconds(cacheTtlSeconds), enabled);
    }

    MangaLivreApiClient(ObjectMapper mapper, HttpClient http, String origin,
                        Duration timeout, Duration cacheTtl, boolean enabled) {
        this.mapper = mapper;
        this.http = http;
        this.origin = origin.replaceAll("/+$", "");
        this.timeout = timeout;
        this.cacheTtl = cacheTtl;
        this.enabled = enabled;
    }

    public MangaPage catalog(int page, int size, String search) {
        requireEnabled();
        String path = "/wp-json/wp/v2/manga?context=view&_embed=1"
                + "&_fields=id,slug,title,link,modified,excerpt,class_list,_links,_embedded"
                + "&orderby=modified&order=desc&page=" + page + "&per_page=" + size;
        if (search != null && !search.isBlank()) path += "&search=" + query(search.strip());
        OriginResponse response = get(path, origin + "/manga/", true);
        return parseCatalog(response.body(), response.header("x-wp-total"),
                response.header("x-wp-totalpages"), page, size);
    }

    public MangaDetail manga(String slug) {
        requireEnabled();
        requireSlug(slug);
        return parseManga(get("/manga/" + slug + "/", origin + "/manga/", true).body(), slug, origin);
    }

    public ChapterPage chapters(String mangaSlug, int offset, String search) {
        MangaDetail manga = manga(mangaSlug);
        String path = "/wp-json/slimeread/v1/chapters/" + manga.id() + "?offset=" + offset;
        if (search != null && !search.isBlank()) path += "&search=" + query(search.strip());
        return parseChapters(get(path, manga.url(), true).body(), origin);
    }

    public ReaderChapter reader(String chapterSlug) {
        requireEnabled();
        requireSlug(chapterSlug);
        return parseReader(get("/capitulo/" + chapterSlug + "/", origin, true).body(), chapterSlug, origin);
    }

    public Health health() {
        requireEnabled();
        long started = System.nanoTime();
        OriginResponse response = get("/wp-json/wp/v2/manga?per_page=1&page=1&_fields=id", origin, false);
        long total = number(response.header("x-wp-total"), -1);
        if (total < 1) throw new ProviderException("MangaLivre não retornou um catálogo válido.");
        return new Health("UP", Duration.ofNanos(System.nanoTime() - started).toMillis(), total);
    }

    static MangaPage parseCatalog(String json, String totalHeader, String pagesHeader, int page, int size) {
        try {
            ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
            JsonNode root = mapper.readTree(json);
            if (!root.isArray()) throw new ProviderException("Catálogo MangaLivre possui formato inesperado.");
            List<MangaSummary> items = new ArrayList<>();
            for (JsonNode item : root) {
                String slug = item.path("slug").asText("");
                String title = Jsoup.parse(item.path("title").path("rendered").asText("")).text();
                if (item.path("id").asLong() < 1 || slug.isBlank() || title.isBlank()) continue;
                OffsetDateTime modified = null;
                String rawModified = item.path("modified").asText("");
                if (!rawModified.isBlank()) modified = parseDate(rawModified);
                JsonNode media = item.path("_embedded").path("wp:featuredmedia").path(0);
                String cover = media.path("media_details").path("sizes").path("manga-cover")
                        .path("source_url").asText("");
                if (cover.isBlank()) cover = media.path("source_url").asText("");
                List<String> markers = new ArrayList<>();
                for (JsonNode marker : item.path("class_list")) {
                    String value = marker.asText("").strip().toLowerCase(Locale.ROOT);
                    if (!value.isBlank()) markers.add(value);
                }
                items.add(new MangaSummary(item.path("id").asLong(), slug, title,
                        item.path("link").asText(""), modified,
                        Jsoup.parse(item.path("excerpt").path("rendered").asText("")).text().strip(),
                        cover.isBlank() ? null : cover, List.copyOf(markers)));
            }
            long total = number(totalHeader, items.size());
            int pages = (int) number(pagesHeader, total == 0 ? 0 : (total + size - 1) / size);
            return new MangaPage(List.copyOf(items), page, size, total, pages);
        } catch (ProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new ProviderException("Não foi possível interpretar o catálogo MangaLivre.", e);
        }
    }

    static MangaDetail parseManga(String html, String expectedSlug, String origin) {
        Document doc = Jsoup.parse(html, origin);
        Element load = doc.selectFirst("#sr-load-chapters[data-manga][data-total]");
        Element title = doc.selectFirst("h1.manga-title");
        if (load == null || title == null) throw new NotFoundException("Obra não encontrada no MangaLivre.");
        long id = number(load.attr("data-manga"), -1);
        int chapters = (int) number(load.attr("data-total"), 0);
        if (id < 1) throw new ProviderException("Identificador da obra MangaLivre é inválido.");
        Element synopsis = doc.selectFirst(".manga-synopsis");
        Element cover = doc.selectFirst(".manga-cover img[src]");
        Element canonical = doc.selectFirst("link[rel=canonical][href]");
        String url = canonical == null ? origin + "/manga/" + expectedSlug + "/" : canonical.absUrl("href");
        return new MangaDetail(id, expectedSlug, title.text().strip(),
                synopsis == null ? "" : synopsis.text().strip(), cover == null ? null : cover.absUrl("src"),
                url, chapters);
    }

    static ChapterPage parseChapters(String json, String origin) {
        try {
            JsonNode root = new ObjectMapper().readTree(json);
            String html = root.path("list").asText("");
            if (html.isBlank()) html = root.path("grid").asText("");
            Document doc = Jsoup.parseBodyFragment(html, origin);
            Map<String, ChapterSummary> unique = new LinkedHashMap<>();
            for (Element row : doc.select(".chapter-item")) {
                Element link = row.selectFirst("a.chapter-link[href]");
                if (link == null) link = row.selectFirst("a[href*=/capitulo/]");
                if (link == null) continue;
                String url = link.absUrl("href");
                String slug = slugFrom(url, "/capitulo/");
                if (slug == null) continue;
                Element numberElement = row.selectFirst(".chapter-number");
                String label = numberElement == null ? link.text().strip() : numberElement.text().strip();
                Matcher number = CHAPTER_NUMBER.matcher(label);
                String value = label;
                while (number.find()) value = number.group(1); // alguns registros repetem "Capítulo 1: Capítulo 1.1"
                String title = label.contains(":") ? label.substring(label.indexOf(':') + 1).strip() : "";
                Element date = row.selectFirst(".chapter-date");
                unique.putIfAbsent(slug, new ChapterSummary(slug, value, title, url,
                        date == null ? "" : date.text().strip()));
            }
            int offset = root.path("offset").asInt(unique.size());
            int total = root.path("total").asInt(unique.size());
            boolean hasMore = root.has("has_more") ? root.path("has_more").asBoolean() : offset < total;
            int previousOffset = Math.max(0, offset - unique.size());
            return new ChapterPage(List.copyOf(unique.values()), previousOffset, offset, total, hasMore);
        } catch (ProviderException e) {
            throw e;
        } catch (Exception e) {
            throw new ProviderException("Não foi possível interpretar os capítulos MangaLivre.", e);
        }
    }

    static ReaderChapter parseReader(String html, String expectedSlug, String origin) {
        Document doc = Jsoup.parse(html, origin);
        List<ReaderPage> pages = new ArrayList<>();
        for (Element image : doc.select("img.chapter-image[src]")) {
            String url = image.absUrl("src");
            if (!isHttps(url)) continue;
            pages.add(new ReaderPage(pages.size() + 1, url, image.attr("alt")));
        }
        if (pages.isEmpty()) throw new NotFoundException("Capítulo não encontrado ou sem páginas no MangaLivre.");
        Element heading = doc.selectFirst(".chapter-title-bar h1.manga-title");
        Element mangaLink = heading == null ? null : heading.selectFirst("a[href*=/manga/]");
        String headingText = heading == null ? "" : heading.text().strip();
        Matcher match = CHAPTER_NUMBER.matcher(headingText);
        String chapterNumber = match.find() ? match.group(1) : "";
        String mangaTitle = mangaLink == null ? "" : mangaLink.text().strip();
        String title = mangaTitle.isBlank() ? headingText : mangaTitle + " — Capítulo " + chapterNumber;
        return new ReaderChapter(expectedSlug, title, mangaTitle,
                mangaLink == null ? null : mangaLink.absUrl("href"), chapterNumber,
                navigation(doc, "anterior"), navigation(doc, "próximo"), List.copyOf(pages));
    }

    private OriginResponse get(String path, String referer, boolean cacheable) {
        String url = origin + path;
        long now = System.nanoTime();
        if (cacheable) {
            Cached hit = cache.get(url);
            if (hit != null && now - hit.createdAtNanos() < cacheTtl.toNanos()) return hit.response();
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(timeout)
                    .header("Accept", "text/html,application/json")
                    .header("User-Agent", "Mozilla/5.0 (compatible; NekoFlow-MangaLivre-Adapter/1.0)")
                    .header("Referer", referer).GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) throw new NotFoundException("Recurso não encontrado no MangaLivre.");
            if (response.statusCode() != 200)
                throw new ProviderException("MangaLivre respondeu HTTP " + response.statusCode() + ".");
            Map<String, String> headers = new LinkedHashMap<>();
            response.headers().map().forEach((key, values) -> {
                if (!values.isEmpty()) headers.put(key.toLowerCase(Locale.ROOT), values.get(0));
            });
            OriginResponse result = new OriginResponse(response.body(), Map.copyOf(headers));
            if (cacheable) {
                if (cache.size() >= MAX_CACHE_ENTRIES) cache.clear();
                cache.put(url, new Cached(now, result));
            }
            return result;
        } catch (ProviderException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ProviderException("Consulta ao MangaLivre foi interrompida.", e);
        } catch (Exception e) {
            throw new ProviderException("Não foi possível consultar o MangaLivre.", e);
        }
    }

    private void requireEnabled() {
        if (!enabled) throw new ProviderException("Integração MangaLivre está desabilitada.");
    }

    private static void requireSlug(String slug) {
        if (slug == null || slug.length() > 240 || !SAFE_SLUG.matcher(slug).matches())
            throw new IllegalArgumentException("Slug MangaLivre inválido.");
    }

    private static String query(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static long number(String value, long fallback) {
        try { return value == null || value.isBlank() ? fallback : Long.parseLong(value); }
        catch (NumberFormatException e) { return fallback; }
    }

    private static OffsetDateTime parseDate(String value) {
        try { return OffsetDateTime.parse(value); }
        catch (DateTimeParseException ignored) {
            return LocalDateTime.parse(value).atZone(ZoneId.of("America/Sao_Paulo")).toOffsetDateTime();
        }
    }

    private static String slugFrom(String url, String marker) {
        try {
            String path = URI.create(url).getPath();
            int start = path.indexOf(marker);
            if (start < 0) return null;
            String slug = path.substring(start + marker.length()).replaceAll("/+$", "");
            return SAFE_SLUG.matcher(slug).matches() ? slug : null;
        } catch (RuntimeException e) { return null; }
    }

    private static boolean isHttps(String url) {
        try { return "https".equalsIgnoreCase(URI.create(url).getScheme()); }
        catch (RuntimeException e) { return false; }
    }

    private static String navigation(Document doc, String label) {
        for (Element link : doc.select("a[href][aria-label]")) {
            if (link.attr("aria-label").toLowerCase(Locale.ROOT).contains(label)) return link.absUrl("href");
        }
        return null;
    }

    private record OriginResponse(String body, Map<String, String> headers) {
        String header(String name) { return headers.get(name.toLowerCase(Locale.ROOT)); }
    }
    private record Cached(long createdAtNanos, OriginResponse response) {}

    public static class ProviderException extends RuntimeException {
        ProviderException(String message) { super(message); }
        ProviderException(String message, Throwable cause) { super(message, cause); }
    }
    public static final class NotFoundException extends ProviderException {
        NotFoundException(String message) { super(message); }
    }
}
