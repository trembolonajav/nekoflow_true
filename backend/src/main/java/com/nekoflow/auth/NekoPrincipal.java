package com.nekoflow.auth;

import java.util.Collection;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** Usuário autenticado guardado na sessão. */
public record NekoPrincipal(long id, String username, String passwordHash, Role role) implements UserDetails {

    static NekoPrincipal of(UserAccount u) {
        return new NekoPrincipal(u.id(), u.username(), u.passwordHash(), u.role());
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
}
