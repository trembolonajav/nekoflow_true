package com.nekoflow.catalog;

import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** API não oficial e somente leitura do catálogo em inglês do WeebCentral. */
@RestController
@RequestMapping("/api/v1/providers/weebcentral-en")
public class WeebCentralController {
    private static final Set<String> TYPES = Set.of("", "Manga", "Manhwa", "Manhua", "OEL");
    private static final Set<String> ADULT = Set.of("Any", "True", "False");
    private final WeebCentralApiClient api;

    public WeebCentralController(WeebCentralApiClient api) { this.api = api; }

    @GetMapping("/health")
    public WeebCentralApiClient.Health health() { return call(api::health); }

    @GetMapping("/series")
    public WeebCentralApiClient.SeriesPage catalog(
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "24") int limit,
            @RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "") String type,
            @RequestParam(defaultValue = "Any") String adult) {
        if (offset < 0 || offset > 1_000_000 || limit < 1 || limit > 32 || search.length() > 100
                || !TYPES.contains(type) || !ADULT.contains(adult))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Busca ou filtro WeebCentral inválido.");
        return call(() -> api.catalog(offset, limit, search, type, adult));
    }

    @GetMapping("/series/{id}")
    public WeebCentralApiClient.SeriesDetail series(@PathVariable String id) {
        return call(() -> api.series(id));
    }

    @GetMapping("/series/{id}/chapters")
    public WeebCentralApiClient.ChapterList chapters(@PathVariable String id) {
        return call(() -> api.chapters(id));
    }

    @GetMapping("/chapters/{id}")
    public WeebCentralApiClient.ReaderChapter reader(@PathVariable String id) {
        return call(() -> api.reader(id));
    }

    private static <T> T call(java.util.concurrent.Callable<T> operation) {
        try {
            return operation.call();
        } catch (WeebCentralApiClient.NotFoundException error) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, error.getMessage(), error);
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage(), error);
        } catch (WeebCentralApiClient.ProviderException error) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "WeebCentral English está temporariamente indisponível.", error);
        } catch (Exception error) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Não foi possível concluir a consulta WeebCentral English.", error);
        }
    }
}
