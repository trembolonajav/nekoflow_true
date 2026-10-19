package com.nekoflow.demo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nekoflow.auth.Role;
import com.nekoflow.auth.UserRepository;
import com.nekoflow.catalog.Work;
import com.nekoflow.catalog.WorkRepository;
import com.nekoflow.common.Times;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contas de demonstração. A "marina" recebe a biblioteca, o histórico, os avisos e os
 * pedidos do protótipo, para as telas abrirem como no design depois do login.
 * Desligue com NEKOFLOW_DEMO=false.
 */
@Component
@Order(3)
public class DemoSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);
    private static final Map<String, String> REQUEST_STATUS = Map.of(
            "Recebida", "RECEBIDA", "Em análise", "EM_ANALISE", "Aprovada", "APROVADA", "Atendida", "ATENDIDA",
            "Não atendida", "NAO_ATENDIDA");
    private static final String[] MONTHS = {"jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out",
            "nov", "dez"};

    private final JdbcClient jdbc;
    private final UserRepository users;
    private final WorkRepository works;
    private final PasswordEncoder encoder;
    private final ObjectMapper mapper;
    private final boolean enabled;
    private final String password;

    public DemoSeeder(JdbcClient jdbc, UserRepository users, WorkRepository works, PasswordEncoder encoder,
                      ObjectMapper mapper, @Value("${nekoflow.demo.enabled:true}") boolean enabled,
                      @Value("${nekoflow.demo.password:nekoflow2026}") String password) {
        this.jdbc = jdbc;
        this.users = users;
        this.works = works;
        this.encoder = encoder;
        this.mapper = mapper;
        this.enabled = enabled;
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws IOException {
        if (!enabled || users.findByLogin("marina").isPresent()) {
            return;
        }
        String hash = encoder.encode(password);
        long marina = users.create("marina", "marina@nekoflow.local", "Marina", hash, Role.USER);
        users.create("admin", "admin@nekoflow.local", "Equipe Nekoflow", hash, Role.ADMIN);
        long kenji = users.create("kenji", "kenji@nekoflow.local", "Kenji", hash, Role.USER);

        JsonNode conta = read("conta");
        OffsetDateTime now = OffsetDateTime.now();

        // Biblioteca + progresso
        int i = 0;
        for (JsonNode x : conta.get("library")) {
            long id = x.get("id").asLong();
            String status = x.get("status").asText();
            OffsetDateTime at = parseLast(x.path("last").asText(""), now).minusMinutes(i++);
            entry(marina, id, status, at);
            Work w = works.require(id);
            if ("planejado".equals(status)) {
                continue;
            }
            boolean anim = w.isAnimation();
            int unit = anim ? x.path("ep").asInt(1) : x.path("ch").asInt(1);
            boolean done = x.path("done").asBoolean(false) || "concluido".equals(status);
            Integer pos = anim ? secs(x.path("t").asText(null)) : null;
            Integer dur = anim ? secs(x.path("d").asText("24:00")) : null;
            double pct = x.path("pct").isMissingNode() || x.path("pct").isNull() ? (done ? 100 : 50) : x.get("pct").asDouble();
            progress(marina, id, unit, pos, dur, pct, done, at);
            if (x.path("done").asBoolean(false)) {
                jdbc.sql("UPDATE work SET available_units = ? WHERE id = ?").params(unit, id).update();
            }
        }

        // "Continuar assistindo" da Home: os mais recentes
        JsonNode cont = read("home").get("cont");
        for (int k = 0; k < cont.size(); k++) {
            JsonNode x = cont.get(k);
            long id = x.get("id").asLong();
            OffsetDateTime at = now.minusMinutes(5L + k);
            entry(marina, id, "andamento", at);
            int ep = Integer.parseInt(x.get("ep").asText().replaceAll("\\D", ""));
            int left = Integer.parseInt(x.get("left").asText().replaceAll("\\D", ""));
            double pct = Double.parseDouble(x.get("pct").asText().replace("%", ""));
            progress(marina, id, ep, 1440 - left * 60, 1440, pct, false, at);
        }

        // Player do protótipo: episódios 1–15 vistos e o 16 em 15:00
        OffsetDateTime sl = now.minusDays(5);
        entry(marina, 151807, "andamento", sl);
        for (int ep = 1; ep <= 15; ep++) {
            progress(marina, 151807, ep, 1440, 1440, 100, true, sl.minusHours(16 - ep));
        }
        progress(marina, 151807, 16, 900, 1440, 62.5, false, sl);

        // Leitor do protótipo (Solo Leveling, manhwa): capítulos 0–110 lidos e o 111 em 40%
        jdbc.sql("UPDATE library_entry SET status = 'andamento' WHERE user_id = ? AND work_id = 105398").param(marina).update();
        jdbc.sql("DELETE FROM progress WHERE user_id = ? AND work_id = 105398").param(marina).update();
        OffsetDateTime rd = now.minusDays(1);
        for (int c = 0; c <= 110; c++) {
            progress(marina, 105398, c, null, null, 100, true, rd.minusHours(112 - c));
        }
        progress(marina, 105398, 111, 9300, null, 40, false, rd);

        // Favoritos (o perfil do design mostra os 6 primeiros em andamento/concluídos) e alertas
        int fav = 0;
        for (JsonNode x : conta.get("library")) {
            String st = x.get("status").asText();
            if ((st.equals("andamento") || st.equals("concluido")) && fav++ < 6) {
                jdbc.sql("INSERT INTO favorite (user_id, work_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                        .params(marina, x.get("id").asLong()).update();
            }
            if (st.equals("andamento")) {
                jdbc.sql("INSERT INTO work_follow (user_id, work_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                        .params(marina, x.get("id").asLong()).update();
            }
        }

        // Agenda do calendário do protótipo: as 6 animações e 6 leituras mais populares
        JsonNode cal = read("calendario");
        for (String list : List.of("anime", "reads")) {
            java.util.List<JsonNode> items = new java.util.ArrayList<>();
            cal.get(list).forEach(items::add);
            items.sort((a, b) -> Integer.compare(b.path("pop").asInt(), a.path("pop").asInt()));
            items.stream().map(x -> x.get("id").asLong()).distinct().limit(6).forEach(id ->
                    jdbc.sql("INSERT INTO work_follow (user_id, work_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                            .params(marina, id).update());
        }

        // Histórico
        for (JsonNode g : conta.get("history")) {
            LocalDate day = parseDay(g.get("day").asText());
            for (JsonNode h : g.get("items")) {
                Work w = works.findExactTitle(h.get("title").asText()).orElse(null);
                if (w == null) {
                    continue;
                }
                int unit = Integer.parseInt(h.get("unit").asText().replaceAll("\\D", ""));
                String time = h.get("time").asText().replaceAll(".*(\\d\\d:\\d\\d).*", "$1");
                ZonedDateTime at = day.atTime(LocalTime.parse(time)).atZone(Times.ZONE);
                String action = h.get("time").asText().startsWith("Lido") ? "READ" : "WATCHED";
                jdbc.sql("INSERT INTO activity (user_id, work_id, unit, action, occurred_at) VALUES (?, ?, ?, ?, ?)")
                        .params(marina, w.id(), unit, action, at.toOffsetDateTime()).update();
            }
        }

        // Avisos
        for (JsonNode n : conta.get("notifs")) {
            OffsetDateTime at = parseAgo(n.get("when").asText(), now);
            jdbc.sql("""
                    INSERT INTO notification (user_id, category, icon, title, sub, href, cover, event_key, created_at, read_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
                    .params(marina, n.get("cat").asText(), n.path("icon").asText(null), n.get("title").asText(),
                            n.path("sub").asText(null), fixHref(n.path("href").asText("#")), n.path("cover").asText(null),
                            "demo:" + n.get("id").asText(), at, n.path("read").asBoolean() ? at : null)
                    .update();
        }

        // Solicitações
        for (JsonNode r : conta.get("requests")) {
            long id = Long.parseLong(r.get("id").asText().replaceAll("\\D", ""));
            String st = REQUEST_STATUS.getOrDefault(r.get("status").asText(), "RECEBIDA");
            String media = r.get("type").asText();
            String title = r.get("title").asText();
            OffsetDateTime created = parseDate(r.get("date").asText());
            Long workId = works.findExactTitle(title).map(Work::id).orElse(null);
            jdbc.sql("""
                    INSERT INTO content_request (id, user_id, request_kind, media, title, title_norm, work_id, status,
                                                 reason, created_at, updated_at)
                    VALUES (?, ?, 'ADD', ?, ?, ?, ?, ?, ?, ?, ?)""")
                    .params(id, marina, media, title, com.nekoflow.common.Text.norm(title),
                            "ATENDIDA".equals(st) ? workId : null, st, r.path("reason").asText(null), created,
                            created.plusDays(2))
                    .update();
            jdbc.sql("INSERT INTO request_history (request_id, to_status, actor_id, created_at) VALUES (?, 'RECEBIDA', ?, ?)")
                    .params(id, marina, created).update();
            if (!"RECEBIDA".equals(st)) {
                jdbc.sql("""
                        INSERT INTO request_history (request_id, from_status, to_status, note, created_at)
                        VALUES (?, 'RECEBIDA', ?, ?, ?)""")
                        .params(id, st, r.path("reason").asText(null), created.plusDays(2)).update();
            }
        }
        jdbc.sql("INSERT INTO request_supporter (request_id, user_id) VALUES (1042, ?) ON CONFLICT DO NOTHING")
                .param(kenji).update();

        log.info("Demonstração: contas marina, admin e kenji criadas (senha em NEKOFLOW_DEMO_PASSWORD)");
    }

    private void entry(long user, long work, String status, OffsetDateTime at) {
        jdbc.sql("""
                INSERT INTO library_entry (user_id, work_id, status, added_at, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (user_id, work_id) DO NOTHING""")
                .params(user, work, status, at.minusDays(10), at).update();
    }

    private void progress(long user, long work, int unit, Integer pos, Integer dur, double pct, boolean done,
                          OffsetDateTime at) {
        jdbc.sql("""
                INSERT INTO progress (user_id, work_id, unit, position_sec, duration_sec, pct, completed, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, work_id, unit) DO NOTHING""")
                .params(user, work, unit, pos, dur, pct, done, at).update();
    }

    private static String fixHref(String h) {
        return h.startsWith("/conta?aba=solicitacoes") ? "/conta?aba=solicitacoes" : h;
    }

    private static Integer secs(String mmss) {
        if (mmss == null || !mmss.contains(":")) {
            return null;
        }
        String[] p = mmss.split(":");
        return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
    }

    private static OffsetDateTime parseLast(String s, OffsetDateTime now) {
        if (s.isEmpty()) {
            return now.minusDays(20);
        }
        if (s.equals("Hoje")) {
            return now.minusHours(1);
        }
        if (s.equals("Ontem")) {
            return now.minusDays(1);
        }
        Matcher m = Pattern.compile("(\\d+)\\s+(dia|semana|m[eê]s)").matcher(s);
        if (m.find()) {
            int n = Integer.parseInt(m.group(1));
            return switch (m.group(2).charAt(0)) {
                case 'd' -> now.minusDays(n);
                case 's' -> now.minusWeeks(n);
                default -> now.minusMonths(n);
            };
        }
        return now.minusDays(30);
    }

    private static OffsetDateTime parseAgo(String s, OffsetDateTime now) {
        Matcher m = Pattern.compile("(\\d+)\\s*(min|h|dia)").matcher(s);
        if (m.find()) {
            int n = Integer.parseInt(m.group(1));
            return switch (m.group(2)) {
                case "min" -> now.minusMinutes(n);
                case "h" -> now.minusHours(n);
                default -> now.minusDays(n);
            };
        }
        return s.equals("ontem") ? now.minusDays(1) : now;
    }

    private static LocalDate parseDay(String s) {
        LocalDate today = LocalDate.now(Times.ZONE);
        if (s.equals("Hoje")) {
            return today;
        }
        if (s.equals("Ontem")) {
            return today.minusDays(1);
        }
        Matcher m = Pattern.compile("(\\d+) de (\\w+)").matcher(s);
        if (m.find()) {
            String mon = m.group(2).substring(0, 3);
            for (int k = 0; k < 12; k++) {
                if (MONTHS[k].equals(mon)) {
                    LocalDate d = LocalDate.of(today.getYear(), k + 1, Integer.parseInt(m.group(1)));
                    return d.isAfter(today) ? today.minusDays(3) : d;
                }
            }
        }
        return today.minusDays(3);
    }

    private static OffsetDateTime parseDate(String s) {
        String[] p = s.split(" ");
        int month = List.of(MONTHS).indexOf(p[1]) + 1;
        return LocalDate.of(Integer.parseInt(p[2]), month, Integer.parseInt(p[0])).atTime(12, 0)
                .atZone(Times.ZONE).toOffsetDateTime();
    }

    private JsonNode read(String key) throws IOException {
        try (InputStream in = new ClassPathResource("seed/" + key + ".json").getInputStream()) {
            return mapper.readTree(in);
        }
    }
}
