package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
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
    /** Campos da ficha: os mesmos que as páginas do design exibem. */
    private static final String QUERY = """
            query($id:Int){Media(id:$id){id idMal type format status episodes chapters volumes duration season seasonYear
            averageScore popularity isAdult countryOfOrigin source siteUrl description(asHtml:false)
            title{romaji english native} synonyms bannerImage coverImage{extraLarge large}
            startDate{year month day} endDate{year month day} genres
            tags{name rank isMediaSpoiler isGeneralSpoiler}
            trailer{id site}
            studios(isMain:true){nodes{name}}
            staff(sort:[RELEVANCE],perPage:12){edges{role node{name{full native}}}}
            characters(sort:[ROLE,RELEVANCE],perPage:12){edges{role node{id name{full native} image{large}}
              voiceActors(language:JAPANESE,sort:[RELEVANCE]){name{full} image{medium}}
              allVoices: voiceActors(sort:[RELEVANCE]){name{full} image{medium} languageV2}}}
            relations{edges{relationType node{id type format status title{romaji english native}
              coverImage{large} startDate{year} episodes chapters siteUrl}}}
            recommendations(sort:[RATING_DESC],perPage:8){nodes{rating mediaRecommendation{id type format
              title{romaji english} coverImage{large} genres siteUrl}}}
            nextAiringEpisode{episode airingAt}}}""";

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final ObjectMapper mapper;

    public AniListClient(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public record Media(long id, String type, String description, String bannerImage, String cover,
                        String siteUrl, JsonNode raw) {
    }
    public record Health(String status, long latencyMs) {}

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
            // O AniList devolve 403 quando a API está temporariamente desativada.
            throw new IllegalStateException("AniList respondeu HTTP " + response.statusCode());
        }
        JsonNode m = mapper.readTree(response.body()).path("data").path("Media");
        if (m.isMissingNode() || m.isNull()) {
            return Optional.empty();
        }
        return Optional.of(new Media(m.path("id").asLong(), text(m, "type"), text(m, "description"),
                text(m, "bannerImage"), text(m.path("coverImage"), "extraLarge"), text(m, "siteUrl"), m));
    }

    /** Teste mínimo da API GraphQL oficial, sem alterar nem sincronizar o catálogo. */
    public Health health() throws Exception {
        long started = System.nanoTime();
        String query = "query{Page(page:1,perPage:1){media(type:ANIME,sort:POPULARITY_DESC){id}}}";
        String body = mapper.writeValueAsString(Map.of("query", query, "variables", Map.of()));
        HttpRequest request = HttpRequest.newBuilder(ENDPOINT).timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json").header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("AniList respondeu HTTP " + response.statusCode());
        JsonNode media = mapper.readTree(response.body()).path("data").path("Page").path("media");
        if (!media.isArray() || media.isEmpty()) throw new IllegalStateException("AniList não retornou mídia no teste.");
        return new Health("UP", Duration.ofNanos(System.nanoTime() - started).toMillis());
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }
}
