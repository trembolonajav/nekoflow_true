-- Dororo: ficha pública e links de episódios publicados pelo Sushi Animes.
-- A origem não oferece iframe reutilizável e a CDN bloqueia hotlink. Portanto,
-- estas fontes são deliberadamente EXTERNAL_LINK; não há proxy nem Referer forjado.

INSERT INTO work(id,kind,title,alt_titles,cover,year,total_units,available_units,airing_status,
                 slug,media_family,work_format,original_language,origin_country,
                 synopsis_short,synopsis_full,synopsis_source,synopsis_language,
                 story_status,visibility,content_rating)
SELECT COALESCE(MAX(id),0)+1,'anime','Dororo','Dororo (2019)',
       'https://sushianimes.com.br/public/upload/cover/dororo.webp',2019,24,24,'Complete',
       'dororo-2019','ANIMATION','TV','ja','JP',
       'No Japão feudal, Hyakkimaru viaja ao lado do jovem Dororo para recuperar as partes de seu corpo tomadas por demônios.',
       'No Japão feudal, Lord Daigo Kagemitsu faz um acordo com 12 demônios, trocando seu filho ainda não nascido pela prosperidade de suas terras. A criança é abandonada, mas sobrevive. Anos depois, Dororo conhece Hyakkimaru, que enfrenta monstros para recuperar as partes de seu corpo.',
       'Sushi Animes — metadados públicos Schema.org','pt-BR','COMPLETED','PUBLISHED','MATURE'
FROM work
ON CONFLICT (media_family,slug) DO NOTHING;

INSERT INTO external_identifier(work_id,provider,external_id)
SELECT id,'SUSHI_ANIMES','dororo-1191' FROM work
WHERE media_family='ANIMATION' AND slug='dororo-2019'
ON CONFLICT DO NOTHING;

INSERT INTO work_title(work_id,title,title_norm,title_type,language)
SELECT id,'Dororo','dororo','PRIMARY','ja-Latn' FROM work
WHERE media_family='ANIMATION' AND slug='dororo-2019'
ON CONFLICT DO NOTHING;

INSERT INTO season(work_id,title,display_number,sort_position,release_date,visibility)
SELECT id,'Temporada 1','1',1,'2019-01-07','PUBLISHED' FROM work
WHERE media_family='ANIMATION' AND slug='dororo-2019'
ON CONFLICT (work_id,sort_position) DO UPDATE SET visibility='PUBLISHED';

WITH source(number,title) AS (VALUES
  (1,'A história de Daigo'),
  (2,'A história de Bandai'),
  (3,'A história de Jukai'),
  (4,'A história da espada amaldiçoada'),
  (5,'A história da canção Moriko, parte 1'),
  (6,'A história da canção Moriko, parte 2'),
  (7,'A história da aranha Jorogumo'),
  (8,'A história de Saru'),
  (9,'A história da crueldade'),
  (10,'A história de Tahomaru'),
  (11,'A história de Banmon, parte 1'),
  (12,'A história de Banmon, parte 2'),
  (13,'A história do Buda sem rosto'),
  (14,'A história de Sabame'),
  (15,'A história do painel do inferno'),
  (16,'A história de Shiranui'),
  (17,'A história das perguntas e respostas'),
  (18,'A história do cabo da transitoriedade'),
  (19,'A história de Amanojaku'),
  (20,'A história de Nue'),
  (21,'A história da quebra do ciclo de sofrimento'),
  (22,'A história de Nui'),
  (23,'A história dos demônios'),
  (24,'Dororo e Hyakkimaru')
)
INSERT INTO episode(season_id,title,display_number,sort_position,duration_seconds,
                    availability,source_page_url)
SELECT s.id,source.title,source.number::text,source.number,1440,'EXTERNAL_LINK',
       'https://sushianimes.com.br/anime/dororo-1191-1-season-' || source.number || '-episode'
FROM source
JOIN season s ON s.work_id=(SELECT id FROM work WHERE media_family='ANIMATION' AND slug='dororo-2019')
             AND s.sort_position=1
ON CONFLICT (season_id,sort_position) DO UPDATE SET
  title=EXCLUDED.title, display_number=EXCLUDED.display_number,
  duration_seconds=EXCLUDED.duration_seconds, availability='EXTERNAL_LINK',
  source_page_url=EXCLUDED.source_page_url;

INSERT INTO episode_source(episode_id,source_type,source_url,provider,language,embed_allowed,
                           enabled,provenance,reports_progress,label,priority,audio_language)
SELECT e.id,'EXTERNAL_LINK',e.source_page_url,'Sushi Animes','pt-BR',FALSE,TRUE,
       'Página pública do episódio no Sushi Animes; a origem não oferece embed autorizado e a CDN bloqueia hotlink.',
       FALSE,'Sushi Animes · abrir no provedor',100,NULL
FROM episode e
JOIN season s ON s.id=e.season_id
JOIN work w ON w.id=s.work_id
WHERE w.media_family='ANIMATION' AND w.slug='dororo-2019'
ON CONFLICT (episode_id,source_type,source_url) DO UPDATE SET
  enabled=TRUE, embed_allowed=FALSE, label=EXCLUDED.label,
  provenance=EXCLUDED.provenance, updated_at=now();

