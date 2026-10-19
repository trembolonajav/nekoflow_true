package com.nekoflow.media;

import java.net.IDN;
import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Provedores de mídia autorizados. Uma URL de fonte/página só é entregue ao navegador
 * quando usa HTTPS, não carrega credenciais e aponta para um host declarado pelo
 * provedor. O backend não baixa nem faz proxy dessas URLs: só as valida.
 */
@Component
public class MediaProviders {

    private final JdbcClient jdbc;

    public MediaProviders(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record Provider(UUID id, String code, String name, String mediaKind, List<String> allowedHosts,
                           boolean enabled) {
    }

    public java.util.Optional<Provider> find(UUID id) {
        if (id == null) {
            return java.util.Optional.empty();
        }
        return jdbc.sql("SELECT id, code, name, media_kind, allowed_hosts, enabled FROM media_provider WHERE id = ?")
                .param(id)
                .query((rs, n) -> new Provider(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        rs.getString(4), Arrays.asList((String[]) rs.getArray(5).getArray()), rs.getBoolean(6)))
                .optional();
    }

    /** true quando a URL pode ser entregue como mídia deste provedor. */
    public boolean allows(Provider provider, String url) {
        return provider != null && provider.enabled() && hostAllowed(provider.allowedHosts(), url);
    }

    static boolean hostAllowed(List<String> allowedHosts, String url) {
        if (url == null || url.isBlank()) {
            return false;
        }
        try {
            URI uri = new URI(url.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null || uri.getHost() == null) {
                return false;
            }
            if (uri.getPort() != -1 && uri.getPort() != 443) {
                return false;
            }
            String host = IDN.toASCII(uri.getHost()).toLowerCase(Locale.ROOT);
            if (host.matches("[0-9.]+") || host.contains(":")) {
                return false; // IP literal: nunca aceito como origem de mídia
            }
            return allowedHosts.stream().map(h -> h.toLowerCase(Locale.ROOT)).anyMatch(host::equals);
        } catch (Exception e) {
            return false;
        }
    }
}
