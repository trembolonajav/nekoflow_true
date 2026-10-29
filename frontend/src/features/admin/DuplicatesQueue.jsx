// Catálogo · Obras duplicadas. Cada fonte (FIB, Sushi, HiAnime, Manga Livre, WeebCentral…) tinha
// criado a sua própria obra; aqui elas viram uma só. Fundir soma temporadas, episódios, servidores
// e edições de leitura na obra principal — nada é sobrescrito, e a duplicata fica oculta.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

const GOLD = "#DBAF57";
const card = { borderRadius: "14px", background: "#1A1714", border: "1px solid rgba(240,238,233,.06)" };
const pill = (on) => ({
  all: "unset",
  cursor: "pointer",
  height: "34px",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "0 14px",
  borderRadius: "999px",
  fontSize: "13px",
  border: `1px solid ${on ? GOLD : "rgba(240,238,233,.14)"}`,
  background: on ? "rgba(219,175,87,.12)" : "transparent",
  color: on ? GOLD : "#D9D5CC",
});
const button = (primary, busy) => ({
  all: "unset",
  cursor: busy ? "wait" : "pointer",
  height: "32px",
  display: "inline-flex",
  alignItems: "center",
  padding: "0 12px",
  borderRadius: "8px",
  fontSize: "12px",
  fontWeight: 600,
  opacity: busy ? 0.6 : 1,
  ...(primary
    ? { background: GOLD, color: "#1A1714" }
    : { border: "1px solid rgba(219,175,87,.35)", color: GOLD }),
});
const chip = (color) => ({
  fontSize: "11px",
  padding: "3px 8px",
  borderRadius: "999px",
  border: `1px solid ${color}55`,
  color,
  whiteSpace: "nowrap",
});
const mono = { fontFamily: "'JetBrains Mono',monospace", fontSize: "11px" };

const unitLabel = (u, reading) =>
  reading
    ? `${u.title} · ${u.count} cap.`
    : `T${u.number || "?"} · ${u.title} · ${u.count} ep.`;

const workHref = (w) => `/${w.family === "READING" ? "leituras" : "animes"}/${w.slug}`;

function WorkLine({ w, badge }) {
  const reading = w.family === "READING";
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", minWidth: 0 }}>
      <img
        src={w.cover || "/assets/nekoflow-logo.png"}
        alt=""
        style={{ width: "44px", height: "62px", objectFit: "cover", borderRadius: "6px", background: "#0B0A09", flexShrink: 0 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
        <span style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <a href={workHref(w)} target="_blank" rel="noreferrer" style={{ fontSize: "14px", fontWeight: 500, color: "#F0EEE9" }}>
            {w.title}
          </a>
          {badge}
        </span>
        <span style={{ ...mono, color: "#8F897D" }}>
          #{w.id}
          {w.year ? ` · ${w.year}` : ""}
          {w.format ? ` · ${w.format}` : ""}
          {w.anilist?.length ? ` · AniList ${w.anilist.join(", ")}` : ""}
          {w.users ? ` · ${w.users} na biblioteca` : ""}
        </span>
        <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
          {(w.providers || []).join(" · ") || "sem provedor"} —{" "}
          {(w.units || []).length
            ? w.units.map((u) => (reading ? `${u.language} ${u.count} cap.` : `T${u.number || "?"} ${u.count} ep.`)).join(", ")
            : reading
              ? "sem capítulos"
              : "sem episódios"}
        </span>
      </div>
    </div>
  );
}

function SourceRow({ cluster, source, target, onMerged, onDismiss, onSwap, busy }) {
  const reading = target.family === "READING";
  const initial = useMemo(
    () => Object.fromEntries((source.plan || []).map((p) => [p.unit, p.action === "MAP" ? p.target : p.action])),
    [source.plan],
  );
  const [plan, setPlan] = useState(initial);
  useEffect(() => setPlan(initial), [initial]);
  const units = (source.units || []).filter((u) => u.count > 0 || plan[u.id]);
  const moving = units.filter((u) => plan[u.id] && plan[u.id] !== "SKIP").length;
  const partial = units.some((u) => !plan[u.id] || plan[u.id] === "SKIP");
  const high = source.confidence === "alta";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px 16px", borderTop: "1px solid rgba(240,238,233,.05)" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <WorkLine w={source} badge={<span style={chip("#B7B1A4")}>{source.reason}</span>} />
        <span style={chip(high ? "#7FB77E" : "#DBAF57")}>{high ? "confiança alta" : "revisar"}</span>
      </div>
      {(source.notes || []).length ? (
        <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", lineHeight: 1.6, color: "#DBAF57" }}>
          {source.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
      {units.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {units.map((u) => (
            <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "13px" }}>
              <span style={{ flex: "1 1 240px", color: "#D9D5CC" }}>{unitLabel(u, reading)}</span>
              <span style={{ color: "#8F897D" }}>→</span>
              <select
                value={plan[u.id] || "SKIP"}
                onChange={(e) => setPlan((p) => ({ ...p, [u.id]: e.target.value }))}
                style={{
                  flex: "1 1 260px",
                  height: "32px",
                  borderRadius: "8px",
                  background: "#0B0A09",
                  color: "#F0EEE9",
                  border: "1px solid rgba(240,238,233,.14)",
                  padding: "0 8px",
                  fontSize: "13px",
                }}
              >
                {(target.units || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    Somar a {unitLabel(t, reading)}
                  </option>
                ))}
                <option value="NEW">{reading ? "Entrar como nova edição" : "Entrar como nova temporada"}</option>
                <option value="SKIP">Não mover</option>
              </select>
            </label>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button
          style={button(true, busy)}
          disabled={busy || moving === 0}
          onClick={() => onMerged(source, plan)}
          title={partial ? "Só as partes escolhidas mudam; as duas obras continuam existindo" : "A duplicata fica oculta e aponta para a principal"}
        >
          {partial ? "Mover as partes escolhidas" : "Fundir na principal"}
        </button>
        <button style={button(false, busy)} disabled={busy} onClick={() => onSwap(source)}>
          Usar esta como principal
        </button>
        <button style={button(false, busy)} disabled={busy} onClick={() => onDismiss(source)}>
          Não é a mesma obra
        </button>
        <span style={{ fontSize: "12px", color: "#8F897D" }}>
          {partial ? "fusão parcial" : "fusão completa"} · grupo {cluster.key}
        </span>
      </div>
    </div>
  );
}

function Cluster({ cluster, onChanged, flash }) {
  const [view, setView] = useState({ target: cluster.target, sources: cluster.sources });
  const [busy, setBusy] = useState(false);
  useEffect(() => setView({ target: cluster.target, sources: cluster.sources }), [cluster]);

  const run = (p, ok) => {
    setBusy(true);
    return p
      .then((r) => {
        flash(ok(r));
        onChanged();
      })
      .catch((e) => flash(e?.message || "Não foi possível concluir"))
      .finally(() => setBusy(false));
  };
  const merge = (source, plan) => {
    const units = Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v || "SKIP"]));
    run(api.post("/api/admin/catalog/duplicates/merge", { targetId: view.target.id, sourceId: source.id, units }), (r) =>
      r.mode === "FULL" ? `"${source.title}" fundida em "${view.target.title}"` : "Partes movidas para a principal",
    );
  };
  const dismiss = (source) =>
    run(api.post("/api/admin/catalog/duplicates/dismiss", { a: view.target.id, b: source.id }), () => "Marcadas como obras diferentes");
  const swap = (source) => {
    setBusy(true);
    const others = [view.target, ...view.sources.filter((s) => s.id !== source.id)];
    Promise.all(
      others.map((o) => api.get(`/api/admin/catalog/duplicates/proposal?source=${o.id}&target=${source.id}`)),
    )
      .then((list) => setView({ target: list[0].target, sources: list.map((x) => ({ ...x.source, reason: "Troca manual" })) }))
      .catch(() => flash("Não foi possível recalcular"))
      .finally(() => setBusy(false));
  };

  return (
    <div style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", background: "rgba(219,175,87,.04)" }}>
        <WorkLine w={view.target} badge={<span style={chip(GOLD)}>principal</span>} />
      </div>
      {view.sources.map((s) => (
        <SourceRow
          key={`${view.target.id}-${s.id}`}
          cluster={cluster}
          source={s}
          target={view.target}
          busy={busy}
          onMerged={merge}
          onDismiss={dismiss}
          onSwap={swap}
        />
      ))}
    </div>
  );
}

export default function DuplicatesQueue() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [conf, setConf] = useState("all");
  const [family, setFamily] = useState("all");
  const [toast, setToast] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [limit, setLimit] = useState(20);

  const flash = useCallback((t) => {
    setToast(t);
    clearTimeout(flash.t);
    flash.t = setTimeout(() => setToast(null), 2600);
  }, []);
  const load = useCallback(() => {
    api.get("/api/admin/catalog/duplicates").then(setData).catch(() => flash("Não foi possível carregar as duplicatas"));
    api.get("/api/admin/catalog/duplicates/history").then(setHistory).catch(() => {});
  }, [flash]);
  useEffect(load, [load]);

  const clusters = data?.clusters || [];
  const shown = clusters.filter(
    (c) => (conf === "all" || c.confidence === conf) && (family === "all" || c.family === family),
  );
  const n = (pred) => clusters.filter(pred).length;
  const high = n((c) => c.confidence === "alta");

  const mergeConfident = () => {
    if (!high || bulk) return;
    if (!window.confirm(`Fundir os ${high} grupos de confiança alta com a proposta padrão?`)) return;
    setBulk(true);
    api
      .post("/api/admin/catalog/duplicates/merge-confident", {})
      .then((r) => {
        flash(`${r.merged} fundidas${r.failed?.length ? `, ${r.failed.length} com erro` : ""}`);
        load();
      })
      .catch(() => flash("A fusão em lote falhou"))
      .finally(() => setBulk(false));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond',serif", fontSize: "26px", fontWeight: 600 }}>Obras duplicadas</h2>
        <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
          {data ? `${clusters.length} grupos · ${data.merged} fusões feitas` : "Procurando…"}
        </span>
      </div>
      <p style={{ margin: 0, maxWidth: "760px", fontSize: "14px", lineHeight: 1.6, color: "#D9D5CC" }}>
        Cada fonte criava a sua própria obra. Fundir soma tudo na principal: temporadas e episódios que faltam entram, e
        nos episódios e capítulos que já existem os servidores e espelhos da duplicata viram opções a mais. A duplicata
        fica oculta, o endereço antigo continua abrindo a principal e as próximas sincronizações já caem nela.
      </p>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {[
          ["all", "Todos", clusters.length],
          ["alta", "Confiança alta", high],
          ["revisar", "Revisar", clusters.length - high],
        ].map(([k, label, c]) => (
          <button key={k} style={pill(conf === k)} onClick={() => setConf(k)}>
            {label} <span style={{ ...mono, opacity: 0.7 }}>{c}</span>
          </button>
        ))}
        <span style={{ width: "8px" }} />
        {[
          ["all", "Animes e leituras"],
          ["ANIMATION", "Animes", n((c) => c.family === "ANIMATION")],
          ["READING", "Leituras", n((c) => c.family === "READING")],
        ].map(([k, label, c]) => (
          <button key={k} style={pill(family === k)} onClick={() => setFamily(k)}>
            {label} {c != null ? <span style={{ ...mono, opacity: 0.7 }}>{c}</span> : null}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          onClick={mergeConfident}
          disabled={!high || bulk}
          style={{ ...button(true, bulk), height: "38px", padding: "0 16px", borderRadius: "999px", fontSize: "13px", opacity: high ? 1 : 0.4 }}
        >
          {bulk ? "Fundindo…" : `Fundir as de confiança alta (${high})`}
        </button>
      </div>
      {shown.slice(0, limit).map((c) => (
        <Cluster key={c.key} cluster={c} onChanged={load} flash={flash} />
      ))}
      {data && !shown.length ? (
        <span style={{ ...card, padding: "40px", textAlign: "center", fontSize: "14px", color: "#B7B1A4" }}>
          Nenhuma duplicata neste filtro.
        </span>
      ) : null}
      {shown.length > limit ? (
        <button style={{ ...button(false), alignSelf: "center" }} onClick={() => setLimit((l) => l + 20)}>
          Mostrar mais ({shown.length - limit})
        </button>
      ) : null}
      {history.length ? (
        <div style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600 }}>Últimas fusões</span>
          {history.map((h) => (
            <span key={h.id} style={{ fontSize: "12px", color: "#B7B1A4" }}>
              <span style={{ ...mono, color: "#8F897D" }}>{new Date(h.at).toLocaleString("pt-BR")}</span> · {h.source} (#{h.sourceId}) →{" "}
              {h.target} (#{h.targetId}) · {h.mode === "FULL" ? "completa" : "parcial"}
              {h.by ? ` · ${h.by}` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {toast ? (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 16px",
            borderRadius: "10px",
            background: "#F0EEE9",
            color: "#1A1714",
            fontSize: "13px",
            fontWeight: 500,
            zIndex: 50,
          }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
