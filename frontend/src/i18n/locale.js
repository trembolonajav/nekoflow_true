const STORAGE_KEY = "nk-locale";
const SUPPORTED = new Set(["pt-BR", "en", "es"]);

export const localeOptions = [
  { code: "pt-BR", flag: "🇧🇷", short: "PT" },
  { code: "en", flag: "🇺🇸", short: "EN" },
  { code: "es", flag: "🇪🇸", short: "ES" },
];

const UI = {
  "Início": { en: "Home", es: "Inicio" },
  "Leituras": { en: "Reading", es: "Lecturas" },
  "Explorar": { en: "Explore", es: "Explorar" },
  "Calendário": { en: "Calendar", es: "Calendario" },
  "Entrar": { en: "Sign in", es: "Iniciar sesión" },
  "Criar conta": { en: "Create account", es: "Crear cuenta" },
  "Episódios": { en: "Episodes", es: "Episodios" },
  "Sobre": { en: "About", es: "Acerca de" },
  "Universo": { en: "Universe", es: "Universo" },
  "Personagens": { en: "Characters", es: "Personajes" },
  "Sinopse": { en: "Synopsis", es: "Sinopsis" },
  "Temporadas": { en: "Seasons", es: "Temporadas" },
  "Assistir agora": { en: "Watch now", es: "Ver ahora" },
  "Assistir episódio": { en: "Watch episode", es: "Ver episodio" },
  "Assistir de novo": { en: "Watch again", es: "Ver de nuevo" },
  "Anterior": { en: "Previous", es: "Anterior" },
  "Próximo": { en: "Next", es: "Siguiente" },
  "Minha lista": { en: "My list", es: "Mi lista" },
  "Minha biblioteca": { en: "My library", es: "Mi biblioteca" },
  "Continuar assistindo": { en: "Continue watching", es: "Seguir viendo" },
  "Continuar lendo": { en: "Continue reading", es: "Seguir leyendo" },
  "Histórico": { en: "History", es: "Historial" },
  "Configurações": { en: "Settings", es: "Configuración" },
  "Notificações": { en: "Notifications", es: "Notificaciones" },
  "Marcar como assistido": { en: "Mark as watched", es: "Marcar como visto" },
  "Mostrar sinopse do episódio": { en: "Show episode synopsis", es: "Mostrar sinopsis del episodio" },
  "Ver todas as temporadas →": { en: "View all seasons →", es: "Ver todas las temporadas →" },
  "Obra original": { en: "Original work", es: "Obra original" },
  "Você também pode gostar": { en: "You may also like", es: "También te puede gustar" },
  "Lista disponível nesta ficha": { en: "Full list available", es: "Lista disponible" },
  "Toque em um personagem para ver o dublador original.": {
    en: "Select a character to see the original voice actor.",
    es: "Selecciona un personaje para ver al actor de voz original.",
  },
  "Outras histórias, fora desta franquia, com o motivo de cada sugestão.": { en: "Other stories outside this franchise, with the reason for each pick.", es: "Otras historias fuera de esta franquicia, con el motivo de cada sugerencia." },
  "Outras leituras, fora desta franquia, com o motivo de cada sugestão.": { en: "Other reads outside this franchise, with the reason for each pick.", es: "Otras lecturas fuera de esta franquicia, con el motivo de cada sugerencia." },
  "De onde veio a história, o que já foi adaptado e a ordem para acompanhar.": { en: "Where the story comes from, what has been adapted and the order to follow.", es: "De dónde viene la historia, qué se ha adaptado y el orden para seguirla." },
  "Ordem para assistir": { en: "Watch order", es: "Orden para ver" },
  "Ordem de lançamento, que aqui coincide com a ordem da história": { en: "Release order, which here matches the story order", es: "Orden de estreno, que aquí coincide con el orden de la historia" },
  "Para ler": { en: "To read", es: "Para leer" },
  "Fim dos episódios lançados": { en: "End of released episodes", es: "Fin de los episodios estrenados" },
  "Continuar na obra original →": { en: "Continue in the original work →", es: "Continuar en la obra original →" },
  "Gêneros e temas": { en: "Genres and themes", es: "Géneros y temas" },
  "Também conhecido como": { en: "Also known as", es: "También conocido como" },
  "Ficha técnica": { en: "Details", es: "Ficha técnica" },
  "Ler mais": { en: "Read more", es: "Leer más" },
  "Mostrar menos": { en: "Show less", es: "Mostrar menos" },
  "Legendado": { en: "Subtitled", es: "Subtitulado" },
  "Dublado": { en: "Dubbed", es: "Doblado" },
  "Mais antigos primeiro": { en: "Oldest first", es: "Más antiguos primero" },
  "Mais recentes primeiro": { en: "Newest first", es: "Más recientes primero" },
  "Situação na sua lista": { en: "Status in your list", es: "Estado en tu lista" },
  "Remover da lista": { en: "Remove from list", es: "Quitar de la lista" },
  "Trailer": { en: "Trailer", es: "Tráiler" },
  "Assistindo": { en: "Watching", es: "Viendo" },
  "Planejado": { en: "Planned", es: "Planeado" },
  "Pausado": { en: "Paused", es: "En pausa" },
  "Abandonado": { en: "Dropped", es: "Abandonado" },
  "Ler do capítulo 1": { en: "Read from chapter 1", es: "Leer desde el capítulo 1" },
  "Ver capítulos": { en: "See chapters", es: "Ver capítulos" },
  "Protagonista": { en: "Protagonist", es: "Protagonista" },
  "Principal": { en: "Main", es: "Principal" },
  "Coadjuvante": { en: "Supporting", es: "Secundario" },
  "Secundário": { en: "Minor", es: "Menor" },
  "Título original": { en: "Original title", es: "Título original" },
  "Formato": { en: "Format", es: "Formato" },
  "Estúdio": { en: "Studio", es: "Estudio" },
  "Direção": { en: "Director", es: "Dirección" },
  "Roteiro": { en: "Script", es: "Guion" },
  "Estreia": { en: "Premiere", es: "Estreno" },
  "Situação": { en: "Status", es: "Estado" },
  "Origem": { en: "Source", es: "Origen" },
  "Áudio": { en: "Audio", es: "Audio" },
  "Legendas": { en: "Subtitles", es: "Subtítulos" },
  "Qualidade": { en: "Quality", es: "Calidad" },
  "Velocidade": { en: "Speed", es: "Velocidad" },
  "Fonte da sinopse": { en: "Synopsis source", es: "Fuente de la sinopsis" },
  "Série de TV": { en: "TV series", es: "Serie de TV" },
  "Em lançamento": { en: "Airing", es: "En emisión" },
  "Concluído": { en: "Finished", es: "Finalizado" },
  "Anunciado": { en: "Announced", es: "Anunciado" },
  "Reportar problema de reprodução": { en: "Report a playback problem", es: "Reportar un problema de reproducción" },
  "Entre para salvar seu progresso": { en: "Sign in to save your progress", es: "Inicia sesión para guardar tu progreso" },
  "Progresso sincronizado": { en: "Progress synced", es: "Progreso sincronizado" },
  "Progresso salvo agora": { en: "Progress saved", es: "Progreso guardado" },
  "Tentar novamente": { en: "Try again", es: "Intentar de nuevo" },
  "Tentar outra fonte": { en: "Try another source", es: "Probar otra fuente" },
  "Reportar problema": { en: "Report a problem", es: "Reportar un problema" },
  "Sem legenda separada": { en: "No separate subtitles", es: "Sin subtítulos separados" },
  "Assistir próximo": { en: "Watch next", es: "Ver siguiente" },
  "Ver créditos": { en: "Watch credits", es: "Ver créditos" },
  "Cancelar": { en: "Cancel", es: "Cancelar" },
};

// Gêneros: também traduzem motivos compostos das recomendações ("Ação e fantasia").
const GENRES = {
  "Ação": { en: "Action", es: "Acción" },
  "Aventura": { en: "Adventure", es: "Aventura" },
  "Fantasia": { en: "Fantasy", es: "Fantasía" },
  "Comédia": { en: "Comedy", es: "Comedia" },
  "Drama": { en: "Drama", es: "Drama" },
  "Romance": { en: "Romance", es: "Romance" },
  "Mistério": { en: "Mystery", es: "Misterio" },
  "Terror": { en: "Horror", es: "Terror" },
  "Ficção científica": { en: "Sci-fi", es: "Ciencia ficción" },
  "Cotidiano": { en: "Slice of life", es: "Recuentos de la vida" },
  "Esportes": { en: "Sports", es: "Deportes" },
  "Sobrenatural": { en: "Supernatural", es: "Sobrenatural" },
  "Suspense": { en: "Thriller", es: "Suspenso" },
  "Psicológico": { en: "Psychological", es: "Psicológico" },
  "Música": { en: "Music", es: "Música" },
  "Mecha": { en: "Mecha", es: "Mecha" },
  "Ecchi": { en: "Ecchi", es: "Ecchi" },
};
for (const [k, v] of Object.entries(GENRES)) UI[k] = UI[k] || v;

// Primeira visita: sugere o idioma do navegador (pt-BR é o padrão editorial do projeto).
function browserLocale() {
  const langs = (globalThis.navigator && (navigator.languages || [navigator.language])) || [];
  for (const l of langs) {
    const b = String(l || "").toLowerCase().split("-")[0];
    if (b === "pt") return "pt-BR";
    if (b === "en") return "en";
    if (b === "es") return "es";
  }
  return "pt-BR";
}

let locale = (() => {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* sem armazenamento */
  }
  return SUPPORTED.has(saved) ? saved : browserLocale();
})();

export function getLocale() { return locale; }
export function translate(label, target = locale) {
  if (target === "pt-BR") return label;
  if (UI[label]?.[target]) return UI[label][target];
  // "Ação e fantasia" → "Action and fantasy" (motivos das recomendações).
  const pair = /^(.+) e (.+)$/.exec(label);
  if (pair) {
    const a = GENRES[pair[1]] || GENRES[cap(pair[1])];
    const b = GENRES[pair[2]] || GENRES[cap(pair[2])];
    if (a && b) return `${a[target]}${target === "en" ? " and " : " y "}${b[target].toLowerCase()}`;
  }
  return label;
}
function cap(x) {
  return x ? x[0].toUpperCase() + x.slice(1) : x;
}
export function setLocale(next) {
  if (!SUPPORTED.has(next) || next === locale) return;
  locale = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
  window.dispatchEvent(new CustomEvent("nk:locale", { detail: next }));
}
export function subscribeLocale(listener) {
  window.addEventListener("nk:locale", listener);
  return () => window.removeEventListener("nk:locale", listener);
}

// Localiza somente rótulos conhecidos das telas importadas do design.
// Títulos e conteúdo editorial nunca entram neste dicionário.
export function installDocumentLocalization() {
  document.documentElement.lang = locale;
  const canonical = new WeakMap();
  const applied = new WeakMap();
  const localizeText = (node) => {
    if (!node?.data || node.parentElement?.closest("script,style")) return;
    const raw = node.data;
    const priorApplied = applied.get(node);
    if (!canonical.has(node) || (priorApplied != null && raw !== priorApplied)) canonical.set(node, raw);
    const original = canonical.get(node);
    const trimmed = original.trim();
    if (!trimmed || translate(trimmed) === trimmed) return;
    const next = original.replace(trimmed, translate(trimmed));
    applied.set(node, next);
    if (node.data !== next) node.data = next;
  };
  const walk = (root) => {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return localizeText(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) localizeText(node);
  };
  const observer = new MutationObserver((records) => records.forEach((record) => {
    if (record.type === "characterData") localizeText(record.target);
    record.addedNodes?.forEach(walk);
  }));
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  subscribeLocale(() => walk(document.body));
  walk(document.body);
  return () => observer.disconnect();
}
