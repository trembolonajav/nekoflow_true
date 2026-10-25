package com.nekoflow.catalog;

import com.nekoflow.auth.CurrentUser;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/sync")
public class HiAnimeSyncController {
    private final HiAnimeSyncService sync;
    private final HiAnimeSyncImporter importer;

    public HiAnimeSyncController(HiAnimeSyncService sync, HiAnimeSyncImporter importer) {
        this.sync = sync;
        this.importer = importer;
    }

    @GetMapping("/dashboard") public Map<String, Object> dashboard() { return sync.dashboard(); }
    @GetMapping("/runs") public List<Map<String, Object>> runs() { return sync.runs(); }
    @GetMapping("/candidates") public List<Map<String, Object>> candidates(@RequestParam(defaultValue="") String status) {
        return sync.candidates(status);
    }
    @GetMapping("/works") public List<Map<String, Object>> works() { return sync.watches(); }

    @PostMapping("/runs")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> run() { return Map.of("id", sync.triggerManual(CurrentUser.id()), "status", "QUEUED"); }

    @PostMapping("/candidates/{id}/approve")
    public Map<String, Object> approve(@PathVariable UUID id) { return importer.approve(id, CurrentUser.id()); }

    @PostMapping("/candidates/{id}/ignore")
    public Map<String, Object> ignore(@PathVariable UUID id) {
        importer.ignore(id);
        return Map.of("id", id, "status", "IGNORED");
    }

    public record Settings(boolean enabled, boolean autoPublish) {}

    @PutMapping("/works/{id}/settings")
    public Map<String, Object> settings(@PathVariable UUID id, @RequestBody Settings body) {
        sync.settings(id, body.enabled(), body.autoPublish());
        return Map.of("workId", id, "enabled", body.enabled(), "autoPublish", body.autoPublish());
    }
}
