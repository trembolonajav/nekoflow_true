-- Protocolo 06: mídia real (reprodução e leitura).
-- O PostgreSQL guarda apenas metadados e referências: vídeos e imagens ficam no
-- provedor/CDN ou no armazenamento de objetos local, nunca como binário no banco.

-- Provedores autorizados. Uma fonte só é aceita se o host da URL estiver na lista
-- do provedor; o backend nunca busca URLs arbitrárias enviadas pelo navegador.
CREATE TABLE media_provider (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    media_kind VARCHAR(10) NOT NULL CHECK (media_kind IN ('VIDEO', 'IMAGE')),
    allowed_hosts TEXT[] NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    terms_note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fontes de episódio: novos tipos reproduzíveis pelo player do NekoFlow.
ALTER TABLE episode_source DROP CONSTRAINT episode_source_source_type_check;
ALTER TABLE episode_source ADD CONSTRAINT episode_source_source_type_check
    CHECK (source_type IN ('HLS', 'DASH', 'MP4', 'EMBED', 'EXTERNAL_LINK'));
ALTER TABLE episode_source
    ADD COLUMN provider_id UUID REFERENCES media_provider(id),
    ADD COLUMN label VARCHAR(80),
    ADD COLUMN priority INT NOT NULL DEFAULT 100,
    ADD COLUMN audio_language VARCHAR(16),
    ADD COLUMN max_height INT,
    ADD COLUMN available_from TIMESTAMPTZ,
    ADD COLUMN available_until TIMESTAMPTZ,
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD CONSTRAINT episode_source_window_ck
        CHECK (available_until IS NULL OR available_from IS NULL OR available_until > available_from);

-- Faixas de legenda separadas (WebVTT). Faixas embutidas no manifesto HLS são lidas
-- pelo próprio player; aqui ficam só arquivos externos declarados pelo editorial.
CREATE TABLE media_subtitle_track (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_source_id UUID NOT NULL REFERENCES episode_source(id) ON DELETE CASCADE,
    language VARCHAR(16) NOT NULL,
    label VARCHAR(80) NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'SUBTITLES' CHECK (kind IN ('SUBTITLES', 'FORCED', 'CAPTIONS')),
    url TEXT NOT NULL,
    UNIQUE (episode_source_id, language, kind)
);

-- Marcações editoriais (abertura, encerramento, recapitulação, prévia).
CREATE TABLE episode_marker (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('INTRO', 'OUTRO', 'RECAP', 'PREVIEW')),
    start_ms BIGINT NOT NULL CHECK (start_ms >= 0),
    end_ms BIGINT NOT NULL,
    CHECK (end_ms > start_ms),
    UNIQUE (episode_id, kind)
);

-- Problemas informados por usuários (sem tokens, URLs assinadas ou dados sensíveis).
CREATE TABLE media_issue_report (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
    episode_id UUID REFERENCES episode(id) ON DELETE CASCADE,
    episode_source_id UUID REFERENCES episode_source(id) ON DELETE SET NULL,
    chapter_id UUID REFERENCES chapter(id) ON DELETE CASCADE,
    edition_id UUID REFERENCES work_edition(id) ON DELETE CASCADE,
    page_position INT,
    category VARCHAR(24) NOT NULL CHECK (category IN
        ('VIDEO_NOT_LOADING', 'WRONG_AUDIO', 'SUBTITLE_SYNC', 'WRONG_EPISODE', 'IMAGE_MISSING', 'WRONG_ORDER', 'OTHER')),
    detail VARCHAR(500),
    position_ms BIGINT,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((episode_id IS NOT NULL) <> (chapter_id IS NOT NULL))
);
CREATE INDEX media_issue_report_open_idx ON media_issue_report(created_at DESC) WHERE status = 'OPEN';

-- Configuração de leitura por edição (o mesmo leitor atende mangá, manhwa e webtoon).
ALTER TABLE work_edition
    ADD COLUMN reading_mode VARCHAR(10) NOT NULL DEFAULT 'PAGED' CHECK (reading_mode IN ('PAGED', 'VERTICAL')),
    ADD COLUMN reading_direction VARCHAR(3) NOT NULL DEFAULT 'RTL' CHECK (reading_direction IN ('RTL', 'LTR'));

-- Importação editorial: um lote de páginas de UM capítulo + edição. Só um lote
-- publicado por capítulo/edição; lotes em processamento ou com falha nunca aparecem.
CREATE TABLE chapter_import (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL,
    edition_id UUID NOT NULL,
    origin VARCHAR(10) NOT NULL CHECK (origin IN ('UPLOAD', 'PROVIDER')),
    status VARCHAR(12) NOT NULL CHECK (status IN ('PROCESSING', 'READY', 'PUBLISHED', 'FAILED', 'DISCARDED', 'REPLACED')),
    page_count INT NOT NULL DEFAULT 0,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    provenance TEXT NOT NULL,
    created_by BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    FOREIGN KEY (chapter_id, edition_id) REFERENCES chapter(id, edition_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX chapter_import_published_uk ON chapter_import(chapter_id, edition_id) WHERE status = 'PUBLISHED';

CREATE TABLE chapter_page (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID NOT NULL REFERENCES chapter_import(id) ON DELETE CASCADE,
    position INT NOT NULL CHECK (position >= 1),
    storage VARCHAR(10) NOT NULL CHECK (storage IN ('LOCAL', 'PROVIDER')),
    asset_key TEXT,
    provider_id UUID REFERENCES media_provider(id),
    source_url TEXT,
    width INT NOT NULL CHECK (width > 0),
    height INT NOT NULL CHECK (height > 0),
    page_type VARCHAR(8) NOT NULL DEFAULT 'SINGLE' CHECK (page_type IN ('SINGLE', 'DOUBLE', 'SEGMENT')),
    mime_type VARCHAR(40) NOT NULL,
    byte_size BIGINT,
    checksum VARCHAR(64),
    status VARCHAR(10) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('PROCESSING', 'AVAILABLE', 'ERROR', 'HIDDEN')),
    UNIQUE (import_id, position),
    CHECK ((storage = 'LOCAL' AND asset_key IS NOT NULL)
        OR (storage = 'PROVIDER' AND source_url IS NOT NULL AND provider_id IS NOT NULL))
);

-- Sinopse vinda do AniList, com atribuição e data da última sincronização.
ALTER TABLE work
    ADD COLUMN synopsis_source VARCHAR(160),
    ADD COLUMN synopsis_language VARCHAR(16),
    ADD COLUMN anilist_synced_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Caso Heavy Knight (fontes autorizadas pelos responsáveis em 2026-10-19).
-- ---------------------------------------------------------------------------
INSERT INTO media_provider (id, code, name, media_kind, allowed_hosts, terms_note) VALUES
    ('0c3f7a52-6f5e-4c1b-9a51-2d7c1e6b8a01', 'ANIMES_DIGITAL_CDN', 'Animes Digital (CDN de vídeo)', 'VIDEO',
     ARRAY['cdn-sv01.maximaimg.online'],
     'Stream HLS fornecido e autorizado pelo proprietário do Animes Digital. Validado em 2026-10-19: manifesto VOD com CORS aberto, H.264 1080p + AAC estéreo, sem faixas de legenda separadas.'),
    ('0c3f7a52-6f5e-4c1b-9a51-2d7c1e6b8a02', 'MANGA_LIVRE_CDN', 'Manga Livre (CDN de imagens)', 'IMAGE',
     ARRAY['livre.xn--c5wx58dnej.online'],
     'Páginas servidas pelo CDN do Manga Livre, autorizadas pelo responsável. O NekoFlow referencia as imagens; não copia os arquivos.')
ON CONFLICT (code) DO NOTHING;

-- A fonte externa existente vira alternativa; o HLS autorizado passa a ser a principal.
UPDATE episode_source SET label = 'Site do Animes Digital', priority = 20, audio_language = 'ja', updated_at = now()
WHERE episode_id = 'f5caf477-8a19-4b83-bff6-28afe646d970' AND source_type = 'EXTERNAL_LINK';

INSERT INTO episode_source (episode_id, source_type, source_url, provider, language, embed_allowed, provenance,
                            reports_progress, provider_id, label, priority, audio_language, max_height)
VALUES ('f5caf477-8a19-4b83-bff6-28afe646d970', 'HLS',
        'https://cdn-sv01.maximaimg.online/stream/t/tsuihou-sareta-tensei-juu-kishi-wa-game-chishiki-de-musou-suru/01.mp4/index.m3u8',
        'Animes Digital', 'pt-BR', FALSE,
        'Stream original do player do Animes Digital, autorizado pelo proprietário em 2026-10-19. Reproduzido diretamente pelo player do NekoFlow.',
        TRUE, '0c3f7a52-6f5e-4c1b-9a51-2d7c1e6b8a01', 'Animes Digital · HLS', 10, 'ja', 1080)
ON CONFLICT DO NOTHING;

UPDATE episode SET availability = 'STREAM' WHERE id = 'f5caf477-8a19-4b83-bff6-28afe646d970';

-- Mangá japonês: leitura paginada da direita para a esquerda.
UPDATE work_edition SET reading_mode = 'PAGED', reading_direction = 'RTL'
WHERE id = '730f4dc0-df87-4f8a-85e7-90c4ac32e34f';

INSERT INTO chapter_import (id, chapter_id, edition_id, origin, status, page_count, report, provenance, published_at)
VALUES ('5d1b0e8e-3c7a-4f0e-b3b4-6a2f9d1c7e01', '32918cb2-d95c-4f1d-b480-112a2ca75f92',
        '730f4dc0-df87-4f8a-85e7-90c4ac32e34f', 'PROVIDER', 'PUBLISHED', 38,
        '{"validatedAt":"2026-10-19","pages":38,"doublePages":[3,34],"note":"Dimensões lidas do cabeçalho WebP de cada página."}'::jsonb,
        'Capítulo 1 do Manga Livre, autorizado pelo responsável em 2026-10-19; as imagens permanecem no CDN do provedor.',
        now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO chapter_page (import_id, position, storage, provider_id, source_url, width, height, page_type, mime_type)
SELECT '5d1b0e8e-3c7a-4f0e-b3b4-6a2f9d1c7e01', p.pos, 'PROVIDER', '0c3f7a52-6f5e-4c1b-9a51-2d7c1e6b8a02',
       'https://livre.xn--c5wx58dnej.online/mui/slimeread/534620/' || p.file, p.w, p.h, p.t, 'image/webp'
FROM (VALUES
    (1,'page-001-da8660ae2cd6.webp',960,540,'SINGLE'),
    (2,'page-002-eb6a13f02962.webp',1080,1537,'SINGLE'),
    (3,'page-003-538104efada8.webp',1080,767,'DOUBLE'),
    (4,'page-004-621b20c08989.webp',1080,1537,'SINGLE'),
    (5,'page-005-c81f1db6cf9c.webp',1080,1537,'SINGLE'),
    (6,'page-006-194bcc36ef50.webp',1080,1537,'SINGLE'),
    (7,'page-007-3779e76b60b3.webp',1080,1537,'SINGLE'),
    (8,'page-008-90547a42816d.webp',1080,1537,'SINGLE'),
    (9,'page-009-9a13ab2b8985.webp',1080,1537,'SINGLE'),
    (10,'page-010-9721b1b7183f.webp',1080,1537,'SINGLE'),
    (11,'page-011-1f08dac85410.webp',1080,1537,'SINGLE'),
    (12,'page-012-707eb3cc8dc8.webp',1080,1537,'SINGLE'),
    (13,'page-013-2a6ba76ed749.webp',1080,1537,'SINGLE'),
    (14,'page-014-8067b946fe1d.webp',1080,1537,'SINGLE'),
    (15,'page-015-f998e907baa9.webp',1080,1537,'SINGLE'),
    (16,'page-016-d7cda601b15e.webp',1080,1537,'SINGLE'),
    (17,'page-017-75b63e77d54a.webp',1080,1537,'SINGLE'),
    (18,'page-018-f6f39033ed80.webp',1080,1537,'SINGLE'),
    (19,'page-019-67fd886a2aa1.webp',1080,1537,'SINGLE'),
    (20,'page-020-f075b1bb60a4.webp',1080,1537,'SINGLE'),
    (21,'page-021-6062d37b25b8.webp',1080,1537,'SINGLE'),
    (22,'page-022-ce6a53755dad.webp',1080,1537,'SINGLE'),
    (23,'page-023-0299d0f5db0e.webp',1080,1537,'SINGLE'),
    (24,'page-024-f3cf31ac6695.webp',1080,1537,'SINGLE'),
    (25,'page-025-0f9c3b0f4c2d.webp',1080,1537,'SINGLE'),
    (26,'page-026-ab410fdb167a.webp',1080,1537,'SINGLE'),
    (27,'page-027-98d009c13527.webp',1080,1537,'SINGLE'),
    (28,'page-028-bd882a84bd22.webp',1080,1537,'SINGLE'),
    (29,'page-029-bd61b0945ffc.webp',1080,1537,'SINGLE'),
    (30,'page-030-f1cd6d500ac3.webp',1080,1537,'SINGLE'),
    (31,'page-031-135c38f629ef.webp',1080,1537,'SINGLE'),
    (32,'page-032-34c6f959a23a.webp',1080,1537,'SINGLE'),
    (33,'page-033-b364580dcc7c.webp',1080,1537,'SINGLE'),
    (34,'page-034-7a8450dd9aaa.webp',1080,768,'DOUBLE'),
    (35,'page-035-4e86ef75a2cf.webp',1080,1537,'SINGLE'),
    (36,'page-036-31b9c802b92e.webp',1080,1537,'SINGLE'),
    (37,'page-037-d1bad6d7f4c3.webp',1080,1537,'SINGLE'),
    (38,'page-038-aef807b18a09.webp',950,950,'SINGLE')
) AS p(pos, file, w, h, t)
ON CONFLICT (import_id, position) DO NOTHING;

UPDATE chapter SET availability = 'NATIVE' WHERE id = '32918cb2-d95c-4f1d-b480-112a2ca75f92';
