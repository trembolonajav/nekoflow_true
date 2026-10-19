package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AniListSyncTest {

    @Test
    void anilistDescriptionBecomesPlainTextWithAttribution() {
        var s = AniListSyncService.clean("""
                Born into a prestigious family of master swordsmen, Elymas Edvaughn’s future shatters.<br>
                <br>
                Armed with knowledge no one else possesses, he sets out to rewrite his fate &amp; prove the \
                <i>“weakest”</i> class.<br>
                <br>
                (Source: Crunchyroll)""");
        assertThat(s.text()).isEqualTo("""
                Born into a prestigious family of master swordsmen, Elymas Edvaughn’s future shatters.

                Armed with knowledge no one else possesses, he sets out to rewrite his fate & prove the \
                “weakest” class.""");
        assertThat(s.attribution()).isEqualTo("AniList · fonte original: Crunchyroll");
    }

    @Test
    void emptyDescriptionKeepsExistingSynopsis() {
        assertThat(AniListSyncService.clean(null).text()).isNull();
        assertThat(AniListSyncService.clean("   ").attribution()).isNull();
        assertThat(AniListSyncService.clean("Just text.").attribution()).isEqualTo("AniList");
    }
}
