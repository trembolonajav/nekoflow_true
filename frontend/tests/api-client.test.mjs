import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient } from "../src/services/api/client.js";

test("cliente retorna JSON e preserva as opções de sessão", async () => {
  let captured;
  const client = createApiClient({
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.deepEqual(await client.get("/api/content/home"), { ok: true });
  assert.equal(captured.url, "/api/content/home");
  assert.equal(captured.options.credentials, "same-origin");
  assert.equal(captured.options.headers.Accept, "application/json");
});

test("cliente normaliza erros da API", async () => {
  const client = createApiClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: "RESOURCE_NOT_FOUND",
          message: "Conteúdo não encontrado.",
          requestId: "req-123",
        }),
        { status: 404 },
      ),
  });

  await assert.rejects(client.get("/api/content/inexistente"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 404);
    assert.equal(error.code, "RESOURCE_NOT_FOUND");
    assert.equal(error.requestId, "req-123");
    return true;
  });
});

test("cliente diferencia timeout de falha de rede", async () => {
  const client = createApiClient({
    defaultTimeoutMs: 5,
    fetchImpl: (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  });

  await assert.rejects(client.get("/api/slow"), (error) => {
    assert.equal(error.code, "REQUEST_TIMEOUT");
    return true;
  });
});
