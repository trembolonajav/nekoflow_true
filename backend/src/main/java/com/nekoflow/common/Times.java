package com.nekoflow.common;

import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

/** Rótulos de data/hora no formato usado nas telas (fuso de Brasília). */
public final class Times {

    public static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    private static final Locale PT = Locale.forLanguageTag("pt-BR");
    private static final String[] MONTHS = {"jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out",
            "nov", "dez"};

    private Times() {
    }

    /** "Hoje", "Ontem", "há 3 dias", "12 out". */
    public static String day(OffsetDateTime t) {
        long days = ChronoUnit.DAYS.between(t.atZoneSameInstant(ZONE).toLocalDate(), LocalDate.now(ZONE));
        if (days <= 0) {
            return "Hoje";
        }
        if (days == 1) {
            return "Ontem";
        }
        if (days < 7) {
            return "há " + days + " dias";
        }
        LocalDate d = t.atZoneSameInstant(ZONE).toLocalDate();
        return d.getDayOfMonth() + " " + MONTHS[d.getMonthValue() - 1];
    }

    /** "há 10 min", "há 2 h", "ontem", "há 3 dias". */
    public static String ago(OffsetDateTime t) {
        Duration d = Duration.between(t, OffsetDateTime.now());
        long min = Math.max(0, d.toMinutes());
        if (min < 1) {
            return "agora";
        }
        if (min < 60) {
            return "há " + min + " min";
        }
        if (min < 24 * 60) {
            return "há " + (min / 60) + " h";
        }
        long days = ChronoUnit.DAYS.between(t.atZoneSameInstant(ZONE).toLocalDate(), LocalDate.now(ZONE));
        return days <= 1 ? "ontem" : "há " + days + " dias";
    }

    /** "14 out 2026". */
    public static String date(OffsetDateTime t) {
        LocalDate d = t.atZoneSameInstant(ZONE).toLocalDate();
        return d.getDayOfMonth() + " " + MONTHS[d.getMonthValue() - 1] + " " + d.getYear();
    }

    /** "18:42". */
    public static String clock(OffsetDateTime t) {
        return t.atZoneSameInstant(ZONE).format(DateTimeFormatter.ofPattern("HH:mm", PT));
    }

    /** "12:34" a partir de segundos. */
    public static String mmss(Integer sec) {
        if (sec == null) {
            return null;
        }
        return String.format("%02d:%02d", sec / 60, sec % 60);
    }
}
