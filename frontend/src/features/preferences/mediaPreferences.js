// Preferências de idioma, independentes entre si:
// - idioma do site (interface);
// - áudio preferido;
// - legenda preferida e legenda alternativa.
// Trocar o idioma do site nunca muda áudio ou legenda do Player.
//
// Visitante: guardadas neste navegador. Conta: em /api/me/preferences (o mesmo JSON das
// demais preferências), sempre mescladas, nunca sobrescritas por completo.

const LOCAL_KEY = "nk-media-prefs";

/** Rótulos usados na tela Conta → códigos BCP 47 curtos. */
const AUDIO_LABEL = {
  Japonês: "ja",
  Português: "pt-BR",
  "Português (Brasil)": "pt-BR",
  Inglês: "en",
  Espanhol: "es",
};
const SUB_LABEL = {
  "PT-BR": "pt-BR",
  "Português (Brasil)": "pt-BR",
  Inglês: "en",
  Espanhol: "es",
  Desligadas: "off",
  Nenhuma: null,
};
const LOCALE_LABEL = { "Português (Brasil)": "pt-BR", English: "en", Español: "es" };

export const AUDIO_OPTIONS = ["Japonês", "Português (Brasil)", "Inglês", "Espanhol"];
export const SUBTITLE_OPTIONS = ["PT-BR", "Inglês", "Espanhol", "Desligadas"];
export const SUBTITLE_FALLBACK_OPTIONS = ["Inglês", "Espanhol", "PT-BR", "Nenhuma"];
export const LOCALE_OPTIONS = ["Português (Brasil)", "English", "Español"];
export const localeFromLabel = (label) => LOCALE_LABEL[label] || null;
export const labelFromLocale = (code) => Object.keys(LOCALE_LABEL).find((k) => LOCALE_LABEL[k] === code) || null;

/** Converte o JSON salvo (rótulos da tela) nas preferências de mídia em códigos. */
export function normalizePreferences(cfg = {}) {
  const audio = AUDIO_LABEL[cfg.audio] || (cfg.audio && /^[a-z]{2}(-[A-Z]{2})?$/.test(cfg.audio) ? cfg.audio : "ja");
  const subtitle = cfg.subs in SUB_LABEL ? SUB_LABEL[cfg.subs] : "pt-BR";
  const fallback = cfg.subsAlt in SUB_LABEL ? SUB_LABEL[cfg.subsAlt] : "en";
  return {
    audio,
    subtitle: subtitle === "off" ? null : subtitle,
    subtitlesOff: subtitle === "off",
    subtitleFallback: fallback && fallback !== subtitle ? fallback : null,
    locale: LOCALE_LABEL[cfg.locale] || null,
  };
}

const base = (code) => String(code || "").split("-")[0].toLowerCase();
const sameLang = (a, b) => !!a && !!b && base(a) === base(b);

/**
 * Pontua uma fonte pelas preferências: áudio igual vale mais; depois legenda preferida,
 * depois a alternativa. Nada é presumido: fonte sem idioma informado não pontua.
 */
export function preferenceScore(source, prefs) {
  const audios = source.audioLanguages || [];
  const subs = source.subtitleLanguages || [];
  let score = 0;
  if (audios.some((a) => sameLang(a, prefs.audio))) score += 100;
  if (!prefs.subtitlesOff && sameLang(prefs.audio, "ja")) {
    if (prefs.subtitle && subs.some((s) => sameLang(s, prefs.subtitle))) score += 20;
    else if (prefs.subtitleFallback && subs.some((s) => sameLang(s, prefs.subtitleFallback))) score += 10;
  }
  return score;
}

/** Ordem estável: preferência do usuário primeiro, depois a ordem editorial original. */
export function rankByPreference(sources, prefs) {
  return [...(sources || [])]
    .map((s, i) => ({ s, i, score: preferenceScore(s, prefs) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.s);
}

/**
 * Aviso quando a fonte escolhida não atende à preferência (nunca troca em silêncio).
 * Recebe um tradutor de nomes de idioma para montar a frase.
 */
export function substitutionNotice(source, prefs, languageName) {
  if (!source) return null;
  const audios = source.audioLanguages || [];
  const subs = source.subtitleLanguages || [];
  if (audios.length && !audios.some((a) => sameLang(a, prefs.audio))) {
    return `Áudio ${languageName(prefs.audio)} indisponível neste episódio · usando ${audios.map(languageName).join(", ")}`;
  }
  if (prefs.subtitlesOff || !prefs.subtitle || !sameLang(prefs.audio, "ja")) return null;
  if (subs.some((s) => sameLang(s, prefs.subtitle))) return null;
  if (!subs.length) return `Legenda ${languageName(prefs.subtitle)} não informada por esta fonte`;
  return `Legenda ${languageName(prefs.subtitle)} indisponível neste episódio · usando ${subs.map(languageName).join(", ")}`;
}

export function readLocalPreferences(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(LOCAL_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function writeLocalPreferences(cfg, storage = globalThis.localStorage) {
  try {
    storage.setItem(LOCAL_KEY, JSON.stringify(cfg));
  } catch {
    /* armazenamento indisponível: a preferência vale só nesta visita */
  }
}
