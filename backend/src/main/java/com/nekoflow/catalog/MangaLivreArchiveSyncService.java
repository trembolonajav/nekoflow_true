package com.nekoflow.catalog;

import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Importação idempotente do catálogo e dos capítulos públicos do MangaLivre. */
@Service
public class MangaLivreArchiveSyncService {
    private static final String PROVIDER = "MANGALIVRE";
    private static final String SOURCE_NAME = "MANGA_LIVRE_ARCHIVE";
    private static final String EDITION_NAME = "Português — Manga Livre";
    private static final String PROVENANCE = "Sincronização da API pública não oficial do MangaLivre em ";
    private static final Pattern DECIMAL = Pattern.compile("(\\d+(?:\\.\\d+)?)");
    private static final Set<String> NON_GENRE_MARKERS = Set.of(
            "manga", "type-manga", "status-completo", "status-em-andamento", "status-hiato",
            "full-color", "long-strip", "web-comic", "adulto", "hentai", "pornhwa", "ecchi");

    private final MangaLivreApiClient api;
    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "mangalivre-archive-sync");
        thread.setDaemon(true);
        return thread;
    });
    private volatile SyncState state = SyncState.idle();

    public MangaLivreArchiveSyncService(MangaLivreApiClient api, JdbcClient jdbc,
                                        TransactionTemplate transactions) {
        this.api = api;
        this.jdbc = jdbc;
        this.transactions = transactions;
    }

    public synchronized Map<String, Object> start(long actorId) {
        if (!running.compareAndSet(false, true)) return status();
        UUID runId = UUID.randomUUID();
        state = new SyncState("RUNNING", runId, 0, 0, 0, 0, 0, 0, null,
                Instant.now(), null, null);
        jdbc.sql("UPDATE catalog_import_run SET status='FAILED',finished_at=now() "
                        + "WHERE source=? AND status='RUNNING'")
                .param(SOURCE_NAME).update();
        jdbc.sql("INSERT INTO catalog_import_run(id,source,dry_run,status) VALUES (?,?,FALSE,'RUNNING')")
                .params(runId, SOURCE_NAME).update();
        CompletableFuture.runAsync(() -> synchronize(runId, actorId), executor);
        return status();
    }

    public synchronized Map<String, Object> status() {
        SyncState s = state;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", s.status());
        result.put("running", running.get());
        result.put("runId", s.runId());
        result.put("totalWorks", s.totalWorks());
        result.put("processedWorks", s.processedWorks());
        result.put("createdWorks", s.createdWorks());
        result.put("updatedWorks", s.updatedWorks());
        result.put("chaptersImported", s.chaptersImported());
        result.put("failures", s.failures());
        result.put("currentSlug", s.currentSlug());
        result.put("startedAt", s.startedAt());
        result.put("finishedAt", s.finishedAt());
        result.put("lastError", s.lastError());
        return result;
    }

    private void synchronize(UUID runId, long actorId) {
        int created = 0;
        int updated = 0;
        int chapters = 0;
        int failures = 0;
        int processed = 0;
        ExecutorService readers = null;
        try {
            List<MangaLivreApiClient.MangaSummary> catalog = allCatalog();
            publish("RUNNING", runId, catalog.size(), 0, 0, 0, 0, 0, null, null, null);
            readers = Executors.newFixedThreadPool(4, r -> {
                Thread thread = new Thread(r, "mangalivre-metadata-reader");
                thread.setDaemon(true);
                return thread;
            });
            List<CompletableFuture<LoadedWork>> loads = new ArrayList<>();
            for (MangaLivreApiClient.MangaSummary manga : catalog) {
                loads.add(CompletableFuture.supplyAsync(() -> loadChapters(manga), readers));
            }
            for (int index = 0; index < catalog.size(); index++) {
                MangaLivreApiClient.MangaSummary manga = catalog.get(index);
                publish("RUNNING", runId, catalog.size(), processed, created, updated, chapters,
                        failures, manga.slug(), null, null);
                try {
                    LoadedWork loaded = loads.get(index).join();
                    WorkTarget target = transactions.execute(status -> upsertWork(manga, loaded.detail()));
                    if (target == null) throw new IllegalStateException("Transação da obra não retornou resultado.");
                    if (loaded.error() != null) throw loaded.error();
                    List<MangaLivreApiClient.ChapterSummary> sourceChapters = loaded.chapters();
                    transactions.executeWithoutResult(status -> upsertChapters(target, sourceChapters));
                    transactions.executeWithoutResult(status -> recordItem(runId, manga.slug(), target.workId(),
                            target.created() ? "CREATED" : "UPDATED", sourceChapters.size() + " capítulos"));
                    if (target.created()) created++; else updated++;
                    chapters += sourceChapters.size();
                } catch (RuntimeException error) {
                    failures++;
                    recordFailure(runId, manga.slug(), error);
                }
                processed++;
                publish("RUNNING", runId, catalog.size(), processed, created, updated, chapters,
                        failures, manga.slug(), null, null);
            }
            jdbc.sql("UPDATE catalog_import_run SET status='COMPLETED',created_count=?,updated_count=?,"
                            + "rejected_count=?,finished_at=now() WHERE id=?")
                    .params(created, updated, failures, runId).update();
            jdbc.sql("INSERT INTO catalog_audit_event(actor_id,action,after_data) "
                            + "VALUES (?,'MANGALIVRE_ARCHIVE_SYNC',jsonb_build_object('runId',?::text,'works',?,'chapters',?,'failures',?))")
                    .params(actorId, runId, processed, chapters, failures).update();
            publish("COMPLETED", runId, catalog.size(), processed, created, updated, chapters,
                    failures, null, Instant.now(), null);
        } catch (RuntimeException error) {
            jdbc.sql("UPDATE catalog_import_run SET status='FAILED',created_count=?,updated_count=?,"
                            + "rejected_count=?,finished_at=now() WHERE id=?")
                    .params(created, updated, failures + 1, runId).update();
            publish("FAILED", runId, state.totalWorks(), processed, created, updated, chapters,
                    failures + 1, state.currentSlug(), Instant.now(), safeMessage(error));
        } finally {
            if (readers != null) readers.shutdownNow();
            running.set(false);
        }
    }

    private LoadedWork loadChapters(MangaLivreApiClient.MangaSummary manga) {
        MangaLivreApiClient.MangaDetail detail = null;
        try {
            detail = api.manga(manga.slug());
            return new LoadedWork(detail, allChapters(manga.slug()), null);
        } catch (RuntimeException error) {
            return new LoadedWork(detail, List.of(), error);
        }
    }

    private List<MangaLivreApiClient.MangaSummary> allCatalog() {
        List<MangaLivreApiClient.MangaSummary> result = new ArrayList<>();
        MangaLivreApiClient.MangaPage first = api.catalog(1, 100, "");
        result.addAll(first.items());
        for (int page = 2; page <= first.totalPages(); page++) result.addAll(api.catalog(page, 100, "").items());
        return result;
    }

    private List<MangaLivreApiClient.ChapterSummary> allChapters(String slug) {
        List<MangaLivreApiClient.ChapterSummary> result = new ArrayList<>();
        int offset = 0;
        boolean more;
        do {
            MangaLivreApiClient.ChapterPage batch = api.chapters(slug, offset, "");
            result.addAll(batch.items());
            if (batch.hasMore() && batch.nextOffset() <= offset)
                throw new MangaLivreApiClient.ProviderException("Paginação MangaLivre não avançou.");
            offset = batch.nextOffset();
            more = batch.hasMore();
        } while (more);
        return result;
    }

    private WorkTarget upsertWork(MangaLivreApiClient.MangaSummary manga,
                                  MangaLivreApiClient.MangaDetail detail) {
        Long existing = jdbc.sql("SELECT work_id FROM external_identifier WHERE provider=? AND external_id=? "
                        + "ORDER BY id LIMIT 1")
                .params(PROVIDER, Long.toString(manga.id())).query(Long.class).optional().orElse(null);
        if (existing == null) {
            existing = jdbc.sql("SELECT id FROM work WHERE media_family='READING' AND slug=? LIMIT 1")
                    .param(manga.slug()).query(Long.class).optional().orElse(null);
        }
        Classification classification = classify(manga.markers());
        String cover = manga.coverUrl() != null ? manga.coverUrl() : detail == null ? null : detail.coverUrl();
        String synopsis = manga.synopsis() != null && !manga.synopsis().isBlank()
                ? manga.synopsis() : detail == null ? null : detail.synopsis();
        boolean created = existing == null;
        long workId;
        if (created) {
            workId = jdbc.sql("SELECT GREATEST(COALESCE(MAX(id) FILTER (WHERE id>=900000000),899999999)+1,900000000) FROM work")
                    .query(Long.class).single();
            jdbc.sql("""
                    INSERT INTO work(id,kind,title,alt_titles,cover,webtoon,total_units,available_units,
                                     airing_status,slug,media_family,work_format,reading_category,
                                     presentation_format,synopsis_short,synopsis_full,synopsis_source,
                                     synopsis_language,story_status,visibility,content_rating)
                    VALUES (?,?,?,'',?,?,0,0,?,?, 'READING','COMIC',?,?,?,?,?,? ,?,'PUBLISHED',?)
                    """).params(workId, classification.kind(), limit(manga.title(), 300), cover,
                            classification.webtoon(), classification.statusLabel(), manga.slug(),
                            classification.category(), classification.webtoon() ? "VERTICAL" : "PAGED",
                            blankToNull(synopsis), blankToNull(synopsis),
                            "MangaLivre", "pt-BR", classification.storyStatus(), classification.contentRating()).update();
        } else {
            workId = existing;
            jdbc.sql("""
                    UPDATE work SET
                      cover=COALESCE(NULLIF(cover,''),?),
                      synopsis_short=COALESCE(NULLIF(synopsis_short,''),?),
                      synopsis_full=COALESCE(NULLIF(synopsis_full,''),?),
                      reading_category=COALESCE(reading_category,?),
                      content_rating=COALESCE(content_rating,?),
                      webtoon=webtoon OR ?, updated_at=now()
                    WHERE id=?
                    """).params(cover, blankToNull(synopsis), blankToNull(synopsis),
                            classification.category(), classification.contentRating(), classification.webtoon(), workId).update();
        }
        jdbc.sql("INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                .params(workId, PROVIDER, Long.toString(manga.id())).update();
        jdbc.sql("INSERT INTO work_title(work_id,title,title_norm,title_type,language) VALUES (?,?,lower(?),'PRIMARY','pt-BR') "
                        + "ON CONFLICT DO NOTHING")
                .params(workId, limit(manga.title(), 300), limit(manga.title(), 300)).update();
        upsertGenres(workId, manga.markers());
        UUID editionId = jdbc.sql("""
                INSERT INTO work_edition(work_id,name,language,is_original,reading_mode,reading_direction)
                VALUES (?,?,'pt-BR',FALSE,?,'LTR')
                ON CONFLICT(work_id,name,language) DO UPDATE SET reading_mode=EXCLUDED.reading_mode
                RETURNING id
                """).params(workId, EDITION_NAME, classification.webtoon() ? "VERTICAL" : "PAGED")
                .query(UUID.class).single();
        return new WorkTarget(workId, editionId, created);
    }

    private void upsertChapters(WorkTarget target, List<MangaLivreApiClient.ChapterSummary> chapters) {
        int fallback = 1_000_000;
        for (MangaLivreApiClient.ChapterSummary source : chapters) {
            BigDecimal position = chapterPosition(source.number(), fallback++);
            String display = limit(source.number().isBlank() ? position.toPlainString() : source.number(), 30);
            String title = source.title() == null || source.title().isBlank() ? "Capítulo " + display : source.title();
            UUID chapterId = jdbc.sql("""
                    INSERT INTO chapter(edition_id,title,display_number,sort_position,availability)
                    VALUES (?,?,?,?,'EXTERNAL_LINK')
                    ON CONFLICT(edition_id,sort_position) DO UPDATE SET
                      title=EXCLUDED.title,display_number=EXCLUDED.display_number,
                      availability=CASE WHEN chapter.availability='NATIVE' THEN 'NATIVE' ELSE 'EXTERNAL_LINK' END
                    RETURNING id
                    """).params(target.editionId(), limit(title, 200), display, position).query(UUID.class).single();
            jdbc.sql("""
                    INSERT INTO chapter_source(chapter_id,source_type,source_url,provider,language,embed_allowed,
                                               enabled,provenance,reports_progress,page_count)
                    VALUES (?,'EXTERNAL_LINK',?,'Manga Livre','pt-BR',FALSE,TRUE,?,TRUE,NULL)
                    ON CONFLICT(chapter_id,source_type,source_url) DO UPDATE SET
                      enabled=TRUE,provenance=EXCLUDED.provenance,reports_progress=TRUE
                    """).params(chapterId, source.url(), PROVENANCE + LocalDate.now()).update();
        }
        jdbc.sql("UPDATE work SET total_units=?,available_units=?,updated_at=now() WHERE id=?")
                .params(chapters.size(), chapters.size(), target.workId()).update();
    }

    private void upsertGenres(long workId, List<String> markers) {
        int position = 0;
        for (String marker : new LinkedHashSet<>(markers)) {
            if (!marker.startsWith("genre-")) continue;
            String slug = marker.substring("genre-".length());
            if (slug.isBlank() || slug.length() > 80 || slug.matches("\\d+") || NON_GENRE_MARKERS.contains(slug)) continue;
            String name = humanize(slug);
            jdbc.sql("INSERT INTO genre(slug,name) VALUES (?,?) ON CONFLICT DO NOTHING").params(slug, name).update();
            Long genreId = jdbc.sql("SELECT id FROM genre WHERE slug=?").param(slug).query(Long.class).optional().orElse(null);
            if (genreId != null) jdbc.sql("INSERT INTO work_genre(work_id,genre_id,position) VALUES (?,?,?) ON CONFLICT DO NOTHING")
                    .params(workId, genreId, position++).update();
        }
    }

    private void recordItem(UUID runId, String slug, long workId, String result, String detail) {
        jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,work_id,result,detail) VALUES (?,?,?,?,?)")
                .params(runId, limit(slug, 160), workId, result, detail).update();
    }

    private void recordFailure(UUID runId, String slug, RuntimeException error) {
        try {
            jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,result,detail) VALUES (?,?, 'REJECTED',?)")
                    .params(runId, limit(slug, 160), limit(safeMessage(error), 2000)).update();
        } catch (RuntimeException ignored) { }
    }

    private synchronized void publish(String status, UUID runId, int total, int processed, int created,
                                      int updated, int chapters, int failures, String current,
                                      Instant finished, String error) {
        Instant started = state.runId() != null && state.runId().equals(runId) ? state.startedAt() : Instant.now();
        state = new SyncState(status, runId, total, processed, created, updated, chapters, failures,
                current, started, finished, error);
    }

    static Classification classify(List<String> markers) {
        Set<String> values = new LinkedHashSet<>(markers);
        boolean webtoon = values.contains("genre-long-strip") || values.contains("genre-web-comic")
                || values.contains("genre-pornhwa");
        String category = values.contains("genre-pornhwa") ? "MANHWA" : webtoon ? "WEBTOON" : "MANGA";
        String rating = values.contains("genre-hentai") || values.contains("genre-pornhwa") ? "EXPLICIT"
                : values.contains("genre-adulto") ? "ADULT"
                : values.contains("genre-ecchi") ? "MATURE" : "GENERAL";
        String storyStatus = values.contains("status-completo") ? "COMPLETED"
                : values.contains("status-hiato") ? "HIATUS" : "ONGOING";
        String statusLabel = "COMPLETED".equals(storyStatus) ? "Concluído"
                : "HIATUS".equals(storyStatus) ? "Em hiato" : "Em lançamento";
        return new Classification("MANHWA".equals(category) ? "manhwa" : "manga", category,
                webtoon, rating, storyStatus, statusLabel);
    }

    private static BigDecimal chapterPosition(String value, int fallback) {
        Matcher matcher = DECIMAL.matcher(value == null ? "" : value.replace(',', '.'));
        return matcher.find() ? new BigDecimal(matcher.group(1)) : BigDecimal.valueOf(fallback);
    }

    private static String humanize(String slug) {
        StringBuilder result = new StringBuilder();
        for (String part : slug.split("-")) {
            if (part.isBlank()) continue;
            if (!result.isEmpty()) result.append(' ');
            result.append(part.substring(0, 1).toUpperCase(Locale.forLanguageTag("pt-BR")))
                    .append(part.substring(1));
        }
        return limit(result.toString(), 80);
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
    void stop() { executor.shutdownNow(); }

    record Classification(String kind, String category, boolean webtoon, String contentRating,
                          String storyStatus, String statusLabel) {}
    private record WorkTarget(long workId, UUID editionId, boolean created) {}
    private record LoadedWork(MangaLivreApiClient.MangaDetail detail,
                              List<MangaLivreApiClient.ChapterSummary> chapters,
                              RuntimeException error) {}
    private record SyncState(String status, UUID runId, int totalWorks, int processedWorks,
                             int createdWorks, int updatedWorks, int chaptersImported, int failures,
                             String currentSlug, Instant startedAt, Instant finishedAt, String lastError) {
        static SyncState idle() {
            return new SyncState("IDLE", null, 0, 0, 0, 0, 0, 0, null, null, null, null);
        }
    }
}
