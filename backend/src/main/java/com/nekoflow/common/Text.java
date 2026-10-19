package com.nekoflow.common;

import java.text.Normalizer;
import java.util.Locale;

public final class Text {

    private Text() {
    }

    /** Minúsculas, sem acentos e pontuação, espaços únicos — usado para comparar títulos. */
    public static String norm(String s) {
        if (s == null) {
            return "";
        }
        String n = Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replaceAll("[^\\p{L}\\p{N} ]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return n;
    }
}
