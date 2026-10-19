package com.nekoflow.progress;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Leitura das unidades reais do catálogo (Protocolo 04) com as mesmas regras públicas:
 * uma unidade é pública quando a obra (e a temporada) está PUBLISHED, e disponível quando
 * possui uma fonte habilitada. O progresso referencia a unidade, nunca a URL da fonte.
 */
@Component
public class UnitCatalog {

    private final JdbcClient jdbc;

    public UnitCatalog(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record EpisodeUnit(UUID id, long workId, UUID workPublicId, boolean published, Integer durationSeconds,
                              boolean available, boolean reportsProgress) {
    }

    public record ChapterUnit(UUID id, UUID editionId, long workId, UUID workPublicId, boolean published,
                              boolean available, boolean reportsProgress) {
    }

    public Optional<EpisodeUnit> episode(UUID id) {
        return jdbc.sql("""
                SELECT e.id, s.work_id, w.public_id,
                       (w.visibility = 'PUBLISHED' AND s.visibility = 'PUBLISHED') AS published,
                       e.duration_seconds,
                       EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id = e.id AND es.enabled) AS available,
                       EXISTS (SELECT 1 FROM episode_source es
                               WHERE es.episode_id = e.id AND es.enabled AND es.reports_progress) AS reports_progress
                FROM episode e JOIN season s ON s.id = e.season_id JOIN work w ON w.id = s.work_id
                WHERE e.id = ?""")
                .param(id)
                .query((rs, n) -> new EpisodeUnit(rs.getObject(1, UUID.class), rs.getLong(2),
                        rs.getObject(3, UUID.class), rs.getBoolean(4), (Integer) rs.getObject(5),
                        rs.getBoolean(6), rs.getBoolean(7)))
                .optional();
    }

    public Optional<ChapterUnit> chapter(UUID id, UUID editionId) {
        return jdbc.sql("""
                SELECT c.id, c.edition_id, ed.work_id, w.public_id, w.visibility = 'PUBLISHED' AS published,
                       EXISTS (SELECT 1 FROM chapter_source cs WHERE cs.chapter_id = c.id AND cs.enabled) AS available,
                       EXISTS (SELECT 1 FROM chapter_source cs
                               WHERE cs.chapter_id = c.id AND cs.enabled AND cs.reports_progress) AS reports_progress
                FROM chapter c JOIN work_edition ed ON ed.id = c.edition_id JOIN work w ON w.id = ed.work_id
                WHERE c.id = ? AND c.edition_id = ?""")
                .params(id, editionId)
                .query((rs, n) -> new ChapterUnit(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                        rs.getLong(3), rs.getObject(4, UUID.class), rs.getBoolean(5), rs.getBoolean(6),
                        rs.getBoolean(7)))
                .optional();
    }
}
