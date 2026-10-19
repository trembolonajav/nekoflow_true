package com.nekoflow.progress;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Histórico = o que foi assistido/lido e quando. É separado do progresso: apagar uma
 * atividade não mexe na posição salva nem na biblioteca.
 */
@Service
public class HistoryService {

    private final JdbcClient jdbc;

    public HistoryService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record Filter(String media, UUID workId, OffsetDateTime from, OffsetDateTime to) {

        String family() {
            if (media == null || media.isBlank()) {
                return null;
            }
            return switch (media.toLowerCase()) {
                case "anime", "animation", "animacao" -> "ANIMATION";
                case "leitura", "reading", "leituras" -> "READING";
                default -> throw ProgressException.badRequest("INVALID_FILTER", "Filtro de mídia inválido.");
            };
        }
    }

    private static final String WHERE = """
            WHERE h.user_id = :user
              AND (CAST(:family AS VARCHAR) IS NULL OR w.media_family = :family)
              AND (CAST(:work AS UUID) IS NULL OR w.public_id = :work)
              AND (CAST(:from AS TIMESTAMPTZ) IS NULL OR h.occurred_at >= :from)
              AND (CAST(:to AS TIMESTAMPTZ) IS NULL OR h.occurred_at < :to)""";

    public Map<String, Object> list(long userId, Filter f, int page, int size) {
        String family = f.family();
        List<Map<String, Object>> items = jdbc.sql("""
                SELECT h.id, h.activity_type, h.source, h.occurred_at, h.episode_id, h.chapter_id, h.edition_id,
                       w.id AS legacy_id, w.public_id, w.title, w.slug, w.cover, w.media_family, w.kind,
                       w.visibility = 'PUBLISHED' AS work_published,
                       COALESCE(ep.display_number, ch.display_number) AS unit_number,
                       COALESCE(ep.title, ch.title) AS unit_title,
                       CASE WHEN h.episode_id IS NOT NULL
                            THEN EXISTS (SELECT 1 FROM episode_source s WHERE s.episode_id = h.episode_id AND s.enabled)
                            ELSE EXISTS (SELECT 1 FROM chapter_source s WHERE s.chapter_id = h.chapter_id AND s.enabled)
                       END AS unit_available
                FROM activity_history h
                JOIN work w ON w.id = h.work_id
                LEFT JOIN episode ep ON ep.id = h.episode_id
                LEFT JOIN chapter ch ON ch.id = h.chapter_id
                """ + WHERE + """
                 ORDER BY h.occurred_at DESC, h.id DESC LIMIT :size OFFSET :offset""")
                .param("user", userId).param("family", family).param("work", f.workId())
                .param("from", f.from()).param("to", f.to())
                .param("size", size).param("offset", (long) page * size)
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    String fam = rs.getString("media_family");
                    String href = ("ANIMATION".equals(fam) ? "/animes/" : "/leituras/") + rs.getString("slug");
                    UUID episode = rs.getObject("episode_id", UUID.class);
                    m.put("id", rs.getLong("id"));
                    m.put("activityType", rs.getString("activity_type"));
                    m.put("source", rs.getString("source"));
                    m.put("occurredAt", rs.getObject("occurred_at", OffsetDateTime.class));
                    m.put("workId", rs.getObject("public_id", UUID.class));
                    m.put("legacyId", rs.getLong("legacy_id"));
                    m.put("title", rs.getString("title"));
                    m.put("cover", rs.getString("cover"));
                    m.put("kind", rs.getString("kind"));
                    m.put("mediaFamily", fam);
                    m.put("href", href);
                    m.put("episodeId", episode);
                    m.put("chapterId", rs.getObject("chapter_id", UUID.class));
                    m.put("editionId", rs.getObject("edition_id", UUID.class));
                    m.put("unitNumber", rs.getString("unit_number"));
                    m.put("unitTitle", rs.getString("unit_title"));
                    boolean available = rs.getBoolean("work_published") && rs.getBoolean("unit_available");
                    m.put("available", available);
                    m.put("unitHref", !available ? href : episode != null ? "/player?episode=" + episode : href);
                    return m;
                })
                .list();
        long total = jdbc.sql("SELECT count(*) FROM activity_history h JOIN work w ON w.id = h.work_id " + WHERE)
                .param("user", userId).param("family", family).param("work", f.workId())
                .param("from", f.from()).param("to", f.to())
                .query(Long.class).single();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("page", page);
        out.put("size", size);
        out.put("totalElements", total);
        out.put("totalPages", (total + size - 1) / size);
        return out;
    }

    /** Remove uma atividade do próprio usuário (de outro usuário: 404, sem revelar existência). */
    public void remove(long userId, long id) {
        int removed = jdbc.sql("DELETE FROM activity_history WHERE user_id = ? AND id = ?").params(userId, id).update();
        if (removed == 0) {
            throw ProgressException.notFound("Atividade não encontrada.");
        }
    }

    /** Limpa o histórico inteiro ou um período. Progresso e biblioteca continuam. */
    public long clear(long userId, OffsetDateTime from, OffsetDateTime to) {
        return jdbc.sql("""
                DELETE FROM activity_history WHERE user_id = :user
                  AND (CAST(:from AS TIMESTAMPTZ) IS NULL OR occurred_at >= :from)
                  AND (CAST(:to AS TIMESTAMPTZ) IS NULL OR occurred_at < :to)""")
                .param("user", userId).param("from", from).param("to", to)
                .update();
    }
}
