package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Aplica o snapshot sazonal gerado por tools/import_hianime_season_csv.py. */
@Component
@Order(4)
public class HiAnimeCatalogSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(HiAnimeCatalogSeeder.class);
    private static final UUID PROVIDER_ID =
            UUID.fromString("7a1a91ae-64f0-48c8-82dd-e6b832ef44e2");
    private static final Pattern SOURCE_MAL = Pattern.compile("/stream/mal/(\\d+)/", Pattern.CASE_INSENSITIVE);

    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private UUID providerId = PROVIDER_ID;

    public HiAnimeCatalogSeeder(JdbcClient jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        ClassPathResource resource = new ClassPathResource("seed/hianime-catalog.json");
        if (!resource.exists()) {
            log.info("Snapshot HiAnime não encontrado; importação sazonal ignorada");
            return;
        }
        JsonNode root;
        try (InputStream in = resource.getInputStream()) {
            root = mapper.readTree(in);
        }
        providerId = upsertProvider(root.path("provider"));
        int works = 0, episodes = 0, sources = 0, rejected = 0;
        for (JsonNode source : root.path("works")) {
            long workId = upsertWork(source);
            works++;
            if (!mediaMatchesMetadata(source)) {
                rejected++;
                quarantineRejectedMedia(workId, source);
                log.warn("HiAnime em quarentena por divergência AniList/MAL ou título: {} -> {}",
                        source.path("title").asText(), source.path("sourceAnimeId").asText());
                continue;
            }
            JsonNode season = source.path("season");
            UUID seasonId = resolveSeason(workId, source, season);
            int workSources = 0;
            for (JsonNode episode : season.path("episodes")) {
                int imported = upsertEpisode(seasonId, source, episode);
                workSources += imported;
                sources += imported;
                episodes++;
            }
            if (workSources > 0) enableContinuousSync(workId, seasonId);
        }
        log.info("HiAnime sazonal integrado: {} obras, {} episódios e {} players externos; {} vínculos em quarentena",
                works, episodes, sources, rejected);
    }

    /** Registra somente vínculos já validados, preservando escolhas posteriores do editor. */
    private void enableContinuousSync(long workId, UUID seasonId) {
        jdbc.sql("""
                INSERT INTO hianime_sync_work(work_id,season_id,enabled,auto_publish)
                VALUES (?,?,true,true)
                ON CONFLICT(work_id) DO UPDATE SET season_id=EXCLUDED.season_id,updated_at=now()
                """).params(workId, seasonId).update();
    }

    private boolean mediaMatchesMetadata(JsonNode source) {
        Integer expected = integer(source, "malId");
        Set<Integer> actual = new LinkedHashSet<>();
        for (JsonNode episode : source.path("season").path("episodes")) {
            for (JsonNode media : episode.path("sources")) {
                Matcher matcher = SOURCE_MAL.matcher(media.path("url").asText(""));
                while (matcher.find()) actual.add(Integer.parseInt(matcher.group(1)));
            }
        }
        if (expected != null && !actual.isEmpty()) return actual.equals(Set.of(expected));
        if (longOrNull(source, "anilistId") != null) return true; // sem ID MAL verificável: não presume erro
        String sourceTitle = text(source, "sourceTitle");
        if (sourceTitle == null) sourceTitle = text(source, "sourceAlternativeTitle");
        return sourceTitle == null || CatalogTitlePolicy.sameSeries(source.path("title").asText(), sourceTitle);
    }

    /** Isola mídia comprovadamente errada sem apagar episódios, progresso ou histórico. */
    private void quarantineRejectedMedia(long workId, JsonNode source) {
        String sourceId = text(source, "sourceAnimeId");
        if (sourceId == null) return;
        String page = "%/watch/" + sourceId + "%";
        // A mesma URL pode ter sido classificada por outro provedor numa importação antiga.
        // A identidade rejeitada é obra + página de origem; desativa todas as fontes desses
        // episódios, independentemente do rótulo legado do provedor.
        jdbc.sql("""
                UPDATE episode_source SET enabled=false,updated_at=now()
                WHERE episode_id IN (
                    SELECT e.id FROM episode e JOIN season s ON s.id=e.season_id
                    WHERE s.work_id=:work AND e.source_page_url LIKE :page)""")
                .param("work", workId).param("page", page).update();
        jdbc.sql("""
                UPDATE episode e SET availability='UNAVAILABLE'
                FROM season s WHERE e.season_id=s.id AND s.work_id=:work
                  AND e.source_page_url LIKE :page
                  AND NOT EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id=e.id AND es.enabled)""")
                .param("work", workId).param("page", page).update();
        jdbc.sql("""
                UPDATE season s SET visibility='DRAFT' WHERE s.work_id=:work
                  AND EXISTS (SELECT 1 FROM episode e WHERE e.season_id=s.id AND e.source_page_url LIKE :page)
                  AND NOT EXISTS (SELECT 1 FROM episode e JOIN episode_source es ON es.episode_id=e.id
                                  WHERE e.season_id=s.id AND es.enabled)""")
                .param("work", workId).param("page", page).update();
    }

    private UUID upsertProvider(JsonNode provider) {
        List<String> hosts = new ArrayList<>();
        provider.path("allowedHosts").forEach(n -> hosts.add(n.asText()));
        jdbc.sql("""
                INSERT INTO media_provider(id,code,name,media_kind,allowed_hosts,enabled,terms_note)
                VALUES (:id,'HIANIME_API_EMBED','HiAnime API · player externo','VIDEO',
                        string_to_array(:hosts,','),true,
                        'Players externos indexados pela API pública não oficial; o NekoFlow não hospeda nem retransmite a mídia.')
                ON CONFLICT (code) DO UPDATE SET allowed_hosts=EXCLUDED.allowed_hosts,
                    enabled=true, terms_note=EXCLUDED.terms_note
                """).param("id", PROVIDER_ID).param("hosts", String.join(",", hosts)).update();
        return jdbc.sql("SELECT id FROM media_provider WHERE code='HIANIME_API_EMBED'")
                .query(UUID.class).single();
    }

    private long upsertWork(JsonNode source) {
        Long anilist = longOrNull(source, "anilistId");
        Long local = longOrNull(source, "localId");
        long id = anilist != null ? anilist : local;
        String sourceId = text(source, "sourceAnimeId");
        if (anilist != null) {
            id = jdbc.sql("""
                    SELECT work_id FROM external_identifier
                    WHERE provider='ANILIST' AND external_id=? ORDER BY work_id LIMIT 1""")
                    .param(Long.toString(anilist)).query(Long.class).optional().orElse(anilist);
        } else if (sourceId != null) {
            id = jdbc.sql("""
                    SELECT work_id FROM external_identifier
                    WHERE provider='HIANIME' AND external_id=? ORDER BY work_id LIMIT 1""")
                    .param(sourceId).query(Long.class).optional().orElse(id);
        }
        String title = source.path("title").asText().strip();
        String english = text(source, "englishTitle");
        String nativeTitle = text(source, "nativeTitle");
        Set<String> aliases = new LinkedHashSet<>();
        aliases.add(title);
        add(aliases, english);
        add(aliases, nativeTitle);
        add(aliases, text(source, "sourceCsvTitle"));
        source.path("synonyms").forEach(n -> add(aliases, n.asText(null)));
        int available = source.path("season").path("episodes").size();
        Integer total = integer(source, "plannedEpisodes");
        if (total == null || total < available) total = available;
        String slug = source.path("slug").asText();
        jdbc.sql("""
                INSERT INTO work(id,kind,title,alt_titles,cover,banner,webtoon,year,total_units,
                                 available_units,airing_status,popularity,slug,media_family,work_format,
                                 original_language,origin_country,synopsis_full,synopsis_source,
                                 synopsis_language,story_status,visibility,original_release_date)
                VALUES (:id,'anime',:title,:aliases,:cover,:banner,false,:year,:total,:available,
                        :airing,:popularity,:slug,'ANIMATION',:format,'ja','JP',CAST(:synopsis AS text),
                        CASE WHEN CAST(:synopsis AS text) IS NULL THEN NULL ELSE 'AniList' END,
                        CASE WHEN CAST(:synopsis AS text) IS NULL THEN NULL ELSE 'en' END,:story,'PUBLISHED',:release)
                ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,
                    cover=COALESCE(work.cover,EXCLUDED.cover), banner=COALESCE(work.banner,EXCLUDED.banner),
                    year=COALESCE(work.year,EXCLUDED.year),
                    total_units=GREATEST(COALESCE(work.total_units,0),EXCLUDED.total_units),
                    available_units=GREATEST(COALESCE(work.available_units,0),EXCLUDED.available_units),
                    airing_status=EXCLUDED.airing_status, work_format=EXCLUDED.work_format,
                    synopsis_full=COALESCE(work.synopsis_full,EXCLUDED.synopsis_full),
                    synopsis_source=COALESCE(work.synopsis_source,EXCLUDED.synopsis_source),
                    synopsis_language=COALESCE(work.synopsis_language,EXCLUDED.synopsis_language),
                    story_status=EXCLUDED.story_status, visibility='PUBLISHED', updated_at=now()
                """)
                .param("id", id).param("title", title).param("aliases", String.join(" | ", aliases))
                .param("cover", text(source, "poster")).param("banner", text(source, "banner"))
                .param("year", source.path("year").asInt(2026)).param("total", total)
                .param("available", available).param("airing", airing(source.path("status").asText()))
                .param("popularity", 500_000 - source.path("catalogPosition").asInt(999))
                .param("slug", slug).param("format", format(source.path("format").asText()))
                .param("synopsis", text(source, "synopsis"))
                .param("story", story(source.path("status").asText()))
                .param("release", releaseDate(source)).update();

        upsertTitle(id, title, "ROMAJI", "ja-Latn");
        upsertTitle(id, english, "ENGLISH", "en");
        upsertTitle(id, nativeTitle, "ORIGINAL", "ja");
        upsertTitle(id, text(source, "sourceCsvTitle"), "ALIAS", "en");
        for (JsonNode synonym : source.path("synonyms")) upsertTitle(id, synonym.asText(null), "ALIAS", null);
        jdbc.sql("""
                UPDATE work SET alt_titles=(SELECT string_agg(DISTINCT title,' | ' ORDER BY title)
                                             FROM work_title WHERE work_id=?) WHERE id=?""")
                .params(id, id).update();
        if (anilist != null) {
            jdbc.sql("INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,'ANILIST',?) ON CONFLICT DO NOTHING")
                    .params(id, Long.toString(anilist)).update();
        }
        if (sourceId != null) {
            jdbc.sql("INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,'HIANIME',?) ON CONFLICT DO NOTHING")
                    .params(id, sourceId).update();
        }
        return id;
    }

    private UUID resolveSeason(long workId, JsonNode work, JsonNode source) {
        int number = source.path("number").asInt(1);
        UUID id = jdbc.sql("SELECT id FROM season WHERE work_id=? AND sort_position=?")
                .params(workId, number).query(UUID.class).optional()
                .orElseGet(() -> stableUuid("season", Long.toString(workId), Integer.toString(number)));
        String title = limited(source.path("title").asText(work.path("title").asText()), 200);
        jdbc.sql("""
                INSERT INTO season(id,work_id,title,display_number,sort_position,poster_url,release_date,visibility)
                VALUES (?,?,?,?,?,?,?,'PUBLISHED')
                ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,poster_url=COALESCE(season.poster_url,EXCLUDED.poster_url),
                    release_date=COALESCE(season.release_date,EXCLUDED.release_date),visibility='PUBLISHED'
                """).params(id, workId, title, Integer.toString(number), number, text(work, "poster"), releaseDate(work)).update();
        return id;
    }

    private int upsertEpisode(UUID seasonId, JsonNode work, JsonNode source) {
        String number = source.path("number").asText();
        double sort = source.path("sort").asDouble(source.path("number").asDouble());
        String external = source.path("sourceEpisodeId").asText();
        UUID id = jdbc.sql("SELECT id FROM episode WHERE season_id=? AND sort_position=?")
                .params(seasonId, sort).query(UUID.class).optional()
                .orElseGet(() -> stableUuid("episode", work.path("sourceAnimeId").asText(work.path("slug").asText()), external));
        String incoming = source.path("title").asText("Episode " + number);
        String old = jdbc.sql("SELECT title FROM episode WHERE id=?").param(id).query(String.class).optional().orElse(null);
        String title = limited(generic(incoming) && old != null && !generic(old) ? old : incoming, 200);
        jdbc.sql("""
                INSERT INTO episode(id,season_id,title,display_number,sort_position,duration_seconds,availability,
                                    thumbnail_url,source_page_url)
                VALUES (?,?,?,?,?,?,'UNAVAILABLE',?,?)
                ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,display_number=EXCLUDED.display_number,
                    sort_position=EXCLUDED.sort_position,duration_seconds=COALESCE(episode.duration_seconds,EXCLUDED.duration_seconds),
                    thumbnail_url=COALESCE(EXCLUDED.thumbnail_url,episode.thumbnail_url),source_page_url=EXCLUDED.source_page_url
                """).params(id, seasonId, title, number, sort, integer(work, "durationSeconds"),
                        text(source, "thumbnail"), text(source, "sourcePageUrl")).update();
        String alternative = text(source, "alternativeTitle");
        if (alternative != null && !alternative.equalsIgnoreCase(title)) {
            jdbc.sql("""
                    INSERT INTO episode_translation(episode_id,language,title,source)
                    VALUES (?,'ja-Latn',?,'HiAnime') ON CONFLICT (episode_id,language)
                    DO UPDATE SET title=EXCLUDED.title,source=EXCLUDED.source,updated_at=now()""")
                    .params(id, alternative).update();
        }
        List<String> keep = new ArrayList<>();
        int count = 0;
        for (JsonNode media : source.path("sources")) {
            String url = media.path("url").asText();
            if (!url.startsWith("https://")) continue;
            keep.add(url);
            jdbc.sql("""
                    INSERT INTO episode_source(episode_id,source_type,source_url,provider,language,embed_allowed,
                                               enabled,provenance,label,priority,reports_progress,provider_id,audio_language)
                    VALUES (:episode,'EMBED',:url,'HiAnime API',:subtitle,true,true,
                            :provenance,:label,:priority,false,:provider,:audio)
                    ON CONFLICT (episode_id,source_type,source_url) DO UPDATE SET
                        language=EXCLUDED.language,enabled=true,provenance=EXCLUDED.provenance,
                        label=EXCLUDED.label,priority=EXCLUDED.priority,provider_id=EXCLUDED.provider_id,
                        audio_language=EXCLUDED.audio_language,updated_at=now()
                    """).param("episode", id).param("url", url)
                    .param("subtitle", text(media, "subtitleLanguage"))
                    .param("provenance", "Player incorporado obtido pela API HiAnime. Página: " + text(source, "sourcePageUrl"))
                    .param("label", text(media, "label")).param("priority", media.path("priority").asInt(100))
                    .param("provider", providerId).param("audio", text(media, "audioLanguage")).update();
            count++;
        }
        if (keep.isEmpty()) {
            jdbc.sql("UPDATE episode_source SET enabled=false,updated_at=now() WHERE episode_id=? AND provider_id=?")
                    .params(id, providerId).update();
        } else {
            jdbc.sql("""
                    UPDATE episode_source SET enabled=false,updated_at=now()
                    WHERE episode_id=:episode AND provider_id=:provider
                      AND NOT(source_url=ANY(string_to_array(:keep,CHR(31))))""")
                    .param("episode", id).param("provider", providerId)
                    .param("keep", String.join(String.valueOf((char) 31), keep)).update();
            jdbc.sql("UPDATE episode SET availability='STREAM' WHERE id=?").param(id).update();
        }
        return count;
    }

    private void upsertTitle(long workId, String title, String type, String language) {
        if (title == null || title.isBlank()) return;
        jdbc.sql("""
                INSERT INTO work_title(work_id,title,title_norm,title_type,language)
                VALUES (?,?,lower(?),?,?) ON CONFLICT DO NOTHING""")
                .params(workId, title.strip(), title.strip(), type, language).update();
    }

    private static String format(String value) {
        return switch (value == null ? "" : value.toUpperCase()) {
            case "MOVIE" -> "MOVIE";
            case "OVA" -> "OVA";
            case "ONA" -> "ONA";
            case "SPECIAL", "TV_SHORT", "TV CURTO" -> "SPECIAL";
            default -> "SERIES";
        };
    }

    private static String airing(String status) {
        return switch (status) {
            case "RELEASING" -> "Em lançamento";
            case "FINISHED" -> "Concluído";
            case "NOT_YET_RELEASED" -> "Anunciado";
            default -> "Catálogo 2026";
        };
    }

    private static String story(String status) {
        return "FINISHED".equals(status) ? "COMPLETED" : "ONGOING";
    }

    private static LocalDate releaseDate(JsonNode source) {
        JsonNode date = source.path("startDate");
        int year = date.path("year").asInt(source.path("year").asInt(2026));
        int month = Math.max(1, date.path("month").asInt(1));
        int day = Math.max(1, date.path("day").asInt(1));
        try { return LocalDate.of(year, month, day); }
        catch (RuntimeException ignored) { return LocalDate.of(year, 1, 1); }
    }

    private static boolean generic(String title) {
        return title == null || title.matches("(?i)^(episode|epis[oó]dio|ep\\.?)[ -]?\\d+(?:\\.\\d+)?$");
    }

    private static UUID stableUuid(String... parts) {
        return UUID.nameUUIDFromBytes(("nekoflow:hianime:" + String.join(":", parts))
                .getBytes(StandardCharsets.UTF_8));
    }

    private static void add(Set<String> out, String value) {
        if (value != null && !value.isBlank()) out.add(value.strip());
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }

    private static Integer integer(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || !value.canConvertToInt() ? null : value.asInt();
    }

    private static Long longOrNull(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || !value.canConvertToLong() ? null : value.asLong();
    }

    private static String limited(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return value;
        return value.substring(0, maxLength).stripTrailing();
    }
}
