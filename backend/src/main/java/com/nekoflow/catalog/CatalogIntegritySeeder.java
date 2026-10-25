package com.nekoflow.catalog;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Aplica regras reversíveis de apresentação e remove falsos previews do catálogo. */
@Component
@Order(6)
public class CatalogIntegritySeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CatalogIntegritySeeder.class);
    private final JdbcClient jdbc;

    public CatalogIntegritySeeder(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int normalized = 0;
        List<Title> titles = jdbc.sql("SELECT id,title FROM work WHERE media_family='ANIMATION'")
                .query((rs, row) -> new Title(rs.getLong("id"), rs.getString("title"))).list();
        for (Title current : titles) {
            String canonical = CatalogTitlePolicy.canonicalSeriesTitle(current.title());
            if (canonical == null || canonical.equals(current.title())) continue;
            // O nome sazonal completo continua pesquisável e auditável como alias.
            jdbc.sql("""
                    INSERT INTO work_title(work_id,title,title_norm,title_type,language)
                    VALUES (?,?,lower(?),'ALIAS','ja-Latn') ON CONFLICT DO NOTHING""")
                    .params(current.id(), current.title(), current.title()).update();
            jdbc.sql("UPDATE work SET title=?,updated_at=now() WHERE id=?")
                    .params(canonical, current.id()).update();
            normalized++;
        }
        int falsePreviews = jdbc.sql("""
                UPDATE episode e SET thumbnail_url=NULL
                FROM season s JOIN work w ON w.id=s.work_id
                WHERE e.season_id=s.id AND e.thumbnail_url IS NOT NULL
                  AND (e.thumbnail_url=w.cover OR e.thumbnail_url=w.banner OR e.thumbnail_url=s.poster_url)""")
                .update();
        log.info("Integridade do catálogo: {} títulos-base normalizados e {} falsos previews removidos",
                normalized, falsePreviews);
    }

    private record Title(long id, String title) {
    }
}
