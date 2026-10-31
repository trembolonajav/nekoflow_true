import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createProgressSync } from "../src/features/progress/progressSync.js";
import { groupHistory } from "../src/features/history/groupHistory.js";

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    m,
  };
}

/** API falsa que imita o contrato do Java (versão, sequência, idempotência). */
function fakeServer() {
  const state = { version: 0, positionMs: 0, sessionId: null, sequence: null, events: new Set() };
  const calls = [];
  let offline = false;
  let expired = false;
  const api = {
    async get() {
      return { ...state, events: undefined };
    },
    async put(path, body) {
      calls.push(body);
      if (offline) throw Object.assign(new Error("rede"), { status: 0, code: "NETWORK_ERROR" });
      if (expired) throw Object.assign(new Error("sessão"), { status: 401, code: "AUTHENTICATION_REQUIRED" });
      if (state.events.has(body.eventId)) return { ...state, events: undefined, duplicate: true };
      const current = { ...state, events: undefined };
      if (body.sessionId === state.sessionId && body.sequence <= state.sequence)
        throw Object.assign(new Error("velho"), { status: 409, body: { code: "STALE_PROGRESS_EVENT", current } });
      if (body.expectedVersion !== state.version)
        throw Object.assign(new Error("conflito"), {
          status: 409,
          body: { code: "PROGRESS_VERSION_CONFLICT", current },
        });
      state.version += 1;
      state.positionMs = body.positionMs;
      state.sessionId = body.sessionId;
      state.sequence = body.sequence;
      state.events.add(body.eventId);
      return { ...state, events: undefined };
    },
  };
  return {
    api,
    state,
    calls,
    setOffline: (v) => (offline = v),
    setExpired: (v) => (expired = v),
    otherDeviceSaves(position) {
      state.version += 1;
      state.positionMs = position;
      state.sessionId = "outro-dispositivo";
      state.sequence = 1;
    },
  };
}

const unit = "11111111-1111-4111-8111-111111111111";

test("envios são serializados, com sequência crescente e versão confirmada", async () => {
  const srv = fakeServer();
  const sync = createProgressSync({ api: srv.api, kind: "episode", unitId: unit, userId: 1, storage: memoryStorage() });
  await sync.load();
  await Promise.all([
    sync.report({ positionMs: 1000 }),
    sync.report({ positionMs: 2000 }),
    sync.report({ positionMs: 3000 }),
  ]);
  assert.deepEqual(
    srv.calls.map((c) => [c.sequence, c.expectedVersion]),
    [
      [1, 0],
      [2, 1],
      [3, 2],
    ],
  );
  assert.equal(sync.state.status, "saved");
  assert.equal(srv.state.positionMs, 3000);
});

test("conflito durante a reprodução ativa reenvia sobre a versão do servidor", async () => {
  const srv = fakeServer();
  const sync = createProgressSync({ api: srv.api, kind: "episode", unitId: unit, userId: 1, storage: memoryStorage() });
  await sync.load();
  await sync.report({ positionMs: 10_000 });
  srv.otherDeviceSaves(50_000);
  await sync.report({ positionMs: 12_000 }, { live: true });
  assert.equal(srv.state.positionMs, 12_000);
  assert.equal(srv.state.version, 3);
});

test("após um conflito, os próximos envios da mesma sessão continuam válidos", async () => {
  const srv = fakeServer();
  const sync = createProgressSync({ api: srv.api, kind: "episode", unitId: unit, userId: 1, storage: memoryStorage() });
  await sync.load();
  await sync.report({ positionMs: 1000 });
  srv.otherDeviceSaves(50_000);
  await Promise.all([sync.report({ positionMs: 2000 }), sync.report({ positionMs: 3000 })]);
  assert.equal(srv.state.positionMs, 3000);
  assert.equal(sync.state.status, "saved");
});

test("evento antigo (não ativo) não sobrescreve o que outro dispositivo salvou", async () => {
  const srv = fakeServer();
  const sync = createProgressSync({ api: srv.api, kind: "episode", unitId: unit, userId: 1, storage: memoryStorage() });
  await sync.load();
  srv.otherDeviceSaves(50_000);
  await sync.report({ positionMs: 9_000 }, { live: false });
  assert.equal(srv.state.positionMs, 50_000);
  assert.equal(sync.state.status, "conflict");
  assert.equal(sync.state.server.positionMs, 50_000);
});

test("sem conexão: fica pendente (nunca 'saved') e reenvia depois", async () => {
  const srv = fakeServer();
  const storage = memoryStorage();
  const sync = createProgressSync({ api: srv.api, kind: "episode", unitId: unit, userId: 7, storage });
  await sync.load();
  srv.setOffline(true);
  await sync.report({ positionMs: 4000 });
  assert.equal(sync.state.status, "pending");
  assert.ok(storage.getItem("nk-progress-v1-pending").includes('"userId":7'));
  srv.setOffline(false);
  await sync.flush();
  assert.equal(sync.state.status, "saved");
  assert.equal(srv.state.positionMs, 4000);
  assert.equal(storage.getItem("nk-progress-v1-pending"), null);
});

test("sessão expirada guarda o evento em vez de descartar", async () => {
  const srv = fakeServer();
  const storage = memoryStorage();
  const sync = createProgressSync({ api: srv.api, kind: "chapter", unitId: unit, editionId: "e1", userId: 3, storage });
  srv.setExpired(true);
  await sync.report({ pageIndex: 4, percentComplete: 30 });
  assert.equal(sync.state.status, "auth-required");
  const queued = JSON.parse(storage.getItem("nk-progress-v1-pending"));
  assert.equal(queued.items[0].body.editionId, "e1");
});

test("fila de outra conta nunca é reenviada", async () => {
  const srv = fakeServer();
  const storage = memoryStorage();
  storage.setItem(
    "nk-progress-v1-pending",
    JSON.stringify({
      userId: 99,
      items: [{ path: `/api/v1/me/progress/episodes/${unit}`, body: { eventId: "x", positionMs: 1 } }],
    }),
  );
  const sync = createProgressSync({ api: srv.api, kind: "episode", unitId: unit, userId: 1, storage });
  await sync.flush();
  assert.equal(srv.calls.length, 0);
});

test("histórico agrupa por dia e mostra o tipo de atividade", () => {
  const now = new Date("2026-10-19T15:00:00");
  const groups = groupHistory(
    [
      {
        id: 2,
        occurredAt: "2026-10-19T14:05:00",
        mediaFamily: "READING",
        activityType: "STARTED",
        unitNumber: "42",
        title: "M",
        available: true,
        unitHref: "/leituras/m",
        href: "/leituras/m",
      },
      {
        id: 1,
        occurredAt: "2026-10-18T20:30:00",
        mediaFamily: "ANIMATION",
        activityType: "MANUAL_COMPLETED",
        unitNumber: "7",
        title: "A",
        available: false,
        unitHref: "/player?episode=x",
        href: "/animes/a",
      },
    ],
    now,
  );
  assert.deepEqual(
    groups.map((g) => g.day),
    ["Hoje", "Ontem"],
  );
  assert.match(groups[0].items[0].time, /^Iniciado às 14:05/);
  assert.equal(groups[0].items[0].unit, "Capítulo 42");
  assert.match(groups[1].items[0].time, /^Marcado como concluído/);
  assert.equal(groups[1].items[0].href, "/animes/a", "unidade indisponível abre a obra");
});

test("player e leitor demonstrativos não enviam progresso fictício", () => {
  const bridge = readFileSync(new URL("../src/lib/progress.js", import.meta.url), "utf8");
  assert.doesNotMatch(bridge, /api\.(put|post)\(/);
  for (const page of ["Home", "Conta", "Explorar", "Leituras", "Obra", "ObraLeitura", "Calendario", "Entrar"]) {
    const src = readFileSync(new URL(`../src/pages/${page}.jsx`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\/api\/me\/(library|favorites|follows|progress|opened|summary|continue)\//, page);
  }
});

test("logout preserva só a fila isolada de progresso", () => {
  const session = readFileSync(new URL("../src/lib/session.js", import.meta.url), "utf8");
  assert.match(session, /nk-progress-v1-pending/);
});
