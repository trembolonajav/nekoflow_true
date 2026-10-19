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
  const [tab, setTab] = useState(tabs.some(([k]) => k === initial) ? initial : "requests");
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
        {tab === "requests" && <Requests />}
        {tab === "releases" && <Releases />}
        {tab === "catalog" && <Catalog />}
        {tab === "users" && <Users />}
        {tab === "audit" && <Audit />}
      </div>
    </Shell>
  );
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
