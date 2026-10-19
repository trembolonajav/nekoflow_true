package com.nekoflow.auth;

import java.time.OffsetDateTime;
import java.util.UUID;

public record UserAccount(
        long id,
        UUID publicId,
        String username,
        String email,
        String displayName,
        String passwordHash,
        Role role,
        AccountStatus status,
        OffsetDateTime emailVerifiedAt,
        int failedLoginAttempts,
        OffsetDateTime lockedUntil,
        OffsetDateTime createdAt) {

    public UserAccount(long id, String username, String email, String displayName, String passwordHash,
                       Role role, OffsetDateTime createdAt) {
        this(id, new UUID(0, id), username, email, displayName, passwordHash, role, AccountStatus.ACTIVE,
                createdAt, 0, null, createdAt);
    }

    /** Inicial usada no avatar. */
    public String initial() {
        return displayName.isBlank() ? "?" : displayName.substring(0, 1).toUpperCase();
    }

    public boolean emailVerified() { return emailVerifiedAt != null; }
}
