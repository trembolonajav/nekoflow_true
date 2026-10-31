-- Protocolo 04: fontes externas autorizadas e caso editorial real de aprovação.
-- Os arquivos de vídeo e as páginas do capítulo não são copiados pelo NekoFlow.
CREATE TABLE episode_source (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
    source_type VARCHAR(20) NOT NULL,
    source_url TEXT NOT NULL,
    provider VARCHAR(80) NOT NULL,
    language VARCHAR(16),
    embed_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    provenance TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (episode_id, source_type, source_url),
    CHECK (source_type IN ('EMBED', 'EXTERNAL_LINK'))
);

CREATE TABLE chapter_source (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
    source_type VARCHAR(20) NOT NULL,
    source_url TEXT NOT NULL,
    provider VARCHAR(80) NOT NULL,
    language VARCHAR(16),
    embed_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    provenance TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chapter_id, source_type, source_url),
    CHECK (source_type IN ('EMBED', 'EXTERNAL_LINK'))
);

CREATE INDEX episode_source_available_idx ON episode_source(episode_id) WHERE enabled;
CREATE INDEX chapter_source_available_idx ON chapter_source(chapter_id) WHERE enabled;

-- O anime já fazia parte do catálogo legado. A ficha oficial pública do AniList
-- completa os campos editoriais sem inventar banner (o registro não possui um).
UPDATE work SET
    title = 'The Exiled Heavy Knight Knows How to Game the System',
    alt_titles = 'Tsuihou Sareta Tensei Juukishi wa Game Chishiki de Musou Suru | 追放された転生重騎士はゲーム知識で無双する | The Exiled Reincarnated Heavy Knight Is Unrivaled in Game Knowledge',
    slug = 'tsuihou-sareta-tensei-juukishi-wa-game-chishiki-de-musou-suru',
    media_family = 'ANIMATION', work_format = 'SERIES', original_language = 'ja',
    origin_country = 'JP', year = 2026, total_units = 26, available_units = 1,
    synopsis_short = 'Expulso após despertar a classe considerada defeituosa de Cavaleiro Pesado, Elymas usa as memórias de um jogo de outra vida para provar o verdadeiro potencial da classe.',
    synopsis_full = 'Nascido em uma prestigiada família de mestres espadachins, Elymas Edvaughn vê seu futuro ruir ao despertar a classe considerada defeituosa de Cavaleiro Pesado. Deserdado e expulso, ele recupera memórias de outra vida e percebe que aquele mundo espelha um jogo que dominava. Com um conhecimento que ninguém mais possui, parte para reescrever seu destino e demonstrar a força da classe tida como a mais fraca.',
    story_status = 'ONGOING', visibility = 'PUBLISHED',
    cover = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx180136-gtMTCRlOD4OE.jpg',
    banner = NULL, airing_status = 'Em lançamento', updated_at = now()
WHERE id = 180136;

-- Mangá, distinto da light novel AniList 150194 e da adaptação animada.
INSERT INTO work (id, kind, title, alt_titles, cover, banner, webtoon, year, total_units,
                  available_units, airing_status, popularity, slug, media_family, work_format,
                  reading_category, presentation_format, original_language, origin_country,
                  synopsis_short, synopsis_full, story_status, visibility, original_release_date)
VALUES (150193, 'manga', 'The Exiled Heavy Knight Knows How to Game the System',
        'Tsuihou Sareta Tensei Juukishi wa Game Chishiki de Musou Suru | 追放された転生重騎士はゲーム知識で無双する | The Exiled Reincarnated Heavy Knight Is Unrivaled in Game Knowledge',
        'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx150193-XBdISLm3IDr1.jpg',
        NULL, FALSE, 2022, NULL, 1, 'Em lançamento', NULL,
        'tsuihou-sareta-tensei-juukishi-wa-game-chishiki-de-musou-suru',
        'READING', 'COMIC', 'MANGA', 'PAGED', 'ja', 'JP',
        'Expulso por receber a classe Cavaleiro Pesado, Elymas usa o conhecimento de sua vida anterior para transformar a classe desprezada em sua maior vantagem.',
        'No Ritual da Bênção Divina, Elymas deveria herdar a tradição de mestres espadachins de sua família, mas recebe a classe Cavaleiro Pesado e é exilado. O que ninguém sabe é que ele reconhece aquele mundo como o jogo de sua vida anterior e conhece o verdadeiro potencial dessa classe. Com essas memórias, começa a conquistar o mundo com eficiência.',
        'ONGOING', 'PUBLISHED', DATE '2022-02-11')
ON CONFLICT (id) DO UPDATE SET
    cover = EXCLUDED.cover, synopsis_short = EXCLUDED.synopsis_short,
    synopsis_full = EXCLUDED.synopsis_full, available_units = GREATEST(work.available_units, 1),
    updated_at = now();

INSERT INTO external_identifier(work_id, provider, external_id) VALUES
    (180136, 'ANILIST', '180136'), (150193, 'ANILIST', '150193')
ON CONFLICT DO NOTHING;

INSERT INTO work_title(work_id,title,title_norm,title_type,language) VALUES
    (180136,'Tsuihou Sareta Tensei Juukishi wa Game Chishiki de Musou Suru',lower('Tsuihou Sareta Tensei Juukishi wa Game Chishiki de Musou Suru'),'ROMAJI','ja-Latn'),
    (180136,'追放された転生重騎士はゲーム知識で無双する',lower('追放された転生重騎士はゲーム知識で無双する'),'ORIGINAL','ja'),
    (150193,'The Exiled Heavy Knight Knows How to Game the System',lower('The Exiled Heavy Knight Knows How to Game the System'),'PRIMARY','en'),
    (150193,'Tsuihou Sareta Tensei Juukishi wa Game Chishiki de Musou Suru',lower('Tsuihou Sareta Tensei Juukishi wa Game Chishiki de Musou Suru'),'ROMAJI','ja-Latn'),
    (150193,'追放された転生重騎士はゲーム知識で無双する',lower('追放された転生重騎士はゲーム知識で無双する'),'ORIGINAL','ja')
ON CONFLICT DO NOTHING;

INSERT INTO genre(slug,name) VALUES ('action','Ação'),('fantasy','Fantasia') ON CONFLICT DO NOTHING;
INSERT INTO work_genre(work_id,genre_id,position)
SELECT w, g.id, p FROM (VALUES (180136::bigint,'action',0),(180136,'fantasy',1),(150193,'action',0),(150193,'fantasy',1)) x(w,s,p)
JOIN genre g ON g.slug=x.s ON CONFLICT DO NOTHING;

INSERT INTO tag(slug,name) VALUES ('isekai','Isekai'),('reincarnation','Reencarnação'),('exiled','Exílio'),('dungeon','Dungeon') ON CONFLICT DO NOTHING;
INSERT INTO work_tag(work_id,tag_id)
SELECT w,g.id FROM (VALUES (180136::bigint,'isekai'),(180136,'reincarnation'),(180136,'exiled'),(180136,'dungeon'),(150193,'isekai'),(150193,'reincarnation'),(150193,'exiled')) x(w,s)
JOIN tag g ON g.slug=x.s ON CONFLICT DO NOTHING;

INSERT INTO media_asset(work_id,asset_type,url,alt_text,provenance) VALUES
    (180136,'COVER','https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx180136-gtMTCRlOD4OE.jpg','Capa do anime The Exiled Heavy Knight','AniList 180136'),
    (150193,'COVER','https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx150193-XBdISLm3IDr1.jpg','Capa do mangá The Exiled Heavy Knight','AniList 150193')
ON CONFLICT DO NOTHING;

INSERT INTO person(id,name,name_norm) VALUES
    ('cfa925b3-9baa-42af-aef3-2291d440d280','Nekoko','nekoko'),
    ('fb0a7266-df2d-4419-9f26-449b3d4c25b0','Jaian','jaian'),
    ('58593bf2-81ab-4e6b-91b0-a1f9cc68e7af','Lee Brocco','lee brocco'),
    ('40c84e8c-2955-4692-b8ae-3cd3fc172af1','GoHands','gohands')
ON CONFLICT (id) DO NOTHING;
INSERT INTO work_contributor(work_id,person_id,role,position) VALUES
    (150193,'cfa925b3-9baa-42af-aef3-2291d440d280','ORIGINAL_STORY',0),
    (150193,'fb0a7266-df2d-4419-9f26-449b3d4c25b0','CHARACTER_DESIGN',1),
    (150193,'58593bf2-81ab-4e6b-91b0-a1f9cc68e7af','STORY_AND_ART',2),
    (180136,'40c84e8c-2955-4692-b8ae-3cd3fc172af1','STUDIO',0)
ON CONFLICT DO NOTHING;

INSERT INTO franchise(id,slug,name) VALUES
    ('aaf31c17-bda1-4ed5-9616-819488571b01','heavy-knight','The Exiled Heavy Knight')
ON CONFLICT DO NOTHING;
INSERT INTO franchise_work(franchise_id,work_id,position) VALUES
    ('aaf31c17-bda1-4ed5-9616-819488571b01',150193,0),
    ('aaf31c17-bda1-4ed5-9616-819488571b01',180136,1)
ON CONFLICT DO NOTHING;
INSERT INTO work_relation(source_work_id,target_work_id,relation_type) VALUES
    (180136,150193,'ADAPTATION'),(150193,180136,'ANIME_ADAPTATION')
ON CONFLICT DO NOTHING;

INSERT INTO season(id,work_id,title,display_number,sort_position,release_date,visibility) VALUES
    ('62ec031d-567e-49ae-83bb-b50452a30710',180136,'Temporada 1','1',1,DATE '2026-07-01','PUBLISHED')
ON CONFLICT (id) DO NOTHING;
INSERT INTO episode(id,season_id,title,display_number,sort_position,duration_seconds,availability) VALUES
    ('f5caf477-8a19-4b83-bff6-28afe646d970','62ec031d-567e-49ae-83bb-b50452a30710','O Cavaleiro Pesado Exilado','1',1,1440,'EMBED')
ON CONFLICT (id) DO NOTHING;
INSERT INTO episode_source(episode_id,source_type,source_url,provider,language,embed_allowed,provenance) VALUES
    ('f5caf477-8a19-4b83-bff6-28afe646d970','EMBED',
     'https://api.anivideo.net/videohls.php?d=https://cdn-sv01.maximaimg.online/stream/t/tsuihou-sareta-tensei-juu-kishi-wa-game-chishiki-de-musou-suru/01.mp4/index.m3u8',
     'Animes Digital / AniVideo','pt-BR',TRUE,
     'Fonte fornecida e autorizada pelo proprietário do antigo site Animes Digital em 2026-10-19.')
ON CONFLICT DO NOTHING;

INSERT INTO work_edition(id,work_id,name,language,is_original) VALUES
    ('730f4dc0-df87-4f8a-85e7-90c4ac32e34f',150193,'Português — Manga Livre','pt-BR',FALSE)
ON CONFLICT (id) DO NOTHING;
INSERT INTO volume(id,edition_id,title,display_number,sort_position) VALUES
    ('5cbbeb46-4bbc-4555-85c5-a006c0b965e5','730f4dc0-df87-4f8a-85e7-90c4ac32e34f','Volume 1','1',1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO chapter(id,edition_id,volume_id,title,display_number,sort_position,availability) VALUES
    ('32918cb2-d95c-4f1d-b480-112a2ca75f92','730f4dc0-df87-4f8a-85e7-90c4ac32e34f','5cbbeb46-4bbc-4555-85c5-a006c0b965e5','Capítulo 1','1',1,'EXTERNAL_LINK')
ON CONFLICT (id) DO NOTHING;
INSERT INTO chapter_source(chapter_id,source_type,source_url,provider,language,embed_allowed,provenance) VALUES
    ('32918cb2-d95c-4f1d-b480-112a2ca75f92','EXTERNAL_LINK',
     'https://mangalivre.blog/capitulo/tsuihou-sareta-tensei-juukishi-wa-game-chishiki-de-musou-suru-capitulo-1/',
     'Manga Livre','pt-BR',FALSE,
     'Capítulo fornecido e autorizado pelo responsável pelo Manga Livre em 2026-10-19; leitura permanece no provedor.')
ON CONFLICT DO NOTHING;
