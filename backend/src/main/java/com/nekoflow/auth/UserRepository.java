package com.nekoflow.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

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
        return create(username, email, displayName, passwordHash, role, AccountStatus.ACTIVE);
    }

    @Transactional
    public long create(String username, String email, String displayName, String passwordHash, Role role, AccountStatus status) {
        long id = jdbc.sql("""
                INSERT INTO app_user (username, email, display_name, password_hash, role, status, email_verified_at)
                VALUES (:u, lower(:e), :d, :p, :r, :s, CASE WHEN :s = 'ACTIVE' THEN now() ELSE NULL END) RETURNING id""")
                .param("u", username.toLowerCase())
                .param("e", email.trim())
                .param("d", displayName)
                .param("p", passwordHash)
                .param("r", role.name())
                .param("s", status.name())
                .query(Long.class).single();
        jdbc.sql("INSERT INTO user_profile(user_id) VALUES (?) ON CONFLICT DO NOTHING").param(id).update();
        jdbc.sql("INSERT INTO user_role(user_id, role) VALUES (?, ?) ON CONFLICT DO NOTHING").params(id, role.name()).update();
        return id;
    }

    public void activate(long id) {
        jdbc.sql("UPDATE app_user SET status='ACTIVE', email_verified_at=now(), updated_at=now() WHERE id=?")
                .param(id).update();
    }

    public void updatePassword(long id, String hash) {
        jdbc.sql("UPDATE app_user SET password_hash=?, failed_login_attempts=0, locked_until=NULL, updated_at=now() WHERE id=?")
                .params(hash, id).update();
    }

    public void updateDisplayName(long id, String name) {
        jdbc.sql("UPDATE app_user SET display_name=?, updated_at=now() WHERE id=?").params(name, id).update();
    }

    public void loginSucceeded(long id) {
        jdbc.sql("UPDATE app_user SET failed_login_attempts=0, locked_until=NULL WHERE id=?").param(id).update();
    }

    public void loginFailed(long id) {
        jdbc.sql("""
            UPDATE app_user SET failed_login_attempts=failed_login_attempts+1,
            locked_until=CASE WHEN failed_login_attempts+1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
            WHERE id=?""").param(id).update();
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
        jdbc.sql("UPDATE app_user SET role = ?, updated_at=now() WHERE id = ?").params(role.name(), id).update();
        jdbc.sql("DELETE FROM user_role WHERE user_id=?").param(id).update();
        jdbc.sql("INSERT INTO user_role(user_id, role) VALUES (?, ?)").params(id, role.name()).update();
    }

    static UserAccount map(ResultSet rs, int n) throws SQLException {
        return new UserAccount(
                rs.getLong("id"),
                rs.getObject("public_id", java.util.UUID.class),
                rs.getString("username"),
                rs.getString("email"),
                rs.getString("display_name"),
                rs.getString("password_hash"),
                Role.valueOf(rs.getString("role")),
                AccountStatus.valueOf(rs.getString("status")),
                rs.getObject("email_verified_at", OffsetDateTime.class),
                rs.getInt("failed_login_attempts"),
                rs.getObject("locked_until", OffsetDateTime.class),
                rs.getObject("created_at", OffsetDateTime.class));
    }
}
