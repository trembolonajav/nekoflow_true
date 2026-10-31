package com.nekoflow.catalog;

import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Coleta completa, auditável e retomável do catálogo autorizado do Sushi Animes. */
@Service
public class SushiAnimesArchiveSyncService {
    static final String PROVIDER_ID = "SUSHI_ANIMES";
    static final String SOURCE_NAME = "SUSHI_ANIMES_ARCHIVE";
    static final String PROVIDER_NAME = "Sushi Animes";
    static final UUID MEDIA_PROVIDER_ID = UUID.fromString("4ec94fd8-c97a-45eb-bde3-8ffd5457d714");
    private static final String PROVENANCE = "Catálogo e CDN autorizados pelo Sushi Animes ao NekoFlow; "
            + "página oficial do episódio resolvida no momento da reprodução. Coleta em ";

    private final SushiAnimesCatalogClient api;
    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService coordinator = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "sushi-animes-archive-sync");
        thread.setDaemon(true);
        return thread;
    });
    private volatile SyncState state = SyncState.idle();

    public SushiAnimesArchiveSyncService(SushiAnimesCatalogClient api, JdbcClient jdbc,
                                         TransactionTemplate transactions) {
        this.api = api;
        this.jdbc = jdbc;
        this.transactions = transactions;
    }

    public synchronized Map<String, Object> start(long actorId, boolean refresh) {
        if (!running.compareAndSet(false, true)) return status();
        UUID runId = UUID.randomUUID();
        state = new SyncState("RUNNING", "INVENTORY", runId, 0, 0, 0, 0, 0, 0, 0,
                0, 0, null, Instant.now(), null, null, refresh);
        jdbc.sql("UPDATE catalog_import_run SET status='FAILED',finished_at=now() "
                        + "WHERE source=? AND status='RUNNING'")
                .param(SOURCE_NAME).update();
        jdbc.sql("INSERT INTO catalog_import_run(id,source,dry_run,status) VALUES (?,?,FALSE,'RUNNING')")
                .params(runId, SOURCE_NAME).update();
        CompletableFuture.runAsync(() -> synchronize(runId, actorId, refresh), coordinator);
        return status();
    }

    public synchronized Map<String, Object> status() {
        SyncState s = state;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", s.status());
        result.put("phase", s.phase());
        result.put("running", running.get());
        result.put("runId", s.runId());
        result.put("totalWorks", s.totalWorks());
        result.put("totalEpisodes", s.totalEpisodes());
        result.put("processedWorks", s.processedWorks());
        result.put("createdWorks", s.createdWorks());
        result.put("mergedWorks", s.mergedWorks());
        result.put("episodesImported", s.episodesImported());
        result.put("sourcesImported", s.sourcesImported());
        result.put("metadataFailures", s.metadataFailures());
        result.put("failures", s.failures());
        result.put("currentWorkId", s.currentWorkId());
        result.put("startedAt", s.startedAt());
        result.put("finishedAt", s.finishedAt());
        result.put("lastError", s.lastError());
        result.put("refresh", s.refresh());
        return result;
    }

    private void synchronize(UUID runId, long actorId, boolean refresh) {
        Counters counters = new Counters();
        try {
            SushiAnimesCatalogClient.Catalog catalog = api.catalog();
            Map<String, List<SushiAnimesCatalogClient.EpisodeRef>> byWork = new LinkedHashMap<>();
            for (SushiAnimesCatalogClient.EpisodeRef episode : catalog.episodes()) {
                byWork.computeIfAbsent(episode.workId(), ignored -> new ArrayList<>()).add(episode);
            }
            for (List<SushiAnimesCatalogClient.EpisodeRef> episodes : byWork.values()) {
                episodes.sort(Comparator.comparingInt(SushiAnimesCatalogClient.EpisodeRef::season)
                        .thenComparing(item -> decimal(item.number())));
            }
            Set<String> completed = refresh ? Set.of() : completedWorks();
            counters.processed = completed.size();
            publish("RUNNING", "IMPORTING", runId, catalog.works().size(), catalog.episodes().size(), counters,
                    null, null, null, refresh);

            for (SushiAnimesCatalogClient.WorkRef work : catalog.works()) {
                if (completed.contains(work.id())) continue;
                List<SushiAnimesCatalogClient.EpisodeRef> episodes = byWork.getOrDefault(work.id(), List.of());
                process(runId, work, episodes, counters);
                publish("RUNNING", "IMPORTING", runId, catalog.works().size(), catalog.episodes().size(), counters,
                        work.id(), null, null, refresh);
            }

            jdbc.sql("UPDATE catalog_import_run SET status='COMPLETED',created_count=?,updated_count=?,"
                            + "unchanged_count=?,rejected_count=?,finished_at=now() WHERE id=?")
                    .params(counters.created, counters.merged, counters.unchanged, counters.failures, runId).update();
            jdbc.sql("INSERT INTO catalog_audit_event(actor_id,action,after_data) "
                            + "VALUES (?,'SUSHI_ANIMES_ARCHIVE_SYNC',jsonb_build_object("
                            + "'runId',?::text,'works',?,'episodes',?,'sources',?,'metadataFailures',?,'failures',?))")
                    .params(actorId, runId, counters.processed, counters.episodes, counters.sources,
                            counters.metadataFailures, counters.failures).update();
            publish("COMPLETED", "DONE", runId, catalog.works().size(), catalog.episodes().size(), counters,
                    null, Instant.now(), null, refresh);
        } catch (RuntimeException error) {
            jdbc.sql("UPDATE catalog_import_run SET status='FAILED',created_count=?,updated_count=?,"
                            + "unchanged_count=?,rejected_count=?,finished_at=now() WHERE id=?")
                    .params(counters.created, counters.merged, counters.unchanged, counters.failures + 1, runId).update();
            publish("FAILED", "FAILED", runId, state.totalWorks(), state.totalEpisodes(), counters,
                    state.currentWorkId(), Instant.now(), safeMessage(error), refresh);
        } finally {
            running.set(false);
        }
    }

    private void process(UUID runId, SushiAnimesCatalogClient.WorkRef ref,
                         List<SushiAnimesCatalogClient.EpisodeRef> sitemapEpisodes, Counters counters) {
        SushiAnimesCatalogClient.WorkDetail detail = null;
        String metadataError = null;
        try {
            detail = api.work(ref);
        } catch (RuntimeException error) {
            counters.metadataFailures++;
            metadataError = safeMessage(error);
        }
        SushiAnimesCatalogClient.WorkDetail loaded = detail;
        String detailError = metadataError;
        try {
            ImportResult result = transactions.execute(status -> importWork(ref, loaded, sitemapEpisodes));
            if (result == null) throw new IllegalStateException("A transação Sushi Animes não retornou resultado.");
            if (result.created()) counters.created++; else counters.merged++;
            counters.episodes += result.episodes();
            counters.sources += result.sources();
            String note = result.episodes() + " episódios; " + result.sources() + " fontes MP4 resolvíveis";
            if (detailError != null) note += "; metadados básicos pelo sitemap: " + detailError;
            recordItem(runId, ref.id(), result.workId(), result.created() ? "CREATED" : "UPDATED", note);
        } catch (RuntimeException error) {
            counters.failures++;
            recordFailure(runId, ref.id(), error);
        }
        counters.processed++;
    }

    private ImportResult importWork(SushiAnimesCatalogClient.WorkRef ref,
                                    SushiAnimesCatalogClient.WorkDetail detail,
                                    List<SushiAnimesCatalogClient.EpisodeRef> sitemapEpisodes) {
        String sourceTitle = detail == null ? humanTitle(ref.slug()) : detail.title();
        String canonicalTitle = canonicalTitle(sourceTitle);
        String canonicalSlug = canonicalSlug(ref.slug());
        Long existing = findExisting(ref, canonicalTitle, canonicalSlug, detail == null ? null : detail.year());
        boolean created = existing == null;
        long workId;
        if (created) {
            jdbc.sql("SELECT pg_advisory_xact_lock(935119)").query((rs, row) -> Boolean.TRUE).single();
            workId = jdbc.sql("SELECT GREATEST(COALESCE(MAX(id) FILTER (WHERE id>=920000000),919999999)+1,920000000) FROM work")
                    .query(Long.class).single();
            jdbc.sql("""
                    INSERT INTO work(id,kind,title,alt_titles,cover,webtoon,year,total_units,available_units,
                                     airing_status,slug,media_family,work_format,original_language,origin_country,
                                     synopsis_short,synopsis_full,synopsis_source,synopsis_language,
                                     story_status,visibility,content_rating)
                    VALUES (?,'anime',?,?,?,FALSE,?,0,0,?,?,'ANIMATION','TV','ja','JP',?,?,?,?,?,'PUBLISHED',?)
                    """).params(workId, limit(canonicalTitle, 300), alternativeTitles(detail), cover(detail),
                            year(detail), statusLabel(detail), uniqueSlug(canonicalSlug, ref.id()), synopsis(detail),
                            synopsis(detail), PROVIDER_NAME, "pt-BR", storyStatus(detail), contentRating(detail)).update();
        } else {
            workId = existing;
            jdbc.sql("""
                    UPDATE work SET cover=COALESCE(NULLIF(cover,''),?),year=COALESCE(year,?),
                      synopsis_short=COALESCE(NULLIF(synopsis_short,''),?),
                      synopsis_full=COALESCE(NULLIF(synopsis_full,''),?),
                      content_rating=CASE WHEN content_rating IS NULL OR content_rating='GENERAL' THEN ? ELSE content_rating END,
                      updated_at=now()
                    WHERE id=?
                    """).params(cover(detail), year(detail), synopsis(detail), synopsis(detail),
                            contentRating(detail), workId).update();
        }
        // O identificador numérico do Sushi é estável e cabe no VARCHAR(120), mesmo
        // quando o slug editorial da obra ultrapassa esse limite.
        String externalKey = ref.id();
        jdbc.sql("INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                .params(workId, PROVIDER_ID, externalKey).update();
        jdbc.sql("INSERT INTO work_title(work_id,title,title_norm,title_type,language) VALUES (?,?,lower(?),'PRIMARY','ja-Latn') ON CONFLICT DO NOTHING")
                .params(workId, limit(canonicalTitle, 300), limit(canonicalTitle, 300)).update();
        if (detail != null && detail.alternativeTitle() != null) {
            jdbc.sql("INSERT INTO work_title(work_id,title,title_norm,title_type,language) VALUES (?,?,lower(?),'ALTERNATIVE','ja') ON CONFLICT DO NOTHING")
                    .params(workId, limit(detail.alternativeTitle(), 300), limit(detail.alternativeTitle(), 300)).update();
        }
        upsertGenres(workId, detail == null ? List.of() : detail.genres());

        Map<String, SushiAnimesCatalogClient.EpisodeMetadata> metadata = new HashMap<>();
        if (detail != null) for (SushiAnimesCatalogClient.EpisodeMetadata episode : detail.episodes())
            metadata.put(episode.url(), episode);
        int episodeCount = 0;
        int sourceCount = 0;
        for (SushiAnimesCatalogClient.EpisodeRef source : sitemapEpisodes) {
            SushiAnimesCatalogClient.EpisodeMetadata episodeMetadata = metadata.get(source.url());
            UUID seasonId = jdbc.sql("""
                    INSERT INTO season(work_id,title,display_number,sort_position,visibility)
                    VALUES (?,?,?,?, 'PUBLISHED')
                    ON CONFLICT(work_id,sort_position) DO UPDATE SET visibility='PUBLISHED'
                    RETURNING id
                    """).params(workId, "Temporada " + source.season(), String.valueOf(source.season()),
                            BigDecimal.valueOf(source.season())).query(UUID.class).single();
            BigDecimal position = decimal(source.number());
            String display = limit(source.number(), 30);
            String episodeTitle = episodeMetadata == null || episodeMetadata.title() == null
                    ? "Episódio " + source.number() : episodeMetadata.title();
            UUID episodeId = jdbc.sql("""
                    INSERT INTO episode(season_id,title,display_number,sort_position,duration_seconds,
                                        availability,thumbnail_url,source_page_url)
                    VALUES (?,?,?,?,?,'STREAM',?,?)
                    ON CONFLICT(season_id,sort_position) DO UPDATE SET
                      title=CASE WHEN episode.title IS NULL OR episode.title LIKE 'Episódio %' THEN EXCLUDED.title ELSE episode.title END,
                      display_number=EXCLUDED.display_number,
                      duration_seconds=COALESCE(episode.duration_seconds,EXCLUDED.duration_seconds),
                      thumbnail_url=COALESCE(episode.thumbnail_url,EXCLUDED.thumbnail_url),
                      source_page_url=EXCLUDED.source_page_url,
                      availability='STREAM'
                    RETURNING id
                    """).params(seasonId, limit(episodeTitle, 200), display, position,
                            detail == null || detail.durationMinutes() == null ? null : detail.durationMinutes() * 60,
                            episodeMetadata == null ? null : episodeMetadata.thumbnailUrl(), source.url())
                    .query(UUID.class).single();
            boolean alternate = jdbc.sql("SELECT EXISTS(SELECT 1 FROM episode_source WHERE episode_id=? AND enabled AND provider<>?)")
                    .params(episodeId, PROVIDER_NAME).query(Boolean.class).single();
            Audio audio = audio(detail, ref.slug());
            int changed = jdbc.sql("""
                    INSERT INTO episode_source(episode_id,source_type,source_url,provider,language,embed_allowed,
                                               enabled,provenance,reports_progress,provider_id,label,priority,
                                               audio_language,max_height)
                    VALUES (?,'MP4',?,?,?,FALSE,TRUE,?,TRUE,?,?,?,?,1080)
                    ON CONFLICT(episode_id,source_type,source_url) DO UPDATE SET
                      enabled=TRUE,provider_id=EXCLUDED.provider_id,label=EXCLUDED.label,
                      priority=EXCLUDED.priority,audio_language=EXCLUDED.audio_language,
                      language=EXCLUDED.language,reports_progress=TRUE,provenance=EXCLUDED.provenance,
                      updated_at=now()
                    """).params(episodeId, source.url(), PROVIDER_NAME, audio.subtitleLanguage(),
                            PROVENANCE + LocalDate.now(), MEDIA_PROVIDER_ID,
                            "Sushi Animes · " + audio.label() + (alternate ? " · alternativo" : ""),
                            alternate ? 50 : 10, audio.audioLanguage()).update();
            jdbc.sql("UPDATE episode_source SET enabled=FALSE,updated_at=now() WHERE episode_id=? "
                            + "AND provider=? AND source_type='EXTERNAL_LINK' AND source_url=?")
                    .params(episodeId, PROVIDER_NAME, source.url()).update();
            episodeCount++;
            sourceCount += changed > 0 ? 1 : 0;
        }
        jdbc.sql("UPDATE work SET total_units=GREATEST(COALESCE(total_units,0),?),"
                        + "available_units=GREATEST(COALESCE(available_units,0),?),updated_at=now() WHERE id=?")
                .params(episodeCount, episodeCount, workId).update();
        sourceCount += linkNativeSourcesToFibDuplicates(workId);
        return new ImportResult(workId, created, episodeCount, sourceCount);
    }

    /**
     * O FIB agrega temporadas de uma franquia em uma única ficha, enquanto AniList/Sushi
     * podem manter cada temporada como obra separada. Quando título, temporada e episódio
     * coincidem, replica a fonte nativa autorizada na ficha FIB. Assim o player próprio é
     * preferido e o embed permanece disponível apenas como servidor alternativo.
     */
    private int linkNativeSourcesToFibDuplicates(long sushiWorkId) {
        return jdbc.sql("""
                INSERT INTO episode_source(episode_id,source_type,source_url,provider,language,embed_allowed,
                                           enabled,provenance,reports_progress,provider_id,label,priority,
                                           audio_language,max_height,available_from,available_until,updated_at)
                SELECT target_episode.id, source.source_type, source.source_url, source.provider, source.language,
                       FALSE, TRUE, source.provenance || '; vinculado à ficha agregada FIB',
                       source.reports_progress, source.provider_id,
                       regexp_replace(COALESCE(source.label,'Sushi Animes'),'\\s*·\\s*alternativo\\s*$','')
                           || ' · alternativo',
                       20, source.audio_language, source.max_height,
                       source.available_from, source.available_until, now()
                FROM work sushi_work
                JOIN season sushi_season ON sushi_season.work_id=sushi_work.id
                JOIN episode sushi_episode ON sushi_episode.season_id=sushi_season.id
                JOIN episode_source source ON source.episode_id=sushi_episode.id
                  AND source.enabled AND source.provider=? AND source.source_type IN ('HLS','MP4','DASH')
                JOIN work fib_work ON fib_work.id<>sushi_work.id
                  AND fib_work.media_family='ANIMATION' AND fib_work.visibility='PUBLISHED'
                  AND lower(fib_work.title)=lower(sushi_work.title)
                  AND EXISTS (SELECT 1 FROM external_identifier fib_id
                              WHERE fib_id.work_id=fib_work.id AND fib_id.provider='FIBANIME')
                JOIN season fib_season ON fib_season.work_id=fib_work.id
                  AND fib_season.display_number=sushi_season.display_number
                JOIN episode target_episode ON target_episode.season_id=fib_season.id
                  AND target_episode.sort_position=sushi_episode.sort_position
                WHERE sushi_work.id=?
                ON CONFLICT(episode_id,source_type,source_url) DO UPDATE SET
                  enabled=TRUE,provider_id=EXCLUDED.provider_id,label=EXCLUDED.label,
                  priority=EXCLUDED.priority,audio_language=EXCLUDED.audio_language,
                  language=EXCLUDED.language,reports_progress=EXCLUDED.reports_progress,
                  provenance=EXCLUDED.provenance,max_height=EXCLUDED.max_height,updated_at=now()
                """).params(PROVIDER_NAME, sushiWorkId).update();
    }

    private Long findExisting(SushiAnimesCatalogClient.WorkRef ref, String title, String slug, Integer year) {
        String key = ref.slug() + "-" + ref.id();
        Long existing = jdbc.sql("SELECT work_id FROM external_identifier WHERE provider=? AND external_id IN (?,?) ORDER BY id LIMIT 1")
                .params(PROVIDER_ID, key, ref.id()).query(Long.class).optional().orElse(null);
        if (existing != null) return existing;
        existing = jdbc.sql("SELECT id FROM work WHERE media_family='ANIMATION' AND lower(slug) IN (lower(?),lower(?)) ORDER BY id LIMIT 1")
                .params(ref.slug(), slug).query(Long.class).optional().orElse(null);
        if (existing != null) return existing;
        return jdbc.sql("""
                SELECT id FROM work WHERE media_family='ANIMATION'
                  AND (lower(title)=lower(?) OR lower(regexp_replace(title,'\\s*\\((Dublado|Legendado)\\)\\s*$','','i'))=lower(?))
                  AND (?::int IS NULL OR year IS NULL OR year=?::int)
                ORDER BY CASE WHEN lower(title)=lower(?) THEN 0 ELSE 1 END,id LIMIT 1
                """).params(title, title, year, year, title).query(Long.class).optional().orElse(null);
    }

    private void upsertGenres(long workId, List<String> genres) {
        int position = 0;
        for (String name : new LinkedHashSet<>(genres)) {
            String slug = slugify(name);
            if (slug.isBlank()) continue;
            jdbc.sql("INSERT INTO genre(slug,name) VALUES (?,?) ON CONFLICT DO NOTHING")
                    .params(slug, limit(name, 80)).update();
            Long genreId = jdbc.sql("SELECT id FROM genre WHERE slug=?").param(slug)
                    .query(Long.class).optional().orElse(null);
            if (genreId != null) jdbc.sql("INSERT INTO work_genre(work_id,genre_id,position) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                    .params(workId, genreId, position++).update();
        }
    }

    private Set<String> completedWorks() {
        return new HashSet<>(jdbc.sql("""
                SELECT DISTINCT i.source_key FROM catalog_import_item i
                JOIN catalog_import_run r ON r.id=i.run_id
                WHERE r.source=? AND i.result IN ('CREATED','UPDATED','UNCHANGED')
                """).param(SOURCE_NAME).query(String.class).list());
    }

    private void recordItem(UUID runId, String key, long workId, String result, String detail) {
        jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,work_id,result,detail) VALUES (?,?,?,?,?)")
                .params(runId, key, workId, result, limit(detail, 2000)).update();
    }
    private void recordFailure(UUID runId, String key, RuntimeException error) {
        try {
            jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,result,detail) VALUES (?,?,'REJECTED',?)")
                    .params(runId, key, limit(safeMessage(error), 2000)).update();
        } catch (RuntimeException ignored) { }
    }

    private synchronized void publish(String status, String phase, UUID runId, int totalWorks, int totalEpisodes,
                                      Counters counters, String current, Instant finished, String error,
                                      boolean refresh) {
        Instant started = state.runId() != null && state.runId().equals(runId) ? state.startedAt() : Instant.now();
        state = new SyncState(status, phase, runId, totalWorks, totalEpisodes, counters.processed,
                counters.created, counters.merged, counters.episodes, counters.sources, counters.metadataFailures,
                counters.failures, current, started, finished, error, refresh);
    }

    static String canonicalTitle(String title) {
        return title == null ? "Anime Sushi Animes" : title.replaceFirst("(?i)\\s*\\((Dublado|Legendado)\\)\\s*$", "").strip();
    }
    static String canonicalSlug(String slug) {
        return slug == null ? "sushi-animes" : slug.replaceFirst("(?i)-(dublado|legendado)$", "");
    }
    private String uniqueSlug(String preferred, String id) {
        String slug = limit(preferred, 340);
        Boolean used = jdbc.sql("SELECT EXISTS(SELECT 1 FROM work WHERE media_family='ANIMATION' AND lower(slug)=lower(?))")
                .param(slug).query(Boolean.class).single();
        return used ? limit(slug + "-sushi-" + id, 340) : slug;
    }
    private static String humanTitle(String slug) {
        String clean = canonicalSlug(slug).replace('-', ' ').strip();
        StringBuilder out = new StringBuilder();
        for (String part : clean.split("\\s+")) {
            if (!out.isEmpty()) out.append(' ');
            out.append(part.isEmpty() ? part : part.substring(0, 1).toUpperCase(Locale.ROOT) + part.substring(1));
        }
        return out.isEmpty() ? "Anime Sushi Animes" : out.toString();
    }
    private static String alternativeTitles(SushiAnimesCatalogClient.WorkDetail detail) {
        return detail == null || detail.alternativeTitle() == null ? "" : detail.alternativeTitle();
    }
    private static String cover(SushiAnimesCatalogClient.WorkDetail detail) { return detail == null ? null : detail.coverUrl(); }
    private static Integer year(SushiAnimesCatalogClient.WorkDetail detail) { return detail == null ? null : detail.year(); }
    private static String synopsis(SushiAnimesCatalogClient.WorkDetail detail) { return detail == null ? null : detail.synopsis(); }
    private static String statusLabel(SushiAnimesCatalogClient.WorkDetail detail) {
        return detail == null || detail.status() == null ? "Unknown" : detail.status();
    }
    private static String storyStatus(SushiAnimesCatalogClient.WorkDetail detail) {
        String value = detail == null || detail.status() == null ? "" : detail.status().toLowerCase(Locale.ROOT);
        return value.contains("completo") ? "COMPLETED" : value.contains("hiato") ? "HIATUS"
                : value.contains("cancel") ? "CANCELLED" : "ONGOING";
    }
    private static String contentRating(SushiAnimesCatalogClient.WorkDetail detail) {
        if (detail == null || detail.ageRating() == null) return "GENERAL";
        Integer age = SushiAnimesArchiveSyncService.integer(detail.ageRating());
        return age != null && age >= 18 ? "ADULT" : age != null && age >= 16 ? "MATURE" : "GENERAL";
    }
    private static Audio audio(SushiAnimesCatalogClient.WorkDetail detail, String slug) {
        String value = detail == null || detail.audio() == null ? slug : detail.audio();
        boolean dubbed = value != null && value.toLowerCase(Locale.ROOT).contains("dubl");
        return dubbed ? new Audio("Dublado", "pt-BR", null) : new Audio("Legendado", "ja", "pt-BR");
    }
    private static BigDecimal decimal(String value) {
        try { return new BigDecimal(value == null ? "0" : value.replace(',', '.')); }
        catch (NumberFormatException ignored) { return BigDecimal.valueOf(900_000_000L); }
    }
    private static Integer integer(String value) {
        if (value == null) return null;
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("(\\d+)").matcher(value);
        return matcher.find() ? Integer.valueOf(matcher.group(1)) : null;
    }
    private static String slugify(String value) {
        String ascii = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        return limit(ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", ""), 80);
    }
    private static String limit(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }
    private static String safeMessage(Throwable error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
    }

    @PreDestroy
    void stop() { coordinator.shutdownNow(); }

    private record Audio(String label, String audioLanguage, String subtitleLanguage) { }
    private record ImportResult(long workId, boolean created, int episodes, int sources) { }
    private static final class Counters {
        int processed;
        int created;
        int merged;
        int unchanged;
        int episodes;
        int sources;
        int metadataFailures;
        int failures;
    }
    private record SyncState(String status, String phase, UUID runId, int totalWorks, int totalEpisodes,
                             int processedWorks, int createdWorks, int mergedWorks, int episodesImported,
                             int sourcesImported, int metadataFailures, int failures, String currentWorkId,
                             Instant startedAt, Instant finishedAt, String lastError, boolean refresh) {
        static SyncState idle() {
            return new SyncState("IDLE", "IDLE", null, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, null, null, null, null, false);
        }
    }
}
