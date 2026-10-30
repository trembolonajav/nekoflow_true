package com.nekoflow.catalog;

import com.nekoflow.auth.CurrentUser;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Fila de obras duplicadas do painel (Catálogo): revisar, fundir ou marcar como obras diferentes. EDITOR+. */
@RestController
@RequestMapping("/api/admin/catalog/duplicates")
public class WorkIdentityController {

    private final WorkIdentityService identity;
    private final WorkMergeService merges;
    private final AniListReadingLinker linker;

    public WorkIdentityController(WorkIdentityService identity, WorkMergeService merges, AniListReadingLinker linker) {
        this.identity = identity;
        this.merges = merges;
        this.linker = linker;
    }

    /** Vínculo seguro das leituras ao AniList: andamento e contagens. */
    @GetMapping("/anilist-link")
    public Map<String, Object> linkStatus() {
        return linker.status();
    }

    @PostMapping("/anilist-link")
    public Map<String, Object> link() {
        return linker.start(true);
    }

    @GetMapping
    public Map<String, Object> list() {
        return identity.candidates();
    }

    @GetMapping("/history")
    public List<Map<String, Object>> history() {
        return merges.history();
    }

    @GetMapping("/proposal")
    public Map<String, Object> proposal(@RequestParam long source, @RequestParam long target) {
        return badRequest(() -> identity.proposalView(source, target));
    }

    @PostMapping("/merge")
    public Map<String, Object> merge(@RequestBody WorkMergeService.Request body) {
        return badRequest(() -> merges.merge(body, CurrentUser.id()));
    }

    @PostMapping("/merge-confident")
    public Map<String, Object> mergeConfident() {
        return merges.mergeConfident(CurrentUser.id());
    }

    public record Pair(long a, long b) {}

    @PostMapping("/dismiss")
    public Map<String, Object> dismiss(@RequestBody Pair body) {
        return badRequest(() -> {
            merges.dismiss(body.a(), body.b(), CurrentUser.id());
            return Map.of("ok", true);
        });
    }

    private static <T> T badRequest(Supplier<T> fn) {
        try {
            return fn.get();
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }
}
