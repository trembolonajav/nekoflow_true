const DEFAULT_TIMEOUT_MS = 12_000;

function apiBase() {
  return String(import.meta.env?.VITE_API_BASE_URL || "").replace(/\/$/, "");
}

function requestUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

function csrfToken() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function errorBody(status, body, fallbackCode) {
  const source = body && typeof body === "object" ? body : {};
  return {
    code: source.code || fallbackCode || `HTTP_${status}`,
    message:
      source.message ||
      (status
        ? `A API respondeu com HTTP ${status}.`
        : "Não foi possível acessar a API."),
    requestId: source.requestId || null,
    ...source,
  };
}

export class ApiError extends Error {
  constructor(status, body, options = {}) {
    const normalized = errorBody(status, body, options.code);
    super(
      normalized.message,
      options.cause ? { cause: options.cause } : undefined,
    );
    this.name = "ApiError";
    this.status = status;
    this.code = normalized.code;
    this.requestId = normalized.requestId;
    this.body = normalized;
  }
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (cause) {
    if (response.ok) {
      throw new ApiError(
        response.status,
        {
          code: "INVALID_API_RESPONSE",
          message: "A API devolveu uma resposta que não é JSON válido.",
        },
        { cause },
      );
    }
    return { message: text };
  }
}

export function createApiClient({
  fetchImpl = fetch,
  defaultTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  async function request(method, path, options = {}) {
    const {
      body,
      signal,
      timeoutMs = defaultTimeoutMs,
      headers: extraHeaders = {},
    } = options;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) abortFromCaller();
      else signal.addEventListener("abort", abortFromCaller, { once: true });
    }
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : null;

    const headers = { Accept: "application/json", ...extraHeaders };
    // FormData (envio de arquivos) define o próprio Content-Type com o boundary.
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
    if (!/^(GET|HEAD)$/i.test(method)) {
      const token = csrfToken();
      if (token) headers["X-XSRF-TOKEN"] = token;
    }

    try {
      const response = await fetchImpl(requestUrl(path), {
        method,
        headers,
        credentials: "same-origin",
        signal: controller.signal,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });
      const data = await parseResponse(response);
      if (!response.ok) throw new ApiError(response.status, data);
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError(
          0,
          {
            code: timedOut ? "REQUEST_TIMEOUT" : "REQUEST_ABORTED",
            message: timedOut
              ? "A API demorou mais do que o esperado para responder."
              : "A requisição foi cancelada.",
          },
          { cause: error },
        );
      }
      throw new ApiError(
        0,
        {
          code: "NETWORK_ERROR",
          message: "Não foi possível conectar à API.",
        },
        { cause: error },
      );
    } finally {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abortFromCaller);
    }
  }

  return {
    request,
    get: (path, options) => request("GET", path, options),
    post: (path, body = {}, options = {}) =>
      request("POST", path, { ...options, body }),
    put: (path, body = {}, options = {}) =>
      request("PUT", path, { ...options, body }),
    patch: (path, body = {}, options = {}) =>
      request("PATCH", path, { ...options, body }),
    del: (path, options) => request("DELETE", path, options),
    /** Envio multipart (arquivos); sem limite curto de tempo, uploads podem ser grandes. */
    upload: (path, formData, options = {}) =>
      request("POST", path, { timeoutMs: 0, ...options, body: formData }),
  };
}

export const api = createApiClient();
