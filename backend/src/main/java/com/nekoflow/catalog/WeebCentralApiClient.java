package com.nekoflow.catalog;

import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Adaptador somente leitura do catálogo público em inglês do WeebCentral. */
@Component
public class WeebCentralApiClient {
    public static final String CONTENT_LANGUAGE = "en";
    private static final Pattern ULID = Pattern.compile("[0-9A-HJKMNP-TV-Z]{26}", Pattern.CASE_INSENSITIVE);
    private static final Pattern SERIES_PATH = Pattern.compile("/series/([0-9A-HJKMNP-TV-Z]{26})(?:/([^/?#]+))?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHAPTER_PATH = Pattern.compile("/chapters/([0-9A-HJKMNP-TV-Z]{26})",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMBER = Pattern.compile("(?i)(?:chapter|episode|ch\\.?|#)\\s*([0-9]+(?:\\.[0-9]+)?)");
    private static final Pattern OFFSET = Pattern.compile("(?:[?&]|&amp;)offset=(\\d+)");
    private static final int MAX_CACHE_ENTRIES = 512;
    private static final int MAX_ATTEMPTS = 12;
    private static final long MIN_REQUEST_INTERVAL_MILLIS = 750L;
    private static final long MAX_BACKOFF_SECONDS = 60L;

    public record SeriesSummary(String id, String slug, String title, String url, String coverUrl,
                                String type, String status, Integer year, List<String> authors,
                                List<String> tags, Boolean officialTranslation, Boolean adultContent,
                                String language) {}
    public record SeriesIndexItem(String id, String slug, String url) {}
    public record SeriesPage(List<SeriesSummary> items, int offset, int limit, Integer nextOffset,
                             boolean hasMore, String language) {}
    public record SeriesDetail(String id, String slug, String title, String url, String coverUrl,
                               String description, String type, String status, Integer year,
                               List<String> authors, List<String> tags, Boolean officialTranslation,
                               Boolean animeAdaptation, Boolean adultContent, String language) {}
    public record ChapterSummary(String id, String label, String number, String title, String url,
                                 OffsetDateTime publishedAt, String language) {}
    public record ChapterList(String seriesId, List<ChapterSummary> items, int totalElements,
                              String language) {}
    public record ReaderPage(int index, String imageUrl, String alt) {}
    public record ReaderChapter(String id, String title, String chapterNumber, String seriesId,
                                String seriesTitle, String seriesUrl, String language,
                                List<ReaderPage> pages) {}
    public record Health(String status, long latencyMs, String language) {}

    private final HttpClient http;
    private final String origin;
    private final Duration timeout;
    private final Duration cacheTtl;
    private final boolean enabled;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private final AtomicLong nextRequestAtNanos = new AtomicLong();
    private final Object requestPacingLock = new Object();

    @Autowired
    public WeebCentralApiClient(@Value("${nekoflow.weebcentral-en.origin:https://weebcentral.com}") String origin,
                                @Value("${nekoflow.weebcentral-en.request-timeout-seconds:20}") long timeoutSeconds,
                                @Value("${nekoflow.weebcentral-en.cache-ttl-seconds:120}") long cacheTtlSeconds,
                                @Value("${nekoflow.weebcentral-en.enabled:true}") boolean enabled) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(timeoutSeconds)).build(), origin,
                Duration.ofSeconds(timeoutSeconds), Duration.ofSeconds(cacheTtlSeconds), enabled);
    }

    WeebCentralApiClient(HttpClient http, String origin, Duration timeout, Duration cacheTtl, boolean enabled) {
        this.http = http;
        this.origin = origin.replaceAll("/+$", "");
        this.timeout = timeout;
        this.cacheTtl = cacheTtl;
        this.enabled = enabled;
    }

    public SeriesPage catalog(int offset, int limit, String search, String type, String adult) {
        requireEnabled();
        StringBuilder path = new StringBuilder("/search/data?display_mode=Full%20Display")
                .append("&sort=").append(query(search == null || search.isBlank() ? "Alphabet" : "Best Match"))
                .append("&order=Ascending&official=Any&anime=Any")
                .append("&adult=").append(query(adult == null || adult.isBlank() ? "Any" : adult))
                .append("&limit=").append(limit).append("&offset=").append(offset);
        if (search != null && !search.isBlank()) path.append("&text=").append(query(search.strip()));
        if (type != null && !type.isBlank()) path.append("&included_type=").append(query(type.strip()));
        return parseCatalog(get(path.toString(), origin + "/search", true), origin, offset, limit);
    }

    public List<SeriesIndexItem> catalogIndex() {
        requireEnabled();
        return parseIndex(get("/sitemap.xml", origin, true), origin);
    }

    public SeriesDetail series(String id) {
        requireId(id);
        return parseSeries(get("/series/" + id, origin, true), id, origin);
    }

    public ChapterList chapters(String seriesId) {
        requireId(seriesId);
        return parseChapters(get("/series/" + seriesId + "/full-chapter-list",
                origin + "/series/" + seriesId, true), seriesId, origin);
    }

    public ReaderChapter reader(String chapterId) {
        requireId(chapterId);
        String chapterUrl = origin + "/chapters/" + chapterId;
        String shell = get("/chapters/" + chapterId, origin, true);
        String images = get("/chapters/" + chapterId + "/images?is_prev=False&reading_style=long_strip",
                chapterUrl, true);
        return parseReader(shell, images, chapterId, origin);
    }

    public Health health() {
        requireEnabled();
        long started = System.nanoTime();
        String html = get("/search/data?display_mode=Full%20Display&limit=1&offset=0", origin + "/search", false);
        if (Jsoup.parseBodyFragment(html, origin).selectFirst("a[href*=/series/]") == null)
            throw new ProviderException("WeebCentral não retornou um catálogo válido.");
        return new Health("UP", Duration.ofNanos(System.nanoTime() - started).toMillis(), CONTENT_LANGUAGE);
    }

    static SeriesPage parseCatalog(String html, String origin, int offset, int limit) {
        Document doc = Jsoup.parseBodyFragment(html, origin);
        Map<String, SeriesSummary> unique = new LinkedHashMap<>();
        for (Element article : doc.select("article.bg-base-300")) {
            Element link = article.selectFirst("a.line-clamp-1[href*=/series/]");
            if (link == null) link = article.selectFirst("a[href*=/series/]");
            if (link == null) continue;
            SeriesAddress address = seriesAddress(link.absUrl("href"));
            if (address == null || unique.containsKey(address.id())) continue;
            Element image = article.selectFirst("img[src][alt$=cover]");
            String title = link.text().strip();
            if (title.isBlank() && image != null) title = image.attr("alt").replaceFirst("(?i)\\s+cover$", "").strip();
            if (title.isBlank()) continue;
            unique.put(address.id(), new SeriesSummary(address.id(), address.slug(), title, link.absUrl("href"),
                    image == null ? null : image.absUrl("src"), label(article, "Type"), label(article, "Status"),
                    integer(label(article, "Year")), links(article, "Author"), values(article, "Tag"),
                    article.text().contains("Official") ? Boolean.TRUE : null, null, CONTENT_LANGUAGE));
        }
        List<SeriesSummary> parsed = new ArrayList<>(unique.values());
        boolean truncated = parsed.size() > limit;
        List<SeriesSummary> visible = truncated ? parsed.subList(0, limit) : parsed;
        Integer nextOffset = truncated ? offset + limit : null;
        Element more = doc.selectFirst("button[hx-get*=offset]");
        if (!truncated && more != null) {
            Matcher matcher = OFFSET.matcher(more.attr("hx-get"));
            if (matcher.find()) nextOffset = Integer.parseInt(matcher.group(1));
        }
        return new SeriesPage(List.copyOf(visible), offset, limit, nextOffset,
                nextOffset != null, CONTENT_LANGUAGE);
    }

    static List<SeriesIndexItem> parseIndex(String xml, String origin) {
        Document doc = Jsoup.parse(xml, origin, org.jsoup.parser.Parser.xmlParser());
        Map<String, SeriesIndexItem> unique = new LinkedHashMap<>();
        for (Element location : doc.select("url > loc")) {
            String url = location.text().strip();
            SeriesAddress address = seriesAddress(url);
            if (address == null) continue;
            unique.putIfAbsent(address.id(), new SeriesIndexItem(address.id(), address.slug(), url));
        }
        if (unique.isEmpty()) throw new ProviderException("Sitemap WeebCentral não contém séries válidas.");
        return List.copyOf(unique.values());
    }

    static SeriesDetail parseSeries(String html, String expectedId, String origin) {
        Document doc = Jsoup.parse(html, origin);
        Element heading = doc.selectFirst("h1");
        Element canonical = doc.selectFirst("link[rel=canonical][href]");
        if (heading == null || canonical == null) throw new NotFoundException("Série não encontrada no WeebCentral.");
        SeriesAddress address = seriesAddress(canonical.absUrl("href"));
        if (address == null || !expectedId.equalsIgnoreCase(address.id()))
            throw new ProviderException("Identidade da série WeebCentral é inválida.");
        Element cover = doc.selectFirst("meta[property=og:image][content]");
        return new SeriesDetail(address.id(), address.slug(), heading.text().strip(), canonical.absUrl("href"),
                cover == null ? null : cover.attr("content"), description(doc), label(doc, "Type"),
                label(doc, "Status"), integer(label(doc, "Released")), links(doc, "Author"),
                links(doc, "Tags"), bool(label(doc, "Official Translation")),
                bool(label(doc, "Anime Adaptation")), bool(label(doc, "Adult Content")), CONTENT_LANGUAGE);
    }

    static ChapterList parseChapters(String html, String seriesId, String origin) {
        Document doc = Jsoup.parseBodyFragment(html, origin);
        Map<String, ChapterSummary> unique = new LinkedHashMap<>();
        for (Element link : doc.select("a[href*=/chapters/]")) {
            String id = chapterId(link.absUrl("href"));
            if (id == null || unique.containsKey(id)) continue;
            Element labelElement = link.selectFirst("span.grow > span");
            String label = labelElement == null ? link.text().strip() : labelElement.text().strip();
            Matcher number = NUMBER.matcher(label);
            String value = number.find() ? number.group(1) : label;
            String title = number.find(0) ? label.substring(number.end()).replaceFirst("^[\\s:—–-]+", "").strip() : "";
            Element time = link.selectFirst("time[datetime]");
            unique.put(id, new ChapterSummary(id, label, value, title, origin + "/chapters/" + id,
                    time == null ? null : date(time.attr("datetime")), CONTENT_LANGUAGE));
        }
        return new ChapterList(seriesId, List.copyOf(unique.values()), unique.size(), CONTENT_LANGUAGE);
    }

    static ReaderChapter parseReader(String shellHtml, String imagesHtml, String chapterId, String origin) {
        Document shell = Jsoup.parse(shellHtml, origin);
        Element seriesLink = shell.selectFirst("a[href*=/series/]");
        SeriesAddress series = seriesLink == null ? null : seriesAddress(seriesLink.absUrl("href"));
        String[] titleParts = shell.title().split("\\s*\\|\\s*");
        String chapterTitle = titleParts.length > 0 ? titleParts[0].strip() : "";
        String seriesTitle = titleParts.length > 1 ? titleParts[1].strip() : seriesLink == null ? "" : seriesLink.text().strip();
        List<ReaderPage> pages = new ArrayList<>();
        Document images = Jsoup.parseBodyFragment(imagesHtml, origin);
        for (Element image : images.select("#chapter-images img[src]")) {
            String url = image.absUrl("src");
            if (!isHttps(url) || url.endsWith("/static/images/broken_image.jpg")) continue;
            pages.add(new ReaderPage(pages.size() + 1, url, image.attr("alt")));
        }
        if (pages.isEmpty()) throw new NotFoundException("Capítulo sem páginas disponíveis no WeebCentral.");
        Matcher number = NUMBER.matcher(chapterTitle);
        return new ReaderChapter(chapterId, chapterTitle, number.find() ? number.group(1) : chapterTitle,
                series == null ? null : series.id(), seriesTitle,
                seriesLink == null ? null : seriesLink.absUrl("href"), CONTENT_LANGUAGE, List.copyOf(pages));
    }

    private String get(String path, String referer, boolean cacheable) {
        String url = origin + path;
        long now = System.nanoTime();
        if (cacheable) {
            Cached hit = cache.get(url);
            if (hit != null && now - hit.createdAtNanos() < cacheTtl.toNanos()) return hit.body();
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(timeout)
                    .header("Accept", "text/html,application/xhtml+xml")
                    .header("User-Agent", "Mozilla/5.0 (compatible; NekoFlow-WeebCentral-English-Adapter/1.0)")
                    .header("Referer", referer).GET().build();
            for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                awaitRequestSlot();
                HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() == 429) {
                    long delay = retryDelaySeconds(response, attempt);
                    postponeRequests(delay);
                    continue;
                }
                if (response.statusCode() == 404)
                    throw new NotFoundException("Recurso não encontrado no WeebCentral.");
                if (response.statusCode() != 200)
                    throw new ProviderException("WeebCentral respondeu HTTP " + response.statusCode() + ".");
                if (cacheable) {
                    if (cache.size() >= MAX_CACHE_ENTRIES) cache.clear();
                    cache.put(url, new Cached(now, response.body()));
                }
                return response.body();
            }
            throw new ProviderException("WeebCentral manteve o limite HTTP 429 após novas tentativas.");
        } catch (ProviderException error) {
            throw error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ProviderException("Consulta ao WeebCentral foi interrompida.", error);
        } catch (Exception error) {
            throw new ProviderException("Não foi possível consultar o WeebCentral.", error);
        }
    }

    private void awaitRequestSlot() throws InterruptedException {
        synchronized (requestPacingLock) {
            long now = System.nanoTime();
            long scheduled = Math.max(now, nextRequestAtNanos.get());
            long wait = scheduled - now;
            if (wait > 0) TimeUnit.NANOSECONDS.sleep(wait);
            nextRequestAtNanos.set(System.nanoTime()
                    + TimeUnit.MILLISECONDS.toNanos(MIN_REQUEST_INTERVAL_MILLIS));
        }
    }

    private void postponeRequests(long seconds) {
        long target = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        nextRequestAtNanos.accumulateAndGet(target, Math::max);
    }

    private static long retryDelaySeconds(HttpResponse<?> response, int attempt) {
        String retryAfter = response.headers().firstValue("Retry-After").orElse("").strip();
        try {
            if (!retryAfter.isBlank()) return Math.min(MAX_BACKOFF_SECONDS,
                    Math.max(10L, Long.parseLong(retryAfter)));
        } catch (NumberFormatException ignored) { }
        return Math.min(MAX_BACKOFF_SECONDS, 5L << Math.min(attempt, 4));
    }

    private void requireEnabled() {
        if (!enabled) throw new ProviderException("Integração WeebCentral English está desabilitada.");
    }
    private static void requireId(String id) {
        if (id == null || !ULID.matcher(id).matches()) throw new IllegalArgumentException("ULID WeebCentral inválido.");
    }
    private static String query(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
    private static SeriesAddress seriesAddress(String url) {
        try {
            Matcher matcher = SERIES_PATH.matcher(URI.create(url).getPath());
            return matcher.find() ? new SeriesAddress(matcher.group(1).toUpperCase(Locale.ROOT),
                    matcher.group(2) == null ? "" : URLDecoder.decode(matcher.group(2), StandardCharsets.UTF_8)) : null;
        } catch (RuntimeException error) { return null; }
    }
    private static String chapterId(String url) {
        try {
            Matcher matcher = CHAPTER_PATH.matcher(URI.create(url).getPath());
            return matcher.find() ? matcher.group(1).toUpperCase(Locale.ROOT) : null;
        } catch (RuntimeException error) { return null; }
    }
    private static String label(Element root, String name) {
        for (Element strong : root.select("strong")) {
            String label = strong.text().replace(":", "").strip();
            if (!label.equalsIgnoreCase(name) && !label.equalsIgnoreCase(name + "(s)")) continue;
            Element parent = strong.parent();
            if (parent == null) return null;
            String value = parent.text().substring(Math.min(parent.text().length(), strong.text().length())).strip();
            return value.isBlank() ? null : value;
        }
        return null;
    }
    private static List<String> links(Element root, String name) {
        for (Element strong : root.select("strong")) {
            if (!strong.text().replace(":", "").strip().toLowerCase(Locale.ROOT)
                    .startsWith(name.toLowerCase(Locale.ROOT))) continue;
            Element parent = strong.parent();
            if (parent == null) return List.of();
            List<String> result = parent.select("a").eachText().stream().map(String::strip)
                    .filter(value -> !value.isBlank()).toList();
            if (!result.isEmpty()) return result;
        }
        return List.of();
    }
    private static List<String> values(Element root, String name) {
        String value = label(root, name);
        if (value == null) return List.of();
        return java.util.Arrays.stream(value.split(",")).map(String::strip).filter(v -> !v.isBlank()).toList();
    }
    private static String description(Document doc) {
        for (Element strong : doc.select("strong")) {
            if (!"Description".equalsIgnoreCase(strong.text().strip())) continue;
            Element parent = strong.parent();
            Element paragraph = parent == null ? null : parent.selectFirst("p");
            return paragraph == null ? null : paragraph.text().strip();
        }
        return null;
    }
    private static Integer integer(String value) {
        try { return value == null ? null : Integer.valueOf(value.replaceAll("[^0-9]", "")); }
        catch (NumberFormatException error) { return null; }
    }
    private static Boolean bool(String value) {
        if (value == null) return null;
        if ("yes".equalsIgnoreCase(value) || "true".equalsIgnoreCase(value)) return true;
        if ("no".equalsIgnoreCase(value) || "false".equalsIgnoreCase(value)) return false;
        return null;
    }
    private static OffsetDateTime date(String value) {
        try { return OffsetDateTime.parse(value); }
        catch (DateTimeParseException error) { return null; }
    }
    private static boolean isHttps(String value) {
        try { return "https".equalsIgnoreCase(URI.create(value).getScheme()); }
        catch (RuntimeException error) { return false; }
    }

    private record SeriesAddress(String id, String slug) {}
    private record Cached(long createdAtNanos, String body) {}

    public static class ProviderException extends RuntimeException {
        ProviderException(String message) { super(message); }
        ProviderException(String message, Throwable cause) { super(message, cause); }
    }
    public static final class NotFoundException extends ProviderException {
        NotFoundException(String message) { super(message); }
    }
}
