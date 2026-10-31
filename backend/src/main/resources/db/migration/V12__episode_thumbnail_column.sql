-- Miniatura usada nos cards de episódio das fichas. A V10 (catálogo importado) também
-- cria esta coluna; IF NOT EXISTS mantém a migração válida com ou sem ela.
ALTER TABLE episode ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
