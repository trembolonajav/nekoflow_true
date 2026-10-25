package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CatalogTitlePolicyTest {

    @Test
    void removesOnlyGenericSeasonSuffixesFromDisplayedTitle() {
        assertThat(CatalogTitlePolicy.canonicalSeriesTitle("Tensei Shitara Ken Deshita 2nd Season"))
                .isEqualTo("Tensei Shitara Ken Deshita");
        assertThat(CatalogTitlePolicy.canonicalSeriesTitle("Black Clover Season 2"))
                .isEqualTo("Black Clover");
        assertThat(CatalogTitlePolicy.canonicalSeriesTitle("Bleach: Thousand-Year Blood War - The Calamity"))
                .isEqualTo("Bleach: Thousand-Year Blood War - The Calamity");
    }

    @Test
    void distinguishesUnrelatedImportedSeasons() {
        assertThat(CatalogTitlePolicy.sameSeries("Overlord", "Overlord IV")).isTrue();
        assertThat(CatalogTitlePolicy.sameSeries("Naruto", "Boruto: Naruto Next Generations")).isTrue();
        assertThat(CatalogTitlePolicy.sameSeries("Reincarnated as a Sword Season 2",
                "Mission: Yozakura Family Season 2")).isFalse();
        assertThat(CatalogTitlePolicy.sameSeries("I'm Standing on a Million Lives", "Mob Psycho 100 II"))
                .isFalse();
    }
}
