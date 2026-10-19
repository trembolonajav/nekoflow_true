package com.nekoflow.request;

import com.nekoflow.auth.CurrentUser;
import com.nekoflow.auth.Role;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/requests")
public class RequestController {

    private final RequestService requests;

    public RequestController(RequestService requests) {
        this.requests = requests;
    }

    public record DetailsBody(String details) {
    }

    @GetMapping("/mine")
    public List<Map<String, Object>> mine() {
        return requests.mine(CurrentUser.id());
    }

    /** Verificação de duplicidade usada pelo formulário enquanto a pessoa digita. */
    @GetMapping("/check")
    public Map<String, Object> check(@RequestParam String kind, @RequestParam(defaultValue = "") String title,
                                     @RequestParam(required = false) Long workId) {
        RequestService.Check c = requests.check(RequestService.kindOf(kind), title, workId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("work", c.existingWork() == null ? null : c.existingWork().view());
        m.put("request", c.openRequest() == null ? null : requests.view(c.openRequest(), CurrentUser.id()));
        return m;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody RequestService.NewRequest body) {
        return requests.create(CurrentUser.id(), body);
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable long id) {
        return requests.detail(CurrentUser.id(), id, CurrentUser.get().role().atLeast(Role.MODERATOR));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> update(@PathVariable long id, @RequestBody DetailsBody body) {
        return requests.updateDetails(CurrentUser.id(), id, body.details());
    }

    @PostMapping("/{id}/cancel")
    public Map<String, Object> cancel(@PathVariable long id) {
        return requests.cancel(CurrentUser.id(), id);
    }

    @PostMapping("/{id}/support")
    public Map<String, Object> support(@PathVariable long id) {
        return requests.support(CurrentUser.id(), id);
    }

    @DeleteMapping("/{id}/support")
    public Map<String, Object> unsupport(@PathVariable long id) {
        return requests.unsupport(CurrentUser.id(), id);
    }

    @ExceptionHandler(RequestService.DuplicateRequestException.class)
    public ResponseEntity<Map<String, Object>> duplicate(RequestService.DuplicateRequestException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(e.body);
    }
}
