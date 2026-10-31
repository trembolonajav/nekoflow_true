package com.nekoflow.auth;

import java.util.Collection;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** Usuário autenticado guardado na sessão. */
public record NekoPrincipal(long id, String username, String passwordHash, Role role, boolean enabled,
                            boolean accountNonLocked) implements UserDetails {

    public NekoPrincipal(long id, String username, String passwordHash, Role role) {
        this(id, username, passwordHash, role, true, true);
    }

    static NekoPrincipal of(UserAccount u) {
        return new NekoPrincipal(u.id(), u.username(), u.passwordHash(), u.role(),
                u.status() == AccountStatus.ACTIVE, u.lockedUntil() == null || u.lockedUntil().isBefore(java.time.OffsetDateTime.now()));
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return role.authorities();
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override public boolean isEnabled() { return enabled; }
    @Override public boolean isAccountNonLocked() { return accountNonLocked; }
}
