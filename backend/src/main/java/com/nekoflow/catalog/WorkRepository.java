package com.nekoflow.catalog;

import com.nekoflow.common.Text;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class WorkRepository {

    private final JdbcClient jdbc;

    public WorkRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Work> find(long id) {
        return jdbc.sql("SELECT * FROM work WHERE id = ?").param(id).query(WorkRepository::map).optional();
    }

    public Work require(long id) {
        return find(id).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND, "Obra não encontrada"));
    }

    public Optional<Work> findBySlug(String section, String slug) {
        int dash = slug.lastIndexOf('-');
        if (dash >= 0) {
            try {
                long id = Long.parseLong(slug.substring(dash + 1));
                Optional<Work> byId = find(id).filter(w -> w.section().equals(section) && w.slug().equals(slug));
                if (byId.isPresent()) {
                    return byId;
                }
            } catch (NumberFormatException ignored) {
                // Slugs antigos sem ID continuam aceitos abaixo.
            }
        }
        return jdbc.sql("SELECT * FROM work ORDER BY popularity DESC NULLS LAST")
                .query(WorkRepository::map).list().stream()
                .filter(w -> w.section().equals(section) && w.titleSlug().equals(slug))
                .findFirst();
    }

    public boolean exists(long id) {
        return jdbc.sql("SELECT count(*) FROM work WHERE id = ?").param(id).query(Long.class).single() > 0;
    }

    /** Insere a obra se ainda não existir (o catálogo nunca duplica uma obra). */
    @Transactional
    public boolean insertIfAbsent(Work w) {
        boolean inserted = jdbc.sql("""
                INSERT INTO work (id, kind, title, alt_titles, cover, banner, webtoon, year, total_units,
                                  available_units, airing_status, popularity, slug, media_family, work_format,
                                  reading_category, presentation_format)
                VALUES (:id, :kind, :title, :alt, :cover, :banner, :webtoon, :year, :total, :avail, :status, :pop,
                        :slug, :family, :format, :category, :presentation)
                ON CONFLICT (id) DO NOTHING""")
                .param("id", w.id()).param("kind", w.kind()).param("title", w.title())
                .param("alt", w.altTitles() == null ? "" : w.altTitles()).param("cover", w.cover())
                .param("banner", w.banner()).param("webtoon", w.webtoon()).param("year", w.year())
                .param("total", w.totalUnits()).param("avail", w.availableUnits())
                .param("status", w.airingStatus()).param("pop", w.popularity())
                .param("slug", w.slug()).param("family", w.isAnimation() ? "ANIMATION" : "READING")
                .param("format", "filme".equals(w.kind()) ? "MOVIE" : w.isAnimation() ? "SERIES" : "COMIC")
                .param("category", "manga".equals(w.kind()) ? "MANGA" : "manhwa".equals(w.kind()) ? "MANHWA" : null)
                .param("presentation", w.isAnimation() ? null : w.webtoon() ? "VERTICAL" : "PAGED")
                .update() > 0;
        if (inserted) {
            jdbc.sql("INSERT INTO work_title(work_id,title,title_norm,title_type) VALUES (?,?,lower(?),'PRIMARY') ON CONFLICT DO NOTHING")
                    .params(w.id(), w.title(), w.title()).update();
            if (w.id() < 900000000) jdbc.sql("INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,'ANILIST',?) ON CONFLICT DO NOTHING")
                    .params(w.id(), Long.toString(w.id())).update();
        }
        return inserted;
    }

    /** Define as unidades conhecidas só quando ainda não foram definidas/publicadas. */
    public void initUnits(long id, int total, int available) {
        jdbc.sql("UPDATE work SET total_units = ?, available_units = ? WHERE id = ? AND available_units IS NULL")
                .params(total, available, id).update();
    }

    public void raiseAvailableUnits(long id, int unit) {
        jdbc.sql("UPDATE work SET available_units = GREATEST(COALESCE(available_units, 0), ?) WHERE id = ?")
                .params(unit, id).update();
    }

    public void setVisibility(long id, String visibility) {
        jdbc.sql("UPDATE work SET visibility = ?, updated_at = now() WHERE id = ?")
                .params(visibility, id).update();
    }

    public long nextLocalId() {
        // Obras cadastradas pela equipe sem id externo recebem ids altos, fora da faixa da AniList.
        return jdbc.sql("SELECT GREATEST(COALESCE(MAX(id), 0) + 1, 900000000) FROM work WHERE id >= 900000000")
                .query(Long.class).single();
    }

    public List<Work> search(String q, int limit) {
        String n = Text.norm(q);
        if (n.isEmpty()) {
            return jdbc.sql("SELECT * FROM work ORDER BY popularity DESC NULLS LAST LIMIT ?")
                    .param(limit).query(WorkRepository::map).list();
        }
        List<Work> all = jdbc.sql("SELECT * FROM work").query(WorkRepository::map).list();
        List<Work> out = new ArrayList<>();
        for (Work w : all) {
            if (Text.norm(w.title()).contains(n) || Text.norm(w.altTitles()).contains(n)) {
                out.add(w);
            }
        }
        out.sort((a, b) -> Integer.compare(score(b, n), score(a, n)));
        return out.subList(0, Math.min(limit, out.size()));
    }

    /**
     * Identificação de obra existente para pedidos: título ou título alternativo
     * idênticos depois de normalizados. Semelhança parcial não conta como duplicata.
     */
    public Optional<Work> findExactTitle(String title) {
        String n = Text.norm(title);
        if (n.isEmpty()) {
            return Optional.empty();
        }
        for (Work w : jdbc.sql("SELECT * FROM work").query(WorkRepository::map).list()) {
            if (Text.norm(w.title()).equals(n)
                    || Arrays.stream(w.altTitles().split("\\|")).anyMatch(a -> Text.norm(a).equals(n))) {
                return Optional.of(w);
            }
        }
        return Optional.empty();
    }

    private static int score(Work w, String n) {
        String t = Text.norm(w.title());
        int s = t.equals(n) ? 300 : t.startsWith(n) ? 200 : t.contains(n) ? 100 : 50;
        return s + (w.popularity() == null ? 0 : Math.min(99, w.popularity() / 5000));
    }

    static Work map(ResultSet rs, int n) throws SQLException {
        return new Work(
                rs.getLong("id"), rs.getString("kind"), rs.getString("title"), rs.getString("alt_titles"),
                rs.getString("cover"), rs.getString("banner"), rs.getBoolean("webtoon"),
                (Integer) rs.getObject("year"), (Integer) rs.getObject("total_units"),
                (Integer) rs.getObject("available_units"), rs.getString("airing_status"),
                (Integer) rs.getObject("popularity"));
    }
}
