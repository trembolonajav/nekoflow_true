package com.nekoflow.catalog;

import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.text.Normalizer;
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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Importação integral, idempotente e retomável dos provedores normalizados de leitura. */
@Service
public class ReadingProviderArchiveSyncService {
    private static final Set<String> PROVIDERS = Set.of(
            UnofficialReadingApiClient.TIA, UnofficialReadingApiClient.COMIX, UnofficialReadingApiClient.BUDDY);
    private static final Pattern DECIMAL = Pattern.compile("(\\d+(?:[.,]\\d+)?)");
    private static final int PAGE_SIZE = 100;

    private final UnofficialReadingApiClient api;
    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final ExecutorService workers = Executors.newFixedThreadPool(3, runnable -> {
        Thread thread = new Thread(runnable, "reading-provider-archive-sync");
        thread.setDaemon(true);
        return thread;
    });
    private final Map<String, AtomicBoolean> running = new ConcurrentHashMap<>();
    private final Map<String, SyncState> states = new ConcurrentHashMap<>();

    public ReadingProviderArchiveSyncService(UnofficialReadingApiClient api, JdbcClient jdbc,
                                             TransactionTemplate transactions) {
        this.api = api;
        this.jdbc = jdbc;
        this.transactions = transactions;
        PROVIDERS.forEach(provider -> {
            running.put(provider, new AtomicBoolean());
            states.put(provider, SyncState.idle());
        });
    }

    public Map<String, Object> start(String provider, long actorId, boolean refresh) {
        requireProvider(provider);
        if (!running.get(provider).compareAndSet(false, true)) return status(provider);
        UUID runId = UUID.randomUUID();
        states.put(provider, new SyncState("RUNNING", runId, 0, 0, 0, 0, 0, 0, null,
                Instant.now(), null, null, refresh));
        String source = sourceName(provider);
        jdbc.sql("UPDATE catalog_import_run SET status='FAILED',finished_at=now() WHERE source=? AND status='RUNNING'")
                .param(source).update();
        jdbc.sql("INSERT INTO catalog_import_run(id,source,dry_run,status) VALUES (?,?,FALSE,'RUNNING')")
                .params(runId, source).update();
        CompletableFuture.runAsync(() -> synchronize(provider, runId, actorId, refresh), workers);
        return status(provider);
    }

    public Map<String, Object> startAll(long actorId, boolean refresh) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (String provider : List.of(UnofficialReadingApiClient.TIA,
                UnofficialReadingApiClient.COMIX, UnofficialReadingApiClient.BUDDY)) {
            result.put(provider, start(provider, actorId, refresh));
        }
        return result;
    }

    /** Retoma automaticamente cargas interrompidas por reinício do backend ou do Docker. */
    @EventListener(ApplicationReadyEvent.class)
    void resumeInterruptedImports() {
        Long actorId = jdbc.sql("SELECT id FROM app_user WHERE role='ADMIN' ORDER BY id LIMIT 1")
                .query(Long.class).optional().orElse(null);
        if (actorId == null) return;
        for (String provider : PROVIDERS) {
            String latestStatus = jdbc.sql("SELECT status FROM catalog_import_run WHERE source=? ORDER BY started_at DESC LIMIT 1")
                    .param(sourceName(provider)).query(String.class).optional().orElse(null);
            if ("RUNNING".equals(latestStatus) || "FAILED".equals(latestStatus)) start(provider, actorId, false);
        }
    }

    public Map<String, Object> status(String provider) {
        requireProvider(provider);
        SyncState state = states.get(provider);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("provider", provider);
        result.put("status", state.status());
        result.put("running", running.get(provider).get());
        result.put("runId", state.runId());
        result.put("totalWorks", state.totalWorks());
        result.put("processedWorks", state.processedWorks());
        result.put("createdWorks", state.createdWorks());
        result.put("updatedWorks", state.updatedWorks());
        result.put("chaptersImported", state.chaptersImported());
        result.put("failures", state.failures());
        result.put("currentSeriesId", state.currentSeriesId());
        result.put("startedAt", state.startedAt());
        result.put("finishedAt", state.finishedAt());
        result.put("lastError", state.lastError());
        result.put("refresh", state.refresh());
        return result;
    }

    public Map<String, Object> statusAll() {
        Map<String, Object> result = new LinkedHashMap<>();
        PROVIDERS.stream().sorted().forEach(provider -> result.put(provider, status(provider)));
        return result;
    }

    private void synchronize(String provider, UUID runId, long actorId, boolean refresh) {
        Counters counters = new Counters();
        Set<String> completed = refresh ? Set.of() : completedSeries(provider);
        Set<String> seen = new HashSet<>();
        long total = 0;
        try {
            int page = 1;
            int lastPage = Integer.MAX_VALUE;
            while (page <= lastPage) {
                UnofficialReadingApiClient.ArchivePage archive = api.archivePage(provider, page, PAGE_SIZE);
                if (archive.totalElements() > 0) total = archive.totalElements();
                lastPage = archive.lastPage() <= 0 ? page : archive.lastPage();
                if (archive.items().isEmpty()) break;
                int newOnPage = 0;
                for (UnofficialReadingApiClient.ArchiveEntry entry : archive.items()) {
                    if (!seen.add(entry.id())) continue;
                    newOnPage++;
                    if (completed.contains(sourceKey(entry.id()))) {
                        counters.processed++;
                        publish(provider, "RUNNING", runId, total, counters, entry.id(), null, null, refresh);
                        continue;
                    }
                    process(provider, runId, entry, counters);
                    publish(provider, "RUNNING", runId, total, counters, entry.id(), null, null, refresh);
                }
                if (newOnPage == 0 || page >= lastPage) break;
                page++;
            }
            if (total <= 0) total = counters.processed;
            jdbc.sql("UPDATE catalog_import_run SET status='COMPLETED',created_count=?,updated_count=?,"
                            + "rejected_count=?,finished_at=now() WHERE id=?")
                    .params(counters.created, counters.updated, counters.failures, runId).update();
            jdbc.sql("INSERT INTO catalog_audit_event(actor_id,action,after_data) VALUES "
                            + "(?,'READING_PROVIDER_ARCHIVE_SYNC',jsonb_build_object('runId',?::text,'provider',?,"
                            + "'works',?,'chapters',?,'failures',?))")
                    .params(actorId, runId, provider, counters.processed, counters.chapters, counters.failures).update();
            publish(provider, "COMPLETED", runId, total, counters, null, Instant.now(), null, refresh);
        } catch (RuntimeException error) {
            jdbc.sql("UPDATE catalog_import_run SET status='FAILED',created_count=?,updated_count=?,"
                            + "rejected_count=?,finished_at=now() WHERE id=?")
                    .params(counters.created, counters.updated, counters.failures + 1, runId).update();
            publish(provider, "FAILED", runId, total, counters, states.get(provider).currentSeriesId(),
                    Instant.now(), safeMessage(error), refresh);
        } finally {
            running.get(provider).set(false);
        }
    }

    private void process(String provider, UUID runId, UnofficialReadingApiClient.ArchiveEntry index,
                         Counters counters) {
        try {
            UnofficialReadingApiClient.ArchiveEntry detail = index;
            List<UnofficialReadingApiClient.ChapterSummary> chapters = List.of();
            if (!provider.equals(UnofficialReadingApiClient.COMIX)) {
                UnofficialReadingApiClient.SeriesDetail source = api.series(provider, index.id());
                detail = new UnofficialReadingApiClient.ArchiveEntry(source.id(), source.title(),
                        source.alternativeTitles(), source.synopsis(), source.coverUrl(), source.type(),
                        source.status(), source.adult(), source.language(), source.genres(), source.url(),
                        source.chapterCount(), index.year());
                chapters = api.archiveChapters(provider, index.id());
            }
            UnofficialReadingApiClient.ArchiveEntry loaded = detail;
            WorkTarget target = transactions.execute(status -> upsertWork(provider, loaded));
            if (target == null) throw new IllegalStateException("A transação não retornou a obra.");
            List<UnofficialReadingApiClient.ChapterSummary> loadedChapters = chapters;
            transactions.executeWithoutResult(status -> upsertChapters(provider, target, loadedChapters));
            transactions.executeWithoutResult(status -> recordItem(runId, index.id(), target.workId(),
                    target.created() ? "CREATED" : "UPDATED", loadedChapters.size() + " capítulos"));
            if (target.created()) counters.created++; else counters.updated++;
            counters.chapters += loadedChapters.size();
        } catch (RuntimeException error) {
            counters.failures++;
            recordFailure(runId, index.id(), error);
        }
        counters.processed++;
    }

    private WorkTarget upsertWork(String provider, UnofficialReadingApiClient.ArchiveEntry detail) {
        ProviderInfo info = providerInfo(provider);
        String externalId = limit(detail.id(), 120);
        Long existing = jdbc.sql("SELECT work_id FROM external_identifier WHERE provider=? AND external_id=? LIMIT 1")
                .params(info.providerId(), externalId).query(Long.class).optional().orElse(null);
        if (existing == null) {
            existing = jdbc.sql("SELECT w.id FROM work w LEFT JOIN work_title t ON t.work_id=w.id "
                            + "WHERE w.media_family='READING' AND (lower(w.title)=lower(?) OR lower(t.title)=lower(?)) "
                            + "ORDER BY CASE WHEN lower(w.title)=lower(?) THEN 0 ELSE 1 END,w.id LIMIT 1")
                    .params(detail.title(), detail.title(), detail.title()).query(Long.class).optional().orElse(null);
        }
        Classification classification = classify(provider, detail);
        boolean created = existing == null;
        long workId;
        String slug = uniqueSlug(detail.title(), detail.id(), existing);
        String synopsis = blankToNull(detail.synopsis());
        if (created) {
            jdbc.sql("SELECT pg_advisory_xact_lock(934703)").query((rs, row) -> Boolean.TRUE).single();
            workId = jdbc.sql("SELECT GREATEST(COALESCE(MAX(id) FILTER (WHERE id>=900000000),899999999)+1,900000000) FROM work")
                    .query(Long.class).single();
            jdbc.sql("""
                    INSERT INTO work(id,kind,title,alt_titles,cover,webtoon,year,total_units,available_units,
                      airing_status,slug,media_family,work_format,reading_category,presentation_format,
                      synopsis_short,synopsis_full,synopsis_source,synopsis_language,story_status,
                      visibility,content_rating)
                    VALUES (?,?,?,?,?,?,?,?,?, ?,?,'READING','COMIC',?,?, ?,?,?,?,?,'PUBLISHED',?)
                    """).params(workId, classification.kind(), limit(detail.title(), 300),
                            limit(String.join(" | ", detail.alternativeTitles()), 4000), detail.coverUrl(),
                            classification.webtoon(), detail.year(), detail.chapterCount(), 0,
                            statusLabel(classification.storyStatus()), slug, classification.category(),
                            classification.webtoon() ? "VERTICAL" : "PAGED", synopsis, synopsis,
                            info.providerName(), info.language(), classification.storyStatus(),
                            classification.rating()).update();
        } else {
            workId = existing;
            jdbc.sql("""
                    UPDATE work SET cover=COALESCE(NULLIF(cover,''),?),year=COALESCE(year,?),
                      total_units=GREATEST(COALESCE(total_units,0),COALESCE(?,0)),
                      synopsis_short=COALESCE(NULLIF(synopsis_short,''),?),
                      synopsis_full=COALESCE(NULLIF(synopsis_full,''),?),
                      content_rating=CASE WHEN content_rating IN ('ADULT','EXPLICIT') THEN content_rating ELSE ? END,
                      updated_at=now() WHERE id=?
                    """).params(detail.coverUrl(), detail.year(), detail.chapterCount(), synopsis, synopsis,
                            classification.rating(), workId).update();
        }
        jdbc.sql("INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                .params(workId, info.providerId(), externalId).update();
        jdbc.sql("INSERT INTO work_title(work_id,title,title_norm,title_type,language) VALUES "
                        + "(?,?,lower(?),'PRIMARY',?) ON CONFLICT DO NOTHING")
                .params(workId, limit(detail.title(), 300), limit(detail.title(), 300), info.language()).update();
        for (String alternative : new LinkedHashSet<>(detail.alternativeTitles())) {
            if (alternative == null || alternative.isBlank()) continue;
            jdbc.sql("INSERT INTO work_title(work_id,title,title_norm,title_type,language) VALUES "
                            + "(?,?,lower(?),'ALIAS',?) ON CONFLICT DO NOTHING")
                    .params(workId, limit(alternative, 300), limit(alternative, 300), info.language()).update();
        }
        upsertGenres(workId, detail.genres());
        UUID editionId = jdbc.sql("""
                INSERT INTO work_edition(work_id,name,language,is_original,reading_mode,reading_direction)
                VALUES (?,?,?,FALSE,?,?) ON CONFLICT(work_id,name,language) DO UPDATE SET
                  reading_mode=EXCLUDED.reading_mode,reading_direction=EXCLUDED.reading_direction RETURNING id
                """).params(workId, info.editionName(), info.language(),
                        classification.webtoon() ? "VERTICAL" : "PAGED",
                        "MANGA".equals(classification.category()) ? "RTL" : "LTR")
                .query(UUID.class).single();
        return new WorkTarget(workId, editionId, created);
    }

    private void upsertChapters(String provider, WorkTarget target,
                                List<UnofficialReadingApiClient.ChapterSummary> chapters) {
        if (chapters.isEmpty()) return;
        ProviderInfo info = providerInfo(provider);
        Set<BigDecimal> used = new HashSet<>();
        for (UnofficialReadingApiClient.ChapterSummary source : chapters) {
            BigDecimal position = chapterPosition(source.number(), source.id());
            while (!used.add(position)) position = position.add(new BigDecimal("0.001"));
            String number = limit(source.number() == null || source.number().isBlank() ? source.id() : source.number(), 30);
            UUID chapterId = jdbc.sql("""
                    INSERT INTO chapter(edition_id,title,display_number,sort_position,availability)
                    VALUES (?,?,?,?,'EXTERNAL_LINK') ON CONFLICT(edition_id,sort_position) DO UPDATE SET
                      title=EXCLUDED.title,display_number=EXCLUDED.display_number,
                      availability=CASE WHEN chapter.availability='NATIVE' THEN 'NATIVE' ELSE 'EXTERNAL_LINK' END
                    RETURNING id
                    """).params(target.editionId(), limit(source.title(), 200), number, position)
                    .query(UUID.class).single();
            jdbc.sql("""
                    INSERT INTO chapter_source(chapter_id,source_type,source_url,provider,language,embed_allowed,
                      enabled,provenance,reports_progress,page_count)
                    VALUES (?,'EXTERNAL_LINK',?,?,?,FALSE,TRUE,?, ?,NULL)
                    ON CONFLICT(chapter_id,source_type,source_url) DO UPDATE SET enabled=TRUE,
                      provenance=EXCLUDED.provenance,reports_progress=EXCLUDED.reports_progress
                    """).params(chapterId, source.url(), info.providerName(), info.language(),
                            info.provenance() + LocalDate.now(), !provider.equals(UnofficialReadingApiClient.COMIX)).update();
        }
        jdbc.sql("UPDATE work SET total_units=GREATEST(COALESCE(total_units,0),?),"
                        + "available_units=GREATEST(COALESCE(available_units,0),?),updated_at=now() WHERE id=?")
                .params(chapters.size(), chapters.size(), target.workId()).update();
    }

    private void upsertGenres(long workId, List<String> genres) {
        int position = 0;
        for (String name : new LinkedHashSet<>(genres)) {
            String slug = normalizeSlug(name);
            if (slug.isBlank()) continue;
            jdbc.sql("INSERT INTO genre(slug,name) VALUES (?,?) ON CONFLICT DO NOTHING")
                    .params(limit(slug, 80), limit(name, 80)).update();
            Long genreId = jdbc.sql("SELECT id FROM genre WHERE slug=?").param(limit(slug, 80))
                    .query(Long.class).optional().orElse(null);
            if (genreId != null) jdbc.sql("INSERT INTO work_genre(work_id,genre_id,position) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                    .params(workId, genreId, position++).update();
        }
    }

    private Set<String> completedSeries(String provider) {
        return new HashSet<>(jdbc.sql("""
                SELECT DISTINCT i.source_key FROM catalog_import_item i JOIN catalog_import_run r ON r.id=i.run_id
                WHERE r.source=? AND i.result IN ('CREATED','UPDATED','UNCHANGED')
                """).param(sourceName(provider)).query(String.class).list());
    }

    private void recordItem(UUID runId, String key, long workId, String result, String detail) {
        jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,work_id,result,detail) VALUES (?,?,?,?,?)")
                .params(runId, sourceKey(key), workId, result, detail).update();
    }

    private void recordFailure(UUID runId, String key, RuntimeException error) {
        try {
            jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,result,detail) VALUES (?,?,'REJECTED',?)")
                    .params(runId, limit(key, 160), limit(safeMessage(error), 2000)).update();
        } catch (RuntimeException ignored) { }
    }

    private static String sourceKey(String value) { return limit(value, 160); }

    private void publish(String provider, String status, UUID runId, long total, Counters counters,
                         String current, Instant finished, String error, boolean refresh) {
        states.put(provider, new SyncState(status, runId, total, counters.processed, counters.created,
                counters.updated, counters.chapters, counters.failures, current,
                states.get(provider).startedAt(), finished, error, refresh));
    }

    private String uniqueSlug(String title, String externalId, Long existing) {
        if (existing != null) return jdbc.sql("SELECT slug FROM work WHERE id=?").param(existing)
                .query(String.class).single();
        String base = limit(normalizeSlug(title), 300);
        if (base.isBlank()) base = "leitura";
        String candidate = base;
        if (jdbc.sql("SELECT EXISTS(SELECT 1 FROM work WHERE media_family='READING' AND slug=?)")
                .param(candidate).query(Boolean.class).single()) {
            candidate = limit(base + "-" + normalizeSlug(externalId), 340);
        }
        return candidate;
    }

    private static Classification classify(String provider, UnofficialReadingApiClient.ArchiveEntry detail) {
        String type = detail.type() == null ? "" : detail.type().toUpperCase(Locale.ROOT);
        String category = type.contains("MANHWA") ? "MANHWA" : type.contains("MANHUA") ? "MANHUA"
                : type.contains("MANGA") ? "MANGA" : provider.equals(UnofficialReadingApiClient.COMIX) ? "MANGA" : "MANHWA";
        boolean webtoon = !"MANGA".equals(category);
        String rating = Boolean.TRUE.equals(detail.adult())
                ? (provider.equals(UnofficialReadingApiClient.TIA) ? "EXPLICIT" : "ADULT") : "GENERAL";
        String status = detail.status() == null ? "UNKNOWN" : switch (detail.status().toLowerCase(Locale.ROOT)) {
            case "complete", "completed" -> "COMPLETED";
            case "hiatus" -> "HIATUS";
            case "canceled", "cancelled" -> "CANCELLED";
            case "ongoing", "releasing" -> "ONGOING";
            default -> "UNKNOWN";
        };
        return new Classification(category.toLowerCase(Locale.ROOT), category, webtoon, rating, status);
    }

    private static BigDecimal chapterPosition(String value, String id) {
        Matcher matcher = DECIMAL.matcher(value == null ? "" : value);
        if (matcher.find()) return new BigDecimal(matcher.group(1).replace(',', '.'));
        long stable = 800_000_000L + Integer.toUnsignedLong(id.hashCode()) % 100_000_000L;
        return BigDecimal.valueOf(stable);
    }

    private static ProviderInfo providerInfo(String provider) {
        return switch (provider) {
            case UnofficialReadingApiClient.TIA -> new ProviderInfo("TIAMANHWA_PTBR", "TiaManhwa",
                    "pt-BR", "Português — TiaManhwa", "TiaManhwa authorized catalog sync on ");
            case UnofficialReadingApiClient.COMIX -> new ProviderInfo("COMIX_EN", "Comix",
                    "en", "English — Comix", "Comix public catalog sync on ");
            case UnofficialReadingApiClient.BUDDY -> new ProviderInfo("MANHWABUDDY_EN", "ManhwaBuddy",
                    "en", "English — ManhwaBuddy", "ManhwaBuddy authorized catalog sync on ");
            default -> throw new IllegalArgumentException("Provedor inválido.");
        };
    }

    private static String sourceName(String provider) { return providerInfo(provider).providerId() + "_ARCHIVE"; }
    private static String statusLabel(String status) { return "COMPLETED".equals(status) ? "Complete" : "Ongoing"; }
    private static String normalizeSlug(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return normalized;
    }
    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.strip(); }
    private static String limit(String value, int max) { return value == null ? null : value.substring(0, Math.min(max, value.length())); }
    private static String safeMessage(Throwable error) { return limit(error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage(), 2000); }
    private static void requireProvider(String provider) { if (!PROVIDERS.contains(provider)) throw new IllegalArgumentException("Provedor inválido."); }

    @PreDestroy
    void close() { workers.shutdownNow(); }

    private static final class Counters { int processed; int created; int updated; int chapters; int failures; }
    private record WorkTarget(long workId, UUID editionId, boolean created) {}
    private record ProviderInfo(String providerId, String providerName, String language,
                                String editionName, String provenance) {}
    private record Classification(String kind, String category, boolean webtoon, String rating, String storyStatus) {}
    private record SyncState(String status, UUID runId, long totalWorks, int processedWorks,
                             int createdWorks, int updatedWorks, int chaptersImported, int failures,
                             String currentSeriesId, Instant startedAt, Instant finishedAt,
                             String lastError, boolean refresh) {
        static SyncState idle() { return new SyncState("IDLE", null, 0, 0, 0, 0, 0, 0,
                null, null, null, null, false); }
    }
}
