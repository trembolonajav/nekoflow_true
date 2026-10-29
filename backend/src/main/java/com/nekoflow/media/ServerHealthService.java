package com.nekoflow.media;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Saúde dos servidores pelo uso real do player. Embed é iframe: não dá para saber se o vídeo
 * tocou, mas dá para ver quando a pessoa desiste dele. Conta como falha trocar para outro
 * servidor da mesma versão (dublado → dublado); trocar de versão é escolha de idioma.
 *
 * Host ruim desce na lista de servidores de todo episódio; link específico com várias
 * desistências ou reports vai para o fim e vira pendência no painel (some sozinha quando melhora).
 */
@Service
public class ServerHealthService {

    static final int MIN_SESSIONS = 10;
    private static final String UUID_RE = "^[0-9a-fA-F-]{36}$";
    private static final Pattern HOST = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*://(?:www\\.)?([^/:?#]+)");
    private static final Logger log = LoggerFactory.getLogger(ServerHealthService.class);

    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private volatile Map<String, String> hosts = Map.of();
    private volatile Set<UUID> suspects = Set.of();
    private volatile boolean loaded;

    public ServerHealthService(JdbcClient jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    // ---------------------------------------------------------------- regras

    static String status(int sessions, int away, int reports) {
        if (sessions < MIN_SESSIONS) return reports >= 3 ? "bad" : "unknown";
        double rate = (double) away / sessions;
        if (rate >= 0.5 || reports >= Math.max(3, sessions * 0.15)) return "bad";
        if (rate >= 0.25) return "warn";
        return "good";
    }

    static boolean suspect(int sessions, int away, int reports) {
        return (away >= 2 && away >= 0.6 * sessions) || reports >= 2;
    }

    /** 0 bom/sem dados, 1 instável, 2 ruim, 3 link suspeito. Menor vem antes no player. */
    static int rank(String hostStatus, boolean suspectLink) {
        if (suspectLink) return 3;
        return "bad".equals(hostStatus) ? 2 : "warn".equals(hostStatus) ? 1 : 0;
    }

    static String host(String url) {
        if (url == null) return null;
        Matcher m = HOST.matcher(url);
        return m.find() ? m.group(1).toLowerCase(Locale.ROOT) : null;
    }

    // ---------------------------------------------------------------- consulta (player)

    public Map<String, Object> of(UUID sourceId, String url) {
        if (!loaded) reload();
        boolean bad = suspects.contains(sourceId);
        String status = hosts.getOrDefault(host(url), "unknown");
        return Map.of("status", bad ? "suspect" : status, "rank", rank(status, bad));
    }

    // ---------------------------------------------------------------- cálculo

    record SourceStat(UUID id, String host, String label, String work, String episode, int sessions, int away,
                      int reports, Timestamp lastEvidence) {}

    @Scheduled(initialDelay = 2, fixedDelay = 10, timeUnit = TimeUnit.MINUTES)
    public void refresh() {
        try {
            tx.executeWithoutResult(st -> recompute());
        } catch (RuntimeException e) {
            log.warn("Saúde dos servidores: cálculo falhou ({})", e.getMessage());
        }
        reload();
    }

    private void recompute() {
        List<SourceStat> stats = jdbc.sql("""
                WITH ev AS (
                    SELECT session_id, occurred_at, type, data FROM analytics_event
                    WHERE type IN ('player_open','server_switch') AND occurred_at >= now() - interval '7 days'
                ), used AS (
                    SELECT (data->>'sourceId')::uuid AS sid, session_id FROM ev
                    WHERE type='player_open' AND data->>'sourceId' ~ :re
                    UNION ALL
                    SELECT (data->>'toId')::uuid, session_id FROM ev WHERE type='server_switch' AND data->>'toId' ~ :re
                ), gaveup AS (
                    SELECT (data->>'fromId')::uuid AS sid, session_id, occurred_at FROM ev
                    WHERE type='server_switch' AND data->>'fromId' ~ :re AND data->>'fromVersion' = data->>'version'
                ), rep AS (
                    SELECT episode_source_id AS sid, count(*) AS n, max(created_at) AS at FROM media_issue_report
                    WHERE episode_source_id IS NOT NULL AND status='OPEN' AND created_at >= now() - interval '30 days'
                      AND category IN ('VIDEO_NOT_LOADING','WRONG_EPISODE','WRONG_AUDIO')
                    GROUP BY 1
                ), ids AS (SELECT sid FROM used UNION SELECT sid FROM gaveup UNION SELECT sid FROM rep)
                SELECT s.id, nk_host(s.source_url) AS host, COALESCE(s.label, s.provider) AS label,
                       w.title AS work, e.display_number AS episode,
                       (SELECT count(DISTINCT session_id) FROM used u WHERE u.sid=s.id) AS sessions,
                       (SELECT count(DISTINCT session_id) FROM gaveup g WHERE g.sid=s.id) AS away,
                       COALESCE(r.n, 0) AS reports,
                       GREATEST((SELECT max(occurred_at) FROM gaveup g WHERE g.sid=s.id), r.at) AS last_evidence
                FROM ids JOIN episode_source s ON s.id=ids.sid
                JOIN episode e ON e.id=s.episode_id JOIN season se ON se.id=e.season_id JOIN work w ON w.id=se.work_id
                LEFT JOIN rep r ON r.sid=s.id""")
                .param("re", UUID_RE)
                .query((rs, n) -> new SourceStat(rs.getObject("id", UUID.class), rs.getString("host"), rs.getString("label"),
                        rs.getString("work"), rs.getString("episode"), rs.getInt("sessions"), rs.getInt("away"),
                        rs.getInt("reports"), rs.getTimestamp("last_evidence")))
                .list();

        jdbc.sql("DELETE FROM source_health").update();
        Map<String, int[]> byHost = new HashMap<>();
        Set<String> openKeys = new HashSet<>();
        for (SourceStat s : stats) {
            boolean bad = suspect(s.sessions(), s.away(), s.reports());
            jdbc.sql("""
                    INSERT INTO source_health(episode_source_id, sessions, away, reports, suspect, last_evidence_at)
                    VALUES (?, ?, ?, ?, ?, ?)""")
                    .params(s.id(), s.sessions(), s.away(), s.reports(), bad, s.lastEvidence()).update();
            if (s.host() != null) {
                int[] h = byHost.computeIfAbsent(s.host(), k -> new int[3]);
                h[0] += s.sessions();
                h[1] += s.away();
                h[2] += s.reports();
            }
            if (bad) {
                String key = "source:" + s.id();
                openKeys.add(key);
                task(key, s);
            }
        }
        jdbc.sql("DELETE FROM server_health").update();
        byHost.forEach((host, h) -> jdbc.sql("""
                INSERT INTO server_health(host, sessions, away, reports, status) VALUES (?, ?, ?, ?, ?)""")
                .params(host, h[0], h[1], h[2], status(h[0], h[1], h[2])).update());
        // Link que voltou a funcionar: a pendência automática some sozinha.
        String stale = """
                UPDATE admin_task SET status='resolved', resolved_at=now()
                WHERE origin='auto' AND kind='Servidor' AND status='open' AND task_key LIKE 'source:%'""";
        if (openKeys.isEmpty()) jdbc.sql(stale).update();
        else jdbc.sql(stale + " AND task_key NOT IN (:keys)").param("keys", List.copyOf(openKeys)).update();
    }

    /** Pendência do link; reabre se houver evidência nova depois de alguém marcar como resolvida. */
    private void task(String key, SourceStat s) {
        String title = "Link possivelmente quebrado: " + s.work() + " · Ep. " + s.episode();
        String detail = s.label() + " (" + s.host() + ") · " + s.away() + " de " + s.sessions()
                + " sessões trocaram de servidor na mesma versão" + (s.reports() > 0 ? " · " + s.reports() + " reports" : "");
        jdbc.sql("""
                INSERT INTO admin_task(task_key, origin, priority, kind, title, detail)
                VALUES (:key, 'auto', 'med', 'Servidor', :title, :detail)
                ON CONFLICT (task_key) DO UPDATE SET status='open', title=EXCLUDED.title, detail=EXCLUDED.detail,
                    resolved_at=NULL, resolved_by=NULL
                WHERE admin_task.status='open'
                   OR (CAST(:evidence AS timestamptz) IS NOT NULL AND admin_task.resolved_at < CAST(:evidence AS timestamptz))""")
                .param("key", key).param("title", clip(title, 300)).param("detail", clip(detail, 600))
                .param("evidence", s.lastEvidence()).update();
    }

    private void reload() {
        Map<String, String> h = new HashMap<>();
        jdbc.sql("SELECT host, status FROM server_health").query((rs, n) -> h.put(rs.getString(1), rs.getString(2))).list();
        Set<UUID> sus = new HashSet<>(jdbc.sql("SELECT episode_source_id FROM source_health WHERE suspect")
                .query(UUID.class).list());
        hosts = Map.copyOf(h);
        suspects = Set.copyOf(sus);
        loaded = true;
    }

    // ---------------------------------------------------------------- painel

    /** Hosts com fontes ativas: quantos episódios servem, uso medido e situação. */
    public List<Map<String, Object>> panel() {
        List<Map<String, Object>> out = new ArrayList<>();
        jdbc.sql("""
                SELECT nk_host(s.source_url) AS host, count(*) AS links,
                       mode() WITHIN GROUP (ORDER BY COALESCE(s.label, s.provider)) AS label,
                       string_agg(DISTINCT s.provider, ' · ') AS providers,
                       COALESCE(max(h.sessions),0) AS sessions, COALESCE(max(h.away),0) AS away,
                       COALESCE(max(h.reports),0) AS reports, COALESCE(max(h.status),'unknown') AS status,
                       count(*) FILTER (WHERE sh.suspect) AS suspects
                FROM episode_source s
                LEFT JOIN server_health h ON h.host=nk_host(s.source_url)
                LEFT JOIN source_health sh ON sh.episode_source_id=s.id
                WHERE s.enabled GROUP BY 1 ORDER BY count(*) DESC LIMIT 40""")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("host", rs.getString("host"));
                    m.put("label", rs.getString("label"));
                    m.put("providers", rs.getString("providers"));
                    m.put("links", rs.getLong("links"));
                    m.put("sessions", rs.getInt("sessions"));
                    m.put("away", rs.getInt("away"));
                    m.put("reports", rs.getInt("reports"));
                    m.put("status", rs.getString("status"));
                    m.put("suspects", rs.getLong("suspects"));
                    return out.add(m);
                }).list();
        return out;
    }

    private static String clip(String v, int max) {
        return v == null || v.length() <= max ? v : v.substring(0, max);
    }
}
