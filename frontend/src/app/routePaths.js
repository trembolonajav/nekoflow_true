export const routePaths = Object.freeze({
  home: "/",
  homeDirections: "/estudos/home-direcoes",
  calendar: "/calendario",
  account: "/conta",
  login: "/entrar",
  createAccount: "/criar-conta",
  explore: "/explorar",
  animes: "/animes",
  readings: "/leituras",
  animeWork: "/animes/:slug",
  readingWork: "/leituras/:slug",
  legacyAnimeWork: "/obra",
  legacyReadingWork: "/obra-leitura",
  reader: "/leitor",
  player: "/player",
  requestDetail: "/solicitacoes/:id",
  admin: "/admin",
  adminOperations: "/admin/operacao",
  library: "/biblioteca",
  continueWatching: "/continuar-assistindo",
  continueReading: "/continuar-lendo",
  history: "/historico",
  requests: "/solicitacoes",
  notifications: "/notificacoes",
  settings: "/configuracoes",
});

export function accountTab(tab, params = {}) {
  const query = new URLSearchParams({ aba: tab, ...params });
  return `${routePaths.account}?${query}`;
}

export function requestDetailPath(id) {
  return `/solicitacoes/${encodeURIComponent(id)}`;
}

export function animePath(slug) {
  return `/animes/${encodeURIComponent(slug)}`;
}

export function readingPath(slug) {
  return `/leituras/${encodeURIComponent(slug)}`;
}
