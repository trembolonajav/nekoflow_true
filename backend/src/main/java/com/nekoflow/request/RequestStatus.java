package com.nekoflow.request;

import java.util.EnumSet;
import java.util.Set;

/** Situações de uma solicitação. "Aprovada" não significa publicada. */
public enum RequestStatus {
    RECEBIDA("Recebida"),
    EM_ANALISE("Em análise"),
    AGUARDANDO("Aguardando disponibilidade"),
    APROVADA("Aprovada"),
    PROGRAMADA("Programada"),
    ATENDIDA("Atendida"),
    NAO_ATENDIDA("Não atendida"),
    CANCELADA("Cancelada");

    public final String label;

    RequestStatus(String label) {
        this.label = label;
    }

    public boolean isOpen() {
        return this != ATENDIDA && this != NAO_ATENDIDA && this != CANCELADA;
    }

    /** O solicitante ainda pode complementar ou cancelar. */
    public boolean editableByRequester() {
        return this == RECEBIDA || this == EM_ANALISE || this == AGUARDANDO;
    }

    public Set<RequestStatus> next() {
        return switch (this) {
            case RECEBIDA -> EnumSet.of(EM_ANALISE, AGUARDANDO, APROVADA, NAO_ATENDIDA, CANCELADA);
            case EM_ANALISE -> EnumSet.of(AGUARDANDO, APROVADA, NAO_ATENDIDA, CANCELADA);
            case AGUARDANDO -> EnumSet.of(EM_ANALISE, APROVADA, NAO_ATENDIDA, CANCELADA);
            case APROVADA -> EnumSet.of(PROGRAMADA, ATENDIDA, CANCELADA);
            case PROGRAMADA -> EnumSet.of(ATENDIDA, CANCELADA);
            default -> EnumSet.noneOf(RequestStatus.class);
        };
    }
}
