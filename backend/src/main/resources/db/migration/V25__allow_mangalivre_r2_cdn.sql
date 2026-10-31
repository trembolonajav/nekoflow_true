-- CDN atual usado pelas páginas do MangaLivre.
-- Mantemos o host exato em vez de autorizar todo o domínio r2.dev.
UPDATE media_provider
SET allowed_hosts = ARRAY(
    SELECT DISTINCT host
    FROM unnest(allowed_hosts || ARRAY['pub-fd34549394dd487c833b561317c11eed.r2.dev']) AS host
)
WHERE code = 'MANGA_LIVRE_CDN';
