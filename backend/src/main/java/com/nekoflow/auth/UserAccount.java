package com.nekoflow.auth;

import java.time.OffsetDateTime;

public record UserAccount(
        long id,
        String username,
        String email,
        String displayName,
        String passwordHash,
        Role role,
        OffsetDateTime createdAt) {

    /** Inicial usada no avatar. */
    public String initial() {
        return displayName.isBlank() ? "?" : displayName.substring(0, 1).toUpperCase();
    }
}
