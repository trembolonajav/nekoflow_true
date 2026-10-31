// Leitura e gravação das preferências: conta quando logado, navegador quando visitante.
// A gravação sempre mescla com o que já existe (outras telas usam o mesmo JSON).
import { api } from "../../services/api";
import { session } from "../../lib/session";
import { getLocale, setLocale } from "../../i18n/locale";
import {
  labelFromLocale,
  localeFromLabel,
  normalizePreferences,
  readLocalPreferences,
  writeLocalPreferences,
} from "./mediaPreferences";

export async function loadPreferences() {
  if (session.loggedIn) {
    try {
      return (await api.get("/api/me/preferences")) || {};
    } catch {
      return readLocalPreferences();
    }
  }
  return readLocalPreferences();
}

export async function savePreferences(patch) {
  if (session.loggedIn) {
    const current = (await api.get("/api/me/preferences").catch(() => ({}))) || {};
    const next = { ...current, ...patch };
    await api.put("/api/me/preferences", next);
    return next;
  }
  const next = { ...readLocalPreferences(), ...patch };
  writeLocalPreferences(next);
  return next;
}

export async function loadMediaPreferences() {
  return normalizePreferences(await loadPreferences());
}

/** Troca o idioma do site e grava na conta (ou no navegador). */
export function changeSiteLanguage(code) {
  setLocale(code);
  const label = labelFromLocale(code);
  if (label) savePreferences({ locale: label }).catch(() => {});
}

/**
 * Ao entrar na conta, o idioma salvo nela vale neste aparelho. Sem preferência salva,
 * a escolha atual deste navegador passa a ser a da conta.
 */
export function installAccountLanguageSync() {
  const apply = async () => {
    if (!session.loggedIn) return;
    const cfg = await loadPreferences();
    const saved = localeFromLabel(cfg.locale);
    if (saved && saved !== getLocale()) setLocale(saved);
    else if (!saved) savePreferences({ locale: labelFromLocale(getLocale()) }).catch(() => {});
  };
  session.subscribe(apply);
  session.load().then(apply).catch(() => {});
}
