package com.nekoflow.media;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ServerHealthRulesTest {

    @Test
    void hostNeedsEnoughSessionsBeforeBeingJudged() {
        assertThat(ServerHealthService.status(4, 4, 0)).isEqualTo("unknown");
        assertThat(ServerHealthService.status(4, 0, 3)).isEqualTo("bad");
        assertThat(ServerHealthService.status(20, 2, 0)).isEqualTo("good");
        assertThat(ServerHealthService.status(20, 6, 0)).isEqualTo("warn");
        assertThat(ServerHealthService.status(20, 10, 0)).isEqualTo("bad");
    }

    @Test
    void linkIsSuspectWhenMostPeopleGiveUpOrReportIt() {
        assertThat(ServerHealthService.suspect(1, 1, 0)).isFalse();
        assertThat(ServerHealthService.suspect(3, 2, 0)).isTrue();
        assertThat(ServerHealthService.suspect(10, 2, 0)).isFalse();
        assertThat(ServerHealthService.suspect(0, 0, 2)).isTrue();
    }

    @Test
    void rankPutsSuspectLinksLastAndUnknownHostsWithTheGoodOnes() {
        assertThat(ServerHealthService.rank("good", false)).isZero();
        assertThat(ServerHealthService.rank("unknown", false)).isZero();
        assertThat(ServerHealthService.rank("warn", false)).isEqualTo(1);
        assertThat(ServerHealthService.rank("bad", false)).isEqualTo(2);
        assertThat(ServerHealthService.rank("good", true)).isEqualTo(3);
    }

    @Test
    void hostComesFromTheEmbedUrl() {
        assertThat(ServerHealthService.host("https://www.Blogger.com/video.g?token=x")).isEqualTo("blogger.com");
        assertThat(ServerHealthService.host("https://cdn-sv01.maximaimg.online:8443/e/1")).isEqualTo("cdn-sv01.maximaimg.online");
        assertThat(ServerHealthService.host("nada")).isNull();
    }
}
