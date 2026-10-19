// Cliente da API: sessão por cookie + cabeçalho CSRF (cookie XSRF-TOKEN).

function csrf() {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, body) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-XSRF-TOKEN"] = csrf();
  const res = await fetch(url, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body ?? {}),
  put: (url, body) => request("PUT", url, body ?? {}),
  patch: (url, body) => request("PATCH", url, body ?? {}),
  del: (url) => request("DELETE", url),
};
