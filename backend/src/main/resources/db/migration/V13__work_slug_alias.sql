-- Endereços antigos ou alternativos de uma obra continuam abrindo a mesma ficha.
CREATE TABLE work_slug_alias (
    media_family VARCHAR(16) NOT NULL,
    slug VARCHAR(340) NOT NULL,
    work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (media_family, slug)
);

-- A importação do FIB Anime trocou o slug de obras que já existiam pelo slug do site
-- antigo (e, por casar só pelo título, também de mangás homônimos). O slug do FIB vira
-- apelido e a obra volta ao endereço original: o da V6 para o Heavy Knight e o padrão
-- "titulo-id" da V5 para as demais (mesma expressão da V5). Obras criadas pela importação (id >= 910000000)
-- não tinham outro endereço e ficam como estão.
CREATE TEMP TABLE slug_restore ON COMMIT DROP AS
SELECT w.id, w.media_family, w.slug AS fib_slug,
       CASE WHEN w.id IN (180136, 150193) THEN 'tsuihou-sareta-tensei-juukishi-wa-game-chishiki-de-musou-suru'
            ELSE trim(both '-' from regexp_replace(lower(translate(w.title, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+', '-', 'g')) || '-' || w.id
       END AS original_slug
FROM work w
WHERE w.id < 910000000
  AND (EXISTS (SELECT 1 FROM external_identifier x WHERE x.work_id = w.id AND x.provider = 'FIBANIME')
       OR w.media_family <> 'ANIMATION' OR w.id IN (180136, 150193))
  AND w.slug !~ ('-' || w.id || '$')
  AND w.slug <> CASE WHEN w.id IN (180136, 150193)
                     THEN 'tsuihou-sareta-tensei-juukishi-wa-game-chishiki-de-musou-suru' ELSE '' END;

INSERT INTO work_slug_alias (media_family, slug, work_id)
SELECT media_family, fib_slug, id FROM slug_restore
ON CONFLICT (media_family, slug) DO NOTHING;

UPDATE work w SET slug = r.original_slug, updated_at = now()
FROM slug_restore r
WHERE w.id = r.id
  AND NOT EXISTS (SELECT 1 FROM work o WHERE o.media_family = w.media_family AND o.slug = r.original_slug
                                         AND o.id <> w.id);
