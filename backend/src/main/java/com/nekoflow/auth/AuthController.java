package com.nekoflow.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /** Os mesmos nomes reservados da tela Entrar. */
    private static final Set<String> RESERVED = Set.of("admin", "nekoflow", "suporte", "moderador", "marina");

    private final AuthenticationManager authManager;
    private final SecurityContextRepository contextRepository;
    private final UserRepository users;
    private final PasswordEncoder encoder;

    public AuthController(AuthenticationManager authManager, SecurityContextRepository contextRepository,
                          UserRepository users, PasswordEncoder encoder) {
        this.authManager = authManager;
        this.contextRepository = contextRepository;
        this.users = users;
        this.encoder = encoder;
    }

    public record LoginRequest(@NotBlank String login, @NotBlank String password) {
    }

    public record RegisterRequest(
            @NotBlank @Pattern(regexp = "^[a-zA-Z0-9_.]{3,20}$") String username,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 128) String password) {
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        NekoPrincipal p = CurrentUser.orNull();
        if (p == null) {
            return Map.of("authenticated", false);
        }
        return users.findById(p.id()).map(AuthController::view).orElse(Map.of("authenticated", false));
    }

    @GetMapping("/username-available")
    public Map<String, Object> usernameAvailable(@RequestParam String u) {
        String n = u.trim().toLowerCase();
        boolean ok = n.matches("^[a-z0-9_.]{3,20}$") && !RESERVED.contains(n) && !users.usernameTaken(n);
        return Map.of("available", ok);
    }

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest body, HttpServletRequest req,
                                     HttpServletResponse res) {
        Authentication auth;
        try {
            auth = authManager.authenticate(new UsernamePasswordAuthenticationToken(body.login(), body.password()));
        } catch (AuthenticationException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciais inválidas");
        }
        startSession(auth, req, res);
        return view(users.findById(((NekoPrincipal) auth.getPrincipal()).id()).orElseThrow());
    }

    @PostMapping("/register")
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest body, HttpServletRequest req,
                                        HttpServletResponse res) {
        String username = body.username().toLowerCase();
        if (RESERVED.contains(username) || users.usernameTaken(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "username");
        }
        if (users.emailTaken(body.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "email");
        }
        long id = users.create(username, body.email(), username, encoder.encode(body.password()), Role.USER);
        UserAccount u = users.findById(id).orElseThrow();
        NekoPrincipal p = NekoPrincipal.of(u);
        startSession(new UsernamePasswordAuthenticationToken(p, null, p.getAuthorities()), req, res);
        return view(u);
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest req) {
        HttpSession s = req.getSession(false);
        if (s != null) {
            s.invalidate();
        }
        SecurityContextHolder.clearContext();
        return Map.of("authenticated", false);
    }

    private void startSession(Authentication auth, HttpServletRequest req, HttpServletResponse res) {
        HttpSession old = req.getSession(false);
        if (old != null) {
            old.invalidate(); // nunca reaproveita a sessão de outra conta
        }
        req.getSession(true);
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(auth);
        SecurityContextHolder.setContext(ctx);
        contextRepository.saveContext(ctx, req, res);
    }

    /** Dados de um usuário para o painel administrativo. */
    public static Map<String, Object> publicView(UserAccount u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.id());
        m.put("username", u.username());
        m.put("name", u.displayName());
        m.put("email", u.email());
        m.put("role", u.role().name());
        m.put("since", com.nekoflow.common.Times.date(u.createdAt()));
        return m;
    }

    static Map<String, Object> view(UserAccount u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("authenticated", true);
        m.put("id", u.id());
        m.put("username", u.username());
        m.put("name", u.displayName());
        m.put("email", u.email());
        m.put("role", u.role().name());
        m.put("initial", u.initial());
        m.put("staff", u.role().atLeast(Role.MODERATOR));
        return m;
    }
}
