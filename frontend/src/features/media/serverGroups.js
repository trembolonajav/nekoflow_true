// Guia "Idiomas e Servidores" (seção 03): a pessoa escolhe a VERSÃO (legendado/dublado +
// idioma); o servidor é escolhido pelo site e trocar fica a um clique.

const SHORT = { "pt-BR": "PT-BR", pt: "PT-BR", en: "EN", es: "ES", ja: "JA" };
const short = (c) => SHORT[c] || String(c || "").toUpperCase();
const isDub = (a) => a && a !== "ja" && a !== "multi";

/** Chave e rótulo da versão de uma fonte: "Legendado PT-BR", "Dublado EN", "Dual áudio". */
export function versionOf(source) {
  const audio = (source.audioLanguages || [])[0] || null;
  const sub = (source.subtitleLanguages || [])[0] || null;
  if (isDub(audio)) return { key: `dub:${audio}`, label: `Dublado ${short(audio)}`, audio, subtitle: null };
  if (audio === "multi") return { key: `dual:${sub || ""}`, label: sub ? `Dual áudio · ${short(sub)}` : "Dual áudio", audio, subtitle: sub };
  return { key: `leg:${sub || ""}`, label: sub ? `Legendado ${short(sub)}` : "Legendado", audio, subtitle: sub };
}

const HOSTS = [
  [/blogger\.com|blogspot\./, "Blogger"],
  [/zokoanime\./, "ZokoAnime"],
  [/megaplay\./, "HD-1 · MegaPlay"],
  [/abyss/, "Abyss"],
  [/filemoon\./, "Filemoon"],
  [/streamtape\./, "Streamtape"],
  [/csst\.online/, "CSST"],
  [/dailymotion\./, "Dailymotion"],
];

/** Nome do provedor, discreto (subtítulo do servidor). */
export function providerOf(source) {
  const url = source.embedUrl || source.externalUrl || "";
  let name = String(source.label || "").split(" · ")[0].trim();
  if (!name || /^player ext/i.test(name) || /^hd-\d/i.test(name)) {
    const hit = HOSTS.find(([re]) => re.test(url));
    if (hit) name = hit[1];
    else {
      try {
        name = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        name = name || "Provedor";
      }
    }
  }
  if (/blogger/i.test(name) && !isDub((source.audioLanguages || [])[0])) name = `${name} · legenda embutida`;
  return name;
}

/**
 * Versões existentes no episódio, cada uma com seus servidores ("Servidor 1, 2, 3") na
 * ordem editorial. A ordem das versões segue a preferência informada (score).
 */
export function groupVersions(sources, score = () => 0) {
  const map = new Map();
  for (const s of sources || []) {
    if (!(s.embedUrl || (s.playsInPlayer && s.compatible !== false))) continue;
    const v = versionOf(s);
    if (!map.has(v.key)) map.set(v.key, { ...v, servers: [], best: -Infinity, first: map.size });
    const g = map.get(v.key);
    g.servers.push({ source: s, name: `Servidor ${g.servers.length + 1}`, provider: providerOf(s) });
    g.best = Math.max(g.best, score(s));
  }
  return [...map.values()].sort((a, b) => b.best - a.best || a.first - b.first);
}

const MEMORY_KEY = "nk-last-server";

/** Servidor que funcionou da última vez para esta obra e versão (só neste navegador). */
export function rememberedProvider(workId, versionKey, storage = globalThis.localStorage) {
  try {
    return (JSON.parse(storage.getItem(MEMORY_KEY) || "{}")[workId] || {})[versionKey] || null;
  } catch {
    return null;
  }
}

export function rememberProvider(workId, versionKey, provider, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage.getItem(MEMORY_KEY) || "{}");
    all[workId] = { ...(all[workId] || {}), [versionKey]: provider };
    storage.setItem(MEMORY_KEY, JSON.stringify(all));
  } catch {
    /* sem armazenamento: escolhe o primeiro servidor */
  }
}
