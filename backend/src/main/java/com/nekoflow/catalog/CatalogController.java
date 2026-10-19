package com.nekoflow.catalog;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/catalog")
public class CatalogController {

    private final WorkRepository works;

    public CatalogController(WorkRepository works) {
        this.works = works;
    }

    @GetMapping("/search")
    public List<Map<String, Object>> search(@RequestParam(defaultValue = "") String q,
                                            @RequestParam(defaultValue = "10") int limit) {
        return works.search(q, Math.min(Math.max(limit, 1), 50)).stream().map(Work::view).toList();
    }

    /** Catálogo completo no formato da busca global (inclui obras cadastradas pela equipe). */
    @GetMapping("/all")
    public List<Map<String, Object>> all() {
        return works.search("", 100_000).stream().map(w -> {
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", w.id());
            m.put("title", w.title());
            m.put("alt", w.altTitles());
            m.put("cover", w.cover());
            m.put("banner", w.banner());
            m.put("kind", w.kind());
            m.put("webtoon", w.webtoon());
            m.put("year", w.year());
            m.put("eps", "anime".equals(w.kind()) ? w.totalUnits() : null);
            m.put("ch", w.isAnimation() ? null : w.totalUnits());
            m.put("pop", w.popularity() == null ? 1 : w.popularity());
            m.put("status", w.airingStatus());
            m.put("href", w.href());
            return m;
        }).toList();
    }

    @GetMapping("/works/{id}")
    public Map<String, Object> get(@PathVariable long id) {
        return works.require(id).view();
    }

    @GetMapping("/{section}/{slug}")
    public Map<String, Object> bySlug(@PathVariable String section, @PathVariable String slug) {
        if (!"animes".equals(section) && !"leituras".equals(section)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Obra não encontrada.");
        }
        return works.findBySlug(section, slug)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Obra não encontrada."))
                .view();
    }
}
