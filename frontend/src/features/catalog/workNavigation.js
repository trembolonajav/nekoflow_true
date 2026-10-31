const ANIMATION_KINDS = new Set(["anime", "filme", "anime_movie", "movie"]);

export function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyTitle(title) {
  const slug = normalizeSearch(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "obra";
}

export function getWorkKind(work) {
  const kind = String(work?.kind || work?.type || "").toLowerCase();
  if (
    ANIMATION_KINDS.has(kind) ||
    kind.includes("anime") ||
    kind.includes("filme")
  )
    return "anime";
  if (
    kind.includes("mang") ||
    kind.includes("manhwa") ||
    kind.includes("webtoon") ||
    kind.includes("webcomic")
  )
    return "reading";
  return null;
}

export function getWorkSlug(work) {
  if (work?.slug) return String(work.slug);
  if (work?.id == null || !work?.title) return null;
  return `${slugifyTitle(work.title)}-${work.id}`;
}

export function getWorkUrl(work) {
  const kind = getWorkKind(work);
  const slug = getWorkSlug(work);
  if (!kind || !slug) return null;
  return `/${kind === "anime" ? "animes" : "leituras"}/${encodeURIComponent(slug)}`;
}

/** Só devolve mídia quando existe uma experiência cadastrada para a obra/unidade. */
export function getUnitUrl(work, unit) {
  const n = Number(unit);
  if (!Number.isInteger(n) || n < 0) return null;
  if (Number(work?.id) === 151807 && getWorkKind(work) === "anime")
    return `/player?obra=151807&ep=${n}`;
  if (Number(work?.id) === 105398 && getWorkKind(work) === "reading")
    return `/leitor?obra=105398&cap=${n}`;
  return null;
}

export const canonicalWorks = Object.freeze({
  soloLevelingAnime: getWorkUrl({
    id: 151807,
    kind: "anime",
    title: "Solo Leveling",
  }),
  soloLevelingReading: getWorkUrl({
    id: 105398,
    kind: "manhwa",
    title: "Solo Leveling",
  }),
});
