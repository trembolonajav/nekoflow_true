package com.nekoflow.progress;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * "Continuar assistindo", "Continuar lendo" e o resumo de progresso de cada obra são
 * calculados a partir do progresso real — não existe tabela própria de carrossel.
 *
 * <p>Regras: a unidade mais recente de cada obra decide. Incompleta → retomar a posição.
 * Concluída → próxima unidade disponível (atravessa temporadas). Concluída e sem próxima
 * disponível → "Em dia" (sai da fila; não marca a obra como concluída).
 */
@Service
public class ResumeService {

    public enum State { RESUME, NEXT, UP_TO_DATE }

    public record Resume(long workId, String mediaFamily, State state, UUID unitId, String unitNumber,
                         String unitTitle, UUID editionId, long positionMs, Long durationMs, Integer pageIndex,
                         String segmentKey, BigDecimal segmentOffset, double percent, boolean currentCompleted,
                         boolean available, boolean hasLaterUnits, OffsetDateTime lastActivityAt) {

        public boolean resumable() {
            return state != State.UP_TO_DATE;
        }

        public String unitHref(String workHref) {
            if ("ANIMATION".equals(mediaFamily)) {
                return "/player?episode=" + unitId;
            }
            // Leitor nativo chega no Protocolo 07; até lá a leitura abre pela ficha (fonte externa).
            return workHref;
        }

        public Map<String, Object> view(String workHref) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("state", state.name());
            m.put("unitId", unitId);
            m.put("unitNumber", unitNumber);
            m.put("unitTitle", unitTitle);
            m.put("editionId", editionId);
            m.put("positionMs", positionMs);
            m.put("durationMs", durationMs);
            m.put("pageIndex", pageIndex);
            m.put("segmentKey", segmentKey);
            m.put("segmentOffset", segmentOffset);
            m.put("percent", percent);
            m.put("available", available);
            m.put("upToDate", state == State.UP_TO_DATE);
            m.put("lastActivityAt", lastActivityAt);
            m.put("unitHref", unitHref(workHref));
            return m;
        }
    }

    private final JdbcClient jdbc;

    public ResumeService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Retomada de cada obra com progresso do usuário (opcionalmente só as obras pedidas). */
    public Map<Long, Resume> byWork(long userId, Collection<Long> onlyWorks) {
        Map<Long, Resume> out = new HashMap<>();
        String filter = onlyWorks == null ? null : pgArray(onlyWorks);
        if (onlyWorks != null && onlyWorks.isEmpty()) {
            return out;
        }
        for (Resume r : episodes(userId, filter)) {
            out.put(r.workId(), r);
        }
        for (Resume r : chapters(userId, filter)) {
            out.merge(r.workId(), r, (a, b) -> a.lastActivityAt().isAfter(b.lastActivityAt()) ? a : b);
        }
        return out;
    }

    /** Uma entrada por obra "Em andamento", da atividade mais recente para a mais antiga. */
    public List<Map<String, Object>> continueList(long userId, String mediaFamily, int limit) {
        List<Resume> candidates = new ArrayList<>("ANIMATION".equals(mediaFamily)
                ? episodes(userId, null) : chapters(userId, null));
        candidates.removeIf(r -> !r.resumable());
        if (candidates.isEmpty()) {
            return List.of();
        }
        Map<Long, Map<String, Object>> works = new HashMap<>();
        jdbc.sql("""
                SELECT w.id, w.public_id, w.title, w.cover, w.banner, w.kind, w.slug, w.media_family, w.webtoon
                FROM work w JOIN library_entry le ON le.work_id = w.id AND le.user_id = :user
                WHERE le.status = 'andamento' AND w.visibility = 'PUBLISHED' AND w.id = ANY(CAST(:ids AS BIGINT[]))""")
                .param("user", userId)
                .param("ids", pgArray(candidates.stream().map(Resume::workId).toList()))
                .query((rs, n) -> works.put(rs.getLong("id"), workView(rs)))
                .list();
        List<Map<String, Object>> out = new ArrayList<>();
        candidates.stream()
                .filter(r -> works.containsKey(r.workId()))
                .sorted((a, b) -> b.lastActivityAt().compareTo(a.lastActivityAt()))
                .limit(limit)
                .forEach(r -> {
                    Map<String, Object> m = new LinkedHashMap<>(works.get(r.workId()));
                    m.put("resume", r.view((String) m.get("href")));
                    out.add(m);
                });
        return out;
    }

    /** Literal de array do PostgreSQL (evita a expansão de coleções em listas pelo JdbcClient). */
    static String pgArray(Collection<Long> ids) {
        return "{" + String.join(",", ids.stream().map(String::valueOf).toList()) + "}";
    }

    static Map<String, Object> workView(ResultSet rs) throws SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        String family = rs.getString("media_family");
        m.put("workId", rs.getObject("public_id", UUID.class));
        m.put("legacyId", rs.getLong("id"));
        m.put("title", rs.getString("title"));
        m.put("cover", rs.getString("cover"));
        m.put("banner", rs.getString("banner"));
        m.put("kind", rs.getString("kind"));
        m.put("webtoon", rs.getBoolean("webtoon"));
        m.put("mediaFamily", family);
        m.put("slug", rs.getString("slug"));
        m.put("href", ("ANIMATION".equals(family) ? "/animes/" : "/leituras/") + rs.getString("slug"));
        return m;
    }

    private List<Resume> episodes(long userId, String onlyWorks) {
        return jdbc.sql("""
                WITH mine AS (
                    SELECT DISTINCT s.work_id
                    FROM episode_progress p JOIN episode e ON e.id = p.episode_id JOIN season s ON s.id = e.season_id
                    WHERE p.user_id = :user AND (CAST(:only AS BIGINT[]) IS NULL OR s.work_id = ANY(CAST(:only AS BIGINT[])))
                ), units AS (
                    SELECT e.id, s.work_id, e.display_number, e.title, e.duration_seconds,
                           s.visibility = 'PUBLISHED' AS published,
                           row_number() OVER (PARTITION BY s.work_id ORDER BY s.sort_position, e.sort_position) AS ord,
                           EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id = e.id AND es.enabled) AS has_source
                    FROM episode e JOIN season s ON s.id = e.season_id
                    WHERE s.work_id IN (SELECT work_id FROM mine)
                ), latest AS (
                    SELECT DISTINCT ON (u.work_id) u.work_id, u.id AS unit_id, u.display_number, u.title AS unit_title,
                           u.ord, u.has_source AND u.published AS available, p.position_ms, p.duration_ms,
                           u.duration_seconds, p.completed_at IS NOT NULL AS completed, p.last_activity_at
                    FROM episode_progress p JOIN units u ON u.id = p.episode_id
                    WHERE p.user_id = :user
                    ORDER BY u.work_id, p.last_activity_at DESC, u.ord DESC
                )
                SELECT l.*, n.id AS next_id, n.display_number AS next_number, n.title AS next_title,
                       n.duration_seconds AS next_duration,
                       EXISTS (SELECT 1 FROM units m WHERE m.work_id = l.work_id AND m.ord > l.ord) AS has_later
                FROM latest l
                LEFT JOIN LATERAL (
                    SELECT x.id, x.display_number, x.title, x.duration_seconds FROM units x
                    WHERE x.work_id = l.work_id AND x.ord > l.ord AND x.has_source AND x.published
                    ORDER BY x.ord LIMIT 1
                ) n ON TRUE""")
                .param("user", userId)
                .param("only", onlyWorks)
                .query((rs, i) -> {
                    boolean completed = rs.getBoolean("completed");
                    UUID next = rs.getObject("next_id", UUID.class);
                    Long duration = (Long) rs.getObject("duration_ms");
                    if (duration == null && rs.getObject("duration_seconds") != null) {
                        duration = rs.getInt("duration_seconds") * 1000L;
                    }
                    long position = rs.getLong("position_ms");
                    if (!completed) {
                        double pct = duration == null || duration == 0 ? 0 : Math.min(100, position * 100.0 / duration);
                        return new Resume(rs.getLong("work_id"), "ANIMATION", State.RESUME,
                                rs.getObject("unit_id", UUID.class), rs.getString("display_number"),
                                rs.getString("unit_title"), null, position, duration, null, null, null,
                                Math.round(pct * 10) / 10.0, false, rs.getBoolean("available"),
                                rs.getBoolean("has_later"), rs.getObject("last_activity_at", OffsetDateTime.class));
                    }
                    if (next != null) {
                        Integer nextSeconds = (Integer) rs.getObject("next_duration");
                        return new Resume(rs.getLong("work_id"), "ANIMATION", State.NEXT, next,
                                rs.getString("next_number"), rs.getString("next_title"), null, 0,
                                nextSeconds == null ? null : nextSeconds * 1000L, null, null, null, 0, true, true,
                                true, rs.getObject("last_activity_at", OffsetDateTime.class));
                    }
                    return new Resume(rs.getLong("work_id"), "ANIMATION", State.UP_TO_DATE,
                            rs.getObject("unit_id", UUID.class), rs.getString("display_number"),
                            rs.getString("unit_title"), null, position, duration, null, null, null, 100, true,
                            rs.getBoolean("available"), rs.getBoolean("has_later"),
                            rs.getObject("last_activity_at", OffsetDateTime.class));
                })
                .list();
    }

    private List<Resume> chapters(long userId, String onlyWorks) {
        return jdbc.sql("""
                WITH mine AS (
                    SELECT DISTINCT ed.work_id
                    FROM chapter_progress p JOIN work_edition ed ON ed.id = p.edition_id
                    WHERE p.user_id = :user AND (CAST(:only AS BIGINT[]) IS NULL OR ed.work_id = ANY(CAST(:only AS BIGINT[])))
                ), units AS (
                    SELECT c.id, c.edition_id, ed.work_id, c.display_number, c.title,
                           row_number() OVER (PARTITION BY c.edition_id ORDER BY c.sort_position) AS ord,
                           EXISTS (SELECT 1 FROM chapter_source cs WHERE cs.chapter_id = c.id AND cs.enabled) AS has_source
                    FROM chapter c JOIN work_edition ed ON ed.id = c.edition_id
                    WHERE ed.work_id IN (SELECT work_id FROM mine)
                ), latest AS (
                    SELECT DISTINCT ON (u.work_id) u.work_id, u.id AS unit_id, u.edition_id, u.display_number,
                           u.title AS unit_title, u.ord, u.has_source AS available, p.page_index, p.segment_key,
                           p.segment_offset, p.percent_complete, p.completed_at IS NOT NULL AS completed,
                           p.last_activity_at
                    FROM chapter_progress p JOIN units u ON u.id = p.chapter_id AND u.edition_id = p.edition_id
                    WHERE p.user_id = :user
                    ORDER BY u.work_id, p.last_activity_at DESC, u.ord DESC
                )
                SELECT l.*, n.id AS next_id, n.display_number AS next_number, n.title AS next_title,
                       EXISTS (SELECT 1 FROM units m WHERE m.edition_id = l.edition_id AND m.ord > l.ord) AS has_later
                FROM latest l
                LEFT JOIN LATERAL (
                    SELECT x.id, x.display_number, x.title FROM units x
                    WHERE x.edition_id = l.edition_id AND x.ord > l.ord AND x.has_source
                    ORDER BY x.ord LIMIT 1
                ) n ON TRUE""")
                .param("user", userId)
                .param("only", onlyWorks)
                .query((rs, i) -> {
                    boolean completed = rs.getBoolean("completed");
                    UUID next = rs.getObject("next_id", UUID.class);
                    UUID edition = rs.getObject("edition_id", UUID.class);
                    OffsetDateTime at = rs.getObject("last_activity_at", OffsetDateTime.class);
                    if (!completed) {
                        return new Resume(rs.getLong("work_id"), "READING", State.RESUME,
                                rs.getObject("unit_id", UUID.class), rs.getString("display_number"),
                                rs.getString("unit_title"), edition, 0, null, (Integer) rs.getObject("page_index"),
                                rs.getString("segment_key"), rs.getBigDecimal("segment_offset"),
                                rs.getBigDecimal("percent_complete").doubleValue(), false, rs.getBoolean("available"),
                                rs.getBoolean("has_later"), at);
                    }
                    if (next != null) {
                        return new Resume(rs.getLong("work_id"), "READING", State.NEXT, next,
                                rs.getString("next_number"), rs.getString("next_title"), edition, 0, null, null,
                                null, null, 0, true, true, true, at);
                    }
                    return new Resume(rs.getLong("work_id"), "READING", State.UP_TO_DATE,
                            rs.getObject("unit_id", UUID.class), rs.getString("display_number"),
                            rs.getString("unit_title"), edition, 0, null, null, null, null, 100, true,
                            rs.getBoolean("available"), rs.getBoolean("has_later"), at);
                })
                .list();
    }
}
