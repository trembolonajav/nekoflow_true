const http = require("node:http");

const PORT = Number(process.env.PORT || 8090);
const SECRET = process.env.TIA_FETCHER_SECRET || "dev-only-tia-fetcher-secret";
const ADAPTER = new URL(process.env.TIA_HOST_ADAPTER_URL || "http://host.docker.internal:19091");
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CONCURRENT = 4;

let active = 0;
const waiting = [];

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": body.length, "Cache-Control": "no-store" });
  response.end(body);
}

function safePath(value) {
  return Boolean(value && value.length <= 2048 && value.startsWith("/") && !value.startsWith("//") &&
    !value.includes("\\") && !value.includes("\r") && !value.includes("\n"));
}

async function acquire() {
  if (active < MAX_CONCURRENT) return void (active += 1);
  await new Promise((resolve) => waiting.push(resolve));
  active += 1;
}

function release() {
  active -= 1;
  waiting.shift()?.();
}

async function adapterRequest(path, includeSecret) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(new URL(path, ADAPTER), {
      headers: includeSecret ? { "X-Nekoflow-Internal": SECRET } : {},
      signal: controller.signal,
    });
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_BYTES) throw new Error("response_too_large");
    return { status: response.status, body, contentType: response.headers.get("content-type") };
  } finally {
    clearTimeout(timeout);
  }
}

http.createServer(async (request, response) => {
  const address = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method !== "GET") return json(response, 405, { error: "method_not_allowed" });
  if (address.pathname === "/health") {
    try {
      const upstream = await adapterRequest("/health", false);
      return json(response, upstream.status === 200 ? 200 : 503, { status: upstream.status === 200 ? "UP" : "DOWN" });
    } catch {
      return json(response, 503, { status: "DOWN" });
    }
  }
  if (address.pathname !== "/fetch" || request.headers["x-nekoflow-internal"] !== SECRET) {
    return json(response, 404, { error: "not_found" });
  }
  const path = address.searchParams.get("path") || "";
  if (!safePath(path)) return json(response, 400, { error: "invalid_path" });

  await acquire();
  try {
    const upstream = await adapterRequest(`/fetch?path=${encodeURIComponent(path)}`, true);
    if (upstream.status !== 200) return json(response, 502, { error: "upstream_unavailable" });
    response.writeHead(200, {
      "Content-Type": upstream.contentType || "text/html; charset=utf-8",
      "Content-Length": upstream.body.length,
      "Cache-Control": "private, max-age=30",
    });
    response.end(upstream.body);
  } catch (error) {
    console.error("TiaManhwa adapter request failed:", error.message);
    json(response, 502, { error: "upstream_unavailable" });
  } finally {
    release();
  }
}).listen(PORT, "0.0.0.0", () => console.log(`TiaManhwa gateway ready on ${PORT}`));
