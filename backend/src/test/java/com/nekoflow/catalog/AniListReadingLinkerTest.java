package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.nekoflow.catalog.AniListReadingLinker.Candidate;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Casos reais da busca do AniList: só vincula quando não há dúvida. */
class AniListReadingLinkerTest {

    private static Candidate c(long id, String format, String country, Integer year, String... titles) {
        return new Candidate(id, null, format, country, year, Set.of(titles));
    }

    @Test
    void englishTitleFromAnotherSourceMatchesTheKoreanEntry() {
        var d = AniListReadingLinker.decide(Set.of("Return of the Blossoming Blade"), "MANHWA", null, 120,
                List.of(c(132144, "MANGA", "KR", 2021, "Hwasangwihwan", "Return of the Blossoming Blade")));
        assertThat(d.status()).isEqualTo("MATCHED");
        assertThat(d.anilistId()).isEqualTo(132144L);
    }

    @Test
    void sameNameOnTwoEntriesIsAmbiguous() {
        var d = AniListReadingLinker.decide(Set.of("One Punch-Man"), "MANGA", null, 200, List.of(
                c(74347, "MANGA", "JP", 2012, "One Punch-Man", "One-Punch Man"),
                c(85364, "MANGA", "JP", 2009, "One Punch Man")));
        assertThat(d.status()).isEqualTo("AMBIGUOUS");
    }

    @Test
    void novelsSpinOffsAndOneShotsAreIgnored() {
        var d = AniListReadingLinker.decide(Set.of("Sakamoto Days"), "MANGA", 2020, 190, List.of(
                c(125828, "MANGA", "JP", 2020, "SAKAMOTO DAYS", "Sakamoto Days"),
                c(185734, "NOVEL", "JP", 2023, "SAKAMOTO DAYS: Koroshiya no Blues"),
                c(214383, "ONE_SHOT", "JP", 2024, "Sakamoto Days")));
        assertThat(d.anilistId()).isEqualTo(125828L);
    }

    @Test
    void countryBreaksTiesAndYearRulesOutRemakes() {
        var tie = AniListReadingLinker.decide(Set.of("Tower of God"), "MANHWA", null, 600, List.of(
                c(1, "MANGA", "KR", 2010, "Tower of God"),
                c(2, "MANGA", "JP", 2020, "Tower of God")));
        assertThat(tie.anilistId()).isEqualTo(1L);
        var old = AniListReadingLinker.decide(Set.of("Berserk"), "MANGA", 2016, 10,
                List.of(c(30002, "MANGA", "JP", 1989, "Berserk")));
        assertThat(old.status()).isEqualTo("NONE");
    }

    @Test
    void leadingArticleDoesNotMatter() {
        var d = AniListReadingLinker.decide(Set.of("Youngest Son of the Swordmaster"), "MANHWA", null, 80,
                List.of(c(149332, "MANGA", "KR", 2022, "Geomgawui Mangnae Adeul", "The Youngest Son of the Swordmaster")));
        assertThat(d.anilistId()).isEqualTo(149332L);
    }

    @Test
    void shortGenericTitleNeedsTheYear() {
        var d = AniListReadingLinker.decide(Set.of("Gate"), "MANGA", null, 50,
                List.of(c(9, "MANGA", "JP", 2011, "Gate")));
        assertThat(d.status()).isEqualTo("AMBIGUOUS");
    }
}
