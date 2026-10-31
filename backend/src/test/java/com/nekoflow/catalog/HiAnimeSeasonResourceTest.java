package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class HiAnimeSeasonResourceTest {

    @Test
    void snapshotSazonalTemTitulosUnicosEFontesSomenteEmHostsDeclarados() throws Exception {
        JsonNode root;
        try (var in = new ClassPathResource("seed/hianime-catalog.json").getInputStream()) {
            root = new ObjectMapper().readTree(in);
        }
        assertThat(root.path("works").size()).isGreaterThanOrEqualTo(300);
        Set<String> allowed = new HashSet<>();
        root.path("provider").path("allowedHosts").forEach(n -> allowed.add(n.asText()));
        assertThat(allowed).isNotEmpty();
        int episodes = 0;
        int sources = 0;
        for (JsonNode work : root.path("works")) {
            assertThat(work.path("sourceCsvTitle").asText()).isNotBlank();
            assertThat(work.path("title").asText()).isNotBlank();
            for (JsonNode episode : work.path("season").path("episodes")) {
                episodes++;
                for (JsonNode source : episode.path("sources")) {
                    sources++;
                    URI uri = URI.create(source.path("url").asText());
                    assertThat(uri.getScheme()).isEqualTo("https");
                    assertThat(allowed).contains(uri.getHost());
                    assertThat(source.path("audioLanguage").asText()).isIn("ja", "en", "es", "pt-BR");
                }
            }
        }
        assertThat(episodes).isPositive();
        assertThat(sources).isPositive();
    }
}
