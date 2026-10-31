package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * API normalizada, somente leitura, para três catálogos de leitura independentes.
 * Nenhuma rota aceita uma URL arbitrária: origem, caminhos e hosts são fixados por provedor.
 */
@Component
public class UnofficialReadingApiClient {
    public static final String TIA = "tiamanhwa-ptbr";
    public static final String COMIX = "comix-en";
    public static final String BUDDY = "manhwabuddy-en";
    private static final Set<String> PROVIDERS = Set.of(TIA, COMIX, BUDDY);
    private static final Pattern SAFE_ID = Pattern.compile("[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}");
    private static final Pattern NUMBER = Pattern.compile("(?i)(?:cap[ií]tulo|chapter|ch\\.)\\s*([0-9]+(?:\\.[0-9]+)?)");
    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

    public record Profile(String code, String name, String language, String integration,
                          boolean adultCatalog, String origin) {}
    public record Health(String status, long latencyMs, String language, int sampleSize,
                         String checkedResource) {}
    public record SeriesSummary(String id, String title, String url, String coverUrl, String type,
                                String status, Boolean adult, String language) {}
    public record SeriesPage(List<SeriesSummary> items, int page, int size, boolean hasMore) {}
    public record SeriesDetail(String id, String title, List<String> alternativeTitles, String synopsis,
                               String coverUrl, String type, String status, Boolean adult, String language,
                               List<String> genres, String url, Integer chapterCount) {}
    public record ChapterSummary(String id, String number, String title, String url, String publishedLabel) {}
    public record ChapterList(String seriesId, List<ChapterSummary> items, int totalElements) {}
    public record ReaderPage(int index, String imageUrl, String alt) {}
    public record ReaderChapter(String seriesId, String chapterId, String title, String number,
                                String url, List<ReaderPage> pages, boolean externalOnly) {}
    public record ArchiveEntry(String id, String title, List<String> alternativeTitles, String synopsis,
                               String coverUrl, String type, String status, Boolean adult, String language,
                               List<String> genres, String url, Integer chapterCount, Integer year) {}
    public record ArchivePage(List<ArchiveEntry> items, int page, int lastPage, long totalElements) {}
    private record BuddyArchive(List<ArchiveEntry> works, Map<String, List<ChapterSummary>> chapters) {}

    private final ObjectMapper mapper;
    private final HttpClient http;
    private final Duration timeout;
    private final Duration cacheTtl;
    private final Map<String, Profile> profiles;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();
    private final URI tiaFetcher;
    private final String tiaFetcherSecret;
    private final URI comixFetcher;
    private final String comixFetcherSecret;
    private volatile BuddyArchive buddyArchive;

    public UnofficialReadingApiClient(ObjectMapper mapper,
            @Value("${nekoflow.reading-providers.request-timeout-seconds:20}") long timeoutSeconds,
            @Value("${nekoflow.reading-providers.cache-ttl-seconds:120}") long cacheTtlSeconds,
            @Value("${nekoflow.reading-providers.tiamanhwa-origin:https://tiamanhwa.com}") String tiaOrigin,
            @Value("${nekoflow.reading-providers.comix-origin:https://comix.to}") String comixOrigin,
            @Value("${nekoflow.reading-providers.manhwabuddy-origin:https://manhwabuddy.com}") String buddyOrigin,
            @Value("${nekoflow.reading-providers.tiamanhwa-fetcher-url:}") String tiaFetcherUrl,
            @Value("${nekoflow.reading-providers.tiamanhwa-fetcher-secret:}") String tiaFetcherSecret,
            @Value("${nekoflow.reading-providers.comix-fetcher-url:}") String comixFetcherUrl,
            @Value("${nekoflow.reading-providers.comix-fetcher-secret:}") String comixFetcherSecret) {
        this.mapper = mapper;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.cacheTtl = Duration.ofSeconds(cacheTtlSeconds);
        this.http = HttpClient.newBuilder().connectTimeout(timeout).followRedirects(HttpClient.Redirect.NORMAL).build();
        this.profiles = Map.of(
                TIA, new Profile(TIA, "TiaManhwa", "pt-BR", "AUTHORIZED_UNOFFICIAL", true, trim(tiaOrigin)),
                COMIX, new Profile(COMIX, "Comix", "en", "UNOFFICIAL", false, trim(comixOrigin)),
                BUDDY, new Profile(BUDDY, "ManhwaBuddy", "en", "AUTHORIZED_UNOFFICIAL", false, trim(buddyOrigin)));
        this.tiaFetcher = tiaFetcherUrl == null || tiaFetcherUrl.isBlank() ? null : URI.create(trim(tiaFetcherUrl));
        this.tiaFetcherSecret = tiaFetcherSecret == null ? "" : tiaFetcherSecret;
        this.comixFetcher = comixFetcherUrl == null || comixFetcherUrl.isBlank() ? null : URI.create(trim(comixFetcherUrl));
        this.comixFetcherSecret = comixFetcherSecret == null ? "" : comixFetcherSecret;
    }

    /** Página autoritativa usada pelos importadores de acervo; não aplica paginação duas vezes. */
    public ArchivePage archivePage(String provider, int page, int size) {
        if (page < 1 || size < 1 || size > 100) throw new IllegalArgumentException("Paginação inválida.");
        Profile profile = profile(provider);
        if (provider.equals(COMIX)) return comixArchivePage(page, size);
        if (provider.equals(BUDDY)) return buddyArchivePage(page, size);
        String path = page == 1 ? "/" : "/page/" + page + "/";
        String html = get(profile, path, profile.origin(), false);
        Document doc = Jsoup.parse(html, profile.origin());
        List<ArchiveEntry> entries = htmlCatalog(profile, html, "", 1, 100).items().stream()
                .map(item -> new ArchiveEntry(item.id(), item.title(), List.of(), null, item.coverUrl(),
                        item.type(), item.status(), item.adult(), item.language(), List.of(), item.url(), null, null))
                .toList();
        boolean next = doc.selectFirst("a.next, a[rel=next], .next.page-numbers, .pagination a.next") != null;
        return new ArchivePage(entries, page, next ? page + 1 : page, -1);
    }

    public List<Profile> profiles() { return List.of(profile(TIA), profile(COMIX), profile(BUDDY)); }

    /** Capítulos descobertos no sitemap integral, sem reconsultar a ficha de cada obra. */
    public List<ChapterSummary> archiveChapters(String provider, String seriesId) {
        requireId(seriesId);
        if (!BUDDY.equals(provider)) return chapters(provider, seriesId).items();
        return loadBuddyArchive().chapters().getOrDefault(seriesId, List.of());
    }

    public Profile profile(String provider) {
        Profile value = profiles.get(provider);
        if (value == null) throw new IllegalArgumentException("Provedor de leitura inválido.");
        return value;
    }

    public Health health(String provider) {
        Profile profile = profile(provider);
        long started = System.nanoTime();
        String html = get(profile, "/", profile.origin(), false);
        int sample = provider.equals(COMIX) ? comixCatalog(html, "", 1, 24).items().size()
                : htmlCatalog(profile, html, "", 1, 24).items().size();
        if (sample < 1) throw new ProviderException(profile.name() + " não retornou obras no catálogo público.");
        return new Health("UP", Duration.ofNanos(System.nanoTime() - started).toMillis(),
                profile.language(), sample, profile.origin());
    }

    public SeriesPage catalog(String provider, int page, int size, String search) {
        Profile profile = profile(provider);
        String query = search == null ? "" : search.strip();
        if (provider.equals(COMIX)) {
            return comixCatalog(get(profile, "/", profile.origin(), true), query, page, size);
        }
        String path = query.isBlank() ? (page <= 1 ? "/" : "/page/" + page + "/")
                : "/?s=" + encode(query) + "&post_type=wp-manga";
        return htmlCatalog(profile, get(profile, path, profile.origin(), true), query, page, size);
    }

    public SeriesDetail series(String provider, String id) {
        requireId(id);
        Profile profile = profile(provider);
        String path = provider.equals(COMIX) ? "/title/" + id : "/manhwa/" + id + "/";
        String html = get(profile, path, profile.origin(), true);
        return provider.equals(COMIX) ? comixDetail(html, id, profile) : htmlDetail(html, id, profile);
    }

    public ChapterList chapters(String provider, String seriesId) {
        SeriesDetail detail = series(provider, seriesId);
        Profile profile = profile(provider);
        if (provider.equals(COMIX)) return comixChapters(detail, get(profile, "/title/" + seriesId, detail.url(), true));
        Document doc = Jsoup.parse(get(profile, "/manhwa/" + seriesId + "/", detail.url(), true), profile.origin());
        Map<String, ChapterSummary> unique = new LinkedHashMap<>();
        String prefix = "/manhwa/" + seriesId + "/";
        for (Element link : doc.select("a[href]")) {
            URI address = uri(link.absUrl("href"));
            if (address == null || address.getPath() == null || !address.getPath().startsWith(prefix)) continue;
            String tail = address.getPath().substring(prefix.length()).replaceAll("/+$", "");
            if (tail.isBlank() || !tail.toLowerCase(Locale.ROOT).matches(".*(?:chapter|capitulo|capítulo).*")) continue;
            String title = link.text().replaceAll("\\s+", " ").strip();
            if (title.isBlank()) title = tail.replace('-', ' ');
            Matcher number = NUMBER.matcher(title);
            String value = number.find() ? number.group(1) : tail.replaceFirst("(?i)^(?:chapter|capitulo|capítulo)-?", "");
            String date = text(link, ".chapter-release-date, .ct-update, .post-on, i");
            unique.putIfAbsent(tail, new ChapterSummary(tail, value, title, link.absUrl("href"), date));
        }
        return new ChapterList(seriesId, List.copyOf(unique.values()), unique.size());
    }

    public ReaderChapter reader(String provider, String seriesId, String chapterId) {
        requireId(seriesId);
        requireId(chapterId);
        Profile profile = profile(provider);
        String path = provider.equals(COMIX) ? "/title/" + seriesId + "/" + chapterId
                : "/manhwa/" + seriesId + "/" + chapterId + "/";
        String url = profile.origin() + path;
        Document doc = Jsoup.parse(get(profile, path, profile.origin() + "/", true), profile.origin());
        String title = meta(doc, "meta[property=og:title]", "content");
        if (title == null) title = doc.title();
        Matcher number = NUMBER.matcher(title == null ? chapterId : title);
        String chapterNumber = number.find() ? number.group(1) : chapterId;
        List<ReaderPage> pages = new ArrayList<>();
        if (!provider.equals(COMIX)) {
            int index = 1;
            for (Element image : doc.select(".reading-content img, .page-break img, .chapter-content img, img.wp-manga-chapter-img")) {
                String source = image.hasAttr("data-src") ? image.attr("data-src") : image.attr("src");
                source = absolute(profile.origin(), source);
                if (!source.startsWith("https://") || source.matches("(?i).*(?:logo|avatar|emoji|blank|lazy)\\.(?:png|gif|jpg|webp).*$")) continue;
                pages.add(new ReaderPage(index++, source, image.attr("alt")));
            }
        }
        return new ReaderChapter(seriesId, chapterId, title, chapterNumber, url, List.copyOf(pages), pages.isEmpty());
    }

    private SeriesPage htmlCatalog(Profile profile, String html, String search, int page, int size) {
        Document doc = Jsoup.parse(html, profile.origin());
        Map<String, SeriesSummary> unique = new LinkedHashMap<>();
        for (Element link : doc.select("a[href*=/manhwa/]")) {
            String id = seriesId(link.absUrl("href"), "/manhwa/");
            if (id == null || unique.containsKey(id)) continue;
            Element card = closest(link, "article, .slider__item, .page-item-detail, .page-listing-item, .row.c-tabs-item__content, .item-summary, .item");
            Element image = card == null ? link.selectFirst("img") : card.selectFirst("img");
            Element titleLink = card == null ? null : card.selectFirst(".post-title a[href*=/manhwa/], h3 a[href*=/manhwa/], h4 a[href*=/manhwa/], .manga-title a[href*=/manhwa/]");
            String title = title(titleLink == null ? link : titleLink, image);
            if (title.isBlank() || (!search.isBlank() && !title.toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT)))) continue;
            String cover = image == null ? null : image.hasAttr("data-src") ? image.absUrl("data-src") : image.absUrl("src");
            unique.put(id, new SeriesSummary(id, title, profile.origin() + "/manhwa/" + id + "/", cover,
                    profile.code().equals(TIA) ? "manhwa" : null, null, profile.adultCatalog(), profile.language()));
        }
        List<SeriesSummary> all = new ArrayList<>(unique.values());
        int from = Math.min((page - 1) * size, all.size());
        int to = Math.min(from + size, all.size());
        return new SeriesPage(List.copyOf(all.subList(from, to)), page, size, to < all.size());
    }

    private SeriesPage comixCatalog(String html, String search, int page, int size) {
        JsonNode root = initialData(html).path("queries");
        Map<String, SeriesSummary> unique = new LinkedHashMap<>();
        collectComix(root, unique, search.toLowerCase(Locale.ROOT));
        List<SeriesSummary> all = new ArrayList<>(unique.values());
        int from = Math.min((page - 1) * size, all.size());
        int to = Math.min(from + size, all.size());
        return new SeriesPage(List.copyOf(all.subList(from, to)), page, size, to < all.size());
    }

    private void collectComix(JsonNode node, Map<String, SeriesSummary> unique, String search) {
        if (node == null || node.isNull()) return;
        if (node.isObject()) {
            String hid = node.path("hid").asText("");
            String title = node.path("title").asText("");
            String url = node.path("url").asText("");
            if (!hid.isBlank() && !title.isBlank() && url.startsWith("/title/")
                    && (search.isBlank() || title.toLowerCase(Locale.ROOT).contains(search))) {
                String slug = url.substring("/title/".length()).replaceAll("/+$", "");
                String cover = node.path("poster").path("large").asText(null);
                String rating = node.path("contentRating").asText("");
                unique.putIfAbsent(slug, new SeriesSummary(slug, title, profile(COMIX).origin() + url, cover,
                        node.path("type").asText(null), node.path("status").asText(null),
                        rating.isBlank() ? null : !"safe".equalsIgnoreCase(rating), "en"));
            }
            node.fields().forEachRemaining(entry -> collectComix(entry.getValue(), unique, search));
        } else if (node.isArray()) node.forEach(value -> collectComix(value, unique, search));
    }

    private SeriesDetail htmlDetail(String html, String id, Profile profile) {
        Document doc = Jsoup.parse(html, profile.origin());
        String title = first(doc, "h1, .post-title h1, .manga-title, .info-title");
        if (title == null) title = meta(doc, "meta[property=og:title]", "content");
        if (title == null || title.isBlank()) throw new NotFoundException("Obra não encontrada em " + profile.name() + ".");
        String synopsis = first(doc, ".summary__content, .description-summary, .summary, [itemprop=description]");
        String cover = meta(doc, "meta[property=og:image]", "content");
        List<String> genres = doc.select(".genres-content a, .manga-genres a, a[href*=genre]").eachText().stream()
                .map(String::strip).filter(value -> !value.isBlank()).distinct().toList();
        boolean adult = profile.adultCatalog() || doc.text().matches("(?is).*(?:over 18|18\\+|adult|hentai|smut|pornhwa).*" );
        int chapterCount = 0;
        for (Element link : doc.select("a[href*=/manhwa/" + id + "/]")) {
            if (link.absUrl("href").matches("(?i).*(?:chapter|capitulo|capítulo).*")) chapterCount++;
        }
        return new SeriesDetail(id, title, List.of(), synopsis, cover,
                profile.code().equals(TIA) ? "manhwa" : null, null, adult, profile.language(), genres,
                profile.origin() + "/manhwa/" + id + "/", chapterCount);
    }

    private SeriesDetail comixDetail(String html, String id, Profile profile) {
        JsonNode queries = initialData(html).path("queries");
        JsonNode detail = null;
        var fields = queries.fields();
        while (fields.hasNext()) {
            var entry = fields.next();
            if (entry.getKey().contains("\\\"manga\\\",\\\"detail\\\"") || entry.getKey().contains("manga\",\"detail")) {
                detail = entry.getValue();
                break;
            }
        }
        if (detail == null || detail.isMissingNode()) throw new NotFoundException("Obra não encontrada no Comix.");
        List<String> alternatives = new ArrayList<>();
        detail.path("altTitles").forEach(value -> alternatives.add(value.asText()));
        List<String> genres = new ArrayList<>();
        detail.path("genres").forEach(value -> genres.add(value.path("title").asText()));
        String rating = detail.path("contentRating").asText("");
        return new SeriesDetail(id, detail.path("title").asText(), List.copyOf(alternatives),
                detail.path("synopsis").asText(null), detail.path("poster").path("large").asText(null),
                detail.path("type").asText(null), detail.path("status").asText(null),
                rating.isBlank() ? null : !"safe".equalsIgnoreCase(rating), profile.language(), List.copyOf(genres),
                profile.origin() + detail.path("url").asText("/title/" + id),
                detail.path("latestChapter").isNumber() ? detail.path("latestChapter").asInt() : null);
    }

    private ChapterList comixChapters(SeriesDetail detail, String html) {
        JsonNode queries = initialData(html).path("queries");
        JsonNode source = null;
        var fields = queries.fields();
        while (fields.hasNext()) {
            var entry = fields.next();
            if (entry.getKey().contains("manga\",\"detail")) { source = entry.getValue(); break; }
        }
        Map<String, ChapterSummary> chapters = new LinkedHashMap<>();
        if (source != null) {
            addComixChapter(chapters, source.path("firstChapterUrl").asText(""), "1", "Chapter 1", detail.url());
            String latest = source.path("latestChapter").asText("");
            addComixChapter(chapters, source.path("latestChapterUrl").asText(""), latest,
                    latest.isBlank() ? "Latest chapter" : "Chapter " + latest, detail.url());
        }
        return new ChapterList(detail.id(), List.copyOf(chapters.values()),
                detail.chapterCount() == null ? chapters.size() : detail.chapterCount());
    }

    private ArchivePage comixArchivePage(int page, int size) {
        if (comixFetcher == null) throw new ProviderException("Resolvedor de catálogo do Comix não configurado.");
        URI endpoint = URI.create(trim(comixFetcher.toString()) + "/catalog?page=" + page + "&limit=" + size);
        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(timeout.plusSeconds(30))
                    .header("Accept", "application/json")
                    .header("X-Nekoflow-Internal", comixFetcherSecret).GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new ProviderException(
                    "Resolvedor de catálogo do Comix respondeu HTTP " + response.statusCode() + ".");
            JsonNode result = mapper.readTree(response.body()).path("result");
            List<ArchiveEntry> items = new ArrayList<>();
            for (JsonNode node : result.path("items")) {
                String path = node.path("url").asText("");
                if (!path.startsWith("/title/")) continue;
                String id = path.substring("/title/".length()).replaceAll("/+$", "");
                if (!SAFE_ID.matcher(id).matches()) continue;
                List<String> alternatives = new ArrayList<>();
                node.path("altTitles").forEach(value -> alternatives.add(value.asText()));
                String rating = node.path("contentRating").asText("");
                Boolean adult = rating.isBlank() ? null
                        : Set.of("erotica", "pornographic", "adult").contains(rating.toLowerCase(Locale.ROOT));
                items.add(new ArchiveEntry(id, node.path("title").asText(id), List.copyOf(alternatives),
                        node.path("synopsis").asText(null), node.path("poster").path("large").asText(null),
                        node.path("type").asText(null), node.path("status").asText(null), adult, "en", List.of(),
                        profile(COMIX).origin() + path, node.path("latestChapter").isNumber()
                        ? node.path("latestChapter").asInt() : null,
                        node.path("year").isNumber() ? node.path("year").asInt() : null));
            }
            JsonNode meta = result.path("meta");
            return new ArchivePage(List.copyOf(items), meta.path("page").asInt(page),
                    meta.path("lastPage").asInt(page), meta.path("total").asLong(items.size()));
        } catch (ProviderException error) { throw error; }
        catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ProviderException("Consulta ao catálogo Comix interrompida.", error);
        } catch (Exception error) {
            throw new ProviderException("Não foi possível consultar o catálogo completo do Comix.", error);
        }
    }

    private ArchivePage buddyArchivePage(int page, int size) {
        BuddyArchive archive = loadBuddyArchive();
        int from = Math.min((page - 1) * size, archive.works().size());
        int to = Math.min(from + size, archive.works().size());
        int lastPage = Math.max(1, (archive.works().size() + size - 1) / size);
        return new ArchivePage(List.copyOf(archive.works().subList(from, to)), page, lastPage, archive.works().size());
    }

    private BuddyArchive loadBuddyArchive() {
        BuddyArchive value = buddyArchive;
        if (value != null) return value;
        synchronized (this) {
            if (buddyArchive != null) return buddyArchive;
            Profile profile = profile(BUDDY);
            Document index = Jsoup.parse(get(profile, "/sitemap.xml", profile.origin(), false));
            List<String> maps = index.select("loc").eachText().stream()
                    .filter(url -> url.startsWith(profile.origin() + "/") && url.endsWith(".xml.gz"))
                    .toList();
            if (maps.isEmpty()) throw new ProviderException("ManhwaBuddy não publicou os sitemaps esperados.");
            Map<String, ArchiveEntry> works = new LinkedHashMap<>();
            Map<String, Map<String, ChapterSummary>> chapters = new LinkedHashMap<>();
            Pattern location = Pattern.compile("<loc>([^<]+)</loc>");
            for (String map : maps) {
                HttpRequest request = HttpRequest.newBuilder(URI.create(map)).timeout(timeout.plusSeconds(90))
                        .header("User-Agent", USER_AGENT).header("Accept", "application/gzip, application/xml")
                        .header("Referer", profile.origin() + "/").GET().build();
                try {
                    HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
                    if (response.statusCode() != 200) throw new ProviderException(
                            "Sitemap do ManhwaBuddy respondeu HTTP " + response.statusCode() + ".");
                    try (InputStream compressed = response.body();
                         GZIPInputStream gzip = new GZIPInputStream(compressed);
                         BufferedReader reader = new BufferedReader(new InputStreamReader(gzip, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            Matcher match = location.matcher(line);
                            if (!match.find()) continue;
                            URI address = uri(match.group(1));
                            if (address == null || address.getPath() == null) continue;
                            Matcher path = Pattern.compile("^/manhwa/([^/]+)(?:/([^/]+))?/?$")
                                    .matcher(address.getPath());
                            if (!path.matches()) continue;
                            String seriesId = path.group(1);
                            String chapterId = path.group(2);
                            works.putIfAbsent(seriesId, new ArchiveEntry(seriesId, titleFromSlug(seriesId), List.of(),
                                    null, null, null, null, null, "en", List.of(),
                                    profile.origin() + "/manhwa/" + seriesId + "/", null, null));
                            if (chapterId != null) {
                                String title = chapterId.replace('-', ' ');
                                Matcher number = NUMBER.matcher(title);
                                String chapterNumber = number.find() ? number.group(1) : chapterId;
                                chapters.computeIfAbsent(seriesId, ignored -> new LinkedHashMap<>())
                                        .putIfAbsent(chapterId, new ChapterSummary(chapterId, chapterNumber, title,
                                                profile.origin() + "/manhwa/" + seriesId + "/" + chapterId + "/", null));
                            }
                        }
                    }
                } catch (ProviderException error) { throw error; }
                catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new ProviderException("Leitura dos sitemaps do ManhwaBuddy interrompida.", error);
                } catch (Exception error) {
                    throw new ProviderException("Não foi possível ler o catálogo integral do ManhwaBuddy.", error);
                }
            }
            Map<String, List<ChapterSummary>> chapterLists = new LinkedHashMap<>();
            chapters.forEach((id, items) -> chapterLists.put(id, List.copyOf(items.values())));
            buddyArchive = new BuddyArchive(List.copyOf(works.values()), Map.copyOf(chapterLists));
            return buddyArchive;
        }
    }

    private static String titleFromSlug(String slug) {
        String[] words = slug.replace('-', ' ').split("\\s+");
        StringBuilder title = new StringBuilder();
        for (String word : words) {
            if (word.isBlank()) continue;
            if (!title.isEmpty()) title.append(' ');
            title.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return title.toString();
    }

    private void addComixChapter(Map<String, ChapterSummary> out, String path, String number, String title, String fallback) {
        if (path == null || path.isBlank()) return;
        String id = path.substring(path.lastIndexOf('/') + 1);
        out.putIfAbsent(id, new ChapterSummary(id, number, title, profile(COMIX).origin() + path, null));
    }

    private JsonNode initialData(String html) {
        Document doc = Jsoup.parse(html);
        Element data = doc.selectFirst("script#initial-data[type=application/json]");
        if (data == null) throw new ProviderException("Comix não retornou o estado público esperado.");
        try { return mapper.readTree(data.data()); }
        catch (Exception error) { throw new ProviderException("Estado público do Comix é inválido.", error); }
    }

    private String get(Profile profile, String path, String referer, boolean cached) {
        URI uri = URI.create(profile.origin() + (path.startsWith("/") ? path : "/" + path));
        if (!uri.getHost().equalsIgnoreCase(URI.create(profile.origin()).getHost()))
            throw new IllegalArgumentException("Host do provedor inválido.");
        String key = profile.code() + ":" + uri;
        Cached value = cache.get(key);
        if (cached && value != null && value.createdAt() + cacheTtl.toMillis() > System.currentTimeMillis()) return value.body();
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(timeout)
                    .header("Accept", "text/html,application/xhtml+xml,application/json;q=0.9")
                    .header("Accept-Language", profile.language() + ",en;q=0.8")
                    .header("User-Agent", USER_AGENT).header("Referer", referer);
            if (profile.code().equals(TIA)) builder.header("Cookie", "tia_idade_confirmada=1");
            HttpRequest request = builder.GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) throw new NotFoundException("Recurso não encontrado em " + profile.name() + ".");
            if (profile.code().equals(TIA) && tiaFetcher != null
                    && (response.statusCode() == 403 || response.statusCode() == 429)) {
                String body = fetchTiaWithBrowserTls(uri);
                if (cached) cache.put(key, new Cached(body, System.currentTimeMillis()));
                return body;
            }
            if (response.statusCode() != 200) throw new ProviderException(profile.name() + " respondeu HTTP " + response.statusCode() + ".");
            if (cached) {
                if (cache.size() > 400) cache.clear();
                cache.put(key, new Cached(response.body(), System.currentTimeMillis()));
            }
            return response.body();
        } catch (NotFoundException | ProviderException error) { throw error; }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new ProviderException("Consulta interrompida.", error); }
        catch (Exception error) { throw new ProviderException("Não foi possível acessar " + profile.name() + ".", error); }
    }

    private String fetchTiaWithBrowserTls(URI publicUri) throws Exception {
        URI origin = URI.create(profile(TIA).origin());
        if (!origin.getHost().equalsIgnoreCase(publicUri.getHost()))
            throw new IllegalArgumentException("Host TiaManhwa inválido.");
        String relative = publicUri.getRawPath() + (publicUri.getRawQuery() == null ? "" : "?" + publicUri.getRawQuery());
        URI endpoint = URI.create(trim(tiaFetcher.toString()) + "/fetch?path=" + encode(relative));
        HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(timeout.plusSeconds(10))
                .header("Accept", "text/html,application/xhtml+xml")
                .header("X-Nekoflow-Internal", tiaFetcherSecret).GET().build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new ProviderException("Resolvedor autorizado do TiaManhwa respondeu HTTP "
                + response.statusCode() + ".");
        return response.body();
    }

    private static String title(Element link, Element image) {
        String value = link.attr("title").strip();
        if (value.isBlank()) value = link.text().replaceAll("\\s+", " ").strip();
        if (value.isBlank() && image != null) value = image.attr("alt").strip();
        return value;
    }
    private static String seriesId(String url, String marker) {
        URI uri = uri(url);
        if (uri == null || uri.getPath() == null) return null;
        int start = uri.getPath().indexOf(marker);
        if (start < 0) return null;
        String tail = uri.getPath().substring(start + marker.length()).replaceAll("^/+|/+$", "");
        if (tail.contains("/") || !SAFE_ID.matcher(tail).matches()) return null;
        return tail;
    }
    private static Element closest(Element element, String selectors) {
        for (String selector : selectors.split(",")) {
            Element found = element.closest(selector.strip());
            if (found != null) return found;
        }
        return element.parent();
    }
    private static String first(Document doc, String selectors) {
        Element value = doc.selectFirst(selectors);
        return value == null || value.text().isBlank() ? null : value.text().replaceAll("\\s+", " ").strip();
    }
    private static String text(Element root, String selectors) {
        Element value = root.selectFirst(selectors);
        return value == null ? null : value.text().replaceAll("\\s+", " ").strip();
    }
    private static String meta(Document doc, String selector, String attribute) {
        Element value = doc.selectFirst(selector);
        return value == null || value.attr(attribute).isBlank() ? null : value.attr(attribute).strip();
    }
    private static String absolute(String origin, String value) {
        if (value == null) return "";
        value = value.strip();
        if (value.isBlank() || value.startsWith("data:")) return "";
        if (value.startsWith("//")) return "https:" + value;
        if (value.startsWith("http://") || value.startsWith("https://")) return value;
        return origin + (value.startsWith("/") ? value : "/" + value);
    }
    private static URI uri(String value) { try { return URI.create(value); } catch (RuntimeException error) { return null; } }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static String trim(String value) { return value.replaceAll("/+$", ""); }
    private static void requireId(String value) {
        if (value == null || !SAFE_ID.matcher(value).matches()) throw new IllegalArgumentException("Identificador inválido.");
    }
    private record Cached(String body, long createdAt) {}
    public static class ProviderException extends RuntimeException {
        public ProviderException(String message) { super(message); }
        public ProviderException(String message, Throwable cause) { super(message, cause); }
    }
    public static class NotFoundException extends RuntimeException { public NotFoundException(String message) { super(message); } }
}
