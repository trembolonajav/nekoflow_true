package com.nekoflow.catalog;

import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Importação completa e retomável do catálogo em inglês do WeebCentral. */
@Service
public class WeebCentralArchiveSyncService {
    private static final String PROVIDER_ID = "WEEBCENTRAL_EN";
    private static final String PROVIDER_NAME = "WeebCentral English";
    private static final String SOURCE_NAME = "WEEBCENTRAL_EN_ARCHIVE";
    private static final String EDITION_NAME = "English — WeebCentral";
    private static final String PROVENANCE = "WeebCentral public English catalog sync on ";
    private static final Pattern DECIMAL = Pattern.compile("(\\d+(?:\\.\\d+)?)");
    // O provedor aplica rate limit agressivo. Duas leituras com janela curta mantêm
    // algum paralelismo de parsing/DB sem disparar uma rajada de HTTP.
    private static final int READER_THREADS = 1;
    private static final int PREFETCH_WINDOW = 2;

    private final WeebCentralApiClient api;
    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService coordinator = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "weebcentral-en-archive-sync");
        thread.setDaemon(true);
        return thread;
    });
    private volatile SyncState state = SyncState.idle();

    public WeebCentralArchiveSyncService(WeebCentralApiClient api, JdbcClient jdbc,
                                         TransactionTemplate transactions) {
        this.api = api;
        this.jdbc = jdbc;
        this.transactions = transactions;
    }

    public synchronized Map<String, Object> start(long actorId, boolean refresh) {
        if (!running.compareAndSet(false, true)) return status();
        UUID runId = UUID.randomUUID();
        state = new SyncState("RUNNING", runId, 0, 0, 0, 0, 0, 0, 0, null,
                Instant.now(), null, null, refresh);
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
        result.put("running", running.get());
        result.put("runId", s.runId());
        result.put("language", WeebCentralApiClient.CONTENT_LANGUAGE);
        result.put("totalWorks", s.totalWorks());
        result.put("processedWorks", s.processedWorks());
        result.put("createdWorks", s.createdWorks());
        result.put("updatedWorks", s.updatedWorks());
        result.put("unchangedWorks", s.unchangedWorks());
        result.put("chaptersImported", s.chaptersImported());
        result.put("failures", s.failures());
        result.put("currentSeriesId", s.currentSeriesId());
        result.put("startedAt", s.startedAt());
        result.put("finishedAt", s.finishedAt());
        result.put("lastError", s.lastError());
        result.put("refresh", s.refresh());
        return result;
    }

    private void synchronize(UUID runId, long actorId, boolean refresh) {
        Counters counters = new Counters();
        ExecutorService readers = null;
        try {
            List<WeebCentralApiClient.SeriesIndexItem> index = api.catalogIndex();
            Set<String> completed = refresh ? Set.of() : completedSeries();
            List<WeebCentralApiClient.SeriesIndexItem> pending = new ArrayList<>();
            for (WeebCentralApiClient.SeriesIndexItem item : index) {
                if (completed.contains(item.id())) counters.unchanged++;
                else pending.add(item);
            }
            counters.processed = counters.unchanged;
            publish("RUNNING", runId, index.size(), counters, null, null, null, refresh);

            readers = Executors.newFixedThreadPool(READER_THREADS, r -> {
                Thread thread = new Thread(r, "weebcentral-en-reader");
                thread.setDaemon(true);
                return thread;
            });
            CompletionService<LoadedWork> queue = new ExecutorCompletionService<>(readers);
            int submitted = 0;
            int finished = 0;
            while (submitted < Math.min(PREFETCH_WINDOW, pending.size())) {
                submit(queue, pending.get(submitted++));
            }
            while (finished < pending.size()) {
                LoadedWork loaded = take(queue);
                finished++;
                if (submitted < pending.size()) submit(queue, pending.get(submitted++));
                process(runId, loaded, counters);
                publish("RUNNING", runId, index.size(), counters, loaded.index().id(), null, null, refresh);
            }

            jdbc.sql("UPDATE catalog_import_run SET status='COMPLETED',created_count=?,updated_count=?,"
                            + "unchanged_count=?,rejected_count=?,finished_at=now() WHERE id=?")
                    .params(counters.created, counters.updated, counters.unchanged, counters.failures, runId).update();
            jdbc.sql("INSERT INTO catalog_audit_event(actor_id,action,after_data) "
                            + "VALUES (?,'WEEBCENTRAL_EN_ARCHIVE_SYNC',jsonb_build_object(" 
                            + "'runId',?::text,'works',?,'chapters',?,'failures',?,'language','en'))")
                    .params(actorId, runId, counters.processed, counters.chapters, counters.failures).update();
            publish("COMPLETED", runId, index.size(), counters, null, Instant.now(), null, refresh);
        } catch (RuntimeException error) {
            jdbc.sql("UPDATE catalog_import_run SET status='FAILED',created_count=?,updated_count=?,"
                            + "unchanged_count=?,rejected_count=?,finished_at=now() WHERE id=?")
                    .params(counters.created, counters.updated, counters.unchanged, counters.failures + 1, runId).update();
            publish("FAILED", runId, state.totalWorks(), counters, state.currentSeriesId(), Instant.now(),
                    safeMessage(error), refresh);
        } finally {
            if (readers != null) readers.shutdownNow();
            running.set(false);
        }
    }

    private void submit(CompletionService<LoadedWork> queue, WeebCentralApiClient.SeriesIndexItem item) {
        queue.submit(() -> load(item));
    }

    private LoadedWork take(CompletionService<LoadedWork> queue) {
        try {
            Future<LoadedWork> future = queue.take();
            return future.get();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("WeebCentral English import interrupted.", error);
        } catch (ExecutionException error) {
            throw new IllegalStateException("WeebCentral English worker failed.", error.getCause());
        }
    }

    private LoadedWork load(WeebCentralApiClient.SeriesIndexItem item) {
        WeebCentralApiClient.SeriesDetail detail = null;
        try {
            detail = api.series(item.id());
            WeebCentralApiClient.ChapterList chapters = api.chapters(item.id());
            return new LoadedWork(item, detail, chapters.items(), null);
        } catch (RuntimeException error) {
            return new LoadedWork(item, detail, List.of(), error);
        }
    }

    private void process(UUID runId, LoadedWork loaded, Counters counters) {
        try {
            if (loaded.detail() == null) throw loaded.error() == null
                    ? new IllegalStateException("WeebCentral series detail is empty.") : loaded.error();
            WorkTarget target = transactions.execute(status -> upsertWork(loaded.index(), loaded.detail()));
            if (target == null) throw new IllegalStateException("Work transaction returned no result.");
            if (loaded.error() != null) throw loaded.error();
            transactions.executeWithoutResult(status -> upsertChapters(target, loaded.chapters()));
            transactions.executeWithoutResult(status -> recordItem(runId, loaded.index().id(), target.workId(),
                    target.created() ? "CREATED" : "UPDATED", loaded.chapters().size() + " chapters; language=en"));
            if (target.created()) counters.created++; else counters.updated++;
            counters.chapters += loaded.chapters().size();
        } catch (RuntimeException error) {
            counters.failures++;
            recordFailure(runId, loaded.index().id(), error);
        }
        counters.processed++;
    }

    private WorkTarget upsertWork(WeebCentralApiClient.SeriesIndexItem index,
                                  WeebCentralApiClient.SeriesDetail detail) {
        Long existing = jdbc.sql("SELECT work_id FROM external_identifier WHERE provider=? AND external_id=? "
                        + "ORDER BY id LIMIT 1")
                .params(PROVIDER_ID, index.id()).query(Long.class).optional().orElse(null);
        String slug = normalizeSlug(detail.slug(), index.id());
        if (existing == null) {
            existing = jdbc.sql("SELECT id FROM work WHERE media_family='READING' AND lower(slug)=lower(?) LIMIT 1")
                    .param(slug).query(Long.class).optional().orElse(null);
        }
        Classification classification = classify(detail);
        boolean created = existing == null;
        long workId;
        if (created) {
            jdbc.sql("SELECT pg_advisory_xact_lock(934701)").query((rs, row) -> Boolean.TRUE).single();
            workId = jdbc.sql("SELECT GREATEST(COALESCE(MAX(id) FILTER (WHERE id>=900000000),899999999)+1,900000000) FROM work")
                    .query(Long.class).single();
            jdbc.sql("""
                    INSERT INTO work(id,kind,title,alt_titles,cover,webtoon,year,total_units,available_units,
                                     airing_status,slug,media_family,work_format,reading_category,
                                     presentation_format,synopsis_short,synopsis_full,
                                     synopsis_source,synopsis_language,story_status,visibility,content_rating)
                    VALUES (?,?,?,'',?,?,?,0,0,?,?, 'READING','COMIC',?,?,?,?,?,?,?,'PUBLISHED',?)
                    """).params(workId, classification.kind(), limit(detail.title(), 300), detail.coverUrl(),
                            classification.webtoon(), detail.year(), classification.statusLabel(), slug,
                            classification.category(), classification.webtoon() ? "VERTICAL" : "PAGED",
                            blankToNull(detail.description()), blankToNull(detail.description()),
                            PROVIDER_NAME, "en", classification.storyStatus(), classification.contentRating()).update();
        } else {
            workId = existing;
            jdbc.sql("""
                    UPDATE work SET cover=COALESCE(NULLIF(cover,''),?),year=COALESCE(year,?),
                      synopsis_short=COALESCE(NULLIF(synopsis_short,''),?),
                      synopsis_full=COALESCE(NULLIF(synopsis_full,''),?),
                      reading_category=COALESCE(reading_category,?),
                      webtoon=webtoon OR ?,updated_at=now()
                    WHERE id=?
                    """).params(detail.coverUrl(), detail.year(), blankToNull(detail.description()),
                            blankToNull(detail.description()), classification.category(),
                            classification.webtoon(), workId).update();
        }
        jdbc.sql("INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                .params(workId, PROVIDER_ID, index.id()).update();
        jdbc.sql("INSERT INTO work_title(work_id,title,title_norm,title_type,language) VALUES (?,?,lower(?),'PRIMARY','en') "
                        + "ON CONFLICT DO NOTHING")
                .params(workId, limit(detail.title(), 300), limit(detail.title(), 300)).update();
        upsertGenres(workId, detail.tags());
        UUID editionId = jdbc.sql("""
                INSERT INTO work_edition(work_id,name,language,is_original,reading_mode,reading_direction)
                VALUES (?,?,'en',FALSE,?,?)
                ON CONFLICT(work_id,name,language) DO UPDATE SET
                  reading_mode=EXCLUDED.reading_mode,reading_direction=EXCLUDED.reading_direction
                RETURNING id
                """).params(workId, EDITION_NAME, classification.webtoon() ? "VERTICAL" : "PAGED",
                        "MANGA".equals(classification.category()) ? "RTL" : "LTR")
                .query(UUID.class).single();
        return new WorkTarget(workId, editionId, created);
    }

    private void upsertChapters(WorkTarget target, List<WeebCentralApiClient.ChapterSummary> chapters) {
        Set<BigDecimal> used = new HashSet<>();
        for (WeebCentralApiClient.ChapterSummary source : chapters) {
            BigDecimal position = chapterPosition(source.number(), source.id());
            while (!used.add(position)) position = position.add(new BigDecimal("0.001"));
            String display = limit(source.number() == null || source.number().isBlank()
                    ? source.label() : source.number(), 30);
            String title = source.title() == null || source.title().isBlank() ? source.label() : source.title();
            UUID chapterId = jdbc.sql("""
                    INSERT INTO chapter(edition_id,title,display_number,sort_position,availability,published_at)
                    VALUES (?,?,?,?,'EXTERNAL_LINK',?)
                    ON CONFLICT(edition_id,sort_position) DO UPDATE SET
                      title=EXCLUDED.title,display_number=EXCLUDED.display_number,
                      published_at=COALESCE(EXCLUDED.published_at,chapter.published_at),
                      availability=CASE WHEN chapter.availability='NATIVE' THEN 'NATIVE' ELSE 'EXTERNAL_LINK' END
                    RETURNING id
                    """).params(target.editionId(), limit(title, 200), display, position,
                            source.publishedAt() == null ? null : source.publishedAt().toLocalDate())
                    .query(UUID.class).single();
            jdbc.sql("""
                    INSERT INTO chapter_source(chapter_id,source_type,source_url,provider,language,embed_allowed,
                                               enabled,provenance,reports_progress,page_count)
                    VALUES (?,'EXTERNAL_LINK',?,?,'en',FALSE,TRUE,?,TRUE,NULL)
                    ON CONFLICT(chapter_id,source_type,source_url) DO UPDATE SET
                      enabled=TRUE,provenance=EXCLUDED.provenance,reports_progress=TRUE
                    """).params(chapterId, source.url(), PROVIDER_NAME, PROVENANCE + LocalDate.now()).update();
        }
        jdbc.sql("UPDATE work SET total_units=GREATEST(COALESCE(total_units,0),?),"
                        + "available_units=GREATEST(COALESCE(available_units,0),?),updated_at=now() WHERE id=?")
                .params(chapters.size(), chapters.size(), target.workId()).update();
    }

    private void upsertGenres(long workId, List<String> tags) {
        int position = 0;
        for (String name : new LinkedHashSet<>(tags)) {
            String slug = genreSlug(name);
            if (slug.isBlank()) continue;
            jdbc.sql("INSERT INTO genre(slug,name) VALUES (?,?) ON CONFLICT DO NOTHING")
                    .params(slug, limit(name, 80)).update();
            Long genreId = jdbc.sql("SELECT id FROM genre WHERE slug=?").param(slug)
                    .query(Long.class).optional().orElse(null);
            if (genreId != null) jdbc.sql("INSERT INTO work_genre(work_id,genre_id,position) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                    .params(workId, genreId, position++).update();
        }
    }

    private Set<String> completedSeries() {
        return new HashSet<>(jdbc.sql("""
                SELECT DISTINCT i.source_key FROM catalog_import_item i
                JOIN catalog_import_run r ON r.id=i.run_id
                WHERE r.source=? AND i.result IN ('CREATED','UPDATED','UNCHANGED')
                """).param(SOURCE_NAME).query(String.class).list());
    }

    private void recordItem(UUID runId, String sourceKey, long workId, String result, String detail) {
        jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,work_id,result,detail) VALUES (?,?,?,?,?)")
                .params(runId, sourceKey, workId, result, detail).update();
    }

    private void recordFailure(UUID runId, String sourceKey, RuntimeException error) {
        try {
            jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,result,detail) VALUES (?,?,'REJECTED',?)")
                    .params(runId, sourceKey, limit(safeMessage(error), 2000)).update();
        } catch (RuntimeException ignored) { }
    }

    static Classification classify(WeebCentralApiClient.SeriesDetail detail) {
        String type = detail.type() == null ? "Manga" : detail.type();
        String category = type.toUpperCase(Locale.ROOT);
        if (!Set.of("MANGA", "MANHWA", "MANHUA", "OEL").contains(category)) category = "MANGA";
        boolean webtoon = "MANHWA".equals(category) || "MANHUA".equals(category);
        Set<String> tags = detail.tags().stream().map(value -> value.toLowerCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toSet());
        String rating = tags.contains("hentai") ? "EXPLICIT"
                : Boolean.TRUE.equals(detail.adultContent()) || tags.contains("adult") ? "ADULT"
                : tags.contains("mature") || tags.contains("ecchi") || tags.contains("smut") ? "MATURE"
                : "GENERAL";
        String status = detail.status() == null ? "UNKNOWN" : switch (detail.status().toLowerCase(Locale.ROOT)) {
            case "complete", "completed" -> "COMPLETED";
            case "hiatus" -> "HIATUS";
            case "canceled", "cancelled" -> "CANCELLED";
            case "ongoing" -> "ONGOING";
            default -> "UNKNOWN";
        };
        String statusLabel = "COMPLETED".equals(status) ? "Complete"
                : "HIATUS".equals(status) ? "Hiatus"
                : "CANCELLED".equals(status) ? "Canceled" : "Ongoing";
        return new Classification(category.toLowerCase(Locale.ROOT), category, webtoon, rating, status, statusLabel);
    }

    private static BigDecimal chapterPosition(String value, String id) {
        Matcher matcher = DECIMAL.matcher(value == null ? "" : value.replace(',', '.'));
        if (matcher.find()) return new BigDecimal(matcher.group(1));
        long stable = 800_000_000L + Integer.toUnsignedLong(id.hashCode()) % 100_000_000L;
        return BigDecimal.valueOf(stable);
    }

    private static String normalizeSlug(String source, String id) {
        String slug = source == null ? "" : source.strip().toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", "-").replaceAll("(^-|-$)", "");
        return limit(slug.isBlank() ? "weebcentral-" + id.toLowerCase(Locale.ROOT) : slug, 340);
    }

    private static String genreSlug(String value) {
        String slug = value == null ? "" : value.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return limit(slug, 80);
    }

    private synchronized void publish(String status, UUID runId, int total, Counters counters,
                                      String current, Instant finished, String error, boolean refresh) {
        Instant started = state.runId() != null && state.runId().equals(runId) ? state.startedAt() : Instant.now();
        state = new SyncState(status, runId, total, counters.processed, counters.created, counters.updated,
                counters.unchanged, counters.chapters, counters.failures, current, started, finished, error, refresh);
    }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value; }
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

    static record Classification(String kind, String category, boolean webtoon, String contentRating,
                                 String storyStatus, String statusLabel) {}
    private record WorkTarget(long workId, UUID editionId, boolean created) {}
    private record LoadedWork(WeebCentralApiClient.SeriesIndexItem index,
                              WeebCentralApiClient.SeriesDetail detail,
                              List<WeebCentralApiClient.ChapterSummary> chapters,
                              RuntimeException error) {}
    private static final class Counters {
        int processed;
        int created;
        int updated;
        int unchanged;
        int chapters;
        int failures;
    }
    private record SyncState(String status, UUID runId, int totalWorks, int processedWorks,
                             int createdWorks, int updatedWorks, int unchangedWorks,
                             int chaptersImported, int failures, String currentSeriesId,
                             Instant startedAt, Instant finishedAt, String lastError, boolean refresh) {
        static SyncState idle() {
            return new SyncState("IDLE", null, 0, 0, 0, 0, 0, 0, 0,
                    null, null, null, null, false);
        }
    }
}
