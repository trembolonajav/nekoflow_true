package com.nekoflow.request;

import java.util.Arrays;

/** Tipos de pedido. Só "Adicionar ao catálogo" pode existir sem uma obra do catálogo. */
public enum RequestKind {
    ADD("Adicionar ao catálogo"),
    MISSING("Episódios ou capítulos faltando"),
    DUB("Dublagem ou tradução"),
    FIX("Corrigir informações");

    public final String label;

    RequestKind(String label) {
        this.label = label;
    }

    public boolean needsWork() {
        return this != ADD;
    }

    public static RequestKind fromLabelOrCode(String s) {
        return Arrays.stream(values()).filter(k -> k.name().equalsIgnoreCase(s) || k.label.equalsIgnoreCase(s))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("tipo de pedido inválido"));
    }
}
