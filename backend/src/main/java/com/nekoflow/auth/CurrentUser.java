package com.nekoflow.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

public final class CurrentUser {

    private CurrentUser() {
    }

    public static NekoPrincipal get() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a != null && a.getPrincipal() instanceof NekoPrincipal p) {
            return p;
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
    }

    public static long id() {
        return get().id();
    }

    public static NekoPrincipal orNull() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a != null && a.getPrincipal() instanceof NekoPrincipal p ? p : null;
    }
}
