package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.net.URI;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Descobre deltas do HiAnime a cada quinze minutos e publica vínculos confirmados. */
@Service
public class HiAnimeSyncService {
    private static final Logger log = LoggerFactory.getLogger(HiAnimeSyncService.class);
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private final HiAnimeApiClient api;
    private final HiAnimeSyncImporter importer;
    private final boolean enabled;
    private final int recentPages;
    private final String owner = UUID.randomUUID().toString();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "hianime-sync");
        thread.setDaemon(true);
        return thread;
    });

    public HiAnimeSyncService(JdbcClient jdbc, ObjectMapper mapper, HiAnimeApiClient api,
                              HiAnimeSyncImporter importer,
                              @Value("${nekoflow.hianime.enabled:true}") boolean enabled,
                              @Value("${nekoflow.hianime.recent-pages:2}") int recentPages) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.api = api;
        this.importer = importer;
        this.enabled = enabled;
        this.recentPages = Math.max(1, Math.min(recentPages, 5));
    }

    @Scheduled(initialDelayString = "${nekoflow.hianime.initial-delay-ms:90000}",
            fixedDelayString = "${nekoflow.hianime.sync-interval-ms:900000}")
    public void scheduled() {
        if (enabled) trigger("SCHEDULED", null);
    }

    public UUID triggerManual(long actorId) {
        if (!enabled) throw new IllegalStateException("A sincronização HiAnime está desabilitada.");
        return trigger("MANUAL", actorId);
    }

    private UUID trigger(String type, Long actorId) {
        UUID runId = UUID.randomUUID();
        jdbc.sql("INSERT INTO hianime_sync_run(id,trigger_type,status,actor_id) VALUES (?,?, 'QUEUED',?)")
                .params(runId, type, actorId).update();
        executor.execute(() -> execute(runId));
        return runId;
    }

    private void execute(UUID runId) {
        Counters counters = new Counters();
        if (!acquireLock()) {
            finish(runId, "SKIPPED", counters, "Outra sincronização já está em andamento.");
            return;
        }
        try {
            jdbc.sql("UPDATE hianime_sync_run SET status='RUNNING',started_at=now() WHERE id=?")
                    .param(runId).update();
            checkHealth();
            Set<String> seen = new LinkedHashSet<>();
            for (int page = 1; page <= recentPages; page++) {
                for (HiAnimeApiClient.RecentAnime anime : api.recentlyUpdated(page)) {
                    if (seen.add(anime.id())) syncAnime(anime, counters);
                }
            }
            finish(runId, "COMPLETED", counters, null);
        } catch (Exception e) {
            counters.errors++;
            providerHealth("DOWN", null, limited(e.getMessage(), 600));
            finish(runId, "FAILED", counters, limited(e.getMessage(), 1500));
            log.warn("Sincronização HiAnime {} falhou", runId, e);
        } finally {
            releaseLock();
        }
    }

    private void syncAnime(HiAnimeApiClient.RecentAnime anime, Counters counters) {
        List<Watch> watches = jdbc.sql("""
                SELECT x.work_id,s.season_id,s.auto_publish
                FROM external_identifier x JOIN hianime_sync_work s ON s.work_id=x.work_id
                WHERE x.provider='HIANIME' AND x.external_id=? AND s.enabled AND s.season_id IS NOT NULL""")
                .param(anime.id()).query((rs, n) -> new Watch(rs.getLong(1), rs.getObject(2, UUID.class),
                        rs.getBoolean(3))).list();
        for (Watch watch : watches) {
            counters.checked++;
            try {
                List<HiAnimeApiClient.Episode> episodes = api.episodes(anime.id());
                for (HiAnimeApiClient.Episode episode : episodes) discover(watch, anime, episode, counters);
                jdbc.sql("""
                        UPDATE hianime_sync_work SET last_checked_at=now(),last_success_at=now(),
                          last_error=NULL,updated_at=now() WHERE work_id=?""").param(watch.workId()).update();
            } catch (Exception e) {
                counters.errors++;
                jdbc.sql("UPDATE hianime_sync_work SET last_checked_at=now(),last_error=?,updated_at=now() WHERE work_id=?")
                        .params(limited(e.getMessage(), 1000), watch.workId()).update();
            }
        }
    }

    private void discover(Watch watch, HiAnimeApiClient.RecentAnime anime,
                          HiAnimeApiClient.Episode episode, Counters counters) throws Exception {
        boolean bound = jdbc.sql("""
                SELECT EXISTS(SELECT 1 FROM hianime_episode_binding
                  WHERE external_anime_id=? AND external_episode_id=?)""")
                .params(anime.id(), episode.id()).query(Boolean.class).single();
        if (bound) return;

        UUID existing = jdbc.sql("SELECT id FROM episode WHERE season_id=? AND sort_position=?")
                .params(watch.seasonId(), BigDecimal.valueOf(episode.number())).query(UUID.class).optional().orElse(null);
        if (existing != null) {
            boolean hasSource = jdbc.sql("SELECT EXISTS(SELECT 1 FROM episode_source WHERE episode_id=? AND enabled)")
                    .param(existing).query(Boolean.class).single();
            if (hasSource) {
                jdbc.sql("""
                        INSERT INTO hianime_episode_binding(episode_id,work_id,external_anime_id,external_episode_id)
                        VALUES (?,?,?,?) ON CONFLICT DO NOTHING""")
                        .params(existing, watch.workId(), anime.id(), episode.id()).update();
                return;
            }
        }

        List<HiAnimeApiClient.Player> players = api.players(episode.id());
        List<String> allowed = jdbc.sql("""
                SELECT unnest(allowed_hosts) FROM media_provider
                WHERE code='HIANIME_API_EMBED' AND enabled""").query(String.class).list();
        ObjectNode payload = mapper.createObjectNode();
        payload.put("animeTitle", anime.title());
        payload.put("sub", episode.sub());
        payload.put("dub", episode.dub());
        ArrayNode sources = payload.putArray("sources");
        int usable = 0;
        for (HiAnimeApiClient.Player player : players) {
            String host;
            try { host = URI.create(player.iframe()).getHost(); } catch (RuntimeException e) { continue; }
            if (host == null || !player.iframe().startsWith("https://")) continue;
            ObjectNode source = sources.addObject();
            source.put("type", player.type());
            source.put("server", player.server());
            source.put("url", player.iframe());
            source.put("host", host.toLowerCase());
            boolean accepted = allowed.contains(host.toLowerCase());
            source.put("allowed", accepted);
            if (accepted) usable++;
        }
        boolean standardNumber = episode.number() > 0 && episode.number() == Math.rint(episode.number());
        String status = usable > 0 && standardNumber ? "READY" : "REVIEW";
        String reason = !standardNumber ? "NON_STANDARD_EPISODE"
                : players.isEmpty() ? "NO_SOURCE" : usable == 0 ? "UNKNOWN_HOST" : null;
        UUID candidate = jdbc.sql("""
                INSERT INTO hianime_sync_candidate(work_id,season_id,external_anime_id,external_episode_id,
                    episode_number,title,payload,status,confidence,reason)
                VALUES (:work,:season,:anime,:episode,:number,:title,CAST(:payload AS jsonb),:status,
                    CASE WHEN :status='READY' THEN 100 ELSE 70 END,:reason)
                ON CONFLICT(work_id,external_anime_id,external_episode_id) DO UPDATE SET
                    payload=EXCLUDED.payload,title=EXCLUDED.title,updated_at=now(),
                    status=CASE WHEN hianime_sync_candidate.status IN ('PUBLISHED','IGNORED')
                                THEN hianime_sync_candidate.status ELSE EXCLUDED.status END,
                    reason=CASE WHEN hianime_sync_candidate.status IN ('PUBLISHED','IGNORED')
                                THEN hianime_sync_candidate.reason ELSE EXCLUDED.reason END
                RETURNING id""")
                .param("work", watch.workId()).param("season", watch.seasonId())
                .param("anime", anime.id()).param("episode", episode.id())
                .param("number", BigDecimal.valueOf(episode.number())).param("title", limited(episode.title(), 300))
                .param("payload", payload.toString()).param("status", status).param("reason", reason)
                .query(UUID.class).single();
        counters.discovered++;
        if (watch.autoPublish() && "READY".equals(status)) {
            try {
                importer.approve(candidate, null);
                counters.published++;
            } catch (Exception e) {
                counters.errors++;
                jdbc.sql("UPDATE hianime_sync_candidate SET status='FAILED',reason='IMPORT_FAILED',updated_at=now() WHERE id=?")
                        .param(candidate).update();
            }
        } else {
            counters.review++;
        }
    }

    private boolean acquireLock() {
        return jdbc.sql("""
                UPDATE hianime_sync_lock SET owner=?,locked_until=now()+interval '30 minutes'
                WHERE name='HIANIME_RECENT' AND (locked_until IS NULL OR locked_until<now() OR owner=?)""")
                .params(owner, owner).update() == 1;
    }

    private void releaseLock() {
        jdbc.sql("UPDATE hianime_sync_lock SET owner=NULL,locked_until=NULL WHERE name='HIANIME_RECENT' AND owner=?")
                .param(owner).update();
    }

    private void checkHealth() throws Exception {
        long latency = api.health();
        providerHealth(latency > 5000 ? "DEGRADED" : "HEALTHY", (int) latency, "API respondeu normalmente");
    }

    private void providerHealth(String status, Integer latency, String message) {
        jdbc.sql("""
                INSERT INTO hianime_provider_health(provider,status,latency_ms,message,checked_at)
                VALUES ('HIANIME',?,?,?,now()) ON CONFLICT(provider) DO UPDATE SET
                  status=EXCLUDED.status,latency_ms=EXCLUDED.latency_ms,message=EXCLUDED.message,checked_at=now()""")
                .params(status, latency, message).update();
    }

    private void finish(UUID id, String status, Counters c, String error) {
        jdbc.sql("""
                UPDATE hianime_sync_run SET status=?,checked_works=?,discovered_count=?,published_count=?,
                  review_count=?,error_count=?,error_message=?,finished_at=now(),
                  started_at=COALESCE(started_at,now()) WHERE id=?""")
                .params(status, c.checked, c.discovered, c.published, c.review, c.errors, error, id).update();
    }

    public Map<String, Object> dashboard() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", enabled);
        out.put("intervalMinutes", 15);
        out.put("monitoredWorks", jdbc.sql("SELECT count(*) FROM hianime_sync_work WHERE enabled").query(Long.class).single());
        out.put("autoPublishWorks", jdbc.sql("SELECT count(*) FROM hianime_sync_work WHERE enabled AND auto_publish").query(Long.class).single());
        out.put("pendingReview", jdbc.sql("SELECT count(*) FROM hianime_sync_candidate WHERE status IN ('READY','REVIEW','FAILED')").query(Long.class).single());
        out.put("publishedToday", jdbc.sql("SELECT count(*) FROM hianime_sync_candidate WHERE status='PUBLISHED' AND decided_at>=current_date").query(Long.class).single());
        out.put("health", row("SELECT provider,status,latency_ms,message,checked_at FROM hianime_provider_health WHERE provider='HIANIME'"));
        out.put("lastRun", row("SELECT id,status,trigger_type,checked_works,discovered_count,published_count,review_count,error_count,error_message,started_at,finished_at FROM hianime_sync_run ORDER BY created_at DESC LIMIT 1"));
        return out;
    }

    public List<Map<String, Object>> runs() {
        return rows("SELECT id,status,trigger_type,checked_works,discovered_count,published_count,review_count,error_count,error_message,started_at,finished_at,created_at FROM hianime_sync_run ORDER BY created_at DESC LIMIT 40");
    }

    public List<Map<String, Object>> candidates(String status) {
        String filter = status == null || status.isBlank() ? "" : status.toUpperCase();
        return jdbc.sql("""
                SELECT c.id,w.public_id AS work_id,w.title AS work_title,w.cover,c.external_anime_id,
                  c.external_episode_id,c.episode_number,c.title,c.status,c.confidence,c.reason,
                  jsonb_array_length(COALESCE(c.payload->'sources','[]'::jsonb)) AS source_count,
                  c.discovered_at,c.updated_at
                FROM hianime_sync_candidate c JOIN work w ON w.id=c.work_id
                WHERE :status='' OR c.status=:status ORDER BY c.discovered_at DESC LIMIT 100""")
                .param("status", filter).query((rs, n) -> map(rs)).list();
    }

    public List<Map<String, Object>> watches() {
        return rows("""
                SELECT w.public_id AS work_id,w.title,w.cover,x.external_id AS hianime_id,s.enabled,
                  s.auto_publish,s.interval_minutes,s.last_checked_at,s.last_success_at,s.last_error,
                  (SELECT max(e.sort_position) FROM season se JOIN episode e ON e.season_id=se.id
                   WHERE se.work_id=w.id) AS latest_episode
                FROM hianime_sync_work s JOIN work w ON w.id=s.work_id
                JOIN external_identifier x ON x.work_id=w.id AND x.provider='HIANIME'
                ORDER BY COALESCE(s.last_error,'' ) DESC,w.title LIMIT 300""");
    }

    public void settings(UUID publicId, boolean enabled, boolean autoPublish) {
        int changed = jdbc.sql("""
                UPDATE hianime_sync_work s SET enabled=?,auto_publish=?,updated_at=now()
                FROM work w WHERE s.work_id=w.id AND w.public_id=?""")
                .params(enabled, autoPublish, publicId).update();
        if (changed == 0) throw new IllegalArgumentException("Obra não monitorada pelo HiAnime.");
    }

    private Map<String, Object> row(String sql) {
        return jdbc.sql(sql).query((rs, n) -> map(rs)).optional().orElse(Map.of());
    }

    private List<Map<String, Object>> rows(String sql) {
        return jdbc.sql(sql).query((rs, n) -> map(rs)).list();
    }

    private static Map<String, Object> map(java.sql.ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++)
            row.put(rs.getMetaData().getColumnLabel(i), rs.getObject(i));
        return row;
    }

    private static String limited(String value, int size) {
        if (value == null || value.length() <= size) return value;
        return value.substring(0, size);
    }

    @PreDestroy
    void close() { executor.shutdownNow(); }

    private record Watch(long workId, UUID seasonId, boolean autoPublish) {}
    private static final class Counters { int checked, discovered, published, review, errors; }
}
