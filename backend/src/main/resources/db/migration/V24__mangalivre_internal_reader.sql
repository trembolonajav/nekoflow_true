-- Capítulos do MangaLivre passam a ser lidos no leitor interno por manifesto dinâmico.
UPDATE chapter_source
SET reports_progress = TRUE
WHERE provider = 'Manga Livre' AND enabled;

UPDATE media_provider
SET allowed_hosts = ARRAY(
    SELECT DISTINCT host
    FROM unnest(allowed_hosts || ARRAY['mangalivre.blog']) AS host
)
WHERE code = 'MANGA_LIVRE_CDN';

