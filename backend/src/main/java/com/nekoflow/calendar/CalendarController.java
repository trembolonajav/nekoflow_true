package com.nekoflow.calendar;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nekoflow.admin.ReleaseService;
import com.nekoflow.common.Times;
import com.nekoflow.content.ContentDocumentRepository;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Calendário = programação editorial + publicações confirmadas. Uma publicação só
 * aparece depois de efetivamente publicada, e nunca duplica uma entrada já existente.
 */
@RestController
public class CalendarController {

    private final ContentDocumentRepository documents;
    private final ReleaseService releases;

    public CalendarController(ContentDocumentRepository documents, ReleaseService releases) {
        this.documents = documents;
        this.releases = releases;
    }

    @GetMapping("/api/calendar")
    public JsonNode calendar() {
        JsonNode doc = documents.findById("calendario")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)).getPayload().deepCopy();
        ArrayNode anime = (ArrayNode) doc.get("anime");
        ArrayNode reads = (ArrayNode) doc.get("reads");
        Set<String> seen = new HashSet<>();
        for (ArrayNode list : new ArrayNode[]{anime, reads}) {
            list.forEach(x -> seen.add(x.path("id").asText() + "|" + x.path("unit").asText()));
        }
        for (Map<String, Object> r : releases.recent(50)) {
            String unitLabel = (String) r.get("unitLabel");
            if (!seen.add(r.get("workId") + "|" + unitLabel)) {
                continue;
            }
            ZonedDateTime at = ((OffsetDateTime) r.get("publishedAt")).atZoneSameInstant(Times.ZONE);
            boolean anim = "anime".equals(r.get("kind")) || "filme".equals(r.get("kind"));
            ObjectNode n = (anim ? anime : reads).addObject();
            n.put("id", (Long) r.get("workId"));
            n.put("kind", (String) r.get("kind"));
            n.put("title", (String) r.get("title"));
            n.put("cover", (String) r.get("cover"));
            n.put("unit", unitLabel);
            n.put("day", at.getDayOfMonth());
            n.put("date", at.toLocalDate().toString());
            n.put("time", String.format("%02d:%02d", at.getHour(), at.getMinute()));
            n.put("ts", at.toEpochSecond());
            n.put("pop", 0);
            n.put("published", true);
            if (anim) {
                n.put("premiere", false);
                n.put("final", false);
            } else {
                n.put("webtoon", false);
                n.put("estimated", false);
            }
        }
        return doc;
    }
}
