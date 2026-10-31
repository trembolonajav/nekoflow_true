package com.nekoflow.catalog;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Em que idioma do site cada obra existe (visão work_language_availability, somando todas as
 * fontes). A vitrine filtra pelo idioma do site só quando ele tem catálogo de verdade; com pouco
 * conteúdo (hoje, espanhol), mostra tudo para ninguém cair numa página vazia.
 */
@Service
public class LanguageAvailabilityService {

    public static final List<String> SITE_LANGUAGES = List.of("pt-BR", "en", "es");
    /** Abaixo disso o idioma ainda não sustenta uma vitrine própria. */
    static final int MIN_WORKS = 100;

    private static final Logger log = LoggerFactory.getLogger(LanguageAvailabilityService.class);

    private final JdbcClient jdbc;
    private volatile Map<Long, Map<String, String>> byWork;

    public LanguageAvailabilityService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(initialDelay = 10, fixedDelay = 10, timeUnit = TimeUnit.MINUTES)
    public void refresh() {
        try {
            jdbc.sql("REFRESH MATERIALIZED VIEW CONCURRENTLY work_language_availability").update();
        } catch (RuntimeException e) {
            log.warn("Idiomas por obra: atualização falhou ({})", e.getMessage());
        }
        reload();
    }

    /** obra → idioma → "dub,sub" (anime) ou "read" (leitura). Obra sem nada disponível não aparece. */
    public Map<Long, Map<String, String>> byWork() {
        Map<Long, Map<String, String>> current = byWork;
        return current != null ? current : reload();
    }

    public Map<String, String> of(long workId) {
        return byWork().getOrDefault(workId, Map.of());
    }

    /** O idioma decide a vitrine? Só idiomas do site com catálogo suficiente. */
    public boolean filters(String lang) {
        return lang != null && summary().getOrDefault(lang, Map.of()).get("filter") == Boolean.TRUE;
    }

    public Map<String, Map<String, Object>> summary() {
        Map<String, int[]> counts = new HashMap<>();
        byWork().values().forEach(langs -> langs.forEach((lang, kinds) -> {
            int[] c = counts.computeIfAbsent(lang, k -> new int[3]);
            c[0]++;
            if (kinds.contains("dub")) c[1]++;
            if (kinds.contains("read")) c[2]++;
        }));
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        for (String lang : SITE_LANGUAGES) {
            int[] c = counts.getOrDefault(lang, new int[3]);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("works", c[0]);
            m.put("dubbed", c[1]);
            m.put("reading", c[2]);
            m.put("filter", c[0] >= MIN_WORKS);
            out.put(lang, m);
        }
        return out;
    }

    /** Idioma do site a partir do que o front manda (pt, pt-BR, en-US…); desconhecido → null. */
    public static String siteLanguage(String code) {
        if (code == null) return null;
        String c = code.strip().toLowerCase().replace('_', '-');
        if (c.equals("pt") || c.equals("pt-br")) return "pt-BR";
        if (c.equals("en") || c.startsWith("en-")) return "en";
        if (c.equals("es") || c.startsWith("es-")) return "es";
        return null;
    }

    private synchronized Map<Long, Map<String, String>> reload() {
        Map<Long, Map<String, String>> out = new HashMap<>();
        jdbc.sql("SELECT work_id, lang, dub_units, sub_units, read_units FROM work_language_availability")
                .query((rs, n) -> {
                    StringJoiner kinds = new StringJoiner(",");
                    if (rs.getInt(3) > 0) kinds.add("dub");
                    if (rs.getInt(4) > 0) kinds.add("sub");
                    if (rs.getInt(5) > 0) kinds.add("read");
                    if (kinds.length() > 0) {
                        out.computeIfAbsent(rs.getLong(1), k -> new LinkedHashMap<>()).put(rs.getString(2), kinds.toString());
                    }
                    return null;
                })
                .list();
        out.replaceAll((k, v) -> Collections.unmodifiableMap(v));
        byWork = Collections.unmodifiableMap(out);
        return byWork;
    }
}
