package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Documento das fichas do design (Obra / ObraLeitura) para qualquer obra do catálogo.
 * Mesmo formato dos arquivos do Claude Design (obra.json / leitura-obra.json), montado com:
 * - o catálogo normalizado (títulos, sinopse, temporadas/episódios, edições/capítulos, relações);
 * - o retrato do AniList (personagens, dubladores, equipe, tags, nota, trailer, recomendações).
 * Nada é inventado: o que nenhuma das fontes informa fica vazio e a ficha esconde a seção.
 */
@Service
public class WorkPresentationService {

    private static final Locale PT = Locale.forLanguageTag("pt-BR");
    private static final DateTimeFormatter LONG_DATE = DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", PT);

    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    public WorkPresentationService(JdbcClient jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    record WorkRow(long id, UUID publicId, String kind, String title, String altTitles, String slug, String family,
                   String format, String cover, String banner, boolean webtoon, Integer year, Integer totalUnits,
                   String synopsisShort, String synopsisFull, String synopsisSource, String synopsisLanguage,
                   String storyStatus, String originCountry, LocalDate releaseDate) {
    }

    public Map<String, Object> build(UUID publicId) {
        return build(publicId, "pt-BR");
    }

    public Map<String, Object> build(UUID publicId, String language) {
        WorkRow w = work(publicId);
        JsonNode a = snapshot(w.id());
        Translation translation = translation(w, language);
        return "ANIMATION".equals(w.family()) ? anime(w, a, translation) : reading(w, a, translation);
    }

    record Translation(String language, String synopsisShort, String synopsisFull, String source, String requested) {
        Translation(String language, String synopsisShort, String synopsisFull, String source) {
            this(language, synopsisShort, synopsisFull, source, language);
        }
    }

    // ---- anime ---------------------------------------------------------------------------

    private Map<String, Object> anime(WorkRow w, JsonNode a, Translation translation) {
        Map<String, Object> d = common(w, a, translation);
        List<Map<String, Object>> seasons = seasons(w.id(), translation.requested());
        int episodes = seasons.stream().mapToInt(s -> ((List<?>) s.get("eps")).size()).sum();
        int available = (int) seasons.stream().flatMap(s -> ((List<Map<String, Object>>) s.get("eps")).stream())
                .filter(e -> Boolean.TRUE.equals(e.get("available"))).count();
        String format = formatLabel(text(a, "format"), "ANIMATION");
        Integer startYear = a.path("startDate").path("year").isInt() ? Integer.valueOf(a.path("startDate").path("year").asInt()) : w.year();
        Integer endYear = a.path("endDate").path("year").isInt() ? a.path("endDate").path("year").asInt() : null;
        String years = years(startYear, endYear);
        String status = statusLabel(text(a, "status"), w.storyStatus());
        d.put("seasons", seasons);
        d.put("episodeCount", episodes);
        d.put("availableCount", available);
        d.put("plannedEpisodes", a.path("episodes").isInt() ? a.path("episodes").asInt() : w.totalUnits());
        d.put("durationMin", a.path("duration").isInt() ? a.path("duration").asInt() : null);
        d.put("heroEyebrow", join(" · ", "Anime", format, years));
        d.put("statusText", join(" · ", status, seasons.isEmpty() ? null
                : seasons.size() == 1 ? "1 temporada" : seasons.size() + " temporadas"));
        d.put("trailer", "youtube".equalsIgnoreCase(text(a.path("trailer"), "site")) ? text(a.path("trailer"), "id") : null);
        JsonNode next = a.path("nextAiringEpisode");
        d.put("nextAiring", next.isObject() ? Map.of("episode", next.path("episode").asInt(),
                "airingAt", next.path("airingAt").asLong()) : null);

        List<Object[]> ficha = new ArrayList<>();
        add(ficha, "Título original", text(a.path("title"), "native"));
        add(ficha, "Formato", format);
        add(ficha, "Estúdio", studios(a, w.id()));
        add(ficha, "Direção", staff(a, "Director"));
        add(ficha, "Roteiro", staff(a, "Series Composition"));
        add(ficha, "Estreia", startDate(a, w));
        add(ficha, "Situação", (String) d.get("statusText"));
        Object planned = d.get("plannedEpisodes");
        add(ficha, "Episódios", join(" · ", planned == null ? null : planned + " previstos",
                available + " no NekoFlow", d.get("durationMin") == null ? null : d.get("durationMin") + " min"));
        add(ficha, "Origem", sourceLabel(text(a, "source")));
        add(ficha, "Áudio", audio(w.id()));
        add(ficha, "Fonte da sinopse", synopsisCredit(w));
        d.put("ficha", ficha);

        Map<String, Object> original = relatedCatalogWork(w.id(), "READING");
        d.put("original", original);
        d.put("order", animeOrder(w, a, format, years, episodes));
        d.put("reads", reads(a, original));
        return d;
    }

    private List<Map<String, Object>> seasons(long workId, String language) {
        List<Map<String, Object>> seasons = jdbc.sql("""
                SELECT s.id, s.title, s.display_number, s.release_date, w.title FROM season s JOIN work w ON w.id = s.work_id
                WHERE s.work_id = ? AND s.visibility = 'PUBLISHED' ORDER BY s.sort_position""")
                .param(workId)
                .query((rs, n) -> {
                    Map<String, Object> s = new LinkedHashMap<>();
                    s.put("n", n + 1);
                    s.put("id", rs.getObject(1, UUID.class));
                    String number = rs.getString(3) != null ? rs.getString(3) : String.valueOf(n + 1);
                    String title = rs.getString(2);
                    // Importações que repetem o nome da obra na temporada viram "Temporada N".
                    s.put("label", title == null || title.equalsIgnoreCase(rs.getString(5)) ? "Temporada " + number : title);
                    s.put("short", "Temporada " + (rs.getString(3) != null ? rs.getString(3) : n + 1));
                    Date release = rs.getDate(4);
                    s.put("years", release == null ? null : String.valueOf(release.toLocalDate().getYear()));
                    return s;
                })
                .list();
        for (Map<String, Object> s : seasons) {
            s.put("eps", jdbc.sql("""
                    SELECT e.id, e.display_number,
                           COALESCE((SELECT t.title FROM episode_translation t
                                     WHERE t.episode_id = e.id AND NULLIF(t.title, '') IS NOT NULL
                                     ORDER BY CASE WHEN t.language = :lang THEN 0
                                                   WHEN split_part(t.language,'-',1) = split_part(:lang,'-',1) THEN 1
                                                   WHEN t.language = 'en' THEN 2 ELSE 3 END LIMIT 1), e.title) AS title,
                           e.duration_seconds,
                           -- Só a miniatura do próprio episódio; sem ela, o card mostra o fundo neutro.
                           e.thumbnail_url, e.original_air_date,
                           EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id = e.id AND es.enabled
                                   AND (es.available_from IS NULL OR es.available_from <= now())
                                   AND (es.available_until IS NULL OR es.available_until > now())) AS available,
                           EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id = e.id AND es.enabled
                                   AND es.source_type IN ('HLS','MP4','DASH')) AS playable,
                           (SELECT string_agg(DISTINCT es.audio_language, ',' ORDER BY es.audio_language)
                            FROM episode_source es WHERE es.episode_id = e.id AND es.enabled
                              AND NULLIF(es.audio_language,'') IS NOT NULL) AS audio_languages,
                           -- Legenda só de fontes com áudio original: fonte dublada não "tem legenda".
                           (SELECT string_agg(DISTINCT es.language, ',' ORDER BY es.language)
                            FROM episode_source es WHERE es.episode_id = e.id AND es.enabled
                              AND NULLIF(es.language,'') IS NOT NULL
                              AND (es.audio_language IS NULL OR es.audio_language IN ('ja','multi'))) AS subtitle_languages
                    FROM episode e
                    JOIN season se ON se.id = e.season_id
                    JOIN work w ON w.id = se.work_id
                    WHERE e.season_id = :season ORDER BY e.sort_position""")
                    .param("season", s.get("id")).param("lang", language == null ? "pt-BR" : language)
                    .query((rs, n) -> {
                        Map<String, Object> e = new LinkedHashMap<>();
                        e.put("n", rs.getString(2));
                        e.put("id", rs.getObject(1, UUID.class));
                        e.put("title", episodeTitle(rs.getString(3), rs.getString(2)));
                        e.put("durationMin", rs.getObject(4) == null ? null : Math.round(rs.getInt(4) / 60.0));
                        e.put("thumb", rs.getString(5)); // miniatura cadastrada; sem ela, fundo neutro
                        java.sql.Date aired = rs.getDate(6);
                        e.put("airDate", aired == null ? null : aired.toLocalDate().toString());
                        e.put("pos", "center");
                        e.put("available", rs.getBoolean(7));
                        e.put("playable", rs.getBoolean(8));
                        List<String> audioLanguages = csv(rs.getString(9));
                        List<String> subtitleLanguages = csv(rs.getString(10));
                        e.put("audio", audioLanguages.isEmpty() ? null : audioLanguages.get(0));
                        e.put("audioLanguages", audioLanguages);
                        e.put("subtitleLanguages", subtitleLanguages);
                        e.put("dub", audioLanguages.stream().anyMatch(x -> !"ja".equalsIgnoreCase(x)));
                        return e;
                    })
                    .list());
        }
        return seasons;
    }

    private static List<String> csv(String value) {
        if (value == null || value.isBlank()) return List.of();
        return java.util.Arrays.stream(value.split(",")).map(String::strip).filter(x -> !x.isBlank()).toList();
    }

    private List<Map<String, Object>> animeOrder(WorkRow w, JsonNode a, String format, String years, int episodes) {
        List<Map<String, Object>> order = new ArrayList<>();
        order.add(orderItem(w.title(), join(" · ", format, "esta obra"),
                join(" · ", years, episodes > 0 ? episodes + (episodes == 1 ? " episódio" : " episódios") : null),
                w.cover(), null, "/animes/" + w.slug(), startYearOf(a, w)));
        for (JsonNode edge : a.path("relations").path("edges")) {
            JsonNode n = edge.path("node");
            String rel = edge.path("relationType").asText();
            if (!"ANIME".equals(n.path("type").asText())
                    || !Set.of("PREQUEL", "SEQUEL", "SIDE_STORY", "PARENT", "SUMMARY", "SPIN_OFF").contains(rel)) {
                continue;
            }
            String badge = "NOT_YET_RELEASED".equals(n.path("status").asText()) ? "Anunciado"
                    : "SUMMARY".equals(rel) ? "Compilação · opcional" : null;
            Integer y = n.path("startDate").path("year").isInt() ? n.path("startDate").path("year").asInt() : null;
            order.add(orderItem(title(n), formatLabel(n.path("format").asText(null), "ANIMATION"),
                    join(" · ", y == null ? "Data a confirmar" : String.valueOf(y),
                            n.path("episodes").isInt() ? n.path("episodes").asInt() + " episódios" : null),
                    text(n.path("coverImage"), "large"), badge, catalogHref(n.path("id").asLong(), n.path("siteUrl").asText(null)), y));
        }
        order.sort((x, y) -> Integer.compare(x.get("_y") == null ? 9999 : (Integer) x.get("_y"),
                y.get("_y") == null ? 9999 : (Integer) y.get("_y")));
        for (int i = 0; i < order.size(); i++) {
            order.get(i).remove("_y");
            order.get(i).put("n", String.format("%02d", i + 1));
        }
        return order;
    }

    private static Map<String, Object> orderItem(String title, String type, String meta, String cover, String badge,
                                                 String href, Integer year) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("title", title);
        o.put("type", type);
        o.put("meta", meta);
        o.put("cover", cover);
        o.put("badge", badge);
        o.put("note", null);
        o.put("href", href);
        o.put("_y", year);
        return o;
    }

    private List<Map<String, Object>> reads(JsonNode a, Map<String, Object> original) {
        List<Map<String, Object>> reads = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        if (original != null) {
            reads.add(readItem((String) original.get("title"), (String) original.get("typeLabel"),
                    "Obra original adaptada pelo anime", (String) original.get("cover"), (String) original.get("href")));
            seen.add(String.valueOf(original.get("legacyId")));
        }
        for (JsonNode edge : a.path("relations").path("edges")) {
            JsonNode n = edge.path("node");
            if (!"MANGA".equals(n.path("type").asText()) || !seen.add(n.path("id").asText())) {
                continue;
            }
            String rel = switch (edge.path("relationType").asText()) {
                case "SOURCE", "ADAPTATION" -> "Obra original adaptada pelo anime";
                case "SEQUEL" -> "Continuação";
                case "PREQUEL" -> "História anterior";
                case "SPIN_OFF", "SIDE_STORY" -> "História paralela";
                default -> "Obra relacionada";
            };
            reads.add(readItem(title(n), formatLabel(n.path("format").asText(null), "READING"), rel,
                    text(n.path("coverImage"), "large"),
                    catalogHref(n.path("id").asLong(), n.path("siteUrl").asText(null))));
        }
        return reads;
    }

    private static Map<String, Object> readItem(String title, String type, String rel, String cover, String href) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("title", title);
        r.put("type", type);
        r.put("rel", rel);
        r.put("cover", cover);
        r.put("href", href);
        r.put("initials", initials(title));
        return r;
    }

    // ---- leitura -------------------------------------------------------------------------

    private Map<String, Object> reading(WorkRow w, JsonNode a, Translation translation) {
        Map<String, Object> d = common(w, a, translation);
        List<Map<String, Object>> editions = editions(w.id());
        int chapters = editions.stream().mapToInt(e -> ((List<?>) e.get("chapters")).size()).max().orElse(0);
        String type = formatLabel(text(a, "format"), "READING");
        if ("MANGA".equals(text(a, "format")) && "KR".equals(text(a, "countryOfOrigin"))) {
            type = "Manhwa";
        }
        Integer startYear = a.path("startDate").path("year").isInt() ? Integer.valueOf(a.path("startDate").path("year").asInt()) : w.year();
        Integer endYear = a.path("endDate").path("year").isInt() ? a.path("endDate").path("year").asInt() : null;
        String status = statusLabel(text(a, "status"), w.storyStatus());
        d.put("editions", editions);
        d.put("chapterCount", chapters);
        d.put("typeLabel", w.webtoon() ? type + " · Webtoon" : type);
        d.put("heroTags", List.of(type.toUpperCase(PT), readingFormat(editions).toUpperCase(PT), status.toUpperCase(PT)));
        d.put("statusText", status);
        d.put("creditsLine", credits(w.id()));

        List<Object[]> ficha = new ArrayList<>();
        add(ficha, "Título original", text(a.path("title"), "native"));
        add(ficha, "Tipo", (String) d.get("typeLabel"));
        add(ficha, "Origem", countryLabel(text(a, "countryOfOrigin") != null ? text(a, "countryOfOrigin") : w.originCountry()));
        add(ficha, "Publicação", years(startYear, endYear));
        add(ficha, "Situação original", status);
        add(ficha, "Capítulos", a.path("chapters").isInt() ? a.path("chapters").asInt() + " no original" : null);
        add(ficha, "Formato", readingFormat(editions));
        add(ficha, "Na Nekoflow", editions.stream().map(e -> e.get("languageName") + ": "
                + ((List<?>) e.get("chapters")).stream().filter(c -> Boolean.TRUE.equals(((Map<?, ?>) c).get("available"))).count()
                + " capítulo(s)").reduce((x, y) -> x + " · " + y).orElse(null));
        add(ficha, "Fonte da sinopse", synopsisCredit(w));
        d.put("ficha", ficha);
        d.put("people", people(w.id(), a));

        Map<String, Object> anime = relatedCatalogWork(w.id(), "ANIMATION");
        if (anime != null) {
            anime.put("map", List.of());
        }
        d.put("anime", anime);
        List<Map<String, Object>> related = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        if (anime != null) {
            seen.add(String.valueOf(anime.get("legacyId")));
        }
        for (JsonNode edge : a.path("relations").path("edges")) {
            JsonNode n = edge.path("node");
            if (!seen.add(n.path("id").asText())) {
                continue;
            }
            String rel = switch (edge.path("relationType").asText()) {
                case "ADAPTATION" -> "ANIME".equals(n.path("type").asText()) ? "Adaptação em anime" : "Adaptação";
                case "SOURCE" -> "Obra original";
                case "SEQUEL" -> "Continuação";
                case "PREQUEL" -> "História anterior";
                case "SPIN_OFF", "SIDE_STORY" -> "História paralela";
                case "ALTERNATIVE" -> "Versão alternativa";
                default -> "Obra relacionada";
            };
            related.add(readItem(title(n), formatLabel(n.path("format").asText(null),
                    "ANIME".equals(n.path("type").asText()) ? "ANIMATION" : "READING"), rel,
                    text(n.path("coverImage"), "large"), catalogHref(n.path("id").asLong(), n.path("siteUrl").asText(null))));
        }
        d.put("related", related);
        return d;
    }

    private List<Map<String, Object>> editions(long workId) {
        List<Map<String, Object>> editions = jdbc.sql("""
                SELECT id, name, language, reading_mode, reading_direction FROM work_edition
                WHERE work_id = ? ORDER BY is_original DESC, name""")
                .param(workId)
                .query((rs, n) -> {
                    Map<String, Object> e = new LinkedHashMap<>();
                    e.put("id", rs.getObject(1, UUID.class));
                    e.put("name", rs.getString(2));
                    e.put("language", rs.getString(3));
                    e.put("languageName", languageName(rs.getString(3)));
                    e.put("readingMode", rs.getString(4));
                    e.put("direction", rs.getString(5));
                    return e;
                })
                .list();
        for (Map<String, Object> e : editions) {
            e.put("chapters", jdbc.sql("""
                    SELECT c.id, c.display_number, c.title, v.display_number AS volume,
                           EXISTS (SELECT 1 FROM chapter_import i WHERE i.chapter_id = c.id AND i.edition_id = c.edition_id
                                   AND i.status = 'PUBLISHED') AS readable,
                           (SELECT s.source_url FROM chapter_source s WHERE s.chapter_id = c.id AND s.enabled
                            ORDER BY s.created_at LIMIT 1) AS external_url
                    FROM chapter c LEFT JOIN volume v ON v.id = c.volume_id
                    WHERE c.edition_id = ? ORDER BY c.sort_position""")
                    .param(e.get("id"))
                    .query((rs, n) -> {
                        Map<String, Object> c = new LinkedHashMap<>();
                        c.put("id", rs.getObject(1, UUID.class));
                        c.put("n", rs.getString(2));
                        c.put("title", rs.getString(3));
                        c.put("volume", rs.getString(4));
                        c.put("readable", rs.getBoolean(5));
                        c.put("externalUrl", rs.getString(6));
                        c.put("available", rs.getBoolean(5) || rs.getString(6) != null);
                        return c;
                    })
                    .list());
        }
        return editions;
    }

    private static String readingFormat(List<Map<String, Object>> editions) {
        if (editions.isEmpty()) {
            return "Leitura";
        }
        Map<String, Object> e = editions.get(0);
        return "VERTICAL".equals(e.get("readingMode")) ? "Rolagem vertical"
                : "RTL".equals(e.get("direction")) ? "Paginado · dir. → esq." : "Paginado · esq. → dir.";
    }

    private List<Object[]> people(long workId, JsonNode a) {
        List<Object[]> people = new ArrayList<>();
        jdbc.sql("""
                SELECT p.name, c.role FROM work_contributor c JOIN person p ON p.id = c.person_id
                WHERE c.work_id = ? ORDER BY c.position""")
                .param(workId)
                .query((rs, n) -> new Object[]{roleLabel(rs.getString(2)), rs.getString(1)})
                .list()
                .forEach(people::add);
        if (people.isEmpty()) {
            for (JsonNode e : a.path("staff").path("edges")) {
                people.add(new Object[]{roleLabel(e.path("role").asText()), e.path("node").path("name").path("full").asText()});
                if (people.size() >= 4) {
                    break;
                }
            }
        }
        return people;
    }

    private String credits(long workId) {
        List<String> names = jdbc.sql("""
                SELECT p.name FROM work_contributor c JOIN person p ON p.id = c.person_id
                WHERE c.work_id = ? AND c.role IN ('ORIGINAL_STORY','STORY_AND_ART','ART','STORY')
                ORDER BY c.position""").param(workId).query(String.class).list();
        return names.isEmpty() ? null : String.join(" · ", new LinkedHashSet<>(names));
    }

    // ---- partes comuns ---------------------------------------------------------------------

    private Map<String, Object> common(WorkRow w, JsonNode a, Translation translation) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("id", w.id());
        d.put("publicId", w.publicId());
        d.put("slug", w.slug());
        d.put("href", ("ANIMATION".equals(w.family()) ? "/animes/" : "/leituras/") + w.slug());
        d.put("title", w.title());
        String nativeTitle = text(a.path("title"), "native");
        if (nativeTitle == null && w.altTitles() != null) {
            for (String t : w.altTitles().split("\\|")) {
                if (t.strip().codePoints().anyMatch(c -> c > 0x2E80)) {
                    nativeTitle = t.strip();
                    break;
                }
            }
        }
        d.put("native", nativeTitle);
        Set<String> alt = new LinkedHashSet<>();
        if (w.altTitles() != null) {
            for (String t : w.altTitles().split("\\|")) {
                alt.add(t.strip());
            }
        }
        for (JsonNode s : a.path("synonyms")) {
            alt.add(s.asText());
        }
        alt.remove(w.title());
        alt.removeIf(String::isBlank);
        d.put("alt", new ArrayList<>(alt).subList(0, Math.min(4, alt.size())));
        d.put("banner", w.banner() != null ? w.banner() : text(a, "bannerImage"));
        d.put("cover", w.cover() != null ? w.cover() : text(a.path("coverImage"), "extraLarge"));
        d.put("score", a.path("averageScore").isInt()
                ? String.format(PT, "%.1f", a.path("averageScore").asInt() / 10.0) : null);
        d.put("genres", genres(w.id(), a));
        d.put("themes", themes(a));
        String synopsisShort = translation.synopsisShort() != null ? translation.synopsisShort()
                : firstParagraph(translation.synopsisFull());
        d.put("synopsisShort", synopsisShort);
        d.put("synopsis", paragraphs(translation.synopsisFull() != null
                ? translation.synopsisFull() : translation.synopsisShort()));
        d.put("synopsisSource", translation.source());
        d.put("synopsisLanguage", translation.language());
        d.put("requestedLanguage", translation.requested());
        // Sinopse em outro idioma porque ainda não há tradução no pedido: a ficha avisa.
        d.put("synopsisFallback", translation.language() != null && translation.requested() != null
                && !translation.language().split("-")[0].equalsIgnoreCase(translation.requested().split("-")[0]));
        d.put("chars", characters(a));
        d.put("recs", recommendations(a));
        d.put("anilistSynced", !a.isMissingNode() && a.size() > 0);
        return d;
    }

    private Translation translation(WorkRow w, String requested) {
        String language = requested == null || requested.isBlank() ? "pt-BR" : requested;
        return jdbc.sql("""
                SELECT language,synopsis_short,synopsis_full,source FROM work_translation
                WHERE work_id=:work
                ORDER BY CASE WHEN language=:language THEN 0
                              WHEN split_part(language,'-',1)=split_part(:language,'-',1) THEN 1
                              WHEN language='en' THEN 2 ELSE 3 END
                LIMIT 1""")
                .param("work", w.id()).param("language", language)
                .query((rs, n) -> new Translation(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        language))
                .optional()
                .orElse(new Translation(w.synopsisLanguage(), w.synopsisShort(), w.synopsisFull(), w.synopsisSource(),
                        language));
    }

    private WorkRow work(UUID publicId) {
        return jdbc.sql("""
                SELECT id, public_id, kind, title, alt_titles, slug, media_family, work_format, cover, banner,
                       COALESCE(webtoon, FALSE), year, total_units, synopsis_short, synopsis_full, synopsis_source,
                       synopsis_language, story_status, origin_country, original_release_date
                FROM work WHERE public_id = ? AND visibility = 'PUBLISHED'""")
                .param(publicId)
                .query((rs, n) -> new WorkRow(rs.getLong(1), rs.getObject(2, UUID.class), rs.getString(3),
                        rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8),
                        rs.getString(9), rs.getString(10), rs.getBoolean(11), (Integer) rs.getObject(12),
                        (Integer) rs.getObject(13), rs.getString(14), rs.getString(15), rs.getString(16),
                        rs.getString(17), rs.getString(18), rs.getString(19),
                        rs.getDate(20) == null ? null : rs.getDate(20).toLocalDate()))
                .optional()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Obra não encontrada"));
    }

    private JsonNode snapshot(long workId) {
        String json = jdbc.sql("SELECT payload::text FROM work_anilist_snapshot WHERE work_id = ?")
                .param(workId).query(String.class).optional().orElse("{}");
        try {
            return mapper.readTree(json);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }

    private List<String> genres(long workId, JsonNode a) {
        List<String> out = new ArrayList<>();
        for (JsonNode g : a.path("genres")) {
            out.add(GENRES.getOrDefault(g.asText(), g.asText()));
        }
        if (out.isEmpty()) {
            out.addAll(jdbc.sql("""
                    SELECT g.name FROM work_genre wg JOIN genre g ON g.id = wg.genre_id
                    WHERE wg.work_id = ? ORDER BY wg.position""").param(workId).query(String.class).list());
        }
        return out;
    }

    private static List<String> themes(JsonNode a) {
        List<String> out = new ArrayList<>();
        for (JsonNode t : a.path("tags")) {
            if (t.path("isMediaSpoiler").asBoolean() || t.path("isGeneralSpoiler").asBoolean()
                    || t.path("rank").asInt() < 60) {
                continue;
            }
            out.add(TAGS.getOrDefault(t.path("name").asText(), t.path("name").asText()));
            if (out.size() >= 6) {
                break;
            }
        }
        return out;
    }

    private static List<Map<String, Object>> characters(JsonNode a) {
        List<Map<String, Object>> out = new ArrayList<>();
        boolean protagonist = false;
        for (JsonNode e : a.path("characters").path("edges")) {
            JsonNode n = e.path("node");
            String role = switch (e.path("role").asText()) {
                case "MAIN" -> protagonist ? "Principal" : "Protagonista";
                case "SUPPORTING" -> "Coadjuvante";
                default -> "Secundário";
            };
            if ("MAIN".equals(e.path("role").asText())) {
                protagonist = true;
            }
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("id", n.path("id").asLong());
            c.put("name", n.path("name").path("full").asText());
            c.put("native", n.path("name").path("native").asText(""));
            c.put("img", text(n.path("image"), "large"));
            c.put("role", role);
            JsonNode va = e.path("voiceActors").path(0);
            c.put("va", va.isObject() ? Map.of("name", va.path("name").path("full").asText(),
                    "img", va.path("image").path("medium").asText(""), "language", "ja") : null);
            // Elenco de voz em outros idiomas, como o AniList registra (languageV2). É crédito
            // de dublagem, não prova de que o NekoFlow tenha esse áudio disponível.
            List<Map<String, Object>> voices = new ArrayList<>();
            Set<String> seenLang = new LinkedHashSet<>();
            for (JsonNode v : e.path("allVoices")) {
                String lang = voiceLanguage(v.path("languageV2").asText(""));
                if (lang == null || "ja".equals(lang) || !seenLang.add(lang)) continue;
                voices.add(Map.of("name", v.path("name").path("full").asText(), "language", lang,
                        "img", v.path("image").path("medium").asText("")));
            }
            c.put("voices", voices);
            out.add(c);
            if (out.size() >= 8) {
                break;
            }
        }
        return out;
    }

    /** languageV2 do AniList ("Portuguese", "English"...) em código BCP 47 curto. */
    static String voiceLanguage(String languageV2) {
        return switch (languageV2) {
            case "Japanese" -> "ja";
            case "Portuguese" -> "pt-BR";
            case "English" -> "en";
            case "Spanish" -> "es";
            case "French" -> "fr";
            case "German" -> "de";
            case "Italian" -> "it";
            case "Korean" -> "ko";
            case "Chinese" -> "zh";
            default -> null;
        };
    }

    private List<Map<String, Object>> recommendations(JsonNode a) {
        Set<String> mine = new LinkedHashSet<>();
        for (JsonNode g : a.path("genres")) {
            mine.add(g.asText());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (JsonNode n : a.path("recommendations").path("nodes")) {
            JsonNode m = n.path("mediaRecommendation");
            if (!m.isObject()) {
                continue;
            }
            List<String> shared = new ArrayList<>();
            for (JsonNode g : m.path("genres")) {
                if (mine.contains(g.asText())) {
                    shared.add(GENRES.getOrDefault(g.asText(), g.asText()).toLowerCase(PT));
                }
            }
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", m.path("id").asLong());
            r.put("title", title(m));
            r.put("cover", text(m.path("coverImage"), "large"));
            r.put("type", "ANIME".equals(m.path("type").asText()) ? "Anime"
                    : formatLabel(m.path("format").asText(null), "READING"));
            String reason = shared.isEmpty() ? "Indicação da comunidade AniList"
                    : shared.size() == 1 ? capitalize(shared.get(0))
                    : capitalize(shared.get(0)) + " e " + shared.get(1);
            r.put("reason", reason);
            r.put("href", catalogHref(m.path("id").asLong(), m.path("siteUrl").asText(null)));
            out.add(r);
            if (out.size() >= 6) {
                break;
            }
        }
        return out;
    }

    /** Obra relacionada no catálogo (adaptação ↔ original), com o primeiro conteúdo disponível. */
    private Map<String, Object> relatedCatalogWork(long workId, String family) {
        return jdbc.sql("""
                SELECT w.id, w.title, w.slug, w.cover, w.banner, w.kind, w.year, w.webtoon, w.origin_country,
                       w.story_status
                FROM work_relation r JOIN work w ON w.id = r.target_work_id
                WHERE r.source_work_id = ? AND w.media_family = ? AND w.visibility = 'PUBLISHED'
                ORDER BY w.id LIMIT 1""")
                .params(workId, family)
                .query((rs, n) -> {
                    Map<String, Object> o = new LinkedHashMap<>();
                    long id = rs.getLong(1);
                    boolean anime = "ANIMATION".equals(family);
                    String href = (anime ? "/animes/" : "/leituras/") + rs.getString(3);
                    String typeLabel = anime ? "Anime" : "manhwa".equals(rs.getString(6)) ? "Manhwa"
                            : rs.getBoolean(8) ? "Webtoon" : "Mangá";
                    o.put("legacyId", id);
                    o.put("title", rs.getString(2));
                    o.put("cover", rs.getString(4));
                    o.put("banner", rs.getString(5));
                    o.put("href", href);
                    o.put("typeLabel", typeLabel);
                    o.put("meta", join(" · ", typeLabel, countryLabel(rs.getString(9))));
                    if (anime) {
                        int eps = jdbc.sql("""
                                SELECT count(*) FROM episode e JOIN season s ON s.id = e.season_id
                                WHERE s.work_id = ? AND s.visibility = 'PUBLISHED'""").param(id).query(Integer.class).single();
                        o.put("meta", join(" · ", "Anime", studiosOf(id), rs.getObject(7) == null ? null : String.valueOf(rs.getInt(7)),
                                eps + (eps == 1 ? " episódio cadastrado" : " episódios cadastrados")));
                        o.put("firstHref", firstEpisodeHref(id, href));
                    } else {
                        int caps = jdbc.sql("""
                                SELECT count(*) FROM chapter c JOIN work_edition e ON e.id = c.edition_id WHERE e.work_id = ?""")
                                .param(id).query(Integer.class).single();
                        o.put("info", join(" · ", caps + (caps == 1 ? " capítulo no NekoFlow" : " capítulos no NekoFlow"),
                                rs.getObject(7) == null ? null : String.valueOf(rs.getInt(7)),
                                statusLabel(null, rs.getString(10))));
                        o.put("credits", credits(id));
                        o.put("firstHref", firstChapterHref(id, href));
                        o.put("map", List.of());
                        o.put("nextCh", null);
                    }
                    return o;
                })
                .optional()
                .orElse(null);
    }

    private String firstEpisodeHref(long workId, String fallback) {
        return jdbc.sql("""
                SELECT e.id FROM episode e JOIN season s ON s.id = e.season_id
                WHERE s.work_id = ? AND s.visibility = 'PUBLISHED'
                  AND EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id = e.id AND es.enabled)
                ORDER BY s.sort_position, e.sort_position LIMIT 1""")
                .param(workId).query(UUID.class).optional().map(id -> "/player?episode=" + id).orElse(fallback);
    }

    private String firstChapterHref(long workId, String fallback) {
        return jdbc.sql("""
                SELECT c.id || '|' || c.edition_id FROM chapter c JOIN work_edition e ON e.id = c.edition_id
                WHERE e.work_id = ? AND EXISTS (SELECT 1 FROM chapter_import i WHERE i.chapter_id = c.id
                                                AND i.edition_id = c.edition_id AND i.status = 'PUBLISHED')
                ORDER BY e.is_original DESC, c.sort_position LIMIT 1""")
                .param(workId).query(String.class).optional()
                .map(x -> "/leitor?chapter=" + x.split("\\|")[0] + "&edition=" + x.split("\\|")[1]).orElse(fallback);
    }

    /** Link interno quando a obra está publicada no catálogo; senão, a ficha pública do AniList. */
    private String catalogHref(long anilistId, String siteUrl) {
        return jdbc.sql("""
                SELECT CASE WHEN media_family = 'ANIMATION' THEN '/animes/' ELSE '/leituras/' END || slug
                FROM work WHERE id = ? AND visibility = 'PUBLISHED' AND slug IS NOT NULL""")
                .param(anilistId).query(String.class).optional().orElse(siteUrl);
    }

    private String studios(JsonNode a, long workId) {
        List<String> names = new ArrayList<>();
        for (JsonNode s : a.path("studios").path("nodes")) {
            names.add(s.path("name").asText());
        }
        return names.isEmpty() ? studiosOf(workId) : String.join(", ", names);
    }

    private String studiosOf(long workId) {
        List<String> names = jdbc.sql("""
                SELECT p.name FROM work_contributor c JOIN person p ON p.id = c.person_id
                WHERE c.work_id = ? AND c.role = 'STUDIO' ORDER BY c.position""").param(workId).query(String.class).list();
        return names.isEmpty() ? null : String.join(", ", names);
    }

    private static String staff(JsonNode a, String role) {
        List<String> names = new ArrayList<>();
        for (JsonNode e : a.path("staff").path("edges")) {
            if (e.path("role").asText().equalsIgnoreCase(role)) {
                names.add(e.path("node").path("name").path("full").asText());
            }
        }
        return names.isEmpty() ? null : String.join(", ", names);
    }

    private String audio(long workId) {
        List<String> langs = jdbc.sql("""
                SELECT DISTINCT es.audio_language FROM episode_source es JOIN episode e ON e.id = es.episode_id
                JOIN season s ON s.id = e.season_id
                WHERE s.work_id = ? AND es.enabled AND es.audio_language IS NOT NULL""")
                .param(workId).query(String.class).list();
        return langs.isEmpty() ? null : String.join(", ", langs.stream().map(WorkPresentationService::languageName).toList());
    }

    private static String startDate(JsonNode a, WorkRow w) {
        JsonNode s = a.path("startDate");
        if (s.path("year").isInt() && s.path("month").isInt() && s.path("day").isInt()) {
            return LocalDate.of(s.path("year").asInt(), s.path("month").asInt(), s.path("day").asInt()).format(LONG_DATE);
        }
        return w.releaseDate() == null ? null : w.releaseDate().format(LONG_DATE);
    }

    private static Integer startYearOf(JsonNode a, WorkRow w) {
        return a.path("startDate").path("year").isInt() ? Integer.valueOf(a.path("startDate").path("year").asInt()) : w.year();
    }

    private static String synopsisCredit(WorkRow w) {
        if (w.synopsisSource() == null) {
            return null;
        }
        return w.synopsisSource() + ("en".equals(w.synopsisLanguage()) ? " · texto original em inglês" : "");
    }

    /** Títulos técnicos de importação ("T1 EP01", "Episódio 1") viram "Episódio N". */
    static String episodeTitle(String title, String number) {
        String t = title == null ? "" : title.strip();
        if (t.isEmpty() || t.matches("(?i)^T\\d+\\s*EP\\d+$") || t.matches("(?i)^(episódio|episode|ep\\.?)\\s*\\d+$")) {
            return "Episódio " + number;
        }
        return t;
    }

    // ---- rótulos ---------------------------------------------------------------------------

    static String formatLabel(String format, String family) {
        if (format == null) {
            return "ANIMATION".equals(family) ? "Série de TV" : "Mangá";
        }
        return switch (format) {
            case "TV" -> "Série de TV";
            case "TV_SHORT" -> "Série curta";
            case "MOVIE" -> "Filme";
            case "SPECIAL" -> "Especial";
            case "OVA" -> "OVA";
            case "ONA" -> "ONA";
            case "MUSIC" -> "Clipe musical";
            case "MANGA" -> "Mangá";
            case "NOVEL" -> "Light novel";
            case "ONE_SHOT" -> "One-shot";
            default -> format;
        };
    }

    static String statusLabel(String anilist, String story) {
        String s = anilist != null ? anilist : story;
        if (s == null) {
            return "Situação a confirmar";
        }
        return switch (s) {
            case "RELEASING", "ONGOING" -> "Em lançamento";
            case "FINISHED", "COMPLETED" -> "Concluído";
            case "NOT_YET_RELEASED" -> "Anunciado";
            case "HIATUS" -> "Em hiato";
            case "CANCELLED" -> "Cancelado";
            default -> "Situação a confirmar";
        };
    }

    static String sourceLabel(String source) {
        if (source == null) {
            return null;
        }
        return switch (source) {
            case "MANGA" -> "Mangá";
            case "LIGHT_NOVEL" -> "Light novel";
            case "WEB_NOVEL" -> "Web novel";
            case "NOVEL" -> "Romance";
            case "ORIGINAL" -> "Original";
            case "VIDEO_GAME" -> "Jogo";
            case "VISUAL_NOVEL" -> "Visual novel";
            default -> null;
        };
    }

    static String countryLabel(String code) {
        if (code == null) {
            return null;
        }
        return switch (code) {
            case "JP" -> "Japão";
            case "KR" -> "Coreia do Sul";
            case "CN" -> "China";
            case "TW" -> "Taiwan";
            default -> code;
        };
    }

    static String languageName(String code) {
        if (code == null) {
            return null;
        }
        return switch (code) {
            case "ja" -> "Japonês";
            case "pt-BR", "pt" -> "Português";
            case "en" -> "Inglês";
            case "ko" -> "Coreano";
            case "es" -> "Espanhol";
            default -> code;
        };
    }

    static String roleLabel(String role) {
        if (role == null) {
            return "Equipe";
        }
        return switch (role) {
            case "ORIGINAL_STORY", "Original Creator", "Original Story" -> "História original";
            case "STORY_AND_ART", "Story & Art" -> "História e arte";
            case "CHARACTER_DESIGN", "Character Design" -> "Design de personagens";
            case "ART", "Art" -> "Arte";
            case "STORY", "Story" -> "Roteiro";
            case "STUDIO" -> "Estúdio";
            default -> role;
        };
    }

    static final Map<String, String> GENRES = Map.ofEntries(
            Map.entry("Action", "Ação"), Map.entry("Adventure", "Aventura"), Map.entry("Comedy", "Comédia"),
            Map.entry("Drama", "Drama"), Map.entry("Ecchi", "Ecchi"), Map.entry("Fantasy", "Fantasia"),
            Map.entry("Horror", "Terror"), Map.entry("Mahou Shoujo", "Garota mágica"), Map.entry("Mecha", "Mecha"),
            Map.entry("Music", "Música"), Map.entry("Mystery", "Mistério"), Map.entry("Psychological", "Psicológico"),
            Map.entry("Romance", "Romance"), Map.entry("Sci-Fi", "Ficção científica"),
            Map.entry("Slice of Life", "Cotidiano"), Map.entry("Sports", "Esportes"),
            Map.entry("Supernatural", "Sobrenatural"), Map.entry("Thriller", "Suspense"));

    static final Map<String, String> TAGS = Map.ofEntries(
            Map.entry("Isekai", "Isekai"), Map.entry("Reincarnation", "Reencarnação"),
            Map.entry("Male Protagonist", "Protagonista masculino"),
            Map.entry("Female Protagonist", "Protagonista feminina"), Map.entry("Video Games", "Videogames"),
            Map.entry("Magic", "Magia"), Map.entry("Swordplay", "Espadas"), Map.entry("Dungeon", "Masmorras"),
            Map.entry("Super Power", "Superpoderes"), Map.entry("Overpowered Main Characters", "Protagonista poderoso"),
            Map.entry("Knights", "Cavaleiros"), Map.entry("Nobility", "Nobreza"), Map.entry("Demons", "Demônios"),
            Map.entry("Monster Girl", "Garotas monstro"), Map.entry("Revenge", "Vingança"),
            Map.entry("Survival", "Sobrevivência"), Map.entry("Urban Fantasy", "Fantasia urbana"),
            Map.entry("Shounen", "Shounen"), Map.entry("Seinen", "Seinen"), Map.entry("Elf", "Elfos"),
            Map.entry("Kingdom Management", "Gestão de reino"), Map.entry("Ensemble Cast", "Elenco amplo"),
            Map.entry("Heterosexual", "Romance heterossexual"), Map.entry("Full Color", "Colorido"),
            Map.entry("Web Manga", "Mangá digital"), Map.entry("Adaptation", "Adaptação"),
            Map.entry("Gods", "Deuses"), Map.entry("Royal Affairs", "Realeza"), Map.entry("Tragedy", "Tragédia"),
            Map.entry("Time Skip", "Salto temporal"), Map.entry("Martial Arts", "Artes marciais"),
            Map.entry("Battle Royale", "Batalha"), Map.entry("Coming of Age", "Amadurecimento"),
            Map.entry("Twins", "Gêmeos"), Map.entry("Witch", "Bruxas"), Map.entry("Dragons", "Dragões"),
            Map.entry("Guilds", "Guildas"), Map.entry("Disability", "Deficiência"));

    // ---- utilidades --------------------------------------------------------------------------

    private static String title(JsonNode n) {
        String en = n.path("title").path("english").asText(null);
        return en != null && !en.isBlank() ? en : n.path("title").path("romaji").asText("");
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() || v.asText().isBlank() ? null : v.asText();
    }

    private static void add(List<Object[]> ficha, String key, String value) {
        if (value != null && !value.isBlank()) {
            ficha.add(new Object[]{key, value});
        }
    }

    static String join(String sep, Object... parts) {
        StringBuilder b = new StringBuilder();
        for (Object p : parts) {
            if (p == null || String.valueOf(p).isBlank()) {
                continue;
            }
            if (b.length() > 0) {
                b.append(sep);
            }
            b.append(p);
        }
        return b.length() == 0 ? null : b.toString();
    }

    private static String years(Integer start, Integer end) {
        if (start == null) {
            return null;
        }
        return end == null || end.equals(start) ? String.valueOf(start) + (end == null ? "" : "") : start + "–" + end;
    }

    static List<String> paragraphs(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String p : text.split("\\n\\s*\\n")) {
            if (!p.isBlank()) {
                out.add(p.strip().replace('\n', ' '));
            }
        }
        return out;
    }

    private static String firstParagraph(String text) {
        List<String> p = paragraphs(text);
        return p.isEmpty() ? null : p.get(0);
    }

    private static String initials(String title) {
        if (title == null) {
            return "";
        }
        StringBuilder b = new StringBuilder();
        for (String w : title.split("\\s+")) {
            if (!w.isEmpty() && Character.isLetter(w.charAt(0)) && b.length() < 2) {
                b.append(Character.toUpperCase(w.charAt(0)));
            }
        }
        return b.toString();
    }

    private static String capitalize(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
