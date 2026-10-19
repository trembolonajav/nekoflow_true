// Serviço de mídia (Protocolo 06). O Player e o Leitor recebem do Java apenas o que
// está publicado e autorizado; URLs de reprodução saem do endpoint de acesso.
import { api } from "../../services/api";

export const mediaApi = {
  playback: (episodeId) => api.get(`/api/v1/episodes/${episodeId}/playback`),
  access: (episodeId, sourceId) => api.post(`/api/v1/episodes/${episodeId}/playback/sources/${sourceId}/access`),
  manifest: (chapterId, editionId) => api.get(`/api/v1/chapters/${chapterId}/editions/${editionId}/manifest`),
  reportIssue: (body) => api.post("/api/v1/me/media-issues", body),
};

/** Categorias aceitas pelo Java para "Reportar problema". */
export const ISSUE_CATEGORIES = {
  VIDEO_NOT_LOADING: "O vídeo não carrega",
  WRONG_AUDIO: "Áudio no idioma errado",
  SUBTITLE_SYNC: "Legenda fora de sincronia",
  WRONG_EPISODE: "Episódio errado",
  OTHER: "Outro problema",
};

export const READER_ISSUE_CATEGORIES = {
  IMAGE_MISSING: "Página não carrega",
  WRONG_ORDER: "Páginas fora de ordem",
  OTHER: "Outro problema",
};
