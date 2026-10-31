// Idioma do conteúdo na vitrine. O idioma do site decide o que aparece ao navegar (Home,
// Explorar, "Em alta" da busca): obra que só existe em outro idioma sai da vitrine; obra
// anunciada, ainda sem episódio/capítulo, continua. A busca sempre mostra tudo e diz em que
// idioma cada obra está. Idioma com pouco catálogo (hoje, espanhol) não filtra nada.
// Áudio e legenda do Player continuam sendo preferências separadas.
import { api } from "../../lib/api";

const NAMES = {
  "pt-BR": { "pt-BR": "português", en: "inglês", es: "espanhol" },
  en: { "pt-BR": "Portuguese", en: "English", es: "Spanish" },
  es: { "pt-BR": "portugués", en: "inglés", es: "español" },
};
const WORDS = {
  "pt-BR": { dub: "dublado", sub: "legendado", both: "Dublado e legendado", only: "Só em", and: "e", in: "Em", all: "Todos os idiomas", few: "pouco conteúdo em" },
  en: { dub: "dubbed", sub: "subtitled", both: "Dubbed and subtitled", only: "Only in", and: "and", in: "In", all: "All languages", few: "little content in" },
  es: { dub: "doblado", sub: "subtitulado", both: "Doblado y subtitulado", only: "Solo en", and: "y", in: "En", all: "Todos los idiomas", few: "poco contenido en" },
};

const words = (locale) => WORDS[locale] || WORDS["pt-BR"];
export const languageName = (lang, locale) => (NAMES[locale] || NAMES["pt-BR"])[lang] || lang;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

let summaryPromise = null;
/** {"pt-BR": {works, dubbed, reading, filter}, en: {...}, es: {...}} — uma vez por carregamento. */
export function languageSummary() {
  if (!summaryPromise) summaryPromise = api.get("/api/v1/home/languages").catch(() => (summaryPromise = null, {}));
  return summaryPromise;
}

/** Idioma que filtra a vitrine agora, ou null (idioma com pouco catálogo ou resumo ainda não carregado). */
export const showcaseLanguage = (summary, locale) => (summary && summary[locale]?.filter ? locale : null);

/** Obra visível na vitrine do idioma? Sem informação, ou anunciada sem conteúdo, continua. */
export function availableIn(item, lang) {
  if (!lang) return true;
  const langs = item && item.langs;
  if (!langs || !Object.keys(langs).length) return true;
  return !!langs[lang];
}

/** Texto curto de idioma para cards e busca: "Dublado e legendado", "Só em inglês (legendado)". */
export function availabilityNote(item, locale, { onlyMissing = false } = {}) {
  const langs = item && item.langs;
  if (!langs || !Object.keys(langs).length) return "";
  const w = words(locale);
  const kinds = (k) => (k || "").split(",");
  const here = langs[locale];
  if (here) {
    if (onlyMissing) return "";
    const k = kinds(here);
    if (k.includes("dub") && k.includes("sub")) return w.both;
    if (k.includes("dub")) return cap(w.dub);
    if (k.includes("sub")) return cap(w.sub);
    return "";
  }
  const others = Object.keys(langs);
  const label = others.map((l) => languageName(l, locale));
  const names = label.length > 1 ? `${label.slice(0, -1).join(", ")} ${w.and} ${label[label.length - 1]}` : label[0];
  if (others.length === 1) {
    const k = kinds(langs[others[0]]);
    const how = k.includes("dub") && k.includes("sub") ? null : k.includes("dub") ? w.dub : k.includes("sub") ? w.sub : null;
    return `${w.only} ${names}${how ? ` (${how})` : ""}`;
  }
  return `${w.only} ${names}`;
}

/** Rótulos do filtro de idioma do Explorar no idioma do site. */
export function languageLabels(locale) {
  const w = words(locale);
  return {
    only: `${w.in} ${languageName(locale, locale)}`,
    all: w.all,
    few: `${w.few} ${languageName(locale, locale)}`,
  };
}
