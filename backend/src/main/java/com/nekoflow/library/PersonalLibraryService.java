package com.nekoflow.library;

import com.nekoflow.common.Times;
import com.nekoflow.progress.ProgressException;
import com.nekoflow.progress.ResumeService;
import com.nekoflow.progress.ResumeService.Resume;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Minha Biblioteca: um registro por usuário e obra (situação), com favorito e
 * acompanhamento de lançamentos independentes. O progresso exibido vem do
 * {@link ResumeService}, a mesma fonte usada por Home, Player, Leitor e Histórico.
 */
@Service
public class PersonalLibraryService {

    private final JdbcClient jdbc;
    private final ResumeService resume;

    public PersonalLibraryService(JdbcClient jdbc, ResumeService resume) {
        this.jdbc = jdbc;
        this.resume = resume;
    }

    public record Query(String media, String status, Boolean favorite, String q, String sort) {
    }

    public record WorkRef(long id, UUID publicId, String visibility) {
    }

    // ---- referência de obra --------------------------------------------------------

    /** Aceita o UUID público ou o id numérico legado (as telas do design usam o id da AniList). */
    public WorkRef resolve(String ref) {
        Optional<WorkRef> found;
        if (ref != null && ref.matches("\\d{1,18}")) {
            found = jdbc.sql("SELECT id, public_id, visibility FROM work WHERE id = ?").param(Long.parseLong(ref))
                    .query((rs, n) -> new WorkRef(rs.getLong(1), rs.getObject(2, UUID.class), rs.getString(3)))
                    .optional();
        } else {
            UUID id;
            try {
                id = UUID.fromString(ref);
            } catch (IllegalArgumentException | NullPointerException e) {
                throw new ProgressException(HttpStatus.BAD_REQUEST, "INVALID_WORK_ID", "Identificador de obra inválido.");
            }
            found = jdbc.sql("SELECT id, public_id, visibility FROM work WHERE public_id = ?").param(id)
                    .query((rs, n) -> new WorkRef(rs.getLong(1), rs.getObject(2, UUID.class), rs.getString(3)))
                    .optional();
        }
        return found.orElseThrow(() -> new ProgressException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND",
                "Obra não encontrada."));
    }

    /** Para adicionar/favoritar/seguir a obra precisa estar pública. */
    public WorkRef resolvePublic(String ref) {
        WorkRef w = resolve(ref);
        if (!"PUBLISHED".equals(w.visibility())) {
            throw new ProgressException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "Obra não encontrada.");
        }
        return w;
    }

    // ---- operações -----------------------------------------------------------------

    @Transactional
    public Map<String, Object> setStatus(long userId, String ref, String status) {
        WorkRef w = resolvePublic(ref);
        LibraryStatus st;
        try {
            st = LibraryStatus.of(status);
        } catch (IllegalArgumentException e) {
            throw new ProgressException(HttpStatus.BAD_REQUEST, "INVALID_STATUS", "Situação inválida.");
        }
        jdbc.sql("""
                INSERT INTO library_entry (user_id, work_id, status) VALUES (?, ?, ?)
                ON CONFLICT (user_id, work_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()""")
                .params(userId, w.id(), st.code).update();
        return state(userId, w);
    }

    /** Remove da lista; progresso, histórico, favorito e alertas continuam. */
    @Transactional
    public Map<String, Object> remove(long userId, String ref) {
        WorkRef w = resolve(ref);
        jdbc.sql("DELETE FROM library_entry WHERE user_id = ? AND work_id = ?").params(userId, w.id()).update();
        return state(userId, w);
    }

    @Transactional
    public Map<String, Object> favorite(long userId, String ref, boolean on) {
        WorkRef w = on ? resolvePublic(ref) : resolve(ref);
        if (on) {
            jdbc.sql("INSERT INTO favorite (user_id, work_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                    .params(userId, w.id()).update();
        } else {
            jdbc.sql("DELETE FROM favorite WHERE user_id = ? AND work_id = ?").params(userId, w.id()).update();
        }
        return state(userId, w);
    }

    /** Acompanhar lançamentos não altera a situação nem o favorito. */
    @Transactional
    public Map<String, Object> follow(long userId, String ref, boolean on) {
        WorkRef w = on ? resolvePublic(ref) : resolve(ref);
        if (on) {
            jdbc.sql("INSERT INTO work_follow (user_id, work_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                    .params(userId, w.id()).update();
        } else {
            jdbc.sql("DELETE FROM work_follow WHERE user_id = ? AND work_id = ?").params(userId, w.id()).update();
        }
        return state(userId, w);
    }

    public Map<String, Object> state(long userId, String ref) {
        return state(userId, resolve(ref));
    }

    private Map<String, Object> state(long userId, WorkRef w) {
        Map<String, Object> m = new LinkedHashMap<>();
        String status = jdbc.sql("SELECT status FROM library_entry WHERE user_id = ? AND work_id = ?")
                .params(userId, w.id()).query(String.class).optional().orElse(null);
        m.put("workId", w.publicId());
        m.put("legacyId", w.id());
        m.put("inLibrary", status != null);
        m.put("status", status);
        m.put("favorite", exists("SELECT count(*) FROM favorite WHERE user_id = ? AND work_id = ?", userId, w.id()));
        m.put("follow", exists("SELECT count(*) FROM work_follow WHERE user_id = ? AND work_id = ?", userId, w.id()));
        Resume r = resume.byWork(userId, List.of(w.id())).get(w.id());
        m.put("resume", r == null ? null : r.view(workHref(w.id())));
        return m;
    }

    // ---- listagens -------------------------------------------------------------------

    private static final String FILTERS = """
            WHERE le.user_id = :user
              AND (:status = '' OR le.status = :status)
              AND (:family = '' OR w.media_family = :family)
              AND (NOT :onlyFav OR EXISTS (SELECT 1 FROM favorite f WHERE f.user_id = le.user_id AND f.work_id = w.id))
              AND (:q = '' OR lower(w.title) LIKE :like
                   OR EXISTS (SELECT 1 FROM work_title t WHERE t.work_id = w.id AND t.title_norm LIKE :like))""";

    public Map<String, Object> list(long userId, Query query, int page, int size) {
        String status = query.status() == null ? "" : query.status();
        if (!status.isEmpty()) {
            try {
                LibraryStatus.of(status);
            } catch (IllegalArgumentException e) {
                throw new ProgressException(HttpStatus.BAD_REQUEST, "INVALID_FILTER", "Situação inválida.");
            }
        }
        String family = switch (query.media() == null ? "" : query.media().toLowerCase()) {
            case "", "todos" -> "";
            case "anime", "animes", "anim" -> "ANIMATION";
            case "leitura", "leituras", "leit" -> "READING";
            default -> throw new ProgressException(HttpStatus.BAD_REQUEST, "INVALID_FILTER", "Mídia inválida.");
        };
        String order = switch (query.sort() == null ? "recent" : query.sort()) {
            case "recent" -> "last_activity DESC, w.title";
            case "title" -> "lower(w.title), w.id";
            case "added" -> "le.added_at DESC, w.id";
            default -> throw new ProgressException(HttpStatus.BAD_REQUEST, "INVALID_FILTER", "Ordenação inválida.");
        };
        String q = query.q() == null ? "" : query.q().trim().toLowerCase();
        boolean onlyFav = Boolean.TRUE.equals(query.favorite());

        List<Map<String, Object>> items = jdbc.sql("""
                SELECT w.id, w.public_id, w.title, w.cover, w.banner, w.kind, w.webtoon, w.slug, w.media_family,
                       w.visibility, w.total_units, w.story_status, le.status, le.added_at, le.updated_at,
                       EXISTS (SELECT 1 FROM favorite f WHERE f.user_id = le.user_id AND f.work_id = w.id) AS favorite,
                       EXISTS (SELECT 1 FROM work_follow f WHERE f.user_id = le.user_id AND f.work_id = w.id) AS follow,
                       GREATEST(le.updated_at,
                           (SELECT max(p.last_activity_at) FROM episode_progress p JOIN episode e ON e.id = p.episode_id
                              JOIN season s ON s.id = e.season_id WHERE p.user_id = le.user_id AND s.work_id = w.id),
                           (SELECT max(p.last_activity_at) FROM chapter_progress p JOIN work_edition ed ON ed.id = p.edition_id
                              WHERE p.user_id = le.user_id AND ed.work_id = w.id)) AS last_activity
                FROM library_entry le JOIN work w ON w.id = le.work_id
                """ + FILTERS + "\nORDER BY " + order + " LIMIT :size OFFSET :offset")
                .param("user", userId).param("status", status).param("family", family).param("onlyFav", onlyFav)
                .param("q", q).param("like", "%" + q + "%").param("size", size).param("offset", (long) page * size)
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("legacyId", rs.getLong("id"));
                    m.put("id", rs.getObject("public_id", UUID.class));
                    m.put("title", rs.getString("title"));
                    m.put("cover", rs.getString("cover"));
                    m.put("banner", rs.getString("banner"));
                    m.put("kind", rs.getString("kind"));
                    m.put("webtoon", rs.getBoolean("webtoon"));
                    m.put("mediaFamily", rs.getString("media_family"));
                    m.put("slug", rs.getString("slug"));
                    m.put("status", rs.getString("status"));
                    m.put("favorite", rs.getBoolean("favorite"));
                    m.put("follow", rs.getBoolean("follow"));
                    m.put("of", rs.getObject("total_units"));
                    m.put("available", "PUBLISHED".equals(rs.getString("visibility")));
                    m.put("addedAt", rs.getObject("added_at", OffsetDateTime.class));
                    OffsetDateTime last = rs.getObject("last_activity", OffsetDateTime.class);
                    m.put("updatedAt", last);
                    m.put("last", Times.day(last));
                    return m;
                })
                .list();
        long total = jdbc.sql("SELECT count(*) FROM library_entry le JOIN work w ON w.id = le.work_id\n" + FILTERS)
                .param("user", userId).param("status", status).param("family", family).param("onlyFav", onlyFav)
                .param("q", q).param("like", "%" + q + "%")
                .query(Long.class).single();

        Map<Long, Resume> resumes = resume.byWork(userId, items.stream().map(i -> (Long) i.get("legacyId")).toList());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> item : items) {
            out.add(withProgress(item, resumes.get((Long) item.get("legacyId"))));
        }
        Map<String, Object> pageBody = new LinkedHashMap<>();
        pageBody.put("items", out);
        pageBody.put("page", page);
        pageBody.put("size", size);
        pageBody.put("totalElements", total);
        pageBody.put("totalPages", (total + size - 1) / size);
        return pageBody;
    }

    /** Campos de progresso no formato que a interface da biblioteca já usa. */
    static Map<String, Object> withProgress(Map<String, Object> item, Resume r) {
        Map<String, Object> m = new LinkedHashMap<>(item);
        String family = (String) item.get("mediaFamily");
        String href = ("ANIMATION".equals(family) ? "/animes/" : "/leituras/") + item.get("slug");
        m.put("href", href);
        m.put("typeLabel", typeLabel((String) item.get("kind"), Boolean.TRUE.equals(item.get("webtoon"))));
        m.put("hasProgress", r != null);
        m.put("done", r != null && r.state() == ResumeService.State.UP_TO_DATE);
        m.put("resume", r == null ? null : r.view(href));
        m.put("unitHref", r == null ? href : r.unitHref(href));
        m.put("pct", r == null ? 0 : Math.round(r.percent()));
        if ("ANIMATION".equals(family)) {
            m.put("ep", r == null ? null : r.unitNumber());
            m.put("t", r == null || r.positionMs() == 0 ? null : Times.mmss((int) (r.positionMs() / 1000)));
            m.put("d", r == null || r.durationMs() == null ? null : Times.mmss((int) (r.durationMs() / 1000)));
            m.put("left", r == null || r.durationMs() == null || r.state() != ResumeService.State.RESUME ? null
                    : Math.max(1, (int) Math.ceil((r.durationMs() - r.positionMs()) / 60000.0)) + " min");
        } else {
            m.put("ch", r == null ? null : r.unitNumber());
            m.put("pos", r == null ? null : Math.round(r.percent()) + "% do capítulo");
        }
        return m;
    }

    public Map<String, Object> favorites(long userId, int page, int size) {
        List<Map<String, Object>> items = jdbc.sql("""
                SELECT w.id, w.public_id, w.title, w.cover, w.kind, w.slug, w.media_family, w.webtoon, f.created_at
                FROM favorite f JOIN work w ON w.id = f.work_id
                WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT ? OFFSET ?""")
                .params(userId, size, (long) page * size)
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    String family = rs.getString("media_family");
                    m.put("id", rs.getObject("public_id", UUID.class));
                    m.put("legacyId", rs.getLong("id"));
                    m.put("title", rs.getString("title"));
                    m.put("cover", rs.getString("cover"));
                    m.put("kind", rs.getString("kind"));
                    m.put("mediaFamily", family);
                    m.put("href", ("ANIMATION".equals(family) ? "/animes/" : "/leituras/") + rs.getString("slug"));
                    m.put("favoritedAt", rs.getObject("created_at", OffsetDateTime.class));
                    return m;
                }).list();
        long total = jdbc.sql("SELECT count(*) FROM favorite WHERE user_id = ?").param(userId).query(Long.class).single();
        return Map.of("items", items, "page", page, "size", size, "totalElements", total);
    }

    public List<Map<String, Object>> follows(long userId) {
        return jdbc.sql("""
                SELECT w.public_id, w.id FROM work_follow f JOIN work w ON w.id = f.work_id
                WHERE f.user_id = ? ORDER BY f.created_at DESC""")
                .param(userId)
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("workId", rs.getObject(1, UUID.class));
                    m.put("legacyId", rs.getLong(2));
                    return m;
                }).list();
    }

    /** Contadores pessoais (também mantém as chaves antigas usadas pelo menu do avatar). */
    public Map<String, Object> summary(long userId) {
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (LibraryStatus s : LibraryStatus.values()) {
            byStatus.put(s.code, 0L);
        }
        jdbc.sql("SELECT status, count(*) FROM library_entry WHERE user_id = ? GROUP BY status").param(userId)
                .query((rs, n) -> byStatus.put(rs.getString(1), rs.getLong(2))).list();
        long total = byStatus.values().stream().mapToLong(Long::longValue).sum();
        int watching = resume.continueList(userId, "ANIMATION", 500).size();
        int reading = resume.continueList(userId, "READING", 500).size();
        m.put("total", total);
        m.put("byStatus", byStatus);
        m.put("favorites", count("SELECT count(*) FROM favorite WHERE user_id = ?", userId));
        m.put("follows", count("SELECT count(*) FROM work_follow WHERE user_id = ?", userId));
        m.put("continueWatching", watching);
        m.put("continueReading", reading);
        m.put("lista", total);
        m.put("assistindo", watching);
        m.put("lendo", reading);
        return m;
    }

    private String workHref(long workId) {
        return jdbc.sql("SELECT media_family, slug FROM work WHERE id = ?").param(workId)
                .query((rs, n) -> ("ANIMATION".equals(rs.getString(1)) ? "/animes/" : "/leituras/") + rs.getString(2))
                .single();
    }

    private static String typeLabel(String kind, boolean webtoon) {
        if (kind == null) {
            return "";
        }
        return switch (kind) {
            case "anime" -> "Anime";
            case "filme" -> "Filme";
            case "manga" -> "Mangá";
            default -> webtoon ? "Manhwa · Webtoon" : "Manhwa";
        };
    }

    private boolean exists(String sql, Object... params) {
        return jdbc.sql(sql).params(params).query(Long.class).single() > 0;
    }

    private long count(String sql, long userId) {
        return jdbc.sql(sql).param(userId).query(Long.class).single();
    }
}
