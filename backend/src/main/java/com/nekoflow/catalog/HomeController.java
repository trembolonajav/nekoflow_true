package com.nekoflow.catalog;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Home com dados reais: destaque, novidades da temporada e episódios recentes paginados. */
@RestController
@RequestMapping("/api/v1/home")
public class HomeController {

    private final HomeService home;
    private final LanguageAvailabilityService languages;

    public HomeController(HomeService home, LanguageAvailabilityService languages) {
        this.home = home;
        this.languages = languages;
    }

    /** Quantas obras cada idioma do site tem e se ele já filtra a vitrine. */
    @GetMapping("/languages")
    public Map<String, Map<String, Object>> languages() {
        return languages.summary();
    }

    @GetMapping
    public Map<String, Object> home(@RequestParam(defaultValue = "pt-BR") String lang,
                                    @RequestParam(defaultValue = "12") int size) {
        return home.home(lang, checkSize(size));
    }

    @GetMapping("/recent")
    public Map<String, Object> recent(@RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "12") int size,
                                      @RequestParam(defaultValue = "pt-BR") String lang) {
        if (page < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Página inválida");
        return home.recent(page, checkSize(size), lang);
    }

    private static int checkSize(int size) {
        if (size < 1 || size > 48) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tamanho inválido");
        return size;
    }
}
