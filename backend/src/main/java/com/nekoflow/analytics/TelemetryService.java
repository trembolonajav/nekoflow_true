package com.nekoflow.analytics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grava presença e eventos. Os embeds são iframes, então nada vem de dentro do vídeo: só o que
 * acontece na página (card visto, clique, player aberto, troca de servidor, próximo, busca).
 */
@Service
public class TelemetryService {

    static final Set<String> TYPES = Set.of(
            "page_view", "impression", "click", "player_open", "server_switch", "next_click",
            "search", "chapter_open");
    static final Set<String> STATES = Set.of("browse", "player", "read");
    private static final int MAX_EVENTS = 60;

    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    public TelemetryService(JdbcClient jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    @Transactional
    public void collect(TelemetryController.Batch batch, Long userId, String agent) {
        UUID session = uuid(batch.sessionId());
        if (session == null) return;
        Map<String, Long> works = new HashMap<>();
        var hb = batch.heartbeat();
        if (hb != null) {
            String state = STATES.contains(hb.state()) ? hb.state() : "browse";
            Long work = resolveWork(hb.work(), works);
            jdbc.sql("""
                    INSERT INTO analytics_session(id,user_id,state,path,work_id,episode_id,chapter_id,device)
                    VALUES (:id,:user,:state,:path,:work,:episode,:chapter,:device)
                    ON CONFLICT (id) DO UPDATE SET user_id=COALESCE(EXCLUDED.user_id,analytics_session.user_id),
                      state=EXCLUDED.state,path=EXCLUDED.path,work_id=EXCLUDED.work_id,
                      episode_id=EXCLUDED.episode_id,chapter_id=EXCLUDED.chapter_id,last_seen_at=now()""")
                    .param("id", session).param("user", userId).param("state", state)
                    .param("path", clip(hb.path(), 300)).param("work", work)
                    .param("episode", uuid(hb.episodeId())).param("chapter", uuid(hb.chapterId()))
                    .param("device", clip(agent, 160)).update();
            // Batimento a cada 30 s: base do "online", do gráfico por hora e do tempo com player aberto.
            insert(session, userId, "heartbeat", work, uuid(hb.episodeId()), uuid(hb.chapterId()),
                    Map.of("state", state, "visible", hb.visible()));
        }
        List<TelemetryController.Event> events = batch.events() == null ? List.of() : batch.events();
        for (var e : events.subList(0, Math.min(MAX_EVENTS, events.size()))) {
            if (e == null || !TYPES.contains(e.type())) continue;
            insert(session, userId, e.type(), resolveWork(e.work(), works), uuid(e.episodeId()),
                    uuid(e.chapterId()), e.data() == null ? Map.of() : e.data());
        }
    }

    private void insert(UUID session, Long user, String type, Long work, UUID episode, UUID chapter,
                        Map<String, Object> data) {
        if (work == null && episode != null) {
            work = jdbc.sql("SELECT s.work_id FROM episode e JOIN season s ON s.id=e.season_id WHERE e.id=?")
                    .param(episode).query(Long.class).optional().orElse(null);
        } else if (work == null && chapter != null) {
            work = jdbc.sql("SELECT ed.work_id FROM chapter c JOIN work_edition ed ON ed.id=c.edition_id WHERE c.id=?")
                    .param(chapter).query(Long.class).optional().orElse(null);
        }
        jdbc.sql("""
                INSERT INTO analytics_event(session_id,user_id,type,work_id,episode_id,chapter_id,data)
                VALUES (:session,:user,:type,:work,:episode,:chapter,CAST(:data AS jsonb))""")
                .param("session", session).param("user", user).param("type", type).param("work", work)
                .param("episode", episode).param("chapter", chapter).param("data", json(data)).update();
    }

    /** Obra pelo id numérico, pelo id público (UUID) ou pelo slug da URL (/animes/slug). */
    Long resolveWork(String ref, Map<String, Long> cache) {
        if (ref == null || ref.isBlank()) return null;
        String key = ref.strip();
        if (cache.containsKey(key)) return cache.get(key);
        Long id = null;
        if (key.matches("\\d{1,18}")) {
            id = jdbc.sql("SELECT id FROM work WHERE id=?").param(Long.parseLong(key)).query(Long.class).optional().orElse(null);
        } else if (uuid(key) != null) {
            id = jdbc.sql("SELECT id FROM work WHERE public_id=?").param(uuid(key)).query(Long.class).optional().orElse(null);
        } else if (key.length() <= 200) {
            id = jdbc.sql("""
                    SELECT id FROM work WHERE slug=:s
                    UNION ALL SELECT work_id FROM work_slug_alias WHERE slug=:s LIMIT 1""")
                    .param("s", key).query(Long.class).optional().orElse(null);
        }
        cache.put(key, id);
        return id;
    }

    private String json(Map<String, Object> data) {
        try {
            String s = mapper.writeValueAsString(data);
            return s.length() > 2000 ? "{}" : s;
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }

    static UUID uuid(String value) {
        try {
            return value == null ? null : UUID.fromString(value.strip());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String clip(String value, int max) {
        return value == null ? null : value.length() > max ? value.substring(0, max) : value;
    }
}
