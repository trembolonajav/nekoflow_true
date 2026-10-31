package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.net.http.HttpClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/** Teste opt-in: depende da rede e do contrato não oficial da origem. */
@EnabledIfSystemProperty(named = "mangalivre.live", matches = "true")
class MangaLivreLiveSmokeTest {
    private final MangaLivreApiClient api = new MangaLivreApiClient(
            new ObjectMapper().findAndRegisterModules(),
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).build(),
            "https://mangalivre.blog", Duration.ofSeconds(20), Duration.ZERO, true);

    @Test
    void readsLiveCatalogLargeMangaPaginationAndReader() {
        assertThat(api.health().catalogSize()).isGreaterThan(0);
        var latest = api.catalog(1, 10, "");
        assertThat(latest.items()).isNotEmpty();
        assertThat(api.manga(latest.items().get(0).slug()).chapterCount()).isGreaterThanOrEqualTo(0);

        var onePiece = api.manga("one-piece");
        assertThat(onePiece.id()).isPositive();
        assertThat(onePiece.chapterCount()).isGreaterThan(1_000);

        var oldChapters = api.chapters("one-piece", 1_170, "");
        assertThat(oldChapters.items()).isNotEmpty();
        assertThat(oldChapters.totalElements()).isGreaterThan(1_000);

        var reader = api.reader("one-piece-capitulo-1196");
        assertThat(reader.pages()).isNotEmpty();
        assertThat(reader.pages()).allSatisfy(page -> assertThat(page.imageUrl()).startsWith("https://"));
    }
}
