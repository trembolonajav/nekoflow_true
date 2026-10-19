package com.nekoflow.library;

import static org.assertj.core.api.Assertions.assertThat;

import com.nekoflow.catalog.Work;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

/** Regras de retomada de "Continuar assistindo/lendo". */
class ResumeRuleTest {

    private static Work anime(Integer total, Integer available) {
        return new Work(1, "anime", "X", "", null, null, false, null, total, available, "Em lançamento", null);
    }

    private static LibraryService.Progress p(int unit, int pos, boolean done) {
        return new LibraryService.Progress(1, unit, pos, 1440, done ? 100 : pos * 100.0 / 1440, done,
                OffsetDateTime.now());
    }

    @Test
    void interruptedResumesSavedPosition() {
        var r = LibraryService.resume(anime(12, 12), p(4, 754, false));
        assertThat(r.unit()).isEqualTo(4);
        assertThat(r.positionSec()).isEqualTo(754);
        assertThat(r.upToDate()).isFalse();
    }

    @Test
    void finishedOffersNextAvailable() {
        var r = LibraryService.resume(anime(12, 12), p(4, 1440, true));
        assertThat(r.unit()).isEqualTo(5);
        assertThat(r.positionSec()).isZero();
    }

    @Test
    void lastAvailableIsUpToDateEvenIfSeriesContinues() {
        var r = LibraryService.resume(anime(24, 8), p(8, 1440, true));
        assertThat(r.upToDate()).isTrue();
        assertThat(r.unit()).isEqualTo(8);
    }

    @Test
    void noProgressStartsAtOne() {
        var r = LibraryService.resume(anime(12, 12), null);
        assertThat(r.unit()).isEqualTo(1);
        assertThat(r.upToDate()).isFalse();
    }
}
