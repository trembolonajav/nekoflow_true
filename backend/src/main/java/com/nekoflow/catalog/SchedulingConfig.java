package com.nekoflow.catalog;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Tarefas periódicas (nova tentativa de sincronização com o AniList). */
@Configuration
@EnableScheduling
class SchedulingConfig {
}
