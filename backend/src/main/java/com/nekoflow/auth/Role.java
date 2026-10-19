package com.nekoflow.auth;

import java.util.Arrays;
import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** Papéis em ordem crescente: cada um herda as permissões dos anteriores. */
public enum Role {
    USER, MODERATOR, EDITOR, ADMIN;

    public List<SimpleGrantedAuthority> authorities() {
        return Arrays.stream(values())
                .filter(r -> r.ordinal() <= ordinal())
                .map(r -> new SimpleGrantedAuthority("ROLE_" + r.name()))
                .toList();
    }

    public boolean atLeast(Role other) {
        return ordinal() >= other.ordinal();
    }
}
