package com.nekoflow.progress;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.auth.AccountStatus;
import com.nekoflow.auth.NekoPrincipal;
import com.nekoflow.auth.Role;
import com.nekoflow.auth.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Protocolo 05 ponta a ponta contra um PostgreSQL descartável (Flyway aplica V1–V8).
 * Cada teste cria os próprios usuários e obras de teste, explicitamente identificados.
 */
@SpringBootTest(properties = {"nekoflow.demo.enabled=false", "spring.mail.host=localhost"})
@AutoConfigureMockMvc
@Testcontainers
class LibraryProgressIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired MockMvc mvc;
    @Autowired JdbcClient jdbc;
    @Autowired UserRepository users;
    @Autowired ObjectMapper json;
    @Autowired ProgressService progressService;

    RequestPostProcessor userA;
    RequestPostProcessor userB;
    long userAId;
    long animeId;
    UUID animePublic;
    UUID ep1, ep2, ep3;
    UUID externalEpisode;
    long readingId;
    UUID editionPt, editionEn;
    UUID ch1, ch2, ch1En;

    // ---- dados de teste ---------------------------------------------------------------

    @BeforeEach
    void fixture() {
        String tag = Long.toString(ThreadLocalRandom.current().nextLong(1_000_000, 9_999_999));
        userAId = users.create("teste_a_" + tag, "a" + tag + "@teste.local", "Teste A", "x", Role.USER,
                AccountStatus.ACTIVE);
        long userBId = users.create("teste_b_" + tag, "b" + tag + "@teste.local", "Teste B", "x", Role.USER,
                AccountStatus.ACTIVE);
        userA = as(userAId);
        userB = as(userBId);

        animeId = 800_000_000L + ThreadLocalRandom.current().nextLong(1, 99_999_999);
        animePublic = work(animeId, "anime", "ANIMATION", "SERIES", "teste-anime-" + tag, "PUBLISHED");
        UUID season = season(animeId, 1);
        ep1 = episode(season, 1, true);
        ep2 = episode(season, 2, true);
        ep3 = episode(season, 3, false); // ainda não lançado: sem fonte

        long externalWork = animeId + 1;
        work(externalWork, "anime", "ANIMATION", "SERIES", "teste-externo-" + tag, "PUBLISHED");
        externalEpisode = UUID.randomUUID();
        jdbc.sql("INSERT INTO episode (id, season_id, display_number, sort_position, duration_seconds) VALUES (?, ?, '1', 1, 1440)")
                .params(externalEpisode, season(externalWork, 1)).update();
        jdbc.sql("""
                INSERT INTO episode_source (episode_id, source_type, source_url, provider, provenance)
                VALUES (?, 'EXTERNAL_LINK', 'https://example.test/ep1', 'Teste', 'teste automatizado')""")
                .param(externalEpisode).update();

        readingId = animeId + 2;
        work(readingId, "manga", "READING", "COMIC", "teste-manga-" + tag, "PUBLISHED");
        editionPt = edition(readingId, "Português", "pt-BR");
        editionEn = edition(readingId, "English", "en");
        ch1 = chapter(editionPt, 1);
        ch2 = chapter(editionPt, 2);
        ch1En = chapter(editionEn, 1);
    }

    private UUID work(long id, String kind, String family, String format, String slug, String visibility) {
        UUID publicId = UUID.randomUUID();
        jdbc.sql("""
                INSERT INTO work (id, public_id, kind, title, slug, media_family, work_format, visibility)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""")
                .params(id, publicId, kind, "Obra de teste " + slug, slug, family, format, visibility).update();
        return publicId;
    }

    private UUID season(long workId, int n) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO season (id, work_id, title, sort_position, visibility) VALUES (?, ?, ?, ?, 'PUBLISHED')")
                .params(id, workId, "Temporada " + n, n).update();
        return id;
    }

    /** Episódios de 60 s com fonte de teste que informa progresso (player com telemetria). */
    private UUID episode(UUID season, int n, boolean withSource) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO episode (id, season_id, display_number, sort_position, duration_seconds) VALUES (?, ?, ?, ?, 60)")
                .params(id, season, String.valueOf(n), n).update();
        if (withSource) {
            jdbc.sql("""
                    INSERT INTO episode_source (episode_id, source_type, source_url, provider, embed_allowed, provenance, reports_progress)
                    VALUES (?, 'EMBED', ?, 'Teste', TRUE, 'fonte de teste automatizado', TRUE)""")
                    .params(id, "https://example.test/ep" + n).update();
        }
        return id;
    }

    private UUID edition(long workId, String name, String lang) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO work_edition (id, work_id, name, language) VALUES (?, ?, ?, ?)")
                .params(id, workId, name, lang).update();
        return id;
    }

    private UUID chapter(UUID edition, int n) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO chapter (id, edition_id, display_number, sort_position) VALUES (?, ?, ?, ?)")
                .params(id, edition, String.valueOf(n), n).update();
        jdbc.sql("""
                INSERT INTO chapter_source (chapter_id, source_type, source_url, provider, embed_allowed, provenance, reports_progress)
                VALUES (?, 'EMBED', ?, 'Teste', TRUE, 'fonte de teste automatizado', TRUE)""")
                .params(id, "https://example.test/" + edition + "/" + n).update();
        return id;
    }

    private RequestPostProcessor as(long id) {
        NekoPrincipal p = new NekoPrincipal(id, "u" + id, "x", Role.USER);
        return authentication(new UsernamePasswordAuthenticationToken(p, null, p.getAuthorities()));
    }

    // ---- utilidades HTTP -------------------------------------------------------------------

    private ResultActions putJson(String path, RequestPostProcessor who, String body) throws Exception {
        return mvc.perform(put(path).with(who).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private String episodeJson(long position, long watchedDelta, boolean completed, UUID session, long seq,
                               long expected) {
        return """
                {"positionMs":%d,"durationMs":60000,"watchedDeltaMs":%d,"completed":%s,
                 "sessionId":"%s","sequence":%d,"expectedVersion":%d,"eventId":"%s"}"""
                .formatted(position, watchedDelta, completed, session, seq, expected, UUID.randomUUID());
    }

    private ResultActions saveEp(UUID ep, RequestPostProcessor who, long position, long watched, boolean done,
                                 UUID session, long seq, long expected) throws Exception {
        return putJson("/api/v1/me/progress/episodes/" + ep, who,
                episodeJson(position, watched, done, session, seq, expected));
    }

    // ---- biblioteca ------------------------------------------------------------------------

    @Test
    void libraryKeepsOneEntryPerWorkAndIndependentFlags() throws Exception {
        putJson("/api/v1/me/library/" + animePublic, userA, "{\"status\":\"planejado\"}").andExpect(status().isOk());
        putJson("/api/v1/me/library/" + animePublic, userA, "{\"status\":\"pausado\"}")
                .andExpect(jsonPath("$.status").value("pausado"));
        mvc.perform(put("/api/v1/me/favorites/" + animePublic).with(userA).with(csrf()))
                .andExpect(jsonPath("$.favorite").value(true))
                .andExpect(jsonPath("$.status").value("pausado"));
        mvc.perform(put("/api/v1/me/follows/" + animeId).with(userA).with(csrf())) // id numérico legado também vale
                .andExpect(jsonPath("$.follow").value(true))
                .andExpect(jsonPath("$.favorite").value(true));

        assertThat(jdbc.sql("SELECT count(*) FROM library_entry WHERE user_id = ? AND work_id = ?")
                .params(userAId, animeId).query(Long.class).single()).isEqualTo(1);
        mvc.perform(get("/api/v1/me/library?status=pausado").with(userA))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].favorite").value(true));
        putJson("/api/v1/me/library/" + animePublic, userA, "{\"status\":\"inexistente\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_STATUS"));
    }

    @Test
    void removingFromLibraryKeepsProgressAndHistory() throws Exception {
        UUID s = UUID.randomUUID();
        saveEp(ep1, userA, 10_000, 10_000, false, s, 1, 0).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/me/library/" + animePublic).with(userA).with(csrf()))
                .andExpect(jsonPath("$.inLibrary").value(false));
        mvc.perform(get("/api/v1/me/progress/episodes/" + ep1).with(userA)).andExpect(jsonPath("$.positionMs").value(10_000));
        mvc.perform(get("/api/v1/me/history?workId=" + animePublic).with(userA)).andExpect(jsonPath("$.totalElements").value(1));
    }

    // ---- progresso de vídeo e sincronização -------------------------------------------------

    @Test
    void anotherDeviceResumesServerConfirmedPosition() throws Exception {
        UUID desktop = UUID.randomUUID();
        JsonNode saved = body(saveEp(ep1, userA, 20_000, 20_000, false, desktop, 1, 0).andExpect(status().isOk()));
        assertThat(saved.get("version").asLong()).isEqualTo(1);
        assertThat(saved.get("accepted").asBoolean()).isTrue();

        // celular: consulta e continua a partir da versão confirmada
        mvc.perform(get("/api/v1/me/progress/episodes/" + ep1).with(userA))
                .andExpect(jsonPath("$.positionMs").value(20_000)).andExpect(jsonPath("$.version").value(1));
        saveEp(ep1, userA, 30_000, 10_000, false, UUID.randomUUID(), 1, 1).andExpect(jsonPath("$.version").value(2));

        // o computador envia uma atualização baseada na versão antiga: não sobrescreve
        JsonNode conflict = body(saveEp(ep1, userA, 25_000, 5_000, false, desktop, 2, 1).andExpect(status().isConflict()));
        assertThat(conflict.get("code").asText()).isEqualTo("PROGRESS_VERSION_CONFLICT");
        assertThat(conflict.at("/current/positionMs").asLong()).isEqualTo(30_000);
        assertThat(conflict.at("/current/version").asLong()).isEqualTo(2);
    }

    @Test
    void repeatedEventIsIdempotentAndOldSequenceIsRejected() throws Exception {
        UUID s = UUID.randomUUID();
        String first = episodeJson(10_000, 10_000, false, s, 5, 0);
        putJson("/api/v1/me/progress/episodes/" + ep1, userA, first).andExpect(jsonPath("$.version").value(1));
        putJson("/api/v1/me/progress/episodes/" + ep1, userA, first)
                .andExpect(status().isOk()).andExpect(jsonPath("$.duplicate").value(true))
                .andExpect(jsonPath("$.version").value(1));
        saveEp(ep1, userA, 12_000, 2_000, false, s, 4, 1)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STALE_PROGRESS_EVENT"));
    }

    @Test
    void intentionalRewindIsKept() throws Exception {
        UUID s = UUID.randomUUID();
        saveEp(ep1, userA, 50_000, 50_000, false, s, 1, 0).andExpect(status().isOk());
        saveEp(ep1, userA, 7_000, 0, false, s, 2, 1).andExpect(jsonPath("$.positionMs").value(7_000));
    }

    @Test
    void seekingToTheEndIsNotAWatchedEpisode() throws Exception {
        saveEp(ep1, userA, 59_000, 0, true, UUID.randomUUID(), 1, 0)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PLAYBACK_COMPLETION_UNVERIFIED"));
        saveEp(ep1, userA, 58_000, 40_000, true, UUID.randomUUID(), 1, 0)
                .andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.completionSource").value("PLAYBACK"));
    }

    @Test
    void invalidDurationsAndPositionsAreRejected() throws Exception {
        putJson("/api/v1/me/progress/episodes/" + ep1, userA, """
                {"positionMs":1000,"durationMs":99999999,"sessionId":"%s","sequence":1,"expectedVersion":0,"eventId":"%s"}"""
                .formatted(UUID.randomUUID(), UUID.randomUUID()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_DURATION"));
        saveEp(ep1, userA, -5, 0, false, UUID.randomUUID(), 1, 0)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_POSITION"));
        putJson("/api/v1/me/progress/episodes/" + ep1, userA, "{\"positionMs\":1000}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SYNC_FIELDS_REQUIRED"));
    }

    @Test
    void externalSourceAcceptsOnlyManualCompletion() throws Exception {
        putJson("/api/v1/me/progress/episodes/" + externalEpisode, userA, """
                {"positionMs":1000,"durationMs":1440000,"sessionId":"%s","sequence":1,"expectedVersion":0,"eventId":"%s"}"""
                .formatted(UUID.randomUUID(), UUID.randomUUID()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("PROGRESS_NOT_VERIFIABLE"));
        mvc.perform(put("/api/v1/me/progress/episodes/" + externalEpisode + "/completion").with(userA).with(csrf()))
                .andExpect(jsonPath("$.completed").value(true))
                .andExpect(jsonPath("$.completionSource").value("MANUAL"))
                .andExpect(jsonPath("$.watchedMs").value(0));
        mvc.perform(delete("/api/v1/me/progress/episodes/" + externalEpisode + "/completion").with(userA).with(csrf()))
                .andExpect(jsonPath("$.completed").value(false));
        JsonNode history = body(mvc.perform(get("/api/v1/me/history").with(userA)));
        List<String> types = new ArrayList<>();
        history.get("items").forEach(i -> types.add(i.get("activityType").asText()));
        assertThat(types).containsExactly("REOPENED", "MANUAL_COMPLETED");
        assertThat(history.at("/items/1/source").asText()).isEqualTo("MANUAL");
    }

    // ---- continuar assistindo ----------------------------------------------------------------

    @Test
    void continueWatchingOffersNextThenUpToDateWithoutCompletingTheWork() throws Exception {
        UUID s = UUID.randomUUID();
        saveEp(ep1, userA, 30_000, 30_000, false, s, 1, 0).andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/continue-watching").with(userA))
                .andExpect(jsonPath("$[0].resume.state").value("RESUME"))
                .andExpect(jsonPath("$[0].resume.unitId").value(ep1.toString()))
                .andExpect(jsonPath("$[0].resume.positionMs").value(30_000));

        mvc.perform(put("/api/v1/me/progress/episodes/" + ep1 + "/completion").with(userA).with(csrf()));
        mvc.perform(get("/api/v1/me/continue-watching").with(userA))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].resume.state").value("NEXT"))
                .andExpect(jsonPath("$[0].resume.unitId").value(ep2.toString()));

        // episódio 2 visto até o fim; o 3 existe mas ainda não tem fonte → "Em dia"
        saveEp(ep2, userA, 59_000, 50_000, true, UUID.randomUUID(), 1, 0).andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/continue-watching").with(userA)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/v1/me/library/" + animePublic).with(userA))
                .andExpect(jsonPath("$.status").value("andamento"))
                .andExpect(jsonPath("$.resume.state").value("UP_TO_DATE"));
    }

    @Test
    void progressRespectsExplicitPausedStatus() throws Exception {
        putJson("/api/v1/me/library/" + animePublic, userA, "{\"status\":\"pausado\"}");
        saveEp(ep1, userA, 10_000, 10_000, false, UUID.randomUUID(), 1, 0).andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/library/" + animePublic).with(userA)).andExpect(jsonPath("$.status").value("pausado"));
        mvc.perform(get("/api/v1/me/continue-watching").with(userA)).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void startingFromPlannedMovesToInProgress() throws Exception {
        putJson("/api/v1/me/library/" + animePublic, userA, "{\"status\":\"planejado\"}");
        saveEp(ep1, userA, 10_000, 10_000, false, UUID.randomUUID(), 1, 0);
        mvc.perform(get("/api/v1/me/library/" + animePublic).with(userA)).andExpect(jsonPath("$.status").value("andamento"));
    }

    // ---- leitura por edição -----------------------------------------------------------------------

    @Test
    void readingProgressIsStoredPerEditionWithStableReference() throws Exception {
        UUID s = UUID.randomUUID();
        putJson("/api/v1/me/progress/chapters/" + ch1, userA, """
                {"editionId":"%s","segmentKey":"seg-13","segmentOffset":0.42,"percentComplete":68,
                 "sessionId":"%s","sequence":1,"expectedVersion":0,"eventId":"%s"}"""
                .formatted(editionPt, s, UUID.randomUUID()))
                .andExpect(jsonPath("$.segmentKey").value("seg-13"))
                .andExpect(jsonPath("$.version").value(1));
        mvc.perform(get("/api/v1/me/progress/chapters/" + ch1 + "?editionId=" + editionPt).with(userA))
                .andExpect(jsonPath("$.segmentOffset").value(0.42));
        // o mesmo capítulo em outra edição não herda a posição
        mvc.perform(get("/api/v1/me/progress/chapters/" + ch1En + "?editionId=" + editionEn).with(userA))
                .andExpect(jsonPath("$.version").value(0));
        // capítulo não pertence à edição informada
        mvc.perform(get("/api/v1/me/progress/chapters/" + ch1 + "?editionId=" + editionEn).with(userA))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/progress/chapters/" + ch1).with(userA)).andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/me/continue-reading").with(userA))
                .andExpect(jsonPath("$[0].resume.state").value("RESUME"))
                .andExpect(jsonPath("$[0].resume.segmentKey").value("seg-13"));
        mvc.perform(put("/api/v1/me/progress/chapters/" + ch1 + "/completion?editionId=" + editionPt).with(userA).with(csrf()))
                .andExpect(jsonPath("$.completed").value(true));
        mvc.perform(get("/api/v1/me/continue-reading").with(userA))
                .andExpect(jsonPath("$[0].resume.state").value("NEXT"))
                .andExpect(jsonPath("$[0].resume.unitId").value(ch2.toString()))
                .andExpect(jsonPath("$[0].resume.editionId").value(editionPt.toString()));
    }

    // ---- histórico ---------------------------------------------------------------------------------

    @Test
    void historyIsSeparateFromProgress() throws Exception {
        UUID s = UUID.randomUUID();
        saveEp(ep1, userA, 10_000, 10_000, false, s, 1, 0);
        saveEp(ep1, userA, 20_000, 5_000, false, s, 2, 1); // mesma sessão: não gera "retomado"
        saveEp(ep1, userA, 25_000, 5_000, false, UUID.randomUUID(), 1, 2); // nova sessão: "retomado"
        JsonNode history = body(mvc.perform(get("/api/v1/me/history?media=anime").with(userA)));
        assertThat(history.get("totalElements").asLong()).isEqualTo(2);
        assertThat(history.at("/items/0/activityType").asText()).isEqualTo("RESUMED");
        long id = history.at("/items/0/id").asLong();

        mvc.perform(delete("/api/v1/me/history/" + id).with(userA).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/v1/me/progress/episodes/" + ep1).with(userA)).andExpect(jsonPath("$.positionMs").value(25_000));

        mvc.perform(delete("/api/v1/me/progress/episodes/" + ep1).with(userA).with(csrf()))
                .andExpect(jsonPath("$.version").value(0));
        mvc.perform(get("/api/v1/me/history").with(userA)).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/v1/me/history?media=leitura").with(userA)).andExpect(jsonPath("$.totalElements").value(0));
    }

    // ---- isolamento, autenticação e entradas inválidas ----------------------------------------

    @Test
    void usersCannotSeeOrChangeEachOthersRecords() throws Exception {
        saveEp(ep1, userA, 10_000, 10_000, false, UUID.randomUUID(), 1, 0);
        putJson("/api/v1/me/library/" + animePublic, userA, "{\"status\":\"andamento\"}");
        long historyId = body(mvc.perform(get("/api/v1/me/history").with(userA))).at("/items/0/id").asLong();

        mvc.perform(get("/api/v1/me/progress/episodes/" + ep1).with(userB)).andExpect(jsonPath("$.version").value(0));
        mvc.perform(get("/api/v1/me/library").with(userB)).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(get("/api/v1/me/continue-watching").with(userB)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(delete("/api/v1/me/history/" + historyId).with(userB).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/me/history").with(userA)).andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void authenticationCsrfAndInvalidIds() throws Exception {
        mvc.perform(get("/api/v1/me/library")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/v1/me/library/" + animePublic).with(userA)
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"planejado\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/me/progress/episodes/nao-e-uuid").with(userA))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        mvc.perform(get("/api/v1/me/progress/episodes/" + UUID.randomUUID()).with(userA)).andExpect(status().isNotFound());
        putJson("/api/v1/me/library/" + UUID.randomUUID(), userA, "{\"status\":\"planejado\"}").andExpect(status().isNotFound());
        putJson("/api/v1/me/library/nao-e-uuid", userA, "{\"status\":\"planejado\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_WORK_ID"));
        mvc.perform(get("/api/v1/me/library?size=1000").with(userA)).andExpect(status().isBadRequest());
    }

    @Test
    void hiddenWorksDoNotAcceptNewProgress() throws Exception {
        jdbc.sql("UPDATE work SET visibility = 'HIDDEN' WHERE id = ?").param(animeId).update();
        saveEp(ep1, userA, 10_000, 10_000, false, UUID.randomUUID(), 1, 0).andExpect(status().isNotFound());
        putJson("/api/v1/me/library/" + animePublic, userA, "{\"status\":\"planejado\"}").andExpect(status().isNotFound());
    }

    @Test
    void legacyNumericProgressIsDisabled() throws Exception {
        putJson("/api/me/progress/" + animeId + "/1", userA, "{\"pct\":50}")
                .andExpect(status().isGone()).andExpect(jsonPath("$.code").value("LEGACY_PROGRESS_DISABLED"));
    }

    @Test
    void simultaneousSavesFromTwoDevicesAcceptExactlyOne() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            long position = 10_000 + i * 1_000;
            tasks.add(() -> {
                start.await();
                try {
                    progressService.saveEpisode(userAId, ep1, new ProgressService.EpisodeUpdate(position, 60_000L,
                            1_000L, false, UUID.randomUUID(), 1L, 0L, UUID.randomUUID()));
                    return "ok";
                } catch (ProgressException e) {
                    return e.code();
                }
            });
        }
        List<Future<String>> results = new ArrayList<>();
        for (Callable<String> t : tasks) {
            results.add(pool.submit(t));
        }
        start.countDown();
        List<String> outcomes = new ArrayList<>();
        for (Future<String> f : results) {
            outcomes.add(f.get());
        }
        pool.shutdown();
        assertThat(outcomes).containsExactlyInAnyOrder("ok", "PROGRESS_VERSION_CONFLICT");
        assertThat(jdbc.sql("SELECT version FROM episode_progress WHERE user_id = ? AND episode_id = ?")
                .params(userAId, ep1).query(Long.class).single()).isEqualTo(1);
    }
}
