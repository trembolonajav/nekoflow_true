export const routePaths = Object.freeze({
  home: "/",
  homeDirections: "/estudos/home-direcoes",
  calendar: "/calendario",
  account: "/conta",
  login: "/entrar",
  explore: "/explorar",
  readings: "/leituras",
  animeWork: "/obra",
  readingWork: "/obra-leitura",
  reader: "/leitor",
  player: "/player",
  requestDetail: "/solicitacoes/:id",
  admin: "/admin",
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
