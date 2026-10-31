package com.nekoflow.content;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Conteúdo das telas: GET /api/content/{key} devolve o JSON da tela. */
@RestController
@RequestMapping("/api/content")
public class ContentController {

    private final ContentDocumentRepository repository;

    public ContentController(ContentDocumentRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<String> keys() {
        return repository.findAll().stream().map(ContentDocument::getKey).sorted().toList();
    }

    @GetMapping("/{key}")
    public ResponseEntity<JsonNode> get(@PathVariable String key) {
        ContentDocument document = repository.findById(key)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conteúdo não encontrado."));
        return ResponseEntity.ok(document.getPayload());
    }
}
