package com.nekoflow.catalog;

import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.Locale;
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

    public String section() {
        return isAnimation() ? "animes" : "leituras";
    }

    public String titleSlug() {
        String normalized = Normalizer.normalize(title, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        return normalized.isBlank() ? "obra" : normalized;
    }

    /** O ID torna o slug único mesmo quando anime e leitura, ou duas obras, têm o mesmo título. */
    public String slug() {
        return titleSlug() + "-" + id;
    }

    /** Página canônica de qualquer obra cadastrada. */
    public String href() {
        return "/" + section() + "/" + slug();
    }

    /** Link para abrir uma unidade (episódio ou capítulo), quando a obra tem player/leitor. */
    public String unitHref(int unit) {
        if (id == 151807) {
            return "/player?obra=" + id + "&ep=" + unit;
        }
        if (id == 105398) {
            return "/leitor?obra=" + id + "&cap=" + unit;
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
        m.put("slug", slug());
        m.put("section", section());
        m.put("typeLabel", typeLabel());
        m.put("totalUnits", totalUnits);
        m.put("availableUnits", released());
        m.put("status", airingStatus);
        m.put("href", href());
        return m;
    }
}
