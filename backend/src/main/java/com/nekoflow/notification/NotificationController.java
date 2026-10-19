package com.nekoflow.notification;

import com.nekoflow.auth.CurrentUser;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/me/notifications")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return notifications.list(CurrentUser.id());
    }

    @PostMapping("/{id}/read")
    public Map<String, Object> read(@PathVariable String id) {
        try {
            notifications.markRead(CurrentUser.id(), Long.parseLong(id.replaceFirst("^n", "")));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return Map.of("ok", true);
    }

    @PostMapping("/read-all")
    public Map<String, Object> readAll() {
        notifications.markAllRead(CurrentUser.id());
        return Map.of("ok", true);
    }
}
