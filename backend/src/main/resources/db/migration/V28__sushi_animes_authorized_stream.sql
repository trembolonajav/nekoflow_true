-- Uso do CDN e do conteúdo autorizado pelo Sushi Animes ao responsável pelo NekoFlow
-- em 2026-10-28. A URL armazenada continua sendo a página do episódio; o backend
-- resolve o player oficial e transmite o MP4 com Range e Referer autorizado.
INSERT INTO media_provider(id,code,name,media_kind,allowed_hosts,terms_note)
VALUES ('4ec94fd8-c97a-45eb-bde3-8ffd5457d714','SUSHI_ANIMES_CDN','Sushi Animes (CDN autorizado)','VIDEO',
        ARRAY['sushianimes.com.br','cdn-s01.pixel-sus-4k-image.com'],
        'Autorização formal para uso do CDN e do conteúdo do site confirmada pelo Sushi Animes em 2026-10-28; evidência mantida pelo responsável do NekoFlow.')
ON CONFLICT (code) DO UPDATE SET enabled=TRUE,allowed_hosts=EXCLUDED.allowed_hosts,terms_note=EXCLUDED.terms_note;

UPDATE episode_source es
SET source_type='MP4',provider_id='4ec94fd8-c97a-45eb-bde3-8ffd5457d714',
    provider='Sushi Animes',label='Sushi Animes · CDN autorizado',priority=10,
    embed_allowed=FALSE,reports_progress=TRUE,
    provenance='Player e CDN do Sushi Animes autorizados para uso pelo NekoFlow em 2026-10-28; mídia resolvida pela página oficial do episódio e transmitida com suporte a HTTP Range.',
    updated_at=now()
FROM episode e JOIN season s ON s.id=e.season_id JOIN work w ON w.id=s.work_id
WHERE es.episode_id=e.id AND w.slug='dororo-2019' AND es.provider='Sushi Animes';

UPDATE episode e SET availability='STREAM'
FROM season s JOIN work w ON w.id=s.work_id
WHERE e.season_id=s.id AND w.slug='dororo-2019';
