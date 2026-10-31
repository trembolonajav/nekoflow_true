package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Home de Leituras com o catálogo real, no mesmo formato de item que o design consome (antes
 * vinha de dados de exemplo): último capítulo no idioma do site, quando chegou, nota e
 * popularidade do AniList, temas de manhwa, dia de lançamento de webtoon e o anime da adaptação.
 *
 * Data do capítulo: a da publicação quando a fonte informa; senão, quando ele chegou ao
 * NekoFlow — sem contar a carga inicial de cada fonte, que não diz nada sobre lançamento.
 */
@Service
public class ReadingHomeService {

    private static final ZoneId BRT = ZoneId.of("America/Sao_Paulo");
    private static final int MAX_ITEMS = 600;
    private static final Duration CACHE = Duration.ofMinutes(5);
    private static final String[] DAYS = {"seg", "ter", "qua", "qui", "sex", "sab", "dom"};
    /** Temas da página (design) a partir das tags do AniList. */
    private static final Map<String, Set<String>> THEMES = Map.of(
            "regressao", Set.of("Time Manipulation", "Reincarnation", "Time Loop"),
            "murim", Set.of("Martial Arts", "Wuxia", "Cultivation"),
            "dungeon", Set.of("Dungeon", "Video Games", "Virtual World"),
            "epoca", Set.of("Historical", "Royal Affairs", "Nobility"));

    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private final LanguageAvailabilityService languages;
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(Instant at, Map<String, Object> value) {}

    public ReadingHomeService(JdbcClient jdbc, ObjectMapper mapper, LanguageAvailabilityService languages) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.languages = languages;
    }

    public Map<String, Object> home(String lang) {
        String site = LanguageAvailabilityService.siteLanguage(lang);
        String key = site == null ? "pt-BR" : site;
        Cached c = cache.get(key);
        if (c != null && c.at().plus(CACHE).isAfter(Instant.now())) return c.value();
        Map<String, Object> value = build(key);
        cache.put(key, new Cached(Instant.now(), value));
        return value;
    }

    private record Row(long id, String title, String kind, String category, boolean webtoon, String cover, String banner,
                       Integer popularity, String slug, JsonNode snapshot) {}

    record Chapter(String number, Instant at) {}

    private Map<String, Object> build(String site) {
        boolean filter = languages.filters(site);
        Map<Long, Map<String, String>> langs = languages.byWork();
        List<Row> works = new ArrayList<>(jdbc.sql("""
                SELECT w.id, w.title, w.kind, w.reading_category, w.webtoon, w.cover, w.banner, w.popularity, w.slug,
                       s.payload::text AS snapshot
                FROM work w LEFT JOIN work_anilist_snapshot s ON s.work_id=w.id
                WHERE w.media_family='READING' AND w.visibility='PUBLISHED' AND w.merged_into_id IS NULL""")
                .query((rs, n) -> new Row(rs.getLong("id"), rs.getString("title"), rs.getString("kind"),
                        rs.getString("reading_category"), rs.getBoolean("webtoon"), rs.getString("cover"),
                        rs.getString("banner"), (Integer) rs.getObject("popularity"), rs.getString("slug"),
                        tree(rs.getString("snapshot"))))
                .list());
        // Vitrine do idioma: só o que dá para ler nele (quando o idioma tem catálogo de leitura).
        works.removeIf(w -> !langs.containsKey(w.id()) || (filter && !langs.get(w.id()).containsKey(site)));
        Map<Long, List<Chapter>> chapters = latestChapters(works.stream().map(Row::id).toList(), site);
        Map<Long, Map<String, String>> adaptations = adaptations(works);
        Instant now = Instant.now();

        List<Map<String, Object>> items = new ArrayList<>();
        for (Row w : works) items.add(item(w, chapters.getOrDefault(w.id(), List.of()), adaptations.get(w.id()), now));
        items.sort(Comparator.comparingInt((Map<String, Object> m) -> -((Number) m.get("pop")).intValue()));
        // Payload enxuto: as mais populares, mais as que tiveram capítulo recente e os webtoons com dia.
        Set<Long> keep = new LinkedHashSet<>();
        items.stream().limit(MAX_ITEMS).forEach(m -> keep.add((Long) m.get("id")));
        items.stream().filter(m -> ((Number) m.get("hoursAgo")).longValue() < 24 * 30)
                .sorted(Comparator.comparingLong(m -> ((Number) m.get("hoursAgo")).longValue()))
                .limit(80).forEach(m -> keep.add((Long) m.get("id")));
        items.stream().filter(m -> m.get("day") != null).limit(200).forEach(m -> keep.add((Long) m.get("id")));
        List<Map<String, Object>> out = items.stream().filter(m -> keep.contains((Long) m.get("id"))).toList();

        Map<String, Object> featured = new LinkedHashMap<>();
        featured.put("todas", feature(out, m -> true, site));
        featured.put("mangas", feature(out, m -> "manga".equals(m.get("kind")), site));
        featured.put("manhwas", feature(out, m -> "manhwa".equals(m.get("kind")), site));
        featured.put("webtoons", feature(out, m -> Boolean.TRUE.equals(m.get("webtoon")), site));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("language", filter ? site : null);
        result.put("today", DAYS[now.atZone(BRT).getDayOfWeek().getValue() - 1]);
        result.put("items", out);
        result.put("featured", featured);
        return result;
    }

    private Map<String, Object> item(Row w, List<Chapter> chs, Map<String, String> anime, Instant now) {
        JsonNode s = w.snapshot();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", w.id());
        m.put("title", w.title());
        m.put("slug", w.slug());
        m.put("kind", w.kind());
        m.put("type", "manhwa".equals(w.kind()) ? "Manhwa" : "manhua".equals(w.kind()) ? "Manhua" : "Mangá");
        m.put("webtoon", w.webtoon() || "WEBTOON".equals(w.category()));
        m.put("cover", w.cover());
        m.put("banner", firstNonBlank(w.banner(), s.path("bannerImage").asText(null)));
        int score = s.path("averageScore").asInt(0);
        m.put("score", score == 0 ? null : String.format("%.1f", score / 10.0).replace('.', ','));
        int pop = w.popularity() != null ? w.popularity() : s.path("popularity").asInt(0);
        m.put("pop", Math.max(pop, 1));
        List<String> genres = new ArrayList<>();
        for (JsonNode g : s.path("genres")) {
            if (genres.size() == 2) break;
            genres.add(WorkPresentationService.GENRES.getOrDefault(g.asText(), g.asText()));
        }
        m.put("genres", String.join(" · ", genres));
        m.put("themes", themes(s));
        Chapter last = chs.isEmpty() ? null : chs.get(0);
        m.put("ch", last == null ? null : number(last.number()));
        m.put("when", last == null || last.at() == null ? "" : HomeService.relative(last.at(), now));
        m.put("hoursAgo", last == null || last.at() == null ? Long.MAX_VALUE / 2 : Duration.between(last.at(), now).toHours());
        Chapter prev = chs.size() > 1 ? chs.get(1) : null;
        m.put("prevWhen", prev == null || prev.at() == null ? "" : HomeService.relative(prev.at(), now));
        m.put("day", Boolean.TRUE.equals(m.get("webtoon")) ? weekday(chs, now) : null);
        m.put("anime", anime);
        m.put("chapters", chs.stream().limit(3).map(c -> Map.of("n", number(c.number()) == null ? c.number() : number(c.number()),
                "when", c.at() == null ? "" : HomeService.relative(c.at(), now))).toList());
        return m;
    }

    private Map<String, Object> feature(List<Map<String, Object>> items, java.util.function.Predicate<Map<String, Object>> tab,
                                        String site) {
        // Popular, com banner e capítulo nas últimas semanas; sem isso, a mais popular com banner.
        Map<String, Object> pick = items.stream().filter(tab).filter(m -> m.get("banner") != null)
                .filter(m -> ((Number) m.get("hoursAgo")).longValue() < 24 * 21).findFirst()
                .orElseGet(() -> items.stream().filter(tab).filter(m -> m.get("banner") != null).findFirst()
                        .orElseGet(() -> items.stream().filter(tab).findFirst().orElse(null)));
        if (pick == null) return null;
        Map<String, Object> f = new LinkedHashMap<>(pick);
        f.put("synopsis", synopsis((Long) pick.get("id"), site));
        return f;
    }

    private String synopsis(long workId, String lang) {
        List<String> found = jdbc.sql("""
                SELECT COALESCE(NULLIF(t.synopsis_short,''), t.synopsis_full) FROM work_translation t
                WHERE t.work_id=? AND t.language IN (?, 'en') ORDER BY (t.language=?) DESC LIMIT 1""")
                .params(workId, lang, lang).query(String.class).list();
        String text = found.isEmpty() || found.get(0) == null
                ? jdbc.sql("SELECT COALESCE(NULLIF(synopsis_short,''), synopsis_full) FROM work WHERE id=?")
                        .param(workId).query(String.class).optional().orElse(null)
                : found.get(0);
        return HomeService.shorten(text, 260);
    }

    /** Últimos 6 capítulos da edição no idioma do site (ou da maior edição), com a data conhecida. */
    private Map<Long, List<Chapter>> latestChapters(List<Long> ids, String site) {
        Map<Long, List<Chapter>> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        jdbc.sql("""
                WITH baseline AS (
                    SELECT provider, min(created_at) + interval '1 day' AS base FROM chapter_source GROUP BY provider
                ), best AS (
                    SELECT DISTINCT ON (e.work_id) e.work_id, e.id
                    FROM work_edition e
                    WHERE e.work_id IN (:ids)
                    ORDER BY e.work_id, (nk_site_lang(e.language) = :site) DESC NULLS LAST,
                             (SELECT count(*) FROM chapter c WHERE c.edition_id=e.id) DESC
                ), ranked AS (
                    SELECT b.work_id, c.id, c.display_number, c.published_at,
                           row_number() OVER (PARTITION BY b.work_id ORDER BY c.sort_position DESC) AS rn
                    FROM best b JOIN chapter c ON c.edition_id=b.id
                )
                SELECT r.work_id, r.display_number,
                       COALESCE(r.published_at::timestamptz,
                                (SELECT min(cs.created_at) FROM chapter_source cs JOIN baseline bl ON bl.provider=cs.provider
                                 WHERE cs.chapter_id=r.id AND cs.created_at > bl.base)) AS at
                FROM ranked r WHERE r.rn <= 6 ORDER BY r.work_id, r.rn""")
                .param("ids", ids).param("site", site)
                .query((rs, n) -> {
                    Timestamp at = rs.getTimestamp("at");
                    return out.computeIfAbsent(rs.getLong("work_id"), k -> new ArrayList<>())
                            .add(new Chapter(rs.getString("display_number"), at == null ? null : at.toInstant()));
                }).list();
        return out;
    }

    /** Anime da adaptação, quando ele existe no NekoFlow (relação ADAPTATION do AniList). */
    private Map<Long, Map<String, String>> adaptations(List<Row> works) {
        Map<String, Long> wanted = new HashMap<>();
        for (Row w : works) {
            for (JsonNode e : w.snapshot().path("relations").path("edges")) {
                JsonNode node = e.path("node");
                if ("ADAPTATION".equals(e.path("relationType").asText()) && "ANIME".equals(node.path("type").asText())) {
                    wanted.putIfAbsent(node.path("id").asText(), w.id());
                }
            }
        }
        Map<Long, Map<String, String>> out = new HashMap<>();
        if (wanted.isEmpty()) return out;
        jdbc.sql("""
                SELECT DISTINCT ON (x.external_id) x.external_id, w.title, w.cover, w.banner, w.slug
                FROM external_identifier x JOIN work w ON w.id=x.work_id
                WHERE x.provider='ANILIST' AND x.external_id IN (:ids) AND w.media_family='ANIMATION'
                  AND w.visibility='PUBLISHED' ORDER BY x.external_id, w.id""")
                .param("ids", wanted.keySet())
                .query((rs, n) -> {
                    Map<String, String> a = new LinkedHashMap<>();
                    a.put("title", rs.getString("title"));
                    a.put("cover", rs.getString("cover"));
                    a.put("banner", rs.getString("banner"));
                    a.put("href", "/animes/" + rs.getString("slug"));
                    return out.putIfAbsent(wanted.get(rs.getString("external_id")), a);
                }).list();
        return out;
    }

    static List<String> themes(JsonNode snapshot) {
        Set<String> tags = new LinkedHashSet<>();
        for (JsonNode t : snapshot.path("tags")) {
            if (t.path("rank").asInt(0) >= 50 && !t.path("isMediaSpoiler").asBoolean(false)) tags.add(t.path("name").asText());
        }
        List<String> out = new ArrayList<>();
        THEMES.forEach((theme, names) -> {
            if (names.stream().anyMatch(tags::contains)) out.add(theme);
        });
        return out;
    }

    /** Dia da semana em que o webtoon costuma sair: o mais frequente nos últimos capítulos datados. */
    static String weekday(List<Chapter> chapters, Instant now) {
        Map<DayOfWeek, Integer> count = new HashMap<>();
        int dated = 0;
        for (Chapter c : chapters) {
            if (c.at() == null || c.at().isBefore(now.minus(Duration.ofDays(120)))) continue;
            dated++;
            count.merge(c.at().atZone(BRT).getDayOfWeek(), 1, Integer::sum);
        }
        if (dated < 3) return null;
        var best = count.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow();
        return best.getValue() * 2 > dated ? DAYS[best.getKey().getValue() - 1] : null;
    }

    private static Number number(String display) {
        if (display == null) return null;
        try {
            double d = Double.parseDouble(display.replace(',', '.'));
            return d == Math.floor(d) ? (Number) (long) d : d;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private JsonNode tree(String json) {
        try {
            return json == null ? mapper.createObjectNode() : mapper.readTree(json);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v;
        return null;
    }
}
