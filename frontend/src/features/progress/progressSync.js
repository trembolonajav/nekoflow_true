// Sincronização de progresso de UMA unidade (episódio ou capítulo + edição).
//
// Contrato com o Java (/api/v1/me/progress):
// - cada envio leva sessionId (uma por abertura do player/leitor), sequence crescente,
//   expectedVersion (última versão confirmada) e eventId (idempotência de reenvios);
// - envios são serializados: nunca há dois em voo para a mesma unidade;
// - "saved" só aparece depois da confirmação do servidor; sem conexão o estado é
//   "pending" e o evento fica guardado neste dispositivo (por usuário) para reenvio;
// - 409 com o estado atual: se esta sessão está consumindo agora, a posição dela é a
//   intenção mais recente e é reenviada sobre a versão do servidor; um evento antigo
//   guardado offline nunca sobrescreve o que outro dispositivo salvou depois.
//
// O Player e o Leitor reais (Protocolos 06 e 07) chamam report()/flush() a partir de
// eventos verdadeiros de reprodução/leitura. Nada aqui inventa tempo assistido.

const QUEUE_KEY = "nk-progress-v1-pending";

export function createProgressSync({
  api,
  kind,
  unitId,
  editionId = null,
  userId,
  storage = safeStorage(),
  uuid = randomUuid,
  onChange = () => {},
}) {
  if (kind !== "episode" && kind !== "chapter") throw new Error("kind deve ser episode ou chapter");
  const base = kind === "episode" ? `/api/v1/me/progress/episodes/${unitId}` : `/api/v1/me/progress/chapters/${unitId}`;
  const query = kind === "chapter" ? `?editionId=${editionId}` : "";
  const sessionId = uuid();
  let sequence = 0;
  let server = null; // último estado confirmado
  let status = "idle"; // idle | saving | saved | pending | conflict | error
  let lastError = null;
  let chain = Promise.resolve();

  const emit = () => onChange({ status, server, error: lastError });

  async function load() {
    server = await api.get(base + query);
    emit();
    return server;
  }

  // A sequência e o eventId são fixados na ordem de chegada; a versão esperada só é lida
  // quando o envio sai da fila (depois da confirmação do anterior).
  function payload(values, seq, eventId) {
    const body = { ...values, sessionId, sequence: seq, expectedVersion: server ? server.version : 0, eventId };
    if (kind === "chapter") body.editionId = editionId;
    return body;
  }

  async function send(body, { live }) {
    try {
      const accepted = await api.put(base, body);
      server = accepted;
      status = "saved";
      lastError = null;
      dequeue(body.eventId);
      emit();
      return accepted;
    } catch (error) {
      if (error && error.status === 409 && error.body && error.body.current) {
        server = error.body.current;
        dequeue(body.eventId);
        if (live && error.body.code === "PROGRESS_VERSION_CONFLICT") {
          // Esta sessão está ativa: reenvia a posição atual sobre a versão do servidor.
          // Mesma sequência (a sessão do servidor é outra); só versão e eventId mudam.
          return send({ ...body, expectedVersion: server.version, eventId: uuid() }, { live: false });
        }
        status = "conflict";
        lastError = error;
        emit();
        return server;
      }
      if (!error || error.status === 0 || error.status === 401) {
        // Sem conexão ou sessão expirada: guarda para reenviar (nunca afirma "salvo").
        enqueue(body);
        status = error && error.status === 401 ? "auth-required" : "pending";
        lastError = error || null;
        emit();
        return null;
      }
      status = "error";
      lastError = error;
      emit();
      throw error;
    }
  }

  /** Envia uma posição observada pelo player/leitor (ordem garantida). */
  function report(values, { live = true } = {}) {
    sequence += 1;
    const seq = sequence;
    const eventId = uuid();
    status = "saving";
    emit();
    const run = () => send(payload(values, seq, eventId), { live });
    chain = chain.then(run, run);
    return chain;
  }

  // ---- fila offline (por usuário; só eventos desta unidade) ---------------------------
  function readQueue() {
    try {
      const data = JSON.parse(storage.getItem(QUEUE_KEY) || "null");
      return data && data.userId === userId ? data.items || [] : [];
    } catch {
      return [];
    }
  }
  function writeQueue(items) {
    try {
      if (items.length) storage.setItem(QUEUE_KEY, JSON.stringify({ userId, items }));
      else storage.removeItem(QUEUE_KEY);
    } catch {
      /* armazenamento indisponível: o estado continua "pending" na memória */
    }
  }
  function enqueue(body) {
    const items = readQueue().filter((x) => !(x.path === base && x.body.eventId === body.eventId));
    items.push({ path: base, body, queuedAt: Date.now() });
    writeQueue(items);
  }
  function dequeue(eventId) {
    writeQueue(readQueue().filter((x) => x.body.eventId !== eventId));
  }

  /** Reenvia o que ficou pendente desta unidade (o servidor deduplica por eventId). */
  async function flush() {
    const mine = readQueue().filter((x) => x.path === base);
    for (const item of mine) {
      chain = chain.then(() => send(item.body, { live: false }));
      await chain;
    }
    return server;
  }

  return {
    load,
    report,
    flush,
    get state() {
      return { status, server, error: lastError, sessionId, sequence };
    },
  };
}

function randomUuid() {
  return globalThis.crypto && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
}

function safeStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  }
}

export const PROGRESS_QUEUE_KEY = QUEUE_KEY;
