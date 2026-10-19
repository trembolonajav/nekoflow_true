package com.nekoflow.admin;

import com.nekoflow.common.Times;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Registro administrativo: quem fez, o quê, em quê e quando. */
@Component
public class AuditLog {

    private final JdbcClient jdbc;

    public AuditLog(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void record(long actorId, String action, String target, String detail) {
        jdbc.sql("INSERT INTO admin_audit (actor_id, action, target, detail) VALUES (?, ?, ?, ?)")
                .params(actorId, action, target, detail).update();
    }

    public List<Map<String, Object>> recent() {
        return jdbc.sql("""
                SELECT a.*, u.username FROM admin_audit a LEFT JOIN app_user u ON u.id = a.actor_id
                ORDER BY a.created_at DESC, a.id DESC LIMIT 200""")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("by", rs.getString("username"));
                    m.put("action", rs.getString("action"));
                    m.put("target", rs.getString("target"));
                    m.put("detail", rs.getString("detail"));
                    OffsetDateTime at = rs.getObject("created_at", OffsetDateTime.class);
                    m.put("date", Times.date(at) + " · " + Times.clock(at));
                    return m;
                }).list();
    }
}
