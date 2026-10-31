package com.nekoflow.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import org.junit.jupiter.api.Test;

class FibAnimeCatalogResourceTest {

    @Test
    void auditedResourceKeepsAllWorksSeasonsAndEpisodes() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/seed/fibanime-catalog.json")) {
            JsonNode root = new ObjectMapper().readTree(in);
            int seasons = 0;
            int episodes = 0;
            for (JsonNode work : root.path("works")) {
                seasons += work.path("seasons").size();
                episodes += work.path("episodeCount").asInt();
            }
            assertEquals(331, root.path("works").size());
            assertEquals(298, seasons);
            assertEquals(7074, episodes);
            // Um único player por episódio para cada versão de áudio (o melhor disponível).
            assertEquals(9129, root.path("sourceCount").asInt());
            assertFalse(root.path("allowedHosts").isEmpty());
            assertEquals("authorized first-party transfer; one best player per episode audio (FIBPlayer > Player ext 1 > ...); all live players when the episode has an expiring signed link",
                    root.path("policy").asText());
            int fibEpisodes = 0;
            for (JsonNode work : root.path("works")) {
                for (JsonNode season : work.path("seasons")) {
                    for (JsonNode episode : season.path("episodes")) {
                        java.util.Set<String> audios = new java.util.HashSet<>();
                        boolean fib = false;
                        for (JsonNode source : episode.path("sources")) {
                            String label = source.path("label").asText();
                            String audio = label.contains(" · ") ? label.substring(label.indexOf(" · ")) : "";
                            assertTrue(audios.add(audio) || episode.path("signedFallback").asBoolean(),
                                    work.path("title").asText() + " "
                                    + episode.path("code").asText() + ": dois players para o mesmo áudio");
                            fib |= label.toLowerCase().startsWith("fibplayer");
                        }
                        if (fib) fibEpisodes++;
                    }
                }
            }
            assertEquals(4037, fibEpisodes);
        }
    }
}
