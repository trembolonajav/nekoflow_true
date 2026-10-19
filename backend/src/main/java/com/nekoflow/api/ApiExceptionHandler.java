package com.nekoflow.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, Object>> responseStatus(ResponseStatusException exception,
                                                        HttpServletRequest request) {
        HttpStatus status = HttpStatus.valueOf(exception.getStatusCode().value());
        String message = exception.getReason() == null || exception.getReason().isBlank()
                ? defaultMessage(status)
                : exception.getReason();
        return ResponseEntity.status(status).body(ApiErrors.body(status, ApiErrors.code(status), message, request));
    }

    @ExceptionHandler(com.nekoflow.progress.ProgressException.class)
    ResponseEntity<Map<String, Object>> progress(com.nekoflow.progress.ProgressException exception,
                                                 HttpServletRequest request) {
        Map<String, Object> body = ApiErrors.body(exception.status(), exception.code(), exception.getMessage(), request);
        if (exception.current() != null) {
            body.put("current", exception.current());
        }
        return ResponseEntity.status(exception.status()).body(body);
    }

    /** Corpo ilegível, UUID/número inválido na URL ou parâmetro obrigatório ausente: 400, nunca 500. */
    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class})
    ResponseEntity<Map<String, Object>> badInput(Exception exception, HttpServletRequest request) {
        String message = exception instanceof org.springframework.web.bind.MissingServletRequestParameterException m
                ? "Parâmetro obrigatório ausente: " + m.getParameterName() + "."
                : exception instanceof org.springframework.web.method.annotation.MethodArgumentTypeMismatchException t
                ? "Valor inválido para " + t.getName() + "."
                : "Os dados enviados são inválidos.";
        return ResponseEntity.badRequest()
                .body(ApiErrors.body(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message, request));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, Object>> validation(MethodArgumentNotValidException exception,
                                                    HttpServletRequest request) {
        FieldError field = exception.getBindingResult().getFieldErrors().stream().findFirst().orElse(null);
        String message = field == null ? "Os dados enviados são inválidos."
                : "Campo inválido: " + field.getField() + ".";
        return ResponseEntity.badRequest()
                .body(ApiErrors.body(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", message, request));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, Object>> unexpected(Exception exception, HttpServletRequest request) {
        LOG.error("Unexpected API failure for {} {} (requestId={})", request.getMethod(), request.getRequestURI(),
                request.getAttribute("requestId"), exception);
        return ResponseEntity.internalServerError().body(ApiErrors.body(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Não foi possível concluir a operação.",
                request));
    }

    private static String defaultMessage(HttpStatus status) {
        return switch (status) {
            case UNAUTHORIZED -> "Entre na sua conta para continuar.";
            case FORBIDDEN -> "Você não tem permissão para realizar esta operação.";
            case NOT_FOUND -> "Conteúdo não encontrado.";
            default -> "Não foi possível concluir a operação.";
        };
    }
}
