package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class HomeServiceRulesTest {

    private static final Instant NOW = Instant.parse("2026-10-24T18:00:00Z");

    @Test
    void relativeTimeReadsLikeTheDesign() {
        assertThat(HomeService.relative(NOW.minus(Duration.ofMinutes(20)), NOW)).isEqualTo("agora");
        assertThat(HomeService.relative(NOW.minus(Duration.ofHours(6)), NOW)).isEqualTo("há 6 h");
        assertThat(HomeService.relative(NOW.minus(Duration.ofHours(30)), NOW)).isEqualTo("ontem");
        assertThat(HomeService.relative(NOW.minus(Duration.ofDays(3)), NOW)).isEqualTo("há 3 dias");
        assertThat(HomeService.relative(NOW.minus(Duration.ofDays(16)), NOW)).isEqualTo("há 2 semanas");
    }

    @Test
    void heroSynopsisIsShortenedAtASentenceWithoutHtml() {
        String text = "<i>Primeira frase longa o bastante para contar.</i> Segunda frase que passa do limite do destaque.";
        assertThat(HomeService.shorten(text, 60)).isEqualTo("Primeira frase longa o bastante para contar.");
        assertThat(HomeService.shorten("curta", 60)).isEqualTo("curta");
    }
}
