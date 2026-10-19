// Tokens visuais do design (paleta preto/dourado, Cormorant/Inter/JetBrains Mono)
// para as telas que não existiam no protótipo: detalhe de solicitação e painel.

export const C = {
  bg: "#171411",
  surface: "#1A1714",
  raised: "#221F1B",
  chip: "#2D2924",
  text: "#F0EEE9",
  muted: "#B7B1A4",
  faint: "#8F897D",
  gold: "#DBAF57",
  goldHover: "#E6C27A",
  ink: "#1A1714",
  green: "#9FC79A",
  amber: "#D9B98A",
  red: "#E08A7A",
  line: "rgba(240,238,233,.08)",
  lineGold: "rgba(219,175,87,.25)",
};

export const F = {
  serif: "'Cormorant Garamond',serif",
  sans: "Inter,system-ui,sans-serif",
  mono: "'JetBrains Mono',monospace",
};

export const STATUS_COLOR = {
  RECEBIDA: C.muted,
  EM_ANALISE: C.amber,
  AGUARDANDO: C.amber,
  APROVADA: C.gold,
  PROGRAMADA: C.gold,
  ATENDIDA: C.green,
  NAO_ATENDIDA: C.red,
  CANCELADA: C.faint,
};

export const page = {
  minHeight: "100vh",
  background: C.bg,
  color: C.text,
  fontFamily: F.sans,
  display: "flex",
  flexDirection: "column",
};

export const container = (max = 1100) => ({
  width: "100%",
  maxWidth: `${max}px`,
  margin: "0 auto",
  padding: "112px clamp(16px,3.3vw,48px) 72px",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  boxSizing: "border-box",
});

export const h1 = {
  margin: 0,
  fontFamily: F.serif,
  fontWeight: 500,
  fontSize: "clamp(34px,5vw,48px)",
  lineHeight: 1.05,
};
export const eyebrow = {
  fontFamily: F.mono,
  fontSize: "11px",
  letterSpacing: ".24em",
  textTransform: "uppercase",
  color: C.gold,
};
export const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: "14px", padding: "18px" };

export const pill = (color) => ({
  fontSize: "11px",
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: "999px",
  border: `1px solid ${color}`,
  color,
  whiteSpace: "nowrap",
});

export const chip = (on) => ({
  all: "unset",
  cursor: "pointer",
  height: "34px",
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "0 14px",
  borderRadius: "999px",
  fontSize: "13px",
  border: `1px solid ${on ? C.gold : "rgba(240,238,233,.14)"}`,
  background: on ? "rgba(219,175,87,.14)" : "transparent",
  color: on ? C.gold : C.text,
});

export const btn = (kind = "primary", disabled = false) => ({
  all: "unset",
  cursor: disabled ? "not-allowed" : "pointer",
  boxSizing: "border-box",
  minHeight: "42px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "0 20px",
  borderRadius: "999px",
  fontSize: "14px",
  fontWeight: 600,
  opacity: disabled ? 0.55 : 1,
  ...(kind === "primary"
    ? { background: disabled ? "#4A443D" : C.gold, color: C.ink }
    : kind === "danger"
      ? { border: `1px solid ${C.red}`, color: C.red }
      : { border: "1px solid rgba(240,238,233,.22)", color: C.text }),
});

export const input = {
  boxSizing: "border-box",
  width: "100%",
  minHeight: "44px",
  borderRadius: "10px",
  border: "1px solid rgba(240,238,233,.15)",
  background: C.surface,
  color: C.text,
  padding: "10px 14px",
  fontFamily: F.sans,
  fontSize: "14px",
  outline: "none",
};

export const label = { display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", fontWeight: 500 };
