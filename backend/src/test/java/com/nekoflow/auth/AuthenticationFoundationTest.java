package com.nekoflow.auth;

import static org.junit.jupiter.api.Assertions.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AuthenticationFoundationTest {
    @Test void newHashesUseArgon2idAndRemainVerifiable() {
        var encoder = new SecurityConfig().passwordEncoder();
        String raw = "uma frase senha realmente longa";
        String hash = encoder.encode(raw);
        assertTrue(hash.startsWith("{argon2}"));
        assertTrue(encoder.matches(raw, hash));
        assertFalse(hash.contains(raw));
    }

    @Test void pendingAndSuspendedAccountsCannotAuthenticate() {
        OffsetDateTime now=OffsetDateTime.now();
        var pending = new UserAccount(1, UUID.randomUUID(), "nova", "n@x.test", "Nova", "hash", Role.USER,
                AccountStatus.PENDING, null, 0, null, now);
        var suspended = new UserAccount(2, UUID.randomUUID(), "susp", "s@x.test", "Susp", "hash", Role.USER,
                AccountStatus.SUSPENDED, now, 0, null, now);
        assertFalse(NekoPrincipal.of(pending).isEnabled());
        assertFalse(NekoPrincipal.of(suspended).isEnabled());
    }

    @Test void temporaryLockIsEnforced() {
        OffsetDateTime now=OffsetDateTime.now();
        var locked = new UserAccount(3, UUID.randomUUID(), "lock", "l@x.test", "Lock", "hash", Role.USER,
                AccountStatus.ACTIVE, now, 5, now.plusMinutes(10), now);
        assertFalse(NekoPrincipal.of(locked).isAccountNonLocked());
    }
}
