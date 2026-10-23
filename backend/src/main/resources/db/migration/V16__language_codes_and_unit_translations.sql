-- Idiomas em BCP 47 curto e estável: "ja" (não "ja-JP"), "pt-BR", "en", "es".
-- "multi" continua indicando áudio duplo cujos idiomas a fonte não detalha.
UPDATE episode_source SET audio_language = 'ja' WHERE audio_language IN ('ja-JP', 'jp', 'jpn');
UPDATE episode_source SET audio_language = 'pt-BR' WHERE audio_language IN ('pt', 'pt-br', 'por');
UPDATE episode_source SET language = 'pt-BR' WHERE language IN ('pt', 'pt-br', 'por');
UPDATE episode_source SET language = 'en' WHERE language IN ('en-US', 'en-GB', 'eng');
UPDATE episode_source SET language = 'es' WHERE language IN ('es-ES', 'es-419', 'spa');
UPDATE episode_source SET language = NULL WHERE language = '';

-- Textos editoriais por idioma das unidades e dos personagens. O original nunca é
-- sobrescrito; a API escolhe idioma pedido → mesmo idioma base → inglês → original.
CREATE TABLE episode_translation (
    episode_id UUID NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
    language VARCHAR(16) NOT NULL,
    title VARCHAR(300),
    synopsis TEXT,
    source VARCHAR(240),
    reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (episode_id, language)
);

CREATE TABLE character_translation (
    work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    anilist_character_id BIGINT NOT NULL,
    language VARCHAR(16) NOT NULL,
    description TEXT,
    source VARCHAR(240),
    reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (work_id, anilist_character_id, language)
);

-- O retrato do AniList passa a trazer o elenco de voz de todos os idiomas: força a
-- próxima sincronização a atualizar as obras já baixadas.
UPDATE work_anilist_snapshot SET fetched_at = now() - interval '8 days';
