/** Mantém campos curatoriais do design, mas deixa identidade e metadados canônicos virem do catálogo. */
export function mergeCatalogItem(design = {}, canonical = {}) {
  return {
    ...design,
    ...canonical,
    id: canonical.id ?? design.id,
    title: canonical.title || design.title,
    alt: canonical.alt ?? design.alt,
    cover: canonical.cover || design.cover,
    banner: canonical.banner || design.banner,
    kind: canonical.kind || design.kind,
    type: design.type || (canonical.kind === "manga" ? "Mangá" : canonical.kind === "manhwa" ? "Manhwa" : undefined),
    year: canonical.year ?? design.year,
    status: canonical.status || design.status,
    eps: canonical.eps ?? design.eps,
    ch: canonical.ch ?? design.ch,
    // gêneros, temas, notas e chamadas são curadoria do documento visual até ganharem contrato próprio.
    genres: design.genres || canonical.genres || [],
    themes: design.themes || canonical.themes || [],
    score: design.score ?? canonical.score ?? null,
  };
}

export function mergeCatalogList(designItems, catalogItems, filter = () => true) {
  const byId = new Map((catalogItems || []).map((item) => [Number(item.id), item]));
  const merged = (designItems || []).map((item) => mergeCatalogItem(item, byId.get(Number(item.id))));
  const known = new Set(merged.map((item) => Number(item.id)));
  for (const item of catalogItems || []) if (!known.has(Number(item.id)) && filter(item)) merged.push(mergeCatalogItem({}, item));
  return merged;
}
