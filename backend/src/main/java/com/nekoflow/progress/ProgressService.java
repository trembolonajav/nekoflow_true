package com.nekoflow.progress;

import com.nekoflow.progress.UnitCatalog.ChapterUnit;
import com.nekoflow.progress.UnitCatalog.EpisodeUnit;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Progresso pessoal por episódio e por capítulo + edição.
 *
 * <p>Sincronização entre dispositivos: cada registro tem uma versão. Uma atualização só é
 * aceita quando informa a versão atual ({@code expectedVersion}); caso contrário o servidor
 * responde 409 com o estado aceito, e o cliente reconcilia. Dentro de uma sessão de
 * reprodução/leitura, a sequência precisa crescer (eventos atrasados são rejeitados) e o
 * {@code eventId} torna reenvios idempotentes. Retroceder a posição é permitido: vale a
 * última intenção confirmada, nunca "o maior tempo".
 */
@Service
public class ProgressService {

    /** Taxa máxima de reprodução aceita para o tempo efetivamente assistido. */
    static final double MAX_PLAYBACK_RATE = 2.0;
    /** Primeiro evento de uma sessão: tempo assistido declarado limitado a 60 s. */
    static final long FIRST_EVENT_WATCH_CAP_MS = 60_000;
    static final long CLOCK_SLACK_MS = 3_000;
    static final long MAX_DURATION_MS = 6 * 60 * 60 * 1000L;
    /** Conclusão pelo player: chegou a 90% e assistiu de fato pelo menos metade. */
    static final double PLAYBACK_COMPLETION_POSITION = 0.90;
    static final double PLAYBACK_COMPLETION_WATCHED = 0.50;
    static final BigDecimal READER_COMPLETION_PERCENT = BigDecimal.valueOf(95);

    private final JdbcClient jdbc;
    private final UnitCatalog units;

    public ProgressService(JdbcClient jdbc, UnitCatalog units) {
        this.jdbc = jdbc;
        this.units = units;
    }

    public record EpisodeUpdate(Long positionMs, Long durationMs, Long watchedDeltaMs, Boolean completed,
                                UUID sessionId, Long sequence, Long expectedVersion, UUID eventId) {
    }

    public record ChapterUpdate(UUID editionId, Integer pageIndex, String segmentKey, BigDecimal segmentOffset,
                                BigDecimal percentComplete, Boolean completed, UUID sessionId, Long sequence,
                                Long expectedVersion, UUID eventId) {
    }

    record EpisodeRow(long version, long positionMs, Long durationMs, long watchedMs, OffsetDateTime completedAt,
                      String completionSource, UUID lastSessionId, Long lastSequence, OffsetDateTime startedAt,
                      OffsetDateTime lastActivityAt) {
    }

    record ChapterRow(long version, Integer pageIndex, String segmentKey, BigDecimal segmentOffset,
                      BigDecimal percentComplete, OffsetDateTime completedAt, String completionSource,
                      UUID lastSessionId, Long lastSequence, OffsetDateTime startedAt,
                      OffsetDateTime lastActivityAt) {
    }

    // ---- episódios -------------------------------------------------------------------

    public Map<String, Object> episode(long userId, UUID episodeId) {
        EpisodeUnit unit = units.episode(episodeId).orElseThrow(() -> ProgressException.notFound("Episódio não encontrado."));
        return episodeView(unit, episodeRow(userId, episodeId, false).orElse(null));
    }

    @Transactional
    public Map<String, Object> saveEpisode(long userId, UUID episodeId, EpisodeUpdate u) {
        requireSyncFields(u.sessionId(), u.sequence(), u.expectedVersion(), u.eventId());
        EpisodeUnit unit = publicEpisode(episodeId);
        if (!unit.reportsProgress()) {
            throw ProgressException.unprocessable("PROGRESS_NOT_VERIFIABLE",
                    "Esta fonte não informa o progresso da reprodução. Marque o episódio como assistido manualmente.");
        }
        EpisodeRow row = episodeRow(userId, episodeId, true).orElse(null);
        if (eventAccepted(userId, u.eventId())) {
            return withFlags(episodeView(unit, row), true);
        }
        guardOrdering(row == null ? null : row.lastSessionId(), row == null ? null : row.lastSequence(),
                row == null ? 0 : row.version(), u.sessionId(), u.sequence(), u.expectedVersion(),
                () -> episodeView(unit, row));

        long duration = validDuration(u.durationMs(), unit.durationSeconds());
        if (u.positionMs() == null || u.positionMs() < 0 || u.positionMs() > duration + 2_000) {
            throw ProgressException.badRequest("INVALID_POSITION", "Posição de reprodução inválida.");
        }
        long position = Math.min(u.positionMs(), duration);
        boolean sameSession = row != null && u.sessionId().equals(row.lastSessionId());
        long watched = Math.min(duration, (row == null ? 0 : row.watchedMs())
                + cappedWatchDelta(u.watchedDeltaMs(), sameSession ? row.lastActivityAt() : null));

        boolean wasDone = row != null && row.completedAt() != null;
        boolean finishing = Boolean.TRUE.equals(u.completed()) && !wasDone;
        if (finishing && (position < duration * PLAYBACK_COMPLETION_POSITION
                || watched < duration * PLAYBACK_COMPLETION_WATCHED)) {
            throw ProgressException.unprocessable("PLAYBACK_COMPLETION_UNVERIFIED",
                    "A reprodução não chegou ao fim de forma verificável. Você pode marcar como assistido manualmente.");
        }

        long next = (row == null ? 0 : row.version()) + 1;
        int written;
        if (row == null) {
            written = jdbc.sql("""
                    INSERT INTO episode_progress (user_id, episode_id, position_ms, duration_ms, watched_ms, completed_at,
                                                  completion_source, version, last_session_id, last_sequence)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, episode_id) DO NOTHING""")
                    .params(userId, episodeId, position, duration, watched, finishing ? OffsetDateTime.now() : null,
                            finishing ? "PLAYBACK" : null, next, u.sessionId(), u.sequence())
                    .update();
        } else {
            written = jdbc.sql("""
                    UPDATE episode_progress SET position_ms = ?, duration_ms = ?, watched_ms = ?,
                        completed_at = CASE WHEN ? THEN now() ELSE completed_at END,
                        completion_source = CASE WHEN ? THEN 'PLAYBACK' ELSE completion_source END,
                        version = ?, last_session_id = ?, last_sequence = ?, last_activity_at = now()
                    WHERE user_id = ? AND episode_id = ? AND version = ?""")
                    .params(position, duration, watched, finishing, finishing, next, u.sessionId(), u.sequence(),
                            userId, episodeId, row.version())
                    .update();
        }
        if (written == 0) {
            throw ProgressException.conflict("PROGRESS_VERSION_CONFLICT",
                    "O progresso foi alterado em outro dispositivo.", episode(userId, episodeId));
        }
        if (row == null) {
            history(userId, unit.workId(), episodeId, null, null, "STARTED", "PLAYER", u.sessionId());
        } else if (!sameSession && !wasDone) {
            history(userId, unit.workId(), episodeId, null, null, "RESUMED", "PLAYER", u.sessionId());
        }
        if (finishing) {
            history(userId, unit.workId(), episodeId, null, null, "COMPLETED", "PLAYER", u.sessionId());
        }
        acceptEvent(userId, u.eventId(), "EPISODE", episodeId, u.sessionId(), u.sequence(), next);
        touchLibrary(userId, unit.workId());
        return withFlags(episode(userId, episodeId), false);
    }

    /** Conclusão marcada pelo usuário (fontes sem telemetria, ou correção manual). */
    @Transactional
    public Map<String, Object> completeEpisode(long userId, UUID episodeId) {
        EpisodeUnit unit = publicEpisode(episodeId);
        EpisodeRow row = episodeRow(userId, episodeId, true).orElse(null);
        if (row != null && row.completedAt() != null) {
            return episodeView(unit, row);
        }
        if (row == null) {
            int written = jdbc.sql("""
                    INSERT INTO episode_progress (user_id, episode_id, duration_ms, completed_at, completion_source, version)
                    VALUES (?, ?, ?, now(), 'MANUAL', 1) ON CONFLICT (user_id, episode_id) DO NOTHING""")
                    .params(userId, episodeId, unit.durationSeconds() == null ? null : unit.durationSeconds() * 1000L)
                    .update();
            if (written == 0) {
                return completeEpisode(userId, episodeId);
            }
        } else {
            jdbc.sql("""
                    UPDATE episode_progress SET completed_at = now(), completion_source = 'MANUAL',
                        version = version + 1, last_activity_at = now()
                    WHERE user_id = ? AND episode_id = ?""").params(userId, episodeId).update();
        }
        history(userId, unit.workId(), episodeId, null, null, "MANUAL_COMPLETED", "MANUAL", null);
        touchLibrary(userId, unit.workId());
        return episode(userId, episodeId);
    }

    /** Desmarca a conclusão, mantendo a posição salva. */
    @Transactional
    public Map<String, Object> reopenEpisode(long userId, UUID episodeId) {
        EpisodeUnit unit = units.episode(episodeId).orElseThrow(() -> ProgressException.notFound("Episódio não encontrado."));
        EpisodeRow row = episodeRow(userId, episodeId, true).orElse(null);
        if (row == null || row.completedAt() == null) {
            return episodeView(unit, row);
        }
        jdbc.sql("""
                UPDATE episode_progress SET completed_at = NULL, completion_source = NULL,
                    version = version + 1, last_activity_at = now()
                WHERE user_id = ? AND episode_id = ?""").params(userId, episodeId).update();
        history(userId, unit.workId(), episodeId, null, null, "REOPENED", "MANUAL", null);
        return episode(userId, episodeId);
    }

    /** Zera o progresso para recomeçar; o histórico não é apagado. */
    @Transactional
    public Map<String, Object> resetEpisode(long userId, UUID episodeId) {
        EpisodeUnit unit = units.episode(episodeId).orElseThrow(() -> ProgressException.notFound("Episódio não encontrado."));
        jdbc.sql("DELETE FROM episode_progress WHERE user_id = ? AND episode_id = ?").params(userId, episodeId).update();
        return episodeView(unit, null);
    }

    // ---- capítulos -------------------------------------------------------------------

    public Map<String, Object> chapter(long userId, UUID chapterId, UUID editionId) {
        if (editionId == null) {
            throw ProgressException.badRequest("EDITION_REQUIRED", "Informe a edição do capítulo.");
        }
        ChapterUnit unit = units.chapter(chapterId, editionId)
                .orElseThrow(() -> ProgressException.notFound("Capítulo ou edição não encontrado."));
        return chapterView(unit, chapterRow(userId, chapterId, editionId, false).orElse(null));
    }

    @Transactional
    public Map<String, Object> saveChapter(long userId, UUID chapterId, ChapterUpdate u) {
        requireSyncFields(u.sessionId(), u.sequence(), u.expectedVersion(), u.eventId());
        ChapterUnit unit = publicChapter(chapterId, u.editionId());
        if (!unit.reportsProgress()) {
            throw ProgressException.unprocessable("PROGRESS_NOT_VERIFIABLE",
                    "Esta leitura acontece fora do NekoFlow e não informa a posição. Marque o capítulo como lido manualmente.");
        }
        ChapterRow row = chapterRow(userId, chapterId, u.editionId(), true).orElse(null);
        if (eventAccepted(userId, u.eventId())) {
            return withFlags(chapterView(unit, row), true);
        }
        guardOrdering(row == null ? null : row.lastSessionId(), row == null ? null : row.lastSequence(),
                row == null ? 0 : row.version(), u.sessionId(), u.sequence(), u.expectedVersion(),
                () -> chapterView(unit, row));

        BigDecimal percent = u.percentComplete() == null ? BigDecimal.ZERO
                : u.percentComplete().setScale(3, RoundingMode.HALF_UP);
        if (percent.signum() < 0 || percent.compareTo(BigDecimal.valueOf(100)) > 0
                || (u.pageIndex() != null && u.pageIndex() < 0)
                || (u.segmentOffset() != null && (u.segmentOffset().signum() < 0
                    || u.segmentOffset().compareTo(BigDecimal.ONE) > 0))
                || (u.segmentKey() != null && u.segmentKey().length() > 160)
                || (u.pageIndex() == null && blank(u.segmentKey()) == null && percent.signum() > 0)) {
            throw ProgressException.badRequest("INVALID_POSITION",
                    "Posição de leitura inválida: informe a página ou o segmento.");
        }
        BigDecimal offset = u.segmentOffset() == null ? null : u.segmentOffset().setScale(6, RoundingMode.HALF_UP);
        boolean sameSession = row != null && u.sessionId().equals(row.lastSessionId());
        boolean wasDone = row != null && row.completedAt() != null;
        boolean finishing = Boolean.TRUE.equals(u.completed()) && !wasDone;
        if (finishing && percent.compareTo(READER_COMPLETION_PERCENT) < 0) {
            throw ProgressException.unprocessable("READING_COMPLETION_UNVERIFIED",
                    "A leitura não chegou ao fim do capítulo. Você pode marcar como lido manualmente.");
        }

        long next = (row == null ? 0 : row.version()) + 1;
        int written;
        if (row == null) {
            written = jdbc.sql("""
                    INSERT INTO chapter_progress (user_id, chapter_id, edition_id, page_index, segment_key, segment_offset,
                                                  percent_complete, completed_at, completion_source, version,
                                                  last_session_id, last_sequence)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, chapter_id, edition_id) DO NOTHING""")
                    .params(userId, chapterId, u.editionId(), u.pageIndex(), blank(u.segmentKey()), offset, percent,
                            finishing ? OffsetDateTime.now() : null, finishing ? "READER" : null, next, u.sessionId(),
                            u.sequence())
                    .update();
        } else {
            written = jdbc.sql("""
                    UPDATE chapter_progress SET page_index = ?, segment_key = ?, segment_offset = ?, percent_complete = ?,
                        completed_at = CASE WHEN ? THEN now() ELSE completed_at END,
                        completion_source = CASE WHEN ? THEN 'READER' ELSE completion_source END,
                        version = ?, last_session_id = ?, last_sequence = ?, last_activity_at = now()
                    WHERE user_id = ? AND chapter_id = ? AND edition_id = ? AND version = ?""")
                    .params(u.pageIndex(), blank(u.segmentKey()), offset, percent, finishing, finishing, next,
                            u.sessionId(), u.sequence(), userId, chapterId, u.editionId(), row.version())
                    .update();
        }
        if (written == 0) {
            throw ProgressException.conflict("PROGRESS_VERSION_CONFLICT",
                    "O progresso foi alterado em outro dispositivo.", chapter(userId, chapterId, u.editionId()));
        }
        if (row == null) {
            history(userId, unit.workId(), null, chapterId, u.editionId(), "STARTED", "READER", u.sessionId());
        } else if (!sameSession && !wasDone) {
            history(userId, unit.workId(), null, chapterId, u.editionId(), "RESUMED", "READER", u.sessionId());
        }
        if (finishing) {
            history(userId, unit.workId(), null, chapterId, u.editionId(), "COMPLETED", "READER", u.sessionId());
        }
        acceptEvent(userId, u.eventId(), "CHAPTER", chapterId, u.sessionId(), u.sequence(), next);
        touchLibrary(userId, unit.workId());
        return withFlags(chapter(userId, chapterId, u.editionId()), false);
    }

    @Transactional
    public Map<String, Object> completeChapter(long userId, UUID chapterId, UUID editionId) {
        ChapterUnit unit = publicChapter(chapterId, editionId);
        ChapterRow row = chapterRow(userId, chapterId, editionId, true).orElse(null);
        if (row != null && row.completedAt() != null) {
            return chapterView(unit, row);
        }
        if (row == null) {
            int written = jdbc.sql("""
                    INSERT INTO chapter_progress (user_id, chapter_id, edition_id, percent_complete, completed_at,
                                                  completion_source, version)
                    VALUES (?, ?, ?, 100, now(), 'MANUAL', 1) ON CONFLICT (user_id, chapter_id, edition_id) DO NOTHING""")
                    .params(userId, chapterId, editionId).update();
            if (written == 0) {
                return completeChapter(userId, chapterId, editionId);
            }
        } else {
            jdbc.sql("""
                    UPDATE chapter_progress SET completed_at = now(), completion_source = 'MANUAL', percent_complete = 100,
                        version = version + 1, last_activity_at = now()
                    WHERE user_id = ? AND chapter_id = ? AND edition_id = ?""")
                    .params(userId, chapterId, editionId).update();
        }
        history(userId, unit.workId(), null, chapterId, editionId, "MANUAL_COMPLETED", "MANUAL", null);
        touchLibrary(userId, unit.workId());
        return chapter(userId, chapterId, editionId);
    }

    @Transactional
    public Map<String, Object> reopenChapter(long userId, UUID chapterId, UUID editionId) {
        Map<String, Object> current = chapter(userId, chapterId, editionId);
        if (!Boolean.TRUE.equals(current.get("completed"))) {
            return current;
        }
        jdbc.sql("""
                UPDATE chapter_progress SET completed_at = NULL, completion_source = NULL,
                    version = version + 1, last_activity_at = now()
                WHERE user_id = ? AND chapter_id = ? AND edition_id = ?""")
                .params(userId, chapterId, editionId).update();
        long workId = units.chapter(chapterId, editionId).orElseThrow().workId();
        history(userId, workId, null, chapterId, editionId, "REOPENED", "MANUAL", null);
        return chapter(userId, chapterId, editionId);
    }

    @Transactional
    public Map<String, Object> resetChapter(long userId, UUID chapterId, UUID editionId) {
        chapter(userId, chapterId, editionId);
        jdbc.sql("DELETE FROM chapter_progress WHERE user_id = ? AND chapter_id = ? AND edition_id = ?")
                .params(userId, chapterId, editionId).update();
        return chapter(userId, chapterId, editionId);
    }

    // ---- regras compartilhadas -----------------------------------------------------------

    private static void requireSyncFields(UUID session, Long sequence, Long expectedVersion, UUID eventId) {
        if (session == null || sequence == null || sequence < 0 || expectedVersion == null || expectedVersion < 0
                || eventId == null) {
            throw ProgressException.badRequest("SYNC_FIELDS_REQUIRED",
                    "Informe sessionId, sequence, expectedVersion e eventId.");
        }
    }

    /**
     * Ordem dentro da sessão + versão do registro. Um evento atrasado da mesma sessão ou uma
     * gravação baseada numa versão antiga (outro dispositivo salvou depois) nunca sobrescreve
     * silenciosamente o progresso aceito.
     */
    private static void guardOrdering(UUID lastSession, Long lastSequence, long currentVersion, UUID session,
                                      long sequence, long expectedVersion,
                                      java.util.function.Supplier<Map<String, Object>> current) {
        if (session.equals(lastSession) && lastSequence != null && sequence <= lastSequence) {
            throw ProgressException.conflict("STALE_PROGRESS_EVENT",
                    "Esta atualização é mais antiga que a última recebida nesta sessão.", current.get());
        }
        if (expectedVersion != currentVersion) {
            throw ProgressException.conflict("PROGRESS_VERSION_CONFLICT",
                    "O progresso foi alterado em outro dispositivo.", current.get());
        }
    }

    private static long validDuration(Long durationMs, Integer catalogSeconds) {
        if (durationMs == null || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
            throw ProgressException.badRequest("INVALID_DURATION", "Duração de reprodução inválida.");
        }
        if (catalogSeconds != null && catalogSeconds > 0) {
            long expected = catalogSeconds * 1000L;
            long tolerance = Math.max(120_000, Math.round(expected * 0.15));
            if (Math.abs(durationMs - expected) > tolerance) {
                throw ProgressException.badRequest("INVALID_DURATION",
                        "A duração informada não corresponde à do episódio no catálogo.");
            }
        }
        return durationMs;
    }

    /** O tempo assistido declarado não pode crescer mais rápido que o relógio do servidor permite. */
    static long cappedWatchDelta(Long declared, OffsetDateTime previousInSession) {
        long delta = declared == null ? 0 : Math.max(0, declared);
        long cap = previousInSession == null ? FIRST_EVENT_WATCH_CAP_MS
                : Math.round(Math.max(0, Duration.between(previousInSession, OffsetDateTime.now()).toMillis())
                    * MAX_PLAYBACK_RATE) + CLOCK_SLACK_MS;
        return Math.min(delta, cap);
    }

    private EpisodeUnit publicEpisode(UUID id) {
        EpisodeUnit unit = units.episode(id).orElseThrow(() -> ProgressException.notFound("Episódio não encontrado."));
        if (!unit.published()) {
            throw ProgressException.notFound("Episódio não encontrado.");
        }
        return unit;
    }

    private ChapterUnit publicChapter(UUID id, UUID editionId) {
        if (editionId == null) {
            throw ProgressException.badRequest("EDITION_REQUIRED", "Informe a edição do capítulo.");
        }
        ChapterUnit unit = units.chapter(id, editionId)
                .orElseThrow(() -> ProgressException.notFound("Capítulo ou edição não encontrado."));
        if (!unit.published()) {
            throw ProgressException.notFound("Capítulo ou edição não encontrado.");
        }
        return unit;
    }

    private boolean eventAccepted(long userId, UUID eventId) {
        return jdbc.sql("SELECT count(*) FROM progress_sync_event WHERE user_id = ? AND event_id = ?")
                .params(userId, eventId).query(Long.class).single() > 0;
    }

    private void acceptEvent(long userId, UUID eventId, String type, UUID target, UUID session, long sequence,
                             long version) {
        jdbc.sql("""
                INSERT INTO progress_sync_event (user_id, event_id, media_type, target_id, session_id, sequence, accepted_version)
                VALUES (?, ?, ?, ?, ?, ?, ?)""")
                .params(userId, eventId, type, target, session, sequence, version).update();
    }

    private void history(long userId, long workId, UUID episodeId, UUID chapterId, UUID editionId, String type,
                         String source, UUID session) {
        jdbc.sql("""
                INSERT INTO activity_history (user_id, work_id, episode_id, chapter_id, edition_id, activity_type, source, session_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING""")
                .params(userId, workId, episodeId, chapterId, editionId, type, source, session).update();
    }

    /**
     * Começar a consumir coloca a obra "Em andamento", sem mudar escolhas explícitas
     * (pausado, abandonado, concluído).
     */
    private void touchLibrary(long userId, long workId) {
        jdbc.sql("""
                INSERT INTO library_entry (user_id, work_id, status) VALUES (?, ?, 'andamento')
                ON CONFLICT (user_id, work_id) DO UPDATE SET
                    status = CASE WHEN library_entry.status = 'planejado' THEN 'andamento' ELSE library_entry.status END,
                    updated_at = now()""")
                .params(userId, workId).update();
    }

    private Optional<EpisodeRow> episodeRow(long userId, UUID episodeId, boolean lock) {
        return jdbc.sql("""
                SELECT version, position_ms, duration_ms, watched_ms, completed_at, completion_source, last_session_id,
                       last_sequence, started_at, last_activity_at
                FROM episode_progress WHERE user_id = ? AND episode_id = ?""" + (lock ? " FOR UPDATE" : ""))
                .params(userId, episodeId)
                .query((rs, n) -> new EpisodeRow(rs.getLong(1), rs.getLong(2), (Long) rs.getObject(3), rs.getLong(4),
                        rs.getObject(5, OffsetDateTime.class), rs.getString(6), rs.getObject(7, UUID.class),
                        (Long) rs.getObject(8), rs.getObject(9, OffsetDateTime.class),
                        rs.getObject(10, OffsetDateTime.class)))
                .optional();
    }

    private Optional<ChapterRow> chapterRow(long userId, UUID chapterId, UUID editionId, boolean lock) {
        return jdbc.sql("""
                SELECT version, page_index, segment_key, segment_offset, percent_complete, completed_at, completion_source,
                       last_session_id, last_sequence, started_at, last_activity_at
                FROM chapter_progress WHERE user_id = ? AND chapter_id = ? AND edition_id = ?"""
                        + (lock ? " FOR UPDATE" : ""))
                .params(userId, chapterId, editionId)
                .query((rs, n) -> new ChapterRow(rs.getLong(1), (Integer) rs.getObject(2), rs.getString(3),
                        rs.getBigDecimal(4), rs.getBigDecimal(5), rs.getObject(6, OffsetDateTime.class),
                        rs.getString(7), rs.getObject(8, UUID.class), (Long) rs.getObject(9),
                        rs.getObject(10, OffsetDateTime.class), rs.getObject(11, OffsetDateTime.class)))
                .optional();
    }

    private static Map<String, Object> episodeView(EpisodeUnit unit, EpisodeRow row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("episodeId", unit.id());
        m.put("workId", unit.workPublicId());
        m.put("positionMs", row == null ? 0 : row.positionMs());
        m.put("durationMs", row != null && row.durationMs() != null ? row.durationMs()
                : unit.durationSeconds() == null ? null : unit.durationSeconds() * 1000L);
        m.put("watchedMs", row == null ? 0 : row.watchedMs());
        m.put("completed", row != null && row.completedAt() != null);
        m.put("completedAt", row == null ? null : row.completedAt());
        m.put("completionSource", row == null ? null : row.completionSource());
        m.put("version", row == null ? 0 : row.version());
        m.put("sessionId", row == null ? null : row.lastSessionId());
        m.put("sequence", row == null ? null : row.lastSequence());
        m.put("startedAt", row == null ? null : row.startedAt());
        m.put("lastActivityAt", row == null ? null : row.lastActivityAt());
        m.put("available", unit.available() && unit.published());
        m.put("verifiable", unit.reportsProgress());
        return m;
    }

    private static Map<String, Object> chapterView(ChapterUnit unit, ChapterRow row) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("chapterId", unit.id());
        m.put("editionId", unit.editionId());
        m.put("workId", unit.workPublicId());
        m.put("pageIndex", row == null ? null : row.pageIndex());
        m.put("segmentKey", row == null ? null : row.segmentKey());
        m.put("segmentOffset", row == null ? null : row.segmentOffset());
        m.put("percentComplete", row == null ? BigDecimal.ZERO : row.percentComplete());
        m.put("completed", row != null && row.completedAt() != null);
        m.put("completedAt", row == null ? null : row.completedAt());
        m.put("completionSource", row == null ? null : row.completionSource());
        m.put("version", row == null ? 0 : row.version());
        m.put("sessionId", row == null ? null : row.lastSessionId());
        m.put("sequence", row == null ? null : row.lastSequence());
        m.put("startedAt", row == null ? null : row.startedAt());
        m.put("lastActivityAt", row == null ? null : row.lastActivityAt());
        m.put("available", unit.available() && unit.published());
        m.put("verifiable", unit.reportsProgress());
        return m;
    }

    private static Map<String, Object> withFlags(Map<String, Object> view, boolean duplicate) {
        Map<String, Object> m = new LinkedHashMap<>(view);
        m.put("accepted", !duplicate);
        m.put("duplicate", duplicate);
        return m;
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
