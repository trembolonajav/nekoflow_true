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
import java.time.OffsetDateTime;
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
                      @Value("${nekoflow.demo.password:123456}") String password) {
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
        if (!enabled) return;
        String hash = encoder.encode(password);
        ensureDemoAdmin(hash);
        if (users.findByLogin("marina").isPresent()) return;
        long marina = users.create("marina", "marina@nekoflow.local", "Marina", hash, Role.USER);
        long kenji = users.create("kenji", "kenji@nekoflow.local", "Kenji", hash, Role.USER);

        JsonNode conta = read("conta");
        OffsetDateTime now = OffsetDateTime.now();

        // Biblioteca: só a situação de cada obra. A conta de demonstração não recebe progresso
        // nem histórico inventados — esses registros só nascem de episódios/capítulos reais.
        int i = 0;
        for (JsonNode x : conta.get("library")) {
            OffsetDateTime at = parseLast(x.path("last").asText(""), now).minusMinutes(i++);
            entry(marina, x.get("id").asLong(), x.get("status").asText(), at);
        }

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

        log.info("Demonstração: contas marina, nekoflow e kenji preparadas (senha em NEKOFLOW_DEMO_PASSWORD)");
    }

    /** Mantém uma credencial simples e previsível somente no ambiente de demonstração. */
    private void ensureDemoAdmin(String hash) {
        var oldAdmin = users.findByLogin("admin@nekoflow.local");
        var preferred = users.findByLogin("nekoflow");
        var account = oldAdmin.or(() -> preferred);
        if (account.isEmpty()) {
            users.create("nekoflow", "nekoflow@nekoflow.local", "Equipe Nekoflow", hash, Role.ADMIN);
            return;
        }
        if (oldAdmin.isPresent() && preferred.isPresent() && oldAdmin.get().id() != preferred.get().id()) {
            throw new IllegalStateException("O usuário de demonstração 'nekoflow' já pertence a outra conta");
        }
        long id = account.get().id();
        jdbc.sql("""
                UPDATE app_user SET username='nekoflow',email='nekoflow@nekoflow.local',
                  display_name='Equipe Nekoflow',password_hash=?,role='ADMIN',status='ACTIVE',
                  email_verified_at=COALESCE(email_verified_at,now()),failed_login_attempts=0,
                  locked_until=NULL,updated_at=now() WHERE id=?""").params(hash, id).update();
        jdbc.sql("DELETE FROM user_role WHERE user_id=?").param(id).update();
        jdbc.sql("INSERT INTO user_role(user_id,role) VALUES (?,'ADMIN')").param(id).update();
    }

    private void entry(long user, long work, String status, OffsetDateTime at) {
        jdbc.sql("""
                INSERT INTO library_entry (user_id, work_id, status, added_at, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (user_id, work_id) DO NOTHING""")
                .params(user, work, status, at.minusDays(10), at).update();
    }

    private static String fixHref(String h) {
        return h.startsWith("/conta?aba=solicitacoes") ? "/conta?aba=solicitacoes" : h;
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
