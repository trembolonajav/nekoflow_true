package com.nekoflow.catalog;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.admin.AuditLog;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Funde a obra duplicada (source) na obra principal (target), somando em vez de sobrescrever:
 * temporadas/edições novas mudam de obra; as que já existem recebem os episódios/capítulos que
 * faltam, e nos que já existem entram as fontes (servidores/espelhos) da duplicata.
 *
 * Fusão completa: tudo da duplicata foi aproveitado. Ela fica oculta com merged_into_id, os IDs
 * de provedor passam para a principal (as próximas sincronizações já caem nela) e o endereço
 * antigo vira apelido. Fusão parcial: só as temporadas/edições escolhidas mudam; as duas obras
 * continuam existindo e o par não volta para a fila.
 */
@Service
public class WorkMergeService {

    private final JdbcClient jdbc;
    private final WorkIdentityService identity;
    private final TransactionTemplate tx;
    private final AuditLog audit;
    private final ObjectMapper json;

    public WorkMergeService(JdbcClient jdbc, WorkIdentityService identity, TransactionTemplate tx, AuditLog audit,
                            ObjectMapper json) {
        this.jdbc = jdbc;
        this.identity = identity;
        this.tx = tx;
        this.audit = audit;
        this.json = json;
    }

    /** units: id da temporada/edição da duplicata → id da temporada/edição da principal, "NEW" ou "SKIP". */
    public record Request(long targetId, long sourceId, Map<String, String> units) {}

    public Map<String, Object> merge(Request r, Long actor) {
        return tx.execute(st -> doMerge(r, actor));
    }

    /** Funde todos os grupos de confiança alta com a proposta padrão. */
    public Map<String, Object> mergeConfident(Long actor) {
        int merged = 0;
        List<String> failed = new ArrayList<>();
        for (Object o : (List<?>) identity.candidates().get("clusters")) {
            Map<?, ?> c = (Map<?, ?>) o;
            if (!"alta".equals(c.get("confidence"))) continue;
            long target = ((Number) ((Map<?, ?>) c.get("target")).get("id")).longValue();
            for (Object s : (List<?>) c.get("sources")) {
                Map<?, ?> source = (Map<?, ?>) s;
                try {
                    merge(new Request(target, ((Number) source.get("id")).longValue(), Map.of()), actor);
                    merged++;
                } catch (RuntimeException e) {
                    failed.add(source.get("title") + ": " + e.getMessage());
                }
            }
        }
        return Map.of("merged", merged, "failed", failed);
    }

    public void dismiss(long a, long b, Long actor) {
        if (a == b) throw new IllegalArgumentException("Escolha duas obras diferentes");
        jdbc.sql("""
                INSERT INTO work_identity_decision(low_work_id, high_work_id, decision, decided_by)
                VALUES (?, ?, 'DISTINCT', ?) ON CONFLICT DO NOTHING""")
                .params(Math.min(a, b), Math.max(a, b), actor).update();
        if (actor != null) audit.record(actor, "OBRAS_DISTINTAS", "#" + a + " × #" + b, "Não são a mesma obra");
    }

    public List<Map<String, Object>> history() {
        return jdbc.sql("""
                SELECT m.id, m.mode, m.summary, m.merged_at, t.id AS target_id, t.title AS target_title,
                       s.id AS source_id, s.title AS source_title, u.username
                FROM work_merge m JOIN work t ON t.id=m.target_work_id JOIN work s ON s.id=m.source_work_id
                LEFT JOIN app_user u ON u.id=m.merged_by ORDER BY m.merged_at DESC LIMIT 30""")
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("mode", rs.getString("mode"));
                    m.put("summary", rs.getString("summary"));
                    m.put("at", rs.getTimestamp("merged_at").toInstant().toString());
                    m.put("targetId", rs.getLong("target_id"));
                    m.put("target", rs.getString("target_title"));
                    m.put("sourceId", rs.getLong("source_id"));
                    m.put("source", rs.getString("source_title"));
                    m.put("by", rs.getString("username"));
                    return m;
                }).list();
    }

    // ------------------------------------------------------------------------------------------

    private Map<String, Object> doMerge(Request r, Long actor) {
        long t = r.targetId(), s = r.sourceId();
        if (t == s) throw new IllegalArgumentException("Escolha duas obras diferentes");
        List<Map<String, Object>> rows = jdbc.sql("""
                SELECT id, media_family, merged_into_id, title, alt_titles FROM work WHERE id IN (?, ?) ORDER BY id FOR UPDATE""")
                .params(t, s).query().listOfRows();
        if (rows.size() != 2) throw new IllegalArgumentException("Obra não encontrada");
        Map<String, Object> target = rows.stream().filter(x -> ((Number) x.get("id")).longValue() == t).findFirst().orElseThrow();
        Map<String, Object> source = rows.stream().filter(x -> ((Number) x.get("id")).longValue() == s).findFirst().orElseThrow();
        if (!target.get("media_family").equals(source.get("media_family"))) {
            throw new IllegalArgumentException("Anime e leitura não se fundem");
        }
        if (target.get("merged_into_id") != null || source.get("merged_into_id") != null) {
            throw new IllegalArgumentException("Uma das obras já foi fundida");
        }
        boolean reading = "READING".equals(source.get("media_family"));

        Map<Long, WorkIdentityService.WorkStats> stats = identity.stats(Set.of(s, t));
        Set<UUID> sourceUnits = new LinkedHashSet<>(stats.get(s).units().stream().map(WorkIdentityService.Unit::id).toList());
        Set<UUID> targetUnits = new LinkedHashSet<>(stats.get(t).units().stream().map(WorkIdentityService.Unit::id).toList());
        Map<UUID, String> plan = new LinkedHashMap<>();
        identity.proposal(s, t).steps().forEach(step ->
                plan.put(step.unit(), WorkIdentityService.MAP.equals(step.action()) ? step.target().toString() : step.action()));
        if (r.units() != null) {
            r.units().forEach((k, v) -> {
                UUID unit = UUID.fromString(k);
                if (!sourceUnits.contains(unit)) throw new IllegalArgumentException("Temporada/edição não pertence à duplicata");
                if (!WorkIdentityService.NEW.equals(v) && !WorkIdentityService.SKIP.equals(v)
                        && !targetUnits.contains(UUID.fromString(v))) {
                    throw new IllegalArgumentException("Destino não pertence à obra principal");
                }
                plan.put(unit, v);
            });
        }
        boolean full = stats.get(s).units().stream()
                .filter(u -> u.count() > 0)
                .allMatch(u -> plan.containsKey(u.id()) && !WorkIdentityService.SKIP.equals(plan.get(u.id())));

        long mergeId = jdbc.sql("""
                INSERT INTO work_merge(target_work_id, source_work_id, mode, plan, summary, merged_by)
                VALUES (?, ?, ?, '{}', '{}', ?) RETURNING id""")
                .params(t, s, full ? "FULL" : "PARTIAL", actor).query(Long.class).single();
        Map<String, Integer> sum = new LinkedHashMap<>();
        for (var e : plan.entrySet()) {
            String v = e.getValue();
            if (WorkIdentityService.SKIP.equals(v)) continue;
            UUID into = WorkIdentityService.NEW.equals(v) ? null : UUID.fromString(v);
            if (reading) edition(mergeId, t, s, e.getKey(), into, sum);
            else season(mergeId, t, s, e.getKey(), into, sum);
        }
        if (reading) chapterChildren(mergeId, sum);
        else episodeChildren(mergeId, sum);

        List<Map<String, Object>> movedIds = jdbc.sql(
                "SELECT provider, external_id FROM external_identifier WHERE work_id=? ORDER BY provider").param(s).query().listOfRows();
        if (full) workLevel(t, s, target, source, sum);
        else {
            // As duas continuam existindo: o ID forte em comum fica só na principal.
            add(sum, "providerIds", jdbc.sql("""
                    DELETE FROM external_identifier x WHERE x.work_id=:s AND x.provider IN ('ANILIST','MAL')
                      AND EXISTS (SELECT 1 FROM external_identifier y WHERE y.work_id=:t AND y.provider=x.provider
                                  AND y.external_id=x.external_id)""").param("s", s).param("t", t).update());
            jdbc.sql("""
                    INSERT INTO work_identity_decision(low_work_id, high_work_id, decision, decided_by)
                    VALUES (?, ?, 'DISTINCT', ?) ON CONFLICT DO NOTHING""").params(Math.min(s, t), Math.max(s, t), actor).update();
            recount(s, reading);
        }
        recount(t, reading);

        Map<String, Object> planJson = new LinkedHashMap<>();
        planJson.put("units", plan.entrySet().stream().collect(LinkedHashMap::new,
                (m, e) -> m.put(e.getKey().toString(), e.getValue()), LinkedHashMap::putAll));
        planJson.put("sourceIdentifiers", movedIds);
        jdbc.sql("UPDATE work_merge SET plan=?, summary=? WHERE id=?")
                .params(write(planJson), write(sum), mergeId).update();
        if (actor != null) {
            audit.record(actor, full ? "FUNDIR_OBRA" : "FUNDIR_PARTE",
                    source.get("title") + " (#" + s + ") → " + target.get("title") + " (#" + t + ")", write(sum));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mergeId", mergeId);
        out.put("mode", full ? "FULL" : "PARTIAL");
        out.put("summary", sum);
        return out;
    }

    // ---------------------------------------------------------------- anime

    private void season(long merge, long t, long s, UUID ss, UUID ts, Map<String, Integer> sum) {
        if (ts == null) {
            BigDecimal pos = jdbc.sql("SELECT sort_position FROM season WHERE id=?").param(ss).query(BigDecimal.class).single();
            boolean taken = jdbc.sql("SELECT count(*) FROM season WHERE work_id=? AND sort_position=?")
                    .params(t, pos).query(Long.class).single() > 0;
            if (taken) {
                pos = jdbc.sql("SELECT COALESCE(max(sort_position),0)+1 FROM season WHERE work_id=?").param(t)
                        .query(BigDecimal.class).single();
            }
            jdbc.sql("UPDATE season SET work_id=?, sort_position=? WHERE id=?").params(t, pos, ss).update();
            jdbc.sql("UPDATE hianime_episode_binding SET work_id=? WHERE episode_id IN (SELECT id FROM episode WHERE season_id=?)")
                    .params(t, ss).update();
            moveCandidates(t, ss, ss);
            add(sum, "seasonsMoved", 1);
            add(sum, "episodesMoved", jdbc.sql("SELECT count(*) FROM episode WHERE season_id=?").param(ss).query(Long.class).single().intValue());
            return;
        }
        add(sum, "episodesMoved", jdbc.sql("""
                UPDATE episode e SET season_id=:ts WHERE e.season_id=:ss
                  AND NOT EXISTS (SELECT 1 FROM episode x WHERE x.season_id=:ts AND x.sort_position=e.sort_position)""")
                .param("ts", ts).param("ss", ss).update());
        add(sum, "episodesPaired", jdbc.sql("""
                INSERT INTO merged_unit(old_id, new_id, unit_type, merge_id)
                SELECT e.id, x.id, 'EPISODE', :m FROM episode e
                JOIN episode x ON x.season_id=:ts AND x.sort_position=e.sort_position
                WHERE e.season_id=:ss ON CONFLICT (old_id) DO NOTHING""")
                .param("m", merge).param("ts", ts).param("ss", ss).update());
        jdbc.sql("UPDATE hianime_episode_binding SET work_id=? WHERE work_id=? AND episode_id IN (SELECT id FROM episode WHERE season_id=?)")
                .params(t, s, ts).update();
        jdbc.sql("UPDATE hianime_sync_work SET season_id=? WHERE season_id=?").params(ts, ss).update();
        moveCandidates(t, ss, ts);
        jdbc.sql("""
                UPDATE season SET visibility='PUBLISHED' WHERE id=:ts
                  AND EXISTS (SELECT 1 FROM season WHERE id=:ss AND visibility='PUBLISHED')""")
                .param("ts", ts).param("ss", ss).update();
        jdbc.sql("UPDATE season SET visibility='DRAFT' WHERE id=?").param(ss).update();
        add(sum, "seasonsMerged", 1);
    }

    private void moveCandidates(long t, UUID fromSeason, UUID toSeason) {
        jdbc.sql("""
                UPDATE hianime_sync_candidate c SET work_id=:t, season_id=:to WHERE c.season_id=:from
                  AND NOT EXISTS (SELECT 1 FROM hianime_sync_candidate x WHERE x.work_id=:t AND x.id<>c.id
                                  AND x.external_anime_id=c.external_anime_id AND x.external_episode_id=c.external_episode_id)""")
                .param("t", t).param("from", fromSeason).param("to", toSeason).update();
        jdbc.sql("""
                UPDATE hianime_sync_run_item i SET work_id=c.work_id FROM hianime_sync_candidate c
                WHERE i.candidate_id=c.id AND i.work_id<>c.work_id""").update();
    }

    /** Nos episódios que já existiam na principal entram as fontes, traduções e progresso da duplicata. */
    private void episodeChildren(long merge, Map<String, Integer> sum) {
        String mu = " FROM merged_unit mu WHERE mu.merge_id=:m AND mu.unit_type='EPISODE' ";
        add(sum, "sourcesAdded", jdbc.sql("UPDATE episode_source es SET episode_id=mu.new_id, updated_at=now()" + mu + """
                AND es.episode_id=mu.old_id AND NOT EXISTS (SELECT 1 FROM episode_source y WHERE y.episode_id=mu.new_id
                    AND y.source_type=es.source_type AND y.source_url=es.source_url)""").param("m", merge).update());
        jdbc.sql("UPDATE episode_translation x SET episode_id=mu.new_id" + mu + """
                AND x.episode_id=mu.old_id AND NOT EXISTS (SELECT 1 FROM episode_translation y
                    WHERE y.episode_id=mu.new_id AND y.language=x.language)""").param("m", merge).update();
        jdbc.sql("UPDATE episode_marker x SET episode_id=mu.new_id" + mu + """
                AND x.episode_id=mu.old_id AND NOT EXISTS (SELECT 1 FROM episode_marker y
                    WHERE y.episode_id=mu.new_id AND y.kind=x.kind)""").param("m", merge).update();
        add(sum, "progressMoved", jdbc.sql("UPDATE episode_progress x SET episode_id=mu.new_id" + mu + """
                AND x.episode_id=mu.old_id AND NOT EXISTS (SELECT 1 FROM episode_progress y
                    WHERE y.episode_id=mu.new_id AND y.user_id=x.user_id)""").param("m", merge).update());
        jdbc.sql("UPDATE hianime_episode_binding x SET episode_id=mu.new_id" + mu + """
                AND x.episode_id=mu.old_id AND NOT EXISTS (SELECT 1 FROM hianime_episode_binding y WHERE y.episode_id=mu.new_id)""")
                .param("m", merge).update();
        jdbc.sql("UPDATE activity_history x SET episode_id=mu.new_id" + mu + "AND x.episode_id=mu.old_id").param("m", merge).update();
        jdbc.sql("UPDATE media_issue_report x SET episode_id=mu.new_id" + mu + "AND x.episode_id=mu.old_id").param("m", merge).update();
        jdbc.sql("""
                UPDATE episode x SET title=COALESCE(x.title,e.title), synopsis=COALESCE(x.synopsis,e.synopsis),
                    thumbnail_url=COALESCE(x.thumbnail_url,e.thumbnail_url),
                    duration_seconds=COALESCE(x.duration_seconds,e.duration_seconds),
                    original_air_date=COALESCE(x.original_air_date,e.original_air_date),
                    source_page_url=COALESCE(x.source_page_url,e.source_page_url),
                    availability=CASE WHEN x.availability='UNAVAILABLE' THEN e.availability ELSE x.availability END
                FROM merged_unit mu JOIN episode e ON e.id=mu.old_id
                WHERE mu.merge_id=:m AND mu.unit_type='EPISODE' AND x.id=mu.new_id""").param("m", merge).update();
        jdbc.sql("UPDATE episode e SET availability='UNAVAILABLE'" + mu + """
                AND e.id=mu.old_id AND NOT EXISTS (SELECT 1 FROM episode_source y WHERE y.episode_id=e.id AND y.enabled)""")
                .param("m", merge).update();
    }

    // ---------------------------------------------------------------- leitura

    private void edition(long merge, long t, long s, UUID se, UUID te, Map<String, Integer> sum) {
        if (te == null) {
            jdbc.sql("""
                    UPDATE work_edition e SET work_id=:t,
                        name=CASE WHEN EXISTS (SELECT 1 FROM work_edition x WHERE x.work_id=:t AND x.name=e.name
                                               AND x.language=e.language) THEN left(e.name, 100) || ' · #' || :s ELSE e.name END
                    WHERE e.id=:se""").param("t", t).param("s", s).param("se", se).update();
            add(sum, "editionsMoved", 1);
            add(sum, "chaptersMoved", jdbc.sql("SELECT count(*) FROM chapter WHERE edition_id=?").param(se).query(Long.class).single().intValue());
            return;
        }
        // Capítulo que só a duplicata tem ganha um registro na edição principal; o progresso e as
        // importações apontam para (capítulo, edição) e são levados junto logo abaixo.
        add(sum, "chaptersAdded", jdbc.sql("""
                INSERT INTO chapter(edition_id, title, display_number, sort_position, availability, published_at)
                SELECT :te, c.title, c.display_number, c.sort_position, c.availability, c.published_at
                FROM chapter c WHERE c.edition_id=:se
                  AND NOT EXISTS (SELECT 1 FROM chapter x WHERE x.edition_id=:te AND x.sort_position=c.sort_position)""")
                .param("te", te).param("se", se).update());
        jdbc.sql("""
                INSERT INTO merged_unit(old_id, new_id, unit_type, merge_id)
                SELECT c.id, x.id, 'CHAPTER', :m FROM chapter c
                JOIN chapter x ON x.edition_id=:te AND x.sort_position=c.sort_position
                WHERE c.edition_id=:se ON CONFLICT (old_id) DO NOTHING""")
                .param("m", merge).param("te", te).param("se", se).update();
        jdbc.sql("UPDATE media_issue_report SET edition_id=? WHERE edition_id=? AND chapter_id IS NULL").params(te, se).update();
        add(sum, "editionsMerged", 1);
    }

    private void chapterChildren(long merge, Map<String, Integer> sum) {
        String mu = " FROM merged_unit mu JOIN chapter nc ON nc.id=mu.new_id WHERE mu.merge_id=:m AND mu.unit_type='CHAPTER' ";
        add(sum, "sourcesAdded", jdbc.sql("UPDATE chapter_source cs SET chapter_id=mu.new_id" + mu + """
                AND cs.chapter_id=mu.old_id AND NOT EXISTS (SELECT 1 FROM chapter_source y WHERE y.chapter_id=mu.new_id
                    AND y.source_type=cs.source_type AND y.source_url=cs.source_url)""").param("m", merge).update());
        add(sum, "progressMoved", jdbc.sql("UPDATE chapter_progress p SET chapter_id=mu.new_id, edition_id=nc.edition_id" + mu + """
                AND p.chapter_id=mu.old_id AND NOT EXISTS (SELECT 1 FROM chapter_progress y WHERE y.user_id=p.user_id
                    AND y.chapter_id=mu.new_id AND y.edition_id=nc.edition_id)""").param("m", merge).update());
        jdbc.sql("UPDATE chapter_import x SET chapter_id=mu.new_id, edition_id=nc.edition_id" + mu + "AND x.chapter_id=mu.old_id")
                .param("m", merge).update();
        jdbc.sql("UPDATE activity_history x SET chapter_id=mu.new_id, edition_id=nc.edition_id" + mu + "AND x.chapter_id=mu.old_id")
                .param("m", merge).update();
        jdbc.sql("UPDATE media_issue_report x SET chapter_id=mu.new_id, edition_id=nc.edition_id" + mu + "AND x.chapter_id=mu.old_id")
                .param("m", merge).update();
        jdbc.sql("""
                UPDATE chapter x SET title=COALESCE(x.title,c.title), published_at=COALESCE(x.published_at,c.published_at),
                    availability=CASE WHEN x.availability='UNAVAILABLE' THEN c.availability ELSE x.availability END
                FROM merged_unit mu JOIN chapter c ON c.id=mu.old_id
                WHERE mu.merge_id=:m AND mu.unit_type='CHAPTER' AND x.id=mu.new_id""").param("m", merge).update();
        jdbc.sql("""
                UPDATE chapter c SET availability='UNAVAILABLE' FROM merged_unit mu
                WHERE mu.merge_id=:m AND mu.unit_type='CHAPTER' AND c.id=mu.old_id
                  AND NOT EXISTS (SELECT 1 FROM chapter_source y WHERE y.chapter_id=c.id AND y.enabled)""")
                .param("m", merge).update();
    }

    // ---------------------------------------------------------------- obra

    private void workLevel(long t, long s, Map<String, Object> target, Map<String, Object> source, Map<String, Integer> sum) {
        // IDs de provedor passam para a principal: é por eles que as sincronizações acham a obra.
        jdbc.sql("""
                INSERT INTO external_identifier(work_id, provider, external_id)
                SELECT :t, provider, external_id FROM external_identifier WHERE work_id=:s ON CONFLICT DO NOTHING""")
                .param("t", t).param("s", s).update();
        add(sum, "providerIds", jdbc.sql("DELETE FROM external_identifier WHERE work_id=?").param(s).update());
        // Endereço antigo abre a principal.
        jdbc.sql("UPDATE work_slug_alias SET work_id=? WHERE work_id=?").params(t, s).update();
        jdbc.sql("""
                INSERT INTO work_slug_alias(media_family, slug, work_id)
                SELECT media_family, slug, :t FROM work WHERE id=:s ON CONFLICT DO NOTHING""").param("t", t).param("s", s).update();
        // Títulos da duplicata ficam como alternativos (busca continua achando pelos dois nomes).
        jdbc.sql("""
                UPDATE work_title g SET work_id=:t WHERE g.work_id=:s AND g.title_type<>'PRIMARY'
                  AND NOT EXISTS (SELECT 1 FROM work_title x WHERE x.work_id=:t AND x.title_norm=g.title_norm
                                  AND x.title_type=g.title_type)""").param("t", t).param("s", s).update();
        jdbc.sql("""
                UPDATE work_title g SET work_id=:t, title_type='ALIAS' WHERE g.work_id=:s AND g.title_type='PRIMARY'
                  AND NOT EXISTS (SELECT 1 FROM work_title x WHERE x.work_id=:t AND x.title_norm=g.title_norm AND x.title_type='ALIAS')""")
                .param("t", t).param("s", s).update();
        jdbc.sql("UPDATE work SET alt_titles=? WHERE id=?")
                .params(altTitles((String) target.get("alt_titles"), (String) source.get("title"), (String) source.get("alt_titles"),
                        (String) target.get("title")), t).update();
        move("work_genre", "genre_id=g.genre_id", t, s);
        move("work_tag", "tag_id=g.tag_id", t, s);
        move("franchise_work", "franchise_id=g.franchise_id", t, s);
        move("work_contributor", "person_id=g.person_id AND x.role=g.role", t, s);
        move("media_asset", "asset_type=g.asset_type AND x.url=g.url", t, s);
        move("work_translation", "language=g.language", t, s);
        move("character_translation", "anilist_character_id=g.anilist_character_id AND x.language=g.language", t, s);
        move("work_anilist_snapshot", "work_id=:t", t, s);
        move("hianime_sync_work", "work_id=:t", t, s);
        jdbc.sql("""
                UPDATE work_relation g SET source_work_id=:t WHERE g.source_work_id=:s AND g.target_work_id<>:t
                  AND NOT EXISTS (SELECT 1 FROM work_relation x WHERE x.source_work_id=:t AND x.target_work_id=g.target_work_id
                                  AND x.relation_type=g.relation_type)""").param("t", t).param("s", s).update();
        jdbc.sql("""
                UPDATE work_relation g SET target_work_id=:t WHERE g.target_work_id=:s AND g.source_work_id<>:t
                  AND NOT EXISTS (SELECT 1 FROM work_relation x WHERE x.target_work_id=:t AND x.source_work_id=g.source_work_id
                                  AND x.relation_type=g.relation_type)""").param("t", t).param("s", s).update();
        jdbc.sql("""
                UPDATE hianime_sync_candidate c SET work_id=:t WHERE c.work_id=:s
                  AND NOT EXISTS (SELECT 1 FROM hianime_sync_candidate x WHERE x.work_id=:t
                                  AND x.external_anime_id=c.external_anime_id AND x.external_episode_id=c.external_episode_id)""")
                .param("t", t).param("s", s).update();
        for (String table : List.of("hianime_episode_binding", "hianime_sync_run_item", "activity", "activity_history",
                "content_request", "catalog_import_item", "catalog_audit_event")) {
            jdbc.sql("UPDATE " + table + " SET work_id=? WHERE work_id=?").params(t, s).update();
        }
        move("release_event", "unit=g.unit", t, s);
        // Biblioteca, favoritos, seguindo e progresso antigo das pessoas vão para a principal.
        int users = move("library_entry", "user_id=g.user_id", t, s) + move("favorite", "user_id=g.user_id", t, s)
                + move("work_follow", "user_id=g.user_id", t, s);
        move("progress", "user_id=g.user_id AND x.unit=g.unit", t, s);
        add(sum, "usersMoved", users);
        jdbc.sql("""
                UPDATE work t SET cover=COALESCE(t.cover,s.cover), banner=COALESCE(t.banner,s.banner), year=COALESCE(t.year,s.year),
                    synopsis_short=COALESCE(t.synopsis_short,s.synopsis_short),
                    synopsis_source=CASE WHEN t.synopsis_full IS NULL THEN s.synopsis_source ELSE t.synopsis_source END,
                    synopsis_language=CASE WHEN t.synopsis_full IS NULL THEN s.synopsis_language ELSE t.synopsis_language END,
                    synopsis_full=COALESCE(t.synopsis_full,s.synopsis_full),
                    original_release_date=COALESCE(t.original_release_date,s.original_release_date),
                    airing_status=COALESCE(t.airing_status,s.airing_status), content_rating=COALESCE(t.content_rating,s.content_rating),
                    popularity=GREATEST(t.popularity,s.popularity),
                    total_units=GREATEST(COALESCE(t.total_units,0),COALESCE(s.total_units,0)), updated_at=now()
                FROM work s WHERE t.id=:t AND s.id=:s""").param("t", t).param("s", s).update();
        jdbc.sql("UPDATE work SET merged_into_id=? WHERE merged_into_id=?").params(t, s).update();
        jdbc.sql("UPDATE work SET visibility='HIDDEN', merged_into_id=?, updated_at=now() WHERE id=?").params(t, s).update();
    }

    /** Move linhas de source para target, exceto as que já existem na target (a target vence). */
    private int move(String table, String sameRow, long t, long s) {
        return jdbc.sql("UPDATE " + table + " g SET work_id=:t WHERE g.work_id=:s AND NOT EXISTS (SELECT 1 FROM " + table
                        + " x WHERE x.work_id=:t AND x." + sameRow + ")")
                .param("t", t).param("s", s).update();
    }

    private void recount(long id, boolean reading) {
        if (reading) {
            jdbc.sql("""
                    UPDATE work SET available_units=COALESCE((SELECT max(n) FROM (SELECT count(*) n FROM chapter c
                        JOIN work_edition e ON e.id=c.edition_id WHERE e.work_id=:id AND c.availability<>'UNAVAILABLE'
                        GROUP BY e.id) x),0), updated_at=now() WHERE id=:id""").param("id", id).update();
        } else {
            jdbc.sql("""
                    UPDATE work SET available_units=(SELECT count(*) FROM episode e JOIN season s ON s.id=e.season_id
                        WHERE s.work_id=:id AND s.visibility='PUBLISHED' AND e.availability<>'UNAVAILABLE'), updated_at=now()
                    WHERE id=:id""").param("id", id).update();
        }
        jdbc.sql("UPDATE work SET total_units=GREATEST(COALESCE(total_units,0),COALESCE(available_units,0)) WHERE id=?")
                .param(id).update();
    }

    static String altTitles(String targetAlt, String sourceTitle, String sourceAlt, String targetTitle) {
        Set<String> all = new LinkedHashSet<>();
        for (String v : new String[] {targetAlt, sourceTitle, sourceAlt}) {
            if (v == null) continue;
            Arrays.stream(v.split("\\s*\\|\\s*")).map(String::strip).filter(x -> !x.isEmpty()).forEach(all::add);
        }
        all.removeIf(x -> x.equalsIgnoreCase(targetTitle));
        String joined = String.join(" | ", all);
        return joined.length() > 4000 ? joined.substring(0, 4000) : joined;
    }

    private static void add(Map<String, Integer> sum, String key, int n) {
        if (n != 0) sum.merge(key, n, Integer::sum);
    }

    private String write(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
