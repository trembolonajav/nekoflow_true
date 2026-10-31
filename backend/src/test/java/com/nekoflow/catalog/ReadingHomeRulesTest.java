package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReadingHomeRulesTest {

    private static final Instant NOW = Instant.parse("2026-10-29T15:00:00Z"); // quinta-feira

    @Test
    void manhwaThemesComeFromStrongAniListTags() throws Exception {
        var snapshot = new ObjectMapper().readTree("""
                {"tags":[{"name":"Martial Arts","rank":85},{"name":"Time Manipulation","rank":70},
                         {"name":"Dungeon","rank":20},{"name":"Historical","rank":60,"isMediaSpoiler":true}]}""");
        assertThat(ReadingHomeService.themes(snapshot)).containsExactlyInAnyOrder("murim", "regressao");
    }

    @Test
    void webtoonDayIsTheUsualWeekdayOfRecentChapters() {
        // Três capítulos às quartas, um numa sexta: sai na quarta.
        assertThat(ReadingHomeService.weekday(chapters("2026-10-28T12:00:00Z", "2026-10-21T12:00:00Z",
                "2026-10-14T12:00:00Z", "2026-10-09T12:00:00Z"), NOW)).isEqualTo("qua");
        // Datas espalhadas ou poucas: sem dia fixo.
        assertThat(ReadingHomeService.weekday(chapters("2026-10-28T12:00:00Z", "2026-10-23T12:00:00Z"), NOW)).isNull();
        // Capítulos antigos não definem o dia de hoje.
        assertThat(ReadingHomeService.weekday(chapters("2025-01-01T12:00:00Z", "2025-01-08T12:00:00Z",
                "2025-01-15T12:00:00Z"), NOW)).isNull();
    }

    private static List<ReadingHomeService.Chapter> chapters(String... dates) {
        List<ReadingHomeService.Chapter> out = new ArrayList<>();
        for (int i = 0; i < dates.length; i++) out.add(new ReadingHomeService.Chapter(String.valueOf(100 - i), Instant.parse(dates[i])));
        return out;
    }
}
