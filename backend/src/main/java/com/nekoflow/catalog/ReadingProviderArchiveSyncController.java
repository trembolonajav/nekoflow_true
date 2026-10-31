package com.nekoflow.catalog;

import com.nekoflow.auth.CurrentUser;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Controle administrativo da importação integral das APIs de leitura. */
@RestController
@RequestMapping("/api/admin/catalog/reading-providers")
public class ReadingProviderArchiveSyncController {
    private final ReadingProviderArchiveSyncService sync;

    public ReadingProviderArchiveSyncController(ReadingProviderArchiveSyncService sync) { this.sync = sync; }

    @PostMapping("/{provider}/archive/sync")
    public Map<String, Object> start(@PathVariable String provider,
                                     @RequestParam(defaultValue = "false") boolean refresh) {
        return sync.start(provider, CurrentUser.id(), refresh);
    }

    @GetMapping("/{provider}/archive/status")
    public Map<String, Object> status(@PathVariable String provider) { return sync.status(provider); }

    @PostMapping("/archive/sync")
    public Map<String, Object> startAll(@RequestParam(defaultValue = "false") boolean refresh) {
        return sync.startAll(CurrentUser.id(), refresh);
    }

    @GetMapping("/archive/status")
    public Map<String, Object> statusAll() { return sync.statusAll(); }
}
