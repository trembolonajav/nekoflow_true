// Mensagens dos códigos estáveis de erro do Java, por idioma do site. Em português a
// mensagem do servidor (já em PT-BR) é mantida; em inglês e espanhol, o código decide.
const ERRORS = {
  AUTHENTICATION_REQUIRED: ["Sign in to continue.", "Inicia sesión para continuar."],
  ACCESS_DENIED: ["You don't have permission to do this.", "No tienes permiso para hacer esto."],
  RESOURCE_NOT_FOUND: ["We couldn't find what you were looking for.", "No encontramos lo que buscabas."],
  RESOURCE_CONFLICT: ["This was changed by someone else. Reload and try again.", "Alguien más lo modificó. Recarga e inténtalo de nuevo."],
  INVALID_REQUEST: ["Some information is invalid. Check it and try again.", "Hay datos no válidos. Revísalos e inténtalo de nuevo."],
  VALIDATION_FAILED: ["Some fields need fixing.", "Hay campos que corregir."],
  INVALID_FILTER: ["This filter is not valid.", "Este filtro no es válido."],
  INVALID_PAGINATION: ["This page is not valid.", "Esta página no es válida."],
  INVALID_STATUS: ["This status is not valid.", "Este estado no es válido."],
  INVALID_WORK_ID: ["This title link is not valid.", "El enlace de esta obra no es válido."],
  RATE_LIMIT_EXCEEDED: ["Too many attempts. Wait a moment and try again.", "Demasiados intentos. Espera un momento e inténtalo de nuevo."],
  INTERNAL_ERROR: ["Something went wrong on our side. Try again.", "Algo salió mal de nuestro lado. Inténtalo de nuevo."],
  REQUEST_FAILED: ["The request failed. Try again.", "La solicitud falló. Inténtalo de nuevo."],
  NETWORK_ERROR: ["Couldn't reach NekoFlow. Check your connection.", "No se pudo conectar con NekoFlow. Revisa tu conexión."],
  REQUEST_TIMEOUT: ["NekoFlow took too long to answer.", "NekoFlow tardó demasiado en responder."],
  EPISODE_NOT_FOUND: ["Episode not found.", "Episodio no encontrado."],
  CHAPTER_NOT_FOUND: ["Chapter not found.", "Capítulo no encontrado."],
  CHAPTER_PAGES_UNAVAILABLE: ["This chapter has no pages on NekoFlow yet.", "Este capítulo aún no tiene páginas en NekoFlow."],
  EDITION_REQUIRED: ["Choose an edition to read this chapter.", "Elige una edición para leer este capítulo."],
  SOURCE_UNAVAILABLE: ["This source is not available right now.", "Esta fuente no está disponible ahora."],
  SOURCE_NOT_PLAYABLE: ["This source opens on the provider's site.", "Esta fuente se abre en el sitio del proveedor."],
  PROGRESS_NOT_VERIFIABLE: ["This source doesn't report progress. Mark it as watched when you finish.", "Esta fuente no informa el progreso. Márcalo como visto al terminar."],
  PROGRESS_VERSION_CONFLICT: ["Your progress was updated on another device.", "Tu progreso se actualizó en otro dispositivo."],
  STALE_PROGRESS_EVENT: ["A newer position was already saved.", "Ya se guardó una posición más reciente."],
  PLAYBACK_COMPLETION_UNVERIFIED: ["Watch more of the episode to mark it as watched.", "Mira más del episodio para marcarlo como visto."],
  READING_COMPLETION_UNVERIFIED: ["Read to the end to mark the chapter as read.", "Lee hasta el final para marcar el capítulo como leído."],
  INVALID_POSITION: ["Invalid playback or reading position.", "Posición de reproducción o lectura no válida."],
  INVALID_DURATION: ["Invalid episode duration.", "Duración del episodio no válida."],
  SYNC_FIELDS_REQUIRED: ["Progress data is incomplete.", "Los datos del progreso están incompletos."],
  LEGACY_PROGRESS_DISABLED: ["Progress is now saved per episode or chapter.", "El progreso ahora se guarda por episodio o capítulo."],
  TOO_MANY_ISSUE_REPORTS: ["You sent many reports in the last hour. Try again later.", "Enviaste muchos reportes en la última hora. Inténtalo más tarde."],
  INVALID_ISSUE_CATEGORY: ["Choose the type of problem.", "Elige el tipo de problema."],
  INVALID_ISSUE_TARGET: ["This report doesn't match the episode or chapter.", "Este reporte no corresponde al episodio o capítulo."],
  ISSUE_DETAIL_TOO_LONG: ["Describe the problem in up to 500 characters.", "Describe el problema en hasta 500 caracteres."],
  DUPLICATE_REQUEST: ["You already requested this title.", "Ya solicitaste esta obra."],
  ANILIST_UNAVAILABLE: ["AniList didn't answer. Try again shortly.", "AniList no respondió. Inténtalo en unos instantes."],
};

/** Mensagem de um erro da API no idioma pedido (PT-BR mantém a do servidor). */
export function translateError(code, serverMessage, locale) {
  if (!locale || locale === "pt-BR") return serverMessage;
  const entry = ERRORS[code];
  if (!entry) return serverMessage;
  return locale === "es" ? entry[1] : entry[0];
}

export const ERROR_CODES = Object.keys(ERRORS);
