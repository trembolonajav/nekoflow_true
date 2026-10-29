package com.nekoflow.media;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Saúde dos servidores no painel (Integrações). MODERATOR+. */
@RestController
@RequestMapping("/api/admin/servers/health")
public class ServerHealthController {

    private final ServerHealthService health;

    public ServerHealthController(ServerHealthService health) {
        this.health = health;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return health.panel();
    }

    @PostMapping("/refresh")
    public List<Map<String, Object>> refresh() {
        health.refresh();
        return health.panel();
    }
}
