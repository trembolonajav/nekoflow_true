package com.nekoflow.catalog;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** API normalizada e somente leitura da integração não oficial com MangaLivre. */
@RestController
@RequestMapping("/api/v1/providers/mangalivre")
public class MangaLivreController {
    private final MangaLivreApiClient api;

    public MangaLivreController(MangaLivreApiClient api) { this.api = api; }

    @GetMapping("/health")
    public MangaLivreApiClient.Health health() { return call(api::health); }

    @GetMapping("/manga")
    public MangaLivreApiClient.MangaPage catalog(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "24") int size,
            @RequestParam(defaultValue = "") String search) {
        if (page < 1 || size < 1 || size > 100 || search.length() > 100)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Paginação ou busca inválida.");
        return call(() -> api.catalog(page, size, search));
    }

    @GetMapping("/manga/{slug}")
    public MangaLivreApiClient.MangaDetail manga(@PathVariable String slug) {
        return call(() -> api.manga(slug));
    }

    @GetMapping("/manga/{slug}/chapters")
    public MangaLivreApiClient.ChapterPage chapters(
            @PathVariable String slug,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "") String search) {
        if (offset < 0 || offset > 1_000_000 || search.length() > 100)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Offset ou busca inválida.");
        return call(() -> api.chapters(slug, offset, search));
    }

    @GetMapping("/chapters/{slug}")
    public MangaLivreApiClient.ReaderChapter reader(@PathVariable String slug) {
        return call(() -> api.reader(slug));
    }

    private static <T> T call(java.util.concurrent.Callable<T> operation) {
        try {
            return operation.call();
        } catch (MangaLivreApiClient.NotFoundException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage(), e);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        } catch (MangaLivreApiClient.ProviderException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "MangaLivre está temporariamente indisponível.", e);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Não foi possível concluir a consulta.", e);
        }
    }
}
