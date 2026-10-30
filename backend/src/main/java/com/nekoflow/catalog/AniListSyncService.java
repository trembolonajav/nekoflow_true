package com.nekoflow.catalog;

import com.nekoflow.auth.CurrentUser;
import com.nekoflow.progress.ProgressException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Sincroniza a sinopse (e o banner, quando existir) diretamente do AniList, com atribuição.
 * O texto é guardado como o AniList publica (idioma original da ficha, normalmente inglês),
 * sem tradução automática; a fonte citada pelo AniList vai para {@code synopsis_source}.
 */
@Service
public class AniListSyncService {

    private static final Logger log = LoggerFactory.getLogger(AniListSyncService.class);
    private static final Pattern SOURCE = Pattern.compile("\\(\\s*Source:\\s*([^)]{1,80})\\)\\s*$",
            Pattern.CASE_INSENSITIVE);

    private final JdbcClient jdbc;
    private final AniListClient client;
    private final boolean syncOnBoot;

    public AniListSyncService(JdbcClient jdbc, AniListClient client,
                              @Value("${nekoflow.anilist.sync-on-boot:true}") boolean syncOnBoot) {
        this.jdbc = jdbc;
        this.client = client;
        this.syncOnBoot = syncOnBoot;
    }

    /**
     * Obras do catálogo normalizado (com temporadas ou edições) sem retrato do AniList ou com
     * retrato de mais de 7 dias. Roda no boot e a cada 30 min: se o AniList estiver fora do
     * ar, a próxima rodada tenta de novo.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void syncPendingOnBoot() {
        if (!syncOnBoot) {
            return;
        }
        Thread worker = new Thread(this::syncPending, "anilist-sync");
        worker.setDaemon(true);
        worker.start();
    }

    @Scheduled(initialDelay = 30, fixedDelay = 30, timeUnit = TimeUnit.MINUTES)
    public void retryPending() {
        if (syncOnBoot) {
            syncPending();
        }
    }

    synchronized void syncPending() {
        List<Long> pending = jdbc.sql("""
                SELECT w.id FROM work w
                LEFT JOIN work_anilist_snapshot s ON s.work_id = w.id
                WHERE (s.work_id IS NULL OR s.fetched_at < now() - interval '7 days')
                  AND EXISTS (SELECT 1 FROM external_identifier x WHERE x.work_id = w.id AND x.provider = 'ANILIST')
                  AND (EXISTS (SELECT 1 FROM season se WHERE se.work_id = w.id)
                       OR EXISTS (SELECT 1 FROM work_edition e WHERE e.work_id = w.id))
                ORDER BY w.id LIMIT 20""").query(Long.class).list();
        for (Long id : pending) {
            try {
                sync(id, null);
                Thread.sleep(1500); // respeita o limite de requisições do AniList
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception e) {
                log.warn("Sincronização AniList da obra {} falhou: {}", id, e.getMessage());
                return; // AniList indisponível: tenta tudo de novo na próxima rodada
            }
        }
    }

    public Map<String, Object> syncFromAdmin(long workId) {
        try {
            return sync(workId, CurrentUser.id());
        } catch (ProgressException e) {
            throw e;
        } catch (Exception e) {
            throw new ProgressException(HttpStatus.BAD_GATEWAY, "ANILIST_UNAVAILABLE",
                    "O AniList não respondeu. Tente novamente em instantes.");
        }
    }

    Map<String, Object> sync(long workId, Long actorId) throws Exception {
        long anilistId = jdbc.sql("""
                SELECT external_id::bigint FROM external_identifier WHERE work_id = ? AND provider = 'ANILIST'
                ORDER BY external_id LIMIT 1""").param(workId).query(Long.class).optional()
                .orElseThrow(() -> ProgressException.unprocessable("ANILIST_ID_MISSING",
                        "A obra não tem identificador do AniList."));
        AniListClient.Media media = client.fetch(anilistId)
                .orElseThrow(() -> ProgressException.notFound("ANILIST_MEDIA_NOT_FOUND",
                        "O AniList não encontrou esta obra."));
        Synopsis s = clean(media.description());
        String romaji = text(media.raw().path("title"), "romaji");
        String english = text(media.raw().path("title"), "english");
        // Manhwa e manhua são conhecidos pelo nome em inglês ("Solo Leveling"), não pela romanização.
        String displayTitle = CatalogTitlePolicy.canonicalSeriesTitle(
                english != null && Set.of("KR", "CN", "TW").contains(text(media.raw(), "countryOfOrigin")) ? english : romaji);
        String nativeTitle = text(media.raw().path("title"), "native");
        if (s.text() == null) {
            s = inheritedPrequelSynopsis(media.raw());
        }
        String before = jdbc.sql("SELECT jsonb_build_object('synopsis', synopsis_full, 'banner', banner)::text FROM work WHERE id = ?")
                .param(workId).query(String.class).single();
        jdbc.sql("""
                UPDATE work SET title = COALESCE(CAST(? AS text), title),
                                synopsis_full = COALESCE(synopsis_full, CAST(? AS text)),
                                synopsis_source = CASE WHEN synopsis_full IS NULL AND CAST(? AS text) IS NOT NULL
                                                       THEN ? ELSE synopsis_source END,
                                synopsis_language = CASE WHEN synopsis_full IS NULL AND CAST(? AS text) IS NOT NULL
                                                         THEN 'en' ELSE synopsis_language END,
                                banner = COALESCE(banner, CAST(? AS text)),
                                anilist_synced_at = now(), updated_at = now()
                WHERE id = ?""")
                .params(displayTitle, s.text(), s.text(), s.attribution(), s.text(), media.bannerImage(), workId)
                .update();
        if (s.text() != null) {
            jdbc.sql("""
                    INSERT INTO work_translation(work_id,language,synopsis_full,source,updated_at)
                    VALUES (?,'en',?,?,now())
                    ON CONFLICT (work_id,language) DO UPDATE SET synopsis_full=EXCLUDED.synopsis_full,
                        source=EXCLUDED.source,updated_at=now()""")
                    .params(workId, s.text(), s.attribution()).update();
        }
        upsertTitle(workId, romaji, "ROMAJI", "ja-Latn");
        upsertTitle(workId, english, "ENGLISH", "en");
        upsertTitle(workId, nativeTitle, "ORIGINAL", "ja");
        for (var synonym : media.raw().path("synonyms")) {
            upsertTitle(workId, synonym.asText(null), "ALIAS", null);
        }
        jdbc.sql("""
                UPDATE work SET alt_titles=(SELECT string_agg(DISTINCT title,' | ' ORDER BY title)
                                              FROM work_title WHERE work_id=?)
                WHERE id=?""").params(workId, workId).update();
        jdbc.sql("""
                INSERT INTO work_anilist_snapshot (work_id, anilist_id, payload, fetched_at)
                VALUES (?, ?, CAST(? AS jsonb), now())
                ON CONFLICT (work_id) DO UPDATE SET anilist_id = EXCLUDED.anilist_id, payload = EXCLUDED.payload,
                                                    fetched_at = now()""")
                .params(workId, anilistId, media.raw() == null ? "{}" : media.raw().toString()).update();
        String after = jdbc.sql("SELECT jsonb_build_object('synopsis', synopsis_full, 'banner', banner)::text FROM work WHERE id = ?")
                .param(workId).query(String.class).single();
        jdbc.sql("""
                INSERT INTO catalog_audit_event (actor_id, work_id, action, before_data, after_data)
                VALUES (?, ?, 'ANILIST_SYNC', CAST(? AS jsonb), CAST(? AS jsonb))""")
                .params(actorId, workId, before, after).update();
        log.info("Obra {} sincronizada com o AniList {}", workId, anilistId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("workId", workId);
        out.put("anilistId", anilistId);
        out.put("synopsis", s.text());
        out.put("synopsisSource", s.attribution());
        out.put("banner", media.bannerImage());
        return out;
    }

    /**
     * O AniList às vezes deixa a ficha de uma continuação sem descrição. Nesse caso usamos a
     * descrição inglesa do PREQUEL imediato, sempre identificada como herança editorial. Mídia,
     * episódios e imagens nunca são herdados por esta regra.
     */
    private Synopsis inheritedPrequelSynopsis(com.fasterxml.jackson.databind.JsonNode raw) throws Exception {
        for (var edge : raw.path("relations").path("edges")) {
            if (!"PREQUEL".equals(edge.path("relationType").asText())
                    || !"ANIME".equals(edge.path("node").path("type").asText())) continue;
            long prequelId = edge.path("node").path("id").asLong(0);
            if (prequelId <= 0) continue;
            String local = jdbc.sql("""
                    SELECT COALESCE(t.synopsis_full,w.synopsis_full)
                    FROM work w
                    LEFT JOIN work_translation t ON t.work_id=w.id AND t.language='en'
                    WHERE EXISTS (SELECT 1 FROM external_identifier x WHERE x.work_id=w.id
                                  AND x.provider='ANILIST' AND x.external_id=?)
                      AND COALESCE(t.synopsis_full,w.synopsis_full) IS NOT NULL
                    ORDER BY w.id LIMIT 1""").param(Long.toString(prequelId))
                    .query(String.class).optional().orElse(null);
            if (local != null && !local.isBlank()) {
                return new Synopsis(local, "AniList · sinopse herdada da obra anterior " + prequelId);
            }
            var prequel = client.fetch(prequelId).orElse(null);
            if (prequel != null) {
                Synopsis found = clean(prequel.description());
                if (found.text() != null) {
                    return new Synopsis(found.text(), "AniList · sinopse herdada da obra anterior " + prequelId);
                }
            }
        }
        return new Synopsis(null, null);
    }

    private void upsertTitle(long workId, String title, String type, String language) {
        if (title == null || title.isBlank()) return;
        jdbc.sql("""
                INSERT INTO work_title(work_id,title,title_norm,title_type,language)
                VALUES (?,?,lower(?),?,?) ON CONFLICT DO NOTHING""")
                .params(workId, title.strip(), title.strip(), type, language).update();
    }

    private static String text(com.fasterxml.jackson.databind.JsonNode node, String field) {
        var value = node.path(field);
        return value.isMissingNode() || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    record Synopsis(String text, String attribution) {
    }

    /** Converte a descrição do AniList (HTML simples) em texto com parágrafos. */
    static Synopsis clean(String description) {
        if (description == null || description.isBlank()) {
            return new Synopsis(null, null);
        }
        String t = description
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</p>", "\n\n")
                .replaceAll("<[^>]+>", "")
                .replace("&quot;", "\"").replace("&#039;", "'").replace("&apos;", "'")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("\r", "");
        t = t.replaceAll("[ \\t]+\\n", "\n").replaceAll("\\n{3,}", "\n\n").strip();
        String attribution = "AniList";
        Matcher m = SOURCE.matcher(t);
        if (m.find()) {
            attribution = "AniList · fonte original: " + m.group(1).strip();
            t = t.substring(0, m.start()).strip();
        }
        return new Synopsis(t.isEmpty() ? null : t, attribution);
    }
}
