-- Protocolo 04: catálogo normalizado, preservando work.id e content_document.
ALTER TABLE work ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE work ADD CONSTRAINT work_public_id_uk UNIQUE(public_id);
ALTER TABLE work ADD COLUMN slug VARCHAR(340);
ALTER TABLE work ADD COLUMN media_family VARCHAR(16);
ALTER TABLE work ADD COLUMN work_format VARCHAR(20);
ALTER TABLE work ADD COLUMN reading_category VARCHAR(20);
ALTER TABLE work ADD COLUMN presentation_format VARCHAR(16);
ALTER TABLE work ADD COLUMN original_language VARCHAR(16);
ALTER TABLE work ADD COLUMN origin_country VARCHAR(2);
ALTER TABLE work ADD COLUMN synopsis_short TEXT;
ALTER TABLE work ADD COLUMN synopsis_full TEXT;
ALTER TABLE work ADD COLUMN story_status VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE work ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE work ADD COLUMN original_release_date DATE;
ALTER TABLE work ADD COLUMN content_rating VARCHAR(20);
ALTER TABLE work ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE work SET media_family=CASE WHEN kind IN ('anime','filme') THEN 'ANIMATION' ELSE 'READING' END,
 work_format=CASE WHEN kind='filme' THEN 'MOVIE' WHEN kind='anime' THEN 'SERIES' ELSE 'COMIC' END,
 reading_category=CASE WHEN kind='manga' THEN 'MANGA' WHEN kind='manhwa' THEN 'MANHWA' END,
 presentation_format=CASE WHEN webtoon THEN 'VERTICAL' WHEN kind IN ('manga','manhwa') THEN 'PAGED' END,
 slug=trim(both '-' from regexp_replace(lower(translate(title,'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')), '[^a-z0-9]+','-','g')) || '-' || id,
 story_status=CASE WHEN airing_status ILIKE '%conclu%' THEN 'COMPLETED' WHEN airing_status IS NULL THEN 'UNKNOWN' ELSE 'ONGOING' END;
ALTER TABLE work ALTER COLUMN media_family SET NOT NULL;
ALTER TABLE work ALTER COLUMN work_format SET NOT NULL;
ALTER TABLE work ALTER COLUMN slug SET NOT NULL;
ALTER TABLE work ADD CONSTRAINT work_media_ck CHECK(media_family IN('ANIMATION','READING'));
ALTER TABLE work ADD CONSTRAINT work_visibility_ck CHECK(visibility IN('DRAFT','PUBLISHED','HIDDEN','ARCHIVED'));
CREATE UNIQUE INDEX work_family_slug_uk ON work(media_family,slug);
CREATE INDEX work_public_filters_idx ON work(visibility,media_family,year DESC);
CREATE INDEX work_title_lower_idx ON work(lower(title));

CREATE TABLE work_title(id BIGSERIAL PRIMARY KEY,work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,title VARCHAR(300) NOT NULL,title_norm VARCHAR(300) NOT NULL,title_type VARCHAR(16) NOT NULL,language VARCHAR(16),UNIQUE(work_id,title_norm,title_type));
CREATE INDEX work_title_search_idx ON work_title(title_norm);
INSERT INTO work_title(work_id,title,title_norm,title_type) SELECT id,title,lower(title),'PRIMARY' FROM work;
INSERT INTO work_title(work_id,title,title_norm,title_type) SELECT w.id,trim(x),lower(trim(x)),'ALIAS' FROM work w CROSS JOIN LATERAL regexp_split_to_table(w.alt_titles,'\|') x WHERE trim(x)<>'' ON CONFLICT DO NOTHING;
CREATE TABLE genre(id BIGSERIAL PRIMARY KEY,slug VARCHAR(80) UNIQUE NOT NULL,name VARCHAR(80) UNIQUE NOT NULL);
CREATE TABLE work_genre(work_id BIGINT REFERENCES work(id) ON DELETE CASCADE,genre_id BIGINT REFERENCES genre(id),position INT NOT NULL DEFAULT 0,PRIMARY KEY(work_id,genre_id));
CREATE TABLE tag(id BIGSERIAL PRIMARY KEY,slug VARCHAR(80) UNIQUE NOT NULL,name VARCHAR(80) UNIQUE NOT NULL);
CREATE TABLE work_tag(work_id BIGINT REFERENCES work(id) ON DELETE CASCADE,tag_id BIGINT REFERENCES tag(id),PRIMARY KEY(work_id,tag_id));
CREATE TABLE franchise(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),slug VARCHAR(200) UNIQUE NOT NULL,name VARCHAR(200) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE franchise_work(franchise_id UUID REFERENCES franchise(id) ON DELETE CASCADE,work_id BIGINT REFERENCES work(id) ON DELETE CASCADE,position INT NOT NULL DEFAULT 0,PRIMARY KEY(franchise_id,work_id));
CREATE TABLE work_relation(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),source_work_id BIGINT REFERENCES work(id) ON DELETE CASCADE,target_work_id BIGINT REFERENCES work(id) ON DELETE CASCADE,relation_type VARCHAR(24) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),CHECK(source_work_id<>target_work_id),UNIQUE(source_work_id,target_work_id,relation_type));
CREATE TABLE season(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,title VARCHAR(200) NOT NULL,display_number VARCHAR(30),sort_position NUMERIC(12,3) NOT NULL,poster_url TEXT,release_date DATE,visibility VARCHAR(16) NOT NULL DEFAULT 'DRAFT',UNIQUE(work_id,sort_position));
CREATE TABLE episode(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),season_id UUID NOT NULL REFERENCES season(id) ON DELETE CASCADE,title VARCHAR(200),display_number VARCHAR(30) NOT NULL,sort_position NUMERIC(12,3) NOT NULL,synopsis TEXT,duration_seconds INT,original_air_date DATE,availability VARCHAR(16) NOT NULL DEFAULT 'UNAVAILABLE',UNIQUE(season_id,sort_position));
CREATE TABLE work_edition(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,name VARCHAR(120) NOT NULL,language VARCHAR(16) NOT NULL,is_original BOOLEAN NOT NULL DEFAULT FALSE,UNIQUE(work_id,name,language));
CREATE TABLE volume(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),edition_id UUID NOT NULL REFERENCES work_edition(id) ON DELETE CASCADE,title VARCHAR(120) NOT NULL,display_number VARCHAR(30),sort_position NUMERIC(12,3) NOT NULL,UNIQUE(edition_id,sort_position));
CREATE TABLE chapter(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),edition_id UUID NOT NULL REFERENCES work_edition(id) ON DELETE CASCADE,volume_id UUID REFERENCES volume(id) ON DELETE SET NULL,title VARCHAR(200),display_number VARCHAR(30) NOT NULL,sort_position NUMERIC(12,3) NOT NULL,availability VARCHAR(16) NOT NULL DEFAULT 'UNAVAILABLE',published_at DATE,UNIQUE(edition_id,sort_position));
CREATE TABLE person(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name VARCHAR(200) NOT NULL,name_norm VARCHAR(200) NOT NULL);
CREATE INDEX person_name_idx ON person(name_norm);
CREATE TABLE work_contributor(work_id BIGINT REFERENCES work(id) ON DELETE CASCADE,person_id UUID REFERENCES person(id),role VARCHAR(40) NOT NULL,position INT NOT NULL DEFAULT 0,PRIMARY KEY(work_id,person_id,role));
CREATE TABLE media_asset(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,asset_type VARCHAR(20) NOT NULL,url TEXT NOT NULL,alt_text VARCHAR(300),provenance VARCHAR(120),UNIQUE(work_id,asset_type,url));
CREATE TABLE external_identifier(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,provider VARCHAR(40) NOT NULL,external_id VARCHAR(120) NOT NULL,UNIQUE(provider,external_id,work_id));
INSERT INTO external_identifier(work_id,provider,external_id) SELECT id,'ANILIST',id::text FROM work WHERE id<900000000;
CREATE TABLE catalog_import_run(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),source VARCHAR(80) NOT NULL,dry_run BOOLEAN NOT NULL,status VARCHAR(20) NOT NULL,created_count INT NOT NULL DEFAULT 0,updated_count INT NOT NULL DEFAULT 0,unchanged_count INT NOT NULL DEFAULT 0,rejected_count INT NOT NULL DEFAULT 0,started_at TIMESTAMPTZ NOT NULL DEFAULT now(),finished_at TIMESTAMPTZ);
CREATE TABLE catalog_import_item(id BIGSERIAL PRIMARY KEY,run_id UUID REFERENCES catalog_import_run(id) ON DELETE CASCADE,source_key VARCHAR(160),work_id BIGINT REFERENCES work(id),result VARCHAR(20) NOT NULL,detail TEXT);
CREATE TABLE catalog_audit_event(id BIGSERIAL PRIMARY KEY,actor_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,work_id BIGINT REFERENCES work(id) ON DELETE SET NULL,action VARCHAR(40) NOT NULL,before_data JSONB,after_data JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
