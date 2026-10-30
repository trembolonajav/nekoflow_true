package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Vincula leituras ao AniList só quando a correspondência é segura: um título nosso igual a um
 * título do AniList (romaji, inglês, nativo ou sinônimo), formato de quadrinho, ano compatível e
 * uma única obra candidata. Ambíguas ficam registradas para revisão, nunca são adivinhadas.
 *
 * Com o vínculo, o AniListSyncService traz sinopse, banner, nota, popularidade e temas, e o
 * detector de duplicatas passa a juntar a mesma obra vinda de fontes/idiomas diferentes.
 */
@Service
public class AniListReadingLinker {

    static final int BATCH = 8;
    private static final long PAUSE_MS = 2_300; // ~26 req/min: o AniList está limitado a 30/min
    private static final Set<String> COMIC_FORMATS = Set.of("MANGA", "ONE_SHOT");
    private static final Logger log = LoggerFactory.getLogger(AniListReadingLinker.class);

    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private final AniListSyncService sync;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    private volatile boolean running;
    private volatile String phase = "parado";
    private volatile String lastError;
    private volatile Instant startedAt;
    private volatile int searched, enriched;

    public AniListReadingLinker(JdbcClient jdbc, ObjectMapper mapper, AniListSyncService sync) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.sync = sync;
    }

    // ---------------------------------------------------------------- regra de correspondência

    record Candidate(long id, Long malId, String format, String country, Integer year, Set<String> titles) {}

    record Decision(String status, Long anilistId, Long malId, String reason) {}

    static Decision decide(Set<String> ours, String category, Integer year, int chapters, List<Candidate> found) {
        Set<String> mine = ours.stream().map(CatalogTitlePolicy::norm).filter(t -> !t.isBlank()).collect(Collectors.toSet());
        List<Candidate> matched = new ArrayList<>();
        for (Candidate c : found) {
            if (c.format() == null || !COMIC_FORMATS.contains(c.format())) continue;
            if ("ONE_SHOT".equals(c.format()) && chapters > 2) continue;
            if (year != null && c.year() != null && Math.abs(year - c.year()) > 3) continue;
            if (c.titles().stream().map(CatalogTitlePolicy::norm).noneMatch(mine::contains)) continue;
            if (matched.stream().noneMatch(m -> m.id() == c.id())) matched.add(c);
        }
        if (matched.isEmpty()) return new Decision("NONE", null, null, "Nenhum título igual no AniList");
        if (matched.size() > 1) {
            Set<String> countries = expectedCountries(category);
            List<Candidate> byCountry = countries.isEmpty() ? matched
                    : matched.stream().filter(c -> countries.contains(c.country())).toList();
            if (byCountry.size() != 1) {
                return new Decision("AMBIGUOUS", null, null, matched.size() + " obras do AniList com o mesmo título");
            }
            matched = byCountry;
        }
        Candidate c = matched.get(0);
        // Título curto e genérico ("Monster") sem ano para conferir não é seguro.
        boolean shortTitle = mine.stream().allMatch(t -> t.replace(" ", "").length() < 6);
        if (shortTitle && (year == null || c.year() == null)) {
            return new Decision("AMBIGUOUS", null, null, "Título curto demais para vincular sem o ano");
        }
        return new Decision("MATCHED", c.id(), c.malId(), "Título igual (" + c.format() + ", " + c.country() + ")");
    }

    private static Set<String> expectedCountries(String category) {
        if (category == null) return Set.of();
        return switch (category) {
            case "MANHWA", "WEBTOON" -> Set.of("KR");
            case "MANHUA" -> Set.of("CN", "TW");
            case "MANGA" -> Set.of("JP");
            default -> Set.of();
        };
    }

    // ---------------------------------------------------------------- execução

    /** Novas leituras de qualquer fonte entram sozinhas, a cada 6 h. */
    @Scheduled(initialDelay = 20, fixedDelay = 360, timeUnit = TimeUnit.MINUTES)
    public void scheduled() {
        start(true);
    }

    public synchronized Map<String, Object> start(boolean enrich) {
        if (!running) {
            running = true;
            lastError = null;
            startedAt = Instant.now();
            searched = 0;
            enriched = 0;
            Thread worker = new Thread(() -> {
                try {
                    link();
                    if (enrich) enrich();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } catch (Exception e) {
                    lastError = e.getMessage();
                    log.warn("Vínculo AniList das leituras parou: {}", e.getMessage());
                } finally {
                    phase = "parado";
                    running = false;
                }
            }, "anilist-reading-linker");
            worker.setDaemon(true);
            worker.start();
        }
        return status();
    }

    record Pending(long id, String title, String category, Integer year, int chapters, Set<String> titles) {}

    private void link() throws Exception {
        phase = "buscando no AniList";
        while (true) {
            List<Pending> batch = pending();
            if (batch.isEmpty()) return;
            Map<Integer, List<Candidate>> found = search(batch.stream().map(Pending::title).toList());
            for (int i = 0; i < batch.size(); i++) {
                Pending p = batch.get(i);
                List<Candidate> list = found.getOrDefault(i, List.of());
                record(p, decide(p.titles(), p.category(), p.year(), p.chapters(), list), list);
                searched++;
            }
            Thread.sleep(PAUSE_MS);
        }
    }

    /** Busca as obras vinculadas agora no AniList para trazer sinopse, banner, nota e temas. */
    private void enrich() throws InterruptedException {
        phase = "trazendo dados do AniList";
        List<Long> ids = jdbc.sql("""
                SELECT a.work_id FROM anilist_link_attempt a JOIN work w ON w.id=a.work_id
                LEFT JOIN work_anilist_snapshot s ON s.work_id=a.work_id
                WHERE a.status='MATCHED' AND s.work_id IS NULL AND w.merged_into_id IS NULL
                ORDER BY a.tried_at""").query(Long.class).list();
        for (long id : ids) {
            try {
                sync.sync(id, null);
                enriched++;
            } catch (Exception e) {
                log.warn("AniList: obra {} sem dados agora ({})", id, e.getMessage());
            }
            Thread.sleep(PAUSE_MS);
        }
    }

    private List<Pending> pending() {
        List<Pending> rows = jdbc.sql("""
                SELECT w.id, w.title, w.reading_category, w.year, w.alt_titles,
                       (SELECT count(*) FROM work_edition e JOIN chapter c ON c.edition_id=e.id WHERE e.work_id=w.id) AS chapters
                FROM work w
                WHERE w.media_family='READING' AND w.visibility='PUBLISHED' AND w.merged_into_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM external_identifier x WHERE x.work_id=w.id AND x.provider='ANILIST')
                  AND NOT EXISTS (SELECT 1 FROM anilist_link_attempt a WHERE a.work_id=w.id)
                ORDER BY w.popularity DESC NULLS LAST, w.id LIMIT :n""")
                .param("n", BATCH)
                .query((rs, n) -> {
                    Set<String> titles = new LinkedHashSet<>();
                    titles.add(rs.getString("title"));
                    String alt = rs.getString("alt_titles");
                    if (alt != null) Arrays.stream(alt.split("\\s*\\|\\s*")).filter(t -> !t.isBlank()).forEach(titles::add);
                    return new Pending(rs.getLong("id"), rs.getString("title"), rs.getString("reading_category"),
                            (Integer) rs.getObject("year"), rs.getInt("chapters"), titles);
                }).list();
        if (rows.isEmpty()) return rows;
        Map<Long, Set<String>> extra = new HashMap<>();
        jdbc.sql("SELECT work_id, title FROM work_title WHERE work_id IN (:ids)")
                .param("ids", rows.stream().map(Pending::id).toList())
                .query((rs, n) -> extra.computeIfAbsent(rs.getLong(1), k -> new LinkedHashSet<>()).add(rs.getString(2)))
                .list();
        rows.forEach(p -> p.titles().addAll(extra.getOrDefault(p.id(), Set.of())));
        return rows;
    }

    private void record(Pending p, Decision d, List<Candidate> found) {
        String candidates = found.stream().map(c -> c.id() + ":" + c.format() + ":" + c.country())
                .collect(Collectors.joining(","));
        jdbc.sql("""
                INSERT INTO anilist_link_attempt(work_id, status, anilist_id, query, candidates, reason)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (work_id) DO UPDATE SET status=EXCLUDED.status, anilist_id=EXCLUDED.anilist_id,
                    query=EXCLUDED.query, candidates=EXCLUDED.candidates, reason=EXCLUDED.reason, tried_at=now()""")
                .params(p.id(), d.status(), d.anilistId(), clip(p.title(), 300), clip(candidates, 2000), clip(d.reason(), 300))
                .update();
        if (!"MATCHED".equals(d.status())) return;
        jdbc.sql("INSERT INTO external_identifier(work_id, provider, external_id) VALUES (?, 'ANILIST', ?) ON CONFLICT DO NOTHING")
                .params(p.id(), String.valueOf(d.anilistId())).update();
        if (d.malId() != null) {
            jdbc.sql("INSERT INTO external_identifier(work_id, provider, external_id) VALUES (?, 'MAL', ?) ON CONFLICT DO NOTHING")
                    .params(p.id(), String.valueOf(d.malId())).update();
        }
    }

    private Map<Integer, List<Candidate>> search(List<String> titles) throws Exception {
        String fields = "id idMal format countryOfOrigin startDate{year} title{romaji english native} synonyms";
        StringBuilder q = new StringBuilder("query(");
        Map<String, Object> vars = new LinkedHashMap<>();
        for (int i = 0; i < titles.size(); i++) {
            q.append(i == 0 ? "" : ",").append("$s").append(i).append(":String");
            vars.put("s" + i, clip(titles.get(i), 100));
        }
        q.append("){");
        for (int i = 0; i < titles.size(); i++) {
            q.append("q").append(i).append(":Page(perPage:5){media(search:$s").append(i).append(",type:MANGA){")
                    .append(fields).append("}} ");
        }
        q.append("}");
        String body = mapper.writeValueAsString(Map.of("query", q.toString(), "variables", vars));
        for (int attempt = 0; ; attempt++) {
            HttpRequest request = HttpRequest.newBuilder(AniListClient.ENDPOINT).timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json").header("Accept", "application/json")
                    .header("User-Agent", "NekoFlow/1.0 (catalog linking)")
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 429 && attempt < 5) {
                long wait = response.headers().firstValue("Retry-After").map(Long::parseLong).orElse(60L);
                phase = "aguardando o limite do AniList";
                Thread.sleep(Math.min(wait, 120) * 1000 + 1000);
                phase = "buscando no AniList";
                continue;
            }
            if (response.statusCode() != 200) throw new IllegalStateException("AniList respondeu HTTP " + response.statusCode());
            JsonNode data = mapper.readTree(response.body()).path("data");
            Map<Integer, List<Candidate>> out = new HashMap<>();
            for (int i = 0; i < titles.size(); i++) {
                List<Candidate> list = new ArrayList<>();
                for (JsonNode m : data.path("q" + i).path("media")) {
                    Set<String> names = new LinkedHashSet<>();
                    for (String k : List.of("romaji", "english", "native")) {
                        String v = m.path("title").path(k).asText(null);
                        if (v != null && !v.isBlank()) names.add(v);
                    }
                    m.path("synonyms").forEach(s -> names.add(s.asText()));
                    JsonNode year = m.path("startDate").path("year");
                    list.add(new Candidate(m.path("id").asLong(), m.path("idMal").isNumber() ? m.path("idMal").asLong() : null,
                            m.path("format").asText(null), m.path("countryOfOrigin").asText(null),
                            year.isNumber() ? year.asInt() : null, names));
                }
                out.put(i, list);
            }
            return out;
        }
    }

    // ---------------------------------------------------------------- painel

    public Map<String, Object> status() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("running", running);
        m.put("phase", phase);
        m.put("searched", searched);
        m.put("enriched", enriched);
        m.put("startedAt", startedAt == null ? null : startedAt.toString());
        m.put("error", lastError);
        jdbc.sql("SELECT status, count(*) FROM anilist_link_attempt GROUP BY 1")
                .query((rs, n) -> m.put(rs.getString(1).toLowerCase(), rs.getLong(2))).list();
        m.put("withoutAniList", jdbc.sql("""
                SELECT count(*) FROM work w WHERE w.media_family='READING' AND w.visibility='PUBLISHED'
                  AND w.merged_into_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM external_identifier x WHERE x.work_id=w.id AND x.provider='ANILIST')""")
                .query(Long.class).single());
        m.put("pending", jdbc.sql("""
                SELECT count(*) FROM work w WHERE w.media_family='READING' AND w.visibility='PUBLISHED'
                  AND w.merged_into_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM external_identifier x WHERE x.work_id=w.id AND x.provider='ANILIST')
                  AND NOT EXISTS (SELECT 1 FROM anilist_link_attempt a WHERE a.work_id=w.id)""")
                .query(Long.class).single());
        return m;
    }

    private static String clip(String v, int max) {
        return v == null || v.length() <= max ? v : v.substring(0, max);
    }
}
