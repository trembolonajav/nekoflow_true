// Ponte das páginas demonstrativas do design (Player e Leitor de Solo Leveling).
//
// Essas páginas simulam reprodução/leitura com temporizadores e rolagem; elas não têm
// episódios/capítulos reais no catálogo. Pelo Protocolo 05 isso não pode virar progresso
// pessoal: nada aqui envia posição, conclusão ou "aberto" para o servidor. O progresso
// verdadeiro usa features/progress (ids reais de episódio/capítulo + edição).
import { api } from "./api";
import { session } from "./session";
import { discardLegacyProgressCache } from "../features/progress/progressApi";

discardLegacyProgressCache();

/** Eventos do player/leitor demonstrativo são descartados (não são progresso verificável). */
export function saveUnit() {
  return Promise.resolve({ ignored: true, reason: "DEMO_PLAYBACK_NOT_RECORDED" });
}

export function flushPending() {}

export function recordOpened() {}

/** Estado pessoal da obra (lista, alertas). As páginas do design não têm unidades reais: units = {}. */
export function loadWork(workId) {
  if (!session.loggedIn) return Promise.resolve(null);
  return api.get(`/api/me/works/${workId}`).catch(() => null);
}
