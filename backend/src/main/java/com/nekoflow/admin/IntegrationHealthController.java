package com.nekoflow.admin;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Testes administrativos, somente leitura, das integrações externas. */
@RestController
@RequestMapping("/api/admin/integrations")
public class IntegrationHealthController {
    private final IntegrationHealthService health;
    public IntegrationHealthController(IntegrationHealthService health) { this.health = health; }

    @GetMapping public List<Map<String, Object>> list() { return health.list(); }

    @PostMapping("/{code}/test")
    public Map<String, Object> test(@PathVariable String code) {
        try { return health.test(code); }
        catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, error.getMessage(), error);
        }
    }

    @PostMapping("/test-all") public List<Map<String, Object>> testAll() { return health.testAll(); }
}
