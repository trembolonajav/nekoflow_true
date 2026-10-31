// Audiência do site para o painel administrativo (Admin.dc.html · Visão geral e Usuários).
// Os servidores são iframes: nada vem de dentro do vídeo. Medimos o que acontece na página —
// batimento a cada 30 s (online, navegando/no player/lendo, aba visível), páginas, cards vistos
// (50% por 1 s), cliques, player aberto, troca de servidor, próximo episódio e buscas.

const ENDPOINT = `${String(import.meta.env?.VITE_API_BASE_URL || "").replace(/\/$/, "")}/api/v1/telemetry`;
const SESSION_KEY = "nk-sid";
const WORK_LINK = /^\/(animes|leituras)\/([^/?#]+)/;

let queue = [];
let installed = false;

function sessionId() {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) localStorage.setItem(SESSION_KEY, (id = crypto.randomUUID()));
    return id;
  } catch {
    return (window.__nkSid = window.__nkSid || crypto.randomUUID());
  }
}

/** Referências da página atual: obra pelo slug da URL, episódio e capítulo pela query. */
function pageContext() {
  const path = location.pathname;
  const q = new URLSearchParams(location.search);
  const m = WORK_LINK.exec(path);
  return {
    state: path.startsWith("/player") ? "player" : path.startsWith("/leitor") ? "read" : "browse",
    path,
    visible: document.visibilityState === "visible",
    work: m ? decodeURIComponent(m[2]) : null,
    episodeId: q.get("episode"),
    chapterId: q.get("chapter"),
  };
}

// O painel administrativo é trabalho da equipe, não audiência do site.
const inAdmin = () => location.pathname.startsWith("/admin");

export function track(type, { work = null, episodeId = null, chapterId = null, ...data } = {}) {
  if (inAdmin()) return;
  queue.push({ type, work: work == null ? null : String(work), episodeId, chapterId, data });
  if (queue.length >= 25) flush();
}

export function flush({ heartbeat = false, beacon = false } = {}) {
  if (inAdmin()) heartbeat = false;
  const events = queue.splice(0, 60);
  if (!events.length && !heartbeat) return;
  const body = JSON.stringify({ sessionId: sessionId(), heartbeat: heartbeat ? pageContext() : null, events });
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    return;
  }
  fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

/** Seção do card (título da fileira) para saber de onde veio o clique. */
function sectionOf(el) {
  const box = el.closest("section, header, aside, nav");
  const h = box && box.querySelector("h1, h2");
  return (h && h.textContent.trim().slice(0, 60)) || (box && box.tagName.toLowerCase()) || "";
}

function linkTarget(a) {
  let url;
  try {
    url = new URL(a.getAttribute("href"), location.origin);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  const m = WORK_LINK.exec(url.pathname);
  if (m) return { work: decodeURIComponent(m[2]) };
  if (url.pathname === "/player" && url.searchParams.get("episode")) return { episodeId: url.searchParams.get("episode") };
  return null;
}

function watchImpressions() {
  const seen = new Set();
  const timers = new WeakMap();
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const a = entry.target;
        if (entry.isIntersecting) {
          timers.set(
            a,
            setTimeout(() => {
              const target = linkTarget(a);
              const key = `${location.pathname}|${a.getAttribute("href")}`;
              if (!target || seen.has(key)) return;
              seen.add(key);
              track("impression", { ...target, section: sectionOf(a), path: location.pathname });
            }, 1000),
          );
        } else clearTimeout(timers.get(a));
      }
    },
    { threshold: 0.5 },
  );
  const observe = (root) =>
    root.querySelectorAll?.('a[href^="/animes/"], a[href^="/leituras/"], a[href^="/player?episode="]').forEach((a) => {
      if (!a.__nkSeen) {
        a.__nkSeen = true;
        io.observe(a);
      }
    });
  observe(document);
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => n.nodeType === 1 && observe(n)))).observe(
    document.body,
    { childList: true, subtree: true },
  );
  // Ao trocar de página no SPA as impressões contam de novo.
  window.addEventListener("nk:page", () => seen.clear());
}

function watchPages() {
  let last = "";
  const page = () => {
    // Mudança só de query (abas, filtros) não é uma nova página.
    const now = location.pathname;
    if (now === last) return;
    last = now;
    window.dispatchEvent(new Event("nk:page"));
    track("page_view", { path: location.pathname, search: location.search.slice(0, 120) });
  };
  for (const fn of ["pushState", "replaceState"]) {
    const original = history[fn];
    history[fn] = function (...args) {
      const out = original.apply(this, args);
      setTimeout(page, 0);
      return out;
    };
  }
  window.addEventListener("popstate", page);
  page();
}

export function installTelemetry() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  watchPages();
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest && e.target.closest("a[href]");
      const target = a && linkTarget(a);
      if (target) track("click", { ...target, section: sectionOf(a), path: location.pathname });
    },
    true,
  );
  if ("IntersectionObserver" in window) watchImpressions();
  flush({ heartbeat: true });
  setInterval(() => flush({ heartbeat: true }), 30000);
  setInterval(() => flush(), 10000);
  document.addEventListener("visibilitychange", () => flush({ heartbeat: true }));
  window.addEventListener("pagehide", () => flush({ heartbeat: true, beacon: true }));
}
