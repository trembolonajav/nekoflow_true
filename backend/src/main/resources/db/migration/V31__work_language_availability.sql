-- Em que idioma do site cada obra pode ser vista ou lida, somando todas as fontes.
-- É o que decide a vitrine por idioma (Home, Explorar) e os avisos da busca
-- ("só em inglês, legendado"). Idiomas do site: pt-BR, en, es (es-419 conta como es;
-- pt-PT não conta como pt-BR). Áudio japonês sem legenda não conta para nenhum.

CREATE OR REPLACE FUNCTION nk_site_lang(code text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN code = 'pt-BR' THEN 'pt-BR'
        WHEN code = 'en' OR code LIKE 'en-%' THEN 'en'
        WHEN code = 'es' OR code LIKE 'es-%' THEN 'es'
    END
$$;

CREATE MATERIALIZED VIEW work_language_availability AS
SELECT work_id, lang, sum(dub_units)::int AS dub_units, sum(sub_units)::int AS sub_units,
       sum(read_units)::int AS read_units
FROM (
    SELECT se.work_id, l.lang,
           count(DISTINCT e.id) FILTER (WHERE l.kind = 'dub') AS dub_units,
           count(DISTINCT e.id) FILTER (WHERE l.kind = 'sub') AS sub_units,
           0 AS read_units
    FROM episode_source es
    JOIN episode e ON e.id = es.episode_id
    JOIN season se ON se.id = e.season_id AND se.visibility = 'PUBLISHED'
    CROSS JOIN LATERAL (VALUES (nk_site_lang(es.audio_language), 'dub'),
                               (nk_site_lang(es.language), 'sub')) AS l(lang, kind)
    WHERE es.enabled AND l.lang IS NOT NULL
      AND (es.available_from IS NULL OR es.available_from <= now())
      AND (es.available_until IS NULL OR es.available_until > now())
    GROUP BY se.work_id, l.lang
    UNION ALL
    SELECT ed.work_id, nk_site_lang(ed.language), 0, 0, count(DISTINCT c.id)
    FROM work_edition ed
    JOIN chapter c ON c.edition_id = ed.id
    WHERE nk_site_lang(ed.language) IS NOT NULL
      AND (EXISTS (SELECT 1 FROM chapter_source cs WHERE cs.chapter_id = c.id AND cs.enabled)
           OR EXISTS (SELECT 1 FROM chapter_import ci WHERE ci.chapter_id = c.id AND ci.edition_id = c.edition_id
                      AND ci.status = 'PUBLISHED'))
    GROUP BY ed.work_id, nk_site_lang(ed.language)
) x
GROUP BY work_id, lang;

-- Necessário para REFRESH ... CONCURRENTLY (leitura não trava durante a atualização).
CREATE UNIQUE INDEX work_language_availability_uk ON work_language_availability(work_id, lang);
CREATE INDEX work_language_availability_lang_idx ON work_language_availability(lang);
