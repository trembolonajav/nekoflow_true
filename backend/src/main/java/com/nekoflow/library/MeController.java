package com.nekoflow.library;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.auth.CurrentUser;
import com.nekoflow.progress.HistoryService;
import com.nekoflow.progress.ProgressException;
import com.nekoflow.progress.ResumeService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Rotas pessoais antigas (/api/me), mantidas por compatibilidade durante a transição.
 * Todas delegam para os serviços do Protocolo 05 — a mesma fonte de /api/v1/me.
 * O progresso antigo por número de unidade (tabela {@code progress}) não é mais lido nem
 * gravado: ele só continha dados de demonstração sem vínculo com episódios reais.
 */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final PersonalLibraryService library;
    private final ResumeService resume;
    private final HistoryService history;
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    public MeController(PersonalLibraryService library, ResumeService resume, HistoryService history,
                        JdbcClient jdbc, ObjectMapper mapper) {
        this.library = library;
        this.resume = resume;
        this.history = history;
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public record StatusBody(String status) {
    }

    public record OnBody(boolean on) {
    }

    @GetMapping("/library")
    public Object library() {
        return library.list(CurrentUser.id(), new PersonalLibraryService.Query(null, null, null, null, "recent"),
                0, 100).get("items");
    }

    @PutMapping("/library/{workId}")
    public Map<String, Object> setStatus(@PathVariable String workId, @RequestBody StatusBody body) {
        library.setStatus(CurrentUser.id(), workId, body == null ? null : body.status());
        return workState(workId);
    }

    @DeleteMapping("/library/{workId}")
    public Map<String, Object> remove(@PathVariable String workId) {
        library.remove(CurrentUser.id(), workId);
        return workState(workId);
    }

    @PutMapping("/favorites/{workId}")
    public Map<String, Object> favorite(@PathVariable String workId, @RequestBody OnBody body) {
        library.favorite(CurrentUser.id(), workId, body != null && body.on());
        return workState(workId);
    }

    @GetMapping("/favorites")
    public Object favorites() {
        return library.favorites(CurrentUser.id(), 0, 100).get("items");
    }

    @PutMapping("/follows/{workId}")
    public Map<String, Object> follow(@PathVariable String workId, @RequestBody OnBody body) {
        library.follow(CurrentUser.id(), workId, body != null && body.on());
        return workState(workId);
    }

    /** Ids numéricos das obras acompanhadas (Minha Agenda do Calendário). */
    @GetMapping("/follows")
    public List<Long> follows() {
        return library.follows(CurrentUser.id()).stream().map(f -> (Long) f.get("legacyId")).toList();
    }

    /**
     * Estado pessoal no formato antigo das páginas do design. {@code units} fica vazio: essas
     * páginas não têm episódios/capítulos reais no catálogo, então não há progresso verdadeiro.
     */
    @GetMapping("/works/{workId}")
    public Map<String, Object> workState(@PathVariable String workId) {
        Map<String, Object> state = library.state(CurrentUser.id(), workId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("workId", state.get("legacyId"));
        m.put("publicId", state.get("workId"));
        m.put("inLibrary", state.get("inLibrary"));
        m.put("status", state.get("status"));
        m.put("favorite", state.get("favorite"));
        m.put("follow", state.get("follow"));
        m.put("units", Map.of());
        m.put("resumeUnit", null);
        m.put("upToDate", false);
        m.put("resume", state.get("resume"));
        return m;
    }

    @PutMapping("/progress/{workId}/{unit}")
    public Map<String, Object> progress(@PathVariable String workId, @PathVariable String unit) {
        throw legacyProgressDisabled();
    }

    @PostMapping("/opened/{workId}/{unit}")
    public Map<String, Object> opened(@PathVariable String workId, @PathVariable String unit) {
        throw legacyProgressDisabled();
    }

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        return library.summary(CurrentUser.id());
    }

    @GetMapping("/continue")
    public List<Map<String, Object>> continueWatching(@RequestParam(defaultValue = "8") int limit) {
        return resume.continueList(CurrentUser.id(), "ANIMATION", Math.min(Math.max(limit, 1), 24));
    }

    @GetMapping("/history")
    public Object history() {
        return history.list(CurrentUser.id(), new HistoryService.Filter(null, null, null, null), 0, 100).get("items");
    }

    @DeleteMapping("/history/{id}")
    public Map<String, Object> removeHistory(@PathVariable long id) {
        history.remove(CurrentUser.id(), id);
        return Map.of("ok", true);
    }

    @DeleteMapping("/history")
    public Map<String, Object> clearHistory() {
        history.clear(CurrentUser.id(), null, null);
        return Map.of("ok", true);
    }

    @GetMapping("/preferences")
    public JsonNode preferences() {
        return jdbc.sql("SELECT data::text FROM user_preferences WHERE user_id = ?").param(CurrentUser.id())
                .query(String.class).optional().map(this::parse).orElseGet(mapper::createObjectNode);
    }

    @PutMapping("/preferences")
    public JsonNode savePreferences(@RequestBody JsonNode body) {
        if (!body.isObject() || body.toString().length() > 10_000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        jdbc.sql("""
                INSERT INTO user_preferences (user_id, data) VALUES (?, ?::jsonb)
                ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data""")
                .params(CurrentUser.id(), body.toString()).update();
        return body;
    }

    private static ProgressException legacyProgressDisabled() {
        return new ProgressException(HttpStatus.GONE, "LEGACY_PROGRESS_DISABLED",
                "O progresso agora é salvo por episódio ou capítulo em /api/v1/me/progress.");
    }

    private JsonNode parse(String s) {
        try {
            return mapper.readTree(s);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }
}
