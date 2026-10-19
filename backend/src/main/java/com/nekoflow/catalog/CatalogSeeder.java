package com.nekoflow.catalog;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Monta o catálogo único de obras a partir dos dados do design. O catálogo do
 * Explorar é a fonte principal; as demais telas só completam obras que faltam.
 */
@Component
@Order(2)
public class CatalogSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CatalogSeeder.class);

    private final WorkRepository works;
    private final ObjectMapper mapper;

    public CatalogSeeder(WorkRepository works, ObjectMapper mapper) {
        this.works = works;
        this.mapper = mapper;
    }

    @Override
    public void run(ApplicationArguments args) throws IOException {
        int added = 0;
        for (JsonNode x : read("explorar")) {
            added += put(new Work(x.get("id").asLong(), x.get("kind").asText(), x.get("title").asText(),
                    text(x, "alt"), text(x, "cover"), text(x, "banner"), x.path("webtoon").asBoolean(),
                    integer(x, "year"), switch (x.get("kind").asText()) {
                        case "anime" -> integer(x, "eps");
                        case "filme" -> 1;
                        default -> integer(x, "ch");
                    },
                    null, text(x, "status"), integer(x, "pop")));
        }

        JsonNode obra = read("obra");
        int eps = 0;
        for (JsonNode s : obra.get("seasons")) {
            eps += s.get("eps").size();
        }
        added += put(new Work(obra.get("id").asLong(), "anime", obra.get("title").asText(), joinAlt(obra.get("alt")),
                text(obra, "cover"), text(obra, "banner"), false, 2024, eps, eps, "Concluído", null));

        JsonNode lo = read("leitura-obra");
        added += put(new Work(lo.get("id").asLong(), "manhwa", lo.get("title").asText(), joinAlt(lo.get("alt")),
                text(lo, "cover"), text(lo, "banner"), true, 2018, 200, 200, "Concluído", null));

        // As duas páginas individuais definem os episódios/capítulos existentes (0–200 no manhwa).
        works.initUnits(lo.get("id").asLong(), 200, 200);

        JsonNode cal = read("calendario");
        for (String list : List.of("anime", "reads")) {
            for (JsonNode x : cal.get(list)) {
                added += put(new Work(x.get("id").asLong(), x.path("kind").asText("anime"), x.get("title").asText(),
                        "", text(x, "cover"), null, x.path("webtoon").asBoolean(), null, null, null, null,
                        integer(x, "pop")));
            }
        }

        for (JsonNode x : read("leituras")) {
            String kind = "Mangá".equals(x.path("type").asText()) ? "manga" : "manhwa";
            added += put(new Work(x.get("id").asLong(), kind, x.get("title").asText(), "", text(x, "cover"),
                    text(x, "banner"), x.path("webtoon").asBoolean(), null, integer(x, "ch"), null, null,
                    integer(x, "pop")));
        }

        JsonNode home = read("home");
        for (String list : List.of("hero", "season", "cont", "recent")) {
            for (JsonNode x : home.get(list)) {
                added += put(new Work(x.get("id").asLong(), "anime", x.get("title").asText(), "",
                        text(x, "cover") != null ? text(x, "cover") : text(x, "thumb"), text(x, "banner"), false,
                        null, null, null, null, null));
            }
        }
        log.info("Catálogo: {} obra(s) nova(s)", added);
    }

    private int put(Work w) {
        return works.insertIfAbsent(w) ? 1 : 0;
    }

    private JsonNode read(String key) throws IOException {
        try (InputStream in = new ClassPathResource("seed/" + key + ".json").getInputStream()) {
            return mapper.readTree(in);
        }
    }

    private static String joinAlt(JsonNode arr) {
        List<String> out = new ArrayList<>();
        if (arr != null) {
            arr.forEach(a -> out.add(a.asText()));
        }
        return String.join(" | ", out);
    }

    private static String text(JsonNode x, String f) {
        JsonNode v = x.get(f);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static Integer integer(JsonNode x, String f) {
        JsonNode v = x.get(f);
        return v == null || !v.canConvertToInt() || v.isNull() ? null : v.asInt();
    }
}
