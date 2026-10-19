package com.nekoflow.notification;

import com.nekoflow.common.Times;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Avisos do sininho. Cada aviso tem uma chave de evento única por usuário: processar
 * o mesmo evento duas vezes nunca gera aviso duplicado.
 */
@Service
public class NotificationService {

    private final JdbcClient jdbc;

    public NotificationService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record Notice(String category, String icon, String title, String sub, String href, String cover,
                         String eventKey) {
    }

    /** Envia para um usuário, se a preferência correspondente não estiver desligada. */
    public boolean send(long userId, Notice n, String preferenceKey) {
        return jdbc.sql("""
                INSERT INTO notification (user_id, category, icon, title, sub, href, cover, event_key)
                SELECT :u, :cat, :icon, :title, :sub, :href, :cover, :key
                WHERE COALESCE((SELECT (data ->> :pref)::boolean FROM user_preferences WHERE user_id = :u), TRUE)
                ON CONFLICT (user_id, event_key) DO NOTHING""")
                .param("u", userId).param("cat", n.category()).param("icon", n.icon()).param("title", n.title())
                .param("sub", n.sub()).param("href", n.href()).param("cover", n.cover()).param("key", n.eventKey())
                .param("pref", preferenceKey)
                .update() > 0;
    }

    /** Envia para todos que acompanham a obra. Devolve quantos avisos novos foram criados. */
    public int sendToFollowers(long workId, Notice n, String preferenceKey) {
        return jdbc.sql("""
                INSERT INTO notification (user_id, category, icon, title, sub, href, cover, event_key)
                SELECT f.user_id, :cat, :icon, :title, :sub, :href, :cover, :key
                FROM work_follow f LEFT JOIN user_preferences p ON p.user_id = f.user_id
                WHERE f.work_id = :w AND COALESCE((p.data ->> :pref)::boolean, TRUE)
                ON CONFLICT (user_id, event_key) DO NOTHING""")
                .param("w", workId).param("cat", n.category()).param("icon", n.icon()).param("title", n.title())
                .param("sub", n.sub()).param("href", n.href()).param("cover", n.cover()).param("key", n.eventKey())
                .param("pref", preferenceKey)
                .update();
    }

    public List<Map<String, Object>> list(long userId) {
        return jdbc.sql("SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100")
                .param(userId)
                .query((rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", "n" + rs.getLong("id"));
                    m.put("cat", rs.getString("category"));
                    m.put("icon", rs.getString("icon"));
                    m.put("title", rs.getString("title"));
                    m.put("sub", rs.getString("sub"));
                    m.put("when", Times.ago(rs.getObject("created_at", OffsetDateTime.class)));
                    m.put("cover", rs.getString("cover"));
                    m.put("href", rs.getString("href") == null ? "#" : rs.getString("href"));
                    m.put("read", rs.getObject("read_at") != null);
                    return m;
                }).list();
    }

    /** Marca como lida. Não altera nada além do aviso (ex.: a situação de um pedido). */
    public void markRead(long userId, long id) {
        jdbc.sql("UPDATE notification SET read_at = now() WHERE user_id = ? AND id = ? AND read_at IS NULL")
                .params(userId, id).update();
    }

    public void markAllRead(long userId) {
        jdbc.sql("UPDATE notification SET read_at = now() WHERE user_id = ? AND read_at IS NULL")
                .param(userId).update();
    }
}
