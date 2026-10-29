// Regras puras do player real (testadas sem navegador).

/** O que este navegador consegue reproduzir de cada tipo de fonte. */
export function browserSupport(video, HlsLib) {
  const native = (type) => {
    try {
      return !!(video && video.canPlayType && video.canPlayType(type));
    } catch {
      return false;
    }
  };
  return {
    HLS: native("application/vnd.apple.mpegurl") || !!(HlsLib && HlsLib.isSupported && HlsLib.isSupported()),
    MP4: native('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') || native("video/mp4"),
    // DASH exige um player dedicado (Shaka); não é adotado enquanto não houver fonte DASH.
    DASH: false,
  };
}

/**
 * Ordem de tentativa: fontes reproduzíveis no player (por prioridade editorial) e,
 * por último, as externas. Fontes incompatíveis com o navegador ficam marcadas.
 */
export function rankSources(sources, support) {
  return [...(sources || [])]
    .map((s) => ({ ...s, compatible: s.playsInPlayer ? !!support[s.type] : true }))
    .sort((a, b) => {
      const ka = a.playsInPlayer ? (a.compatible ? 0 : 2) : 1;
      const kb = b.playsInPlayer ? (b.compatible ? 0 : 2) : 1;
      return ka - kb || (a.healthRank || 0) - (b.healthRank || 0) || a.priority - b.priority;
    });
}

/** Primeira fonte que o player consegue tocar aqui; null se só houver links externos. */
export function pickSource(ranked, preferredId) {
  const playable = ranked.filter((s) => s.playsInPlayer && s.compatible);
  return playable.find((s) => s.id === preferredId) || playable[0] || null;
}

/**
 * Mede o tempo realmente assistido a partir de timeupdate: só conta avanço contínuo
 * enquanto o vídeo está tocando (buscas, pausas e saltos não contam).
 */
export function createWatchMeter() {
  let last = null;
  let pendingMs = 0;
  return {
    /** chamado em cada timeupdate; t em segundos, rate = playbackRate */
    tick(t, { playing, seeking, rate = 1 }) {
      if (!playing || seeking || last == null) {
        last = t;
        return;
      }
      const d = t - last;
      last = t;
      // timeupdate chega a cada ~250 ms; acima de 2 s × velocidade é salto, não reprodução.
      if (d > 0 && d <= 2 * Math.max(1, rate)) pendingMs += d * 1000;
    },
    reset(t) {
      last = t;
    },
    /** devolve e zera o tempo acumulado desde o último envio */
    take() {
      const v = Math.round(pendingMs);
      pendingMs = 0;
      return v;
    },
    get pendingMs() {
      return Math.round(pendingMs);
    },
  };
}

/** Marcação editorial ativa no instante t (ms). */
export function markerAt(markers, ms, kind) {
  return (markers || []).find((m) => m.kind === kind && ms >= m.startMs && ms < m.endMs) || null;
}

const LANG = {
  ja: "Japonês",
  "pt-BR": "Português (Brasil)",
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
  ko: "Coreano",
  zh: "Chinês",
};
const LANG_BADGE = {
  ja: ["🇯🇵", "JA"],
  "pt-BR": ["🇧🇷", "PT-BR"],
  pt: ["🇧🇷", "PT"],
  en: ["🇺🇸", "EN"],
  es: ["🇪🇸", "ES"],
  ko: ["🇰🇷", "KO"],
  zh: ["🇨🇳", "ZH"],
};
export function languageName(code) {
  if (!code) return "Original";
  return LANG[code] || LANG[String(code).split("-")[0]] || code;
}

/** Símbolo + código curto. O texto acompanha a bandeira para não depender só do emoji. */
export function languageBadge(code) {
  if (!code) return "";
  const normalized = String(code);
  const badge = LANG_BADGE[normalized] || LANG_BADGE[normalized.split("-")[0]];
  return badge ? `${badge[0]} ${badge[1]}` : normalized.toUpperCase();
}

/** Idiomas relevantes no seletor: legenda primeiro; áudio quando não há legenda. */
export function sourceLanguageSummary(source) {
  const subtitles = [...new Set(source?.subtitleLanguages || [])].filter(Boolean);
  const audio = [...new Set(source?.audioLanguages || [])].filter(Boolean);
  const values = subtitles.length ? subtitles : audio;
  return values.map(languageBadge).filter(Boolean).join(" / ");
}
