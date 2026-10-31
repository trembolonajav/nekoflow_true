package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class HiAnimeApiClientTest {
    @Test
    void parsesCurrentRecentlyUpdatedPageWithoutDuplicates() {
        var html = """
                <a class="dynamic-name" href="https://hianime.at/black-clover-1" title="Black Clover">Black Clover</a>
                <a class="dynamic-name" href="https://hianime.at/black-clover-1" title="Black Clover">Black Clover</a>
                <a class="dynamic-name" href="https://hianime.at/one-piece-12" title="One Piece">One Piece</a>
                <a class="dynamic-name" href="https://hianime.at/not-an-anime" title="Inválido">Inválido</a>
                """;
        assertThat(HiAnimeApiClient.parseRecent(html))
                .extracting(HiAnimeApiClient.RecentAnime::id)
                .containsExactly("black-clover-1", "one-piece-12");
    }

    @Test
    void parsesEpisodesAndDecodesOnlyHttpsPlayers() {
        var episodes = """
                <a class="ep-item" data-number="14" data-id="991">
                  <span class="ep-name" title="Promise">Promise</span>
                </a>
                """;
        var good = Base64.getEncoder().withoutPadding().encodeToString(
                "https://megaplay.buzz/stream/991".getBytes(StandardCharsets.UTF_8));
        var bad = Base64.getEncoder().withoutPadding().encodeToString(
                "javascript:alert(1)".getBytes(StandardCharsets.UTF_8));
        var servers = """
                <div class="server-item" data-type="sub" data-server-name="HD-1" data-hash="%s"></div>
                <div class="server-item" data-type="dub" data-server-name="bad" data-hash="%s"></div>
                """.formatted(good, bad);
        assertThat(HiAnimeApiClient.parseEpisodes(episodes)).singleElement().satisfies(ep -> {
            assertThat(ep.number()).isEqualTo(14);
            assertThat(ep.title()).isEqualTo("Promise");
        });
        assertThat(HiAnimeApiClient.parsePlayers(servers)).singleElement().satisfies(player -> {
            assertThat(player.type()).isEqualTo("sub");
            assertThat(player.server()).isEqualTo("HD-1");
            assertThat(player.iframe()).isEqualTo("https://megaplay.buzz/stream/991");
        });
    }
}
