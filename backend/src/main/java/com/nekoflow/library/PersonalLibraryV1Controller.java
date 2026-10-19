package com.nekoflow.library;

import com.nekoflow.auth.CurrentUser;
import com.nekoflow.progress.HistoryService;
import com.nekoflow.progress.ProgressException;
import com.nekoflow.progress.ProgressService;
import com.nekoflow.progress.ResumeService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * API pessoal (Protocolo 05). O dono dos dados é sempre o usuário autenticado pelo
 * Spring Security; nenhum endpoint aceita userId vindo do navegador.
 */
@RestController
@RequestMapping("/api/v1/me")
public class PersonalLibraryV1Controller {

    private final PersonalLibraryService library;
    private final ProgressService progress;
    private final ResumeService resume;
    private final HistoryService history;

    public PersonalLibraryV1Controller(PersonalLibraryService library, ProgressService progress,
                                       ResumeService resume, HistoryService history) {
        this.library = library;
        this.progress = progress;
        this.resume = resume;
        this.history = history;
    }

    public record StatusBody(String status) {
    }

    // ---- biblioteca -------------------------------------------------------------------

    @GetMapping("/library")
    public Map<String, Object> library(@RequestParam(required = false) String media,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(required = false) Boolean favorite,
                                       @RequestParam(required = false) String q,
                                       @RequestParam(defaultValue = "recent") String sort,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "24") int size) {
        checkPage(page, size);
        return library.list(CurrentUser.id(), new PersonalLibraryService.Query(media, status, favorite, q, sort),
                page, size);
    }

    @GetMapping("/library/summary")
    public Map<String, Object> summary() {
        return library.summary(CurrentUser.id());
    }

    @GetMapping("/library/{workId}")
    public Map<String, Object> libraryState(@PathVariable String workId) {
        return library.state(CurrentUser.id(), workId);
    }

    @PutMapping("/library/{workId}")
    public Map<String, Object> setStatus(@PathVariable String workId, @RequestBody StatusBody body) {
        return library.setStatus(CurrentUser.id(), workId, body == null ? null : body.status());
    }

    @DeleteMapping("/library/{workId}")
    public Map<String, Object> removeFromLibrary(@PathVariable String workId) {
        return library.remove(CurrentUser.id(), workId);
    }

    @GetMapping("/favorites")
    public Map<String, Object> favorites(@RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "24") int size) {
        checkPage(page, size);
        return library.favorites(CurrentUser.id(), page, size);
    }

    @PutMapping("/favorites/{workId}")
    public Map<String, Object> favorite(@PathVariable String workId) {
        return library.favorite(CurrentUser.id(), workId, true);
    }

    @DeleteMapping("/favorites/{workId}")
    public Map<String, Object> unfavorite(@PathVariable String workId) {
        return library.favorite(CurrentUser.id(), workId, false);
    }

    @GetMapping("/follows")
    public List<Map<String, Object>> follows() {
        return library.follows(CurrentUser.id());
    }

    @PutMapping("/follows/{workId}")
    public Map<String, Object> follow(@PathVariable String workId) {
        return library.follow(CurrentUser.id(), workId, true);
    }

    @DeleteMapping("/follows/{workId}")
    public Map<String, Object> unfollow(@PathVariable String workId) {
        return library.follow(CurrentUser.id(), workId, false);
    }

    // ---- continuidade -----------------------------------------------------------------

    @GetMapping("/continue-watching")
    public List<Map<String, Object>> continueWatching(@RequestParam(defaultValue = "8") int limit) {
        return resume.continueList(CurrentUser.id(), "ANIMATION", Math.min(Math.max(limit, 1), 24));
    }

    @GetMapping("/continue-reading")
    public List<Map<String, Object>> continueReading(@RequestParam(defaultValue = "8") int limit) {
        return resume.continueList(CurrentUser.id(), "READING", Math.min(Math.max(limit, 1), 24));
    }

    // ---- progresso de episódios -------------------------------------------------------------

    @GetMapping("/progress/episodes/{episodeId}")
    public Map<String, Object> episode(@PathVariable UUID episodeId) {
        return progress.episode(CurrentUser.id(), episodeId);
    }

    @PutMapping("/progress/episodes/{episodeId}")
    public Map<String, Object> saveEpisode(@PathVariable UUID episodeId,
                                           @RequestBody ProgressService.EpisodeUpdate body) {
        return progress.saveEpisode(CurrentUser.id(), episodeId, requireBody(body));
    }

    @PutMapping("/progress/episodes/{episodeId}/completion")
    public Map<String, Object> completeEpisode(@PathVariable UUID episodeId) {
        return progress.completeEpisode(CurrentUser.id(), episodeId);
    }

    @DeleteMapping("/progress/episodes/{episodeId}/completion")
    public Map<String, Object> reopenEpisode(@PathVariable UUID episodeId) {
        return progress.reopenEpisode(CurrentUser.id(), episodeId);
    }

    @DeleteMapping("/progress/episodes/{episodeId}")
    public Map<String, Object> resetEpisode(@PathVariable UUID episodeId) {
        return progress.resetEpisode(CurrentUser.id(), episodeId);
    }

    // ---- progresso de capítulos (sempre com a edição) ----------------------------------------

    @GetMapping("/progress/chapters/{chapterId}")
    public Map<String, Object> chapter(@PathVariable UUID chapterId, @RequestParam UUID editionId) {
        return progress.chapter(CurrentUser.id(), chapterId, editionId);
    }

    @PutMapping("/progress/chapters/{chapterId}")
    public Map<String, Object> saveChapter(@PathVariable UUID chapterId,
                                           @RequestBody ProgressService.ChapterUpdate body) {
        return progress.saveChapter(CurrentUser.id(), chapterId, requireBody(body));
    }

    @PutMapping("/progress/chapters/{chapterId}/completion")
    public Map<String, Object> completeChapter(@PathVariable UUID chapterId, @RequestParam UUID editionId) {
        return progress.completeChapter(CurrentUser.id(), chapterId, editionId);
    }

    @DeleteMapping("/progress/chapters/{chapterId}/completion")
    public Map<String, Object> reopenChapter(@PathVariable UUID chapterId, @RequestParam UUID editionId) {
        return progress.reopenChapter(CurrentUser.id(), chapterId, editionId);
    }

    @DeleteMapping("/progress/chapters/{chapterId}")
    public Map<String, Object> resetChapter(@PathVariable UUID chapterId, @RequestParam UUID editionId) {
        return progress.resetChapter(CurrentUser.id(), chapterId, editionId);
    }

    // ---- histórico -------------------------------------------------------------------------

    @GetMapping("/history")
    public Map<String, Object> history(@RequestParam(required = false) String media,
                                       @RequestParam(required = false) UUID workId,
                                       @RequestParam(required = false)
                                       @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
                                       @RequestParam(required = false)
                                       @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "30") int size) {
        checkPage(page, size);
        return history.list(CurrentUser.id(), new HistoryService.Filter(media, workId, from, to), page, size);
    }

    @DeleteMapping("/history/{id}")
    public Map<String, Object> removeHistory(@PathVariable long id) {
        history.remove(CurrentUser.id(), id);
        return Map.of("removed", 1);
    }

    @DeleteMapping("/history")
    public Map<String, Object> clearHistory(@RequestParam(required = false)
                                            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
                                            @RequestParam(required = false)
                                            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to) {
        return Map.of("removed", history.clear(CurrentUser.id(), from, to));
    }

    private static void checkPage(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw new ProgressException(HttpStatus.BAD_REQUEST, "INVALID_PAGINATION", "Paginação inválida.");
        }
    }

    private static <T> T requireBody(T body) {
        if (body == null) {
            throw new ProgressException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Corpo da requisição ausente.");
        }
        return body;
    }
}
