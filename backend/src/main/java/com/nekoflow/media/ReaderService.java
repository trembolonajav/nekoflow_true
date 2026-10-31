package com.nekoflow.media;

import static com.nekoflow.media.PlaybackService.map;

import com.nekoflow.catalog.MangaLivreApiClient;
import com.nekoflow.catalog.UnofficialReadingApiClient;
import com.nekoflow.catalog.WeebCentralApiClient;
import com.nekoflow.progress.ProgressException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Manifesto de leitura: páginas reais do lote publicado de um capítulo + edição, na ordem
 * editorial, com dimensões (para reservar espaço antes do carregamento) e URLs autorizadas.
 */
@Service
public class ReaderService {

    private final JdbcClient jdbc;
    private final MediaProviders providers;
    private final MediaUrlSigner signer;
    private final MangaLivreApiClient mangaLivre;
    private final WeebCentralApiClient weebCentral;
    private final UnofficialReadingApiClient readingProviders;

    public ReaderService(JdbcClient jdbc, MediaProviders providers, MediaUrlSigner signer,
                         MangaLivreApiClient mangaLivre, WeebCentralApiClient weebCentral,
                         UnofficialReadingApiClient readingProviders) {
        this.jdbc = jdbc;
        this.providers = providers;
        this.signer = signer;
        this.mangaLivre = mangaLivre;
        this.weebCentral = weebCentral;
        this.readingProviders = readingProviders;
    }

    record ChapterRow(UUID id, UUID editionId, String number, String title, String editionName, String language,
                      String readingMode, String direction, long workId, UUID workPublicId, String workTitle,
                      String slug, String kind, boolean webtoon, String cover) {
    }

    public Map<String, Object> manifest(UUID chapterId, UUID editionId) {
        ChapterRow c = chapter(chapterId, editionId);
        UUID importId = jdbc.sql("SELECT id FROM chapter_import WHERE chapter_id = ? AND edition_id = ? AND status = 'PUBLISHED'")
                .params(chapterId, editionId).query(UUID.class).optional().orElse(null);
        List<Map<String, Object>> pages = importId == null ? providerPages(c) : pages(importId, false);
        if (pages.isEmpty()) {
            throw ProgressException.notFound("CHAPTER_PAGES_UNAVAILABLE",
                    "Este capítulo ainda não tem páginas publicadas no NekoFlow.");
        }
        List<Map<String, Object>> chapters = chapters(editionId);
        int index = -1;
        for (int i = 0; i < chapters.size(); i++) {
            if (chapterId.equals(chapters.get(i).get("id"))) {
                index = i;
            }
        }
        return map(
                "chapterId", c.id(), "editionId", c.editionId(),
                "chapter", map("id", c.id(), "number", c.number(), "title", c.title()),
                "edition", map("id", c.editionId(), "name", c.editionName(), "language", c.language()),
                "work", map("id", c.workPublicId(), "legacyId", c.workId(), "title", c.workTitle(), "slug", c.slug(),
                        "href", "/leituras/" + c.slug(), "kind", c.kind(), "webtoon", c.webtoon(), "cover", c.cover()),
                "readingMode", c.readingMode(), "direction", c.direction(),
                "expiresAt", signer.expiresAt(),
                "pages", pages,
                "chapters", chapters,
                "previous", neighbour(chapters, index, -1),
                "next", neighbour(chapters, index, 1));
    }

    ChapterRow chapter(UUID chapterId, UUID editionId) {
        return chapterRow(chapterId, editionId, true);
    }

    /** Capítulo para o editorial: inclui obras em rascunho (o painel prepara antes de publicar). */
    ChapterRow chapterForEditor(UUID chapterId, UUID editionId) {
        return chapterRow(chapterId, editionId, false);
    }

    private ChapterRow chapterRow(UUID chapterId, UUID editionId, boolean publishedOnly) {
        return jdbc.sql("""
                SELECT c.id, c.edition_id, c.display_number, c.title, ed.name, ed.language, ed.reading_mode,
                       ed.reading_direction, w.id, w.public_id, w.title, w.slug, w.kind, w.webtoon, w.cover
                FROM chapter c JOIN work_edition ed ON ed.id = c.edition_id JOIN work w ON w.id = ed.work_id
                WHERE c.id = ? AND c.edition_id = ? AND (w.visibility = 'PUBLISHED' OR NOT ?)""")
                .params(chapterId, editionId, publishedOnly)
                .query((rs, n) -> new ChapterRow(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                        rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7),
                        rs.getString(8), rs.getLong(9), rs.getObject(10, UUID.class), rs.getString(11),
                        rs.getString(12), rs.getString(13), rs.getBoolean(14), rs.getString(15)))
                .optional()
                .orElseThrow(() -> ProgressException.notFound("CHAPTER_NOT_FOUND", "Capítulo não encontrado."));
    }

    /**
     * Páginas de um lote com URL entregável. {@code preview} inclui páginas ainda não
     * publicadas (uso editorial); a leitura pública só recebe páginas AVAILABLE.
     */
    List<Map<String, Object>> pages(UUID importId, boolean preview) {
        record Row(UUID id, int position, String storage, String assetKey, UUID providerId, String url, int width,
                   int height, String type, String status) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT id, position, storage, asset_key, provider_id, source_url, width, height, page_type, status
                FROM chapter_page WHERE import_id = ? ORDER BY position""")
                .param(importId)
                .query((rs, n) -> new Row(rs.getObject(1, UUID.class), rs.getInt(2), rs.getString(3), rs.getString(4),
                        rs.getObject(5, UUID.class), rs.getString(6), rs.getInt(7), rs.getInt(8), rs.getString(9),
                        rs.getString(10)))
                .list();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Row r : rows) {
            if (!preview && !"AVAILABLE".equals(r.status())) {
                continue;
            }
            String url;
            if ("LOCAL".equals(r.storage())) {
                url = signer.sign(r.assetKey()).url();
            } else {
                var provider = providers.find(r.providerId()).orElse(null);
                if (!providers.allows(provider, r.url())) {
                    continue; // provedor desativado ou host não autorizado: a página não é entregue
                }
                url = r.url();
            }
            out.add(map("id", r.id(), "position", r.position(), "width", r.width(), "height", r.height(),
                    "type", r.type(), "url", url));
        }
        return out;
    }

    /** Capítulos da mesma edição, na ordem editorial, com disponibilidade real. */
    List<Map<String, Object>> chapters(UUID editionId) {
        return jdbc.sql("""
                SELECT c.id, c.display_number, c.title,
                       (EXISTS (SELECT 1 FROM chapter_import i WHERE i.chapter_id = c.id AND i.edition_id = c.edition_id
                                AND i.status = 'PUBLISHED')
                        OR EXISTS (SELECT 1 FROM chapter_source s WHERE s.chapter_id=c.id AND s.enabled
                                   AND s.provider IN ('Manga Livre','WeebCentral English','TiaManhwa','ManhwaBuddy'))) AS readable,
                       EXISTS (SELECT 1 FROM chapter_source s WHERE s.chapter_id = c.id AND s.enabled) AS external
                FROM chapter c WHERE c.edition_id = ? ORDER BY c.sort_position""")
                .param(editionId)
                .query((rs, n) -> map("id", rs.getObject(1, UUID.class), "number", rs.getString(2),
                        "title", rs.getString(3), "readable", rs.getBoolean(4),
                        "available", rs.getBoolean(4) || rs.getBoolean(5)))
                .list();
    }

    /** Converte as páginas públicas do provedor em manifesto interno sem copiar os arquivos. */
    private List<Map<String, Object>> providerPages(ChapterRow chapter) {
        record Source(String url, String provider) {}
        Source source = jdbc.sql("""
                SELECT source_url,provider FROM chapter_source
                WHERE chapter_id=? AND enabled
                  AND provider IN ('Manga Livre','WeebCentral English','TiaManhwa','ManhwaBuddy')
                ORDER BY created_at DESC LIMIT 1""")
                .param(chapter.id()).query((rs, n) -> new Source(rs.getString(1), rs.getString(2)))
                .optional().orElse(null);
        if (source == null) return List.of();
        if ("WeebCentral English".equals(source.provider())) return weebCentralPages(source.url());
        if ("TiaManhwa".equals(source.provider())) {
            return unofficialProviderPages(UnofficialReadingApiClient.TIA, source.url());
        }
        if ("ManhwaBuddy".equals(source.provider())) {
            return unofficialProviderPages(UnofficialReadingApiClient.BUDDY, source.url());
        }
        String slug = chapterSlug(source.url());
        if (slug == null) return List.of();
        UUID providerId = jdbc.sql("SELECT id FROM media_provider WHERE code='MANGA_LIVRE_CDN' AND enabled")
                .query(UUID.class).optional().orElse(null);
        MediaProviders.Provider provider = providers.find(providerId).orElse(null);
        List<Map<String, Object>> out = new ArrayList<>();
        for (MangaLivreApiClient.ReaderPage page : mangaLivre.reader(slug).pages()) {
            if (!providers.allows(provider, page.imageUrl())) continue;
            UUID id = UUID.nameUUIDFromBytes(("mangalivre:" + page.imageUrl()).getBytes(StandardCharsets.UTF_8));
            // A origem não publica dimensões no HTML. A proporção reserva espaço; a imagem usa object-fit contain.
            out.add(map("id", id, "position", page.index(), "width", 1080, "height", 1537,
                    "type", "SINGLE", "url", page.imageUrl()));
        }
        return out;
    }

    private List<Map<String, Object>> unofficialProviderPages(String provider, String source) {
        String[] ids = unofficialChapterIds(source);
        if (ids == null) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (UnofficialReadingApiClient.ReaderPage page : readingProviders.reader(provider, ids[0], ids[1]).pages()) {
            UUID id = UUID.nameUUIDFromBytes((provider + ":" + page.imageUrl()).getBytes(StandardCharsets.UTF_8));
            out.add(map("id", id, "position", page.index(), "width", 1080, "height", 1537,
                    "type", "SINGLE", "url", page.imageUrl()));
        }
        return out;
    }

    static String[] unofficialChapterIds(String source) {
        if (source == null) return null;
        try {
            Matcher matcher = Pattern.compile("/manhwa/([^/]+)/([^/]+)/?", Pattern.CASE_INSENSITIVE)
                    .matcher(URI.create(source).getPath());
            if (!matcher.find()) return null;
            return new String[] { matcher.group(1), matcher.group(2) };
        } catch (RuntimeException error) { return null; }
    }

    private List<Map<String, Object>> weebCentralPages(String source) {
        String chapterId = weebCentralChapterId(source);
        if (chapterId == null) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (WeebCentralApiClient.ReaderPage page : weebCentral.reader(chapterId).pages()) {
            UUID id = UUID.nameUUIDFromBytes(("weebcentral-en:" + page.imageUrl()).getBytes(StandardCharsets.UTF_8));
            out.add(map("id", id, "position", page.index(), "width", 1080, "height", 1537,
                    "type", "SINGLE", "url", page.imageUrl()));
        }
        return out;
    }

    static String chapterSlug(String source) {
        if (source == null) return null;
        try {
            String path = URI.create(source).getPath();
            String marker = "/capitulo/";
            int start = path.indexOf(marker);
            if (start < 0) return null;
            String slug = path.substring(start + marker.length()).replaceAll("/+$", "");
            return slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*") ? slug : null;
        } catch (RuntimeException e) { return null; }
    }

    static String weebCentralChapterId(String source) {
        if (source == null) return null;
        try {
            Matcher matcher = Pattern.compile("/chapters/([0-9A-HJKMNP-TV-Z]{26})", Pattern.CASE_INSENSITIVE)
                    .matcher(URI.create(source).getPath());
            return matcher.find() ? matcher.group(1).toUpperCase(java.util.Locale.ROOT) : null;
        } catch (RuntimeException error) { return null; }
    }

    private static Map<String, Object> neighbour(List<Map<String, Object>> chapters, int index, int step) {
        if (index < 0) {
            return null;
        }
        for (int i = index + step; i >= 0 && i < chapters.size(); i += step) {
            if (Boolean.TRUE.equals(chapters.get(i).get("available"))) {
                return chapters.get(i);
            }
        }
        return null;
    }
}
