package com.nekoflow.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Provisionamento deliberado: só executa quando o operador fornece as três variáveis. */
@Component
@ConditionalOnProperty(name="nekoflow.bootstrap-admin.enabled", havingValue="true")
public class AdminProvisioner implements ApplicationRunner {
    private final UserRepository users; private final PasswordEncoder encoder;
    @Value("${nekoflow.bootstrap-admin.username:}") String username;
    @Value("${nekoflow.bootstrap-admin.email:}") String email;
    @Value("${nekoflow.bootstrap-admin.password:}") String password;
    public AdminProvisioner(UserRepository users, PasswordEncoder encoder) { this.users=users; this.encoder=encoder; }
    public void run(ApplicationArguments args) {
        if(username.isBlank() || email.isBlank() || password.length()<15) throw new IllegalStateException("Bootstrap admin requer username, email e senha com 15+ caracteres");
        if(users.findByLogin(email).isPresent() || users.findByLogin(username).isPresent()) return;
        users.create(username.trim().toLowerCase(), email.trim(), "Equipe NekoFlow", encoder.encode(password), Role.ADMIN, AccountStatus.ACTIVE);
    }
}
