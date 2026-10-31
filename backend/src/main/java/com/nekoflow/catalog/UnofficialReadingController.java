package com.nekoflow.catalog;

import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** APIs não oficiais normalizadas para catálogos de leitura PT-BR e inglês. */
@RestController
@RequestMapping("/api/v1/providers")
public class UnofficialReadingController {
    private static final Set<String> PROVIDERS = Set.of(
            UnofficialReadingApiClient.TIA, UnofficialReadingApiClient.COMIX, UnofficialReadingApiClient.BUDDY);
    private final UnofficialReadingApiClient api;

    public UnofficialReadingController(UnofficialReadingApiClient api) { this.api = api; }

    @GetMapping("/reading")
    public List<UnofficialReadingApiClient.Profile> profiles() { return api.profiles(); }

    @GetMapping("/{provider}/health")
    public UnofficialReadingApiClient.Health health(@PathVariable String provider) {
        requireProvider(provider);
        return call(() -> api.health(provider), provider);
    }

    @GetMapping("/{provider}/series")
    public UnofficialReadingApiClient.SeriesPage catalog(@PathVariable String provider,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "24") int size,
            @RequestParam(defaultValue = "") String search) {
        requireProvider(provider);
        if (page < 1 || page > 10_000 || size < 1 || size > 50 || search.length() > 100)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Busca ou paginação inválida.");
        return call(() -> api.catalog(provider, page, size, search), provider);
    }

    @GetMapping("/{provider}/series/{id}")
    public UnofficialReadingApiClient.SeriesDetail series(@PathVariable String provider, @PathVariable String id) {
        requireProvider(provider);
        return call(() -> api.series(provider, id), provider);
    }

    @GetMapping("/{provider}/series/{id}/chapters")
    public UnofficialReadingApiClient.ChapterList chapters(@PathVariable String provider, @PathVariable String id) {
        requireProvider(provider);
        return call(() -> api.chapters(provider, id), provider);
    }

    @GetMapping("/{provider}/series/{seriesId}/chapters/{chapterId}")
    public UnofficialReadingApiClient.ReaderChapter reader(@PathVariable String provider,
            @PathVariable String seriesId, @PathVariable String chapterId) {
        requireProvider(provider);
        return call(() -> api.reader(provider, seriesId, chapterId), provider);
    }

    private static void requireProvider(String provider) {
        if (!PROVIDERS.contains(provider)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Provedor inexistente.");
    }

    private static <T> T call(java.util.concurrent.Callable<T> operation, String provider) {
        try { return operation.call(); }
        catch (UnofficialReadingApiClient.NotFoundException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, error.getMessage(), error);
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage(), error);
        } catch (UnofficialReadingApiClient.ProviderException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "O provedor " + provider + " está temporariamente indisponível.", error);
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Consulta ao provedor falhou.", error);
        }
    }
}
