package com.nekoflow.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class AdminPanelRulesTest {

    private static final Instant NOW = Instant.parse("2026-10-26T21:00:00Z"); // 18:00 em Brasília

    @Test
    void todayStartsAtMidnightInBrasilia() {
        assertThat(AdminPanelService.start("hoje", NOW)).isEqualTo(Instant.parse("2026-10-26T03:00:00Z"));
        assertThat(AdminPanelService.start("7d", NOW)).isEqualTo(NOW.minus(Duration.ofDays(7)));
    }

    @Test
    void timesReadLikeTheDesign() {
        assertThat(AdminPanelService.when(NOW.minus(Duration.ofMinutes(30)), NOW, true)).isEqualTo("Hoje 17:30");
        assertThat(AdminPanelService.when(NOW.minus(Duration.ofHours(24)), NOW, false)).isEqualTo("Ontem 18:00");
        assertThat(AdminPanelService.age(NOW.minus(Duration.ofMinutes(12)), NOW)).isEqualTo("12 min");
        assertThat(AdminPanelService.age(NOW.minus(Duration.ofDays(2)), NOW)).isEqualTo("2 d");
        assertThat(AdminPanelService.ago(NOW.minus(Duration.ofHours(2)), NOW)).isEqualTo("há 2 h");
    }

    @Test
    void workKindAndPeopleLabels() {
        assertThat(AdminPanelService.kindLabel("anime", "ANIMATION", "ONGOING", "Em lançamento")).isEqualTo("Anime · em lançamento");
        assertThat(AdminPanelService.kindLabel("anime", "ANIMATION", "COMPLETED", "Concluído")).isEqualTo("Anime · completo");
        assertThat(AdminPanelService.kindLabel("manhwa", "READING", "ONGOING", null)).isEqualTo("Manhwa · leitura");
        assertThat(AdminPanelService.initials("Marina Alves")).isEqualTo("MA");
        assertThat(AdminPanelService.initials("nekoflow")).isEqualTo("NE");
        assertThat(AdminPanelService.roleName("MODERATOR")).isEqualTo("moderador");
        assertThat(AdminPanelService.pageName("/animes/frieren")).isEqualTo("uma obra");
    }

    @Test
    void eventFieldsAreReadFromStoredJson() {
        String json = "{\"q\": \"frieren \\\"dublado\\\"\", \"results\": 0, \"provider\":\"ZokoAnime\"}";
        assertThat(AdminPanelService.field(json, "q")).isEqualTo("frieren \"dublado\"");
        assertThat(AdminPanelService.field(json, "results")).isEqualTo("0");
        assertThat(AdminPanelService.field(json, "provider")).isEqualTo("ZokoAnime");
        assertThat(AdminPanelService.field(json, "missing")).isNull();
    }
}
