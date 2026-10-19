package com.nekoflow.media;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * URLs temporárias para arquivos do armazenamento local, entregues pelo Nginx
 * (módulo secure_link) e não pelo Java. Formato compatível com
 * {@code secure_link_md5 "$secure_link_expires$uri <segredo>"}.
 */
@Component
public class MediaUrlSigner {

    private final String secret;
    private final long ttlSeconds;
    private final String publicPrefix;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public MediaUrlSigner(@Value("${nekoflow.media.signing-secret}") String secret,
                          @Value("${nekoflow.media.url-ttl-seconds:3600}") long ttlSeconds,
                          @Value("${nekoflow.media.public-prefix:/media}") String publicPrefix) {
        this(secret, ttlSeconds, publicPrefix, Clock.systemUTC());
    }

    MediaUrlSigner(String secret, long ttlSeconds, String publicPrefix, Clock clock) {
        if (secret == null || secret.length() < 16) {
            throw new IllegalStateException("nekoflow.media.signing-secret precisa ter ao menos 16 caracteres");
        }
        this.secret = secret;
        this.ttlSeconds = ttlSeconds;
        this.publicPrefix = publicPrefix.endsWith("/") ? publicPrefix.substring(0, publicPrefix.length() - 1)
                : publicPrefix;
        this.clock = clock;
    }

    public record Signed(String url, Instant expiresAt) {
    }

    public Signed sign(String assetKey) {
        if (assetKey.contains("..") || assetKey.startsWith("/") || assetKey.contains("\\")) {
            throw new IllegalArgumentException("chave de arquivo inválida");
        }
        Instant expires = clock.instant().plusSeconds(ttlSeconds);
        String uri = publicPrefix + "/" + assetKey;
        String token = token(expires.getEpochSecond(), uri);
        return new Signed(uri + "?md5=" + token + "&expires=" + expires.getEpochSecond(), expires);
    }

    public Instant expiresAt() {
        return clock.instant().plusSeconds(ttlSeconds);
    }

    String token(long expires, String uri) {
        try {
            byte[] digest = MessageDigest.getInstance("MD5")
                    .digest((expires + uri + " " + secret).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
