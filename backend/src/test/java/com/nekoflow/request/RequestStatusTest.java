package com.nekoflow.request;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RequestStatusTest {

    @Test
    void approvedIsNotPublished() {
        // Aprovada ainda pode ser programada ou atendida, e não encerra o pedido.
        assertThat(RequestStatus.APROVADA.isOpen()).isTrue();
        assertThat(RequestStatus.APROVADA.next()).contains(RequestStatus.PROGRAMADA, RequestStatus.ATENDIDA);
    }

    @Test
    void cannotJumpFromReceivedToAttended() {
        assertThat(RequestStatus.RECEBIDA.next()).doesNotContain(RequestStatus.ATENDIDA);
    }

    @Test
    void closedStatusesAreFinal() {
        for (RequestStatus s : new RequestStatus[]{RequestStatus.ATENDIDA, RequestStatus.NAO_ATENDIDA,
                RequestStatus.CANCELADA}) {
            assertThat(s.isOpen()).isFalse();
            assertThat(s.next()).isEmpty();
        }
    }

    @Test
    void requesterCanOnlyEditBeforeDecision() {
        assertThat(RequestStatus.EM_ANALISE.editableByRequester()).isTrue();
        assertThat(RequestStatus.APROVADA.editableByRequester()).isFalse();
    }

    @Test
    void onlyAddRequestsMayLackAWork() {
        assertThat(RequestKind.ADD.needsWork()).isFalse();
        assertThat(RequestKind.MISSING.needsWork()).isTrue();
        assertThat(RequestKind.DUB.needsWork()).isTrue();
    }
}
