package com.nekoflow.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/me")
public class AccountController {
    private final UserRepository users; private final PasswordEncoder encoder; private final JdbcClient jdbc;
    public AccountController(UserRepository users, PasswordEncoder encoder, JdbcClient jdbc) {
        this.users=users; this.encoder=encoder; this.jdbc=jdbc;
    }
    public record ProfilePatch(@NotBlank @Size(max=60) String displayName) {}
    public record PasswordChange(@NotBlank String currentPassword, @NotBlank @Size(min=15,max=128) String newPassword) {}

    @GetMapping
    public Map<String,Object> me() { return AuthController.view(users.findById(CurrentUser.id()).orElseThrow()); }

    @PatchMapping
    public Map<String,Object> update(@Valid @RequestBody ProfilePatch body) {
        users.updateDisplayName(CurrentUser.id(), body.displayName().trim());
        return AuthController.view(users.findById(CurrentUser.id()).orElseThrow());
    }

    @PostMapping("/change-password")
    @Transactional
    public Map<String,Object> changePassword(@Valid @RequestBody PasswordChange body, HttpServletRequest req) {
        UserAccount u=users.findById(CurrentUser.id()).orElseThrow();
        if(!encoder.matches(body.currentPassword(),u.passwordHash())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Senha atual incorreta");
        users.updatePassword(u.id(),encoder.encode(body.newPassword()));
        String current=req.getSession().getId();
        jdbc.sql("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME=? AND SESSION_ID<>?").params(u.username(),current).update();
        jdbc.sql("INSERT INTO security_audit_event(user_id,event_type,remote_address) VALUES (?, 'PASSWORD_CHANGED', ?)").params(u.id(),req.getRemoteAddr()).update();
        return Map.of("changed",true);
    }

    @GetMapping("/sessions")
    public List<Map<String,Object>> sessions(HttpServletRequest req) {
        String current=req.getSession().getId();
        return jdbc.sql("SELECT SESSION_ID,LAST_ACCESS_TIME,EXPIRY_TIME FROM SPRING_SESSION WHERE PRINCIPAL_NAME=? ORDER BY LAST_ACCESS_TIME DESC")
                .param(CurrentUser.get().username()).query((rs,n)->Map.<String,Object>of(
                    "id",handle(rs.getString(1)), "current",current.equals(rs.getString(1)),
                    "lastAccess",java.time.Instant.ofEpochMilli(rs.getLong(2)).toString(),
                    "expiresAt",java.time.Instant.ofEpochMilli(rs.getLong(3)).toString())).list();
    }

    @DeleteMapping("/sessions/{handle}")
    public Map<String,Object> revoke(@PathVariable String handle, HttpServletRequest req) {
        String current=req.getSession().getId();
        var ids=jdbc.sql("SELECT SESSION_ID FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?").param(CurrentUser.get().username()).query(String.class).list();
        String target=ids.stream().filter(id->handle(id).equals(handle)).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(current.equals(target)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Use Sair para encerrar esta sessão");
        jdbc.sql("DELETE FROM SPRING_SESSION WHERE SESSION_ID=? AND PRINCIPAL_NAME=?").params(target,CurrentUser.get().username()).update();
        return Map.of("revoked",true);
    }

    private static String handle(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))).substring(0,24); }
        catch(Exception e){ throw new IllegalStateException(e); }
    }
}
