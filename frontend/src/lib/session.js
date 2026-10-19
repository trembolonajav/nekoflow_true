// Sessão do usuário (uma única fonte para todas as telas).
import { api } from "./api";

let current = { authenticated: false };
let loaded = null;
const subs = new Set();

export const session = {
  /** Carrega /api/auth/me uma vez (também emite o cookie CSRF). */
  load() {
    if (!loaded) {
      loaded = api
        .get("/api/auth/me")
        .catch(() => ({ authenticated: false }))
        .then((me) => {
          current = me || { authenticated: false };
          subs.forEach((f) => f(current));
          return current;
        });
    }
    return loaded;
  },
  get user() {
    return current;
  },
  get loggedIn() {
    return !!current.authenticated;
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  set(me) {
    current = me || { authenticated: false };
    loaded = Promise.resolve(current);
    subs.forEach((f) => f(current));
  },
  async login(login, password) {
    const me = await api.post("/api/auth/login", { login, password });
    clearPrivateCache();
    this.set(me);
    return me;
  },
  async register(username, email, password) {
    const me = await api.post("/api/auth/register", { username, email, password });
    clearPrivateCache();
    this.set(me);
    return me;
  },
  /** Sai da conta e limpa dados privados guardados neste navegador (a conta não é afetada). */
  async logout() {
    try {
      await api.post("/api/auth/logout");
    } catch (e) {}
    clearPrivateCache();
    this.set({ authenticated: false });
  },
};

/** Remove caches pessoais deste dispositivo (nunca mostra dados da conta anterior). */
export function clearPrivateCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("nk-") && !k.startsWith("nk-pending-")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}

/** Manda para o login preservando a página de origem. */
export function goLogin() {
  const next = location.pathname + location.search;
  location.href = "/entrar?next=" + encodeURIComponent(next);
}
