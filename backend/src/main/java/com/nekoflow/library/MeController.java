package com.nekoflow.library;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.auth.CurrentUser;
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

/** Dados pessoais do usuário logado. */
@RestController
@RequestMapping("/api/me")
public class MeController {

    private final LibraryService library;
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    public MeController(LibraryService library, JdbcClient jdbc, ObjectMapper mapper) {
        this.library = library;
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public record StatusBody(String status) {
    }

    public record OnBody(boolean on) {
    }

    @GetMapping("/library")
    public List<Map<String, Object>> library() {
        return library.library(CurrentUser.id());
    }

    @PutMapping("/library/{workId}")
    public Map<String, Object> setStatus(@PathVariable long workId, @RequestBody StatusBody body) {
        try {
            library.setStatus(CurrentUser.id(), workId, LibraryStatus.of(body.status()));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        return library.workState(CurrentUser.id(), workId);
    }

    @DeleteMapping("/library/{workId}")
    public Map<String, Object> remove(@PathVariable long workId) {
        library.remove(CurrentUser.id(), workId);
        return library.workState(CurrentUser.id(), workId);
    }

    @PutMapping("/favorites/{workId}")
    public Map<String, Object> favorite(@PathVariable long workId, @RequestBody OnBody body) {
        library.setFavorite(CurrentUser.id(), workId, body.on());
        return library.workState(CurrentUser.id(), workId);
    }

    @GetMapping("/favorites")
    public List<Map<String, Object>> favorites() {
        return library.favorites(CurrentUser.id());
    }

    @PutMapping("/follows/{workId}")
    public Map<String, Object> follow(@PathVariable long workId, @RequestBody OnBody body) {
        library.setFollow(CurrentUser.id(), workId, body.on());
        return library.workState(CurrentUser.id(), workId);
    }

    /** Obras acompanhadas (alertas de lançamento) — usadas pela Minha Agenda do Calendário. */
    @GetMapping("/follows")
    public List<Long> follows() {
        return jdbc.sql("SELECT work_id FROM work_follow WHERE user_id = ?").param(CurrentUser.id())
                .query(Long.class).list();
    }

    @GetMapping("/works/{workId}")
    public Map<String, Object> workState(@PathVariable long workId) {
        return library.workState(CurrentUser.id(), workId);
    }

    @PutMapping("/progress/{workId}/{unit}")
    public Map<String, Object> progress(@PathVariable long workId, @PathVariable int unit,
                                        @RequestBody LibraryService.ProgressUpdate body) {
        if (unit < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return library.saveProgress(CurrentUser.id(), workId, unit, body);
    }

    @PostMapping("/opened/{workId}/{unit}")
    public Map<String, Object> opened(@PathVariable long workId, @PathVariable int unit) {
        library.recordOpened(CurrentUser.id(), workId, unit);
        return Map.of("ok", true);
    }

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        return library.summary(CurrentUser.id());
    }

    @GetMapping("/continue")
    public List<Map<String, Object>> continueWatching(@RequestParam(defaultValue = "8") int limit) {
        return library.continueWatching(CurrentUser.id(), Math.min(limit, 24));
    }

    @GetMapping("/history")
    public List<Map<String, Object>> history() {
        return library.history(CurrentUser.id());
    }

    @DeleteMapping("/history/{id}")
    public Map<String, Object> removeHistory(@PathVariable long id) {
        library.removeHistoryItem(CurrentUser.id(), id);
        return Map.of("ok", true);
    }

    @DeleteMapping("/history")
    public Map<String, Object> clearHistory() {
        library.clearHistory(CurrentUser.id());
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

    private JsonNode parse(String s) {
        try {
            return mapper.readTree(s);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }
}
