package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Aplica o snapshot auditado criado por tools/catalog_localization_pipeline.py. */
@Component
@Order(5)
public class CatalogLocalizationSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CatalogLocalizationSeeder.class);
    private static final DateTimeFormatter MAL_DATE =
            DateTimeFormatter.ofPattern("MMM d, uuuu", Locale.ENGLISH);

    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    public CatalogLocalizationSeeder(JdbcClient jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        ClassPathResource resource = new ClassPathResource("seed/catalog-localizations.json");
        if (!resource.exists()) {
            log.info("Snapshot de localização do catálogo ausente; etapa ignorada");
            return;
        }
        JsonNode root;
        try (InputStream in = resource.getInputStream()) {
            root = mapper.readTree(in);
        }
        // Vínculos seguros com o AniList (título idêntico); o AniListSyncService traz a ficha no boot.
        int links = 0;
        for (JsonNode link : root.path("anilistLinks")) {
            links += jdbc.sql("""
                    INSERT INTO external_identifier(work_id,provider,external_id)
                    SELECT :work,'ANILIST',:anilist
                    WHERE EXISTS(SELECT 1 FROM work WHERE id=:work)
                      AND NOT EXISTS(SELECT 1 FROM external_identifier
                                     WHERE work_id=:work AND provider='ANILIST')
                    """).param("work", link.path("workId").asLong())
                    .param("anilist", link.path("anilistId").asText()).update();
        }
        int workTranslations = 0;
        int episodeTranslations = 0;
        for (JsonNode work : root.path("works")) {
            long workId = work.path("workId").asLong();
            var fields = work.path("translations").fields();
            while (fields.hasNext()) {
                var item = fields.next();
                JsonNode value = item.getValue();
                if (text(value, "synopsisFull") == null && text(value, "synopsisShort") == null) continue;
                jdbc.sql("""
                        INSERT INTO work_translation(work_id,language,synopsis_short,synopsis_full,source)
                        SELECT :work,:language,:short,:full,:source
                        WHERE EXISTS(SELECT 1 FROM work WHERE id=:work)
                        ON CONFLICT (work_id,language) DO UPDATE SET
                          synopsis_short=EXCLUDED.synopsis_short,
                          synopsis_full=EXCLUDED.synopsis_full,
                          source=EXCLUDED.source,updated_at=now()
                        WHERE work_translation.source IS NULL
                           OR work_translation.source LIKE 'Tradução automática local%'
                           OR work_translation.source LIKE 'Traducción automática local%'
                           OR work_translation.source='Fonte original em inglês'
                           OR work_translation.source='AniList (inglês)'
                        """).param("work", workId).param("language", item.getKey())
                        .param("short", text(value, "synopsisShort"))
                        .param("full", text(value, "synopsisFull"))
                        .param("source", text(value, "source")).update();
                workTranslations++;
            }
        }
        for (JsonNode episode : root.path("episodes")) {
            UUID episodeId;
            try {
                episodeId = UUID.fromString(episode.path("episodeId").asText());
            } catch (IllegalArgumentException ignored) {
                continue;
            }
            LocalDate airDate = malDate(text(episode, "originalAirDate"));
            if (airDate != null) {
                jdbc.sql("UPDATE episode SET original_air_date=COALESCE(original_air_date,?) WHERE id=?")
                        .params(airDate, episodeId).update();
            }
            String thumbnail = text(episode, "thumbnail");
            if (thumbnail != null && thumbnail.startsWith("https://")) {
                jdbc.sql("UPDATE episode SET thumbnail_url=COALESCE(thumbnail_url,?) WHERE id=?")
                        .params(thumbnail, episodeId).update();
            }
            var fields = episode.path("translations").fields();
            while (fields.hasNext()) {
                var item = fields.next();
                JsonNode value = item.getValue();
                if (text(value, "title") == null && text(value, "synopsis") == null) continue;
                jdbc.sql("""
                        INSERT INTO episode_translation(episode_id,language,title,synopsis,source,reviewed)
                        SELECT :episode,:language,:title,:synopsis,:source,false
                        WHERE EXISTS(SELECT 1 FROM episode WHERE id=:episode)
                        ON CONFLICT (episode_id,language) DO UPDATE SET
                          title=EXCLUDED.title,synopsis=EXCLUDED.synopsis,source=EXCLUDED.source,
                          reviewed=false,updated_at=now()
                        WHERE episode_translation.source IS NULL
                           OR episode_translation.source LIKE 'Jikan%'
                           OR episode_translation.source = 'TVMaze'
                           OR episode_translation.source LIKE 'Tradução automática local%'
                           OR episode_translation.source LIKE 'Traducción automática local%'
                        """).param("episode", episodeId).param("language", item.getKey())
                        .param("title", clip(text(value, "title"), 300)).param("synopsis", text(value, "synopsis"))
                        .param("source", text(value, "source")).update();
                episodeTranslations++;
            }
        }
        log.info("Localização do catálogo aplicada: {} vínculos AniList, {} traduções de obras e {} de episódios",
                links, workTranslations, episodeTranslations);
    }

    /** Datas do MAL ("Oct 20, 1999") e ISO ("1999-10-20", "1999-10-20T00:00:00+00:00"). */
    static LocalDate malDate(String value) {
        if (value == null) return null;
        String v = value.replace("(JST)", "").strip();
        try {
            return v.matches("\\d{4}-\\d{2}-\\d{2}.*") ? LocalDate.parse(v.substring(0, 10)) : LocalDate.parse(v, MAL_DATE);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    /** Títulos de episódio têm no máximo 300 caracteres (alguns originais já passam disso traduzidos). */
    static String clip(String value, int max) {
        if (value == null || value.length() <= max) return value;
        int cut = value.lastIndexOf(' ', max - 1);
        return value.substring(0, cut > max / 2 ? cut : max - 1).strip() + "…";
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.asText();
    }
}
