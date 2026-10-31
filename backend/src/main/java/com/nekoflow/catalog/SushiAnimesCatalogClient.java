package com.nekoflow.catalog;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Cliente somente leitura do catálogo público autorizado do Sushi Animes. */
@Component
public class SushiAnimesCatalogClient {
    private static final Pattern WORK_PATH = Pattern.compile("^/anime/(.+)-(\\d+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern EPISODE_PATH = Pattern.compile(
            "^/anime/(.+)-(\\d+)-(\\d+)-season-([0-9]+(?:\\.[0-9]+)?)-episode$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INTEGER = Pattern.compile("(\\d{1,6})");
    private static final long MIN_REQUEST_INTERVAL_MILLIS = 350L;
    private static final int MAX_ATTEMPTS = 5;

    public record WorkRef(String id, String slug, String url) { }
    public record EpisodeRef(String workId, String workSlug, int season, String number, String url) { }
    public record Catalog(List<WorkRef> works, List<EpisodeRef> episodes) { }
    public record Health(String status, long latencyMs, int sitemapCount) { }
    public record EpisodeMetadata(String url, String title, String thumbnailUrl) { }
    public record WorkDetail(String id, String slug, String url, String title, String alternativeTitle,
                             String coverUrl, String synopsis, Integer year, Integer durationMinutes,
                             String audio, String status, String ageRating, List<String> genres,
                             List<EpisodeMetadata> episodes) { }

    private final HttpClient http;
    private final String origin;
    private final Duration timeout;
    private final boolean enabled;
    private final AtomicLong nextRequestAtNanos = new AtomicLong();
    private final Object pacingLock = new Object();

    @Autowired
    public SushiAnimesCatalogClient(
            @Value("${nekoflow.sushi-animes.origin:https://sushianimes.com.br}") String origin,
            @Value("${nekoflow.sushi-animes.request-timeout-seconds:25}") long timeoutSeconds,
            @Value("${nekoflow.sushi-animes.enabled:true}") boolean enabled) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(timeoutSeconds))
                .followRedirects(HttpClient.Redirect.NORMAL).build(), origin,
                Duration.ofSeconds(timeoutSeconds), enabled);
    }

    SushiAnimesCatalogClient(HttpClient http, String origin, Duration timeout, boolean enabled) {
        this.http = http;
        this.origin = origin.replaceAll("/+$", "");
        this.timeout = timeout;
        this.enabled = enabled;
    }

    public Catalog catalog() {
        requireEnabled();
        List<String> maps = sitemapLocations(get("/sitemap.index.xml", origin));
        Map<String, WorkRef> works = new LinkedHashMap<>();
        Map<String, EpisodeRef> episodes = new LinkedHashMap<>();
        for (String map : maps) {
            if (!map.startsWith(origin + "/sitemap.posts_")
                    && !map.startsWith(origin + "/sitemap.episodes_")) continue;
            for (String location : sitemapLocations(get(URI.create(map).getRawPath(), origin))) {
                WorkRef work = workAddress(location);
                if (work != null) works.putIfAbsent(work.id(), work);
                EpisodeRef episode = episodeAddress(location);
                if (episode != null) episodes.putIfAbsent(episode.url(), episode);
            }
        }
        for (EpisodeRef episode : episodes.values()) {
            works.putIfAbsent(episode.workId(), new WorkRef(episode.workId(), episode.workSlug(),
                    origin + "/anime/" + episode.workSlug() + "-" + episode.workId()));
        }
        if (works.isEmpty() || episodes.isEmpty())
            throw new ProviderException("Os sitemaps do Sushi Animes não retornaram um catálogo válido.");
        return new Catalog(List.copyOf(works.values()), List.copyOf(episodes.values()));
    }

    /** Verificação leve: valida somente o índice de sitemaps, sem percorrer o acervo inteiro. */
    public Health health() {
        requireEnabled();
        long started = System.nanoTime();
        List<String> maps = sitemapLocations(get("/sitemap.index.xml", origin));
        long relevant = maps.stream().filter(map -> map.startsWith(origin + "/sitemap.posts_")
                || map.startsWith(origin + "/sitemap.episodes_")).count();
        if (relevant < 1) throw new ProviderException("Sushi Animes não retornou sitemaps de catálogo.");
        return new Health("UP", Duration.ofNanos(System.nanoTime() - started).toMillis(), (int) relevant);
    }

    public WorkDetail work(WorkRef ref) {
        String html = get(URI.create(ref.url()).getRawPath(), origin + "/animes");
        return parseWork(html, ref, origin);
    }

    static List<String> sitemapLocations(String xml) {
        Document document = Jsoup.parse(xml, "", Parser.xmlParser());
        return document.select("loc").eachText().stream().map(String::strip)
                .filter(value -> value.startsWith("https://")).distinct().toList();
    }

    static WorkDetail parseWork(String html, WorkRef ref, String origin) {
        Document document = Jsoup.parse(html, origin);
        Element title = document.selectFirst("h1#title");
        if (title == null || title.text().isBlank())
            throw new NotFoundException("Ficha do anime não encontrada no Sushi Animes.");
        Element alternative = title.nextElementSibling();
        Element cover = document.selectFirst(".media-cover img[src]");
        Element synopsis = document.select(".detail-attr").stream()
                .filter(element -> {
                    Element label = element.selectFirst(".attr");
                    return label != null && label.text().strip().equalsIgnoreCase("Sinopse");
                }).findFirst().map(element -> element.selectFirst(".text-content")).orElse(null);
        Map<String, String> attributes = new LinkedHashMap<>();
        for (Element item : document.select(".featured-box .featured-attr")) {
            Element label = item.selectFirst(".attr");
            Element value = item.selectFirst(".text");
            if (label != null && value != null) attributes.put(label.text().strip(), value.text().strip());
        }
        List<EpisodeMetadata> episodes = new ArrayList<>();
        for (Element card : document.select("a.epx-card[href$=-episode]")) {
            Element description = card.selectFirst(".epx-desc");
            Element thumb = card.selectFirst(".epx-thumb[data-src]");
            episodes.add(new EpisodeMetadata(card.absUrl("href"),
                    description == null ? null : blankToNull(description.text()),
                    thumb == null ? null : thumb.absUrl("data-src")));
        }
        Element status = document.selectFirst(".anime_status span");
        Element rating = document.selectFirst("#certification-anime");
        return new WorkDetail(ref.id(), ref.slug(), ref.url(), title.text().strip(),
                alternative == null || !"h2".equals(alternative.tagName()) ? null : blankToNull(alternative.text()),
                cover == null ? null : cover.absUrl("src"), synopsis == null ? null : blankToNull(synopsis.text()),
                integer(attributes.get("Data de lançamento")), integer(attributes.get("Duração")),
                attributes.get("Áudio"), status == null ? null : blankToNull(status.text()),
                rating == null ? null : blankToNull(rating.text()),
                List.copyOf(document.select("[itemprop=genre]").eachText().stream()
                        .map(String::strip).filter(value -> !value.isBlank()).distinct().toList()),
                List.copyOf(episodes));
    }

    static WorkRef workAddress(String value) {
        try {
            URI uri = URI.create(value);
            Matcher matcher = WORK_PATH.matcher(uri.getPath());
            return matcher.matches() ? new WorkRef(matcher.group(2), matcher.group(1), value) : null;
        } catch (RuntimeException ignored) { return null; }
    }

    static EpisodeRef episodeAddress(String value) {
        try {
            URI uri = URI.create(value);
            Matcher matcher = EPISODE_PATH.matcher(uri.getPath());
            if (!matcher.matches()) return null;
            return new EpisodeRef(matcher.group(2), matcher.group(1), Integer.parseInt(matcher.group(3)),
                    matcher.group(4), value);
        } catch (RuntimeException ignored) { return null; }
    }

    private String get(String path, String referer) {
        requireEnabled();
        URI url = URI.create(origin + path);
        try {
            for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                awaitRequestSlot();
                HttpRequest request = HttpRequest.newBuilder(url).timeout(timeout)
                        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                        .header("Accept-Language", "pt-BR,pt;q=0.9")
                        .header("User-Agent", "Mozilla/5.0 (compatible; NekoFlow-SushiAnimes-Authorized/1.0)")
                        .header("Referer", referer).GET().build();
                HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
                if (response.statusCode() == 429 || response.statusCode() >= 500) {
                    TimeUnit.SECONDS.sleep(Math.min(30, 2L << attempt));
                    continue;
                }
                if (response.statusCode() == 404) throw new NotFoundException("Recurso não encontrado no Sushi Animes.");
                if (response.statusCode() != 200)
                    throw new ProviderException("Sushi Animes respondeu HTTP " + response.statusCode() + ".");
                return new String(response.body(), StandardCharsets.UTF_8);
            }
            throw new ProviderException("Sushi Animes permaneceu indisponível após novas tentativas.");
        } catch (ProviderException error) {
            throw error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ProviderException("Coleta Sushi Animes interrompida.", error);
        } catch (Exception error) {
            throw new ProviderException("Não foi possível consultar o catálogo do Sushi Animes.", error);
        }
    }

    private void awaitRequestSlot() throws InterruptedException {
        synchronized (pacingLock) {
            long now = System.nanoTime();
            long scheduled = Math.max(now, nextRequestAtNanos.get());
            long wait = scheduled - now;
            if (wait > 0) TimeUnit.NANOSECONDS.sleep(wait);
            nextRequestAtNanos.set(System.nanoTime()
                    + TimeUnit.MILLISECONDS.toNanos(MIN_REQUEST_INTERVAL_MILLIS));
        }
    }

    private void requireEnabled() {
        if (!enabled) throw new ProviderException("Integração Sushi Animes está desabilitada.");
    }

    private static Integer integer(String value) {
        Matcher matcher = INTEGER.matcher(value == null ? "" : value);
        return matcher.find() ? Integer.valueOf(matcher.group(1)) : null;
    }
    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.strip(); }

    public static class ProviderException extends RuntimeException {
        public ProviderException(String message) { super(message); }
        public ProviderException(String message, Throwable cause) { super(message, cause); }
    }
    public static final class NotFoundException extends ProviderException {
        public NotFoundException(String message) { super(message); }
    }
}
