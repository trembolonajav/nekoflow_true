package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Cliente da API pública do AniList (endpoint fixo; nenhum endereço vem do usuário).
 * Retorna apenas os campos editoriais que o NekoFlow sincroniza.
 */
@Component
public class AniListClient {

    static final URI ENDPOINT = URI.create("https://graphql.anilist.co");
    private static final String QUERY = """
            query($id:Int){Media(id:$id){id type description(asHtml:false) bannerImage
            coverImage{extraLarge} siteUrl}}""";

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final ObjectMapper mapper;

    public AniListClient(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public record Media(long id, String type, String description, String bannerImage, String cover,
                        String siteUrl) {
    }

    public Optional<Media> fetch(long id) throws Exception {
        String body = mapper.writeValueAsString(Map.of("query", QUERY, "variables", Map.of("id", id)));
        HttpRequest request = HttpRequest.newBuilder(ENDPOINT)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 404) {
            return Optional.empty();
        }
        if (response.statusCode() != 200) {
            throw new IllegalStateException("AniList respondeu HTTP " + response.statusCode());
        }
        JsonNode m = mapper.readTree(response.body()).path("data").path("Media");
        if (m.isMissingNode() || m.isNull()) {
            return Optional.empty();
        }
        return Optional.of(new Media(m.path("id").asLong(), text(m, "type"), text(m, "description"),
                text(m, "bannerImage"), text(m.path("coverImage"), "extraLarge"), text(m, "siteUrl")));
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }
}
