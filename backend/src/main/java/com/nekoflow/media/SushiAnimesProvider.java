package com.nekoflow.media;

import java.io.InputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.IDN;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Resolve e transmite mídia do Sushi Animes conforme autorização fornecida ao NekoFlow. */
@Component
public class SushiAnimesProvider {
    private static final Pattern PLAYER_EMBED = Pattern.compile("playerEmbed\\s*=\\s*[\\\"'](https://[^\\\"']+)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern RANGE = Pattern.compile("bytes=\\d*-\\d*", Pattern.CASE_INSENSITIVE);
    private static final Duration CACHE_TTL = Duration.ofMinutes(15);

    public record ResolvedMedia(URI url, String type) { }
    public record MediaResponse(int status, java.net.http.HttpHeaders headers, InputStream body) { }
    private record Cached(ResolvedMedia media, long createdAtNanos) { }

    private final String origin;
    private final String originHost;
    private final Set<String> cdnHosts;
    private final Duration timeout;
    private final HttpClient mediaHttp;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    public SushiAnimesProvider(
            @Value("${nekoflow.sushi-animes.origin:https://sushianimes.com.br}") String origin,
            @Value("${nekoflow.sushi-animes.cdn-hosts:cdn-s01.pixel-sus-4k-image.com,cdn-sv01.maximaimg.online}") String cdnHosts,
            @Value("${nekoflow.sushi-animes.request-timeout-seconds:25}") long timeoutSeconds) {
        this.origin = origin.replaceAll("/+$", "");
        this.originHost = normalizedHost(URI.create(this.origin));
        this.cdnHosts = Arrays.stream(cdnHosts.split(",")).map(String::strip).filter(v -> !v.isBlank())
                .map(v -> IDN.toASCII(v).toLowerCase(Locale.ROOT)).collect(Collectors.toUnmodifiableSet());
        this.timeout = Duration.ofSeconds(Math.max(5, timeoutSeconds));
        this.mediaHttp = HttpClient.newBuilder().connectTimeout(this.timeout)
                .followRedirects(HttpClient.Redirect.NORMAL).build();
    }

    public ResolvedMedia resolve(String pageUrl) {
        URI page = validatedPage(pageUrl);
        long now = System.nanoTime();
        Cached hit = cache.get(page.toString());
        if (hit != null && now - hit.createdAtNanos() < CACHE_TTL.toNanos()) return hit.media();

        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
        HttpClient session = HttpClient.newBuilder().connectTimeout(timeout).cookieHandler(cookies)
                .followRedirects(HttpClient.Redirect.NORMAL).build();
        String html = sendText(session, request(page).GET().build());
        String token = csrf(html);
        if (html.contains("id=\"adultGate\"") || html.contains("data-adult-guest")) {
            sendText(session, formRequest("/ajax/ageverify", page,
                    "mode=guest_adult&_TOKEN=" + encode(token)));
            html = sendText(session, request(page).GET().build());
            token = csrf(html);
        }
        Document document = Jsoup.parse(html, page.toString());
        List<Element> candidates = document.select("button.dropdown-source[data-embed]");
        if (candidates.isEmpty())
            throw new ProviderException("Player Sushi Animes não encontrado na página do episódio.");

        ResolvedMedia resolved = null;
        for (Element candidate : candidates) {
            String id = candidate.attr("data-embed");
            if (!id.matches("\\d+")) continue;
            String embed = sendText(session, formRequest("/ajax/embed", page,
                    "id=" + encode(id) + "&_TOKEN=" + encode(token)));
            String decoded = embed;
            Element iframe = Jsoup.parseBodyFragment(embed, origin).selectFirst("iframe[srcdoc]");
            if (iframe != null) decoded = iframe.attr("srcdoc");
            Matcher media = PLAYER_EMBED.matcher(decoded);
            if (!media.find()) continue; // Ex.: player móvel externo; prefere a fonte direta FullHD/HLS.
            URI url = validatedMedia(media.group(1));
            resolved = new ResolvedMedia(url,
                    url.getPath().toLowerCase(Locale.ROOT).endsWith(".m3u8") ? "HLS" : "MP4");
            break;
        }
        if (resolved == null) throw new ProviderException("Sushi Animes não retornou uma mídia reproduzível.");
        if (cache.size() > 512) cache.clear();
        cache.put(page.toString(), new Cached(resolved, now));
        return resolved;
    }

    public MediaResponse open(ResolvedMedia media, String range) {
        URI url = validatedMedia(media.url().toString());
        if (range != null && !range.isBlank() && !RANGE.matcher(range.strip()).matches())
            throw new IllegalArgumentException("Intervalo HTTP inválido.");
        HttpRequest.Builder request = HttpRequest.newBuilder(url).timeout(Duration.ofMinutes(2))
                .header("Accept", "video/mp4,application/vnd.apple.mpegurl,*/*")
                .header("User-Agent", userAgent()).header("Referer", origin + "/");
        if (range != null && !range.isBlank()) request.header("Range", range.strip());
        try {
            HttpResponse<InputStream> response = mediaHttp.send(request.GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream());
            return new MediaResponse(response.statusCode(), response.headers(), response.body());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ProviderException("Transmissão Sushi Animes interrompida.", error);
        } catch (Exception error) {
            throw new ProviderException("Não foi possível acessar a mídia do Sushi Animes.", error);
        }
    }

    private HttpRequest.Builder request(URI uri) {
        return HttpRequest.newBuilder(uri).timeout(timeout).header("Accept", "text/html,application/xhtml+xml")
                .header("User-Agent", userAgent()).header("Referer", origin + "/");
    }

    private HttpRequest formRequest(String path, URI page, String body) {
        return HttpRequest.newBuilder(URI.create(origin + path)).timeout(timeout)
                .header("Accept", "text/html,application/json")
                .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                .header("X-Requested-With", "XMLHttpRequest").header("User-Agent", userAgent())
                .header("Referer", page.toString()).POST(HttpRequest.BodyPublishers.ofString(body)).build();
    }

    private String sendText(HttpClient client, HttpRequest request) {
        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200)
                throw new ProviderException("Sushi Animes respondeu HTTP " + response.statusCode() + ".");
            return response.body();
        } catch (ProviderException error) {
            throw error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new ProviderException("Consulta ao Sushi Animes interrompida.", error);
        } catch (Exception error) {
            throw new ProviderException("Não foi possível consultar o Sushi Animes.", error);
        }
    }

    private URI validatedPage(String value) {
        URI uri = safeHttps(value);
        if (!originHost.equals(normalizedHost(uri)) || !uri.getPath().startsWith("/anime/")
                || !uri.getPath().endsWith("-episode"))
            throw new IllegalArgumentException("Página de episódio Sushi Animes inválida.");
        return uri;
    }

    private URI validatedMedia(String value) {
        URI uri = safeHttps(value);
        if (!cdnHosts.contains(normalizedHost(uri)))
            throw new ProviderException("Host de mídia Sushi Animes não autorizado.");
        String path = uri.getPath().toLowerCase(Locale.ROOT);
        if (!path.endsWith(".mp4") && !path.endsWith(".m3u8"))
            throw new ProviderException("Formato de mídia Sushi Animes não autorizado.");
        return uri;
    }

    private static URI safeHttps(String value) {
        try {
            URI uri = URI.create(value == null ? "" : value.strip());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443))
                throw new IllegalArgumentException("URL HTTPS inválida.");
            return uri;
        } catch (RuntimeException error) {
            throw new IllegalArgumentException("URL HTTPS inválida.", error);
        }
    }

    private static String normalizedHost(URI uri) {
        return IDN.toASCII(uri.getHost()).toLowerCase(Locale.ROOT);
    }

    private static String csrf(String html) {
        Element meta = Jsoup.parse(html).selectFirst("meta[name=csrf-token][content]");
        if (meta == null || meta.attr("content").isBlank())
            throw new ProviderException("Token da sessão Sushi Animes não encontrado.");
        return meta.attr("content");
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String userAgent() {
        return "Mozilla/5.0 (compatible; NekoFlow-SushiAnimes-Authorized/1.0)";
    }

    public static class ProviderException extends RuntimeException {
        public ProviderException(String message) { super(message); }
        public ProviderException(String message, Throwable cause) { super(message, cause); }
    }
}
