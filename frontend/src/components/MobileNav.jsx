// Navegação inferior do celular: as cinco seções principais.
// Só aparece em telas estreitas (mobile.css) e some no modo imersivo (tela cheia).
import React, { useEffect } from "react";

const ITEMS = [
  ["/", "Início", "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z", (p) => p === "/"],
  [
    "/animes",
    "Animes",
    "M7 4l13 8-13 8z",
    (p) => p === "/animes" || p.startsWith("/animes/") || p === "/player",
  ],
  [
    "/leituras",
    "Leituras",
    "M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z",
    (p) => p === "/leituras" || p.startsWith("/leituras/") || p === "/leitor",
  ],
  [
    "/explorar",
    "Explorar",
    "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5",
    (p, q) => p === "/explorar" && !q.includes("tipo=anime"),
  ],
  ["/calendario", "Agenda", "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4", (p) => p === "/calendario"],
];

export default function MobileNav() {
  useEffect(() => {
    document.documentElement.classList.add("nk-has-mnav");
    return () => document.documentElement.classList.remove("nk-has-mnav");
  }, []);
  const p = location.pathname;
  const q = location.search;
  return (
    <nav className="nk-mnav" aria-label="Navegação principal">
      {ITEMS.map(([href, label, d, isOn]) => {
        const on = isOn(p, q);
        return (
          <a key={label} href={href} className={on ? "is-on" : ""}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={d} />
            </svg>
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
