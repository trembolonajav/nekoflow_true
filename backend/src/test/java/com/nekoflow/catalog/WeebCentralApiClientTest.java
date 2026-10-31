package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class WeebCentralApiClientTest {
    private static final String ORIGIN = "https://weebcentral.com";

    @Test
    void parsesEnglishCatalogAndPagination() {
        String html = """
                <article class="bg-base-300 flex gap-4 p-4">
                  <a href="https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece">
                    <img src="https://cdn.example/one-piece.jpg" alt="One Piece cover">
                  </a>
                  <a class="line-clamp-1" href="https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece">One Piece</a>
                  <div><strong>Year:</strong><span>1997</span></div>
                  <div><strong>Status:</strong><span>Ongoing</span></div>
                  <div><strong>Type:</strong><span>Manga</span></div>
                  <div><strong>Author(s):</strong><span><a>ODA Eiichiro</a></span></div>
                  <div><strong>Tag(s):</strong><span>Action,</span><span>Adventure</span></div>
                  <span>Official</span>
                </article>
                <button hx-get="/search/data?limit=1&amp;offset=1">View More Results...</button>
                """;

        var result = WeebCentralApiClient.parseCatalog(html, ORIGIN, 0, 1);

        assertThat(result.language()).isEqualTo("en");
        assertThat(result.hasMore()).isTrue();
        assertThat(result.nextOffset()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.id()).isEqualTo("01J76XY7E9FNDZ1DBBM6PBJPFK");
            assertThat(item.title()).isEqualTo("One Piece");
            assertThat(item.type()).isEqualTo("Manga");
            assertThat(item.status()).isEqualTo("Ongoing");
            assertThat(item.year()).isEqualTo(1997);
            assertThat(item.authors()).containsExactly("ODA Eiichiro");
            assertThat(item.tags()).containsExactly("Action", "Adventure");
            assertThat(item.officialTranslation()).isTrue();
        });
    }

    @Test
    void enforcesRequestedLimitWhenOriginReturnsTooManyCards() {
        String card = """
                <article class="bg-base-300"><a class="line-clamp-1" href="%s">%s</a></article>
                """;
        String html = card.formatted(ORIGIN + "/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One", "One")
                + card.formatted(ORIGIN + "/series/01J76XYAQSGEJPXCSCVPQ3MHZM/Two", "Two");

        var result = WeebCentralApiClient.parseCatalog(html, ORIGIN, 0, 1);

        assertThat(result.items()).hasSize(1);
        assertThat(result.nextOffset()).isEqualTo(1);
        assertThat(result.hasMore()).isTrue();
    }

    @Test
    void parsesUniqueSeriesFromSitemap() {
        String xml = """
                <urlset>
                  <url><loc>https://weebcentral.com/</loc></url>
                  <url><loc>https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece</loc></url>
                  <url><loc>https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece</loc></url>
                </urlset>
                """;

        var result = WeebCentralApiClient.parseIndex(xml, ORIGIN);

        assertThat(result).singleElement().satisfies(item -> {
            assertThat(item.id()).isEqualTo("01J76XY7E9FNDZ1DBBM6PBJPFK");
            assertThat(item.slug()).isEqualTo("One-Piece");
        });
    }

    @Test
    void parsesSeriesMetadataAndMarksContentAsEnglish() {
        String html = """
                <html><head>
                  <link rel="canonical" href="https://weebcentral.com/series/01J76XYFD1Z4VFXGGTVR822H7C/Level-1-Player">
                  <meta property="og:image" content="https://cdn.example/cover.jpg">
                </head><body>
                  <h1>Level 1 Player</h1>
                  <ul>
                    <li><strong>Author(s):</strong><a>Bang Eun-woo</a></li>
                    <li><strong>Tags(s):</strong><a>Action</a><a>Fantasy</a></li>
                    <li><strong>Type:</strong><span>Manhwa</span></li>
                    <li><strong>Status:</strong><span>Ongoing</span></li>
                    <li><strong>Released:</strong><span>2022</span></li>
                    <li><strong>Official Translation:</strong><span>No</span></li>
                    <li><strong>Anime Adaptation:</strong><span>No</span></li>
                    <li><strong>Adult Content:</strong><span>No</span></li>
                    <li><strong>Description</strong><p>An English description.</p></li>
                  </ul>
                </body></html>
                """;

        var result = WeebCentralApiClient.parseSeries(html, "01J76XYFD1Z4VFXGGTVR822H7C", ORIGIN);

        assertThat(result.language()).isEqualTo("en");
        assertThat(result.type()).isEqualTo("Manhwa");
        assertThat(result.description()).isEqualTo("An English description.");
        assertThat(result.adultContent()).isFalse();
        assertThat(result.authors()).containsExactly("Bang Eun-woo");
        assertThat(result.tags()).containsExactly("Action", "Fantasy");
    }

    @Test
    void parsesFullChapterListWithEnglishLanguage() {
        String html = """
                <div class="flex items-center">
                  <a href="/chapters/01M57EX8EFDFG9V93SNDRVYPSG">
                    <span class="grow"><span>Chapter 160: A New Start</span></span>
                    <time datetime="2026-10-18T12:13:44.272Z"></time>
                  </a>
                </div>
                """;

        var result = WeebCentralApiClient.parseChapters(html, "01J76XYFD1Z4VFXGGTVR822H7C", ORIGIN);

        assertThat(result.totalElements()).isEqualTo(1);
        assertThat(result.language()).isEqualTo("en");
        assertThat(result.items()).singleElement().satisfies(chapter -> {
            assertThat(chapter.number()).isEqualTo("160");
            assertThat(chapter.title()).isEqualTo("A New Start");
            assertThat(chapter.language()).isEqualTo("en");
        });
    }

    @Test
    void parsesReaderPagesAndRejectsAnEmptyReader() {
        String shell = """
                <html><head><title>Chapter 1 | Level E | Weeb Central</title></head><body>
                  <a href="/series/01J76XYA66JC7CVZCB226MRK9R/Level-E">Level E</a>
                </body></html>
                """;
        String images = """
                <section id="chapter-images">
                  <img src="https://scans.example/001.png" alt="Page 1">
                  <img src="javascript:alert(1)" alt="invalid">
                  <img src="https://scans.example/002.png" alt="Page 2">
                </section>
                """;

        var result = WeebCentralApiClient.parseReader(shell, images,
                "01J76XYWSM8ZJ49XB2V51HC9J4", ORIGIN);

        assertThat(result.language()).isEqualTo("en");
        assertThat(result.seriesTitle()).isEqualTo("Level E");
        assertThat(result.chapterNumber()).isEqualTo("1");
        assertThat(result.pages()).hasSize(2);
        assertThatThrownBy(() -> WeebCentralApiClient.parseReader(shell, "<section id='chapter-images'></section>",
                "01J76XYWSM8ZJ49XB2V51HC9J4", ORIGIN))
                .isInstanceOf(WeebCentralApiClient.NotFoundException.class);
    }

    @Test
    void classifiesEnglishMangaManhwaAndAdultContent() {
        var manga = detail("Manga", false, java.util.List.of("Action"));
        var adultManhwa = detail("Manhwa", true, java.util.List.of("Adult", "Smut"));
        var hentai = detail("Manga", true, java.util.List.of("Hentai"));

        assertThat(WeebCentralArchiveSyncService.classify(manga).category()).isEqualTo("MANGA");
        assertThat(WeebCentralArchiveSyncService.classify(manga).webtoon()).isFalse();
        assertThat(WeebCentralArchiveSyncService.classify(adultManhwa).category()).isEqualTo("MANHWA");
        assertThat(WeebCentralArchiveSyncService.classify(adultManhwa).contentRating()).isEqualTo("ADULT");
        assertThat(WeebCentralArchiveSyncService.classify(hentai).contentRating()).isEqualTo("EXPLICIT");
    }

    private static WeebCentralApiClient.SeriesDetail detail(String type, boolean adult,
                                                             java.util.List<String> tags) {
        return new WeebCentralApiClient.SeriesDetail("01J76XY7E9FNDZ1DBBM6PBJPFK", "One-Piece",
                "One Piece", ORIGIN + "/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece", null,
                "English synopsis", type, "Ongoing", 1997, java.util.List.of("ODA Eiichiro"), tags,
                true, true, adult, "en");
    }
}
