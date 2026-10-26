package com.nekoflow.admin;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dados do painel administrativo (design Admin.dc.html) vindos do banco: presença, eventos de
 * audiência, sincronização, pendências e atividade por usuário. Nada de número inventado: o que
 * ainda não foi medido aparece zerado.
 */
@Service
public class AdminPanelService {

    static final ZoneId BRT = ZoneId.of("America/Sao_Paulo");
    private static final Locale PT = Locale.forLanguageTag("pt-BR");
    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DM = DateTimeFormatter.ofPattern("dd/MM");
    private static final String ONLINE = "now() - interval '90 seconds'";
    private static final int HEARTBEAT_SECONDS = 30;

    private final JdbcClient jdbc;
    private final long syncIntervalMs;

    public AdminPanelService(JdbcClient jdbc, @Value("${nekoflow.hianime.sync-interval-ms:900000}") long syncIntervalMs) {
        this.jdbc = jdbc;
        this.syncIntervalMs = syncIntervalMs;
    }

    public Map<String, Object> panel(String period) {
        Instant now = Instant.now();
        Instant from = start(period, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("period", period);
        out.put("online", online());
        out.put("kpis", kpis(period, from, now));
        out.put("bars", bars(period, from, now));
        out.put("top", top(from));
        out.put("servers", servers(from));
        out.put("misses", misses(from));
        out.put("runs", runs(now));
        out.put("providers", providers(now));
        out.put("pend", pendencies(now));
        out.put("users", users(now));
        return out;
    }

    static Instant start(String period, Instant now) {
        return switch (period) {
            case "7d" -> now.minus(Duration.ofDays(7));
            case "30d" -> now.minus(Duration.ofDays(30));
            default -> now.atZone(BRT).toLocalDate().atStartOfDay(BRT).toInstant();
        };
    }

    // ---- Visão geral --------------------------------------------------------------------------

    private Map<String, Object> online() {
        Map<String, Object> out = new LinkedHashMap<>(Map.of("total", 0L, "browse", 0L, "player", 0L, "read", 0L));
        jdbc.sql("SELECT state, count(*) FROM analytics_session WHERE last_seen_at > " + ONLINE + " GROUP BY state")
                .query((rs, n) -> out.put(rs.getString(1), rs.getLong(2))).list();
        out.put("total", (long) out.get("browse") + (long) out.get("player") + (long) out.get("read"));
        return out;
    }

    private long count(String type, Instant from, Instant to) {
        return jdbc.sql("SELECT count(*) FROM analytics_event WHERE type=? AND occurred_at>=? AND occurred_at<?")
                .params(type, ts(from), ts(to)).query(Long.class).single();
    }

    private Map<String, Object> kpis(String period, Instant from, Instant now) {
        long players = count("player_open", from, now);
        long playersBefore = "hoje".equals(period)
                ? count("player_open", from.minus(Duration.ofDays(1)), now.minus(Duration.ofDays(1))) : -1;
        long playerBeats = jdbc.sql("""
                SELECT count(*) FROM analytics_event WHERE type='heartbeat' AND occurred_at>=?
                  AND data->>'state'='player' AND (data->>'visible')::boolean""")
                .param(ts(from)).query(Long.class).single();
        long active = jdbc.sql("""
                SELECT count(DISTINCT COALESCE(user_id::text, session_id::text)) FROM analytics_event
                WHERE occurred_at>=?""").param(ts(from)).query(Long.class).single();
        long signups = jdbc.sql("SELECT count(*) FROM app_user WHERE created_at>=?").param(ts(from)).query(Long.class).single();
        long switches = count("server_switch", from, now);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("players", players);
        out.put("playersBefore", playersBefore);
        out.put("playerHours", playerBeats * HEARTBEAT_SECONDS / 3600.0);
        out.put("activeUsers", active);
        out.put("signups", signups);
        out.put("switchRate", players == 0 ? 0.0 : switches * 100.0 / players);
        return out;
    }

    /** Pessoas distintas por hora (hoje) ou por dia (7/30 dias), separadas entre player e navegação. */
    private List<Map<String, Object>> bars(String period, Instant from, Instant now) {
        boolean hourly = "hoje".equals(period);
        String bucket = hourly
                ? "extract(hour from occurred_at AT TIME ZONE 'America/Sao_Paulo')::int"
                : "(occurred_at AT TIME ZONE 'America/Sao_Paulo')::date - CAST(:start AS date)";
        Map<Integer, long[]> rows = new HashMap<>();
        LocalDate startDay = from.atZone(BRT).toLocalDate();
        jdbc.sql("SELECT " + bucket + " AS b,"
                        + " count(DISTINCT session_id) FILTER (WHERE data->>'state'='player') AS play,"
                        + " count(DISTINCT session_id) FILTER (WHERE data->>'state'<>'player') AS browse"
                        + " FROM analytics_event WHERE type='heartbeat' AND occurred_at>=:from GROUP BY 1")
                .param("from", ts(from)).param("start", startDay)
                .query((rs, n) -> rows.put(rs.getInt("b"), new long[]{rs.getLong("play"), rs.getLong("browse")}))
                .list();
        int size = hourly ? 24 : (int) Duration.between(from, now).toDays() + 1;
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            long[] v = rows.getOrDefault(i, new long[2]);
            LocalDate day = startDay.plusDays(i);
            out.add(Map.of("play", v[0], "browse", v[1],
                    "tip", hourly ? String.format("%02dh", i) : day.format(DM),
                    "label", hourly ? String.format("%02dh", i)
                            : size <= 8 ? day.getDayOfWeek().getDisplayName(TextStyle.SHORT, PT).replace(".", "")
                            : String.valueOf(day.getDayOfMonth())));
        }
        return out;
    }

    private List<Map<String, Object>> top(Instant from) {
        return jdbc.sql("""
                SELECT w.id, w.title, w.kind, w.media_family, w.story_status, w.airing_status, q.*
                FROM (SELECT work_id,
                        count(*) FILTER (WHERE type='impression') AS imp,
                        count(*) FILTER (WHERE type='click') AS clk,
                        count(*) FILTER (WHERE type IN ('player_open','chapter_open')) AS plays,
                        count(*) FILTER (WHERE type='next_click') AS nexts
                      FROM analytics_event
                      WHERE occurred_at>=? AND work_id IS NOT NULL
                        AND type IN ('impression','click','player_open','chapter_open','next_click')
                      GROUP BY work_id) q
                JOIN work w ON w.id=q.work_id
                ORDER BY q.imp DESC, q.plays DESC, q.clk DESC LIMIT 6""")
                .param(ts(from))
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("name", rs.getString("title"));
                    m.put("kind", kindLabel(rs.getString("kind"), rs.getString("media_family"),
                            rs.getString("story_status"), rs.getString("airing_status")));
                    m.put("imp", rs.getLong("imp"));
                    m.put("clk", rs.getLong("clk"));
                    m.put("plays", rs.getLong("plays"));
                    m.put("nexts", rs.getLong("nexts"));
                    return m;
                }).list();
    }

    static String kindLabel(String kind, String family, String story, String airing) {
        if ("READING".equals(family)) {
            return switch (kind == null ? "" : kind) {
                case "manhwa" -> "Manhwa · leitura";
                case "webtoon" -> "Webtoon · leitura";
                default -> "Mangá · leitura";
            };
        }
        String base = "filme".equals(kind) ? "Filme" : "Anime";
        if ("COMPLETED".equals(story)) return base + " · completo";
        if ("ONGOING".equals(story) || "Em lançamento".equals(airing)) return base + " · em lançamento";
        return base;
    }

    /** Saúde dos servidores pela taxa de troca: quem troca saindo de um provedor sinaliza problema nele. */
    private List<Map<String, Object>> servers(Instant from) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT p, sum(uses) AS uses, sum(away) AS away, string_agg(DISTINCT v, ' · ') AS versions FROM (
                  SELECT data->>'provider' AS p, 1 AS uses, 0 AS away, data->>'version' AS v
                    FROM analytics_event WHERE type='player_open' AND occurred_at>=:from
                  UNION ALL SELECT data->>'to', 1, 0, data->>'version'
                    FROM analytics_event WHERE type='server_switch' AND occurred_at>=:from
                  UNION ALL SELECT data->>'from', 0, 1, NULL
                    FROM analytics_event WHERE type='server_switch' AND occurred_at>=:from) x
                WHERE p IS NOT NULL GROUP BY p ORDER BY sum(uses) DESC LIMIT 6""")
                .param("from", ts(from))
                .query((rs, n) -> {
                    long uses = rs.getLong("uses");
                    double rate = uses == 0 ? 0 : rs.getLong("away") * 100.0 / uses;
                    out.put(rs.getString("p"), Map.of("name", rs.getString("p"),
                            "sub", rs.getString("versions") == null ? "Sem versão informada" : rs.getString("versions"),
                            "rate", rate, "uses", uses));
                    return 0;
                }).list();
        return new ArrayList<>(out.values());
    }

    private List<Map<String, Object>> misses(Instant from) {
        return jdbc.sql("""
                SELECT lower(trim(data->>'q')) AS q, count(*) AS n FROM analytics_event
                WHERE type='search' AND occurred_at>=? AND (data->>'results')::int = 0
                  AND length(trim(data->>'q')) >= 2
                GROUP BY 1 ORDER BY n DESC, q LIMIT 5""")
                .param(ts(from))
                .query((rs, n) -> Map.<String, Object>of("q", rs.getString("q"), "n", rs.getLong("n"))).list();
    }

    // ---- Integrações ------------------------------------------------------------------------

    private List<Map<String, Object>> runs(Instant now) {
        List<Map<String, Object>> runs = jdbc.sql("""
                SELECT id, trigger_type, status, error_message, created_at, started_at, finished_at
                FROM hianime_sync_run ORDER BY created_at DESC LIMIT 7""")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getString("id"));
                    m.put("when", when(rs.getTimestamp("created_at").toInstant(), now, true));
                    m.put("trigger", "MANUAL".equalsIgnoreCase(rs.getString("trigger_type")) ? "manual" : "auto");
                    Timestamp s = rs.getTimestamp("started_at");
                    Timestamp f = rs.getTimestamp("finished_at");
                    m.put("dur", s != null && f != null ? Duration.between(s.toInstant(), f.toInstant()).toSeconds() + " s" : "—");
                    m.put("status", rs.getString("status"));
                    m.put("error", rs.getString("error_message"));
                    return m;
                }).list();
        for (Map<String, Object> run : runs) {
            run.put("items", jdbc.sql("""
                    SELECT COALESCE(w.title, i.title) AS anime, i.episode_number, i.is_new, i.outcome
                    FROM hianime_sync_run_item i LEFT JOIN work w ON w.id=i.work_id
                    WHERE i.run_id=CAST(? AS uuid) ORDER BY i.id""")
                    .param(run.get("id"))
                    .query((rs, n) -> {
                        String ep = "Ep. " + number(rs.getBigDecimal("episode_number"));
                        if (!rs.getBoolean("is_new")) ep += " · revalidado";
                        String outcome = rs.getString("outcome");
                        return Map.<String, Object>of("anime", rs.getString("anime"), "ep", ep,
                                "res", "PUBLISHED".equals(outcome) ? "pub" : "FAILED".equals(outcome) ? "fail" : "review");
                    }).list());
        }
        return runs;
    }

    private Map<String, Object> providers(Instant now) {
        List<Map<String, Object>> out = new ArrayList<>();
        var last = jdbc.sql("SELECT created_at, status FROM hianime_sync_run ORDER BY created_at DESC LIMIT 1")
                .query((rs, n) -> new Object[]{rs.getTimestamp(1).toInstant(), rs.getString(2)}).optional();
        var lastAuto = jdbc.sql("SELECT created_at FROM hianime_sync_run WHERE trigger_type<>'MANUAL' ORDER BY created_at DESC LIMIT 1")
                .query(Timestamp.class).optional();
        long watched = jdbc.sql("SELECT count(*) FROM hianime_sync_work WHERE enabled").query(Long.class).single();
        String health = jdbc.sql("SELECT status FROM hianime_provider_health ORDER BY checked_at DESC LIMIT 1")
                .query(String.class).optional().orElse(null);
        long minutes = Math.max(1, syncIntervalMs / 60000);
        boolean ok = health == null || Set.of("OK", "UP", "HEALTHY").contains(health.toUpperCase(Locale.ROOT));
        out.add(Map.of("name", "HiAnime", "role", "Episódios e embeds",
                "meta", "A cada " + minutes + " min · última " + last.map(r -> when((Instant) r[0], now, false)).orElse("—")
                        + " · " + watched + " obras monitoradas",
                "ok", ok));
        var anilist = jdbc.sql("SELECT max(fetched_at), count(*) FROM work_anilist_snapshot")
                .query((rs, n) -> new Object[]{rs.getTimestamp(1), rs.getLong(2)}).single();
        out.add(Map.of("name", "AniList", "role", "Fichas, imagens, temporada, relações",
                "meta", "A cada 30 min · última " + (anilist[0] == null ? "—" : when(((Timestamp) anilist[0]).toInstant(), now, false))
                        + " · " + anilist[1] + " fichas",
                "ok", true));
        long chapters = jdbc.sql("SELECT count(*) FROM chapter").query(Long.class).single();
        out.add(Map.of("name", "Leitura", "role", "Capítulos de mangá, manhwa e webtoon",
                "meta", "Sem provedor conectado · cadastro manual · " + chapters + " capítulos", "ok", false, "idle", true));
        boolean running = last.map(r -> "RUNNING".equals(r[1]) || "QUEUED".equals(r[1])).orElse(false);
        String next = lastAuto.map(t -> t.toInstant().plusMillis(syncIntervalMs).atZone(BRT).format(HM)).orElse("—");
        return Map.of("list", out, "running", running, "next", next);
    }

    // ---- Pendências -------------------------------------------------------------------------

    private List<Map<String, Object>> pendencies(Instant now) {
        Set<String> resolved = Set.copyOf(jdbc.sql("SELECT task_key FROM admin_task WHERE status='resolved' AND task_key IS NOT NULL")
                .query(String.class).list());
        List<Map<String, Object>> out = new ArrayList<>();
        jdbc.sql("""
                SELECT c.id, c.episode_number, c.reason, c.discovered_at, COALESCE(w.title, c.title) AS work
                FROM hianime_sync_candidate c LEFT JOIN work w ON w.id=c.work_id
                WHERE c.status NOT IN ('PUBLISHED','IGNORED') ORDER BY c.discovered_at DESC LIMIT 30""")
                .query((rs, n) -> out.add(item("sync:" + rs.getString("id"), "crit",
                        "Episódio " + number(rs.getBigDecimal("episode_number")) + " de " + rs.getString("work") + " aguardando revisão",
                        rs.getString("reason"), "Sincronização", "auto", rs.getTimestamp("discovered_at"), now,
                        "Revisar", "/admin/operacao?aba=sync"))).list();
        jdbc.sql("""
                SELECT r.episode_id, count(*) AS n, string_agg(DISTINCT r.category, ', ') AS cats, max(r.created_at) AS at,
                       w.title, e.display_number
                FROM media_issue_report r JOIN episode e ON e.id=r.episode_id
                JOIN season s ON s.id=e.season_id JOIN work w ON w.id=s.work_id
                WHERE r.status IS NULL OR r.status NOT IN ('RESOLVED','DISMISSED','RESOLVIDO','DESCARTADO')
                GROUP BY r.episode_id, w.title, e.display_number ORDER BY max(r.created_at) DESC LIMIT 20""")
                .query((rs, n) -> out.add(item("issue:" + rs.getString("episode_id"), rs.getLong("n") > 1 ? "crit" : "med",
                        rs.getString("title") + " ep. " + rs.getString("display_number") + " com problema reportado",
                        rs.getLong("n") + " report(s) · " + rs.getString("cats"), "Fontes", "auto",
                        rs.getTimestamp("at"), now, "Abrir episódio", "/player?episode=" + rs.getString("episode_id")))).list();
        // Legenda PT-BR com buracos: a obra tem episódios com PT-BR, mas não em todos.
        jdbc.sql("""
                SELECT w.id, w.title, w.slug, w.media_family, count(*) AS avail,
                       count(*) FILTER (WHERE pt) AS pt, max(updated) AS at FROM (
                  SELECT s.work_id, bool_or(es.language='pt-BR' OR es.audio_language='pt-BR') AS pt,
                         max(es.created_at) AS updated
                  FROM episode e JOIN season s ON s.id=e.season_id JOIN episode_source es ON es.episode_id=e.id
                  WHERE es.enabled AND s.visibility='PUBLISHED' GROUP BY s.work_id, e.id) x
                JOIN work w ON w.id=x.work_id WHERE w.visibility='PUBLISHED'
                GROUP BY w.id HAVING count(*) FILTER (WHERE pt) BETWEEN 1 AND count(*)-1
                ORDER BY max(updated) DESC LIMIT 10""")
                .query((rs, n) -> {
                    long missing = rs.getLong("avail") - rs.getLong("pt");
                    return out.add(item("subs:" + rs.getLong("id") + ":" + missing, "med",
                            rs.getString("title") + " sem legenda PT-BR em " + missing + (missing > 1 ? " episódios" : " episódio"),
                            rs.getLong("pt") + " de " + rs.getLong("avail") + " episódios já têm PT-BR", "Legendas", "auto",
                            rs.getTimestamp("at"), now, "Abrir obra", workPath(rs.getString("media_family"), rs.getString("slug"))));
                }).list();
        jdbc.sql("""
                SELECT r.id, r.title, r.created_at, r.status, (SELECT count(*) FROM request_supporter s WHERE s.request_id=r.id) AS fans,
                       u.username FROM content_request r LEFT JOIN app_user u ON u.id=r.user_id
                WHERE r.status NOT IN ('ATENDIDA','NAO_ATENDIDA','RECUSADA','CANCELADA') ORDER BY r.created_at DESC LIMIT 20""")
                .query((rs, n) -> out.add(item("req:" + rs.getLong("id"), "med", "Pedido: " + rs.getString("title"),
                        Math.max(1, rs.getLong("fans")) + " usuário(s) pediram · aberta por @" + rs.getString("username"),
                        "Solicitações", "auto", rs.getTimestamp("created_at"), now, "Responder", "/solicitacoes/" + rs.getLong("id")))).list();
        jdbc.sql("""
                SELECT lower(trim(data->>'q')) AS q, count(*) AS n, max(occurred_at) AS at FROM analytics_event
                WHERE type='search' AND occurred_at > now() - interval '7 days' AND (data->>'results')::int = 0
                  AND length(trim(data->>'q')) >= 2
                GROUP BY 1 HAVING count(*) >= 3 ORDER BY n DESC LIMIT 10""")
                .query((rs, n) -> out.add(item("search:" + rs.getString("q"), "med", "Buscado sem resultado: \"" + rs.getString("q") + "\"",
                        rs.getLong("n") + " buscas nos últimos 7 dias", "Catálogo", "auto", rs.getTimestamp("at"), now,
                        "Abrir busca", "/explorar?q=" + rs.getString("q")))).list();
        long englishOnly = jdbc.sql("""
                SELECT count(*) FROM work w WHERE w.visibility='PUBLISHED'
                  AND EXISTS(SELECT 1 FROM work_translation t WHERE t.work_id=w.id AND t.language='en')
                  AND NOT EXISTS(SELECT 1 FROM work_translation t WHERE t.work_id=w.id AND t.language='pt-BR')""")
                .query(Long.class).single();
        if (englishOnly > 0) {
            out.add(item("syn-en:" + englishOnly, "low", "Sinopse só em inglês: " + englishOnly + " obras",
                    "Vieram do AniList sem tradução", "Catálogo", "auto", null, now, "Ver lista", "/explorar"));
        }
        jdbc.sql("""
                SELECT id, task_key, priority, kind, title, detail, origin, created_at FROM admin_task
                WHERE status='open' ORDER BY created_at DESC LIMIT 50""")
                .query((rs, n) -> out.add(item("task:" + rs.getLong("id"), rs.getString("priority"), rs.getString("title"),
                        rs.getString("detail"), rs.getString("kind"), rs.getString("origin"), rs.getTimestamp("created_at"), now,
                        "Manual".equals(rs.getString("kind")) ? "Editar" : "Abrir", null))).list();
        out.removeIf(p -> resolved.contains(p.get("key")));
        Map<String, Integer> rank = Map.of("crit", 0, "med", 1, "low", 2);
        out.sort((a, b) -> rank.getOrDefault(a.get("prio"), 3) - rank.getOrDefault(b.get("prio"), 3));
        return out;
    }

    private static Map<String, Object> item(String key, String prio, String title, String detail, String kind, String origin,
                                            Timestamp at, Instant now, String action, String href) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("prio", prio == null ? "low" : prio);
        m.put("title", title);
        m.put("detail", detail == null ? "" : detail);
        m.put("kind", kind);
        m.put("origin", origin);
        m.put("age", at == null ? "agora" : age(at.toInstant(), now));
        m.put("action", action);
        m.put("href", href);
        return m;
    }

    @Transactional
    public void resolve(String key, long actor) {
        if (key.startsWith("task:")) {
            jdbc.sql("UPDATE admin_task SET status='resolved', resolved_by=?, resolved_at=now() WHERE id=?")
                    .params(actor, Long.parseLong(key.substring(5))).update();
            return;
        }
        jdbc.sql("""
                INSERT INTO admin_task(task_key, origin, title, status, resolved_by, resolved_at)
                VALUES (?, 'auto', ?, 'resolved', ?, now())
                ON CONFLICT (task_key) DO UPDATE SET status='resolved', resolved_by=EXCLUDED.resolved_by, resolved_at=now()""")
                .params(key, key, actor).update();
    }

    public long createTask(String title, String detail, String priority, String kind, String origin, String key, long actor) {
        return jdbc.sql("""
                INSERT INTO admin_task(task_key, origin, priority, kind, title, detail, created_by)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT (task_key) DO UPDATE SET status='open', title=EXCLUDED.title, detail=EXCLUDED.detail
                RETURNING id""")
                .params(key, origin, Set.of("crit", "med", "low").contains(priority) ? priority : "low",
                        kind == null ? "Manual" : kind, title, detail, actor)
                .query(Long.class).single();
    }

    // ---- Usuários ---------------------------------------------------------------------------

    private List<Map<String, Object>> users(Instant now) {
        return jdbc.sql("""
                SELECT u.id, u.username, COALESCE(NULLIF(u.display_name,''), u.username) AS name, u.role, u.created_at,
                       s.state, s.path, s.last_seen_at,
                       COALESCE(s.last_seen_at > now() - interval '90 seconds', false) AS online,
                       w.title AS work, e.display_number AS ep,
                       (SELECT count(*) FROM analytics_event a WHERE a.user_id=u.id AND a.type='heartbeat'
                          AND a.data->>'state'='player' AND (a.data->>'visible')::boolean) AS beats,
                       (SELECT count(*) FROM episode_progress p WHERE p.user_id=u.id AND p.completed_at IS NOT NULL) AS eps,
                       (SELECT count(*) FROM chapter_progress p WHERE p.user_id=u.id AND p.completed_at IS NOT NULL) AS chs,
                       GREATEST(s.last_seen_at,
                         (SELECT max(last_activity_at) FROM episode_progress p WHERE p.user_id=u.id),
                         (SELECT max(last_activity_at) FROM chapter_progress p WHERE p.user_id=u.id)) AS last
                FROM app_user u
                LEFT JOIN LATERAL (SELECT * FROM analytics_session x WHERE x.user_id=u.id
                                   ORDER BY x.last_seen_at DESC LIMIT 1) s ON true
                LEFT JOIN work w ON w.id=s.work_id
                LEFT JOIN episode e ON e.id=s.episode_id
                ORDER BY last DESC NULLS LAST, u.id LIMIT 60""")
                .query((rs, n) -> {
                    boolean online = rs.getBoolean("online");
                    String state = online ? rs.getString("state") : "off";
                    Timestamp last = rs.getTimestamp("last");
                    String name = rs.getString("name");
                    String doing;
                    if (!online) doing = last == null ? "Ainda sem atividade" : "Visto " + ago(last.toInstant(), now);
                    else if ("player".equals(state)) doing = "Assistindo " + nz(rs.getString("work"), "um episódio")
                            + (rs.getString("ep") == null ? "" : " · ep. " + rs.getString("ep"));
                    else if ("read".equals(state)) doing = "Lendo " + nz(rs.getString("work"), "um capítulo");
                    else doing = "Navegando em " + pageName(rs.getString("path"));
                    ZonedDateTime since = rs.getTimestamp("created_at").toInstant().atZone(BRT);
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("name", name);
                    m.put("ini", initials(name));
                    m.put("state", "browse".equals(state) ? "online" : state);
                    m.put("now", doing);
                    m.put("meta", "Membro desde " + since.getMonth().getDisplayName(TextStyle.SHORT, PT).replace(".", "")
                            + " " + since.getYear() + " · #" + String.format("%04d", rs.getLong("id")) + " · " + roleName(rs.getString("role")));
                    m.put("hours", rs.getLong("beats") * HEARTBEAT_SECONDS / 3600.0);
                    m.put("episodes", rs.getLong("eps"));
                    m.put("chapters", rs.getLong("chs"));
                    m.put("last", online ? "agora" : last == null ? "—" : when(last.toInstant(), now, false));
                    return m;
                }).list();
    }

    /** Linha do tempo de um usuário: eventos do site, episódios vistos e capítulos lidos. */
    public List<Map<String, Object>> userEvents(long userId) {
        Instant now = Instant.now();
        List<Object[]> rows = new ArrayList<>();
        jdbc.sql("""
                SELECT a.occurred_at, a.type, a.data::text AS data, w.title AS work, e.display_number AS ep, c.display_number AS ch
                FROM analytics_event a LEFT JOIN work w ON w.id=a.work_id
                LEFT JOIN episode e ON e.id=a.episode_id LEFT JOIN chapter c ON c.id=a.chapter_id
                WHERE a.user_id=? AND a.type NOT IN ('heartbeat','impression')
                ORDER BY a.occurred_at DESC LIMIT 80""")
                .param(userId)
                .query((rs, n) -> rows.add(event(rs.getTimestamp("occurred_at").toInstant(), rs.getString("type"),
                        rs.getString("data"), rs.getString("work"), rs.getString("ep"), rs.getString("ch")))).list();
        jdbc.sql("""
                SELECT p.completed_at, w.title, e.display_number, p.completion_source
                FROM episode_progress p JOIN episode e ON e.id=p.episode_id JOIN season s ON s.id=e.season_id
                JOIN work w ON w.id=s.work_id WHERE p.user_id=? AND p.completed_at IS NOT NULL
                ORDER BY p.completed_at DESC LIMIT 40""")
                .param(userId)
                .query((rs, n) -> rows.add(new Object[]{rs.getTimestamp(1).toInstant(), "play",
                        rs.getString(2) + " · Ep. " + rs.getString(3) + " marcado como visto",
                        "Concluído · " + nz(rs.getString(4), "progresso")})).list();
        jdbc.sql("""
                SELECT p.last_activity_at, w.title, c.display_number, p.percent_complete
                FROM chapter_progress p JOIN chapter c ON c.id=p.chapter_id
                JOIN work_edition ed ON ed.id=p.edition_id JOIN work w ON w.id=ed.work_id
                WHERE p.user_id=? ORDER BY p.last_activity_at DESC LIMIT 40""")
                .param(userId)
                .query((rs, n) -> rows.add(new Object[]{rs.getTimestamp(1).toInstant(), "read",
                        rs.getString(2) + " · Capítulo " + rs.getString(3),
                        "Leu " + Math.round(rs.getDouble(4)) + "%"})).list();
        rows.sort((a, b) -> ((Instant) b[0]).compareTo((Instant) a[0]));
        return rows.stream().limit(80).map(r -> Map.<String, Object>of("t", when((Instant) r[0], now, false),
                "type", r[1], "title", r[2], "detail", r[3])).toList();
    }

    private static Object[] event(Instant at, String type, String data, String work, String ep, String ch) {
        String w = nz(work, "Obra");
        String epText = ep == null ? "" : " · Ep. " + ep;
        String d = data == null ? "" : data;
        return switch (type) {
            case "player_open" -> new Object[]{at, "play", w + epText,
                    String.join(" · ", nonNull(field(d, "version"), field(d, "server"), field(d, "provider")))};
            case "next_click" -> new Object[]{at, "play", w + epText, "Clicou em Próximo episódio"};
            case "server_switch" -> new Object[]{at, "server", "Trocou de servidor",
                    w + epText + " · " + nz(field(d, "from"), "?") + " → " + nz(field(d, "to"), "?")};
            case "search" -> new Object[]{at, "search", "Busca: \"" + nz(field(d, "q"), "") + "\"",
                    nz(field(d, "results"), "0") + " resultado(s)"};
            case "chapter_open" -> new Object[]{at, "read", w + (ch == null ? "" : " · Capítulo " + ch), "Abriu o leitor"};
            case "click" -> new Object[]{at, "nav", "Clique em " + (work == null ? nz(field(d, "label"), "link") : work),
                    nz(field(d, "section"), nz(field(d, "path"), ""))};
            default -> new Object[]{at, "nav", "Abriu " + pageName(field(d, "path")), nz(field(d, "path"), "")};
        };
    }

    // ---- utilidades -------------------------------------------------------------------------

    /** Lê um campo de texto simples do JSON do evento sem depender do formato exato. */
    static String field(String json, String name) {
        var m = java.util.regex.Pattern.compile("\"" + name + "\"\\s*:\\s*(\"((?:[^\"\\\\]|\\\\.)*)\"|[-0-9.]+|true|false)")
                .matcher(json);
        if (!m.find()) return null;
        return m.group(2) != null ? m.group(2).replace("\\\"", "\"") : m.group(1);
    }

    private static String[] nonNull(String... values) {
        return java.util.Arrays.stream(values).filter(v -> v != null && !v.isBlank()).toArray(String[]::new);
    }

    static String pageName(String path) {
        if (path == null || path.isBlank() || "/".equals(path)) return "Início";
        if (path.startsWith("/explorar")) return "Explorar";
        if (path.startsWith("/animes/") || path.startsWith("/leituras/")) return "uma obra";
        if (path.startsWith("/animes")) return "Animes";
        if (path.startsWith("/leituras")) return "Leituras";
        if (path.startsWith("/calendario")) return "Calendário";
        if (path.startsWith("/conta")) return "Conta";
        if (path.startsWith("/admin")) return "Painel";
        if (path.startsWith("/player")) return "o player";
        if (path.startsWith("/leitor")) return "o leitor";
        return path;
    }

    static String roleName(String role) {
        return switch (role == null ? "" : role) {
            case "ADMIN" -> "administrador";
            case "EDITOR" -> "editor";
            case "MODERATOR" -> "moderador";
            default -> "usuário";
        };
    }

    static String initials(String name) {
        String[] parts = name.strip().split("\\s+");
        String a = parts[0].substring(0, 1);
        String b = parts.length > 1 ? parts[parts.length - 1].substring(0, 1) : parts[0].length() > 1 ? parts[0].substring(1, 2) : "";
        return (a + b).toUpperCase(PT);
    }

    static String when(Instant at, Instant now, boolean withDay) {
        ZonedDateTime z = at.atZone(BRT);
        LocalDate today = now.atZone(BRT).toLocalDate();
        String hm = z.format(HM);
        if (z.toLocalDate().equals(today)) return withDay ? "Hoje " + hm : hm;
        if (z.toLocalDate().equals(today.minusDays(1))) return "Ontem " + hm;
        return z.format(DM) + " " + hm;
    }

    static String age(Instant at, Instant now) {
        long min = Math.max(0, Duration.between(at, now).toMinutes());
        if (min < 1) return "agora";
        if (min < 60) return min + " min";
        if (min < 60 * 24) return (min / 60) + " h";
        return (min / (60 * 24)) + " d";
    }

    static String ago(Instant at, Instant now) {
        long min = Math.max(0, Duration.between(at, now).toMinutes());
        if (min < 60) return "há " + Math.max(1, min) + " min";
        if (min < 60 * 24) return "há " + (min / 60) + " h";
        if (min < 60 * 48) return "ontem";
        return "há " + (min / (60 * 24)) + " dias";
    }

    private static String number(java.math.BigDecimal n) {
        return n == null ? "?" : n.stripTrailingZeros().toPlainString();
    }

    private static String workPath(String family, String slug) {
        return ("READING".equals(family) ? "/leituras/" : "/animes/") + slug;
    }

    private static String nz(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    private static Timestamp ts(Instant i) {
        return Timestamp.from(i);
    }
}
