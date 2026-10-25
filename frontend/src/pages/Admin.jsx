// Painel administrativo (tela nova, no estilo do design).
// Moderador: solicitações · Editor: + publicações e catálogo · Administrador: + usuários e auditoria.
// As permissões são validadas no servidor; aqui só escondemos o que o papel não usa.
import React, { useCallback, useEffect, useState } from "react";
import Shell from "../ui/Shell";
import { api } from "../lib/api";
import { session } from "../lib/session";
import { C, F, STATUS_COLOR, btn, card, chip, container, eyebrow, h1, input, label, pill } from "../ui/tokens";

const RANK = { USER: 0, MODERATOR: 1, EDITOR: 2, ADMIN: 3 };
const ROLE_LABEL = { USER: "Usuário", MODERATOR: "Moderador", EDITOR: "Editor", ADMIN: "Administrador" };
const can = (min) => RANK[session.user.role] >= RANK[min];

const TABS = [
  ["sync", "Sincronização", "EDITOR"],
  ["requests", "Solicitações", "MODERATOR"],
  ["releases", "Publicações", "EDITOR"],
  ["catalog", "Catálogo", "EDITOR"],
  ["users", "Usuários", "ADMIN"],
  ["audit", "Auditoria", "ADMIN"],
];

const errText = (e) => (e && e.body && e.body.message) || "Não foi possível concluir. Tente novamente.";

export default function Admin() {
  const initial = new URLSearchParams(location.search).get("aba");
  const tabs = TABS.filter(([, , min]) => can(min));
  const [tab, setTab] = useState(tabs.some(([k]) => k === initial) ? initial : tabs[0][0]);
  const pick = (k) => {
    setTab(k);
    history.replaceState(null, "", `?aba=${k}`);
  };
  return (
    <Shell>
      <div style={container(1180)}>
        <header style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={eyebrow}>Equipe Nekoflow · {ROLE_LABEL[session.user.role]}</span>
          <h1 style={h1}>Painel administrativo</h1>
          <span style={{ fontSize: "14px", color: C.muted }}>
            Toda decisão fica registrada com autor, data e motivo.
          </span>
        </header>
        <nav
          className="nk-scroll-x"
          style={{ display: "flex", gap: "4px", borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}
        >
          {tabs.map(([k, l]) => (
            <button
              key={k}
              onClick={() => pick(k)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "12px 14px",
                fontSize: "14px",
                fontWeight: 500,
                whiteSpace: "nowrap",
                color: tab === k ? C.gold : C.muted,
                borderBottom: `2px solid ${tab === k ? C.gold : "transparent"}`,
              }}
            >
              {l}
            </button>
          ))}
        </nav>
        {tab === "sync" && <Synchronization />}
        {tab === "requests" && <Requests />}
        {tab === "releases" && <Releases />}
        {tab === "catalog" && <Catalog />}
        {tab === "users" && <Users />}
        {tab === "audit" && <Audit />}
      </div>
    </Shell>
  );
}

// ---- sincronização HiAnime ------------------------------------------------------

const SYNC_FILTERS = [
  ["", "Pendências"],
  ["READY", "Prontos"],
  ["REVIEW", "Revisão"],
  ["FAILED", "Falhas"],
  ["PUBLISHED", "Publicados"],
  ["IGNORED", "Ignorados"],
];

const fmtDate = (value) =>
  value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

function Synchronization() {
  const [view, setView] = useState("inbox");
  const [dashboard, setDashboard] = useState(null);
  const [runs, setRuns] = useState([]);
  const [works, setWorks] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(() => {
    Promise.all([
      api.get("/api/admin/sync/dashboard"),
      api.get("/api/admin/sync/runs"),
      api.get("/api/admin/sync/works"),
      api.get(`/api/admin/sync/candidates?status=${filter}`),
    ])
      .then(([d, r, w, c]) => {
        setDashboard(d);
        setRuns(r);
        setWorks(w);
        setCandidates(filter ? c : c.filter((item) => ["READY", "REVIEW", "FAILED"].includes(item.status)));
      })
      .catch((e) => setMessage({ ok: false, text: errText(e) }));
  }, [filter]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const runNow = () => {
    setBusy("run");
    setMessage(null);
    api
      .post("/api/admin/sync/runs", {})
      .then(() => {
        setMessage({ ok: true, text: "Busca iniciada. O painel será atualizado automaticamente." });
        setTimeout(load, 1200);
      })
      .catch((e) => setMessage({ ok: false, text: errText(e) }))
      .finally(() => setBusy(null));
  };

  const decide = (candidate, action) => {
    setBusy(candidate.id);
    setMessage(null);
    api
      .post(`/api/admin/sync/candidates/${candidate.id}/${action}`, {})
      .then(() => {
        setMessage({ ok: true, text: action === "approve" ? "Episódio publicado." : "Atualização ignorada." });
        load();
      })
      .catch((e) => setMessage({ ok: false, text: errText(e) }))
      .finally(() => setBusy(null));
  };

  const setting = (work, patch) => {
    const next = { enabled: !!work.enabled, autoPublish: !!work.auto_publish, ...patch };
    setBusy(work.work_id);
    api
      .put(`/api/admin/sync/works/${work.work_id}/settings`, next)
      .then(load)
      .catch((e) => setMessage({ ok: false, text: errText(e) }))
      .finally(() => setBusy(null));
  };

  const health = dashboard?.health || {};
  const last = dashboard?.lastRun || {};
  return (
    <section style={{ display: "grid", gap: "18px" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px" }}>
          <span style={{ display: "block", fontFamily: F.serif, fontSize: "28px" }}>Sincronização HiAnime</span>
          <span style={{ fontSize: "13px", color: C.muted }}>
            Busca automática a cada 15 minutos. Vínculos confirmados podem publicar; exceções aguardam revisão.
          </span>
        </div>
        <button disabled={busy === "run" || !dashboard?.enabled} onClick={runNow} style={btn("primary", busy === "run" || !dashboard?.enabled)}>
          {busy === "run" ? "Iniciando…" : "Buscar atualizações agora"}
        </button>
      </div>

      {dashboard && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px" }}>
          <SyncMetric label="Estado da origem" value={health.status || "UNKNOWN"} tone={health.status === "HEALTHY" ? C.green : health.status === "DOWN" ? C.red : C.amber} />
          <SyncMetric label="Obras monitoradas" value={dashboard.monitoredWorks} />
          <SyncMetric label="Publicação automática" value={dashboard.autoPublishWorks} />
          <SyncMetric label="Aguardando revisão" value={dashboard.pendingReview} tone={dashboard.pendingReview ? C.amber : C.text} />
          <SyncMetric label="Publicados hoje" value={dashboard.publishedToday} tone={C.green} />
          <SyncMetric label="Última execução" value={last.status || "—"} sub={fmtDate(last.finished_at || last.started_at)} />
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {[["inbox", "Caixa de entrada"], ["works", "Obras monitoradas"], ["runs", "Execuções"]].map(([key, text]) => (
          <button key={key} onClick={() => setView(key)} style={chip(view === key)}>{text}</button>
        ))}
      </div>

      {message && <span style={{ fontSize: "13px", color: message.ok ? C.green : C.red }}>{message.text}</span>}

      {view === "inbox" && (
        <div style={{ display: "grid", gap: "10px" }}>
          <div className="nk-scroll-x" style={{ display: "flex", gap: "7px", overflowX: "auto" }}>
            {SYNC_FILTERS.map(([key, text]) => <button key={key} onClick={() => setFilter(key)} style={chip(filter === key)}>{text}</button>)}
          </div>
          {candidates.length === 0 && <Empty text="Nenhuma atualização neste filtro." />}
          {candidates.map((candidate) => (
            <div key={candidate.id} style={{ ...card, display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
              {candidate.cover && <img src={candidate.cover} alt="" style={{ width: 46, height: 64, objectFit: "cover", borderRadius: 6 }} />}
              <span style={{ display: "grid", gap: 3, flex: "1 1 300px" }}>
                <strong style={{ fontSize: "15px" }}>{candidate.work_title}</strong>
                <span style={{ fontSize: "13px", color: C.muted }}>
                  Episódio {candidate.episode_number}{candidate.title ? ` · ${candidate.title}` : ""}
                </span>
                <span style={{ fontSize: "11px", color: C.faint }}>
                  {candidate.source_count} fonte(s) · confiança {candidate.confidence}% · {candidate.reason || "vínculo confirmado"} · {fmtDate(candidate.discovered_at)}
                </span>
              </span>
              <span style={pill(candidate.status === "PUBLISHED" ? C.green : candidate.status === "FAILED" ? C.red : C.amber)}>{candidate.status}</span>
              {["READY", "REVIEW", "FAILED"].includes(candidate.status) && (
                <div style={{ display: "flex", gap: 7 }}>
                  {candidate.reason !== "NON_STANDARD_EPISODE" && (
                    <button disabled={busy === candidate.id} onClick={() => decide(candidate, "approve")} style={btn("primary", busy === candidate.id)}>Publicar</button>
                  )}
                  <button disabled={busy === candidate.id} onClick={() => decide(candidate, "ignore")} style={btn("secondary", busy === candidate.id)}>Ignorar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {view === "works" && (
        <div style={{ display: "grid", gap: "8px" }}>
          {works.map((work) => (
            <div key={work.work_id} style={{ ...card, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {work.cover && <img src={work.cover} alt="" style={{ width: 34, height: 48, objectFit: "cover", borderRadius: 4 }} />}
              <span style={{ display: "grid", gap: 2, flex: "1 1 280px" }}>
                <strong style={{ fontSize: "14px" }}>{work.title}</strong>
                <span style={{ fontSize: "11px", color: C.faint }}>HiAnime: {work.hianime_id} · último EP {work.latest_episode || "—"} · verificado {fmtDate(work.last_checked_at)}</span>
                {work.last_error && <span style={{ fontSize: "11px", color: C.red }}>{work.last_error}</span>}
              </span>
              <button disabled={busy === work.work_id} onClick={() => setting(work, { enabled: !work.enabled })} style={chip(!!work.enabled)}>{work.enabled ? "Monitorando" : "Pausada"}</button>
              <button disabled={busy === work.work_id || !work.enabled} onClick={() => setting(work, { autoPublish: !work.auto_publish })} style={chip(!!work.auto_publish)}>{work.auto_publish ? "Auto publicar" : "Revisão manual"}</button>
            </div>
          ))}
        </div>
      )}

      {view === "runs" && (
        <div style={{ display: "grid", gap: "8px" }}>
          {runs.length === 0 && <Empty text="Nenhuma sincronização executada." />}
          {runs.map((run) => (
            <div key={run.id} style={{ ...card, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={pill(run.status === "COMPLETED" ? C.green : run.status === "FAILED" ? C.red : C.amber)}>{run.status}</span>
              <span style={{ flex: "1 1 260px", fontSize: "13px" }}>{run.trigger_type === "MANUAL" ? "Execução manual" : "Execução agendada"} · {fmtDate(run.created_at)}</span>
              <span style={{ fontSize: "12px", color: C.muted }}>{run.checked_works} obras · {run.discovered_count} descobertos · {run.published_count} publicados · {run.error_count} erros</span>
              {run.error_message && <span style={{ flexBasis: "100%", fontSize: "11px", color: C.red }}>{run.error_message}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SyncMetric({ label: text, value, sub, tone = C.text }) {
  return <div style={{ ...card, padding: "13px 14px", display: "grid", gap: 4 }}>
    <span style={{ fontSize: "11px", color: C.muted }}>{text}</span>
    <strong style={{ fontFamily: F.serif, fontSize: "22px", color: tone }}>{value ?? "—"}</strong>
    {sub && <span style={{ fontSize: "10px", color: C.faint }}>{sub}</span>}
  </div>;
}

// ---- solicitações --------------------------------------------------------------

const FILTERS = [
  ["", "Todas"],
  ["RECEBIDA", "Recebidas"],
  ["EM_ANALISE", "Em análise"],
  ["AGUARDANDO", "Aguardando"],
  ["APROVADA", "Aprovadas"],
  ["PROGRAMADA", "Programadas"],
  ["ATENDIDA", "Atendidas"],
  ["NAO_ATENDIDA", "Não atendidas"],
];

function Requests() {
  const [status, setStatus] = useState("RECEBIDA");
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    api
      .get(`/api/admin/requests?status=${status}&q=${encodeURIComponent(q)}`)
      .then(setList)
      .catch(() => setList([]));
  }, [status, q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} style={chip(status === k)}>
            {l}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título"
          style={{ ...input, maxWidth: "260px", marginLeft: "auto" }}
        />
      </div>
      {list === null && <span style={{ color: C.muted, fontSize: "14px" }}>Carregando…</span>}
      {list && list.length === 0 && <Empty text="Nenhuma solicitação nesta situação." />}
      {list &&
        list.map((r) => (
          <RequestRow
            key={r.numId}
            r={r}
            open={open === r.numId}
            toggle={() => setOpen(open === r.numId ? null : r.numId)}
            onChange={load}
          />
        ))}
    </section>
  );
}

function RequestRow({ r, open, toggle, onChange }) {
  const [to, setTo] = useState(null);
  const [note, setNote] = useState("");
  const [work, setWork] = useState(r.work || r.catalogMatch || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = () => {
    setBusy(true);
    setErr(null);
    api
      .post(`/api/admin/requests/${r.numId}/status`, {
        status: to,
        note: note.trim() || null,
        workId: work ? work.id : null,
      })
      .then(() => {
        setTo(null);
        setNote("");
        onChange();
      })
      .catch((e) => setErr(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <button
        onClick={toggle}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
          padding: "16px 18px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <span style={{ fontFamily: F.mono, fontSize: "12px", color: C.muted }}>{r.id}</span>
        <span style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "1 1 240px", minWidth: 0 }}>
          <span style={{ fontSize: "15px", fontWeight: 500 }}>{r.title}</span>
          <span style={{ fontSize: "12px", color: C.muted }}>
            {r.kindLabel} · {r.type} · @{r.requester} · {r.date}
          </span>
        </span>
        {r.supporters > 0 && <span style={{ fontSize: "12px", color: C.gold }}>+{r.supporters} querem</span>}
        <span style={pill(STATUS_COLOR[r.statusCode])}>{r.status}</span>
      </button>
      {open && (
        <div
          style={{
            borderTop: `1px solid ${C.line}`,
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <span style={{ fontSize: "14px", whiteSpace: "pre-wrap", color: r.details ? C.text : C.faint }}>
            {r.details || "Sem informações adicionais."}
          </span>
          {r.catalogMatch && !r.work && (
            <span style={{ fontSize: "13px", color: C.amber }}>
              Possível obra existente no catálogo: <strong>{r.catalogMatch.title}</strong> (#{r.catalogMatch.id})
            </span>
          )}
          <ol
            style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "6px" }}
          >
            {r.history.map((h, i) => (
              <li key={i} style={{ fontSize: "12px", color: C.muted }}>
                <span style={{ color: C.text }}>{h.from ? `${h.from} → ${h.to}` : h.to}</span> · {h.date} · @
                {h.by || "sistema"}
                {h.note ? ` · ${h.note}` : ""}
              </li>
            ))}
          </ol>
          {r.next.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500 }}>Mover para</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {r.next.map((n) => (
                  <button key={n.code} onClick={() => setTo(n.code)} style={chip(to === n.code)}>
                    {n.label}
                  </button>
                ))}
              </div>
              {to && (
                <>
                  {(to === "ATENDIDA" || to === "APROVADA" || to === "PROGRAMADA") && (
                    <WorkPicker value={work} onChange={setWork} required={to === "ATENDIDA"} />
                  )}
                  <label style={label}>
                    {to === "NAO_ATENDIDA" ? "Justificativa (o solicitante verá este texto)" : "Observação (opcional)"}
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      style={{ ...input, resize: "vertical" }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <button disabled={busy} onClick={submit} style={btn("primary", busy)}>
                      {busy ? "Salvando…" : "Confirmar mudança"}
                    </button>
                    {err && <span style={{ fontSize: "13px", color: C.red }}>{err}</span>}
                  </div>
                </>
              )}
            </div>
          ) : (
            <span style={{ fontSize: "13px", color: C.faint }}>Pedido encerrado.</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Busca uma obra do catálogo para vincular (pedido atendido, publicação). */
function WorkPicker({ value, onChange, required }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(
      () =>
        api
          .get(`/api/catalog/search?limit=8&q=${encodeURIComponent(q)}`)
          .then(setFound)
          .catch(() => setFound([])),
      250,
    );
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={{ fontSize: "13px", fontWeight: 500 }}>Obra do catálogo{required ? "" : " (opcional)"}</span>
      {value ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 12px",
            borderRadius: "10px",
            border: `1px solid ${C.lineGold}`,
          }}
        >
          {value.cover && (
            <img
              src={value.cover}
              alt=""
              style={{ width: "30px", height: "44px", objectFit: "cover", borderRadius: "4px" }}
            />
          )}
          <span style={{ flex: 1, fontSize: "14px" }}>
            {value.title} <span style={{ color: C.faint, fontFamily: F.mono, fontSize: "12px" }}>#{value.id}</span>
          </span>
          <button
            onClick={() => onChange(null)}
            style={{ all: "unset", cursor: "pointer", color: C.gold, fontSize: "13px" }}
          >
            Trocar
          </button>
        </div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar título ou título alternativo"
            style={input}
          />
          {found.slice(0, 6).map((w) => (
            <button
              key={w.id}
              onClick={() => onChange(w)}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "6px 8px",
                borderRadius: "8px",
                background: C.raised,
              }}
            >
              {w.cover && (
                <img
                  src={w.cover}
                  alt=""
                  style={{ width: "26px", height: "38px", objectFit: "cover", borderRadius: "3px" }}
                />
              )}
              <span style={{ fontSize: "13px" }}>
                {w.title}{" "}
                <span style={{ color: C.faint }}>
                  · {w.typeLabel} · #{w.id}
                </span>
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ---- publicações -----------------------------------------------------------------

function Releases() {
  const [work, setWork] = useState(null);
  const [unit, setUnit] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [recent, setRecent] = useState([]);
  const load = () =>
    api
      .get("/api/admin/releases")
      .then(setRecent)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (work) setUnit(String((work.availableUnits || 0) + 1));
  }, [work]);
  const anim = work && (work.kind === "anime" || work.kind === "filme");
  const publish = () => {
    setBusy(true);
    setRes(null);
    api
      .post("/api/admin/releases", { workId: work.id, unit: parseInt(unit, 10), unitTitle: title.trim() || null })
      .then((r) => {
        setRes(
          r.duplicate
            ? { ok: false, text: "Esta unidade já estava publicada. Nenhum aviso foi enviado de novo." }
            : {
                ok: true,
                text: `Publicado. ${r.notified} aviso(s) enviado(s)${r.requestsResolved ? ` · ${r.requestsResolved} pedido(s) atendido(s)` : ""}.`,
              },
        );
        setTitle("");
        load();
      })
      .catch((e) => setRes({ ok: false, text: errText(e) }))
      .finally(() => setBusy(false));
  };
  const valid = work && parseInt(unit, 10) >= 1;
  return (
    <section style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
      <div style={{ ...card, flex: "1 1 380px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <span style={{ fontFamily: F.serif, fontSize: "26px" }}>Publicar episódio ou capítulo</span>
        <span style={{ fontSize: "13px", color: C.muted, lineHeight: 1.55 }}>
          A unidade passa a existir no catálogo, aparece no Calendário e quem acompanha a obra recebe um aviso. Publicar
          a mesma unidade de novo não duplica nada.
        </span>
        <WorkPicker value={work} onChange={setWork} required />
        <label style={label}>
          {anim ? "Número do episódio" : "Número do capítulo"}
          <input type="number" min="1" value={unit} onChange={(e) => setUnit(e.target.value)} style={input} />
        </label>
        <label style={label}>
          Título (opcional)
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
        </label>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button disabled={!valid || busy} onClick={publish} style={btn("primary", !valid || busy)}>
            {busy ? "Publicando…" : "Publicar"}
          </button>
          {res && <span style={{ fontSize: "13px", color: res.ok ? C.green : C.amber }}>{res.text}</span>}
        </div>
      </div>
      <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <span style={{ fontFamily: F.serif, fontSize: "26px" }}>Publicações recentes</span>
        {recent.length === 0 && <Empty text="Nada publicado ainda." />}
        {recent.map((r, i) => (
          <a
            key={i}
            href={r.href}
            style={{ ...card, padding: "12px 14px", display: "flex", gap: "12px", alignItems: "center", color: C.text }}
          >
            {r.cover && (
              <img
                src={r.cover}
                alt=""
                style={{ width: "32px", height: "46px", objectFit: "cover", borderRadius: "4px" }}
              />
            )}
            <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
              <span style={{ fontSize: "14px", fontWeight: 500 }}>{r.title}</span>
              <span style={{ fontSize: "12px", color: C.muted }}>
                {r.unitLabel}
                {r.unitTitle ? ` · ${r.unitTitle}` : ""} · {r.date} · @{r.by}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

// ---- catálogo ------------------------------------------------------------------------

function Catalog() {
  const empty = { id: "", kind: "anime", title: "", alt: "", cover: "", totalUnits: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    setBusy(true);
    setRes(null);
    api
      .post("/api/admin/works", {
        id: f.id ? Number(f.id) : null,
        kind: f.kind,
        title: f.title.trim(),
        alt: f.alt.trim(),
        cover: f.cover.trim() || null,
        totalUnits: f.totalUnits ? Number(f.totalUnits) : null,
      })
      .then((w) => {
        setRes({
          ok: true,
          text: `“${w.title}” cadastrada com o id ${w.id}. Agora ela pode ser vinculada a pedidos e publicações.`,
        });
        setF(empty);
      })
      .catch((e) => setRes({ ok: false, text: errText(e) }))
      .finally(() => setBusy(false));
  };
  return (
    <div style={{ display: "grid", gap: "18px" }}>
    <section style={{ ...card, maxWidth: "720px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <span style={{ fontFamily: F.serif, fontSize: "26px" }}>Cadastrar obra</span>
      <span style={{ fontSize: "13px", color: C.muted, lineHeight: 1.55 }}>
        Cada obra existe uma única vez. Títulos alternativos (separados por “|”) são usados para reconhecer pedidos e
        buscas da mesma obra.
      </span>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {[
          ["anime", "Anime"],
          ["filme", "Filme"],
          ["manga", "Mangá"],
          ["manhwa", "Manhwa"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setF({ ...f, kind: k })} style={chip(f.kind === k)}>
            {l}
          </button>
        ))}
      </div>
      <label style={label}>
        Título
        <input value={f.title} onChange={set("title")} style={input} />
      </label>
      <label style={label}>
        Títulos alternativos
        <input value={f.alt} onChange={set("alt")} placeholder="Nome original | Nome em inglês" style={input} />
      </label>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <label style={{ ...label, flex: "1 1 200px" }}>
          ID da AniList (opcional)
          <input value={f.id} onChange={set("id")} inputMode="numeric" style={input} />
        </label>
        <label style={{ ...label, flex: "1 1 200px" }}>
          {f.kind === "anime" ? "Total de episódios" : f.kind === "filme" ? "Partes" : "Total de capítulos"} (opcional)
          <input value={f.totalUnits} onChange={set("totalUnits")} inputMode="numeric" style={input} />
        </label>
      </div>
      <label style={label}>
        URL da capa (opcional)
        <input value={f.cover} onChange={set("cover")} style={input} />
      </label>
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          disabled={busy || f.title.trim().length < 2}
          onClick={save}
          style={btn("primary", busy || f.title.trim().length < 2)}
        >
          {busy ? "Salvando…" : "Cadastrar"}
        </button>
        {res && <span style={{ fontSize: "13px", color: res.ok ? C.green : C.red }}>{res.text}</span>}
      </div>
    </section>
    <CatalogMaintenance />
    </div>
  );
}

function CatalogMaintenance() {
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [work, setWork] = useState(null);
  const [form, setForm] = useState({ title: "", synopsisShort: "", synopsis: "", storyStatus: "UNKNOWN", coverUrl: "", bannerUrl: "" });
  const [msg, setMsg] = useState(null);
  const search = () => api.get(`/api/admin/catalog/works?q=${encodeURIComponent(q)}`).then(setList).catch(() => setList([]));
  useEffect(() => { const t=setTimeout(search,250); return()=>clearTimeout(t); }, [q]);
  const pick = (w) => { setWork(w); setForm({ title:w.title||"", synopsisShort:w.synopsis_short||"", synopsis:w.synopsis_full||"", storyStatus:w.story_status||"UNKNOWN", coverUrl:w.cover_url||"", bannerUrl:w.banner_url||"" }); };
  const save = () => api.patch(`/api/admin/catalog/works/${work.id}`, form).then((w)=>setMsg({ok:true,text:`${w.title} atualizada.`})).catch((e)=>setMsg({ok:false,text:errText(e)}));
  const visibility = (value) => api.put(`/api/admin/catalog/works/${work.id}/visibility/${value}`,{}).then((w)=>{setWork({...work,visibility:w.visibility});setMsg({ok:true,text:`Visibilidade: ${w.visibility}.`});}).catch((e)=>setMsg({ok:false,text:errText(e)}));
  const anilist = () => { setMsg({ok:true,text:"Consultando o AniList…"}); api.post(`/api/admin/catalog/works/${work.id}/anilist-sync`,{}).then((r)=>{setForm((f)=>({...f,synopsis:r.synopsis||f.synopsis}));setMsg({ok:true,text:`Sinopse atualizada pelo AniList (${r.synopsisSource||"AniList"}).`});}).catch((e)=>setMsg({ok:false,text:errText(e)})); };
  const importCatalog = (dryRun) => api.post(`/api/admin/catalog/imports?dryRun=${dryRun}`,{}).then((r)=>setMsg({ok:true,text:`${dryRun?"Simulação":"Importação"}: ${r.created} novos, ${r.unchanged} preservados, ${r.rejected} rejeitados.`})).catch((e)=>setMsg({ok:false,text:errText(e)}));
  return <section style={{ ...card, display:"grid", gap:"14px" }}>
    <span style={{ fontFamily:F.serif,fontSize:"26px" }}>Revisão editorial</span>
    <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}><button onClick={()=>importCatalog(true)} style={btn("secondary")}>Simular importação</button><button onClick={()=>importCatalog(false)} style={btn("secondary")}>Aplicar importação idempotente</button></div>
    <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Buscar obra publicada ou rascunho" style={input}/>
    {!work && <div style={{display:"grid",gap:"6px"}}>{list.slice(0,10).map((w)=><button key={w.id} onClick={()=>pick(w)} style={{...btn("secondary"),textAlign:"left"}}>{w.title} · {w.media_family} · {w.visibility}</button>)}</div>}
    {work && <>
      <button onClick={()=>setWork(null)} style={{all:"unset",cursor:"pointer",color:C.gold,fontSize:"13px"}}>← Escolher outra obra</button>
      <label style={label}>Título<input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} style={input}/></label>
      <label style={label}>Resumo<input value={form.synopsisShort} onChange={(e)=>setForm({...form,synopsisShort:e.target.value})} style={input}/></label>
      <label style={label}>Sinopse<textarea rows={5} value={form.synopsis} onChange={(e)=>setForm({...form,synopsis:e.target.value})} style={{...input,resize:"vertical"}}/></label>
      <label style={label}>Situação<select value={form.storyStatus} onChange={(e)=>setForm({...form,storyStatus:e.target.value})} style={input}>{["ONGOING","COMPLETED","HIATUS","UNKNOWN"].map(x=><option key={x}>{x}</option>)}</select></label>
      <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}><button onClick={save} style={btn("primary")}>Salvar metadados</button><button onClick={anilist} style={btn("secondary")}>Puxar sinopse do AniList</button>{["DRAFT","PUBLISHED","HIDDEN","ARCHIVED"].map(x=><button key={x} onClick={()=>visibility(x)} style={chip(work.visibility===x)}>{x}</button>)}</div>
      {work.media_family === "READING" && <ChapterPages workId={work.id} />}
    </>}
    {msg&&<span style={{fontSize:"13px",color:msg.ok?C.green:C.red}}>{msg.text}</span>}
    <span style={{fontSize:"12px",color:C.faint}}>Temporadas, episódios, edições, capítulos, relações e auditoria usam a mesma API editorial protegida.</span>
  </section>;
}

/**
 * Páginas dos capítulos (Protocolo 06): envia ZIP ou imagens, o Java valida e ordena,
 * a equipe confere a pré-visualização e só então publica. Lotes com erro não publicam.
 */
function ChapterPages({ workId }) {
  const [chapters, setChapters] = useState([]);
  const [busy, setBusy] = useState(null);
  const [batch, setBatch] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(
    () => api.get(`/api/admin/catalog/media/works/${workId}/chapters`).then(setChapters).catch(() => setChapters([])),
    [workId],
  );
  useEffect(() => {
    load();
  }, [load]);
  const send = (c, files) => {
    if (!files || !files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    setBusy(c.id);
    setMsg(null);
    api
      .upload(`/api/admin/catalog/media/chapters/${c.id}/imports?editionId=${c.editionId}`, fd)
      .then((b) => {
        setBatch({ ...b, chapter: c });
        load();
      })
      .catch((e) => setMsg({ ok: false, text: errText(e) }))
      .finally(() => setBusy(null));
  };
  const publish = () =>
    api
      .post(`/api/admin/catalog/media/imports/${batch.id}/publish`, {})
      .then(() => {
        setMsg({ ok: true, text: `Capítulo ${batch.chapter.number} publicado com ${batch.pageCount} páginas.` });
        setBatch(null);
        load();
      })
      .catch((e) => setMsg({ ok: false, text: errText(e) }));
  const discard = () =>
    api
      .del(`/api/admin/catalog/media/imports/${batch.id}`)
      .then(() => {
        setBatch(null);
        load();
      })
      .catch((e) => setMsg({ ok: false, text: errText(e) }));
  return (
    <div style={{ display: "grid", gap: "10px", paddingTop: "8px", borderTop: `1px solid ${C.line || "rgba(240,238,233,.1)"}` }}>
      <span style={{ fontFamily: F.serif, fontSize: "22px" }}>Páginas dos capítulos</span>
      <span style={{ fontSize: "12px", color: C.faint, lineHeight: 1.5 }}>
        Envie um ZIP numerado ou as imagens (JPEG, PNG ou WebP; até 20 MB cada). Os arquivos são conferidos pelo
        conteúdo, ordenados pelo nome e só ficam públicos depois da sua revisão. Use apenas material com direito de
        distribuição.
      </span>
      {chapters.length === 0 && <span style={{ fontSize: "13px", color: C.muted }}>Nenhum capítulo cadastrado.</span>}
      {chapters.map((c) => (
        <div
          key={c.id + c.editionId}
          style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}
        >
          <span style={{ fontSize: "13px" }}>
            Cap. {c.number} · {c.editionName} · {c.readingMode === "VERTICAL" ? "vertical" : `paginado ${c.direction === "RTL" ? "dir.→esq." : "esq.→dir."}`}
            <span style={{ color: C.muted }}>
              {" "}
              · {c.publishedPages ? `${c.publishedPages} páginas publicadas` : "sem páginas publicadas"}
              {c.lastImportStatus && c.lastImportStatus !== "PUBLISHED" ? ` · último lote: ${c.lastImportStatus}` : ""}
            </span>
          </span>
          <label style={{ ...btn("secondary", busy === c.id), cursor: busy ? "wait" : "pointer" }}>
            {busy === c.id ? "Validando…" : c.publishedPages ? "Substituir páginas" : "Enviar páginas"}
            <input
              type="file"
              multiple
              accept=".zip,image/jpeg,image/png,image/webp"
              disabled={!!busy}
              onChange={(e) => send(c, e.target.files)}
              style={{ display: "none" }}
            />
          </label>
        </div>
      ))}
      {batch && (
        <div style={{ display: "grid", gap: "10px", padding: "12px", borderRadius: "10px", background: "rgba(0,0,0,.25)" }}>
          <span style={{ fontSize: "14px" }}>
            Lote do capítulo {batch.chapter.number}:{" "}
            <strong style={{ color: batch.status === "READY" ? C.green : C.red }}>
              {batch.status === "READY" ? `${batch.pageCount} páginas prontas para revisão` : "falhou na validação"}
            </strong>
          </span>
          {batch.status === "FAILED" && (
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: C.red }}>
              {((batch.report && batch.report.errors) || []).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {batch.status === "READY" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))", gap: "8px" }}>
              {batch.pages.map((p) => (
                <figure key={p.id} style={{ margin: 0, display: "grid", gap: "4px", justifyItems: "center" }}>
                  <img
                    src={p.url}
                    alt={`Página ${p.position}`}
                    loading="lazy"
                    style={{ width: "100%", aspectRatio: `${p.width}/${p.height}`, objectFit: "contain", background: "#000" }}
                  />
                  <figcaption style={{ fontSize: "11px", color: C.muted }}>
                    {p.position}
                    {p.type === "DOUBLE" ? " · dupla" : ""}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {batch.status === "READY" && (
              <button onClick={publish} style={btn("primary")}>
                Publicar capítulo
              </button>
            )}
            <button onClick={discard} style={btn("secondary")}>
              Descartar lote
            </button>
          </div>
        </div>
      )}
      {msg && <span style={{ fontSize: "13px", color: msg.ok ? C.green : C.red }}>{msg.text}</span>}
    </div>
  );
}

// ---- usuários e auditoria ----------------------------------------------------------

function Users() {
  const [q, setQ] = useState("");
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = useCallback(
    () =>
      api
        .get(`/api/admin/users?q=${encodeURIComponent(q)}`)
        .then(setList)
        .catch(() => {}),
    [q],
  );
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  const setRole = (u, role) =>
    api
      .put(`/api/admin/users/${u.id}/role`, { role })
      .then(() => {
        setMsg({ ok: true, text: `@${u.username} agora é ${ROLE_LABEL[role]}.` });
        load();
      })
      .catch((e) => setMsg({ ok: false, text: errText(e) }));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por usuário ou e-mail"
        style={{ ...input, maxWidth: "360px" }}
      />
      {msg && <span style={{ fontSize: "13px", color: msg.ok ? C.green : C.red }}>{msg.text}</span>}
      {list.map((u) => (
        <div
          key={u.id}
          style={{
            ...card,
            padding: "12px 16px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: C.chip,
              color: C.gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: F.serif,
              fontSize: "18px",
            }}
          >
            {(u.name || "?").slice(0, 1).toUpperCase()}
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: "2px", flex: "1 1 200px" }}>
            <span style={{ fontSize: "14px", fontWeight: 500 }}>@{u.username}</span>
            <span style={{ fontSize: "12px", color: C.muted }}>
              {u.email} · desde {u.since}
            </span>
          </span>
          <select
            value={u.role}
            disabled={u.id === session.user.id}
            onChange={(e) => setRole(u, e.target.value)}
            style={{
              ...input,
              width: "auto",
              minHeight: "38px",
              cursor: u.id === session.user.id ? "not-allowed" : "pointer",
            }}
          >
            {Object.entries(ROLE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  );
}

function Audit() {
  const [list, setList] = useState(null);
  useEffect(() => {
    api
      .get("/api/admin/users/audit")
      .then(setList)
      .catch(() => setList([]));
  }, []);
  if (!list) return <span style={{ color: C.muted, fontSize: "14px" }}>Carregando…</span>;
  if (!list.length) return <Empty text="Nenhuma ação registrada ainda." />;
  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      {list.map((a, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            padding: "12px 0",
            borderTop: i ? `1px solid ${C.line}` : "none",
            fontSize: "13px",
          }}
        >
          <span style={{ fontFamily: F.mono, color: C.gold, minWidth: "120px" }}>{a.action}</span>
          <span style={{ flex: "1 1 260px" }}>
            {a.target}
            {a.detail ? <span style={{ color: C.muted }}> · {a.detail}</span> : null}
          </span>
          <span style={{ color: C.faint }}>
            @{a.by} · {a.date}
          </span>
        </div>
      ))}
    </section>
  );
}

function Empty({ text }) {
  return (
    <div
      style={{
        ...card,
        display: "flex",
        alignItems: "center",
        gap: "14px",
        borderStyle: "dashed",
        borderColor: C.lineGold,
      }}
    >
      <img src="/assets/nekoflow-mascot.png" alt="" style={{ width: "56px", height: "56px", objectFit: "contain" }} />
      <span style={{ fontSize: "14px", color: C.muted }}>{text}</span>
    </div>
  );
}
