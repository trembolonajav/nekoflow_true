package com.nekoflow.library;

import com.nekoflow.catalog.Work;
import com.nekoflow.catalog.WorkRepository;
import com.nekoflow.common.Times;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fonte central das informações pessoais de consumo: biblioteca, favoritos,
 * acompanhamento, progresso e histórico. Todas as telas leem daqui.
 */
@Service
public class LibraryService {

    private final JdbcClient jdbc;
    private final WorkRepository works;

    public LibraryService(JdbcClient jdbc, WorkRepository works) {
        this.jdbc = jdbc;
        this.works = works;
    }

    // ---- biblioteca ---------------------------------------------------------

    public record Entry(long workId, String status, OffsetDateTime addedAt, OffsetDateTime updatedAt) {
    }

    public record Progress(long workId, int unit, Integer positionSec, Integer durationSec, double pct,
                           boolean completed, OffsetDateTime updatedAt) {
    }

    /** Itens da biblioteca no formato consumido pelas telas, do mais recente para o mais antigo. */
    public List<Map<String, Object>> library(long userId) {
        List<Entry> entries = jdbc.sql("SELECT work_id, status, added_at, updated_at FROM library_entry WHERE user_id = ?")
                .param(userId)
                .query((rs, n) -> new Entry(rs.getLong(1), rs.getString(2),
                        rs.getObject(3, OffsetDateTime.class), rs.getObject(4, OffsetDateTime.class)))
                .list();
        Map<Long, Progress> latest = latestProgress(userId);
        Set<Long> favs = ids("SELECT work_id FROM favorite WHERE user_id = ?", userId);
        Set<Long> follows = ids("SELECT work_id FROM work_follow WHERE user_id = ?", userId);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Entry e : entries) {
            Work w = works.require(e.workId());
            out.add(item(w, e, latest.get(w.id()), favs.contains(w.id()), follows.contains(w.id())));
        }
        out.sort((a, b) -> ((OffsetDateTime) b.get("_at")).compareTo((OffsetDateTime) a.get("_at")));
        out.forEach(m -> m.remove("_at"));
        return out;
    }

    private Map<String, Object> item(Work w, Entry e, Progress p, boolean fav, boolean follow) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", w.id());
        m.put("title", w.title());
        m.put("cover", w.cover());
        m.put("banner", w.banner());
        m.put("kind", w.kind());
        m.put("webtoon", w.webtoon());
        m.put("typeLabel", w.typeLabel());
        m.put("status", e.status());
        m.put("favorite", fav);
        m.put("follow", follow);
        m.put("href", w.href());
        Resume r = resume(w, p);
        m.put("unit", r.unit);
        m.put("unitHref", w.unitHref(r.unit));
        m.put("done", r.upToDate);
        m.put("pct", r.pct);
        m.put("hasProgress", p != null);
        if (w.isAnimation()) {
            m.put("ep", r.unit);
            m.put("of", w.totalUnits());
            m.put("t", r.positionSec == null ? null : Times.mmss(r.positionSec));
            m.put("d", r.durationSec == null ? null : Times.mmss(r.durationSec));
            m.put("left", r.durationSec == null || r.positionSec == null ? null
                    : Math.max(1, (int) Math.ceil((r.durationSec - r.positionSec) / 60.0)) + " min");
        } else {
            m.put("ch", r.unit);
            m.put("pos", r.pct + "% do capítulo");
        }
        OffsetDateTime at = p != null && p.updatedAt().isAfter(e.updatedAt()) ? p.updatedAt() : e.updatedAt();
        m.put("last", Times.day(at));
        m.put("updatedAt", at.toString());
        m.put("_at", at);
        return m;
    }

    /** Regras de retomada: posição salva, próxima unidade ou "Em dia". */
    record Resume(int unit, Integer positionSec, Integer durationSec, int pct, boolean upToDate) {
    }

    static Resume resume(Work w, Progress p) {
        if (p == null) {
            return new Resume(1, null, null, 0, false);
        }
        if (!p.completed()) {
            return new Resume(p.unit(), p.positionSec(), p.durationSec(), (int) Math.round(p.pct()), false);
        }
        Integer released = w.released();
        int next = p.unit() + 1;
        if (released != null && next > released) {
            return new Resume(p.unit(), p.durationSec(), p.durationSec(), 100, true);
        }
        return new Resume(next, 0, p.durationSec(), 0, false);
    }

    @Transactional
    public void setStatus(long userId, long workId, LibraryStatus status) {
        works.require(workId);
        jdbc.sql("""
                INSERT INTO library_entry (user_id, work_id, status) VALUES (?, ?, ?)
                ON CONFLICT (user_id, work_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()""")
                .params(userId, workId, status.code).update();
    }

    /** Remove só o registro da biblioteca; histórico, progresso e avaliações ficam. */
    public void remove(long userId, long workId) {
        jdbc.sql("DELETE FROM library_entry WHERE user_id = ? AND work_id = ?").params(userId, workId).update();
    }

    public void setFavorite(long userId, long workId, boolean on) {
        works.require(workId);
        if (on) {
            jdbc.sql("INSERT INTO favorite (user_id, work_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                    .params(userId, workId).update();
        } else {
            jdbc.sql("DELETE FROM favorite WHERE user_id = ? AND work_id = ?").params(userId, workId).update();
        }
    }

    public void setFollow(long userId, long workId, boolean on) {
        works.require(workId);
        if (on) {
            jdbc.sql("INSERT INTO work_follow (user_id, work_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                    .params(userId, workId).update();
        } else {
            jdbc.sql("DELETE FROM work_follow WHERE user_id = ? AND work_id = ?").params(userId, workId).update();
        }
    }

    public List<Map<String, Object>> favorites(long userId) {
        return jdbc.sql("SELECT work_id FROM favorite WHERE user_id = ? ORDER BY created_at DESC").param(userId)
                .query(Long.class).list().stream().map(id -> works.require(id).view()).toList();
    }

    /** Estado pessoal de uma obra (botões da página da obra, player e leitor). */
    public Map<String, Object> workState(long userId, long workId) {
        Work w = works.require(workId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("workId", workId);
        String status = jdbc.sql("SELECT status FROM library_entry WHERE user_id = ? AND work_id = ?")
                .params(userId, workId).query(String.class).optional().orElse(null);
        m.put("inLibrary", status != null);
        m.put("status", status);
        m.put("favorite", has("SELECT count(*) FROM favorite WHERE user_id = ? AND work_id = ?", userId, workId));
        m.put("follow", has("SELECT count(*) FROM work_follow WHERE user_id = ? AND work_id = ?", userId, workId));
        m.put("units", progressUnits(userId, workId));
        Progress p = latestProgress(userId).get(workId);
        Resume r = resume(w, p);
        m.put("resumeUnit", r.unit);
        m.put("upToDate", r.upToDate);
        m.put("availableUnits", w.released());
        return m;
    }

    public Map<String, Object> summary(long userId) {
        List<Map<String, Object>> lib = library(userId);
        long watching = lib.stream().filter(x -> isAnim(x) && "andamento".equals(x.get("status"))
                && Boolean.TRUE.equals(x.get("hasProgress")) && !Boolean.TRUE.equals(x.get("done"))).count();
        long reading = lib.stream().filter(x -> !isAnim(x) && "andamento".equals(x.get("status"))
                && Boolean.TRUE.equals(x.get("hasProgress")) && !Boolean.TRUE.equals(x.get("done"))).count();
        return Map.of("lista", lib.size(), "assistindo", watching, "lendo", reading);
    }

    /** "Continuar assistindo" da Home, calculado do progresso real. */
    public List<Map<String, Object>> continueWatching(long userId, int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> x : library(userId)) {
            if (!isAnim(x) || !"andamento".equals(x.get("status")) || !Boolean.TRUE.equals(x.get("hasProgress"))
                    || Boolean.TRUE.equals(x.get("done"))) {
                continue;
            }
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("id", x.get("id"));
            c.put("title", x.get("title"));
            c.put("thumb", x.get("banner") != null ? x.get("banner") : x.get("cover"));
            c.put("pct", x.get("pct") + "%");
            c.put("left", x.get("left") != null ? x.get("left") : "");
            c.put("ep", "Ep. " + x.get("ep"));
            c.put("href", x.get("unitHref"));
            out.add(c);
            if (out.size() >= limit) {
                break;
            }
        }
        return out;
    }

    private static boolean isAnim(Map<String, Object> x) {
        return "anime".equals(x.get("kind")) || "filme".equals(x.get("kind"));
    }

    // ---- progresso ----------------------------------------------------------

    /** reset = desfazer "assistido/lido" explicitamente (o normal é a conclusão ser permanente). */
    public record ProgressUpdate(Integer position, Integer duration, Double pct, Boolean completed, Long at,
                                 Boolean reset) {
    }

    public Map<String, Object> progressUnits(long userId, long workId) {
        Map<String, Object> units = new LinkedHashMap<>();
        jdbc.sql("SELECT * FROM progress WHERE user_id = ? AND work_id = ? ORDER BY unit").params(userId, workId)
                .query((rs, n) -> {
                    Map<String, Object> u = new LinkedHashMap<>();
                    u.put("t", rs.getObject("position_sec"));
                    u.put("d", rs.getObject("duration_sec"));
                    u.put("pct", rs.getDouble("pct"));
                    u.put("done", rs.getBoolean("completed"));
                    u.put("at", rs.getObject("updated_at", OffsetDateTime.class).toInstant().toEpochMilli());
                    units.put(String.valueOf(rs.getInt("unit")), u);
                    return null;
                }).list();
        return units;
    }

    /**
     * Salva a posição de uma unidade. Uma gravação com horário anterior ao já salvo
     * (outro dispositivo mais recente) é ignorada em vez de sobrescrever.
     */
    @Transactional
    public Map<String, Object> saveProgress(long userId, long workId, int unit, ProgressUpdate u) {
        Work w = works.require(workId);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime at = u.at() == null ? now : OffsetDateTime.ofInstant(Instant.ofEpochMilli(u.at()), ZoneOffset.UTC);
        if (at.isAfter(now)) {
            at = now;
        }
        Boolean wasDone = jdbc.sql("SELECT completed FROM progress WHERE user_id = ? AND work_id = ? AND unit = ?")
                .params(userId, workId, unit).query(Boolean.class).optional().orElse(null);
        boolean completed = Boolean.TRUE.equals(u.completed());
        int written = jdbc.sql("""
                INSERT INTO progress (user_id, work_id, unit, position_sec, duration_sec, pct, completed, updated_at)
                VALUES (:u, :w, :unit, :pos, :dur, :pct, :done, :at)
                ON CONFLICT (user_id, work_id, unit) DO UPDATE SET
                    position_sec = EXCLUDED.position_sec,
                    duration_sec = COALESCE(EXCLUDED.duration_sec, progress.duration_sec),
                    pct = EXCLUDED.pct,
                    completed = CASE WHEN :reset THEN EXCLUDED.completed ELSE progress.completed OR EXCLUDED.completed END,
                    updated_at = EXCLUDED.updated_at
                WHERE progress.updated_at <= EXCLUDED.updated_at""")
                .param("u", userId).param("w", workId).param("unit", unit)
                .param("pos", u.position()).param("dur", u.duration())
                .param("pct", u.pct() == null ? 0 : Math.max(0, Math.min(100, u.pct())))
                .param("done", completed).param("at", at).param("reset", Boolean.TRUE.equals(u.reset()))
                .update();
        boolean stale = written == 0;
        if (!stale) {
            // Começar a consumir coloca a obra "Em andamento" (sem mexer em pausado/abandonado/concluído).
            jdbc.sql("""
                    INSERT INTO library_entry (user_id, work_id, status) VALUES (?, ?, 'andamento')
                    ON CONFLICT (user_id, work_id) DO UPDATE SET
                        status = CASE WHEN library_entry.status = 'planejado' THEN 'andamento' ELSE library_entry.status END,
                        updated_at = now()""")
                    .params(userId, workId).update();
            if (completed && !Boolean.TRUE.equals(wasDone)) {
                recordActivity(userId, workId, unit, w.isAnimation() ? "WATCHED" : "READ");
                autoConclude(userId, w, unit);
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("stale", stale);
        m.put("units", progressUnits(userId, workId));
        return m;
    }

    private void autoConclude(long userId, Work w, int unit) {
        boolean finished = w.airingStatus() != null
                && (w.airingStatus().startsWith("Conclu") || w.airingStatus().startsWith("Finaliz"));
        if (finished && w.totalUnits() != null && unit >= w.totalUnits()) {
            jdbc.sql("UPDATE library_entry SET status = 'concluido', updated_at = now() "
                            + "WHERE user_id = ? AND work_id = ? AND status = 'andamento'")
                    .params(userId, w.id()).update();
        }
    }

    private Map<Long, Progress> latestProgress(long userId) {
        Map<Long, Progress> out = new HashMap<>();
        jdbc.sql("""
                SELECT DISTINCT ON (work_id) * FROM progress WHERE user_id = ?
                ORDER BY work_id, updated_at DESC, unit DESC""")
                .param(userId)
                .query((rs, n) -> new Progress(rs.getLong("work_id"), rs.getInt("unit"),
                        (Integer) rs.getObject("position_sec"), (Integer) rs.getObject("duration_sec"),
                        rs.getDouble("pct"), rs.getBoolean("completed"),
                        rs.getObject("updated_at", OffsetDateTime.class)))
                .list().forEach(p -> out.put(p.workId(), p));
        return out;
    }

    // ---- histórico ----------------------------------------------------------

    /** Registra "aberto". Assistido/lido só vem do progresso concluído, nunca da simples abertura. */
    public void recordOpened(long userId, long workId, int unit) {
        works.require(workId);
        boolean recent = has("""
                SELECT count(*) FROM activity WHERE user_id = ? AND work_id = ? AND unit = ?
                AND occurred_at > now() - interval '30 minutes'""", userId, workId, unit);
        if (!recent) {
            recordActivity(userId, workId, unit, "OPENED");
        }
    }

    private void recordActivity(long userId, long workId, int unit, String action) {
        jdbc.sql("INSERT INTO activity (user_id, work_id, unit, action) VALUES (?, ?, ?, ?)")
                .params(userId, workId, unit, action).update();
    }

    public List<Map<String, Object>> history(long userId) {
        List<Map<String, Object>> groups = new ArrayList<>();
        Map<String, List<Map<String, Object>>> byDay = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT a.id, a.work_id, a.unit, a.action, a.occurred_at FROM activity a
                WHERE a.user_id = ? ORDER BY a.occurred_at DESC LIMIT 300""")
                .param(userId)
                .query((rs, n) -> {
                    Work w = works.require(rs.getLong("work_id"));
                    OffsetDateTime at = rs.getObject("occurred_at", OffsetDateTime.class);
                    String action = rs.getString("action");
                    int unit = rs.getInt("unit");
                    String verb = switch (action) {
                        case "WATCHED" -> "Assistido";
                        case "READ" -> "Lido";
                        default -> "Aberto";
                    };
                    Map<String, Object> i = new LinkedHashMap<>();
                    i.put("hid", rs.getLong("id"));
                    i.put("workId", w.id());
                    i.put("title", w.title());
                    i.put("cover", w.cover());
                    i.put("kind", w.kind());
                    i.put("action", action);
                    i.put("unit", (w.isAnimation() ? "Episódio " : "Capítulo ") + unit);
                    i.put("time", verb + " às " + Times.clock(at));
                    i.put("href", w.unitHref(unit));
                    byDay.computeIfAbsent(Times.day(at), k -> new ArrayList<>()).add(i);
                    return null;
                }).list();
        byDay.forEach((day, items) -> groups.add(Map.of("day", day, "items", items)));
        return groups;
    }

    public void removeHistoryItem(long userId, long id) {
        jdbc.sql("DELETE FROM activity WHERE user_id = ? AND id = ?").params(userId, id).update();
    }

    /** Apaga o histórico; biblioteca e progresso continuam. */
    public void clearHistory(long userId) {
        jdbc.sql("DELETE FROM activity WHERE user_id = ?").param(userId).update();
    }

    // ---- util ---------------------------------------------------------------

    private Set<Long> ids(String sql, long userId) {
        return new HashSet<>(jdbc.sql(sql).param(userId).query(Long.class).list());
    }

    private boolean has(String sql, Object... params) {
        return jdbc.sql(sql).params(params).query(Long.class).single() > 0;
    }
}
