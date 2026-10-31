package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integra o inventário auditado do FIB Anime ao domínio normalizado.
 *
 * <p>O FIB Anime é a origem autorizada da migração. Temporadas, episódios e
 * fontes auditadas HLS/MP4/EMBED são publicados no player do NekoFlow; a URL da
 * página antiga é preservada apenas como proveniência.</p>
 */
@Component
@Order(3)
@ConditionalOnProperty(name = "nekoflow.fibanime-import.enabled", havingValue = "true", matchIfMissing = true)
public class FibAnimeCatalogSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(FibAnimeCatalogSeeder.class);
    private static final long LOCAL_ID_BASE = 910_000_000L;
    private static final UUID FIB_MEDIA_PROVIDER_ID =
            UUID.fromString("f1ba11e0-9d4f-4e35-a70f-31b9f21c0d01");

    private final WorkRepository works;
    private final ObjectMapper mapper;
    private final JdbcClient jdbc;

    public FibAnimeCatalogSeeder(WorkRepository works, ObjectMapper mapper, JdbcClient jdbc) {
        this.works = works;
        this.mapper = mapper;
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        JsonNode root;
        try (InputStream in = new ClassPathResource("seed/fibanime-catalog.json").getInputStream()) {
            root = mapper.readTree(in);
        }
        int expectedWorks = root.path("works").size();
        int expectedSeasons = 0;
        int expectedEpisodes = 0;
        int expectedSources = 0;
        for (JsonNode work : root.path("works")) {
            for (JsonNode season : work.path("seasons")) {
                if (!seedSeasonCompatible(work.path("title").asText(), season.path("title").asText())) continue;
                expectedSeasons++;
                expectedEpisodes += season.path("episodes").size();
                for (JsonNode episode : season.path("episodes")) expectedSources += episode.path("sources").size();
            }
        }
        quarantineMismatchedSeasons(root);
        if (alreadyIntegrated(expectedWorks, expectedSeasons, expectedEpisodes, expectedSources)) {
            log.info("FIB Anime já integrado: {} obras, ao menos {} temporadas, {} episódios e {} fontes",
                    expectedWorks, expectedSeasons, expectedEpisodes, expectedSources);
            return;
        }

        upsertMediaProvider(root.path("allowedHosts"));
        repairEpisodesOnReadingWorks();

        int workCount = 0;
        int seasonCount = 0;
        int episodeCount = 0;
        for (JsonNode source : root.path("works")) {
            long workId = upsertWork(source);
            workCount++;
            for (JsonNode season : source.path("seasons")) {
                if (!seasonBelongsToWork(workId, source.path("title").asText(), season.path("title").asText())) {
                    log.warn("FIB Anime: temporada em quarentena por divergência de obra: {} -> {}",
                            source.path("title").asText(), season.path("title").asText());
                    continue;
                }
                UUID seasonId = resolveSeasonId(workId, source.path("slug").asText(), season.path("number").asInt());
                upsertSeason(workId, seasonId, season);
                seasonCount++;
                for (JsonNode episode : season.path("episodes")) {
                    upsertEpisode(seasonId, source.path("slug").asText(), season.path("number").asText(), episode);
                    episodeCount++;
                }
            }
        }
        log.info("FIB Anime integrado: {} obras, {} temporadas e {} episódios com mídia autorizada",
                workCount, seasonCount, episodeCount);
    }

    private boolean alreadyIntegrated(int worksExpected, int seasonsExpected, int episodesExpected,
                                      int sourcesExpected) {
        long misplaced = jdbc.sql("""
                SELECT count(*) FROM season s JOIN work w ON w.id = s.work_id WHERE w.media_family <> 'ANIMATION'""")
                .query(Long.class).single();
        if (misplaced > 0) return false;
        long importedWorks = jdbc.sql("SELECT count(*) FROM external_identifier WHERE provider='FIBANIME'")
                .query(Long.class).single();
        if (importedWorks < worksExpected) return false;
        MapCounts counts = jdbc.sql("""
                SELECT count(DISTINCT s.id) AS seasons, count(DISTINCT e.id) AS episodes,
                       count(DISTINCT es.id) FILTER (
                           WHERE es.provider_id=:provider AND es.source_type IN ('HLS','MP4','EMBED')) AS media_sources
                FROM external_identifier x
                LEFT JOIN season s ON s.work_id=x.work_id
                LEFT JOIN episode e ON e.season_id=s.id
                LEFT JOIN episode_source es ON es.episode_id=e.id AND es.enabled
                WHERE x.provider='FIBANIME'
                """).param("provider", FIB_MEDIA_PROVIDER_ID)
                .query((rs, n) -> new MapCounts(rs.getLong("seasons"), rs.getLong("episodes"),
                        rs.getLong("media_sources"))).single();
        // Fontes ativas iguais às do seed: alternativos antigos desativados contam como pendência.
        return counts.seasons() >= seasonsExpected && counts.episodes() >= episodesExpected
                && counts.mediaSources() == sourcesExpected;
    }

    private record MapCounts(long seasons, long episodes, long mediaSources) {}

    private boolean seasonBelongsToWork(long workId, String workTitle, String seasonTitle) {
        if (seedSeasonCompatible(workTitle, seasonTitle)) return true;
        String normalized = CatalogTitlePolicy.norm(seasonTitle);
        return jdbc.sql("SELECT title FROM work_title WHERE work_id=?")
                .param(workId).query(String.class).list().stream()
                .map(CatalogTitlePolicy::norm).anyMatch(normalized::equals);
    }

    private static boolean seedSeasonCompatible(String workTitle, String seasonTitle) {
        if (CatalogTitlePolicy.sameSeries(workTitle, seasonTitle)) return true;
        // Títulos oficiais em idiomas diferentes para a mesma obra.
        return CatalogTitlePolicy.norm(workTitle).equals("keroro")
                && CatalogTitlePolicy.norm(seasonTitle).equals("sgt frog");
    }

    /** Desativa associações claramente cruzadas no seed legado, sem apagar dados do usuário. */
    private void quarantineMismatchedSeasons(JsonNode root) {
        int quarantined = 0;
        for (JsonNode source : root.path("works")) {
            String slug = source.path("slug").asText();
            Long workId = jdbc.sql("""
                    SELECT work_id FROM external_identifier WHERE provider='FIBANIME' AND external_id=?
                    ORDER BY work_id LIMIT 1""").param(externalId(slug)).query(Long.class).optional().orElse(null);
            if (workId == null) continue;
            for (JsonNode season : source.path("seasons")) {
                if (seasonBelongsToWork(workId, source.path("title").asText(), season.path("title").asText())) continue;
                for (JsonNode episode : season.path("episodes")) {
                    String page = text(episode, "sourcePageUrl");
                    if (page == null) continue;
                    jdbc.sql("""
                            UPDATE episode_source es SET enabled=false,updated_at=now()
                            FROM episode e JOIN season s ON s.id=e.season_id
                            WHERE es.episode_id=e.id AND s.work_id=:work AND e.source_page_url=:page
                              AND es.provider_id=:provider""")
                            .param("work", workId).param("page", page).param("provider", FIB_MEDIA_PROVIDER_ID).update();
                    jdbc.sql("""
                            UPDATE episode e SET availability='UNAVAILABLE'
                            FROM season s WHERE e.season_id=s.id AND s.work_id=:work AND e.source_page_url=:page
                              AND NOT EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id=e.id AND es.enabled)""")
                            .param("work", workId).param("page", page).update();
                }
                jdbc.sql("""
                        UPDATE season s SET visibility='DRAFT' WHERE s.work_id=:work AND s.sort_position=:position
                          AND NOT EXISTS (SELECT 1 FROM episode e JOIN episode_source es ON es.episode_id=e.id
                                          WHERE e.season_id=s.id AND es.enabled)""")
                        .param("work", workId).param("position", season.path("number").asInt()).update();
                quarantined++;
            }
        }
        if (quarantined > 0) log.warn("FIB Anime: {} temporadas cruzadas colocadas em quarentena", quarantined);
    }

    /**
     * Uma importação anterior casou animes com mangás de mesmo título e criou temporadas em
     * obras de leitura. Esses registros não têm progresso nem histórico (conferido antes de
     * remover); a importação recria os episódios no anime correto.
     */
    private void repairEpisodesOnReadingWorks() {
        List<UUID> seasons = jdbc.sql("""
                SELECT s.id FROM season s JOIN work w ON w.id = s.work_id
                WHERE w.media_family <> 'ANIMATION'
                  AND NOT EXISTS (SELECT 1 FROM episode e JOIN episode_progress p ON p.episode_id = e.id
                                  WHERE e.season_id = s.id)
                  AND NOT EXISTS (SELECT 1 FROM episode e JOIN activity_history h ON h.episode_id = e.id
                                  WHERE e.season_id = s.id)""").query(UUID.class).list();
        if (seasons.isEmpty()) return;
        for (UUID season : seasons) {
            jdbc.sql("DELETE FROM media_issue_report WHERE episode_id IN (SELECT id FROM episode WHERE season_id = ?)")
                    .param(season).update();
            jdbc.sql("DELETE FROM episode WHERE season_id = ?").param(season).update();
            jdbc.sql("DELETE FROM season WHERE id = ?").param(season).update();
        }
        jdbc.sql("""
                DELETE FROM external_identifier x USING work w
                WHERE x.work_id = w.id AND x.provider = 'FIBANIME' AND w.media_family <> 'ANIMATION'""").update();
        log.warn("FIB Anime: {} temporadas importadas em obras de leitura foram removidas para reimportação no anime",
                seasons.size());
    }

    private void upsertMediaProvider(JsonNode allowedHosts) {
        StringBuilder hosts = new StringBuilder();
        for (JsonNode host : allowedHosts) {
            if (!hosts.isEmpty()) hosts.append(',');
            hosts.append(host.asText());
        }
        jdbc.sql("""
                INSERT INTO media_provider(id,code,name,media_kind,allowed_hosts,enabled,terms_note)
                VALUES (:id,'FIB_ANIME_MEDIA','FIB Anime · mídia própria','VIDEO',
                        string_to_array(:hosts,','),true,
                        'Fontes migradas da infraestrutura FIB Anime para o NekoFlow com autorização do proprietário em 2026-10-21.')
                ON CONFLICT (code) DO UPDATE SET allowed_hosts=EXCLUDED.allowed_hosts, enabled=true,
                    terms_note=EXCLUDED.terms_note
                """).param("id", FIB_MEDIA_PROVIDER_ID).param("hosts", hosts.toString()).update();
    }

    private long upsertWork(JsonNode source) {
        String title = source.path("title").asText().trim();
        String slug = source.path("slug").asText().trim();
        int order = source.path("order").asInt();
        int episodeCount = source.path("episodeCount").asInt();
        // Só anime: um mangá com o mesmo título nunca recebe temporadas e episódios.
        long id = works.findExactAnimationTitle(title).map(Work::id)
                .or(() -> jdbc.sql("SELECT id FROM work WHERE media_family='ANIMATION' AND slug=?")
                        .param(slug).query(Long.class).optional())
                .orElse(LOCAL_ID_BASE + order);

        jdbc.sql("""
                INSERT INTO work (id, kind, title, alt_titles, cover, webtoon, total_units, available_units,
                                  airing_status, popularity, slug, media_family, work_format, story_status,
                                  visibility, synopsis_source)
                VALUES (:id, 'anime', :title, '', :cover, false, :episodes, :episodes,
                        :status, :popularity,
                        CASE WHEN EXISTS (SELECT 1 FROM work o WHERE o.media_family = 'ANIMATION' AND o.slug = :slug)
                             THEN :slug || '-' || :id ELSE :slug END,
                        'ANIMATION', 'SERIES', 'UNKNOWN', 'PUBLISHED', 'FIB Anime')
                ON CONFLICT (id) DO UPDATE SET
                    total_units = GREATEST(COALESCE(work.total_units, 0), EXCLUDED.total_units),
                    available_units = GREATEST(COALESCE(work.available_units, 0), EXCLUDED.available_units),
                    cover = COALESCE(work.cover, EXCLUDED.cover), updated_at = now()
                """)
                .param("id", id)
                .param("title", title)
                .param("cover", text(source, "cover"))
                .param("episodes", episodeCount)
                .param("status", episodeCount > 0 ? "Catálogo auditado" : "Sem episódios publicados")
                .param("popularity", 100_000 - order)
                .param("slug", slug)
                .update();

        // O endereço de uma obra existente nunca muda: o slug do FIB vira apelido dela.
        jdbc.sql("""
                INSERT INTO work_slug_alias (media_family, slug, work_id)
                SELECT 'ANIMATION', :slug, :id
                WHERE NOT EXISTS (SELECT 1 FROM work WHERE id = :id AND slug = :slug)
                ON CONFLICT (media_family, slug) DO NOTHING
                """).param("id", id).param("slug", slug).update();
        jdbc.sql("INSERT INTO work_title(work_id,title,title_norm,title_type) VALUES (?,?,lower(?),'PRIMARY') ON CONFLICT DO NOTHING")
                .params(id, title, title).update();
        jdbc.sql("INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,'FIBANIME',?) ON CONFLICT DO NOTHING")
                .params(id, externalId(slug)).update();
        return id;
    }

    private void upsertSeason(long workId, UUID seasonId, JsonNode source) {
        int number = source.path("number").asInt();
        String title = source.path("title").asText("Temporada " + number);
        jdbc.sql("""
                INSERT INTO season(id,work_id,title,display_number,sort_position,visibility)
                VALUES (?,?,?,?,?,'PUBLISHED')
                ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, display_number=EXCLUDED.display_number,
                    sort_position=EXCLUDED.sort_position, visibility='PUBLISHED'
                """).params(seasonId, workId, title, Integer.toString(number), number).update();
    }

    private UUID resolveSeasonId(long workId, String slug, int number) {
        return jdbc.sql("SELECT id FROM season WHERE work_id=? AND sort_position=?")
                .params(workId, number).query(UUID.class).optional()
                .orElseGet(() -> stableUuid("season", slug, Integer.toString(number)));
    }

    private void upsertEpisode(UUID seasonId, String slug, String seasonNumber, JsonNode source) {
        int number = source.path("number").asInt();
        UUID episodeId = jdbc.sql("SELECT id FROM episode WHERE season_id=? AND sort_position=?")
                .params(seasonId, number).query(UUID.class).optional()
                .orElseGet(() -> stableUuid("episode", slug, seasonNumber, Integer.toString(number)));
        String code = source.path("code").asText();
        String title = source.path("title").asText(code);
        jdbc.sql("""
                INSERT INTO episode(id,season_id,title,display_number,sort_position,duration_seconds,availability,
                                    thumbnail_url,source_page_url)
                VALUES (?,?,?,?,?,?,'UNAVAILABLE',?,?)
                ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, display_number=EXCLUDED.display_number,
                    sort_position=EXCLUDED.sort_position, duration_seconds=EXCLUDED.duration_seconds,
                    thumbnail_url=EXCLUDED.thumbnail_url, source_page_url=EXCLUDED.source_page_url
                """)
                .params(episodeId, seasonId, title, Integer.toString(number), number,
                        integer(source, "durationSeconds"), text(source, "thumbnail"), text(source, "sourcePageUrl"))
                .update();
        String sourcePageUrl = text(source, "sourcePageUrl");
        boolean hasInternalSource = false;
        List<String> selected = new ArrayList<>();
        for (JsonNode media : source.path("sources")) {
            String type = media.path("type").asText();
            String url = media.path("url").asText();
            if (url.isBlank() || !(type.equals("HLS") || type.equals("MP4") || type.equals("EMBED"))) continue;
            jdbc.sql("""
                    INSERT INTO episode_source(episode_id,source_type,source_url,provider,language,embed_allowed,
                                               enabled,provenance,label,priority,reports_progress,provider_id,
                                               audio_language)
                    VALUES (:episode,:type,:url,'FIB Anime',:language,:embed,true,
                            :provenance,:label,:priority,:progress,:provider,:audio)
                    ON CONFLICT (episode_id,source_type,source_url) DO UPDATE SET
                        provider=EXCLUDED.provider, language=EXCLUDED.language,
                        embed_allowed=EXCLUDED.embed_allowed, enabled=true,
                        provenance=EXCLUDED.provenance, label=EXCLUDED.label,
                        priority=EXCLUDED.priority, reports_progress=EXCLUDED.reports_progress,
                        provider_id=EXCLUDED.provider_id, audio_language=EXCLUDED.audio_language,
                        updated_at=now()
                    """)
                    .param("episode", episodeId)
                    .param("type", type)
                    .param("url", url)
                    .param("language", text(media, "subtitleLanguage"))
                    .param("embed", media.path("embedAllowed").asBoolean())
                    .param("provenance", "Fonte " + type + " auditada no FIB Anime e autorizada para migração ao NekoFlow em 2026-10-21. Página de origem: " + sourcePageUrl)
                    .param("label", text(media, "label"))
                    .param("priority", media.path("priority").asInt(100))
                    .param("progress", media.path("reportsProgress").asBoolean())
                    .param("provider", FIB_MEDIA_PROVIDER_ID)
                    .param("audio", text(media, "audioLanguage"))
                    .update();
            hasInternalSource = true;
            selected.add(url);
        }
        // Só o FIBPlayer (ou a principal/única) fica ativo: alternativos e players externos
        // antigos são desativados, não apagados.
        if (selected.isEmpty()) {
            // Nenhuma fonte viva (todas responderam 4xx ou o link assinado venceu): o episódio
            // aparece como indisponível em vez de abrir um player quebrado.
            jdbc.sql("""
                    UPDATE episode_source SET enabled = false, updated_at = now()
                    WHERE episode_id = ? AND enabled AND provider_id = ?
                    """).params(episodeId, FIB_MEDIA_PROVIDER_ID).update();
            jdbc.sql("""
                    UPDATE episode SET availability = 'UNAVAILABLE'
                    WHERE id = ? AND NOT EXISTS (
                      SELECT 1 FROM episode_source WHERE episode_id = ? AND enabled
                    )
                    """).params(episodeId, episodeId).update();
        } else {
            jdbc.sql("""
                    UPDATE episode_source SET enabled = false, updated_at = now()
                    WHERE episode_id = :episode AND enabled AND provider_id = :provider
                      AND NOT (source_url = ANY(string_to_array(:keep, CHR(31))))""")
                    .param("episode", episodeId)
                    .param("provider", FIB_MEDIA_PROVIDER_ID)
                    .param("keep", String.join(String.valueOf((char) 31), selected))
                    .update();
        }
        // O link da página antiga não é opção de reprodução: fica apenas em episode.source_page_url.
        jdbc.sql("DELETE FROM episode_source WHERE episode_id=? AND source_type='EXTERNAL_LINK' AND provider='FIB Anime'")
                .param(episodeId).update();
        if (hasInternalSource) {
            jdbc.sql("UPDATE episode SET availability='STREAM' WHERE id=?").param(episodeId).update();
        }
    }

    private static UUID stableUuid(String... parts) {
        return UUID.nameUUIDFromBytes(("nekoflow:fibanime:" + String.join(":", parts))
                .getBytes(StandardCharsets.UTF_8));
    }

    private static String externalId(String slug) {
        return slug.length() <= 120 ? slug : "slug:" + stableUuid("work", slug);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    private static Integer integer(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || !value.canConvertToInt() ? null : value.asInt();
    }
}
