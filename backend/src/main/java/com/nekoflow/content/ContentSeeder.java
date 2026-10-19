package com.nekoflow.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Carrega os JSON de classpath:seed/ (os dados do Claude Design) no banco na
 * primeira subida. Documentos que já existem não são sobrescritos.
 */
@Component
@org.springframework.core.annotation.Order(1)
public class ContentSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ContentSeeder.class);

    private final ContentDocumentRepository repository;
    private final ObjectMapper objectMapper;

    public ContentSeeder(ContentDocumentRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws IOException {
        Resource[] seeds = new PathMatchingResourcePatternResolver().getResources("classpath:seed/*.json");
        int created = 0;
        for (Resource seed : seeds) {
            String key = seed.getFilename().replaceFirst("\\.json$", "");
            if (repository.existsById(key)) {
                continue;
            }
            try (InputStream in = seed.getInputStream()) {
                repository.save(new ContentDocument(key, objectMapper.readTree(in)));
                created++;
            }
        }
        log.info("Conteúdo: {} documento(s) novo(s) de {} seed(s)", created, seeds.length);
    }
}
