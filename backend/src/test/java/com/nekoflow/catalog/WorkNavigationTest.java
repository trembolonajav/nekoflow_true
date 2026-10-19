package com.nekoflow.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import org.junit.jupiter.api.Test;

class WorkNavigationTest {

    @Test
    void sameTitleHasDistinctCanonicalAddressByMediaAndId() {
        Work anime = work(151807, "anime", "Solo Leveling");
        Work reading = work(105398, "manhwa", "Solo Leveling");

        assertEquals("/animes/solo-leveling-151807", anime.href());
        assertEquals("/leituras/solo-leveling-105398", reading.href());
        assertNotEquals(anime.href(), reading.href());
    }

    @Test
    void slugIsAccentSafeAndKeepsStableId() {
        assertEquals("coracao-de-dragao-42", work(42, "anime", "Coração de Dragão!").slug());
    }

    private static Work work(long id, String kind, String title) {
        return new Work(id, kind, title, "", null, null, false, null, null, null, null, null);
    }
}
