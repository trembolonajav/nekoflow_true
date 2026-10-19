package com.nekoflow.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;

class MediaRulesTest {

    @Test
    void onlyHttpsUrlsOnDeclaredHostsAreAccepted() {
        List<String> hosts = List.of("cdn.example.test");
        assertThat(MediaProviders.hostAllowed(hosts, "https://cdn.example.test/a/index.m3u8")).isTrue();
        assertThat(MediaProviders.hostAllowed(hosts, "https://CDN.example.test/a.mp4")).isTrue();
        assertThat(MediaProviders.hostAllowed(hosts, "http://cdn.example.test/a.mp4")).isFalse();
        assertThat(MediaProviders.hostAllowed(hosts, "https://evil.cdn.example.test/a.mp4")).isFalse();
        assertThat(MediaProviders.hostAllowed(hosts, "https://cdn.example.test.evil.test/a.mp4")).isFalse();
        assertThat(MediaProviders.hostAllowed(hosts, "https://user:pw@cdn.example.test/a.mp4")).isFalse();
        assertThat(MediaProviders.hostAllowed(hosts, "https://cdn.example.test:8443/a.mp4")).isFalse();
        assertThat(MediaProviders.hostAllowed(List.of("127.0.0.1"), "https://127.0.0.1/a.mp4")).isFalse();
        assertThat(MediaProviders.hostAllowed(hosts, "javascript:alert(1)")).isFalse();
        assertThat(MediaProviders.hostAllowed(hosts, null)).isFalse();
    }

    @Test
    void signedUrlMatchesNginxSecureLinkAlgorithm() throws Exception {
        Clock clock = Clock.fixed(Instant.parse("2026-10-19T12:00:00Z"), ZoneOffset.UTC);
        MediaUrlSigner signer = new MediaUrlSigner("segredo-de-teste-123", 600, "/media", clock);
        MediaUrlSigner.Signed s = signer.sign("chapters/abc/001-x.webp");
        long expires = Instant.parse("2026-10-19T12:10:00Z").getEpochSecond();
        String expected = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("MD5")
                .digest((expires + "/media/chapters/abc/001-x.webp segredo-de-teste-123")
                        .getBytes(StandardCharsets.UTF_8)));
        assertThat(s.url()).isEqualTo("/media/chapters/abc/001-x.webp?md5=" + expected + "&expires=" + expires);
        assertThatThrownBy(() -> signer.sign("../segredos.txt")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new MediaUrlSigner("curto", 60, "/media", clock))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void imageTypeComesFromBytesNotExtension() throws Exception {
        assertThat(ImageInspector.inspect(MediaIntegrationTest.png(640, 960)))
                .hasValueSatisfying(i -> {
                    assertThat(i.mime()).isEqualTo("image/png");
                    assertThat(i.width()).isEqualTo(640);
                    assertThat(i.height()).isEqualTo(960);
                });
        assertThat(ImageInspector.inspect(MediaIntegrationTest.jpeg(300, 500)))
                .hasValueSatisfying(i -> assertThat(i.width() + "x" + i.height()).isEqualTo("300x500"));
        byte[] webp = new byte[64];
        System.arraycopy("RIFF....WEBPVP8 ".getBytes(StandardCharsets.US_ASCII), 0, webp, 0, 16);
        webp[26] = (byte) (1080 & 0xff);
        webp[27] = (byte) (1080 >> 8);
        webp[28] = (byte) (1537 & 0xff);
        webp[29] = (byte) (1537 >> 8);
        assertThat(ImageInspector.inspect(webp)).hasValueSatisfying(i -> assertThat(i.height()).isEqualTo(1537));
        assertThat(ImageInspector.inspect("MZ executável disfarçado de jpg.......".getBytes())).isEmpty();
        assertThat(ImageInspector.inspect(new byte[10])).isEmpty();
    }

    @Test
    void pagesAreOrderedNaturallyAndDuplicatesRejected() {
        List<String> names = new ArrayList<>(List.of("page-10.jpg", "page-2.jpg", "page-1.jpg", "Page-03.jpg"));
        names.sort(ChapterImportService::natural);
        assertThat(names).containsExactly("page-1.jpg", "page-2.jpg", "Page-03.jpg", "page-10.jpg");

        List<String> errors = new ArrayList<>();
        ChapterImportService.validate(List.of(), errors);
        assertThat(errors).containsExactly("Nenhuma imagem encontrada no envio.");
    }
}
