package com.nekoflow.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

public final class ApiErrors {

    private ApiErrors() {
    }

    public static Map<String, Object> body(HttpStatus status, String code, String message,
                                           HttpServletRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        body.put("requestId", RequestIdFilter.current(request));
        body.put("status", status.value());
        return body;
    }

    public static String code(HttpStatus status) {
        return switch (status) {
            case BAD_REQUEST -> "INVALID_REQUEST";
            case UNAUTHORIZED -> "AUTHENTICATION_REQUIRED";
            case FORBIDDEN -> "ACCESS_DENIED";
            case NOT_FOUND -> "RESOURCE_NOT_FOUND";
            case CONFLICT -> "RESOURCE_CONFLICT";
            case TOO_MANY_REQUESTS -> "RATE_LIMIT_EXCEEDED";
            default -> status.is5xxServerError() ? "INTERNAL_ERROR" : "REQUEST_FAILED";
        };
    }
}
