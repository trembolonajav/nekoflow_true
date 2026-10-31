// Origem: design/claude-design/Footer.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css } from "../dc/runtime";
import LanguageSelector from "./LanguageSelector";

class FooterLogic extends DCLogic {}

const pendingStyle = { fontSize: "14px", color: "#8F897D", cursor: "not-allowed" };

const helmet = [];

function render(v) {
  return (
    <>
      <footer
        style={{
          borderTop: "1px solid rgba(219,175,87,.12)",
          background: "#141210",
          padding: "56px 48px 28px",
          display: "flex",
          flexDirection: "column",
          gap: "44px",
          fontFamily: "Inter,system-ui,sans-serif",
          color: "#F0EEE9",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "40px 48px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              gridColumn: "span 2",
              minWidth: "0",
              maxWidth: "380px",
            }}
          >
            <a href="/" style={{ display: "flex", alignItems: "center", gap: "14px", color: "#F0EEE9" }}>
              <img
                src="/assets/nekoflow-mascot.png"
                alt=""
                style={{ width: "56px", height: "56px", objectFit: "contain", flexShrink: "0" }}
              />
              <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "26px", fontWeight: "500" }}>
                Nekoflow
              </span>
            </a>
            <span
              style={{
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: "26px",
                fontWeight: "500",
                lineHeight: "1.15",
                color: "#F0EEE9",
              }}
            >
              Entre episódios e capítulos.
            </span>
            <span style={{ fontSize: "14px", lineHeight: "1.6", color: "#B7B1A4" }}>
              Histórias para assistir, ler e descobrir.
            </span>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: ".24em",
                textTransform: "uppercase",
                color: "#DBAF57",
                marginBottom: "4px",
              }}
            >
              Conteúdos
            </span>
            <a className="nk-hover-1d5grei" href="/animes" style={{ fontSize: "14px", color: "#D9D5CC" }}>
              Animes
            </a>
            <a className="nk-hover-1d5grei" href="/explorar?tipo=filmes" style={{ fontSize: "14px", color: "#D9D5CC" }}>
              Filmes de anime
            </a>
            <a className="nk-hover-1d5grei" href="/leituras?tipo=mangas" style={{ fontSize: "14px", color: "#D9D5CC" }}>
              Mangás
            </a>
            <a
              className="nk-hover-1d5grei"
              href="/leituras?tipo=manhwas"
              style={{ fontSize: "14px", color: "#D9D5CC" }}
            >
              Manhwas
            </a>
            <a
              className="nk-hover-1d5grei"
              href="/leituras?tipo=webtoons"
              style={{ fontSize: "14px", color: "#D9D5CC" }}
            >
              Webtoons
            </a>
          </nav>
          <nav style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: ".24em",
                textTransform: "uppercase",
                color: "#DBAF57",
                marginBottom: "4px",
              }}
            >
              Navegação
            </span>
            <a className="nk-hover-1d5grei" href="/explorar" style={{ fontSize: "14px", color: "#D9D5CC" }}>
              Explorar
            </a>
            <a className="nk-hover-1d5grei" href="/calendario" style={{ fontSize: "14px", color: "#D9D5CC" }}>
              Calendário
            </a>
            <a className="nk-hover-1d5grei" href="/biblioteca" style={{ fontSize: "14px", color: "#D9D5CC" }}>
              Minha lista
            </a>
            <a className="nk-hover-1d5grei" href="/solicitacoes" style={{ fontSize: "14px", color: "#D9D5CC" }}>
              Solicitar obra
            </a>
          </nav>
          <nav style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: ".24em",
                textTransform: "uppercase",
                color: "#DBAF57",
                marginBottom: "4px",
              }}
            >
              Nekoflow
            </span>
            <span title="Página institucional em preparação" aria-disabled="true" style={pendingStyle}>
              Sobre o projeto
            </span>
            <span title="Central de ajuda em preparação" aria-disabled="true" style={pendingStyle}>
              Ajuda e contato
            </span>
            <span title="Documento em preparação" aria-disabled="true" style={pendingStyle}>
              Termos de Uso
            </span>
            <span title="Documento em preparação" aria-disabled="true" style={pendingStyle}>
              Privacidade
            </span>
          </nav>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px 24px",
            paddingTop: "22px",
            borderTop: "1px solid rgba(240,238,233,.07)",
            fontSize: "13px",
            color: "#B7B1A4",
          }}
        >
          <span>© 2026 Nekoflow. Todos os direitos reservados.</span>
          <span style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "6px", height: "6px", transform: "rotate(45deg)", border: "1px solid #DBAF57" }} />
              Feito para quem ama boas histórias.
            </span>
            <LanguageSelector placement="footer" />
          </span>
        </div>
      </footer>
    </>
  );
}

export const defaults = {};

export default defineDC("Footer", FooterLogic, render, { helmet });
