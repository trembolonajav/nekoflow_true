-- Os arquivos do MangaLivre são segmentos consecutivos de uma página contínua.
-- No modo paginado, as transições entre arquivos parecem cortes de conteúdo.
UPDATE work_edition e
SET reading_mode = 'VERTICAL'
WHERE EXISTS (
    SELECT 1
    FROM chapter c
    JOIN chapter_source s ON s.chapter_id = c.id
    WHERE c.edition_id = e.id
      AND s.provider = 'Manga Livre'
      AND s.enabled
);
