-- Metadados editoriais usados nos cards de episódio. As URLs apontam para a
-- página pública de origem, nunca para o arquivo de vídeo.
ALTER TABLE episode ADD COLUMN thumbnail_url TEXT;
ALTER TABLE episode ADD COLUMN source_page_url TEXT;

