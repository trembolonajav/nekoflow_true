package com.nekoflow.catalog;

import com.nekoflow.auth.CurrentUser;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Importação editorial do acervo em inglês; protegida pelas regras de /api/admin/catalog/**. */
@RestController
@RequestMapping("/api/admin/catalog/weebcentral-en/archive")
public class WeebCentralArchiveSyncController {
    private final WeebCentralArchiveSyncService sync;

    public WeebCentralArchiveSyncController(WeebCentralArchiveSyncService sync) { this.sync = sync; }

    @PostMapping("/sync")
    public Map<String, Object> start(@RequestParam(defaultValue = "false") boolean refresh) {
        return sync.start(CurrentUser.id(), refresh);
    }

    @GetMapping("/status")
    public Map<String, Object> status() { return sync.status(); }
}
