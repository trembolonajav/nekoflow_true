package com.nekoflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Fusão de obras duplicadas contra um PostgreSQL descartável: soma, não sobrescreve. */
@SpringBootTest(properties = {"nekoflow.demo.enabled=false", "spring.mail.host=localhost"})
@Testcontainers
class WorkMergeIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired JdbcClient jdbc;
    @Autowired WorkIdentityService identity;
    @Autowired WorkMergeService merges;

    @Test
    void sameAniListAnimeIsMergedAddingServersInsteadOfOverwriting() {
        long main = 990001, dup = 990002;
        work(main, "anime", "ANIMATION", "TV", "Teste Fusao Atelier", "teste-fusao-atelier-990001");
        work(dup, "anime", "ANIMATION", "SERIES", "Teste Fusao Atelier", "witch-hat-teste");
        ext(main, "ANILIST", "990001");
        ext(dup, "ANILIST", "990001");
        ext(dup, "FIBANIME", "witch-hat-teste");
        UUID s1 = season(main, 1);
        UUID d1 = season(dup, 1);
        UUID e1 = episode(s1, 1), e2 = episode(s1, 2);
        UUID f1 = episode(d1, 1), f2 = episode(d1, 2), f3 = episode(d1, 3);
        source(e1, "https://hianime.test/1", "HiAnime API", "ja", "en");
        source(f1, "https://fib.test/1-dub", "FIB Anime", "pt-BR", null);
        source(f1, "https://fib.test/1-leg", "FIB Anime", "ja", "pt-BR");
        source(f2, "https://fib.test/2-leg", "FIB Anime", "ja", "pt-BR");
        source(f3, "https://fib.test/3-leg", "FIB Anime", "ja", "pt-BR");

        Map<?, ?> cluster = cluster(main);
        assertThat(cluster.get("confidence")).isEqualTo("alta");
        assertThat(((Map<?, ?>) cluster.get("target")).get("id")).isEqualTo(main);

        Map<String, Object> out = merges.merge(new WorkMergeService.Request(main, dup, Map.of()), null);
        assertThat(out.get("mode")).isEqualTo("FULL");

        // Episódio 1 tem agora os três servidores; o 3, que só a duplicata tinha, entrou na temporada.
        assertThat(count("SELECT count(*) FROM episode_source WHERE episode_id=?", e1)).isEqualTo(3);
        assertThat(count("SELECT count(*) FROM episode_source WHERE episode_id=?", e2)).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM episode WHERE season_id=?", s1)).isEqualTo(3);
        assertThat(jdbc.sql("SELECT season_id FROM episode WHERE id=?").param(f3).query(UUID.class).single()).isEqualTo(s1);
        // Duplicata oculta e apontando para a principal; IDs de provedor e endereço antigo vão junto.
        assertThat(jdbc.sql("SELECT visibility || ':' || merged_into_id FROM work WHERE id=?").param(dup).query(String.class).single())
                .isEqualTo("HIDDEN:" + main);
        assertThat(count("SELECT count(*) FROM external_identifier WHERE work_id=?", dup)).isZero();
        assertThat(count("SELECT count(*) FROM external_identifier WHERE work_id=? AND provider='FIBANIME'", main)).isEqualTo(1);
        assertThat(jdbc.sql("SELECT work_id FROM work_slug_alias WHERE slug='witch-hat-teste'").query(Long.class).single()).isEqualTo(main);
        assertThat(jdbc.sql("SELECT new_id FROM merged_unit WHERE old_id=?").param(f1).query(UUID.class).single()).isEqualTo(e1);
        assertThat(cluster(main)).isNull();
    }

    @Test
    void readingEditionsInOtherLanguagesJoinTheSameWork() {
        long main = 990011, dup = 990012;
        work(main, "manga", "READING", "COMIC", "Teste Leitura Fusao", "teste-leitura-fusao");
        work(dup, "manga", "READING", "COMIC", "Teste Leitura Fusao", "teste-leitura-fusao-ml");
        ext(main, "ANILIST", "990011");
        ext(dup, "ANILIST", "990011");
        UUID en = edition(main, "English — WeebCentral", "en");
        UUID pt = edition(dup, "Português — Manga Livre", "pt-BR");
        UUID enExtra = edition(dup, "English — Outra", "en");
        chapter(en, 1, "https://wc.test/1");
        chapter(pt, 1, "https://ml.test/1");
        chapter(enExtra, 1, "https://other.test/1");
        chapter(enExtra, 2, "https://other.test/2");

        merges.merge(new WorkMergeService.Request(main, dup, Map.of()), null);

        assertThat(jdbc.sql("SELECT work_id FROM work_edition WHERE id=?").param(pt).query(Long.class).single()).isEqualTo(main);
        // A edição em inglês da duplicata soma à que já existia: cap. 1 ganha um espelho, cap. 2 entra.
        UUID ch1 = jdbc.sql("SELECT id FROM chapter WHERE edition_id=? AND sort_position=1").param(en).query(UUID.class).single();
        assertThat(count("SELECT count(*) FROM chapter_source WHERE chapter_id=?", ch1)).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM chapter WHERE edition_id=?", en)).isEqualTo(2);
        assertThat(jdbc.sql("SELECT available_units FROM work WHERE id=?").param(main).query(Integer.class).single()).isEqualTo(2);
    }

    @Test
    void sameTitleWithDifferentAniListIdsIsNotADuplicate() {
        work(990021, "anime", "ANIMATION", "TV", "Teste Homonimo", "teste-homonimo-a");
        work(990022, "anime", "ANIMATION", "TV", "Teste Homonimo", "teste-homonimo-b");
        ext(990021, "ANILIST", "990021");
        ext(990022, "ANILIST", "990022");
        assertThat(cluster(990021)).isNull();
    }

    @Test
    void dismissedPairLeavesTheQueue() {
        work(990031, "anime", "ANIMATION", "TV", "Teste Dispensado", "teste-dispensado-a");
        work(990032, "anime", "ANIMATION", "TV", "Teste Dispensado", "teste-dispensado-b");
        assertThat(cluster(990031)).isNotNull();
        merges.dismiss(990032, 990031, null);
        assertThat(cluster(990031)).isNull();
    }

    @Test
    void languageCodesAreNormalizedWhateverTheSourceWrites() {
        work(990041, "anime", "ANIMATION", "TV", "Teste Idioma", "teste-idioma");
        UUID ep = episode(season(990041, 1), 1);
        source(ep, "https://fib.test/ja-jp", "FIB Anime", "ja-JP", "PT_br");
        source(ep, "https://other.test/es", "Outra", "es-MX", "en-US");
        assertThat(jdbc.sql("SELECT audio_language || '/' || language FROM episode_source WHERE episode_id=? ORDER BY source_url")
                .param(ep).query(String.class).list()).containsExactly("ja/pt-BR", "es-419/en");
    }

    // ------------------------------------------------------------------------------------------

    private Map<?, ?> cluster(long id) {
        for (Object o : (List<?>) identity.candidates().get("clusters")) {
            Map<?, ?> c = (Map<?, ?>) o;
            if (Set.of(String.valueOf(c.get("key")).split("-")).contains(String.valueOf(id))) return c;
        }
        return null;
    }

    private long count(String sql, Object arg) {
        return jdbc.sql(sql).param(arg).query(Long.class).single();
    }

    private void work(long id, String kind, String family, String format, String title, String slug) {
        jdbc.sql("""
                INSERT INTO work(id, kind, title, slug, media_family, work_format, visibility)
                VALUES (?, ?, ?, ?, ?, ?, 'PUBLISHED')""").params(id, kind, title, slug, family, format).update();
    }

    private void ext(long work, String provider, String id) {
        jdbc.sql("INSERT INTO external_identifier(work_id, provider, external_id) VALUES (?, ?, ?)").params(work, provider, id).update();
    }

    private UUID season(long work, int n) {
        return jdbc.sql("""
                INSERT INTO season(work_id, title, display_number, sort_position, visibility)
                VALUES (?, 'Temporada', ?, ?, 'PUBLISHED') RETURNING id""")
                .params(work, String.valueOf(n), BigDecimal.valueOf(n)).query(UUID.class).single();
    }

    private UUID episode(UUID season, int n) {
        return jdbc.sql("""
                INSERT INTO episode(season_id, display_number, sort_position, availability)
                VALUES (?, ?, ?, 'STREAM') RETURNING id""")
                .params(season, String.valueOf(n), BigDecimal.valueOf(n)).query(UUID.class).single();
    }

    private void source(UUID episode, String url, String provider, String audio, String subtitle) {
        jdbc.sql("""
                INSERT INTO episode_source(episode_id, source_type, source_url, provider, audio_language, language,
                                           embed_allowed, provenance)
                VALUES (?, 'EMBED', ?, ?, ?, ?, true, 'teste')""").params(episode, url, provider, audio, subtitle).update();
    }

    private UUID edition(long work, String name, String language) {
        return jdbc.sql("INSERT INTO work_edition(work_id, name, language) VALUES (?, ?, ?) RETURNING id")
                .params(work, name, language).query(UUID.class).single();
    }

    private void chapter(UUID edition, int n, String url) {
        UUID id = jdbc.sql("""
                INSERT INTO chapter(edition_id, display_number, sort_position, availability)
                VALUES (?, ?, ?, 'EXTERNAL_LINK') RETURNING id""")
                .params(edition, String.valueOf(n), BigDecimal.valueOf(n)).query(UUID.class).single();
        jdbc.sql("""
                INSERT INTO chapter_source(chapter_id, source_type, source_url, provider, embed_allowed, provenance)
                VALUES (?, 'EXTERNAL_LINK', ?, 'teste', false, 'teste')""").params(id, url).update();
    }
}
