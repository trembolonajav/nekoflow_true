package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.admin.ReleaseService;
import com.nekoflow.auth.CurrentUser;
import com.nekoflow.progress.ProgressException;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Publica um candidato já descoberto usando somente hosts autorizados. */
@Service
public class HiAnimeSyncImporter {
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private final ReleaseService releases;
    private final String origin;

    public HiAnimeSyncImporter(JdbcClient jdbc, ObjectMapper mapper, ReleaseService releases,
                               @Value("${nekoflow.hianime.origin:https://hianime.at}") String origin) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.releases = releases;
        this.origin = origin.replaceAll("/+$", "");
    }

    @Transactional
    public Map<String, Object> approve(UUID candidateId, Long actorId) {
        Candidate c = jdbc.sql("""
                SELECT id,work_id,season_id,external_anime_id,external_episode_id,
                       episode_number,title,payload::text,status
                FROM hianime_sync_candidate WHERE id=? FOR UPDATE""")
                .param(candidateId).query((rs, n) -> new Candidate(
                        rs.getObject("id", UUID.class), rs.getLong("work_id"),
                        rs.getObject("season_id", UUID.class), rs.getString("external_anime_id"),
                        rs.getString("external_episode_id"), rs.getBigDecimal("episode_number"),
                        rs.getString("title"), rs.getString("payload"), rs.getString("status"))).optional()
                .orElseThrow(() -> new ProgressException(HttpStatus.NOT_FOUND, "SYNC_CANDIDATE_NOT_FOUND",
                        "Atualização não encontrada."));
        if ("PUBLISHED".equals(c.status())) return Map.of("candidateId", c.id(), "duplicate", true);
        if ("IGNORED".equals(c.status())) {
            throw ProgressException.unprocessable("SYNC_CANDIDATE_IGNORED", "A atualização foi ignorada.");
        }
        if (c.number().signum() <= 0 || c.number().stripTrailingZeros().scale() > 0) {
            throw ProgressException.unprocessable("HIANIME_NON_STANDARD_EPISODE",
                    "Episódios especiais ou decimais exigem cadastro editorial antes da publicação.");
        }
        JsonNode payload;
        try { payload = mapper.readTree(c.payload()); }
        catch (Exception e) { throw new IllegalStateException("Payload HiAnime inválido", e); }

        UUID provider = jdbc.sql("SELECT id FROM media_provider WHERE code='HIANIME_API_EMBED' AND enabled")
                .query(UUID.class).optional().orElseThrow(() -> ProgressException.unprocessable(
                        "HIANIME_PROVIDER_DISABLED", "O provedor HiAnime não está habilitado."));
        List<String> allowed = jdbc.sql("SELECT unnest(allowed_hosts) FROM media_provider WHERE id=?")
                .param(provider).query(String.class).list();
        List<Source> sources = new ArrayList<>();
        for (JsonNode row : payload.path("sources")) {
            String url = row.path("url").asText("");
            String host;
            try { host = URI.create(url).getHost(); } catch (RuntimeException e) { continue; }
            if (!url.startsWith("https://") || host == null || !allowed.contains(host.toLowerCase())) continue;
            sources.add(new Source(url, row.path("type").asText("sub"), row.path("server").asText("servidor")));
        }
        if (sources.isEmpty()) {
            jdbc.sql("UPDATE hianime_sync_candidate SET status='REVIEW',reason='NO_ALLOWED_SOURCE',updated_at=now() WHERE id=?")
                    .param(c.id()).update();
            throw ProgressException.unprocessable("HIANIME_SOURCE_NOT_ALLOWED",
                    "Nenhuma fonte usa um host autorizado. Revise a saúde do provedor.");
        }

        UUID episodeId = jdbc.sql("SELECT episode_id FROM hianime_episode_binding WHERE external_anime_id=? AND external_episode_id=?")
                .params(c.animeId(), c.episodeId()).query(UUID.class).optional().orElse(null);
        if (episodeId == null) {
            episodeId = jdbc.sql("SELECT id FROM episode WHERE season_id=? AND sort_position=?")
                    .params(c.seasonId(), c.number()).query(UUID.class).optional()
                    .orElseGet(() -> UUID.nameUUIDFromBytes(("nekoflow:hianime:live:" + c.animeId() + ":" + c.episodeId())
                            .getBytes(StandardCharsets.UTF_8)));
        }
        String display = display(c.number());
        jdbc.sql("""
                INSERT INTO episode(id,season_id,title,display_number,sort_position,availability,source_page_url)
                VALUES (?,?,?,?,?,'STREAM',?)
                ON CONFLICT (id) DO UPDATE SET title=COALESCE(NULLIF(EXCLUDED.title,''),episode.title),
                    display_number=EXCLUDED.display_number,sort_position=EXCLUDED.sort_position,
                    availability='STREAM',source_page_url=EXCLUDED.source_page_url""")
                .params(episodeId, c.seasonId(), limited(c.title(), 200), display, c.number(),
                        origin + "/watch/" + c.animeId() + "?ep=" + c.episodeId()).update();
        for (int i = 0; i < sources.size(); i++) {
            Source source = sources.get(i);
            boolean dub = "dub".equalsIgnoreCase(source.type());
            jdbc.sql("""
                    INSERT INTO episode_source(episode_id,source_type,source_url,provider,language,embed_allowed,
                      enabled,provenance,label,priority,reports_progress,provider_id,audio_language)
                    VALUES (?,'EMBED',?,'HiAnime API',?,true,true,?,?,?,false,?,?)
                    ON CONFLICT(episode_id,source_type,source_url) DO UPDATE SET enabled=true,
                      label=EXCLUDED.label,priority=EXCLUDED.priority,language=EXCLUDED.language,
                      audio_language=EXCLUDED.audio_language,updated_at=now()""")
                    .params(episodeId, source.url(), dub ? null : "en",
                            "Sincronização automática HiAnime · " + c.animeId() + " · " + c.episodeId(),
                            source.server() + " · " + (dub ? "Dublado (EN)" : "Legendado (EN)"),
                            (dub ? 100 : 10) + i, provider, dub ? "en" : "ja").update();
        }
        jdbc.sql("""
                INSERT INTO hianime_episode_binding(episode_id,work_id,external_anime_id,external_episode_id,payload_hash)
                VALUES (?,?,?,?,?) ON CONFLICT (episode_id) DO UPDATE SET payload_hash=EXCLUDED.payload_hash,synced_at=now()""")
                .params(episodeId, c.workId(), c.animeId(), c.episodeId(), sha256(c.payload())).update();
        jdbc.sql("UPDATE season SET visibility='PUBLISHED' WHERE id=?").param(c.seasonId()).update();
        jdbc.sql("""
                UPDATE hianime_sync_candidate SET status='PUBLISHED',reason=NULL,decided_at=now(),
                  decided_by=?,updated_at=now() WHERE id=?""").params(actorId, c.id()).update();
        int unit = c.number().intValue();
        Map<String, Object> release = actorId == null
                ? releases.publishSystem(c.workId(), unit, c.title())
                : releases.publish(actorId, c.workId(), unit, c.title());
        return Map.of("candidateId", c.id(), "episodeId", episodeId, "release", release, "duplicate", false);
    }

    @Transactional
    public void ignore(UUID candidateId) {
        int changed = jdbc.sql("""
                UPDATE hianime_sync_candidate SET status='IGNORED',decided_at=now(),decided_by=?,updated_at=now()
                WHERE id=? AND status<>'PUBLISHED'""").params(CurrentUser.id(), candidateId).update();
        if (changed == 0) throw ProgressException.unprocessable("SYNC_CANDIDATE_FINAL", "A atualização já foi publicada.");
    }

    private static String display(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String limited(String value, int size) {
        return value == null || value.length() <= size ? value : value.substring(0, size);
    }

    private record Candidate(UUID id, long workId, UUID seasonId, String animeId, String episodeId,
                             BigDecimal number, String title, String payload, String status) {}
    private record Source(String url, String type, String server) {}
}
