package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class SushiAnimesCatalogClientTest {
    @Test
    void parsesSitemapAddressesWithoutGuessingEpisodeIdentity() {
        String xml = """
                <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                  <url><loc>https://sushianimes.com.br/anime/dororo-1191</loc></url>
                  <url><loc>https://sushianimes.com.br/anime/dororo-1191-1-season-22-episode</loc></url>
                </urlset>
                """;
        List<String> locations = SushiAnimesCatalogClient.sitemapLocations(xml);
        assertThat(SushiAnimesCatalogClient.workAddress(locations.get(0)))
                .isEqualTo(new SushiAnimesCatalogClient.WorkRef("1191", "dororo",
                        "https://sushianimes.com.br/anime/dororo-1191"));
        assertThat(SushiAnimesCatalogClient.episodeAddress(locations.get(1)))
                .isEqualTo(new SushiAnimesCatalogClient.EpisodeRef("1191", "dororo", 1, "22",
                        "https://sushianimes.com.br/anime/dororo-1191-1-season-22-episode"));
    }

    @Test
    void parsesWorkAndPublishedEpisodeMetadata() {
        String html = """
                <html><head><link rel="canonical" href="https://sushianimes.com.br/anime/dororo-1191"></head><body>
                <div class="media-cover"><img src="/public/upload/cover/dororo.webp"></div>
                <div class="anime_status"><span>Completo</span></div>
                <span id="certification-anime">18</span>
                <a itemprop="genre">Ação</a><a itemprop="genre">Sobrenatural</a>
                <h1 id="title">Dororo</h1><h2>どろろ</h2>
                <div class="featured-box">
                  <div class="featured-attr"><div class="attr">Data de lançamento</div><div class="text">2019</div></div>
                  <div class="featured-attr"><div class="attr">Duração</div><div class="text">24 min</div></div>
                  <div class="featured-attr"><div class="attr">Áudio</div><div class="text">Legendado</div></div>
                </div>
                <div class="detail-attr"><div class="attr">Sinopse</div><div class="text-content">A história.</div></div>
                <a class="epx-card" href="/anime/dororo-1191-1-season-1-episode">
                  <div class="epx-thumb" data-src="/public/upload/episode/dororo-1-1.jpg"></div>
                  <div class="epx-desc">A história de Daigo</div>
                </a></body></html>
                """;
        var ref = new SushiAnimesCatalogClient.WorkRef("1191", "dororo",
                "https://sushianimes.com.br/anime/dororo-1191");
        var work = SushiAnimesCatalogClient.parseWork(html, ref, "https://sushianimes.com.br");
        assertThat(work.title()).isEqualTo("Dororo");
        assertThat(work.alternativeTitle()).isEqualTo("どろろ");
        assertThat(work.year()).isEqualTo(2019);
        assertThat(work.durationMinutes()).isEqualTo(24);
        assertThat(work.genres()).containsExactly("Ação", "Sobrenatural");
        assertThat(work.episodes()).singleElement().satisfies(episode -> {
            assertThat(episode.title()).isEqualTo("A história de Daigo");
            assertThat(episode.url()).endsWith("dororo-1191-1-season-1-episode");
        });
    }

    @Test
    void mergesDubbedAndSubbedVariantsByCanonicalName() {
        assertThat(SushiAnimesArchiveSyncService.canonicalTitle("Dororo (Dublado)")).isEqualTo("Dororo");
        assertThat(SushiAnimesArchiveSyncService.canonicalSlug("dororo-dublado")).isEqualTo("dororo");
    }
}
