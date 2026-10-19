package com.nekoflow.library;

import java.util.Arrays;

/** Situação da obra na biblioteca. Favorito e alertas não são situações. */
public enum LibraryStatus {
    ANDAMENTO("andamento"), PLANEJADO("planejado"), CONCLUIDO("concluido"), PAUSADO("pausado"),
    ABANDONADO("abandonado");

    public final String code;

    LibraryStatus(String code) {
        this.code = code;
    }

    public static LibraryStatus of(String code) {
        return Arrays.stream(values()).filter(s -> s.code.equals(code)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("situação inválida: " + code));
    }
}
