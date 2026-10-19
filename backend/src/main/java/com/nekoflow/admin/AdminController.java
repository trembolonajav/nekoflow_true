package com.nekoflow.admin;

import com.nekoflow.auth.AuthController;
import com.nekoflow.auth.CurrentUser;
import com.nekoflow.auth.NekoPrincipal;
import com.nekoflow.auth.Role;
import com.nekoflow.auth.UserRepository;
import com.nekoflow.catalog.Work;
import com.nekoflow.catalog.WorkRepository;
import com.nekoflow.request.RequestService;
import com.nekoflow.request.RequestStatus;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Painel administrativo. Permissões (validadas no SecurityConfig):
 * moderador = solicitações; editor = + obras e publicações; administrador = + usuários e auditoria.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final RequestService requests;
    private final ReleaseService releases;
    private final WorkRepository works;
    private final UserRepository users;
    private final AuditLog audit;

    public AdminController(RequestService requests, ReleaseService releases, WorkRepository works,
                           UserRepository users, AuditLog audit) {
        this.requests = requests;
        this.releases = releases;
        this.works = works;
        this.users = users;
        this.audit = audit;
    }

    public record StatusChange(String status, String note, Long workId) {
    }

    public record NewWork(Long id, String kind, String title, String alt, String cover, String banner,
                          Boolean webtoon, Integer year, Integer totalUnits) {
    }

    public record NewRelease(long workId, int unit, String unitTitle) {
    }

    public record RoleChange(String role) {
    }

    // ---- solicitações (moderador) ----------------------------------------------

    @GetMapping("/requests")
    public List<Map<String, Object>> requests(@RequestParam(defaultValue = "") String status,
                                              @RequestParam(defaultValue = "") String q) {
        return requests.adminList(status, q);
    }

    @PostMapping("/requests/{id}/status")
    public Map<String, Object> changeStatus(@PathVariable long id, @RequestBody StatusChange body) {
        NekoPrincipal me = CurrentUser.get();
        RequestStatus to;
        try {
            to = RequestStatus.valueOf(body.status());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Situação inválida");
        }
        Map<String, Object> out = requests.changeStatus(me.id(), me.role(), id, to, body.note(), body.workId());
        audit.record(me.id(), "SOLICITACAO", "#" + id, to.label + (body.note() == null ? "" : " · " + body.note()));
        return out;
    }

    // ---- catálogo e publicações (editor) ------------------------------------------

    @GetMapping("/works/search")
    public List<Map<String, Object>> searchWorks(@RequestParam(defaultValue = "") String q) {
        return works.search(q, 20).stream().map(Work::view).toList();
    }

    @PostMapping("/works")
    public Map<String, Object> createWork(@RequestBody NewWork body) {
        if (body.title() == null || body.title().isBlank()
                || !List.of("anime", "filme", "manga", "manhwa").contains(body.kind())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe título e tipo");
        }
        works.findExactTitle(body.title()).ifPresent(w -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Já existe no catálogo: " + w.title() + " (#" + w.id() + ")");
        });
        long id = body.id() != null ? body.id() : works.nextLocalId();
        if (works.exists(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Já existe uma obra com o id " + id);
        }
        works.insertIfAbsent(new Work(id, body.kind(), body.title().trim(), body.alt() == null ? "" : body.alt(),
                body.cover(), body.banner(), Boolean.TRUE.equals(body.webtoon()), body.year(), body.totalUnits(),
                0, "Em lançamento", null));
        works.setVisibility(id, "DRAFT");
        audit.record(CurrentUser.id(), "CADASTRAR_OBRA", body.title().trim() + " (#" + id + ")", body.kind());
        return works.require(id).view();
    }


    @PostMapping("/releases")
    public Map<String, Object> publish(@RequestBody NewRelease body) {
        if (body.unit() < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Número inválido");
        }
        return releases.publish(CurrentUser.id(), body.workId(), body.unit(), body.unitTitle());
    }

    @GetMapping("/releases")
    public List<Map<String, Object>> recentReleases() {
        return releases.recent(50);
    }

    // ---- usuários e auditoria (administrador) ----------------------------------------

    @GetMapping("/users")
    public List<Map<String, Object>> users(@RequestParam(defaultValue = "") String q) {
        return users.list(q).stream().map(AuthController::publicView).toList();
    }

    @PutMapping("/users/{id}/role")
    public Map<String, Object> setRole(@PathVariable long id, @RequestBody RoleChange body) {
        if (id == CurrentUser.id()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Você não pode alterar o próprio papel");
        }
        Role role;
        try {
            role = Role.valueOf(body.role());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Papel inválido");
        }
        var u = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        users.setRole(id, role);
        audit.record(CurrentUser.id(), "PAPEL", "@" + u.username(), u.role() + " → " + role);
        return AuthController.publicView(users.findById(id).orElseThrow());
    }

    @GetMapping("/users/audit")
    public List<Map<String, Object>> audit() {
        return audit.recent();
    }
}
