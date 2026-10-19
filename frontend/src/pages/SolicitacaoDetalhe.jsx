// Detalhe e acompanhamento de uma solicitação (tela nova, no estilo do design).
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Shell from "../ui/Shell";
import { api } from "../lib/api";
import { C, F, STATUS_COLOR, btn, card, container, eyebrow, h1, input, pill } from "../ui/tokens";

const STEPS = ["Recebida", "Em análise", "Aprovada", "Atendida"];
const STEP_OF = {
  RECEBIDA: 0,
  EM_ANALISE: 1,
  AGUARDANDO: 1,
  APROVADA: 2,
  PROGRAMADA: 2,
  ATENDIDA: 3,
  NAO_ATENDIDA: 1,
  CANCELADA: 0,
};

export default function SolicitacaoDetalhe() {
  const { id } = useParams();
  const [r, setR] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | missing | error
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/api/requests/${encodeURIComponent(id)}`)
      .then((data) => {
        setR(data);
        setDraft(data.details || "");
        setState("ok");
      })
      .catch((e) => setState(e.status === 404 || e.status === 400 ? "missing" : "error"));
  }, [id]);

  useEffect(load, [load]);

  const run = (promise, ok) => {
    setBusy(true);
    setMsg(null);
    promise
      .then((data) => {
        setR(data && data.history ? data : r);
        if (!(data && data.history)) load();
        setMsg({ ok: true, text: ok });
        window.dispatchEvent(new Event("nk:personal"));
      })
      .catch((e) =>
        setMsg({ ok: false, text: (e.body && e.body.message) || "Não foi possível concluir. Tente novamente." }),
      )
      .finally(() => {
        setBusy(false);
        setEditing(false);
        setConfirmCancel(false);
      });
  };

  return (
    <Shell>
      <div style={container(880)}>
        <a href="/conta?aba=solicitacoes" style={{ fontSize: "14px", alignSelf: "flex-start" }}>
          ← Minhas solicitações
        </a>

        {state === "loading" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <span
              style={{ display: "block", width: "60%", height: "44px", borderRadius: "8px", background: C.raised }}
            />
            <span
              style={{ display: "block", width: "100%", height: "160px", borderRadius: "14px", background: C.raised }}
            />
          </div>
        )}

        {(state === "missing" || state === "error") && (
          <div style={{ ...card, display: "flex", alignItems: "center", gap: "18px", padding: "28px" }}>
            <img
              src="/assets/nekoflow-mascot.png"
              alt=""
              style={{ width: "84px", height: "84px", objectFit: "contain" }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontFamily: F.serif, fontSize: "28px" }}>
                {state === "missing" ? "Solicitação não encontrada" : "Não foi possível carregar"}
              </span>
              <span style={{ fontSize: "14px", color: C.muted }}>
                {state === "missing"
                  ? "Ela pode ter sido removida ou não pertence à sua conta."
                  : "Verifique sua conexão e tente novamente."}
              </span>
              {state === "error" && (
                <button onClick={load} style={{ ...btn("ghost"), alignSelf: "flex-start" }}>
                  Tentar de novo
                </button>
              )}
            </div>
          </div>
        )}

        {state === "ok" && r && (
          <>
            <header style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={eyebrow}>
                {r.kindLabel} · {r.type}
              </span>
              <h1 style={h1}>{r.title}</h1>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "13px",
                  color: C.muted,
                }}
              >
                <span style={pill(STATUS_COLOR[r.statusCode])}>{r.status}</span>
                <span style={{ fontFamily: F.mono }}>{r.id}</span>
                <span>· enviada em {r.date}</span>
                {r.supporters > 0 && (
                  <span>
                    · {r.supporters} {r.supporters === 1 ? "pessoa também quer" : "pessoas também querem"}
                  </span>
                )}
              </div>
            </header>

            <div style={{ ...card, display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "6px" }}>
                {STEPS.map((s, i) => {
                  const bad = r.statusCode === "NAO_ATENDIDA" || r.statusCode === "CANCELADA";
                  const on = i <= STEP_OF[r.statusCode];
                  return (
                    <div key={s} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span
                        style={{
                          height: "3px",
                          borderRadius: "2px",
                          background: on ? (bad ? C.red : C.gold) : "rgba(240,238,233,.12)",
                        }}
                      />
                      <span style={{ fontSize: "12px", color: on ? C.text : C.faint }}>{s}</span>
                    </div>
                  );
                })}
              </div>
              <span style={{ fontSize: "13px", color: C.muted, lineHeight: 1.55 }}>
                {r.statusCode === "APROVADA" || r.statusCode === "PROGRAMADA"
                  ? "Aprovada não significa publicada: você recebe um aviso quando o conteúdo estiver disponível."
                  : r.statusCode === "AGUARDANDO"
                    ? "Depende de conteúdo, versão ou autorização. Avisaremos quando houver novidade."
                    : r.statusCode === "ATENDIDA"
                      ? "Pedido concluído."
                      : r.statusCode === "CANCELADA"
                        ? "Pedido cancelado."
                        : r.statusCode === "NAO_ATENDIDA"
                          ? "Não foi possível atender este pedido."
                          : "A equipe vai analisar o pedido. Você recebe uma notificação a cada mudança."}
              </span>
            </div>

            {r.reason && (
              <div
                style={{
                  ...card,
                  borderColor: "rgba(224,138,122,.4)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <span style={{ fontSize: "12px", color: C.red, fontWeight: 600 }}>Justificativa da equipe</span>
                <span style={{ fontSize: "14px", lineHeight: 1.6 }}>{r.reason}</span>
              </div>
            )}

            {r.work && (
              <a
                href={r.work.href}
                style={{ ...card, display: "flex", alignItems: "center", gap: "14px", color: C.text }}
              >
                {r.work.cover && (
                  <img
                    src={r.work.cover}
                    alt=""
                    style={{ width: "44px", height: "64px", objectFit: "cover", borderRadius: "6px" }}
                  />
                )}
                <span style={{ display: "flex", flexDirection: "column", gap: "3px", flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "12px", color: C.gold }}>Obra no catálogo</span>
                  <span style={{ fontSize: "15px", fontWeight: 500 }}>{r.work.title}</span>
                  <span style={{ fontSize: "12px", color: C.muted }}>{r.work.typeLabel}</span>
                </span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: C.gold }}>Ver obra →</span>
              </a>
            )}

            <section style={{ ...card, display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <span style={{ fontFamily: F.serif, fontSize: "24px" }}>Informações enviadas</span>
                {r.canEdit && !editing && (
                  <button
                    onClick={() => setEditing(true)}
                    style={{ all: "unset", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: C.gold }}
                  >
                    Complementar
                  </button>
                )}
              </div>
              {editing ? (
                <>
                  <textarea
                    rows={5}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={2000}
                    style={{ ...input, resize: "vertical" }}
                  />
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(api.patch(`/api/requests/${r.numId}`, { details: draft }), "Informações salvas")
                      }
                      style={btn("primary", busy)}
                    >
                      {busy ? "Salvando…" : "Salvar"}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setDraft(r.details || "");
                      }}
                      style={btn("ghost")}
                    >
                      Descartar
                    </button>
                  </div>
                </>
              ) : (
                <span
                  style={{
                    fontSize: "14px",
                    color: r.details ? C.text : C.faint,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {r.details || "Nenhuma informação adicional."}
                </span>
              )}
            </section>

            <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontFamily: F.serif, fontSize: "28px" }}>Histórico</span>
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {r.history.map((h, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      gap: "14px",
                      padding: "12px 0",
                      borderTop: i ? `1px solid ${C.line}` : "none",
                    }}
                  >
                    <span
                      style={{
                        width: "9px",
                        height: "9px",
                        marginTop: "5px",
                        transform: "rotate(45deg)",
                        background: STATUS_COLOR[h.toCode],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 500 }}>{h.from ? `${h.from} → ${h.to}` : h.to}</span>
                      {h.note && <span style={{ fontSize: "13px", color: C.muted }}>{h.note}</span>}
                      <span style={{ fontSize: "12px", color: C.faint }}>
                        {h.date} · {h.by}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            {msg && <span style={{ fontSize: "13px", color: msg.ok ? C.green : C.red }}>{msg.text}</span>}

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {!r.mine && r.open && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(
                      r.supporting
                        ? api.del(`/api/requests/${r.numId}/support`)
                        : api.post(`/api/requests/${r.numId}/support`),
                      r.supporting ? "Você deixou de acompanhar este pedido" : "Interesse registrado",
                    )
                  }
                  style={btn(r.supporting ? "ghost" : "primary", busy)}
                >
                  {r.supporting ? "Não quero mais" : "Também quero esta obra"}
                </button>
              )}
              {r.canEdit &&
                (confirmCancel ? (
                  <>
                    <span style={{ fontSize: "13px", color: C.muted, alignSelf: "center" }}>
                      Cancelar o pedido? Isso não pode ser desfeito.
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => run(api.post(`/api/requests/${r.numId}/cancel`), "Pedido cancelado")}
                      style={btn("danger", busy)}
                    >
                      Sim, cancelar
                    </button>
                    <button onClick={() => setConfirmCancel(false)} style={btn("ghost")}>
                      Manter
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirmCancel(true)} style={btn("danger")}>
                    Cancelar pedido
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
