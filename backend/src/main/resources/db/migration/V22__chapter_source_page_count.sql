-- Contagem observada no leitor do provedor, sem copiar as imagens para o NekoFlow.
ALTER TABLE chapter_source
    ADD COLUMN page_count INT CHECK (page_count IS NULL OR page_count > 0);

-- Preserva inventários feitos antes da criação da coluna estruturada.
UPDATE chapter_source
SET page_count = substring(provenance FROM '; ([0-9]+) páginas observadas')::INT
WHERE provider = 'Manga Livre'
  AND provenance ~ '; [0-9]+ páginas observadas';

