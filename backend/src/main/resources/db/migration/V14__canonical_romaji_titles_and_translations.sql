-- Títulos exibidos permanecem em romaji. Inglês, escrita nativa e sinônimos
-- continuam indexados em work_title para que qualquer variante encontre a obra.
UPDATE work w
SET title = s.payload #>> '{title,romaji}', updated_at = now()
FROM work_anilist_snapshot s
WHERE s.work_id = w.id
  AND NULLIF(s.payload #>> '{title,romaji}', '') IS NOT NULL
  AND w.media_family = 'ANIMATION';

INSERT INTO work_title(work_id,title,title_norm,title_type,language)
SELECT s.work_id, value, lower(value), title_type, language
FROM work_anilist_snapshot s
CROSS JOIN LATERAL (VALUES
    (NULLIF(s.payload #>> '{title,romaji}', ''), 'ROMAJI', 'ja-Latn'),
    (NULLIF(s.payload #>> '{title,english}', ''), 'ENGLISH', 'en'),
    (NULLIF(s.payload #>> '{title,native}', ''), 'ORIGINAL', 'ja')
) AS titles(value,title_type,language)
WHERE value IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO work_title(work_id,title,title_norm,title_type,language)
SELECT s.work_id, synonym, lower(synonym), 'ALIAS', NULL
FROM work_anilist_snapshot s
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.payload->'synonyms','[]'::jsonb)) synonym
WHERE NULLIF(trim(synonym), '') IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE work w
SET alt_titles = aliases.value
FROM (
    SELECT work_id, string_agg(DISTINCT title, ' | ' ORDER BY title) AS value
    FROM work_title GROUP BY work_id
) aliases
WHERE aliases.work_id = w.id;

-- Sinopses são conteúdo editorial localizado, separado do título canônico.
CREATE TABLE work_translation (
    id BIGSERIAL PRIMARY KEY,
    work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    language VARCHAR(16) NOT NULL,
    synopsis_short TEXT,
    synopsis_full TEXT,
    source VARCHAR(240),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(work_id,language)
);
CREATE INDEX work_translation_lookup_idx ON work_translation(work_id,language);

INSERT INTO work_translation(work_id,language,synopsis_short,synopsis_full,source)
SELECT id, COALESCE(NULLIF(synopsis_language,''),'pt-BR'), synopsis_short, synopsis_full, synopsis_source
FROM work
WHERE synopsis_short IS NOT NULL OR synopsis_full IS NOT NULL
ON CONFLICT (work_id,language) DO NOTHING;
