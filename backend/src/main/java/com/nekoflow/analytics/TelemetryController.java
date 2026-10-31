package com.nekoflow.analytics;

import com.nekoflow.auth.CurrentUser;
import com.nekoflow.auth.NekoPrincipal;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Batimentos e eventos de audiência do site (painel administrativo · Visão geral e Audiência). */
@RestController
@RequestMapping("/api/v1/telemetry")
public class TelemetryController {

    private final TelemetryService telemetry;

    public TelemetryController(TelemetryService telemetry) {
        this.telemetry = telemetry;
    }

    public record Event(String type, String work, String episodeId, String chapterId, Map<String, Object> data) {}

    public record Heartbeat(String state, String path, boolean visible, String work, String episodeId, String chapterId) {}

    public record Batch(String sessionId, Heartbeat heartbeat, List<Event> events) {}

    @PostMapping
    public ResponseEntity<Void> collect(@RequestBody Batch batch,
                                        @RequestHeader(value = "User-Agent", required = false) String agent) {
        NekoPrincipal user = CurrentUser.orNull();
        telemetry.collect(batch, user == null ? null : user.id(), agent);
        return ResponseEntity.noContent().build();
    }
}
