package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Importa metadados de capítulos do MangaLivre em uma obra de leitura já vinculada no catálogo. */
@Service
public class MangaLivreCatalogSyncService {
    private static final String PROVENANCE = "Sincronização da API pública não oficial do MangaLivre";

    private final MangaLivreApiClient api;
    private final JdbcClient jdbc;
    private final TransactionTemplate transactions;
    private final ObjectMapper mapper;

    public MangaLivreCatalogSyncService(MangaLivreApiClient api, JdbcClient jdbc,
                                        TransactionTemplate transactions, ObjectMapper mapper) {
        this.api = api;
        this.jdbc = jdbc;
        this.transactions = transactions;
        this.mapper = mapper;
    }

    public Map<String, Object> sync(String slug, long actorId) {
        MangaLivreApiClient.MangaDetail detail = api.manga(slug);
        Target target = target(slug);
        List<MangaLivreApiClient.ChapterSummary> chapters = allChapters(slug);
        List<Map<String, Object>> inventory = new ArrayList<>();
        int totalPages = 0;
        int minPages = Integer.MAX_VALUE;
        int maxPages = 0;
        int failures = 0;

        for (MangaLivreApiClient.ChapterSummary source : chapters) {
            int pageCount = 0;
            String error = null;
            try {
                pageCount = api.reader(source.slug()).pages().size();
            } catch (MangaLivreApiClient.ProviderException e) {
                failures++;
                error = e.getMessage();
            }
            if (pageCount > 0) {
                totalPages += pageCount;
                minPages = Math.min(minPages, pageCount);
                maxPages = Math.max(maxPages, pageCount);
            }
            BigDecimal position = number(source.number());
            int observedPages = pageCount;
            transactions.executeWithoutResult(status -> upsert(target, source, position, observedPages));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("number", source.number());
            row.put("slug", source.slug());
            row.put("pageCount", pageCount);
            row.put("url", source.url());
            if (error != null) row.put("error", error);
            inventory.add(row);
        }

        int imported = chapters.size();
        int pages = totalPages;
        int failed = failures;
        transactions.executeWithoutResult(status -> {
            jdbc.sql("""
                    UPDATE work SET total_units=?,available_units=?,updated_at=now() WHERE id=?""")
                    .params(imported, imported, target.workId()).update();
            jdbc.sql("""
                    INSERT INTO external_identifier(work_id,provider,external_id) VALUES (?,'MANGALIVRE',?)
                    ON CONFLICT(provider,external_id,work_id) DO NOTHING""")
                    .params(target.workId(), Long.toString(detail.id())).update();
            jdbc.sql("""
                    INSERT INTO catalog_audit_event(actor_id,work_id,action,after_data)
                    VALUES (?,?,'MANGALIVRE_SYNC',CAST(? AS jsonb))""")
                    .params(actorId, target.workId(), json(Map.of("chapters", imported, "pages", pages,
                            "failures", failed, "sourceId", detail.id()))).update();
        });

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("workId", target.publicId());
        result.put("editionId", target.editionId());
        result.put("slug", slug);
        result.put("title", detail.title());
        result.put("chapterCount", imported);
        result.put("totalPages", totalPages);
        result.put("minimumPages", minPages == Integer.MAX_VALUE ? 0 : minPages);
        result.put("maximumPages", maxPages);
        result.put("averagePages", imported == failures ? 0
                : BigDecimal.valueOf(totalPages).divide(BigDecimal.valueOf(imported - failures), 2, RoundingMode.HALF_UP));
        result.put("failedChapters", failures);
        result.put("chapters", inventory);
        return result;
    }

    private List<MangaLivreApiClient.ChapterSummary> allChapters(String slug) {
        List<MangaLivreApiClient.ChapterSummary> result = new ArrayList<>();
        int offset = 0;
        boolean more;
        do {
            MangaLivreApiClient.ChapterPage batch = api.chapters(slug, offset, "");
            result.addAll(batch.items());
            if (batch.nextOffset() <= offset && batch.hasMore())
                throw new MangaLivreApiClient.ProviderException("Paginação MangaLivre não avançou.");
            offset = batch.nextOffset();
            more = batch.hasMore();
        } while (more);
        return result;
    }

    private Target target(String slug) {
        long workId = jdbc.sql("""
                SELECT id FROM work WHERE slug=? AND media_family='READING'""")
                .param(slug).query(Long.class).optional()
                .orElseThrow(() -> new IllegalArgumentException("A obra ainda não existe no catálogo de leituras."));
        UUID publicId = jdbc.sql("SELECT public_id FROM work WHERE id=?").param(workId).query(UUID.class).single();
        UUID edition = jdbc.sql("""
                SELECT id FROM work_edition WHERE work_id=? AND language='pt-BR'
                ORDER BY (name ILIKE '%Manga Livre%') DESC,is_original DESC LIMIT 1""")
                .param(workId).query(UUID.class).optional()
                .orElseThrow(() -> new IllegalArgumentException("A obra não possui edição pt-BR para sincronizar."));
        jdbc.sql("UPDATE work_edition SET reading_mode='VERTICAL' WHERE id=?")
                .param(edition).update();
        return new Target(workId, publicId, edition);
    }

    private void upsert(Target target, MangaLivreApiClient.ChapterSummary source,
                        BigDecimal position, int pageCount) {
        String title = source.title() == null || source.title().isBlank()
                ? "Capítulo " + source.number() : source.title();
        UUID chapterId = jdbc.sql("""
                INSERT INTO chapter(edition_id,title,display_number,sort_position,availability)
                VALUES (?,?,?,?,'EXTERNAL_LINK')
                ON CONFLICT(edition_id,sort_position) DO UPDATE SET
                  title=EXCLUDED.title,display_number=EXCLUDED.display_number,
                  availability=CASE WHEN chapter.availability='NATIVE' THEN 'NATIVE' ELSE 'EXTERNAL_LINK' END
                RETURNING id""")
                .params(target.editionId(), title, source.number(), position).query(UUID.class).single();
        String provenance = PROVENANCE + " em " + LocalDate.now() + "; " + pageCount + " páginas observadas.";
        jdbc.sql("""
                INSERT INTO chapter_source(chapter_id,source_type,source_url,provider,language,embed_allowed,
                                           enabled,provenance,reports_progress,page_count)
                VALUES (?,'EXTERNAL_LINK',?,'Manga Livre','pt-BR',FALSE,TRUE,?,TRUE,?)
                ON CONFLICT(chapter_id,source_type,source_url) DO UPDATE SET
                  enabled=TRUE,provenance=EXCLUDED.provenance,page_count=EXCLUDED.page_count,reports_progress=TRUE""")
                .params(chapterId, source.url(), provenance, pageCount > 0 ? pageCount : null).update();
    }

    private static BigDecimal number(String value) {
        try { return new BigDecimal(value); }
        catch (NumberFormatException e) { throw new IllegalArgumentException("Número de capítulo inválido: " + value); }
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    private record Target(long workId, UUID publicId, UUID editionId) {}
}
