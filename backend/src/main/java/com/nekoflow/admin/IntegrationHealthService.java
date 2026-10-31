package com.nekoflow.admin;

import com.nekoflow.catalog.AniListClient;
import com.nekoflow.catalog.HiAnimeApiClient;
import com.nekoflow.catalog.MangaLivreApiClient;
import com.nekoflow.catalog.SushiAnimesCatalogClient;
import com.nekoflow.catalog.UnofficialReadingApiClient;
import com.nekoflow.catalog.WeebCentralApiClient;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Inventário e monitor ativo das integrações externas do NekoFlow. */
@Service
public class IntegrationHealthService {
    public record Definition(String code, String name, String role, String category, String integration,
                             String language, String endpoint) {}
    public record Result(String code, String status, Long latencyMs, String message, Instant checkedAt) {}

    private final AniListClient anilist;
    private final HiAnimeApiClient hianime;
    private final MangaLivreApiClient mangalivre;
    private final WeebCentralApiClient weebcentral;
    private final SushiAnimesCatalogClient sushi;
    private final UnofficialReadingApiClient reading;
    private final Map<String, Result> results = new ConcurrentHashMap<>();
    private final List<Definition> definitions;

    public IntegrationHealthService(AniListClient anilist, HiAnimeApiClient hianime,
            MangaLivreApiClient mangalivre, WeebCentralApiClient weebcentral,
            SushiAnimesCatalogClient sushi, UnofficialReadingApiClient reading) {
        this.anilist = anilist;
        this.hianime = hianime;
        this.mangalivre = mangalivre;
        this.weebcentral = weebcentral;
        this.sushi = sushi;
        this.reading = reading;
        this.definitions = List.of(
                new Definition("anilist", "AniList", "Fichas, imagens, temporadas e relações", "METADATA", "OFFICIAL_PUBLIC_API", "multi", "https://graphql.anilist.co"),
                new Definition("hianime", "HiAnime", "Episódios e players externos", "ANIME", "UNOFFICIAL_API", "multi", "/api/admin/sync/dashboard"),
                new Definition("sushi-animes", "Sushi Animes", "Catálogo e streaming autorizado", "ANIME", "AUTHORIZED_PARTNERSHIP", "pt-BR", "/api/admin/catalog/sushi-animes/archive/status"),
                new Definition("mangalivre", "MangaLivre", "Mangás, manhwas e webtoons", "READING", "UNOFFICIAL_API", "pt-BR", "/api/v1/providers/mangalivre/health"),
                new Definition("weebcentral-en", "WeebCentral", "Catálogo de leitura em inglês", "READING", "UNOFFICIAL_API", "en", "/api/v1/providers/weebcentral-en/health"),
                new Definition(UnofficialReadingApiClient.TIA, "TiaManhwa", "Manhwas e pornhwas em português", "READING", "AUTHORIZED_UNOFFICIAL_API", "pt-BR", "/api/v1/providers/tiamanhwa-ptbr/health"),
                new Definition(UnofficialReadingApiClient.COMIX, "Comix", "Mangás, manhwas e manhuas em inglês", "READING", "UNOFFICIAL_API", "en", "/api/v1/providers/comix-en/health"),
                new Definition(UnofficialReadingApiClient.BUDDY, "ManhwaBuddy", "Manhwas e webtoons em inglês", "READING", "AUTHORIZED_UNOFFICIAL_API", "en", "/api/v1/providers/manhwabuddy-en/health"));
    }

    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Definition definition : definitions) {
            Result result = results.get(definition.code());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("code", definition.code());
            item.put("name", definition.name());
            item.put("role", definition.role());
            item.put("category", definition.category());
            item.put("integration", definition.integration());
            item.put("language", definition.language());
            item.put("endpoint", definition.endpoint());
            item.put("status", result == null ? "UNKNOWN" : result.status());
            item.put("ok", result != null && "UP".equals(result.status()));
            item.put("latencyMs", result == null ? null : result.latencyMs());
            item.put("message", result == null ? "Ainda não testada" : result.message());
            item.put("checkedAt", result == null ? null : result.checkedAt());
            item.put("meta", meta(definition, result));
            out.add(item);
        }
        return out;
    }

    public Map<String, Object> test(String code) {
        Definition definition = definitions.stream().filter(value -> value.code().equals(code)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Integração inexistente."));
        long started = System.nanoTime();
        Result result;
        try {
            check(code);
            result = new Result(code, "UP", Duration.ofNanos(System.nanoTime() - started).toMillis(),
                    "Resposta válida", Instant.now());
        } catch (Exception error) {
            result = new Result(code, "DOWN", Duration.ofNanos(System.nanoTime() - started).toMillis(),
                    safeMessage(error), Instant.now());
        }
        results.put(code, result);
        return list().stream().filter(item -> code.equals(item.get("code"))).findFirst().orElseThrow();
    }

    public List<Map<String, Object>> testAll() {
        List<CompletableFuture<Void>> tasks = definitions.stream()
                .map(definition -> CompletableFuture.runAsync(() -> test(definition.code())))
                .toList();
        tasks.forEach(CompletableFuture::join);
        return list();
    }

    @Scheduled(initialDelay = 20_000, fixedDelay = 1_800_000)
    public void scheduledHealthCheck() { testAll(); }

    private void check(String code) throws Exception {
        switch (code) {
            case "anilist" -> anilist.health();
            case "hianime" -> hianime.health();
            case "sushi-animes" -> sushi.health();
            case "mangalivre" -> mangalivre.health();
            case "weebcentral-en" -> weebcentral.health();
            case UnofficialReadingApiClient.TIA, UnofficialReadingApiClient.COMIX,
                 UnofficialReadingApiClient.BUDDY -> reading.health(code);
            default -> throw new IllegalArgumentException("Integração inexistente.");
        }
    }

    private static String meta(Definition definition, Result result) {
        String kind = switch (definition.integration()) {
            case "OFFICIAL_PUBLIC_API" -> "API oficial pública";
            case "AUTHORIZED_PARTNERSHIP" -> "Parceria autorizada";
            case "AUTHORIZED_UNOFFICIAL_API" -> "API não oficial autorizada";
            default -> "API não oficial";
        };
        if (result == null) return kind + " · " + definition.language() + " · ainda não testada";
        return kind + " · " + definition.language() + " · " + result.status()
                + (result.latencyMs() == null ? "" : " · " + result.latencyMs() + " ms");
    }

    private static String safeMessage(Throwable error) {
        Throwable cause = error;
        while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
        String message = cause.getMessage();
        if (message == null || message.isBlank()) message = error.getClass().getSimpleName();
        return message.length() > 240 ? message.substring(0, 240) : message;
    }
}
