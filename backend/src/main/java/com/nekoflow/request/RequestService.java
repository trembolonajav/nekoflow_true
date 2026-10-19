package com.nekoflow.request;

import com.nekoflow.auth.Role;
import com.nekoflow.catalog.Work;
import com.nekoflow.catalog.WorkRepository;
import com.nekoflow.common.Text;
import com.nekoflow.common.Times;
import com.nekoflow.notification.NotificationService;
import com.nekoflow.notification.NotificationService.Notice;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RequestService {

    public static final Set<String> MEDIA = Set.of("Anime", "Filme", "Mangá", "Manhwa", "Webtoon");
    static final int DAILY_LIMIT = 5;

    private final JdbcClient jdbc;
    private final WorkRepository works;
    private final NotificationService notifications;

    public RequestService(JdbcClient jdbc, WorkRepository works, NotificationService notifications) {
        this.jdbc = jdbc;
        this.works = works;
        this.notifications = notifications;
    }

    public record Req(long id, long userId, RequestKind kind, String media, String title, Long workId,
                      String details, RequestStatus status, String reason, OffsetDateTime createdAt,
                      OffsetDateTime updatedAt) {
    }

    public record NewRequest(String media, String kind, String title, Long workId, String details) {
    }

    /** Resultado da verificação de duplicidade antes do envio. */
    public record Check(Work existingWork, Req openRequest) {
    }

    // ---- verificação e criação ----------------------------------------------

    public Check check(RequestKind kind, String title, Long workId) {
        if (kind.needsWork()) {
            if (workId == null) {
                return new Check(null, null);
            }
            return new Check(null, findOpen(kind, null, workId).orElse(null));
        }
        Optional<Work> w = works.findExactTitle(title);
        if (w.isPresent()) {
            return new Check(w.get(), null);
        }
        return new Check(null, findOpen(kind, Text.norm(title), null).orElse(null));
    }

    private Optional<Req> findOpen(RequestKind kind, String titleNorm, Long workId) {
        return jdbc.sql("""
                SELECT * FROM content_request
                WHERE request_kind = :k AND status NOT IN ('ATENDIDA', 'NAO_ATENDIDA', 'CANCELADA')
                  AND ((:w::bigint IS NOT NULL AND work_id = :w) OR (:w::bigint IS NULL AND title_norm = :t))
                ORDER BY created_at LIMIT 1""")
                .param("k", kind.name()).param("w", workId).param("t", titleNorm)
                .query(RequestService::map).optional();
    }

    @Transactional
    public Map<String, Object> create(long userId, NewRequest body) {
        RequestKind kind = kindOf(body.kind());
        String title = body.title() == null ? "" : body.title().trim();
        if (!MEDIA.contains(body.media())) {
            throw bad("Tipo de conteúdo inválido");
        }
        Work work = null;
        if (kind.needsWork()) {
            if (body.workId() == null) {
                throw bad("Este tipo de pedido precisa estar ligado a uma obra do catálogo");
            }
            work = works.require(body.workId());
            title = work.title();
        } else if (title.length() < 2 || title.length() > 300) {
            throw bad("Informe o título da obra");
        }
        long recent = jdbc.sql("SELECT count(*) FROM content_request WHERE user_id = ? AND created_at > now() - interval '1 day'")
                .param(userId).query(Long.class).single();
        if (recent >= DAILY_LIMIT) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Limite de " + DAILY_LIMIT + " solicitações por dia atingido");
        }
        Check c = check(kind, title, work == null ? null : work.id());
        if (c.existingWork() != null || c.openRequest() != null) {
            Map<String, Object> dup = new LinkedHashMap<>();
            dup.put("duplicate", true);
            dup.put("work", c.existingWork() == null ? null : c.existingWork().view());
            dup.put("request", c.openRequest() == null ? null : view(c.openRequest(), userId));
            throw new DuplicateRequestException(dup);
        }
        String details = body.details() == null ? null : body.details().trim();
        if (details != null && details.length() > 2000) {
            throw bad("Detalhes muito longos");
        }
        long id = jdbc.sql("""
                INSERT INTO content_request (user_id, request_kind, media, title, title_norm, work_id, details, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'RECEBIDA') RETURNING id""")
                .params(userId, kind.name(), body.media(), title, Text.norm(title),
                        work == null ? null : work.id(), details)
                .query(Long.class).single();
        history(id, null, RequestStatus.RECEBIDA, userId, null);
        return view(require(id), userId);
    }

    /** "Também quero esta obra": registra interesse num pedido aberto existente. */
    public Map<String, Object> support(long userId, long id) {
        Req r = require(id);
        if (!r.status().isOpen()) {
            throw bad("Este pedido já foi encerrado");
        }
        if (r.userId() != userId) {
            jdbc.sql("INSERT INTO request_supporter (request_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING")
                    .params(id, userId).update();
        }
        return view(r, userId);
    }

    public Map<String, Object> unsupport(long userId, long id) {
        jdbc.sql("DELETE FROM request_supporter WHERE request_id = ? AND user_id = ?").params(id, userId).update();
        return view(require(id), userId);
    }

    @Transactional
    public Map<String, Object> updateDetails(long userId, long id, String details) {
        Req r = require(id);
        if (r.userId() != userId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (!r.status().editableByRequester()) {
            throw bad("O pedido não pode mais ser alterado nesta situação");
        }
        jdbc.sql("UPDATE content_request SET details = ?, updated_at = now() WHERE id = ?")
                .params(details == null ? null : details.trim(), id).update();
        return detail(userId, id, false);
    }

    @Transactional
    public Map<String, Object> cancel(long userId, long id) {
        Req r = require(id);
        if (r.userId() != userId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (!r.status().editableByRequester()) {
            throw bad("O pedido não pode mais ser cancelado");
        }
        jdbc.sql("UPDATE content_request SET status = 'CANCELADA', updated_at = now() WHERE id = ?").param(id).update();
        history(id, r.status(), RequestStatus.CANCELADA, userId, "Cancelada pelo solicitante");
        return detail(userId, id, false);
    }

    // ---- administração ----------------------------------------------------------

    /**
     * Muda a situação (moderação). Valida a transição, registra quem/quando/por quê e avisa
     * solicitante e apoiadores.
     */
    @Transactional
    public Map<String, Object> changeStatus(long actorId, Role actorRole, long id, RequestStatus to, String note,
                                            Long workId) {
        Req r = require(id);
        if (!r.status().next().contains(to)) {
            throw bad("Transição inválida: " + r.status().label + " → " + to.label);
        }
        if (to == RequestStatus.NAO_ATENDIDA && (note == null || note.isBlank())) {
            throw bad("Informe a justificativa para o solicitante");
        }
        Long link = workId != null ? workId : r.workId();
        if (to == RequestStatus.ATENDIDA && link == null) {
            throw bad("Vincule a obra do catálogo que atende o pedido");
        }
        if (link != null) {
            works.require(link);
        }
        jdbc.sql("UPDATE content_request SET status = ?, reason = COALESCE(?, reason), work_id = ?, updated_at = now() WHERE id = ?")
                .params(to.name(), to == RequestStatus.NAO_ATENDIDA ? note.trim() : null, link, id).update();
        history(id, r.status(), to, actorId, note);
        notifyChange(require(id));
        return adminView(require(id));
    }

    /** Chamado quando uma publicação atende pedidos de episódios/capítulos faltando. */
    @Transactional
    public int resolveMissingFor(long workId, long actorId, String note) {
        List<Req> open = jdbc.sql("""
                SELECT * FROM content_request WHERE work_id = ? AND request_kind = 'MISSING'
                AND status IN ('APROVADA', 'PROGRAMADA')""")
                .param(workId).query(RequestService::map).list();
        for (Req r : open) {
            jdbc.sql("UPDATE content_request SET status = 'ATENDIDA', updated_at = now() WHERE id = ?")
                    .param(r.id()).update();
            history(r.id(), r.status(), RequestStatus.ATENDIDA, actorId, note);
            notifyChange(require(r.id()));
        }
        return open.size();
    }

    private void notifyChange(Req r) {
        Work w = r.workId() == null ? null : works.find(r.workId()).orElse(null);
        String href = r.status() == RequestStatus.ATENDIDA && w != null ? w.href() : "/solicitacoes/" + r.id();
        String title = switch (r.status()) {
            case ATENDIDA -> "Seu pedido foi atendido";
            case NAO_ATENDIDA -> "Seu pedido não pôde ser atendido";
            case APROVADA -> "Seu pedido foi aprovado";
            default -> "Seu pedido mudou de situação";
        };
        Notice n = new Notice("sis", "req", title, "#" + r.id() + " · " + r.title() + " · " + r.status().label, href,
                w == null ? null : w.cover(), "req:" + r.id() + ":" + r.status().name());
        notifications.send(r.userId(), n, "nReq");
        String supTitle = switch (r.status()) {
            case ATENDIDA -> "Um pedido que você acompanha foi atendido";
            case NAO_ATENDIDA -> "Um pedido que você acompanha não pôde ser atendido";
            case APROVADA -> "Um pedido que você acompanha foi aprovado";
            default -> "Um pedido que você acompanha mudou de situação";
        };
        Notice ns = new Notice(n.category(), n.icon(), supTitle, n.sub(), n.href(), n.cover(), n.eventKey());
        for (Long u : jdbc.sql("SELECT user_id FROM request_supporter WHERE request_id = ?").param(r.id())
                .query(Long.class).list()) {
            notifications.send(u, ns, "nReq");
        }
    }

    public List<Map<String, Object>> adminList(String status, String q) {
        return jdbc.sql("""
                SELECT r.* FROM content_request r
                WHERE (:s = '' OR r.status = :s) AND (:q = '' OR r.title_norm LIKE '%' || :q || '%')
                ORDER BY (SELECT count(*) FROM request_supporter s WHERE s.request_id = r.id) DESC, r.created_at
                LIMIT 200""")
                .param("s", status == null ? "" : status).param("q", Text.norm(q))
                .query(RequestService::map).list().stream().map(this::adminView).toList();
    }

    public Map<String, Object> adminView(Req r) {
        Map<String, Object> m = view(r, -1);
        m.put("requester", jdbc.sql("SELECT username FROM app_user WHERE id = ?").param(r.userId())
                .query(String.class).single());
        m.put("details", r.details());
        m.put("next", r.status().next().stream().map(s -> Map.of("code", s.name(), "label", s.label)).toList());
        m.put("history", historyOf(r.id(), true));
        Check c = r.kind() == RequestKind.ADD && r.workId() == null ? check(r.kind(), r.title(), null) : null;
        m.put("catalogMatch", c != null && c.existingWork() != null ? c.existingWork().view() : null);
        return m;
    }

    // ---- leitura ------------------------------------------------------------------

    public List<Map<String, Object>> mine(long userId) {
        return jdbc.sql("""
                SELECT * FROM content_request
                WHERE user_id = :u OR id IN (SELECT request_id FROM request_supporter WHERE user_id = :u)
                ORDER BY created_at DESC""")
                .param("u", userId).query(RequestService::map).list().stream().map(r -> view(r, userId)).toList();
    }

    public Map<String, Object> detail(long userId, long id, boolean staff) {
        Req r = require(id);
        boolean involved = r.userId() == userId || jdbc.sql(
                "SELECT count(*) FROM request_supporter WHERE request_id = ? AND user_id = ?")
                .params(id, userId).query(Long.class).single() > 0;
        if (!involved && !staff) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Map<String, Object> m = view(r, userId);
        m.put("details", r.details());
        m.put("history", historyOf(id, false));
        return m;
    }

    Map<String, Object> view(Req r, long viewerId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", "#" + r.id());
        m.put("numId", r.id());
        m.put("title", r.title());
        m.put("type", r.media());
        m.put("kind", r.kind().name());
        m.put("kindLabel", r.kind().label);
        m.put("status", r.status().label);
        m.put("statusCode", r.status().name());
        m.put("date", Times.date(r.createdAt()));
        m.put("updated", Times.date(r.updatedAt()));
        m.put("reason", r.reason());
        m.put("open", r.status().isOpen());
        m.put("mine", r.userId() == viewerId);
        m.put("canEdit", r.userId() == viewerId && r.status().editableByRequester());
        m.put("supporters", jdbc.sql("SELECT count(*) FROM request_supporter WHERE request_id = ?").param(r.id())
                .query(Long.class).single());
        m.put("supporting", viewerId > 0 && jdbc.sql(
                "SELECT count(*) FROM request_supporter WHERE request_id = ? AND user_id = ?")
                .params(r.id(), viewerId).query(Long.class).single() > 0);
        Work w = r.workId() == null ? null : works.find(r.workId()).orElse(null);
        m.put("workId", r.workId());
        m.put("work", w == null ? null : w.view());
        m.put("href", "/solicitacoes/" + r.id());
        return m;
    }

    private List<Map<String, Object>> historyOf(long id, boolean showActor) {
        return jdbc.sql("""
                SELECT h.*, u.username, u.role FROM request_history h LEFT JOIN app_user u ON u.id = h.actor_id
                WHERE h.request_id = ? ORDER BY h.created_at, h.id""")
                .param(id)
                .query((rs, n) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    String from = rs.getString("from_status");
                    m.put("from", from == null ? null : RequestStatus.valueOf(from).label);
                    m.put("to", RequestStatus.valueOf(rs.getString("to_status")).label);
                    m.put("toCode", rs.getString("to_status"));
                    m.put("note", rs.getString("note"));
                    m.put("date", Times.date(rs.getObject("created_at", OffsetDateTime.class)) + " · "
                            + Times.clock(rs.getObject("created_at", OffsetDateTime.class)));
                    boolean staffActor = rs.getString("role") != null && !"USER".equals(rs.getString("role"));
                    m.put("by", showActor ? rs.getString("username") : staffActor ? "Equipe Nekoflow" : "Você");
                    return m;
                }).list();
    }

    private void history(long id, RequestStatus from, RequestStatus to, long actorId, String note) {
        jdbc.sql("INSERT INTO request_history (request_id, from_status, to_status, actor_id, note) VALUES (?, ?, ?, ?, ?)")
                .params(id, from == null ? null : from.name(), to.name(), actorId, note).update();
    }

    public Req require(long id) {
        return jdbc.sql("SELECT * FROM content_request WHERE id = ?").param(id).query(RequestService::map)
                .optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    static RequestKind kindOf(String s) {
        try {
            return RequestKind.fromLabelOrCode(s == null ? "" : s);
        } catch (IllegalArgumentException e) {
            throw bad(e.getMessage());
        }
    }

    private static ResponseStatusException bad(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }

    static Req map(ResultSet rs, int n) throws SQLException {
        return new Req(rs.getLong("id"), rs.getLong("user_id"), RequestKind.valueOf(rs.getString("request_kind")),
                rs.getString("media"), rs.getString("title"), (Long) rs.getObject("work_id"),
                rs.getString("details"), RequestStatus.valueOf(rs.getString("status")), rs.getString("reason"),
                rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class));
    }

    /** 409 com o conteúdo já existente (obra ou pedido aberto). */
    public static class DuplicateRequestException extends RuntimeException {
        public final Map<String, Object> body;

        DuplicateRequestException(Map<String, Object> body) {
            super("duplicate");
            this.body = body;
        }
    }
}
