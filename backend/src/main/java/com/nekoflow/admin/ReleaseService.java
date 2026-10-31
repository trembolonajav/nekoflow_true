package com.nekoflow.admin;

import com.nekoflow.catalog.Work;
import com.nekoflow.catalog.WorkRepository;
import com.nekoflow.common.Times;
import com.nekoflow.notification.NotificationService;
import com.nekoflow.notification.NotificationService.Notice;
import com.nekoflow.request.RequestService;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Publicação de episódios/capítulos. A unidade existe uma única vez; o mesmo evento
 * publicado de novo não gera avisos nem registros duplicados.
 */
@Service
public class ReleaseService {

    private final JdbcClient jdbc;
    private final WorkRepository works;
    private final NotificationService notifications;
    private final RequestService requests;
    private final AuditLog audit;

    public ReleaseService(JdbcClient jdbc, WorkRepository works, NotificationService notifications,
                          RequestService requests, AuditLog audit) {
        this.jdbc = jdbc;
        this.works = works;
        this.notifications = notifications;
        this.requests = requests;
        this.audit = audit;
    }

    @Transactional
    public Map<String, Object> publish(long actorId, long workId, int unit, String unitTitle) {
        return publish(actorId, workId, unit, unitTitle, false);
    }

    @Transactional
    public Map<String, Object> publishSystem(long workId, int unit, String unitTitle) {
        return publish(null, workId, unit, unitTitle, true);
    }

    private Map<String, Object> publish(Long actorId, long workId, int unit, String unitTitle, boolean system) {
        Work w = works.require(workId);
        boolean created = jdbc.sql("""
                INSERT INTO release_event (work_id, unit, unit_title, published_by) VALUES (?, ?, ?, ?)
                ON CONFLICT (work_id, unit) DO NOTHING""")
                .params(workId, unit, unitTitle, actorId).update() > 0;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("duplicate", !created);
        if (!created) {
            m.put("notified", 0);
            return m;
        }
        works.raiseAvailableUnits(workId, unit);
        String unitLabel = (w.isAnimation() ? "Episódio " : "Capítulo ") + unit;
        Notice n = new Notice("lanc", null, w.isAnimation() ? "Novo episódio disponível" : "Novo capítulo disponível",
                w.title() + " · " + unitLabel, w.unitHref(unit), w.cover(), "release:" + workId + ":" + unit);
        int notified = notifications.sendToFollowers(workId, n, w.isAnimation() ? "nEp" : "nCh");
        int resolved = actorId == null ? 0 : requests.resolveMissingFor(workId, actorId, unitLabel + " publicado");
        if (system) {
            jdbc.sql("INSERT INTO admin_audit(actor_id,action,target,detail) VALUES (NULL,'PUBLICAR_AUTO',?,?)")
                    .params(w.title() + " · " + unitLabel, unitTitle).update();
        } else {
            audit.record(actorId, "PUBLICAR", w.title() + " · " + unitLabel, unitTitle);
        }
        m.put("notified", notified);
        m.put("requestsResolved", resolved);
        return m;
    }

    public List<Map<String, Object>> recent(int limit) {
        return jdbc.sql("""
                SELECT r.*, u.username FROM release_event r LEFT JOIN app_user u ON u.id = r.published_by
                ORDER BY r.published_at DESC LIMIT ?""")
                .param(limit)
                .query((rs, n) -> {
                    Work w = works.require(rs.getLong("work_id"));
                    OffsetDateTime at = rs.getObject("published_at", OffsetDateTime.class);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("workId", w.id());
                    m.put("title", w.title());
                    m.put("kind", w.kind());
                    m.put("cover", w.cover());
                    m.put("unit", rs.getInt("unit"));
                    m.put("unitLabel", (w.isAnimation() ? "Episódio " : "Capítulo ") + rs.getInt("unit"));
                    m.put("unitTitle", rs.getString("unit_title"));
                    m.put("by", rs.getString("username"));
                    m.put("date", Times.date(at) + " · " + Times.clock(at));
                    m.put("publishedAt", at);
                    m.put("href", w.unitHref(rs.getInt("unit")));
                    return m;
                }).list();
    }
}
