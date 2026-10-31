package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class WorkPresentationRulesTest {

    @Test
    void technicalImportTitlesBecomeEpisodeNumbers() {
        assertThat(WorkPresentationService.episodeTitle("T1 EP01", "1")).isEqualTo("Episódio 1");
        assertThat(WorkPresentationService.episodeTitle("Episódio 3", "3")).isEqualTo("Episódio 3");
        assertThat(WorkPresentationService.episodeTitle(null, "4")).isEqualTo("Episódio 4");
        assertThat(WorkPresentationService.episodeTitle("O Cavaleiro Pesado Exilado", "1"))
                .isEqualTo("O Cavaleiro Pesado Exilado");
    }

    @Test
    void anilistCodesBecomePortugueseLabels() {
        assertThat(WorkPresentationService.formatLabel("TV", "ANIMATION")).isEqualTo("Série de TV");
        assertThat(WorkPresentationService.formatLabel(null, "READING")).isEqualTo("Mangá");
        assertThat(WorkPresentationService.statusLabel("RELEASING", null)).isEqualTo("Em lançamento");
        assertThat(WorkPresentationService.statusLabel(null, "COMPLETED")).isEqualTo("Concluído");
        assertThat(WorkPresentationService.statusLabel(null, null)).isEqualTo("Situação a confirmar");
        assertThat(WorkPresentationService.countryLabel("KR")).isEqualTo("Coreia do Sul");
        assertThat(WorkPresentationService.GENRES.get("Action")).isEqualTo("Ação");
    }

    @Test
    void synopsisSplitsIntoParagraphsAndMissingPartsStayEmpty() {
        assertThat(WorkPresentationService.paragraphs("Primeiro.\n\nSegundo\ncontinua.")).containsExactly(
                "Primeiro.", "Segundo continua.");
        assertThat(WorkPresentationService.paragraphs(null)).isEmpty();
        assertThat(WorkPresentationService.join(" · ", "Anime", null, "", "2026")).isEqualTo("Anime · 2026");
        assertThat(WorkPresentationService.join(" · ", (Object) null)).isNull();
    }

    @Test
    void anilistVoiceLanguagesBecomeShortCodes() {
        assertThat(WorkPresentationService.voiceLanguage("Japanese")).isEqualTo("ja");
        assertThat(WorkPresentationService.voiceLanguage("Portuguese")).isEqualTo("pt-BR");
        assertThat(WorkPresentationService.voiceLanguage("English")).isEqualTo("en");
        assertThat(WorkPresentationService.voiceLanguage("Spanish")).isEqualTo("es");
        assertThat(WorkPresentationService.voiceLanguage("")).isNull();
    }
}
