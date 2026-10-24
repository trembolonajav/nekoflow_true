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
  "Todo o catálogo da Nekoflow: animes, filmes, mangás, manhwas e webtoons.": {
    en: "The entire Nekoflow catalog: anime, movies, manga, manhwa and webtoons.",
    es: "Todo el catálogo de Nekoflow: anime, películas, manga, manhwa y webtoons.",
  },
  "Limpar": { en: "Clear", es: "Borrar" },
  "Todos": { en: "All", es: "Todos" },
  "Filmes": { en: "Movies", es: "Películas" },
  "Filtros": { en: "Filters", es: "Filtros" },
  "Ordenar por": { en: "Sort by", es: "Ordenar por" },
  "Popularidade": { en: "Popularity", es: "Popularidad" },
  "Melhor nota": { en: "Top rated", es: "Mejor puntuación" },
  "Mais recentes": { en: "Newest", es: "Más recientes" },
  "Calendário": { en: "Calendar", es: "Calendario" },
  "Entrar": { en: "Sign in", es: "Iniciar sesión" },
  "Criar conta": { en: "Create account", es: "Crear cuenta" },
  "DESTAQUE DA SEMANA": { en: "WEEKLY SPOTLIGHT", es: "DESTACADO DE LA SEMANA" },
  "Novidades da temporada": { en: "New this season", es: "Novedades de la temporada" },
  "Episódios recentes": { en: "Recent episodes", es: "Episodios recientes" },
  "Ver detalhes": { en: "View details", es: "Ver detalles" },
  "Ver todos →": { en: "View all →", es: "Ver todos →" },
  "Filmes de anime": { en: "Anime movies", es: "Películas de anime" },
  "Mangás": { en: "Manga", es: "Manga" },
  "Manhwas": { en: "Manhwa", es: "Manhwa" },
  "Webtoons": { en: "Webtoons", es: "Webtoons" },
  "Agenda": { en: "Schedule", es: "Agenda" },
  "CONTEÚDOS": { en: "CONTENT", es: "CONTENIDOS" },
  "NAVEGAÇÃO": { en: "NAVIGATION", es: "NAVEGACIÓN" },
  "Sobre o projeto": { en: "About the project", es: "Sobre el proyecto" },
  "Ajuda e contato": { en: "Help and contact", es: "Ayuda y contacto" },
  "Termos de Uso": { en: "Terms of Use", es: "Términos de Uso" },
  "Compartilhar": { en: "Share", es: "Compartir" },
  "Copiar link": { en: "Copy link", es: "Copiar enlace" },
  "Inverter ordem": { en: "Reverse order", es: "Invertir orden" },
  "abre no provedor": { en: "opens on provider", es: "se abre en el proveedor" },
  "no AniList": { en: "on AniList", es: "en AniList" },
  "Entre episódios e capítulos. Histórias para assistir, ler e descobrir.": {
    en: "Between episodes and chapters. Stories to watch, read and discover.",
    es: "Entre episodios y capítulos. Historias para ver, leer y descubrir.",
  },
  "Entre episódios e capítulos.": {
    en: "Between episodes and chapters.",
    es: "Entre episodios y capítulos.",
  },
  "Histórias para assistir, ler e descobrir.": {
    en: "Stories to watch, read and discover.",
    es: "Historias para ver, leer y descubrir.",
  },
  "© 2026 Nekoflow. Todos os direitos reservados. Feito para quem ama boas histórias.": {
    en: "© 2026 Nekoflow. All rights reserved. Made for people who love great stories.",
    es: "© 2026 Nekoflow. Todos los derechos reservados. Hecho para quienes aman las buenas historias.",
  },
  "© 2026 Nekoflow. Todos os direitos reservados.": {
    en: "© 2026 Nekoflow. All rights reserved.",
    es: "© 2026 Nekoflow. Todos los derechos reservados.",
  },
  "Feito para quem ama boas histórias.": {
    en: "Made for people who love great stories.",
    es: "Hecho para quienes aman las buenas historias.",
  },
  "Episódios": { en: "Episodes", es: "Episodios" },
  "Sobre": { en: "About", es: "Acerca de" },
  "Universo": { en: "Universe", es: "Universo" },
  "Personagens": { en: "Characters", es: "Personajes" },
  "Sinopse": { en: "Synopsis", es: "Sinopsis" },
  "Sinopse exibida no idioma original; tradução ainda não disponível.": {
    en: "Synopsis shown in its original language; translation is not available yet.",
    es: "Sinopsis mostrada en su idioma original; la traducción aún no está disponible.",
  },
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
  "Assistido · desfazer": { en: "Watched · undo", es: "Visto · deshacer" },
  "ASSISTINDO": { en: "WATCHING", es: "VIENDO" },
  "Ocultar sinopse": { en: "Hide synopsis", es: "Ocultar sinopsis" },
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
  "Reportar um problema de reprodução": { en: "Report a playback problem", es: "Reportar un problema de reproducción" },
  "Idioma não informado": { en: "Language not specified", es: "Idioma no informado" },
  "Ainda sem fonte disponível no NekoFlow": { en: "No source available on NekoFlow yet", es: "Aún no hay una fuente disponible en NekoFlow" },
  "Entre para salvar seu progresso": { en: "Sign in to save your progress", es: "Inicia sesión para guardar tu progreso" },
  "Progresso sincronizado": { en: "Progress synced", es: "Progreso sincronizado" },
  "Progresso salvo agora": { en: "Progress saved", es: "Progreso guardado" },
  "Tentar novamente": { en: "Try again", es: "Intentar de nuevo" },
  "Tentar outra fonte": { en: "Try another source", es: "Probar otra fuente" },
  "Reportar problema": { en: "Report a problem", es: "Reportar un problema" },
  "Sem legenda separada": { en: "No separate subtitles", es: "Sin subtítulos separados" },
  "Áudio multi": { en: "Multi audio", es: "Audio múltiple" },
  "Automática": { en: "Automatic", es: "Automática" },
  "Fonte externa": { en: "External source", es: "Fuente externa" },
  "Japonês": { en: "Japanese", es: "Japonés" },
  "Português": { en: "Portuguese", es: "Portugués" },
  "Português (Brasil)": { en: "Portuguese (Brazil)", es: "Portugués (Brasil)" },
  "Inglês": { en: "English", es: "Inglés" },
  "Espanhol": { en: "Spanish", es: "Español" },
  "Coreano": { en: "Korean", es: "Coreano" },
  "Chinês": { en: "Chinese", es: "Chino" },
  "Original": { en: "Original", es: "Original" },
  "multi": { en: "multi", es: "múltiple" },
  "Assistir próximo": { en: "Watch next", es: "Ver siguiente" },
  "Ver créditos": { en: "Watch credits", es: "Ver créditos" },
  "Cancelar": { en: "Cancel", es: "Cancelar" },
  "Idioma da interface": { en: "Interface language", es: "Idioma de la interfaz" },
  "Buscar animes, mangás, webtoons…": { en: "Search anime, manga, webtoons…", es: "Buscar anime, manga, webtoons…" },
  "Limpar busca": { en: "Clear search", es: "Borrar búsqueda" },
  "Menu da conta": { en: "Account menu", es: "Menú de la cuenta" },
  "Meu perfil": { en: "My profile", es: "Mi perfil" },
  "Solicitar obra": { en: "Request a title", es: "Solicitar una obra" },
  "Conta": { en: "Account", es: "Cuenta" },
  "Conta e segurança": { en: "Account and security", es: "Cuenta y seguridad" },
  "Reprodução e leitura": { en: "Playback and reading", es: "Reproducción y lectura" },
  "Privacidade": { en: "Privacy", es: "Privacidad" },
  "Aparência": { en: "Appearance", es: "Apariencia" },
  "Idioma do site": { en: "Site language", es: "Idioma del sitio" },
  "Áudio preferido": { en: "Preferred audio", es: "Audio preferido" },
  "Legenda preferida": { en: "Preferred subtitles", es: "Subtítulos preferidos" },
  "Legenda alternativa": { en: "Fallback subtitles", es: "Subtítulos alternativos" },
  "Preferência salva": { en: "Preference saved", es: "Preferencia guardada" },
  "Preferências salvas na sua conta e aplicadas em todos os dispositivos.": {
    en: "Preferences saved to your account and applied on every device.",
    es: "Preferencias guardadas en tu cuenta y aplicadas en todos los dispositivos.",
  },
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
  const insensitive = Object.keys(UI).find((key) => key.toLocaleLowerCase("pt-BR") === label.toLocaleLowerCase("pt-BR"));
  if (insensitive && UI[insensitive]?.[target]) {
    const translated = UI[insensitive][target];
    return label === label.toUpperCase() ? translated.toUpperCase() : translated;
  }
  const episode = /^Episódio\s+([\d.]+)$/i.exec(label);
  if (episode) return `${target === "en" ? "Episode" : "Episodio"} ${episode[1]}`;
  const season = /^Temporada\s+([\d.]+)$/i.exec(label);
  if (season) return `${target === "en" ? "Season" : "Temporada"} ${season[1]}`;
  const count = /^(\d+)\s+episódios?$/i.exec(label);
  if (count) return `${count[1]} ${target === "en" ? (count[1] === "1" ? "episode" : "episodes") : (count[1] === "1" ? "episodio" : "episodios")}`;
  const workCount = /^(\d+)\s+obras?$/i.exec(label);
  if (workCount) return `${workCount[1]} ${target === "en" ? (workCount[1] === "1" ? "title" : "titles") : (workCount[1] === "1" ? "obra" : "obras")}`;
  const seasonCount = /^(\d+)\s+temporadas?$/i.exec(label);
  if (seasonCount) return `${seasonCount[1]} ${target === "en" ? (seasonCount[1] === "1" ? "season" : "seasons") : (seasonCount[1] === "1" ? "temporada" : "temporadas")}`;
  const action = /^(Assistir|Continuar)\s+(.+)$/i.exec(label);
  if (action) {
    const verb = action[1].toLocaleLowerCase("pt-BR") === "assistir"
      ? (target === "en" ? "Watch" : "Ver")
      : (target === "en" ? "Continue" : "Continuar");
    return `${verb} ${action[2]}`;
  }
  const unavailable = /^(Áudio|Legenda)\s+(.+?)\s+indisponível neste episódio\s+·\s+usando\s+(.+)$/i.exec(label);
  if (unavailable) {
    const kind = target === "en" ? (unavailable[1].toLocaleLowerCase("pt-BR") === "áudio" ? "Audio" : "Subtitles")
      : (unavailable[1].toLocaleLowerCase("pt-BR") === "áudio" ? "Audio" : "Subtítulos");
    const requested = translate(unavailable[2], target);
    const fallback = unavailable[3].split(", ").map((part) => translate(part, target)).join(", ");
    return target === "en"
      ? `${kind} ${requested} is unavailable for this episode · using ${fallback}`
      : `${kind} ${requested} no está disponible para este episodio · usando ${fallback}`;
  }
  const unreported = /^Legenda\s+(.+?)\s+não informada por esta fonte$/i.exec(label);
  if (unreported) return target === "en"
    ? `Subtitles ${translate(unreported[1], target)} are not specified by this source`
    : `Esta fuente no especifica subtítulos en ${translate(unreported[1], target)}`;
  const mediaLabel = /^(Áudio|Legenda|Fonte)\s+(.+)$/i.exec(label);
  if (mediaLabel) return `${translate(mediaLabel[1], target)} ${translate(mediaLabel[2], target)}`;
  const sourceKind = /^(.*)\s+(Legendado|Dublado)$/i.exec(label);
  if (sourceKind) return `${sourceKind[1]} ${translate(sourceKind[2], target)}`;
  const ago = /^há\s+(\d+)\s+h$/i.exec(label);
  if (ago) return target === "en" ? `${ago[1]}h ago` : `hace ${ago[1]} h`;
  const remaining = /^faltam\s+(\d+)\s+min$/i.exec(label);
  if (remaining) return target === "en" ? `${remaining[1]} min left` : `quedan ${remaining[1]} min`;
  const cover = /^Capa de\s+(.+)$/i.exec(label);
  if (cover) return `${target === "en" ? "Cover of" : "Portada de"} ${cover[1]}`;
  const seasonYear = /^(VERÃO|OUTONO|INVERNO|PRIMAVERA)\s+(\d{4})$/i.exec(label);
  if (seasonYear) {
    const key = seasonYear[1].toUpperCase();
    const names = {
      VERÃO: { en: "SUMMER", es: "VERANO" }, OUTONO: { en: "FALL", es: "OTOÑO" },
      INVERNO: { en: "WINTER", es: "INVIERNO" }, PRIMAVERA: { en: "SPRING", es: "PRIMAVERA" },
    };
    return `${names[key][target]} ${seasonYear[2]}`;
  }
  if (label.includes(" · ")) return label.split(" · ").map((part) => translate(part, target)).join(" · ");
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
  const canonicalAttrs = new WeakMap();
  const translatedAttrs = new WeakMap();
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
  const localizeAttributes = (element) => {
    if (!element?.getAttribute) return;
    for (const attr of ["placeholder", "aria-label", "title"]) {
      const raw = element.getAttribute(attr);
      if (!raw) continue;
      let originals = canonicalAttrs.get(element);
      let previous = translatedAttrs.get(element);
      if (!originals) canonicalAttrs.set(element, originals = {});
      if (!previous) translatedAttrs.set(element, previous = {});
      if (!(attr in originals) || (previous[attr] != null && raw !== previous[attr])) originals[attr] = raw;
      const next = translate(originals[attr]);
      previous[attr] = next;
      if (raw !== next) element.setAttribute(attr, next);
    }
  };
  const walk = (root) => {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return localizeText(root);
    localizeAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) localizeText(node);
    root.querySelectorAll?.("[placeholder],[aria-label],[title]").forEach(localizeAttributes);
  };
  const observer = new MutationObserver((records) => records.forEach((record) => {
    if (record.type === "characterData") localizeText(record.target);
    if (record.type === "attributes") localizeAttributes(record.target);
    record.addedNodes?.forEach(walk);
  }));
  observer.observe(document.body, { subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ["placeholder", "aria-label", "title"] });
  subscribeLocale(() => walk(document.body));
  walk(document.body);
  return () => observer.disconnect();
}
