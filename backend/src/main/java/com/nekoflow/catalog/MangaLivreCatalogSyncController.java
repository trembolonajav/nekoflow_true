package com.nekoflow.catalog;

import com.nekoflow.auth.CurrentUser;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Sincronização editorial explícita; protegida pelas regras de /api/admin/catalog/**. */
@RestController
@RequestMapping("/api/admin/catalog/mangalivre")
public class MangaLivreCatalogSyncController {
    private final MangaLivreCatalogSyncService sync;
    private final MangaLivreArchiveSyncService archive;

    public MangaLivreCatalogSyncController(MangaLivreCatalogSyncService sync,
                                           MangaLivreArchiveSyncService archive) {
        this.sync = sync;
        this.archive = archive;
    }

    @PostMapping("/{slug}/sync")
    public Map<String, Object> sync(@PathVariable String slug) {
        return sync.sync(slug, CurrentUser.id());
    }

    @PostMapping("/archive/sync")
    public Map<String, Object> syncArchive() {
        return archive.start(CurrentUser.id());
    }

    @org.springframework.web.bind.annotation.GetMapping("/archive/status")
    public Map<String, Object> archiveStatus() {
        return archive.status();
    }
}
