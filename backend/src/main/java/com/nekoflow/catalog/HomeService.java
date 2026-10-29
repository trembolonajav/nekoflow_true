package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Home com conteúdo real do catálogo: destaque curado (seed/home-curation.json), novidades da
 * temporada vigente pelo retrato do AniList e episódios recentes pela data de exibição.
 */
@Service
public class HomeService {

    private static final ZoneId BRT = ZoneId.of("America/Sao_Paulo");
    private static final Locale PT = Locale.forLanguageTag("pt-BR");
    private static final Set<String> ORIGINAL_AUDIO = Set.of("ja", "multi");
    private static final String AVAILABLE = """
            EXISTS(SELECT 1 FROM episode_source es WHERE es.episode_id=e.id AND es.enabled
              AND (es.available_from IS NULL OR es.available_from<=now())
              AND (es.available_until IS NULL OR es.available_until>now()))""";

    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private final JsonNode curation;
    private final LanguageAvailabilityService languages;

    public HomeService(JdbcClient jdbc, ObjectMapper mapper, LanguageAvailabilityService languages) throws IOException {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.languages = languages;
        try (InputStream in = new ClassPathResource("seed/home-curation.json").getInputStream()) {
            this.curation = mapper.readTree(in);
        }
    }

    public Map<String, Object> home(String lang, int size) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("seasonLabel", curation.path("seasonLabel").asText());
        out.put("hero", hero(lang));
        out.put("season", season(lang));
        out.put("recent", recent(0, size, lang));
        return out;
    }

    /** Idioma do site que filtra a vitrine, ou null quando ele ainda tem pouco catálogo (mostra tudo). */
    private String showcase(String lang) {
        String site = LanguageAvailabilityService.siteLanguage(lang);
        return languages.filters(site) ? site : null;
    }

    /** Destaques na ordem da curadoria; obras ausentes ou despublicadas ficam de fora. */
    List<Map<String, Object>> hero(String lang) {
        List<Long> ids = new ArrayList<>();
        curation.path("hero").forEach(n -> ids.add(n.asLong()));
        Map<Long, Work> works = works("w.id IN (:ids)", Map.of("ids", ids));
        Map<Long, Latest> latest = latest(ids, null);
        List<Map<String, Object>> out = new ArrayList<>();
        for (long id : ids) {
            Work w = works.get(id);
            if (w == null) continue;
            Latest l = latest.get(id);
            Map<String, Object> m = card(w);
            m.put("banner", firstNonBlank(w.banner, w.snapshot.path("bannerImage").asText(null), w.cover));
            List<String> genres = new ArrayList<>();
            for (JsonNode g : w.snapshot.path("genres")) {
                if (genres.size() == 2) break;
                genres.add(WorkPresentationService.GENRES.getOrDefault(g.asText(), g.asText()));
            }
            m.put("genres", String.join(" · ", genres));
            m.put("studio", w.snapshot.path("studios").path("nodes").path(0).path("name").asText(""));
            m.put("year", w.year);
            m.put("lastEp", l == null ? 0 : l.seasonCount);
            m.put("synopsis", synopsis(id, lang));
            out.add(m);
        }
        return out;
    }

    /** Obras da temporada vigente: curadoria primeiro, depois as que já têm episódio, por nota. */
    List<Map<String, Object>> season(String lang) {
        String site = showcase(lang);
        List<Long> priority = new ArrayList<>();
        curation.path("seasonPriority").forEach(n -> priority.add(n.asLong()));
        Map<Long, Work> works = works("w.media_family='ANIMATION' AND s.payload->>'season'=:season "
                        + "AND s.payload->>'seasonYear'=:year",
                Map.of("season", curation.path("season").asText(), "year", curation.path("seasonYear").asText()));
        Map<Long, Latest> latest = latest(new ArrayList<>(works.keySet()), site);
        // Curadoria que só existe em outro idioma continua, com o idioma no texto.
        Map<Long, Latest> elsewhere = site == null ? Map.of() : latest(priority.stream()
                .filter(id -> works.containsKey(id) && !latest.containsKey(id)).toList(), null);
        List<Work> list = dedupe(works.values(), latest);
        list.removeIf(w -> !priority.contains(w.id) && !latest.containsKey(w.id));
        list.sort(Comparator.<Work>comparingInt(w -> priority.contains(w.id) ? priority.indexOf(w.id) : Integer.MAX_VALUE)
                .thenComparing(w -> -w.snapshot.path("averageScore").asInt(0))
                .thenComparing(w -> w.title));
        int limit = curation.path("seasonLimit").asInt(30);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Work w : list.subList(0, Math.min(limit, list.size()))) {
            Map<String, Object> m = card(w);
            Latest l = latest.get(w.id);
            String day = weekday(w.snapshot);
            String meta;
            Latest other = elsewhere.get(w.id);
            if (l != null) meta = "Ep. " + l.number + (day == null ? "" : " · " + day);
            else if (other != null) meta = "Ep. " + other.number + " · " + otherLanguages(w.id, site);
            else if ("MOVIE".equals(w.snapshot.path("format").asText())) meta = "Filme · em breve";
            else meta = "Em breve";
            m.put("meta", meta);
            out.add(m);
        }
        return out;
    }

    /**
     * Último episódio disponível de cada obra, do mais recente para o mais antigo. A data vem de
     * original_air_date; sem ela, é estimada pelo próximo episódio agendado no AniList (séries
     * semanais). Obras fora do ar há mais de 120 dias não são "recentes".
     */
    public Map<String, Object> recent(int page, int size, String lang) {
        String site = showcase(lang);
        Map<Long, Work> works = works("w.media_family='ANIMATION'", Map.of());
        Map<Long, Latest> latest = latest(new ArrayList<>(works.keySet()), site);
        Instant now = Instant.now();
        List<Map<String, Object>> all = new ArrayList<>();
        for (Work w : dedupe(works.values(), latest)) {
            Latest l = latest.get(w.id);
            if (l == null) continue;
            Instant aired = airedAt(w, l);
            if (aired == null || aired.isAfter(now) || aired.isBefore(now.minus(Duration.ofDays(120)))) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", w.id);
            m.put("title", w.title);
            m.put("episodeId", l.episodeId);
            m.put("ep", "Episódio " + l.number);
            m.put("thumb", firstNonBlank(l.thumbnail, w.banner, w.snapshot.path("bannerImage").asText(null), w.cover));
            m.put("when", relative(aired, now));
            m.put("isNew", Duration.between(aired, now).toHours() < 72);
            m.put("lang", l.dub ? (l.original ? "LEG · DUB" : "DUB") : "LEG");
            m.put("airedAt", aired.toString());
            all.add(m);
        }
        all.sort(Comparator.comparing((Map<String, Object> m) -> (String) m.get("airedAt")).reversed());
        int from = Math.min(page * size, all.size());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", all.subList(from, Math.min(from + size, all.size())));
        out.put("page", page);
        out.put("size", size);
        out.put("totalElements", all.size());
        out.put("totalPages", (all.size() + size - 1) / size);
        out.put("language", site);
        return out;
    }

    // ---- consultas -------------------------------------------------------------------------

    private record Work(long id, String title, String cover, String banner, Integer year, String anilistId,
                        JsonNode snapshot) {}

    private record Latest(String episodeId, String number, String thumbnail, LocalDate airDate,
                          int seasonCount, boolean dub, boolean original) {}

    private Map<Long, Work> works(String where, Map<String, ?> params) {
        var sql = jdbc.sql("""
                SELECT w.id, w.title, w.cover, w.banner, w.year, s.payload::text AS payload,
                       (SELECT x.external_id FROM external_identifier x
                        WHERE x.work_id=w.id AND x.provider='ANILIST' ORDER BY x.external_id LIMIT 1) AS anilist
                FROM work w LEFT JOIN work_anilist_snapshot s ON s.work_id=w.id
                WHERE w.visibility='PUBLISHED' AND\s""" + where);
        for (var p : params.entrySet()) sql = sql.param(p.getKey(), p.getValue());
        Map<Long, Work> out = new LinkedHashMap<>();
        sql.query((rs, n) -> new Work(rs.getLong("id"), rs.getString("title"), rs.getString("cover"),
                        rs.getString("banner"), (Integer) rs.getObject("year"), rs.getString("anilist"),
                        tree(rs.getString("payload"))))
                .list().forEach(w -> out.put(w.id, w));
        return out;
    }

    /** Último episódio disponível da temporada mais adiantada de cada obra. */
    /**
     * Último episódio disponível de cada obra. Com site (idioma da vitrine), só conta episódio
     * dublado ou legendado nesse idioma, e DUB/LEG passam a se referir a ele.
     */
    private Map<Long, Latest> latest(List<Long> ids, String site) {
        Map<Long, Latest> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        String inLanguage = site == null ? "" : """
                 AND EXISTS(SELECT 1 FROM episode_source ls WHERE ls.episode_id=e.id AND ls.enabled
                   AND (nk_site_lang(ls.audio_language)=:site OR nk_site_lang(ls.language)=:site))""";
        var sql = jdbc.sql("""
                SELECT DISTINCT ON (se.work_id) se.work_id, e.id::text AS id, e.display_number, e.thumbnail_url,
                       e.original_air_date, count(*) OVER (PARTITION BY se.id) AS season_count,
                       (SELECT string_agg(DISTINCT es.audio_language, ',') FROM episode_source es
                        WHERE es.episode_id=e.id AND es.enabled) AS audio,
                       (SELECT string_agg(DISTINCT es.language, ',') FROM episode_source es
                        WHERE es.episode_id=e.id AND es.enabled) AS subs
                FROM episode e JOIN season se ON se.id=e.season_id
                WHERE se.work_id IN (:ids) AND se.visibility='PUBLISHED' AND\s""" + AVAILABLE + inLanguage + """

                ORDER BY se.work_id, se.sort_position DESC, e.sort_position DESC""")
                .param("ids", ids);
        if (site != null) sql = sql.param("site", site);
        sql.query((rs, n) -> {
                    String audio = rs.getString("audio");
                    boolean dub = false;
                    boolean original = audio == null;
                    for (String a : audio == null ? new String[0] : audio.split(",")) {
                        if (site != null) {
                            if (site.equals(LanguageAvailabilityService.siteLanguage(a))) dub = true;
                        } else if (ORIGINAL_AUDIO.contains(a)) original = true;
                        else dub = true;
                    }
                    if (site != null) {
                        String subs = rs.getString("subs");
                        original = subs != null && Arrays.stream(subs.split(","))
                                .anyMatch(x -> site.equals(LanguageAvailabilityService.siteLanguage(x)));
                    }
                    var date = rs.getDate("original_air_date");
                    out.put(rs.getLong("work_id"), new Latest(rs.getString("id"), rs.getString("display_number"),
                            rs.getString("thumbnail_url"), date == null ? null : date.toLocalDate(),
                            rs.getInt("season_count"), dub, original));
                    return 0;
                }).list();
        return out;
    }

    /** Obras repetidas (mesmo ID do AniList, ex.: importação do FIB): fica a com mais episódios. */
    private static final Map<String, String> LANGUAGE_NAME =
            Map.of("pt-BR", "em português", "en", "em inglês", "es", "em espanhol");

    /** "em inglês" / "em inglês e espanhol" para obra da curadoria sem versão no idioma da vitrine. */
    private String otherLanguages(long workId, String site) {
        List<String> names = languages.of(workId).keySet().stream().filter(l -> !l.equals(site))
                .map(LANGUAGE_NAME::get).toList();
        if (names.isEmpty()) return "em outro idioma";
        return names.size() == 1 ? names.get(0) : names.get(0) + " e " + names.get(1).replace("em ", "");
    }

    private static List<Work> dedupe(Iterable<Work> works, Map<Long, Latest> latest) {
        Map<String, Work> best = new LinkedHashMap<>();
        List<Work> out = new ArrayList<>();
        for (Work w : works) {
            if (w.anilistId == null) {
                out.add(w);
                continue;
            }
            Work prev = best.get(w.anilistId);
            int count = latest.containsKey(w.id) ? latest.get(w.id).seasonCount : 0;
            int prevCount = prev == null ? -1 : latest.containsKey(prev.id) ? latest.get(prev.id).seasonCount : 0;
            if (count > prevCount || (count == prevCount && w.id < prev.id)) best.put(w.anilistId, w);
        }
        out.addAll(best.values());
        return out;
    }

    private String synopsis(long workId, String lang) {
        List<String> found = jdbc.sql("""
                SELECT COALESCE(NULLIF(t.synopsis_short,''), t.synopsis_full) FROM work_translation t
                WHERE t.work_id=? AND t.language IN (?, 'en')
                ORDER BY (t.language=?) DESC LIMIT 1""")
                .params(workId, lang, lang).query(String.class).list();
        String text = found.isEmpty() || found.get(0) == null
                ? jdbc.sql("SELECT COALESCE(NULLIF(synopsis_short,''), synopsis_full) FROM work WHERE id=?")
                        .param(workId).query(String.class).optional().orElse(null)
                : found.get(0);
        return shorten(text, 280);
    }

    // ---- utilidades ------------------------------------------------------------------------

    private Map<String, Object> card(Work w) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", w.id);
        m.put("title", w.title);
        m.put("cover", firstNonBlank(w.cover, w.snapshot.path("coverImage").path("extraLarge").asText(null),
                w.snapshot.path("coverImage").path("large").asText(null)));
        int score = w.snapshot.path("averageScore").asInt(0);
        m.put("score", score > 0 ? String.format(PT, "%.1f", score / 10.0) : null);
        return m;
    }

    private static Instant airedAt(Work w, Latest l) {
        if (l.airDate != null) return l.airDate.atTime(12, 0).toInstant(ZoneOffset.UTC);
        JsonNode next = w.snapshot.path("nextAiringEpisode");
        Integer number = integer(l.number);
        if (next.has("airingAt") && number != null) {
            int ahead = next.path("episode").asInt() - number;
            if (ahead < 1) return null;
            return Instant.ofEpochSecond(next.path("airingAt").asLong()).minus(Duration.ofDays(7L * ahead));
        }
        JsonNode end = w.snapshot.path("endDate");
        if (end.path("year").isInt() && end.path("month").isInt() && end.path("day").isInt()) {
            return LocalDate.of(end.path("year").asInt(), end.path("month").asInt(), end.path("day").asInt())
                    .atTime(12, 0).toInstant(ZoneOffset.UTC);
        }
        return null;
    }

    private static String weekday(JsonNode snapshot) {
        JsonNode next = snapshot.path("nextAiringEpisode");
        if (!next.has("airingAt")) return null;
        String day = Instant.ofEpochSecond(next.path("airingAt").asLong()).atZone(BRT).getDayOfWeek()
                .getDisplayName(TextStyle.SHORT, PT).replace(".", "");
        return Character.toUpperCase(day.charAt(0)) + day.substring(1);
    }

    static String relative(Instant at, Instant now) {
        long hours = Duration.between(at, now).toHours();
        if (hours < 1) return "agora";
        if (hours < 24) return "há " + hours + " h";
        long days = hours / 24;
        if (days == 1) return "ontem";
        if (days < 7) return "há " + days + " dias";
        if (days < 14) return "há 1 semana";
        if (days < 31) return "há " + (days / 7) + " semanas";
        return at.atZone(BRT).toLocalDate().getDayOfMonth() + " "
                + at.atZone(BRT).getMonth().getDisplayName(TextStyle.SHORT, PT).replace(".", "");
    }

    static String shorten(String text, int limit) {
        if (text == null) return null;
        String clean = text.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").strip();
        if (clean.length() <= limit) return clean;
        int cut = clean.lastIndexOf(". ", limit);
        if (cut > limit / 2) return clean.substring(0, cut + 1);
        cut = clean.lastIndexOf(' ', limit);
        return clean.substring(0, cut > 0 ? cut : limit) + "…";
    }

    private static Integer integer(String value) {
        try {
            return value == null ? null : (int) Double.parseDouble(value.replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v;
        return null;
    }

    private JsonNode tree(String json) {
        try {
            return json == null ? mapper.createObjectNode() : mapper.readTree(json);
        } catch (IOException e) {
            return mapper.createObjectNode();
        }
    }
}
