// Integrações · Saúde dos servidores. Medida pelo uso real do player: desistir de um servidor
// para outro da mesma versão conta como falha; trocar de dublado para legendado, não. Host ruim
// desce na lista de servidores; link abandonado vai para o fim e vira pendência.
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

const STATUS = {
  good: ["#7FB77E", "Saudável"],
  warn: ["#DBAF57", "Instável"],
  bad: ["#E08A72", "Ruim"],
  unknown: ["#8F897D", "Poucos dados"],
};
const mono = { fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" };
const cell = { padding: "10px 12px", borderTop: "1px solid rgba(240,238,233,.05)", fontSize: "13px", whiteSpace: "nowrap" };

export default function ServerHealth() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/api/admin/servers/health").then(setRows).catch(() => setRows([]));
  }, []);
  const refresh = () => {
    setBusy(true);
    api.post("/api/admin/servers/health/refresh", {}).then(setRows).catch(() => {}).finally(() => setBusy(false));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond',serif", fontSize: "26px", fontWeight: 600 }}>Saúde dos servidores</h2>
        <span style={{ fontSize: "13px", color: "#B7B1A4" }}>últimos 7 dias · recalculada a cada 10 min</span>
        <span style={{ flex: 1 }} />
        <button
          onClick={refresh}
          disabled={busy}
          style={{
            all: "unset",
            cursor: busy ? "wait" : "pointer",
            height: "34px",
            padding: "0 14px",
            borderRadius: "999px",
            border: "1px solid rgba(219,175,87,.35)",
            color: "#DBAF57",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
          }}
        >
          {busy ? "Recalculando…" : "Recalcular agora"}
        </button>
      </div>
      <div style={{ borderRadius: "14px", background: "#1A1714", border: "1px solid rgba(240,238,233,.06)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", color: "#F0EEE9" }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: "11px", letterSpacing: ".08em", textTransform: "uppercase", color: "#8F897D" }}>
              {["Servidor", "Situação", "Links", "Sessões", "Desistências", "Reports", "Links suspeitos"].map((h) => (
                <th key={h} style={{ padding: "12px", fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => {
              const [color, label] = STATUS[r.status] || STATUS.unknown;
              const rate = r.sessions ? Math.round((r.away / r.sessions) * 100) : null;
              return (
                <tr key={r.host}>
                  <td style={{ ...cell, whiteSpace: "normal", minWidth: "220px" }}>
                    <div style={{ fontWeight: 500 }}>{r.label}</div>
                    <div style={{ ...mono, color: "#8F897D" }}>
                      {r.host} · {r.providers}
                    </div>
                  </td>
                  <td style={cell}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color }}>
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color }} />
                      {label}
                    </span>
                  </td>
                  <td style={{ ...cell, ...mono }}>{Number(r.links).toLocaleString("pt-BR")}</td>
                  <td style={{ ...cell, ...mono }}>{r.sessions}</td>
                  <td style={{ ...cell, ...mono }}>{rate == null ? "—" : `${r.away} (${rate}%)`}</td>
                  <td style={{ ...cell, ...mono }}>{r.reports}</td>
                  <td style={{ ...cell, ...mono, color: r.suspects ? "#E08A72" : "#B7B1A4" }}>{r.suspects}</td>
                </tr>
              );
            })}
            {rows && !rows.length ? (
              <tr>
                <td colSpan={7} style={{ ...cell, textAlign: "center", color: "#B7B1A4", padding: "32px" }}>
                  Nenhum servidor ativo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <span style={{ fontSize: "12px", lineHeight: 1.6, color: "#8F897D", maxWidth: "780px" }}>
        Servidor é iframe: não dá para saber se o vídeo tocou, mas dá para ver quando a pessoa desiste dele. Conta como
        desistência trocar para outro servidor da mesma versão; trocar de dublado para legendado não conta. Com menos de 10
        sessões a situação fica em "poucos dados" e a ordem editorial vale. Servidor instável ou ruim desce na lista do
        player; link com várias desistências ou reports vai para o fim e aparece em Pendências.
      </span>
    </div>
  );
}
