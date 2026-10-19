// Serviço compartilhado de progresso (Protocolo 05). Telas não falam com a API de
// progresso diretamente: usam estas funções e o createProgressSync.
import { api } from "../../services/api";
import { session } from "../../lib/session";
import { createProgressSync, PROGRESS_QUEUE_KEY } from "./progressSync";

const notify = () => window.dispatchEvent(new Event("nk:personal"));

function minutesLeft(resume) {
  if (!resume || !resume.durationMs || resume.state !== "RESUME") return "";
  return `${Math.max(1, Math.ceil((resume.durationMs - resume.positionMs) / 60000))} min`;
}

export const progressApi = {
  /** Sincronizador de uma unidade para o Player/Leitor. */
  sync(kind, unitId, editionId = null, onChange) {
    return createProgressSync({ api, kind, unitId, editionId, userId: session.user?.id, onChange });
  },

  episode: (id) => api.get(`/api/v1/me/progress/episodes/${id}`),
  chapter: (id, editionId) => api.get(`/api/v1/me/progress/chapters/${id}?editionId=${editionId}`),
  workUnits: (workId) => api.get(`/api/v1/me/works/${workId}/progress`),

  /** Conclusão marcada pelo usuário (fonte sem telemetria ou correção manual). */
  async setEpisodeCompleted(id, completed) {
    const r = completed
      ? await api.put(`/api/v1/me/progress/episodes/${id}/completion`)
      : await api.del(`/api/v1/me/progress/episodes/${id}/completion`);
    notify();
    return r;
  },
  async setChapterCompleted(id, editionId, completed) {
    const path = `/api/v1/me/progress/chapters/${id}/completion?editionId=${editionId}`;
    const r = completed ? await api.put(path) : await api.del(path);
    notify();
    return r;
  },
  async resetEpisode(id) {
    const r = await api.del(`/api/v1/me/progress/episodes/${id}`);
    notify();
    return r;
  },
  async resetChapter(id, editionId) {
    const r = await api.del(`/api/v1/me/progress/chapters/${id}?editionId=${editionId}`);
    notify();
    return r;
  },

  /** Formato dos cards "Continuar assistindo" da Home. */
  async continueWatching(limit = 4) {
    const items = await api.get(`/api/v1/me/continue-watching?limit=${limit}`);
    return items.map((x) => ({
      ...x,
      id: x.legacyId,
      publicId: x.workId,
      thumb: x.banner || x.cover,
      pct: `${Math.round(x.resume.percent)}%`,
      left: minutesLeft(x.resume),
      ep: x.resume.state === "NEXT" ? `Próximo: Ep. ${x.resume.unitNumber}` : `Ep. ${x.resume.unitNumber}`,
      href: x.resume.unitHref,
    }));
  },

  /** Formato dos cards "Continuar lendo" da página Leituras. */
  async continueReading(limit = 8) {
    const items = await api.get(`/api/v1/me/continue-reading?limit=${limit}`);
    return items.map((x) => ({
      ...x,
      id: x.legacyId,
      publicId: x.workId,
      status: "andamento",
      hasProgress: true,
      done: false,
      ch: x.resume.unitNumber,
      typeLabel: x.kind === "manga" ? "Mangá" : x.webtoon ? "Manhwa · Webtoon" : "Manhwa",
      pct: Math.round(x.resume.percent),
      where:
        x.resume.state === "NEXT"
          ? `Próximo: Cap. ${x.resume.unitNumber}`
          : `Cap. ${x.resume.unitNumber} · ${Math.round(x.resume.percent)}% do capítulo`,
      unitHref: x.resume.unitHref,
    }));
  },
};

/**
 * Dados antigos deste navegador (revisados no Protocolo 05):
 * - nk-pending-progress: eventos do player/leitor demonstrativos, sem vínculo com
 *   episódios/capítulos reais — não são progresso pessoal legítimo e são descartados;
 * - nk-player, nk-reader-prefs, nk-reader-bm: preferências do aparelho, mantidas.
 */
export function discardLegacyProgressCache() {
  try {
    localStorage.removeItem("nk-pending-progress");
    localStorage.removeItem("nk-progress");
    localStorage.removeItem("nk-reader-progress");
  } catch {
    /* sem armazenamento local: nada a descartar */
  }
}

export { PROGRESS_QUEUE_KEY };
