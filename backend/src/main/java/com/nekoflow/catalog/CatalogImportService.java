package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Importador controlado do documento legado do Explorar. Nunca remove dados. */
@Service
public class CatalogImportService {
    private final WorkRepository works;
    private final ObjectMapper mapper;
    private final JdbcClient jdbc;

    public CatalogImportService(WorkRepository works, ObjectMapper mapper, JdbcClient jdbc) {
        this.works = works;
        this.mapper = mapper;
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Object> run(boolean dryRun) {
        UUID runId = UUID.randomUUID();
        int created = 0, unchanged = 0, rejected = 0;
        jdbc.sql("INSERT INTO catalog_import_run(id,source,dry_run,status) VALUES (?,'seed/explorar.json',?,'RUNNING')")
                .params(runId, dryRun).update();
        try (InputStream in = new ClassPathResource("seed/explorar.json").getInputStream()) {
            JsonNode root = mapper.readTree(in);
            for (JsonNode x : root) {
                long id = x.path("id").asLong(0);
                String kind = x.path("kind").asText("");
                String title = x.path("title").asText("").trim();
                String result;
                if (id <= 0 || title.isBlank() || !java.util.List.of("anime", "filme", "manga", "manhwa").contains(kind)) {
                    rejected++;
                    result = "REJECTED";
                } else if (works.exists(id)) {
                    unchanged++;
                    result = "UNCHANGED";
                } else {
                    created++;
                    result = "CREATED";
                    if (!dryRun) works.insertIfAbsent(toWork(x));
                }
                jdbc.sql("INSERT INTO catalog_import_item(run_id,source_key,result,detail) VALUES (?,?,?,?)")
                        .params(runId, Long.toString(id), result, title).update();
            }
            jdbc.sql("UPDATE catalog_import_run SET status='COMPLETED',created_count=?,unchanged_count=?,rejected_count=?,finished_at=now() WHERE id=?")
                    .params(created, unchanged, rejected, runId).update();
        } catch (Exception error) {
            jdbc.sql("UPDATE catalog_import_run SET status='FAILED',finished_at=now() WHERE id=?").param(runId).update();
            throw new IllegalStateException("Falha ao importar catálogo legado", error);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("runId", runId); out.put("dryRun", dryRun); out.put("created", created);
        out.put("updated", 0); out.put("unchanged", unchanged); out.put("rejected", rejected);
        return out;
    }

    private static Work toWork(JsonNode x) {
        String kind = x.path("kind").asText();
        Integer total = integer(x, switch (kind) { case "anime" -> "eps"; case "filme" -> null; default -> "ch"; });
        if ("filme".equals(kind)) total = 1;
        return new Work(x.path("id").asLong(), kind, x.path("title").asText(), text(x,"alt"),
                text(x,"cover"), text(x,"banner"), x.path("webtoon").asBoolean(), integer(x,"year"),
                total, null, text(x,"status"), integer(x,"pop"));
    }
    private static String text(JsonNode x,String key){JsonNode v=x.get(key);return v==null||v.isNull()?null:v.asText();}
    private static Integer integer(JsonNode x,String key){if(key==null)return null;JsonNode v=x.get(key);return v==null||v.isNull()||!v.canConvertToInt()?null:v.asInt();}
}
