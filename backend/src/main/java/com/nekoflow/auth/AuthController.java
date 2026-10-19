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
import java.time.Duration;
import java.time.OffsetDateTime;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.transaction.annotation.Transactional;
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
    private final SecurityTokenService tokens;
    private final AuthMailService mail;
    private final JdbcClient jdbc;

    public AuthController(AuthenticationManager authManager, SecurityContextRepository contextRepository,
                          UserRepository users, PasswordEncoder encoder, SecurityTokenService tokens,
                          AuthMailService mail, JdbcClient jdbc) {
        this.authManager = authManager;
        this.contextRepository = contextRepository;
        this.users = users;
        this.encoder = encoder;
        this.tokens = tokens;
        this.mail = mail;
        this.jdbc = jdbc;
    }

    public record LoginRequest(@NotBlank String login, @NotBlank String password) {
    }

    public record RegisterRequest(
            @NotBlank @Pattern(regexp = "^[a-zA-Z0-9_.]{3,20}$") String username,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 15, max = 128) String password) {
    }

    public record TokenRequest(@NotBlank String token) {}
    public record EmailRequest(@NotBlank @Email String email) {}
    public record ResetRequest(@NotBlank String token, @NotBlank @Size(min=15, max=128) String password) {}

    @GetMapping("/csrf")
    public Map<String, Object> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
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
        var candidate = users.findByLogin(body.login());
        if (candidate.isPresent() && candidate.get().lockedUntil() != null
                && candidate.get().lockedUntil().isAfter(OffsetDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Tente novamente em alguns minutos");
        }
        try {
            auth = authManager.authenticate(new UsernamePasswordAuthenticationToken(body.login(), body.password()));
        } catch (AuthenticationException e) {
            candidate.ifPresent(u -> users.loginFailed(u.id()));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Credenciais inválidas");
        }
        users.loginSucceeded(((NekoPrincipal) auth.getPrincipal()).id());
        audit(((NekoPrincipal) auth.getPrincipal()).id(), "LOGIN", req, null);
        startSession(auth, req, res);
        return view(users.findById(((NekoPrincipal) auth.getPrincipal()).id()).orElseThrow());
    }

    @PostMapping("/register")
    @Transactional
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest body, HttpServletRequest req,
                                        HttpServletResponse res) {
        String username = body.username().toLowerCase();
        if (RESERVED.contains(username) || users.usernameTaken(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "username");
        }
        if (users.emailTaken(body.email())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Não foi possível criar a conta");
        long id = users.create(username, body.email(), username, encoder.encode(body.password()), Role.USER, AccountStatus.PENDING);
        UserAccount u = users.findById(id).orElseThrow();
        jdbc.sql("INSERT INTO user_profile(user_id) VALUES (?) ON CONFLICT DO NOTHING").param(id).update();
        jdbc.sql("INSERT INTO user_role(user_id, role) VALUES (?, 'USER') ON CONFLICT DO NOTHING").param(id).update();
        String token = tokens.issue("email_verification_token", id, Duration.ofHours(24));
        mail.sendVerification(u.email(), u.username(), token);
        audit(id, "REGISTERED", req, null);
        return Map.of("registered", true, "pendingVerification", true, "email", u.email());
    }

    @PostMapping("/verify-email")
    @Transactional
    public Map<String,Object> verify(@Valid @RequestBody TokenRequest body, HttpServletRequest req) {
        long id = tokens.consume("email_verification_token", body.token());
        users.activate(id); audit(id, "EMAIL_VERIFIED", req, null);
        return Map.of("verified", true);
    }

    @PostMapping("/resend-verification")
    public Map<String,Object> resend(@Valid @RequestBody EmailRequest body) {
        users.findByLogin(body.email()).filter(u -> u.status() == AccountStatus.PENDING).ifPresent(u -> {
            String token = tokens.issue("email_verification_token", u.id(), Duration.ofHours(24));
            mail.sendVerification(u.email(), u.username(), token);
        });
        return Map.of("accepted", true);
    }

    @PostMapping("/forgot-password")
    public Map<String,Object> forgot(@Valid @RequestBody EmailRequest body) {
        users.findByLogin(body.email()).filter(u -> u.status() == AccountStatus.ACTIVE).ifPresent(u -> {
            String token = tokens.issue("password_reset_token", u.id(), Duration.ofMinutes(30));
            mail.sendPasswordReset(u.email(), u.username(), token);
        });
        return Map.of("accepted", true);
    }

    @PostMapping("/reset-password")
    @Transactional
    public Map<String,Object> reset(@Valid @RequestBody ResetRequest body, HttpServletRequest req) {
        long id = tokens.consume("password_reset_token", body.token());
        UserAccount u = users.findById(id).orElseThrow();
        users.updatePassword(id, encoder.encode(body.password()));
        jdbc.sql("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?").param(u.username()).update();
        jdbc.sql("UPDATE password_reset_token SET used_at=now() WHERE user_id=? AND used_at IS NULL").param(id).update();
        mail.sendPasswordChanged(u.email(), u.username()); audit(id, "PASSWORD_RESET", req, null);
        return Map.of("reset", true);
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

    private void audit(Long userId, String type, HttpServletRequest req, String detail) {
        jdbc.sql("INSERT INTO security_audit_event(user_id,event_type,remote_address,detail) VALUES (?,?,?,?)")
                .params(userId, type, req.getRemoteAddr(), detail).update();
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
        m.put("publicId", u.publicId());
        m.put("username", u.username());
        m.put("name", u.displayName());
        m.put("email", u.email());
        m.put("role", u.role().name());
        m.put("status", u.status().name());
        m.put("emailVerified", u.emailVerified());
        m.put("since", com.nekoflow.common.Times.date(u.createdAt()));
        return m;
    }

    static Map<String, Object> view(UserAccount u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("authenticated", true);
        m.put("id", u.id());
        m.put("publicId", u.publicId());
        m.put("username", u.username());
        m.put("name", u.displayName());
        m.put("email", u.email());
        m.put("role", u.role().name());
        m.put("initial", u.initial());
        m.put("staff", u.role().atLeast(Role.MODERATOR));
        m.put("emailVerified", u.emailVerified());
        return m;
    }
}
