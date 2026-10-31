package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class MangaLivreApiClientTest {
    @Test
    void parsesWordPressCatalogAndPaginationHeaders() {
        String json = """
                [{"id":590413,"modified":"2026-10-27T21:15:41","slug":"obra-nova",
                  "link":"https://mangalivre.blog/manga/obra-nova/",
                  "title":{"rendered":"Obra &amp; Nova"},
                  "excerpt":{"rendered":"<p>Uma sinopse.</p>"},
                  "class_list":["type-manga","genre-acao","genre-long-strip"],
                  "_embedded":{"wp:featuredmedia":[{"source_url":"https://cdn.example/original.jpg",
                    "media_details":{"sizes":{"manga-cover":{"source_url":"https://cdn.example/cover.jpg"}}}}]}}]
                """;

        var result = MangaLivreApiClient.parseCatalog(json, "757", "8", 1, 100);

        assertThat(result.totalElements()).isEqualTo(757);
        assertThat(result.totalPages()).isEqualTo(8);
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.id()).isEqualTo(590413);
            assertThat(item.slug()).isEqualTo("obra-nova");
            assertThat(item.title()).isEqualTo("Obra & Nova");
            assertThat(item.synopsis()).isEqualTo("Uma sinopse.");
            assertThat(item.coverUrl()).isEqualTo("https://cdn.example/cover.jpg");
            assertThat(item.markers()).containsExactly("type-manga", "genre-acao", "genre-long-strip");
        });
    }

    @Test
    void classifiesMangaWebtoonAndAdultMarkers() {
        var plain = MangaLivreArchiveSyncService.classify(java.util.List.of("type-manga", "genre-acao"));
        var webtoon = MangaLivreArchiveSyncService.classify(java.util.List.of("genre-long-strip"));
        var pornhwa = MangaLivreArchiveSyncService.classify(java.util.List.of("genre-pornhwa", "genre-adulto"));

        assertThat(plain.category()).isEqualTo("MANGA");
        assertThat(plain.contentRating()).isEqualTo("GENERAL");
        assertThat(webtoon.category()).isEqualTo("WEBTOON");
        assertThat(webtoon.webtoon()).isTrue();
        assertThat(pornhwa.category()).isEqualTo("MANHWA");
        assertThat(pornhwa.contentRating()).isEqualTo("EXPLICIT");
    }

    @Test
    void acceptsPercentEncodedWordPressSlug() {
        String json = """
                [{"id":1,"slug":"umayome-uma-x-tore%e2%99%82-kekkon","title":{"rendered":"Umayome"}}]
                """;
        var item = MangaLivreApiClient.parseCatalog(json, "1", "1", 1, 100).items().get(0);
        assertThat(item.slug()).contains("%e2%99%82");
    }

    @Test
    void parsesMangaIdentityMetadataAndChapterCount() {
        String html = """
                <html><head><link rel="canonical" href="https://mangalivre.blog/manga/one-piece/"></head><body>
                <div class="manga-cover"><img src="https://cdn.example/one-piece.jpg"></div>
                <h1 class="manga-title">One Piece</h1>
                <div class="manga-synopsis"><p>Uma aventura pirata.</p></div>
                <button id="sr-load-chapters" data-manga="575284" data-offset="30" data-total="1196"></button>
                </body></html>
                """;

        var manga = MangaLivreApiClient.parseManga(html, "one-piece", "https://mangalivre.blog");

        assertThat(manga.id()).isEqualTo(575284);
        assertThat(manga.title()).isEqualTo("One Piece");
        assertThat(manga.synopsis()).isEqualTo("Uma aventura pirata.");
        assertThat(manga.chapterCount()).isEqualTo(1196);
        assertThat(manga.coverUrl()).isEqualTo("https://cdn.example/one-piece.jpg");
    }

    @Test
    void parsesNormalizedChapterBatchWithoutDuplicateGridLinks() {
        String list = """
                <li class="chapter-item"><a class="chapter-link" href="/capitulo/one-piece-capitulo-1196/">
                <span class="chapter-number">Capítulo 1196</span></a><span class="chapter-date">há 1 semana</span></li>
                <li class="chapter-item"><a class="chapter-link" href="/capitulo/one-piece-capitulo-1195/">
                <span class="chapter-number">Capítulo 1: Capítulo 1.1</span></a></li>
                """;
        String json = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode()
                .put("list", list).put("grid", list).put("offset", 30).put("total", 1196)
                .put("has_more", true).toString();

        var chapters = MangaLivreApiClient.parseChapters(json, "https://mangalivre.blog");

        assertThat(chapters.offset()).isEqualTo(28);
        assertThat(chapters.nextOffset()).isEqualTo(30);
        assertThat(chapters.totalElements()).isEqualTo(1196);
        assertThat(chapters.hasMore()).isTrue();
        assertThat(chapters.items()).extracting(MangaLivreApiClient.ChapterSummary::number)
                .containsExactly("1196", "1.1");
        assertThat(chapters.items().get(1).title()).isEqualTo("Capítulo 1.1");
    }

    @Test
    void parsesReaderPagesInOrderAndRejectsEmptyReader() {
        String html = """
                <div class="chapter-title-bar"><h1 class="manga-title">
                  <a href="/manga/one-piece/">One Piece</a> / Capítulo 1196
                </h1></div>
                <a href="/capitulo/one-piece-capitulo-1195/" aria-label="Capítulo anterior"></a>
                <img class="chapter-image" src="https://mangalivre.blog/uploads/p1.webp" alt="Página 1">
                <img class="chapter-image" src="javascript:alert(1)" alt="inválida">
                <img class="chapter-image" src="https://mangalivre.blog/uploads/p2.webp" alt="Página 2">
                """;

        var reader = MangaLivreApiClient.parseReader(html, "one-piece-capitulo-1196",
                "https://mangalivre.blog");

        assertThat(reader.mangaTitle()).isEqualTo("One Piece");
        assertThat(reader.chapterNumber()).isEqualTo("1196");
        assertThat(reader.pages()).hasSize(2);
        assertThat(reader.pages().get(1).index()).isEqualTo(2);
        assertThat(reader.previousChapterUrl()).endsWith("/capitulo/one-piece-capitulo-1195/");
        assertThatThrownBy(() -> MangaLivreApiClient.parseReader("<html></html>", "ausente",
                "https://mangalivre.blog")).isInstanceOf(MangaLivreApiClient.NotFoundException.class);
    }
}
