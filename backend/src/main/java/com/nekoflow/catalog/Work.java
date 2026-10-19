package com.nekoflow.catalog;

import java.util.LinkedHashMap;
import java.util.Map;

public record Work(
        long id,
        String kind,
        String title,
        String altTitles,
        String cover,
        String banner,
        boolean webtoon,
        Integer year,
        Integer totalUnits,
        Integer availableUnits,
        String airingStatus,
        Integer popularity) {

    public boolean isAnimation() {
        return "anime".equals(kind) || "filme".equals(kind);
    }

    /** Unidades disponíveis: as publicadas, ou o total conhecido. */
    public Integer released() {
        return availableUnits != null ? availableUnits : totalUnits;
    }

    public String typeLabel() {
        return switch (kind) {
            case "anime" -> "Anime";
            case "filme" -> "Filme";
            case "manga" -> "Mangá";
            default -> webtoon ? "Manhwa · Webtoon" : "Manhwa";
        };
    }

    /** Página da obra no site (as duas páginas individuais que existem no design). */
    public String href() {
        if (id == 151807) {
            return "/obra";
        }
        if (id == 105398) {
            return "/obra-leitura";
        }
        return "/explorar?q=" + java.net.URLEncoder.encode(title, java.nio.charset.StandardCharsets.UTF_8)
                .replace("+", "%20");
    }

    /** Link para abrir uma unidade (episódio ou capítulo), quando a obra tem player/leitor. */
    public String unitHref(int unit) {
        if (id == 151807) {
            return "/player?ep=" + unit;
        }
        if (id == 105398) {
            return "/leitor?cap=" + unit;
        }
        return href();
    }

    public Map<String, Object> view() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("kind", kind);
        m.put("title", title);
        m.put("alt", altTitles);
        m.put("cover", cover);
        m.put("banner", banner);
        m.put("webtoon", webtoon);
        m.put("year", year);
        m.put("typeLabel", typeLabel());
        m.put("totalUnits", totalUnits);
        m.put("availableUnits", released());
        m.put("status", airingStatus);
        m.put("href", href());
        return m;
    }
}
