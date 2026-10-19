package com.nekoflow.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

@Service
public class SecurityTokenService {
    private final JdbcClient jdbc;
    private final SecureRandom random = new SecureRandom();
    public SecurityTokenService(JdbcClient jdbc) { this.jdbc = jdbc; }

    public String issue(String table, long userId, Duration ttl) {
        requireTable(table);
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.sql("UPDATE " + table + " SET used_at=now() WHERE user_id=? AND used_at IS NULL").param(userId).update();
        jdbc.sql("INSERT INTO " + table + "(id,user_id,token_hash,expires_at) VALUES (?,?,?,now() + (? * interval '1 second'))")
                .params(UUID.randomUUID(), userId, hash(raw), ttl.toSeconds()).update();
        return raw;
    }

    public long consume(String table, String raw) {
        requireTable(table);
        Long user = jdbc.sql("SELECT user_id FROM " + table + " WHERE token_hash=? AND used_at IS NULL AND expires_at>now()")
                .param(hash(raw == null ? "" : raw)).query(Long.class).optional().orElse(null);
        if (user == null) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Link inválido ou expirado");
        jdbc.sql("UPDATE " + table + " SET used_at=now() WHERE token_hash=?").param(hash(raw)).update();
        return user;
    }

    private static String hash(String raw) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    private static void requireTable(String table) {
        if (!table.equals("email_verification_token") && !table.equals("password_reset_token")) throw new IllegalArgumentException();
    }
}
