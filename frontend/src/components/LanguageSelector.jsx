// Origem: design/claude-design "Idiomas e Servidores.dc.html", seção 02 (Claude Design).
// Globo com o código do idioma do site; a lista mostra cada idioma escrito nele mesmo,
// sem bandeiras. Não muda áudio nem legenda dos episódios.
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getLocale, subscribeLocale } from "../i18n/locale";
import { changeSiteLanguage } from "../features/preferences/preferencesApi";
import { session } from "../lib/session";

const L = [
  ["pt-BR", "Português", "Brasil", "PT"],
  ["en", "English", "Inglês", "EN"],
  ["es", "Español", "Espanhol", "ES"],
];

const subscribeSession = (cb) => session.subscribe(cb);
const loggedInSnapshot = () => !!session.loggedIn;

/**
 * placement="header": some quando a pessoa está logada (a escolha fica em Conta › Preferências).
 * placement="footer": sempre visível, onde as pessoas costumam procurar.
 */
export default function LanguageSelector({ placement = "header" }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  const loggedIn = useSyncExternalStore(subscribeSession, loggedInSnapshot, loggedInSnapshot);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (placement === "header" && loggedIn) return null;
  const current = L.find((l) => l[0] === locale) || L[0];
  const up = placement === "footer";

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Idioma do site"
        aria-label="Idioma do site"
        aria-expanded={open}
        onMouseEnter={() => setHover("btn")}
        onMouseLeave={() => setHover(null)}
        style={{
          all: "unset",
          cursor: "pointer",
          height: "40px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "0 10px",
          borderRadius: "10px",
          color: open ? "#DBAF57" : "#F0EEE9",
          fontSize: "13px",
          fontWeight: "600",
          background: hover === "btn" ? "rgba(240,238,233,.06)" : "transparent",
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </svg>
        {current[3]}
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            ...(up ? { bottom: "48px" } : { top: "48px" }),
            right: "0",
            zIndex: 60,
            width: "240px",
            padding: "8px",
            borderRadius: "14px",
            background: "#1A1714",
            border: "1px solid rgba(219,175,87,.25)",
            boxShadow: "0 20px 50px rgba(0,0,0,.6)",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: "600",
              letterSpacing: ".2em",
              textTransform: "uppercase",
              color: "#B7B1A4",
              padding: "8px 10px 6px",
            }}
          >
            Idioma do site
          </span>
          {L.map(([code, name, sub]) => {
            const on = code === locale;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                lang={code}
                onClick={() => {
                  changeSiteLanguage(code);
                  setOpen(false);
                }}
                onMouseEnter={() => setHover(code)}
                onMouseLeave={() => setHover(null)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px",
                  borderRadius: "8px",
                  background: hover === code ? "#221F1B" : on ? "rgba(219,175,87,.1)" : "transparent",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  <span style={{ fontSize: "14px", color: on ? "#DBAF57" : "#F0EEE9" }}>{name}</span>
                  <span style={{ fontSize: "12px", color: "#8F897D" }}>{sub}</span>
                </span>
                {on ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DBAF57" strokeWidth="2.6">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                ) : null}
              </button>
            );
          })}
          <span
            style={{
              fontSize: "12px",
              lineHeight: "1.45",
              color: "#8F897D",
              padding: "8px 10px 4px",
              borderTop: "1px solid rgba(240,238,233,.07)",
              marginTop: "4px",
            }}
          >
            Muda menus e sinopses. Áudio e legenda escolhem-se no player.
          </span>
        </div>
      ) : null}
    </div>
  );
}
