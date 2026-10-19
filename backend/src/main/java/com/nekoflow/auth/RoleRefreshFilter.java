package com.nekoflow.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Relê o papel do usuário a cada requisição: uma mudança de permissão (ou conta
 * removida) vale imediatamente, sem esperar a sessão expirar.
 */
public class RoleRefreshFilter extends OncePerRequestFilter {

    private final UserRepository users;
    private final SecurityContextRepository repository;

    public RoleRefreshFilter(UserRepository users, SecurityContextRepository repository) {
        this.users = users;
        this.repository = repository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        NekoPrincipal p = CurrentUser.orNull();
        if (p != null) {
            var current = users.findById(p.id());
            if (current.isEmpty()) {
                SecurityContextHolder.clearContext();
                var s = req.getSession(false);
                if (s != null) {
                    s.invalidate();
                }
            } else if (current.get().role() != p.role()) {
                NekoPrincipal np = NekoPrincipal.of(current.get());
                SecurityContext ctx = SecurityContextHolder.createEmptyContext();
                ctx.setAuthentication(new UsernamePasswordAuthenticationToken(np, null, np.getAuthorities()));
                SecurityContextHolder.setContext(ctx);
                repository.saveContext(ctx, req, res);
            }
        }
        chain.doFilter(req, res);
    }
}
