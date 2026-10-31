package com.nekoflow.catalog;

import com.nekoflow.auth.CurrentUser;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Coleta, auditoria e importação editorial do acervo autorizado do Sushi Animes. */
@RestController
@RequestMapping("/api/admin/catalog/sushi-animes/archive")
public class SushiAnimesArchiveSyncController {
    private final SushiAnimesArchiveSyncService sync;

    public SushiAnimesArchiveSyncController(SushiAnimesArchiveSyncService sync) { this.sync = sync; }

    @PostMapping("/sync")
    public Map<String, Object> start(@RequestParam(defaultValue = "false") boolean refresh) {
        return sync.start(CurrentUser.id(), refresh);
    }

    @GetMapping("/status")
    public Map<String, Object> status() { return sync.status(); }
}
