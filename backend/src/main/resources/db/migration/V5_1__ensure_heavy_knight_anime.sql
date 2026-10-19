-- Correção para instalações novas: a V6 completa e relaciona o anime AniList 180136,
-- mas esse registro só existia porque o CatalogSeeder (Java, executado depois do Flyway)
-- já o tinha criado. Num banco vazio a V6 falhava na chave estrangeira de external_identifier.
-- Aqui garantimos a linha mínima; a V6 preenche os metadados editoriais.
-- Em bancos que já passaram da V6 esta migração roda fora de ordem e não altera nada.
INSERT INTO work (id, kind, title, slug, media_family, work_format, visibility)
VALUES (180136, 'anime', 'The Exiled Heavy Knight Knows How to Game the System',
        'tsuihou-sareta-tensei-juukishi-wa-game-chishiki-de-musou-suru', 'ANIMATION', 'SERIES', 'PUBLISHED')
ON CONFLICT (id) DO NOTHING;
