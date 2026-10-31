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
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Cliente dos endpoints públicos usados pelo próprio site HiAnime. */
@Component
public class HiAnimeApiClient {
    private static final Pattern NUMERIC_ID = Pattern.compile("-(\\d+)$");
    public record RecentAnime(String id, String title) {}
    public record Episode(String id, double number, String title, boolean sub, boolean dub) {}
    public record Player(String type, String server, String iframe) {}

    private final ObjectMapper mapper;
    private final HttpClient http;
    private final String origin;
    private final Duration timeout;

    public HiAnimeApiClient(ObjectMapper mapper,
                            @Value("${nekoflow.hianime.origin:https://hianime.at}") String origin,
                            @Value("${nekoflow.hianime.request-timeout-seconds:20}") long timeoutSeconds) {
        this.mapper = mapper;
        this.origin = origin.replaceAll("/+$", "");
        this.timeout = Duration.ofSeconds(timeoutSeconds);
        this.http = HttpClient.newBuilder().connectTimeout(this.timeout).build();
    }

    public List<RecentAnime> recentlyUpdated(int page) throws Exception {
        return parseRecent(getText("/recently-updated?page=" + page, origin + "/recently-updated"));
    }

    public List<Episode> episodes(String animeId) throws Exception {
        Matcher id = NUMERIC_ID.matcher(animeId);
        if (!id.find()) throw new IllegalArgumentException("ID HiAnime inválido: " + animeId);
        JsonNode body = getJson("/api/theme/episode/list/" + id.group(1), origin + "/" + animeId);
        return parseEpisodes(body.path("html").asText(""));
    }

    public List<Player> players(String episodeId) throws Exception {
        JsonNode body = getJson("/api/theme/episode/servers?episodeId=" + segment(episodeId), origin);
        return parsePlayers(body.path("html").asText(""));
    }

    public long health() throws Exception {
        long started = System.nanoTime();
        String html = getText("/recently-updated", origin);
        if (parseRecent(html).isEmpty()) throw new IllegalStateException("HiAnime não retornou obras recentes");
        return Duration.ofNanos(System.nanoTime() - started).toMillis();
    }

    private JsonNode getJson(String path, String referer) throws Exception {
        return mapper.readTree(getText(path, referer));
    }

    private String getText(String path, String referer) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(origin + path))
                .timeout(timeout).header("Accept", "text/html,application/json")
                .header("User-Agent", "Mozilla/5.0 (compatible; NekoFlow-Catalog-Sync/1.0)")
                .header("Referer", referer).header("X-Requested-With", "XMLHttpRequest").GET().build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("HiAnime respondeu HTTP " + response.statusCode());
        return response.body();
    }

    static List<RecentAnime> parseRecent(String html) {
        Document document = Jsoup.parse(html);
        Map<String, RecentAnime> unique = new LinkedHashMap<>();
        for (Element link : document.select("a.dynamic-name[href][title]")) {
            String href = link.absUrl("href");
            if (href.isBlank()) href = link.attr("href");
            String path;
            try { path = URI.create(href).getPath(); } catch (RuntimeException e) { continue; }
            if (path == null) continue;
            String id = path.replaceFirst("^/", "");
            if (id.startsWith("watch/")) id = id.substring(6);
            if (!NUMERIC_ID.matcher(id).find()) continue;
            unique.putIfAbsent(id, new RecentAnime(id, link.attr("title")));
        }
        return new ArrayList<>(unique.values());
    }

    static List<Episode> parseEpisodes(String html) {
        Document document = Jsoup.parseBodyFragment(html);
        List<Episode> result = new ArrayList<>();
        for (Element link : document.select("a.ep-item[data-number][data-id]")) {
            double number;
            try { number = Double.parseDouble(link.attr("data-number")); } catch (NumberFormatException e) { continue; }
            Element name = link.selectFirst(".ep-name");
            String title = name == null ? "Episode " + display(number) : name.attr("title");
            result.add(new Episode(link.attr("data-id"), number,
                    title.isBlank() ? "Episode " + display(number) : title, true, false));
        }
        return result;
    }

    static List<Player> parsePlayers(String html) {
        Document document = Jsoup.parseBodyFragment(html);
        List<Player> result = new ArrayList<>();
        for (Element row : document.select(".server-item[data-hash]")) {
            String iframe = decode(row.attr("data-hash"));
            if (iframe == null || !iframe.startsWith("https://")) continue;
            result.add(new Player(row.attr("data-type"), row.attr("data-server-name"), iframe));
        }
        return result;
    }

    private static String decode(String value) {
        try {
            String padded = value + "=".repeat((4 - value.length() % 4) % 4);
            return new String(Base64.getDecoder().decode(padded), StandardCharsets.UTF_8).strip();
        } catch (RuntimeException e) {
            try {
                String padded = value + "=".repeat((4 - value.length() % 4) % 4);
                return new String(Base64.getUrlDecoder().decode(padded), StandardCharsets.UTF_8).strip();
            } catch (RuntimeException ignored) { return null; }
        }
    }

    private static String display(double value) {
        return value == Math.rint(value) ? Integer.toString((int) value) : Double.toString(value);
    }

    private static String segment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
