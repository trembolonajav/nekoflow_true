package com.nekoflow.admin;

import com.nekoflow.auth.CurrentUser;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Dados reais do painel administrativo (Admin.dc.html). */
@RestController
@RequestMapping("/api/admin/panel")
public class AdminPanelController {

    private final AdminPanelService panel;

    public AdminPanelController(AdminPanelService panel) {
        this.panel = panel;
    }

    @GetMapping
    public Map<String, Object> panel(@RequestParam(defaultValue = "hoje") String period) {
        if (!Set.of("hoje", "7d", "30d").contains(period)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Período inválido");
        return panel.panel(period);
    }

    @GetMapping("/users/{id}/events")
    public List<Map<String, Object>> userEvents(@PathVariable long id) {
        return panel.userEvents(id);
    }

    public record Task(String title, String detail, String priority, String kind, String key) {}

    @PostMapping("/tasks")
    public Map<String, Object> create(@RequestBody Task body) {
        if (body.title() == null || body.title().isBlank() || body.title().length() > 300) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Título obrigatório");
        }
        boolean auto = body.key() != null && body.key().startsWith("search:");
        long id = panel.createTask(body.title().strip(), body.detail(), body.priority(), auto ? "Catálogo" : nzKind(body.kind()),
                auto ? "auto" : "manual", auto ? body.key() : null, CurrentUser.id());
        return Map.of("id", id);
    }

    public record Resolve(String key) {}

    @PostMapping("/tasks/resolve")
    public Map<String, Object> resolve(@RequestBody Resolve body) {
        if (body.key() == null || body.key().isBlank() || body.key().length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pendência inválida");
        }
        panel.resolve(body.key(), CurrentUser.id());
        return Map.of("ok", true);
    }

    private static String nzKind(String kind) {
        return kind == null || kind.isBlank() ? "Manual" : kind;
    }
}
