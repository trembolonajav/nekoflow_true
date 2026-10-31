package com.nekoflow.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.auth.AccountStatus;
import com.nekoflow.auth.NekoPrincipal;
import com.nekoflow.auth.Role;
import com.nekoflow.auth.UserRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Protocolo 06 em PostgreSQL isolado: fontes autorizadas, acesso, manifesto de leitura,
 * importação editorial e integração com o progresso do Protocolo 05.
 */
@SpringBootTest(properties = {"nekoflow.demo.enabled=false", "spring.mail.host=localhost",
        "nekoflow.media.storage-dir=target/test-media"})
@AutoConfigureMockMvc
@Testcontainers
class MediaIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired MockMvc mvc;
    @Autowired JdbcClient jdbc;
    @Autowired UserRepository users;
    @Autowired ObjectMapper json;

    RequestPostProcessor user;
    RequestPostProcessor editor;
    UUID videoProvider;
    UUID imageProvider;
    long animeId;
    UUID season;
    UUID ep1, ep2, ep3;
    UUID hls1, external1;
    long mangaId;
    UUID edition;
    UUID ch1, ch2, ch3;

    @BeforeEach
    void fixture() {
        String tag = Long.toString(ThreadLocalRandom.current().nextLong(1_000_000, 9_999_999));
        long userId = users.create("midia_u_" + tag, "u" + tag + "@teste.local", "Usuário", "x", Role.USER,
                AccountStatus.ACTIVE);
        long editorId = users.create("midia_e_" + tag, "e" + tag + "@teste.local", "Editor", "x", Role.EDITOR,
                AccountStatus.ACTIVE);
        user = as(userId, Role.USER);
        editor = as(editorId, Role.EDITOR);

        videoProvider = provider("VIDEO_" + tag, "VIDEO", "video.example.test");
        imageProvider = provider("IMAGE_" + tag, "IMAGE", "img.example.test");

        animeId = 810_000_000L + ThreadLocalRandom.current().nextLong(1, 9_999_999);
        work(animeId, "anime", "ANIMATION", "SERIES", "midia-anime-" + tag);
        season = UUID.randomUUID();
        jdbc.sql("INSERT INTO season (id, work_id, title, sort_position, visibility) VALUES (?, ?, 'T1', 1, 'PUBLISHED')")
                .params(season, animeId).update();
        ep1 = episode(1);
        ep2 = episode(2);
        ep3 = episode(3);
        hls1 = source(ep1, "HLS", "https://video.example.test/ep1/index.m3u8", videoProvider, 10, true);
        external1 = source(ep1, "EXTERNAL_LINK", "https://site.example.test/ep1", null, 20, false);
        source(ep3, "MP4", "https://video.example.test/ep3.mp4", videoProvider, 10, true); // ep2 sem fonte

        mangaId = animeId + 1;
        work(mangaId, "manga", "READING", "COMIC", "midia-manga-" + tag);
        edition = UUID.randomUUID();
        jdbc.sql("INSERT INTO work_edition (id, work_id, name, language, reading_mode, reading_direction) VALUES (?, ?, 'PT', 'pt-BR', 'PAGED', 'RTL')")
                .params(edition, mangaId).update();
        ch1 = chapter(1);
        ch2 = chapter(2);
        ch3 = chapter(3);
    }

    // ---- reprodução ------------------------------------------------------------------------

    @Test
    void playbackListsAuthorizedSourcesWithRealCapabilities() throws Exception {
        JsonNode p = body(mvc.perform(get("/api/v1/episodes/" + ep1 + "/playback")).andExpect(status().isOk()));
        assertThat(p.path("availability").asText()).isEqualTo("AVAILABLE");
        assertThat(p.path("sources")).hasSize(2);
        JsonNode hls = p.path("sources").get(0);
        assertThat(hls.path("type").asText()).isEqualTo("HLS");
        assertThat(hls.path("capabilities").path("progress").asBoolean()).isTrue();
        assertThat(hls.path("capabilities").path("qualitySelection").asBoolean()).isTrue();
        assertThat(hls.has("url")).as("URL de reprodução só sai pelo acesso").isFalse();
        JsonNode ext = p.path("sources").get(1);
        assertThat(ext.path("playsInPlayer").asBoolean()).isFalse();
        assertThat(ext.path("capabilities").path("progress").asBoolean()).isFalse();
        assertThat(ext.path("externalUrl").asText()).isEqualTo("https://site.example.test/ep1");
        // Próximo episódio = próximo DISPONÍVEL (o 2 não tem fonte e é pulado).
        assertThat(p.path("next").path("id").asText()).isEqualTo(ep3.toString());
        assertThat(p.path("previous").isNull()).isTrue();

        mvc.perform(get("/api/v1/episodes/" + ep1 + "/playback/sources/" + hls1 + "/access"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").value("https://video.example.test/ep1/index.m3u8"))
                .andExpect(jsonPath("$.expiresAt").exists());
        mvc.perform(get("/api/v1/episodes/" + ep1 + "/playback/sources/" + external1 + "/access"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("SOURCE_NOT_PLAYABLE"));
    }

    @Test
    void unauthorizedHostDisabledProviderAndClosedWindowAreNeverDelivered() throws Exception {
        UUID rogue = source(ep2, "HLS", "https://evil.example.test/x.m3u8", videoProvider, 1, true);
        UUID insecure = source(ep2, "MP4", "http://video.example.test/x.mp4", videoProvider, 2, true);
        JsonNode p = body(mvc.perform(get("/api/v1/episodes/" + ep2 + "/playback")));
        assertThat(p.path("sources")).isEmpty();
        assertThat(p.path("availability").asText()).isEqualTo("UNAVAILABLE");
        mvc.perform(get("/api/v1/episodes/" + ep2 + "/playback/sources/" + rogue + "/access"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/episodes/" + ep2 + "/playback/sources/" + insecure + "/access"))
                .andExpect(status().isNotFound());

        jdbc.sql("UPDATE episode_source SET available_until = now() - interval '1 minute', available_from = now() - interval '1 day' WHERE id = ?")
                .param(hls1).update();
        mvc.perform(get("/api/v1/episodes/" + ep1 + "/playback/sources/" + hls1 + "/access"))
                .andExpect(status().isNotFound());

        jdbc.sql("UPDATE media_provider SET enabled = FALSE WHERE id = ?").param(videoProvider).update();
        JsonNode p3 = body(mvc.perform(get("/api/v1/episodes/" + ep3 + "/playback")));
        assertThat(p3.path("sources")).isEmpty();
    }

    @Test
    void hiddenWorkHasNoPlaybackOrManifest() throws Exception {
        jdbc.sql("UPDATE work SET visibility = 'HIDDEN' WHERE id IN (?, ?)").params(animeId, mangaId).update();
        mvc.perform(get("/api/v1/episodes/" + ep1 + "/playback")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/chapters/" + ch1 + "/editions/" + edition + "/manifest"))
                .andExpect(status().isNotFound());
    }

    @Test
    void playerProgressIsAcceptedOnlyFromSourcesWithTelemetry() throws Exception {
        UUID session = UUID.randomUUID();
        mvc.perform(put("/api/v1/me/progress/episodes/" + ep1).with(user).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"positionMs":30000,"durationMs":1440000,"watchedDeltaMs":15000,"completed":false,
                                 "sessionId":"%s","sequence":1,"expectedVersion":0,"eventId":"%s"}"""
                                .formatted(session, UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.positionMs").value(30000));

        // Só o link externo: o servidor recusa progresso de reprodução.
        jdbc.sql("UPDATE episode_source SET enabled = FALSE WHERE id = ?").param(hls1).update();
        mvc.perform(put("/api/v1/me/progress/episodes/" + ep1).with(user).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"positionMs":60000,"durationMs":1440000,"watchedDeltaMs":15000,"completed":false,
                                 "sessionId":"%s","sequence":2,"expectedVersion":1,"eventId":"%s"}"""
                                .formatted(session, UUID.randomUUID())))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PROGRESS_NOT_VERIFIABLE"));
    }

    // ---- leitura -----------------------------------------------------------------------------

    @Test
    void manifestServesOnlyThePublishedBatchInEditorialOrder() throws Exception {
        UUID imp = providerImport(ch1, "PUBLISHED", 3);
        providerImport(ch2, "READY", 2); // pronto, mas não publicado
        JsonNode m = body(mvc.perform(get("/api/v1/chapters/" + ch1 + "/editions/" + edition + "/manifest"))
                .andExpect(status().isOk()));
        assertThat(m.path("readingMode").asText()).isEqualTo("PAGED");
        assertThat(m.path("direction").asText()).isEqualTo("RTL");
        assertThat(m.path("pages")).hasSize(3);
        assertThat(m.path("pages").get(0).path("position").asInt()).isEqualTo(1);
        assertThat(m.path("pages").get(0).path("width").asInt()).isEqualTo(800);
        assertThat(m.path("pages").get(2).path("url").asText()).isEqualTo("https://img.example.test/" + imp + "/3.webp");
        // Capítulo 2 não está publicado: não é oferecido como próximo; o 3 tem fonte externa.
        assertThat(m.path("next").path("id").asText()).isEqualTo(ch3.toString());

        mvc.perform(get("/api/v1/chapters/" + ch2 + "/editions/" + edition + "/manifest"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CHAPTER_PAGES_UNAVAILABLE"));

        // Página com host fora do provedor não é entregue.
        jdbc.sql("UPDATE chapter_page SET source_url = 'https://outro.example.test/x.webp' WHERE import_id = ? AND position = 2")
                .param(imp).update();
        JsonNode m2 = body(mvc.perform(get("/api/v1/chapters/" + ch1 + "/editions/" + edition + "/manifest")));
        assertThat(m2.path("pages")).hasSize(2);
    }

    @Test
    void readerProgressUsesPageAndEditionOnceChapterHasPages() throws Exception {
        providerImport(ch1, "PUBLISHED", 3);
        mvc.perform(put("/api/v1/me/progress/chapters/" + ch1).with(user).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"editionId":"%s","pageIndex":2,"percentComplete":66.6,"completed":false,
                                 "sessionId":"%s","sequence":1,"expectedVersion":0,"eventId":"%s"}"""
                                .formatted(edition, UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pageIndex").value(2));
        JsonNode cont = body(mvc.perform(get("/api/v1/me/continue-reading").with(user)));
        assertThat(cont.get(0).path("resume").path("unitHref").asText())
                .isEqualTo("/leitor?chapter=" + ch1 + "&edition=" + edition);
    }

    // ---- importação editorial -----------------------------------------------------------------

    @Test
    void zipImportValidatesOrdersAndPublishesOnlyAfterReview() throws Exception {
        byte[] zip = zip(new String[]{"10.png", "2.jpg", "1.png", "__MACOSX/._1.png", ".DS_Store"},
                new byte[][]{png(600, 900), jpeg(600, 900), png(1200, 900), new byte[]{1, 2}, new byte[]{3}});
        JsonNode imp = body(mvc.perform(multipart("/api/admin/catalog/media/chapters/" + ch2 + "/imports")
                        .file(new MockMultipartFile("files", "cap2.zip", "application/zip", zip))
                        .param("editionId", edition.toString()).with(editor).with(csrf()))
                .andExpect(status().isCreated()));
        assertThat(imp.path("status").asText()).isEqualTo("READY");
        assertThat(imp.path("report").path("files").toString()).isEqualTo("[\"1.png\",\"2.jpg\",\"10.png\"]");
        assertThat(imp.path("pages").get(0).path("type").asText()).isEqualTo("DOUBLE"); // 1200x900
        assertThat(imp.path("pages").get(1).path("url").asText()).startsWith("/media/chapters/").contains("md5=");

        // Pronto não é público.
        mvc.perform(get("/api/v1/chapters/" + ch2 + "/editions/" + edition + "/manifest")).andExpect(status().isNotFound());

        String id = imp.path("id").asText();
        mvc.perform(post("/api/admin/catalog/media/imports/" + id + "/publish").with(user).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/catalog/media/imports/" + id + "/publish").with(editor).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PUBLISHED"));
        JsonNode m = body(mvc.perform(get("/api/v1/chapters/" + ch2 + "/editions/" + edition + "/manifest")));
        assertThat(m.path("pages")).hasSize(3);

        // Um novo lote substitui o anterior somente quando publicado.
        JsonNode second = body(mvc.perform(multipart("/api/admin/catalog/media/chapters/" + ch2 + "/imports")
                .file(new MockMultipartFile("files", "a.png", "image/png", png(500, 800)))
                .param("editionId", edition.toString()).with(editor).with(csrf())));
        assertThat(body(mvc.perform(get("/api/v1/chapters/" + ch2 + "/editions/" + edition + "/manifest")))
                .path("pages")).hasSize(3);
        mvc.perform(post("/api/admin/catalog/media/imports/" + second.path("id").asText() + "/publish")
                .with(editor).with(csrf())).andExpect(status().isOk());
        assertThat(body(mvc.perform(get("/api/v1/chapters/" + ch2 + "/editions/" + edition + "/manifest")))
                .path("pages")).hasSize(1);
        assertThat(jdbc.sql("SELECT status FROM chapter_import WHERE id = ?").param(UUID.fromString(id))
                .query(String.class).single()).isEqualTo("REPLACED");
        // Lote publicado não é apagado.
        mvc.perform(delete("/api/admin/catalog/media/imports/" + second.path("id").asText()).with(editor).with(csrf()))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void disguisedExecutableAndTraversalFailTheWholeBatch() throws Exception {
        byte[] fakeImage = "MZ\u0090\u0000 este arquivo não é uma imagem, apenas finge ser".repeat(3).getBytes();
        JsonNode bad = body(mvc.perform(multipart("/api/admin/catalog/media/chapters/" + ch3 + "/imports")
                        .file(new MockMultipartFile("files", "01.jpg", "image/jpeg", png(500, 800)))
                        .file(new MockMultipartFile("files", "02.jpg", "image/jpeg", fakeImage))
                        .param("editionId", edition.toString()).with(editor).with(csrf()))
                .andExpect(status().isCreated()));
        assertThat(bad.path("status").asText()).isEqualTo("FAILED");
        assertThat(bad.path("pages")).isEmpty();
        assertThat(bad.path("report").path("errors").toString()).contains("02.jpg");
        mvc.perform(post("/api/admin/catalog/media/imports/" + bad.path("id").asText() + "/publish")
                        .with(editor).with(csrf()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("IMPORT_NOT_READY"));

        byte[] zip = zip(new String[]{"../../etc/passwd.png", "ok.png"}, new byte[][]{png(10, 10), png(500, 800)});
        JsonNode traversal = body(mvc.perform(multipart("/api/admin/catalog/media/chapters/" + ch3 + "/imports")
                .file(new MockMultipartFile("files", "x.zip", "application/zip", zip))
                .param("editionId", edition.toString()).with(editor).with(csrf())));
        assertThat(traversal.path("status").asText()).isEqualTo("FAILED");
        assertThat(traversal.path("report").path("errors").toString()).contains("caminho inválido");

        mvc.perform(multipart("/api/admin/catalog/media/chapters/" + ch3 + "/imports")
                        .file(new MockMultipartFile("files", "a.png", "image/png", png(10, 10)))
                        .param("editionId", edition.toString()).with(user).with(csrf()))
                .andExpect(status().isForbidden());
    }

    // ---- relato de problema -----------------------------------------------------------------

    @Test
    void issueReportsRequireAccountAndValidTarget() throws Exception {
        String ok = """
                {"episodeId":"%s","sourceId":"%s","category":"VIDEO_NOT_LOADING","detail":"Tela preta","positionMs":1000}"""
                .formatted(ep1, hls1);
        mvc.perform(post("/api/v1/me/media-issues").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(ok))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/me/media-issues").with(user).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(ok)).andExpect(status().isCreated());
        mvc.perform(post("/api/v1/me/media-issues").with(user).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"episodeId\":\"%s\",\"category\":\"HACK\"}".formatted(ep1)))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/me/media-issues").with(user).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"episodeId\":\"%s\",\"sourceId\":\"%s\",\"category\":\"OTHER\"}"
                                .formatted(ep2, hls1)))
                .andExpect(status().isBadRequest());
    }

    // ---- utilidades -----------------------------------------------------------------------------

    private UUID provider(String code, String kind, String host) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO media_provider (id, code, name, media_kind, allowed_hosts, terms_note) VALUES (?, ?, ?, ?, ARRAY[?], 'teste')")
                .params(id, code, code, kind, host).update();
        return id;
    }

    private void work(long id, String kind, String family, String format, String slug) {
        jdbc.sql("""
                INSERT INTO work (id, public_id, kind, title, slug, media_family, work_format, visibility)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'PUBLISHED')""")
                .params(id, UUID.randomUUID(), kind, "Mídia " + slug, slug, family, format).update();
    }

    private UUID episode(int n) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO episode (id, season_id, display_number, sort_position, duration_seconds) VALUES (?, ?, ?, ?, 1440)")
                .params(id, season, String.valueOf(n), n).update();
        return id;
    }

    private UUID source(UUID ep, String type, String url, UUID provider, int priority, boolean telemetry) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO episode_source (id, episode_id, source_type, source_url, provider, provenance, provider_id,
                                            priority, reports_progress, label)
                VALUES (?, ?, ?, ?, 'Teste', 'teste', ?, ?, ?, ?)""")
                .params(id, ep, type, url, provider, priority, telemetry, type + " de teste").update();
        return id;
    }

    private UUID chapter(int n) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO chapter (id, edition_id, display_number, sort_position) VALUES (?, ?, ?, ?)")
                .params(id, edition, String.valueOf(n), n).update();
        if (n == 3) {
            jdbc.sql("""
                    INSERT INTO chapter_source (chapter_id, source_type, source_url, provider, provenance)
                    VALUES (?, 'EXTERNAL_LINK', 'https://site.example.test/cap3', 'Teste', 'teste')""")
                    .param(id).update();
        }
        return id;
    }

    private UUID providerImport(UUID chapter, String status, int pages) {
        UUID id = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO chapter_import (id, chapter_id, edition_id, origin, status, page_count, provenance)
                VALUES (?, ?, ?, 'PROVIDER', ?, ?, 'teste')""")
                .params(id, chapter, edition, status, pages).update();
        for (int i = 1; i <= pages; i++) {
            jdbc.sql("""
                    INSERT INTO chapter_page (import_id, position, storage, provider_id, source_url, width, height, mime_type)
                    VALUES (?, ?, 'PROVIDER', ?, ?, 800, 1200, 'image/webp')""")
                    .params(id, i, imageProvider, "https://img.example.test/" + id + "/" + i + ".webp").update();
        }
        return id;
    }

    private RequestPostProcessor as(long id, Role role) {
        NekoPrincipal p = new NekoPrincipal(id, "u" + id, "x", role);
        return authentication(new UsernamePasswordAuthenticationToken(p, null, p.getAuthorities()));
    }

    private JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    static byte[] png(int w, int h) throws Exception {
        return image(w, h, "png");
    }

    static byte[] jpeg(int w, int h) throws Exception {
        return image(w, h, "jpg");
    }

    private static byte[] image(int w, int h, String format) throws Exception {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, format, out);
        return out.toByteArray();
    }

    private static byte[] zip(String[] names, byte[][] contents) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(out)) {
            for (int i = 0; i < names.length; i++) {
                z.putNextEntry(new ZipEntry(names[i]));
                z.write(contents[i]);
                z.closeEntry();
            }
        }
        return out.toByteArray();
    }
}
