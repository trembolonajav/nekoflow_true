-- Um idioma, um código. Cada fonte escreve do seu jeito (FIB grava "ja-JP", o resto "ja");
-- filtros e agrupamentos por idioma precisam comparar igual. Regra única aqui no banco, para
-- toda fonte atual e futura: idioma em minúsculas, região em maiúsculas, e região só onde
-- ela muda o conteúdo (pt-BR ≠ pt-PT, es-419 ≠ es). Japonês, inglês e espanhol da Espanha
-- ficam sem região.

CREATE OR REPLACE FUNCTION nk_lang(code text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v text := lower(replace(btrim(code), '_', '-'));
    parts text[];
BEGIN
    IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
    v := CASE v
        WHEN 'jp' THEN 'ja' WHEN 'jpn' THEN 'ja' WHEN 'ja-jp' THEN 'ja'
        WHEN 'eng' THEN 'en' WHEN 'en-us' THEN 'en' WHEN 'en-gb' THEN 'en'
        WHEN 'pt' THEN 'pt-br' WHEN 'por' THEN 'pt-br' WHEN 'pt-br' THEN 'pt-br'
        WHEN 'spa' THEN 'es' WHEN 'es-es' THEN 'es' WHEN 'es-mx' THEN 'es-419' WHEN 'es-la' THEN 'es-419'
        ELSE v END;
    IF v IN ('multi', 'und') THEN RETURN v; END IF;
    parts := string_to_array(v, '-');
    -- ja-latn (romaji) mantém o script em Title Case; região sempre em maiúsculas.
    RETURN parts[1] || COALESCE((
        SELECT string_agg('-' || CASE WHEN length(p) = 4 THEN initcap(p) ELSE upper(p) END, '' ORDER BY i)
        FROM unnest(parts[2:]) WITH ORDINALITY AS t(p, i)), '');
END $$;

CREATE OR REPLACE FUNCTION nk_episode_source_lang() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.audio_language := nk_lang(NEW.audio_language);
    NEW.language := nk_lang(NEW.language);
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION nk_row_lang() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.language := nk_lang(NEW.language);
    RETURN NEW;
END $$;

CREATE TRIGGER episode_source_lang BEFORE INSERT OR UPDATE OF audio_language, language ON episode_source
    FOR EACH ROW EXECUTE FUNCTION nk_episode_source_lang();
CREATE TRIGGER chapter_source_lang BEFORE INSERT OR UPDATE OF language ON chapter_source
    FOR EACH ROW EXECUTE FUNCTION nk_row_lang();
CREATE TRIGGER work_edition_lang BEFORE INSERT OR UPDATE OF language ON work_edition
    FOR EACH ROW EXECUTE FUNCTION nk_row_lang();
CREATE TRIGGER media_subtitle_track_lang BEFORE INSERT OR UPDATE OF language ON media_subtitle_track
    FOR EACH ROW EXECUTE FUNCTION nk_row_lang();

UPDATE episode_source SET audio_language = nk_lang(audio_language), language = nk_lang(language)
WHERE audio_language IS DISTINCT FROM nk_lang(audio_language) OR language IS DISTINCT FROM nk_lang(language);
UPDATE chapter_source SET language = nk_lang(language) WHERE language IS DISTINCT FROM nk_lang(language);
UPDATE work_edition SET language = nk_lang(language) WHERE language IS DISTINCT FROM nk_lang(language);
UPDATE media_subtitle_track SET language = nk_lang(language) WHERE language IS DISTINCT FROM nk_lang(language);
