package com.nekoflow.media;

import java.io.InputStream;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Proxy Range autorizado: transmite bytes da CDN sem materializar o arquivo em memória. */
@RestController
public class SushiAnimesStreamController {
    private static final String PROVIDER_CODE = "SUSHI_ANIMES_CDN";
    private final JdbcClient jdbc;
    private final SushiAnimesProvider sushi;

    public SushiAnimesStreamController(JdbcClient jdbc, SushiAnimesProvider sushi) {
        this.jdbc = jdbc;
        this.sushi = sushi;
    }

    @GetMapping("/api/v1/episodes/{episodeId}/playback/sources/{sourceId}/stream")
    public ResponseEntity<StreamingResponseBody> stream(
            @PathVariable UUID episodeId, @PathVariable UUID sourceId,
            @RequestHeader(name = HttpHeaders.RANGE, required = false) String range) {
        String page = jdbc.sql("""
                SELECT es.source_url FROM episode_source es
                JOIN media_provider p ON p.id=es.provider_id
                WHERE es.id=? AND es.episode_id=? AND es.enabled AND p.enabled AND p.code=?
                """).params(sourceId, episodeId, PROVIDER_CODE).query(String.class).optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fonte Sushi Animes indisponível."));
        final SushiAnimesProvider.MediaResponse upstream;
        try {
            upstream = sushi.open(sushi.resolve(page), range);
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, error.getMessage());
        } catch (SushiAnimesProvider.ProviderException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, error.getMessage(), error);
        }
        if (upstream.status() != 200 && upstream.status() != 206 && upstream.status() != 416) {
            close(upstream.body());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "CDN Sushi Animes respondeu HTTP " + upstream.status() + ".");
        }
        HttpHeaders headers = new HttpHeaders();
        copy(upstream, headers, "Content-Type");
        copy(upstream, headers, "Content-Length");
        copy(upstream, headers, "Content-Range");
        copy(upstream, headers, "Accept-Ranges");
        copy(upstream, headers, "Cache-Control");
        copy(upstream, headers, "ETag");
        copy(upstream, headers, "Last-Modified");
        if (!headers.containsKey(HttpHeaders.ACCEPT_RANGES)) headers.set(HttpHeaders.ACCEPT_RANGES, "bytes");
        if (upstream.status() == 416) {
            close(upstream.body());
            return ResponseEntity.status(416).headers(headers).body(output -> { });
        }
        StreamingResponseBody body = output -> {
            try (InputStream input = upstream.body()) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) >= 0) {
                    output.write(buffer, 0, read);
                }
                output.flush();
            }
        };
        return ResponseEntity.status(upstream.status()).headers(headers).body(body);
    }

    private static void copy(SushiAnimesProvider.MediaResponse upstream, HttpHeaders target, String name) {
        upstream.headers().firstValue(name).ifPresent(value -> target.set(name, value));
    }

    private static void close(InputStream stream) {
        try { stream.close(); } catch (Exception ignored) { }
    }
}
