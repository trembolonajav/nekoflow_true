// Progresso de episódios/capítulos: grava no servidor e, sem conexão, guarda a
// posição neste dispositivo para reenviar depois (o servidor descarta o que for
// mais antigo que a posição já salva, então reenviar nunca sobrescreve dados novos).
import { api } from "./api";
import { session } from "./session";

const KEY = "nk-pending-progress";

function readPending() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    return p && p.uid === session.user.id ? p.items || {} : {};
  } catch (e) {
    return {};
  }
}

function writePending(items) {
  try {
    if (Object.keys(items).length) localStorage.setItem(KEY, JSON.stringify({ uid: session.user.id, items }));
    else localStorage.removeItem(KEY);
  } catch (e) {}
}

/** Salva uma unidade. body: { position, duration, pct, completed, reset } */
export function saveUnit(workId, unit, body) {
  if (!session.loggedIn) return Promise.resolve(null);
  const payload = { ...body, at: Date.now() };
  return api.put(`/api/me/progress/${workId}/${unit}`, payload).then(
    (r) => {
      flushPending();
      window.dispatchEvent(new Event("nk:personal"));
      return r;
    },
    (e) => {
      if (e && e.status === 401) return null;
      const items = readPending();
      items[`${workId}:${unit}`] = { workId, unit, body: payload };
      writePending(items);
      return null;
    },
  );
}

let flushing = false;
/** Reenvia posições que ficaram pendentes por falta de conexão. */
export function flushPending() {
  if (flushing || !session.loggedIn) return;
  const items = readPending();
  const list = Object.entries(items);
  if (!list.length) return;
  flushing = true;
  Promise.all(
    list.map(([k, it]) =>
      api.put(`/api/me/progress/${it.workId}/${it.unit}`, it.body).then(
        () => delete items[k],
        () => {},
      ),
    ),
  ).finally(() => {
    writePending(items);
    flushing = false;
  });
}

export function recordOpened(workId, unit) {
  if (!session.loggedIn) return;
  api.post(`/api/me/opened/${workId}/${unit}`).catch(() => {});
}

/** Estado pessoal da obra: { units: { n: { t, d, pct, done, at } }, resumeUnit, ... } */
export function loadWork(workId) {
  if (!session.loggedIn) return Promise.resolve(null);
  flushPending();
  return api.get(`/api/me/works/${workId}`).catch(() => null);
}

window.addEventListener("online", () => flushPending());
