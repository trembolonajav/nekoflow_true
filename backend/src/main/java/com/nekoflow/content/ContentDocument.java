package com.nekoflow.content;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Um documento de conteúdo das telas (home, obra, calendário...), guardado
 * em JSONB exatamente no formato que o frontend consome.
 */
@Entity
@Table(name = "content_document")
public class ContentDocument {

    @Id
    @Column(name = "key", length = 64)
    private String key;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    private JsonNode payload;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected ContentDocument() {
    }

    public ContentDocument(String key, JsonNode payload) {
        this.key = key;
        this.payload = payload;
        this.updatedAt = OffsetDateTime.now();
    }

    public String getKey() {
        return key;
    }

    public JsonNode getPayload() {
        return payload;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
