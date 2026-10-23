package com.nekoflow.media;

import com.nekoflow.progress.ProgressException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Reprodução de episódios: identifica a unidade do catálogo, lista as fontes autorizadas
 * com suas capacidades reais e resolve o acesso à fonte escolhida. Os bytes do vídeo
 * nunca passam pelo Java.
 */
@Service
public class PlaybackService {

    /** Tipos que o player do NekoFlow reproduz no próprio elemento de vídeo. */
    static final Set<String> NATIVE = Set.of("HLS", "MP4", "DASH");

    private final JdbcClient jdbc;
    private final MediaProviders providers;
    private final MediaUrlSigner signer;

    public PlaybackService(JdbcClient jdbc, MediaProviders providers, MediaUrlSigner signer) {
        this.jdbc = jdbc;
        this.providers = providers;
        this.signer = signer;
    }

    record EpisodeRow(UUID id, String title, String number, Integer durationSeconds, String synopsis, UUID seasonId,
                      String seasonTitle, long workId, UUID workPublicId, String workTitle, String slug, String cover,
                      String banner) {
    }

    record SourceRow(UUID id, String type, String url, String provider, UUID providerId, String label, int priority,
                     String audioLanguage, String subtitleLanguage, Integer maxHeight, boolean reportsProgress,
                     boolean embedAllowed) {
    }

    public Map<String, Object> playback(UUID episodeId) {
        EpisodeRow ep = episode(episodeId);
        List<Map<String, Object>> sources = new ArrayList<>();
        for (SourceRow s : sources(episodeId)) {
            Map<String, Object> view = sourceView(s);
            if (view != null) {
                sources.add(view);
            }
        }
        List<Map<String, Object>> units = units(ep.workId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("episodeId", ep.id());
        out.put("availability", sources.stream().anyMatch(x -> Boolean.TRUE.equals(x.get("playsInPlayer"))
                        || x.get("embedUrl") != null)
                ? "AVAILABLE" : sources.isEmpty() ? "UNAVAILABLE" : "EXTERNAL_ONLY");
        out.put("episode", map("id", ep.id(), "title", ep.title(), "number", ep.number(),
                "durationSeconds", ep.durationSeconds(), "synopsis", ep.synopsis(),
                "seasonId", ep.seasonId(), "seasonTitle", ep.seasonTitle()));
        out.put("work", map("id", ep.workPublicId(), "legacyId", ep.workId(), "title", ep.workTitle(),
                "slug", ep.slug(), "href", "/animes/" + ep.slug(), "cover", ep.cover(), "banner", ep.banner()));
        out.put("adaptation", adaptation(ep.workId()));
        out.put("sources", sources);
        out.put("markers", markers(episodeId));
        out.put("units", units);
        int index = indexOf(units, episodeId);
        out.put("previous", neighbour(units, index, -1));
        out.put("next", neighbour(units, index, 1));
        return out;
    }

    /** Resolve a URL efetiva da fonte escolhida, revalidando disponibilidade e provedor. */
    public Map<String, Object> access(UUID episodeId, UUID sourceId) {
        episode(episodeId);
        SourceRow s = sources(episodeId).stream().filter(x -> x.id().equals(sourceId)).findFirst()
                .orElseThrow(() -> ProgressException.notFound("SOURCE_UNAVAILABLE", "Esta fonte não está disponível."));
        if (!NATIVE.contains(s.type())) {
            throw ProgressException.unprocessable("SOURCE_NOT_PLAYABLE",
                    "Esta fonte abre no site do provedor e não é reproduzida pelo player.");
        }
        var provider = providers.find(s.providerId()).orElse(null);
        if (!providers.allows(provider, s.url())) {
            throw ProgressException.notFound("SOURCE_UNAVAILABLE", "Esta fonte não está disponível.");
        }
        List<Map<String, Object>> subtitles = jdbc.sql("""
                SELECT language, label, kind, url FROM media_subtitle_track
                WHERE episode_source_id = ? ORDER BY kind, language""")
                .param(s.id())
                .query((rs, n) -> map("language", rs.getString(1), "label", rs.getString(2), "kind", rs.getString(3),
                        "url", rs.getString(4)))
                .list()
                .stream()
                .filter(t -> providers.allows(provider, (String) t.get("url")))
                .toList();
        Instant expires = signer.expiresAt();
        return map("sourceId", s.id(), "type", s.type(), "url", s.url(), "expiresAt", expires,
                "subtitles", subtitles);
    }

    EpisodeRow episode(UUID id) {
        return jdbc.sql("""
                SELECT e.id, e.title, e.display_number, e.duration_seconds, e.synopsis, s.id, s.title,
                       w.id, w.public_id, w.title, w.slug, w.cover, w.banner
                FROM episode e JOIN season s ON s.id = e.season_id JOIN work w ON w.id = s.work_id
                WHERE e.id = ? AND s.visibility = 'PUBLISHED' AND w.visibility = 'PUBLISHED'""")
                .param(id)
                .query((rs, n) -> new EpisodeRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3),
                        (Integer) rs.getObject(4), rs.getString(5), rs.getObject(6, UUID.class), rs.getString(7),
                        rs.getLong(8), rs.getObject(9, UUID.class), rs.getString(10), rs.getString(11),
                        rs.getString(12), rs.getString(13)))
                .optional()
                .orElseThrow(() -> ProgressException.notFound("EPISODE_NOT_FOUND", "Episódio não encontrado."));
    }

    List<SourceRow> sources(UUID episodeId) {
        return jdbc.sql("""
                SELECT id, source_type, source_url, provider, provider_id, label, priority, audio_language,
                       language, max_height, reports_progress, embed_allowed
                FROM episode_source
                WHERE episode_id = ? AND enabled
                  AND (available_from IS NULL OR available_from <= now())
                  AND (available_until IS NULL OR available_until > now())
                ORDER BY priority, created_at""")
                .param(episodeId)
                .query(PlaybackService::source)
                .list();
    }

    private static SourceRow source(ResultSet rs, int n) throws SQLException {
        return new SourceRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4),
                rs.getObject(5, UUID.class), rs.getString(6), rs.getInt(7), rs.getString(8),
                rs.getString(9), (Integer) rs.getObject(10), rs.getBoolean(11), rs.getBoolean(12));
    }

    /** Visão pública da fonte; null quando o provedor não autoriza mais a URL. */
    private Map<String, Object> sourceView(SourceRow s) {
        boolean nativeType = NATIVE.contains(s.type());
        boolean embed = "EMBED".equals(s.type());
        if (nativeType || embed) {
            var provider = providers.find(s.providerId()).orElse(null);
            if (!providers.allows(provider, s.url()) || (embed && !s.embedAllowed())) {
                return null;
            }
        } else if (!s.url().startsWith("https://")) {
            return null;
        }
        Map<String, Object> caps = map(
                "seek", nativeType,
                "progress", nativeType && s.reportsProgress(),
                "qualitySelection", "HLS".equals(s.type()) || "DASH".equals(s.type()),
                "audioSelection", nativeType,
                "subtitles", nativeType,
                "markers", nativeType);
        List<String> subtitleLanguages = new ArrayList<>(jdbc.sql(
                        "SELECT DISTINCT language FROM media_subtitle_track WHERE episode_source_id = ? ORDER BY 1")
                .param(s.id()).query(String.class).list());
        // O iframe controla suas próprias legendas e não expõe o WebVTT. Para embeds,
        // episode_source.language guarda o idioma confirmado editorialmente.
        if (subtitleLanguages.isEmpty() && s.subtitleLanguage() != null && !s.subtitleLanguage().isBlank()) {
            subtitleLanguages.add(s.subtitleLanguage());
        }
        Map<String, Object> v = map("id", s.id(), "type", s.type(),
                "label", s.label() != null ? s.label() : s.provider(), "provider", s.provider(),
                "priority", s.priority(), "playsInPlayer", nativeType, "capabilities", caps,
                "audioLanguages", s.audioLanguage() == null ? List.of() : List.of(s.audioLanguage()),
                "subtitleLanguages", subtitleLanguages, "maxHeight", s.maxHeight());
        if ("EXTERNAL_LINK".equals(s.type())) {
            v.put("externalUrl", s.url()); // link público do provedor, aberto em nova aba
        }
        if (embed) {
            v.put("embedUrl", s.url());
        }
        return v;
    }

    private List<Map<String, Object>> markers(UUID episodeId) {
        return jdbc.sql("SELECT kind, start_ms, end_ms FROM episode_marker WHERE episode_id = ? ORDER BY start_ms")
                .param(episodeId)
                .query((rs, n) -> map("kind", rs.getString(1), "startMs", rs.getLong(2), "endMs", rs.getLong(3)))
                .list();
    }

    /** Todas as unidades publicadas da obra, na ordem editorial, com disponibilidade real. */
    List<Map<String, Object>> units(long workId) {
        return jdbc.sql("""
                SELECT e.id, e.display_number, e.title, e.duration_seconds, s.id, s.title,
                       EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id = e.id AND es.enabled
                               AND es.source_type IN ('HLS','MP4','DASH','EMBED')
                               AND (es.available_from IS NULL OR es.available_from <= now())
                               AND (es.available_until IS NULL OR es.available_until > now())) AS playable,
                       EXISTS (SELECT 1 FROM episode_source es WHERE es.episode_id = e.id AND es.enabled
                               AND (es.available_from IS NULL OR es.available_from <= now())
                               AND (es.available_until IS NULL OR es.available_until > now())) AS available
                FROM episode e JOIN season s ON s.id = e.season_id
                WHERE s.work_id = ? AND s.visibility = 'PUBLISHED'
                ORDER BY s.sort_position, e.sort_position""")
                .param(workId)
                .query((rs, n) -> map("id", rs.getObject(1, UUID.class), "number", rs.getString(2),
                        "title", rs.getString(3), "durationSeconds", rs.getObject(4),
                        "seasonId", rs.getObject(5, UUID.class), "seasonTitle", rs.getString(6),
                        "playable", rs.getBoolean(7), "available", rs.getBoolean(8)))
                .list();
    }

    private Map<String, Object> adaptation(long workId) {
        return jdbc.sql("""
                SELECT w.title, w.slug, w.kind FROM work_relation r JOIN work w ON w.id = r.target_work_id
                WHERE r.source_work_id = ? AND r.relation_type = 'ADAPTATION' AND w.visibility = 'PUBLISHED'
                  AND w.media_family = 'READING'
                ORDER BY w.id LIMIT 1""")
                .param(workId)
                .query((rs, n) -> map("title", rs.getString(1), "href", "/leituras/" + rs.getString(2),
                        "kind", rs.getString(3)))
                .optional()
                .orElse(null);
    }

    private static int indexOf(List<Map<String, Object>> units, UUID id) {
        for (int i = 0; i < units.size(); i++) {
            if (id.equals(units.get(i).get("id"))) {
                return i;
            }
        }
        return -1;
    }

    /** Vizinho disponível mais próximo; unidades sem fonte são puladas, nunca oferecidas. */
    private static Map<String, Object> neighbour(List<Map<String, Object>> units, int index, int step) {
        if (index < 0) {
            return null;
        }
        for (int i = index + step; i >= 0 && i < units.size(); i += step) {
            if (Boolean.TRUE.equals(units.get(i).get("available"))) {
                return units.get(i);
            }
        }
        return null;
    }

    static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }
}
