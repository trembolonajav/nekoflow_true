package com.nekoflow.media;

import com.nekoflow.auth.CurrentUser;
import com.nekoflow.progress.ProgressException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Endpoints do Protocolo 06: reprodução, manifesto de leitura, problemas e importação. */
@RestController
public class MediaController {

    private static final Set<String> CATEGORIES = Set.of("VIDEO_NOT_LOADING", "WRONG_AUDIO", "SUBTITLE_SYNC",
            "WRONG_EPISODE", "IMAGE_MISSING", "WRONG_ORDER", "OTHER");

    private final PlaybackService playback;
    private final ReaderService reader;
    private final ChapterImportService imports;
    private final JdbcClient jdbc;

    public MediaController(PlaybackService playback, ReaderService reader, ChapterImportService imports,
                           JdbcClient jdbc) {
        this.playback = playback;
        this.reader = reader;
        this.imports = imports;
        this.jdbc = jdbc;
    }

    // ---- público ------------------------------------------------------------------------

    @GetMapping("/api/v1/episodes/{episodeId}/playback")
    public Map<String, Object> playback(@PathVariable UUID episodeId) {
        return playback.playback(episodeId);
    }

    @PostMapping("/api/v1/episodes/{episodeId}/playback/sources/{sourceId}/access")
    public Map<String, Object> access(@PathVariable UUID episodeId, @PathVariable UUID sourceId) {
        return playback.access(episodeId, sourceId);
    }

    @GetMapping("/api/v1/chapters/{chapterId}/editions/{editionId}/manifest")
    public Map<String, Object> manifest(@PathVariable UUID chapterId, @PathVariable UUID editionId) {
        return reader.manifest(chapterId, editionId);
    }

    // ---- usuário ------------------------------------------------------------------------

    public record IssueReport(UUID episodeId, UUID sourceId, UUID chapterId, UUID editionId, Integer pagePosition,
                              String category, String detail, Long positionMs) {
    }

    @PostMapping("/api/v1/me/media-issues")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> report(@RequestBody IssueReport body) {
        long user = CurrentUser.id();
        if (body == null || body.category() == null || !CATEGORIES.contains(body.category())) {
            throw ProgressException.badRequest("INVALID_ISSUE_CATEGORY", "Escolha o tipo de problema.");
        }
        if ((body.episodeId() == null) == (body.chapterId() == null)
                || (body.chapterId() != null && body.editionId() == null)) {
            throw ProgressException.badRequest("INVALID_ISSUE_TARGET", "Informe o episódio ou o capítulo e a edição.");
        }
        String detail = body.detail() == null ? null : body.detail().strip();
        if (detail != null && detail.length() > 500) {
            throw ProgressException.badRequest("ISSUE_DETAIL_TOO_LONG", "Descreva o problema em até 500 caracteres.");
        }
        Integer recent = jdbc.sql("""
                SELECT count(*) FROM media_issue_report WHERE user_id = ? AND created_at > now() - interval '1 hour'""")
                .param(user).query(Integer.class).single();
        if (recent >= 20) {
            throw new ProgressException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ISSUE_REPORTS",
                    "Você enviou muitos relatos na última hora. Tente novamente mais tarde.");
        }
        if (body.episodeId() != null) {
            playback.episode(body.episodeId()); // 404 para episódio oculto ou inexistente
            if (body.sourceId() != null && playback.sources(body.episodeId()).stream()
                    .noneMatch(s -> s.id().equals(body.sourceId()))) {
                throw ProgressException.badRequest("INVALID_ISSUE_TARGET", "A fonte não pertence a este episódio.");
            }
        } else {
            reader.chapter(body.chapterId(), body.editionId());
        }
        Long id = jdbc.sql("""
                INSERT INTO media_issue_report (user_id, episode_id, episode_source_id, chapter_id, edition_id,
                                                page_position, category, detail, position_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""")
                .params(user, body.episodeId(), body.sourceId(), body.chapterId(), body.editionId(),
                        body.pagePosition(), body.category(), detail, body.positionMs())
                .query(Long.class).single();
        return Map.of("id", id, "status", "OPEN");
    }

    // ---- editorial (EDITOR) ------------------------------------------------------------

    /** Capítulos de uma obra (inclusive rascunho) com o lote publicado e o último lote enviado. */
    @GetMapping("/api/admin/catalog/media/works/{publicId}/chapters")
    public List<Map<String, Object>> workChapters(@PathVariable UUID publicId) {
        return jdbc.sql("""
                SELECT c.id, c.display_number, c.title, ed.id AS edition_id, ed.name AS edition_name,
                       ed.reading_mode, ed.reading_direction,
                       (SELECT i.page_count FROM chapter_import i WHERE i.chapter_id = c.id
                          AND i.edition_id = ed.id AND i.status = 'PUBLISHED') AS published_pages,
                       (SELECT i.status FROM chapter_import i WHERE i.chapter_id = c.id AND i.edition_id = ed.id
                        ORDER BY i.created_at DESC LIMIT 1) AS last_import_status
                FROM chapter c JOIN work_edition ed ON ed.id = c.edition_id JOIN work w ON w.id = ed.work_id
                WHERE w.public_id = ? ORDER BY ed.is_original DESC, ed.name, c.sort_position""")
                .param(publicId)
                .query((rs, n) -> PlaybackService.map("id", rs.getObject(1, UUID.class), "number", rs.getString(2),
                        "title", rs.getString(3), "editionId", rs.getObject(4, UUID.class),
                        "editionName", rs.getString(5), "readingMode", rs.getString(6),
                        "direction", rs.getString(7), "publishedPages", rs.getObject(8),
                        "lastImportStatus", rs.getString(9)))
                .list();
    }

    @GetMapping("/api/admin/catalog/media/chapters/{chapterId}/imports")
    public List<Map<String, Object>> imports(@PathVariable UUID chapterId, @RequestParam UUID editionId) {
        return imports.list(chapterId, editionId);
    }

    @PostMapping(value = "/api/admin/catalog/media/chapters/{chapterId}/imports", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> upload(@PathVariable UUID chapterId, @RequestParam UUID editionId,
                                      @RequestParam("files") List<MultipartFile> files) {
        return imports.create(chapterId, editionId, files, CurrentUser.id());
    }

    @GetMapping("/api/admin/catalog/media/imports/{importId}")
    public Map<String, Object> importDetail(@PathVariable UUID importId) {
        return imports.detail(importId);
    }

    @PostMapping("/api/admin/catalog/media/imports/{importId}/publish")
    public Map<String, Object> publish(@PathVariable UUID importId) {
        return imports.publish(importId);
    }

    @DeleteMapping("/api/admin/catalog/media/imports/{importId}")
    public Map<String, Object> discard(@PathVariable UUID importId) {
        return imports.discard(importId);
    }

    @GetMapping("/api/admin/catalog/media/issues")
    public List<Map<String, Object>> issues() {
        return jdbc.sql("""
                SELECT r.id, r.category, r.detail, r.position_ms, r.page_position, r.status, r.created_at,
                       r.episode_id, r.chapter_id, r.edition_id, s.label AS source_label, u.username
                FROM media_issue_report r
                LEFT JOIN episode_source s ON s.id = r.episode_source_id
                LEFT JOIN app_user u ON u.id = r.user_id
                WHERE r.status = 'OPEN' ORDER BY r.created_at DESC LIMIT 200""")
                .query((rs, n) -> PlaybackService.map("id", rs.getLong(1), "category", rs.getString(2),
                        "detail", rs.getString(3), "positionMs", rs.getObject(4), "pagePosition", rs.getObject(5),
                        "status", rs.getString(6), "createdAt", rs.getTimestamp(7).toInstant(),
                        "episodeId", rs.getObject(8), "chapterId", rs.getObject(9), "editionId", rs.getObject(10),
                        "sourceLabel", rs.getString(11), "username", rs.getString(12)))
                .list();
    }
}
