package com.nekoflow.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

    private final JdbcClient jdbc;

    public UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserAccount> findById(long id) {
        return jdbc.sql("SELECT * FROM app_user WHERE id = ?").param(id).query(UserRepository::map).optional();
    }

    /** Busca por e-mail ou nome de usuário (sem diferenciar maiúsculas). */
    public Optional<UserAccount> findByLogin(String login) {
        return jdbc.sql("SELECT * FROM app_user WHERE lower(email) = lower(:l) OR lower(username) = lower(:l)")
                .param("l", login.trim())
                .query(UserRepository::map)
                .optional();
    }

    public boolean usernameTaken(String username) {
        return jdbc.sql("SELECT count(*) FROM app_user WHERE lower(username) = lower(?)")
                .param(username).query(Long.class).single() > 0;
    }

    public boolean emailTaken(String email) {
        return jdbc.sql("SELECT count(*) FROM app_user WHERE lower(email) = lower(?)")
                .param(email).query(Long.class).single() > 0;
    }

    public long create(String username, String email, String displayName, String passwordHash, Role role) {
        return jdbc.sql("""
                INSERT INTO app_user (username, email, display_name, password_hash, role)
                VALUES (:u, lower(:e), :d, :p, :r) RETURNING id""")
                .param("u", username.toLowerCase())
                .param("e", email.trim())
                .param("d", displayName)
                .param("p", passwordHash)
                .param("r", role.name())
                .query(Long.class).single();
    }

    public List<UserAccount> list(String q) {
        return jdbc.sql("""
                SELECT * FROM app_user
                WHERE :q = '' OR username ILIKE '%' || :q || '%' OR email ILIKE '%' || :q || '%'
                ORDER BY id LIMIT 100""")
                .param("q", q == null ? "" : q.trim())
                .query(UserRepository::map).list();
    }

    public void setRole(long id, Role role) {
        jdbc.sql("UPDATE app_user SET role = ? WHERE id = ?").params(role.name(), id).update();
    }

    static UserAccount map(ResultSet rs, int n) throws SQLException {
        return new UserAccount(
                rs.getLong("id"),
                rs.getString("username"),
                rs.getString("email"),
                rs.getString("display_name"),
                rs.getString("password_hash"),
                Role.valueOf(rs.getString("role")),
                rs.getObject("created_at", OffsetDateTime.class));
    }
}
