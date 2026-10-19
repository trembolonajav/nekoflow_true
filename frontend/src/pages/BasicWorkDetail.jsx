import React from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { goLogin } from "../lib/session";

const labelStyle = {
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "#DBAF57",
};

export default function BasicWorkDetail({
  work,
  section,
  loading = false,
  missing = false,
  loggedIn = false,
}) {
  const title = loading
    ? "Carregando obra…"
    : missing
      ? "Obra não encontrada"
      : work.title;
  const activeSection = work?.section || section;
  const explore = activeSection === "animes" ? "/animes" : "/leituras";
  const units = work?.availableUnits ?? work?.totalUnits;
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#171411",
        color: "#F0EEE9",
        fontFamily: "Inter,system-ui,sans-serif",
      }}
    >
      <Header
        active={activeSection === "animes" ? "animes" : "leituras"}
        loggedIn={loggedIn}
        solid
      />
      <main
        style={{
          minHeight: "72vh",
          padding: "112px clamp(20px,5vw,72px) 72px",
        }}
      >
        <section
          style={{
            minHeight: "420px",
            borderRadius: "20px",
            overflow: "hidden",
            border: "1px solid rgba(219,175,87,.15)",
            background: work?.banner
              ? `linear-gradient(90deg,rgba(20,18,16,.98),rgba(20,18,16,.72)),url(${work.banner}) center/cover`
              : "linear-gradient(135deg,#221F1B,#171411)",
            display: "grid",
            gridTemplateColumns: work?.cover
              ? "repeat(auto-fit,minmax(min(100%,260px),1fr))"
              : "1fr",
            gap: "clamp(24px,5vw,64px)",
            alignItems: "center",
            padding: "clamp(24px,5vw,64px)",
          }}
        >
          {work?.cover && (
            <img
              src={work.cover}
              alt={`Capa de ${work.title}`}
              style={{
                width: "100%",
                maxWidth: "240px",
                borderRadius: "12px",
                justifySelf: "center",
              }}
            />
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              maxWidth: "760px",
            }}
          >
            <span style={labelStyle}>
              {missing ? "Catálogo" : work?.typeLabel || "NekoFlow"}
            </span>
            <h1
              style={{
                margin: 0,
                fontFamily: "'Cormorant Garamond',serif",
                fontWeight: 500,
                fontSize: "clamp(42px,7vw,78px)",
                lineHeight: 1,
              }}
            >
              {title}
            </h1>
            {!loading && !missing && (
              <>
                {work.alt && (
                  <p style={{ margin: 0, color: "#B7B1A4", lineHeight: 1.6 }}>
                    {work.alt.split(" | ").join(" · ")}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    color: "#D9D5CC",
                  }}
                >
                  {[
                    work.year,
                    work.status,
                    units != null
                      ? `${units} ${work.section === "animes" ? "unidades" : "capítulos conhecidos"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .map((item) => (
                      <span
                        key={item}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid rgba(240,238,233,.14)",
                          borderRadius: "999px",
                        }}
                      >
                        {item}
                      </span>
                    ))}
                </div>
                <p style={{ margin: 0, color: "#B7B1A4", lineHeight: 1.7 }}>
                  Esta ficha usa os metadados reais disponíveis no catálogo.
                  Sinopse, temporadas e unidades detalhadas ainda não foram
                  cadastradas para esta obra.
                </p>
              </>
            )}
            {missing && (
              <p style={{ margin: 0, color: "#B7B1A4" }}>
                O endereço não corresponde a nenhuma obra cadastrada.
              </p>
            )}
            {!loading && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                <a
                  href={missing ? "/explorar" : explore}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "8px",
                    background: "#DBAF57",
                    color: "#1A1714",
                    fontWeight: 600,
                  }}
                >
                  {missing
                    ? "Voltar ao catálogo"
                    : "Explorar obras semelhantes"}
                </a>
                {!missing && !loggedIn && (
                  <button
                    onClick={goLogin}
                    style={{
                      padding: "12px 18px",
                      borderRadius: "8px",
                      border: "1px solid rgba(219,175,87,.5)",
                      background: "transparent",
                      color: "#DBAF57",
                      cursor: "pointer",
                    }}
                  >
                    Entrar para adicionar à lista
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
