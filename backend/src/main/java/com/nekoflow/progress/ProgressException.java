package com.nekoflow.progress;

import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * Erro de domínio da biblioteca/progresso com código estável. Em conflitos, {@code current}
 * leva o estado aceito pelo servidor para o cliente reconciliar.
 */
public class ProgressException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final transient Map<String, Object> current;

    public ProgressException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public ProgressException(HttpStatus status, String code, String message, Map<String, Object> current) {
        super(message);
        this.status = status;
        this.code = code;
        this.current = current;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Map<String, Object> current() {
        return current;
    }

    static ProgressException badRequest(String code, String message) {
        return new ProgressException(HttpStatus.BAD_REQUEST, code, message);
    }

    static ProgressException notFound(String message) {
        return new ProgressException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", message);
    }

    static ProgressException conflict(String code, String message, Map<String, Object> current) {
        return new ProgressException(HttpStatus.CONFLICT, code, message, current);
    }

    static ProgressException unprocessable(String code, String message) {
        return new ProgressException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
    }
}
