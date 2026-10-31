package com.nekoflow.catalog;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/catalog/imports")
public class CatalogImportController {
    private final CatalogImportService imports;
    private final JdbcClient jdbc;
    public CatalogImportController(CatalogImportService imports, JdbcClient jdbc){this.imports=imports;this.jdbc=jdbc;}

    @PostMapping public Map<String,Object> run(@RequestParam(defaultValue="true") boolean dryRun){return imports.run(dryRun);}
    @GetMapping public List<Map<String,Object>> runs(){return jdbc.sql("SELECT id,source,dry_run,status,created_count,updated_count,unchanged_count,rejected_count,started_at,finished_at FROM catalog_import_run ORDER BY started_at DESC LIMIT 30").query((rs,n)->{Map<String,Object> m=new java.util.LinkedHashMap<>();for(int i=1;i<=rs.getMetaData().getColumnCount();i++)m.put(rs.getMetaData().getColumnLabel(i),rs.getObject(i));return m;}).list();}
}
