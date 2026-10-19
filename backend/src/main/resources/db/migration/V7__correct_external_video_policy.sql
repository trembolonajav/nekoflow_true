-- A validação em navegador confirmou que o player interno exige o referenciador
-- do domínio antigo. Até o provedor liberar o novo domínio, não anunciamos embed.
UPDATE episode_source
SET source_type = 'EXTERNAL_LINK',
    source_url = 'https://animesdigital.org/video/a/136841/',
    embed_allowed = FALSE,
    provenance = provenance || ' Validação técnica: embed bloqueado fora do domínio original; usar abertura externa.'
WHERE episode_id = 'f5caf477-8a19-4b83-bff6-28afe646d970';

UPDATE episode SET availability = 'EXTERNAL_LINK'
WHERE id = 'f5caf477-8a19-4b83-bff6-28afe646d970';
