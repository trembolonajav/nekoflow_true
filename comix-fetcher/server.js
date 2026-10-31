const http = require("node:http");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 8091);
const SECRET = process.env.COMIX_FETCHER_SECRET || "dev-only-comix-fetcher-secret";
const ORIGIN = "https://comix.to";
let browser;
let context;
let page;
let warming;
let queue = Promise.resolve();

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": body.length, "Cache-Control": "no-store" });
  response.end(body);
}

async function warm(force = false) {
  if (!force && page && !page.isClosed()) return;
  if (warming) return warming;
  warming = (async () => {
    await page?.close().catch(() => {});
    page = await context.newPage();
    await page.goto(`${ORIGIN}/browse`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  })().finally(() => { warming = null; });
  return warming;
}

async function catalog(pageNumber, limit) {
  await warm();
  const load = async () => {
    // O token `_` é assinado pelo cliente do Comix para o conjunto exato de filtros.
    // Navegar pela rota pública deixa o próprio cliente gerar uma requisição válida.
    const captured = page.waitForResponse(
      (response) => response.url().startsWith(`${ORIGIN}/api/v1/manga?`),
      { timeout: 45_000 },
    );
    const ratings = "safe,suggestive,erotica,pornographic";
    await page.goto(`${ORIGIN}/browse?page=${pageNumber}&content_rating=${ratings}`,
      { waitUntil: "domcontentloaded", timeout: 45_000 });
    const response = await captured;
    return { status: response.status(), body: await response.text() };
  };
  let result = await load();
  if ([401, 403, 429].includes(result.status)) {
    await warm(true);
    result = await load();
  }
  if (result.status !== 200) throw new Error(`upstream_${result.status}`);
  return JSON.parse(result.body);
}

async function start() {
  browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  context = await browser.newContext({ locale: "en-US" });
  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    return ["image", "media", "font"].includes(type) ? route.abort() : route.continue();
  });
  await warm();

  http.createServer(async (request, response) => {
    const address = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method !== "GET") return json(response, 405, { error: "method_not_allowed" });
    if (address.pathname === "/health") {
      return json(response, browser.isConnected() && page && !page.isClosed() ? 200 : 503,
        { status: browser.isConnected() && page && !page.isClosed() ? "UP" : "DOWN" });
    }
    if (address.pathname !== "/catalog" || request.headers["x-nekoflow-internal"] !== SECRET) {
      return json(response, 404, { error: "not_found" });
    }
    const pageNumber = Number(address.searchParams.get("page") || 1);
    const limit = Number(address.searchParams.get("limit") || 100);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 10_000 ||
        !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return json(response, 400, { error: "invalid_pagination" });
    }
    try {
      const operation = queue.then(() => catalog(pageNumber, limit));
      queue = operation.catch(() => {});
      json(response, 200, await operation);
    } catch (error) {
      console.error("Comix catalog fetch failed:", error.message);
      json(response, 502, { error: "upstream_unavailable" });
    }
  }).listen(PORT, "0.0.0.0", () => console.log(`Comix catalog fetcher ready on ${PORT}`));
}

async function shutdown() {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
start().catch((error) => { console.error(error); process.exit(1); });
