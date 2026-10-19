// Origem: design/claude-design/Home Nekoflow.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css } from "../dc/runtime";

class HomeDirecoesLogic extends DCLogic {
  renderVals() {
    const loggedIn = this.props.loggedIn ?? true;
    const loading = this.props.loading ?? false;
    return {
      loggedIn,
      guest: !loggedIn,
      loading,
      loaded: !loading,
      ctaLabel: loggedIn ? "Continuar Ep. 4" : "Assistir Ep. 1",
      hero: {
        title: "Frieren",
        year: "2026",
        genres: "Fantasia · Drama",
        studio: "Madhouse",
        score: "4,8",
        synopsis:
          "Depois de derrotar o Rei Demônio, a maga elfa Frieren revisita os caminhos da antiga jornada e descobre o que deixou de notar nas pessoas que viajaram com ela.",
      },
      highlights: [
        { title: "Frieren", meta: "Temporada 2", bar: "62%", opacity: 1 },
        { title: "Dandadan", meta: "Novo ep. sexta", bar: "0%", opacity: 0.7 },
        { title: "Kaiju No. 8", meta: "Finalizado", bar: "0%", opacity: 0.7 },
        { title: "Blue Lock", meta: "Temporada 3", bar: "0%", opacity: 0.7 },
        { title: "Apothecary Diaries", meta: "Ep. 14 dublado", bar: "0%", opacity: 0.7 },
      ],
      sideFeatures: [
        { tag: "Estreia", title: "Dandadan", meta: "Science SARU · Ep. 1 disponível" },
        { tag: "Dublado", title: "Apothecary Diaries", meta: "Toho Animation · 24 episódios" },
      ],
      continueItems: [
        { title: "Frieren", ep: "T2 · Ep. 4 — O túmulo do herói", pct: "62%", left: "9 min" },
        { title: "Solo Leveling", ep: "T2 · Ep. 11", pct: "30%", left: "17 min" },
        { title: "Kaiju No. 8", ep: "Ep. 7", pct: "85%", left: "3 min" },
        { title: "Blue Lock", ep: "T3 · Ep. 2", pct: "12%", left: "21 min" },
      ],
      seasonItems: [
        { title: "Dandadan", meta: "Science SARU", day: "SEX" },
        { title: "Frieren", meta: "Madhouse", day: "SÁB" },
        { title: "Blue Lock", meta: "8bit", day: "SÁB" },
        { title: "Spy x Family", meta: "Wit · CloverWorks", day: "DOM" },
        { title: "Apothecary Diaries", meta: "Toho Animation", day: "QUI" },
        { title: "Solo Leveling", meta: "A-1 Pictures", day: "DOM" },
      ],
      recentItems: [
        { title: "Dandadan", ep: "Ep. 3 · há 2 h", lang: "LEG", isNew: true },
        { title: "Frieren", ep: "T2 · Ep. 5 · há 5 h", lang: "LEG", isNew: true },
        { title: "Apothecary Diaries", ep: "Ep. 14 · ontem", lang: "DUB", isNew: false },
        { title: "Blue Lock", ep: "T3 · Ep. 3 · ontem", lang: "LEG", isNew: false },
        { title: "Spy x Family", ep: "T3 · Ep. 6 · 2 dias", lang: "DUB", isNew: false },
        { title: "Solo Leveling", ep: "T2 · Ep. 12 · 3 dias", lang: "LEG", isNew: false },
        { title: "Kaiju No. 8", ep: "Ep. 8 · 3 dias", lang: "LEG", isNew: false },
        { title: "Oshi no Ko", ep: "T3 · Ep. 1 · 4 dias", lang: "LEG", isNew: false },
      ],
      skel4: [1, 2, 3, 4],
      skel6: [1, 2, 3, 4, 5, 6],
    };
  }
}

const helmet = [
  {
    tag: "style",
    text: "html,body{background:#f0eee6}#dc-root>.sc-host{position:relative}",
  },
  {
    tag: "link",
    attrs: {
      rel: "preconnect",
      href: "https://fonts.googleapis.com",
    },
  },
  {
    tag: "link",
    attrs: {
      href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      rel: "stylesheet",
    },
  },
  {
    tag: "style",
    text: "\nbody{margin:0;background:#0F0D0B;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\n",
  },
];

function render(v) {
  return (
    <>
      <section style={{ padding: "64px", display: "flex", flexDirection: "column", gap: "40px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "900px" }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: "12px",
              letterSpacing: ".22em",
              textTransform: "uppercase",
              color: "#DBAF57",
            }}
          >
            Turno 1 · Home
          </span>
          <h1
            style={{
              margin: "0",
              fontFamily: "'Cormorant Garamond',serif",
              fontWeight: "500",
              fontSize: "48px",
              lineHeight: "1.05",
            }}
          >
            Três direções para o hero e as seções em comum
          </h1>
          <p style={{ margin: "0", color: "#B7B1A4", fontSize: "15px", lineHeight: "1.6", textWrap: "pretty" }}>
            Paleta, tipografia, logo e mascote mantidos. Em todas: header de 72px com o logo recortado, um único tipo de
            controle no hero e um CTA que retoma o episódio em andamento. Use os Tweaks para alternar entre visitante e
            logado e para ver o estado de carregamento.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "48px", alignItems: "flex-start" }}>
          <div id="1a" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "13px",
                  fontWeight: "500",
                  background: "#DBAF57",
                  color: "#1A1714",
                  padding: "4px 10px",
                  borderRadius: "4px",
                }}
              >
                1a
              </span>
              <span style={{ fontSize: "15px", fontWeight: "500" }}>Editorial refinado</span>
              <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                Banner cheio, fila de próximos destaques no lugar das setas e do pôster
              </span>
            </div>
            <div
              style={{
                width: "1440px",
                background: "#171411",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid rgba(240,238,233,.06)",
              }}
            >
              {" "}
              <div style={{ position: "relative", height: "720px", overflow: "hidden" }}>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    background: "repeating-linear-gradient(135deg,#2D2924 0 12px,#27231F 12px 24px)",
                  }}
                />{" "}
                <span
                  style={{
                    position: "absolute",
                    right: "48px",
                    top: "110px",
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: "11px",
                    color: "#B7B1A4",
                    letterSpacing: ".1em",
                  }}
                >
                  banner do anime em destaque · 1920×1080
                </span>{" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    background: "linear-gradient(90deg,#171411 0%,rgba(23,20,17,.82) 38%,rgba(23,20,17,0) 75%)",
                  }}
                />{" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    background: "linear-gradient(0deg,#171411 0%,rgba(23,20,17,0) 45%,rgba(23,20,17,.5) 100%)",
                  }}
                />{" "}
                <div
                  style={{
                    position: "absolute",
                    left: "0",
                    right: "0",
                    top: "0",
                    height: "72px",
                    display: "flex",
                    alignItems: "center",
                    gap: "28px",
                    padding: "0 48px",
                    zIndex: "2",
                  }}
                >
                  <div style={{ width: "150px", height: "56px", overflow: "hidden", flexShrink: "0" }}>
                    <img
                      src="/assets/nekoflow-logo.png"
                      alt="Nekoflow"
                      style={{ height: "110px", margin: "-27px 0 0 -32px" }}
                    />
                  </div>
                  <nav style={{ display: "flex", gap: "4px" }}>
                    <span
                      style={{
                        padding: "8px 12px",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#DBAF57",
                        borderBottom: "1px solid #DBAF57",
                      }}
                    >
                      Início
                    </span>
                    <span style={{ padding: "8px 12px", fontSize: "14px", fontWeight: "500" }}>Calendário</span>
                    <span style={{ padding: "8px 12px", fontSize: "14px", fontWeight: "500" }}>Explorar</span>
                  </nav>
                  <div
                    style={{
                      marginLeft: "auto",
                      width: "360px",
                      height: "40px",
                      borderRadius: "999px",
                      border: "1px solid rgba(240,238,233,.12)",
                      background: "rgba(26,23,20,.6)",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 16px",
                      fontSize: "13px",
                      color: "#B7B1A4",
                    }}
                  >
                    Buscar anime, estúdio ou gênero
                  </div>
                  <span
                    style={{
                      height: "40px",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 14px",
                      borderRadius: "8px",
                      border: "1px solid rgba(219,175,87,.3)",
                      background: "rgba(219,175,87,.06)",
                      color: "#DBAF57",
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    + Sugerir anime
                  </span>
                  {v.loggedIn ? (
                    <>
                      <span
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          border: "1px solid rgba(219,175,87,.4)",
                          background: "#2D2924",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "'Cormorant Garamond',serif",
                          color: "#DBAF57",
                        }}
                      >
                        M
                      </span>
                    </>
                  ) : null}
                  {v.guest ? (
                    <>
                      <span
                        style={{
                          height: "40px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 16px",
                          borderRadius: "8px",
                          background: "#DBAF57",
                          color: "#1A1714",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        Entrar
                      </span>
                    </>
                  ) : null}
                </div>{" "}
                <div
                  style={{
                    position: "absolute",
                    left: "48px",
                    top: "170px",
                    maxWidth: "620px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "22px",
                    zIndex: "1",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "11px",
                      fontWeight: "500",
                      letterSpacing: ".32em",
                      textTransform: "uppercase",
                      color: "#DBAF57",
                    }}
                  >
                    <span style={{ width: "32px", height: "1px", background: "rgba(219,175,87,.6)" }} />
                    Destaque da semana
                  </span>
                  <h2
                    style={{
                      margin: "0",
                      fontFamily: "'Cormorant Garamond',serif",
                      fontWeight: "500",
                      fontSize: "76px",
                      lineHeight: "1",
                      letterSpacing: "-.01em",
                    }}
                  >
                    {txt(v.hero?.title)}
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      gap: "14px",
                      alignItems: "center",
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "13px",
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                      color: "rgba(240,238,233,.8)",
                    }}
                  >
                    <span>{txt(v.hero?.year)}</span>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                    <span>{txt(v.hero?.genres)}</span>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                    <span>{txt(v.hero?.studio)}</span>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                    <span style={{ color: "#DBAF57" }}>
                      {"★ "}
                      {txt(v.hero?.score)}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "0",
                      fontSize: "17px",
                      lineHeight: "1.6",
                      color: "rgba(240,238,233,.86)",
                      textWrap: "pretty",
                    }}
                  >
                    {txt(v.hero?.synopsis)}
                  </p>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "8px" }}>
                    <span
                      style={{
                        height: "48px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "0 26px",
                        borderRadius: "999px",
                        background: "#DBAF57",
                        color: "#1A1714",
                        fontSize: "15px",
                        fontWeight: "600",
                      }}
                    >
                      <span
                        style={{
                          width: "0",
                          height: "0",
                          borderLeft: "10px solid #1A1714",
                          borderTop: "6px solid transparent",
                          borderBottom: "6px solid transparent",
                        }}
                      />
                      {txt(v.ctaLabel)}
                    </span>
                    <span
                      style={{
                        height: "48px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 24px",
                        borderRadius: "999px",
                        border: "1px solid rgba(240,238,233,.22)",
                        fontSize: "15px",
                      }}
                    >
                      Ver detalhes
                    </span>
                    <span
                      style={{
                        width: "48px",
                        height: "48px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        border: "1px solid rgba(240,238,233,.22)",
                        fontSize: "22px",
                        fontWeight: "300",
                      }}
                      title="Minha lista"
                    >
                      +
                    </span>
                  </div>
                  {v.loggedIn ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          fontSize: "13px",
                          color: "#B7B1A4",
                        }}
                      >
                        <span
                          style={{
                            width: "160px",
                            height: "3px",
                            borderRadius: "2px",
                            background: "rgba(240,238,233,.15)",
                            overflow: "hidden",
                            display: "block",
                          }}
                        >
                          <span style={{ display: "block", width: "62%", height: "100%", background: "#DBAF57" }} />
                        </span>
                        Ep. 4 · faltam 9 min
                      </div>
                    </>
                  ) : null}
                </div>{" "}
                <div
                  style={{
                    position: "absolute",
                    left: "48px",
                    right: "48px",
                    bottom: "36px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    zIndex: "1",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "11px",
                      letterSpacing: ".22em",
                      textTransform: "uppercase",
                      color: "#B7B1A4",
                    }}
                  >
                    A seguir em destaque
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: "14px" }}>
                    {asList(v.highlights).map((h, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            opacity: `${h?.opacity ?? ""}`,
                          }}
                        >
                          <span style={{ display: "block", height: "2px", background: "rgba(240,238,233,.15)" }}>
                            <span
                              style={{
                                display: "block",
                                height: "100%",
                                width: `${h?.bar ?? ""}`,
                                background: "#DBAF57",
                              }}
                            />
                          </span>
                          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                            <span
                              style={{
                                width: "72px",
                                height: "42px",
                                borderRadius: "6px",
                                flexShrink: "0",
                                background: "repeating-linear-gradient(135deg,#3A342E 0 6px,#332E29 6px 12px)",
                              }}
                            />
                            <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                              <span
                                style={{
                                  fontSize: "13px",
                                  fontWeight: "500",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {txt(h?.title)}
                              </span>
                              <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(h?.meta)}</span>
                            </span>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>{" "}
              </div>{" "}
            </div>
          </div>
          <div id="1b" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "13px",
                  fontWeight: "500",
                  background: "#DBAF57",
                  color: "#1A1714",
                  padding: "4px 10px",
                  borderRadius: "4px",
                }}
              >
                1b
              </span>
              <span style={{ fontSize: "15px", fontWeight: "500" }}>Pôster na lua</span>
              <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                O disco dourado do mascote vira o palco do pôster; banner bem recuado
              </span>
            </div>
            <div
              style={{
                width: "1440px",
                background: "#171411",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid rgba(240,238,233,.06)",
              }}
            >
              {" "}
              <div style={{ position: "relative", height: "720px", overflow: "hidden" }}>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    background: "repeating-linear-gradient(135deg,#221F1B 0 12px,#1E1B18 12px 24px)",
                    opacity: ".7",
                  }}
                />{" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    background: "radial-gradient(ellipse at 72% 55%,rgba(23,20,17,0) 0%,#171411 70%)",
                  }}
                />{" "}
                <div
                  style={{
                    position: "absolute",
                    left: "0",
                    right: "0",
                    top: "0",
                    height: "72px",
                    display: "flex",
                    alignItems: "center",
                    gap: "28px",
                    padding: "0 48px",
                    zIndex: "2",
                    borderBottom: "1px solid rgba(219,175,87,.08)",
                  }}
                >
                  <div style={{ width: "150px", height: "56px", overflow: "hidden", flexShrink: "0" }}>
                    <img
                      src="/assets/nekoflow-logo.png"
                      alt="Nekoflow"
                      style={{ height: "110px", margin: "-27px 0 0 -32px" }}
                    />
                  </div>
                  <nav style={{ display: "flex", gap: "4px" }}>
                    <span
                      style={{
                        padding: "8px 12px",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#DBAF57",
                        borderBottom: "1px solid #DBAF57",
                      }}
                    >
                      Início
                    </span>
                    <span style={{ padding: "8px 12px", fontSize: "14px", fontWeight: "500" }}>Calendário</span>
                    <span style={{ padding: "8px 12px", fontSize: "14px", fontWeight: "500" }}>Explorar</span>
                  </nav>
                  <div
                    style={{
                      marginLeft: "auto",
                      width: "360px",
                      height: "40px",
                      borderRadius: "999px",
                      border: "1px solid rgba(240,238,233,.12)",
                      background: "rgba(26,23,20,.6)",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 16px",
                      fontSize: "13px",
                      color: "#B7B1A4",
                    }}
                  >
                    Buscar anime, estúdio ou gênero
                  </div>
                  <span
                    style={{
                      height: "40px",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 14px",
                      borderRadius: "8px",
                      border: "1px solid rgba(219,175,87,.3)",
                      background: "rgba(219,175,87,.06)",
                      color: "#DBAF57",
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    + Sugerir anime
                  </span>
                  {v.loggedIn ? (
                    <>
                      <span
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          border: "1px solid rgba(219,175,87,.4)",
                          background: "#2D2924",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "'Cormorant Garamond',serif",
                          color: "#DBAF57",
                        }}
                      >
                        M
                      </span>
                    </>
                  ) : null}
                  {v.guest ? (
                    <>
                      <span
                        style={{
                          height: "40px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 16px",
                          borderRadius: "8px",
                          background: "#DBAF57",
                          color: "#1A1714",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        Entrar
                      </span>
                    </>
                  ) : null}
                </div>{" "}
                <div
                  style={{
                    position: "absolute",
                    right: "150px",
                    top: "118px",
                    width: "520px",
                    height: "520px",
                    borderRadius: "50%",
                    background: "radial-gradient(circle at 40% 35%,#C99A45 0%,#9A7130 70%,#7A5824 100%)",
                    opacity: ".9",
                  }}
                />{" "}
                <div
                  style={{
                    position: "absolute",
                    right: "120px",
                    top: "88px",
                    width: "580px",
                    height: "580px",
                    borderRadius: "50%",
                    border: "1px solid rgba(219,175,87,.35)",
                  }}
                />{" "}
                <div
                  style={{
                    position: "absolute",
                    right: "290px",
                    top: "150px",
                    width: "300px",
                    height: "450px",
                    borderRadius: "12px",
                    background: "repeating-linear-gradient(135deg,#2D2924 0 10px,#27231F 10px 20px)",
                    border: "1px solid rgba(219,175,87,.4)",
                    boxShadow: "0 40px 80px rgba(0,0,0,.55)",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "16px",
                  }}
                >
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#B7B1A4" }}>
                    pôster 2:3
                  </span>
                </div>{" "}
                <span
                  style={{
                    position: "absolute",
                    right: "205px",
                    top: "520px",
                    width: "10px",
                    height: "10px",
                    transform: "rotate(45deg)",
                    background: "#DBAF57",
                  }}
                />{" "}
                <span
                  style={{
                    position: "absolute",
                    right: "640px",
                    top: "210px",
                    width: "7px",
                    height: "7px",
                    transform: "rotate(45deg)",
                    background: "#DBAF57",
                  }}
                />{" "}
                <div
                  style={{
                    position: "absolute",
                    left: "48px",
                    top: "170px",
                    maxWidth: "560px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "22px",
                    zIndex: "1",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "11px",
                      fontWeight: "500",
                      letterSpacing: ".32em",
                      textTransform: "uppercase",
                      color: "#DBAF57",
                    }}
                  >
                    <span style={{ width: "32px", height: "1px", background: "rgba(219,175,87,.6)" }} />
                    Destaque da semana
                  </span>
                  <h2
                    style={{
                      margin: "0",
                      fontFamily: "'Cormorant Garamond',serif",
                      fontWeight: "500",
                      fontSize: "76px",
                      lineHeight: "1",
                      letterSpacing: "-.01em",
                    }}
                  >
                    {txt(v.hero?.title)}
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      gap: "14px",
                      alignItems: "center",
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "13px",
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                      color: "rgba(240,238,233,.8)",
                    }}
                  >
                    <span>{txt(v.hero?.year)}</span>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                    <span>{txt(v.hero?.genres)}</span>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                    <span style={{ color: "#DBAF57" }}>
                      {"★ "}
                      {txt(v.hero?.score)}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "0",
                      fontSize: "17px",
                      lineHeight: "1.6",
                      color: "rgba(240,238,233,.86)",
                      textWrap: "pretty",
                    }}
                  >
                    {txt(v.hero?.synopsis)}
                  </p>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "8px" }}>
                    <span
                      style={{
                        height: "48px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "0 26px",
                        borderRadius: "999px",
                        background: "#DBAF57",
                        color: "#1A1714",
                        fontSize: "15px",
                        fontWeight: "600",
                      }}
                    >
                      <span
                        style={{
                          width: "0",
                          height: "0",
                          borderLeft: "10px solid #1A1714",
                          borderTop: "6px solid transparent",
                          borderBottom: "6px solid transparent",
                        }}
                      />
                      {txt(v.ctaLabel)}
                    </span>
                    <span
                      style={{
                        height: "48px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 24px",
                        borderRadius: "999px",
                        border: "1px solid rgba(240,238,233,.22)",
                        fontSize: "15px",
                      }}
                    >
                      Ver detalhes
                    </span>
                  </div>
                </div>{" "}
                <div
                  style={{
                    position: "absolute",
                    left: "48px",
                    bottom: "48px",
                    display: "flex",
                    alignItems: "center",
                    gap: "18px",
                    zIndex: "1",
                  }}
                >
                  <div style={{ display: "flex", gap: "14px" }}>
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        transform: "rotate(45deg)",
                        background: "#DBAF57",
                        border: "1px solid #DBAF57",
                      }}
                    />
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        transform: "rotate(45deg)",
                        border: "1px solid rgba(219,175,87,.5)",
                      }}
                    />
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        transform: "rotate(45deg)",
                        border: "1px solid rgba(219,175,87,.5)",
                      }}
                    />
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        transform: "rotate(45deg)",
                        border: "1px solid rgba(219,175,87,.5)",
                      }}
                    />
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        transform: "rotate(45deg)",
                        border: "1px solid rgba(219,175,87,.5)",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "12px",
                      letterSpacing: ".22em",
                      color: "rgba(240,238,233,.8)",
                    }}
                  >
                    01 / 05
                  </span>
                  <span style={{ fontSize: "13px", color: "#B7B1A4" }}>Próximo: Dandadan</span>
                </div>{" "}
              </div>{" "}
            </div>
          </div>
          <div id="1c" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: "13px",
                  fontWeight: "500",
                  background: "#DBAF57",
                  color: "#1A1714",
                  padding: "4px 10px",
                  borderRadius: "4px",
                }}
              >
                1c
              </span>
              <span style={{ fontSize: "15px", fontWeight: "500" }}>Vitrine em grade</span>
              <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                Sem carrossel: um destaque principal e dois secundários sempre visíveis
              </span>
            </div>
            <div
              style={{
                width: "1440px",
                background: "#171411",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid rgba(240,238,233,.06)",
              }}
            >
              {" "}
              <div
                style={{
                  height: "72px",
                  display: "flex",
                  alignItems: "center",
                  gap: "28px",
                  padding: "0 48px",
                  borderBottom: "1px solid rgba(219,175,87,.08)",
                }}
              >
                <div style={{ width: "150px", height: "56px", overflow: "hidden", flexShrink: "0" }}>
                  <img
                    src="/assets/nekoflow-logo.png"
                    alt="Nekoflow"
                    style={{ height: "110px", margin: "-27px 0 0 -32px" }}
                  />
                </div>
                <nav style={{ display: "flex", gap: "4px" }}>
                  <span
                    style={{
                      padding: "8px 12px",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "#DBAF57",
                      borderBottom: "1px solid #DBAF57",
                    }}
                  >
                    Início
                  </span>
                  <span style={{ padding: "8px 12px", fontSize: "14px", fontWeight: "500" }}>Calendário</span>
                  <span style={{ padding: "8px 12px", fontSize: "14px", fontWeight: "500" }}>Explorar</span>
                </nav>
                <div
                  style={{
                    marginLeft: "auto",
                    width: "360px",
                    height: "40px",
                    borderRadius: "999px",
                    border: "1px solid rgba(240,238,233,.12)",
                    background: "#1A1714",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 16px",
                    fontSize: "13px",
                    color: "#B7B1A4",
                  }}
                >
                  Buscar anime, estúdio ou gênero
                </div>
                <span
                  style={{
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(219,175,87,.3)",
                    background: "rgba(219,175,87,.06)",
                    color: "#DBAF57",
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  + Sugerir anime
                </span>
                {v.loggedIn ? (
                  <>
                    <span
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        border: "1px solid rgba(219,175,87,.4)",
                        background: "#2D2924",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "'Cormorant Garamond',serif",
                        color: "#DBAF57",
                      }}
                    >
                      M
                    </span>
                  </>
                ) : null}
                {v.guest ? (
                  <>
                    <span
                      style={{
                        height: "40px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 16px",
                        borderRadius: "8px",
                        background: "#DBAF57",
                        color: "#1A1714",
                        fontSize: "14px",
                        fontWeight: "600",
                      }}
                    >
                      Entrar
                    </span>
                  </>
                ) : null}
              </div>{" "}
              <div
                style={{
                  padding: "28px 48px 40px",
                  display: "grid",
                  gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)",
                  gap: "16px",
                  height: "648px",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    borderRadius: "14px",
                    overflow: "hidden",
                    border: "1px solid rgba(219,175,87,.18)",
                  }}
                >
                  {" "}
                  <div
                    style={{
                      position: "absolute",
                      inset: "0",
                      background: "repeating-linear-gradient(135deg,#2D2924 0 12px,#27231F 12px 24px)",
                    }}
                  />{" "}
                  <span
                    style={{
                      position: "absolute",
                      right: "20px",
                      top: "18px",
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "11px",
                      color: "#B7B1A4",
                    }}
                  >
                    banner 16:9
                  </span>{" "}
                  <div
                    style={{
                      position: "absolute",
                      inset: "0",
                      background: "linear-gradient(0deg,#171411 0%,rgba(23,20,17,.7) 40%,rgba(23,20,17,0) 75%)",
                    }}
                  />{" "}
                  <div
                    style={{
                      position: "absolute",
                      left: "36px",
                      right: "36px",
                      bottom: "36px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      maxWidth: "600px",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "11px",
                        fontWeight: "500",
                        letterSpacing: ".32em",
                        textTransform: "uppercase",
                        color: "#DBAF57",
                      }}
                    >
                      <span style={{ width: "32px", height: "1px", background: "rgba(219,175,87,.6)" }} />
                      Destaque da semana
                    </span>
                    <h2
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "64px",
                        lineHeight: "1",
                      }}
                    >
                      {txt(v.hero?.title)}
                    </h2>
                    <p
                      style={{
                        margin: "0",
                        fontSize: "16px",
                        lineHeight: "1.6",
                        color: "rgba(240,238,233,.86)",
                        textWrap: "pretty",
                      }}
                    >
                      {txt(v.hero?.synopsis)}
                    </p>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "6px" }}>
                      <span
                        style={{
                          height: "46px",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "0 24px",
                          borderRadius: "999px",
                          background: "#DBAF57",
                          color: "#1A1714",
                          fontSize: "15px",
                          fontWeight: "600",
                        }}
                      >
                        <span
                          style={{
                            width: "0",
                            height: "0",
                            borderLeft: "10px solid #1A1714",
                            borderTop: "6px solid transparent",
                            borderBottom: "6px solid transparent",
                          }}
                        />
                        {txt(v.ctaLabel)}
                      </span>
                      <span
                        style={{
                          height: "46px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 22px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.22)",
                          fontSize: "15px",
                        }}
                      >
                        Ver detalhes
                      </span>
                    </div>
                  </div>{" "}
                </div>
                <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: "16px", minHeight: "0" }}>
                  {asList(v.sideFeatures).map((f, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        style={{
                          position: "relative",
                          borderRadius: "14px",
                          overflow: "hidden",
                          border: "1px solid rgba(240,238,233,.07)",
                        }}
                      >
                        {" "}
                        <div
                          style={{
                            position: "absolute",
                            inset: "0",
                            background: "repeating-linear-gradient(135deg,#2D2924 0 10px,#27231F 10px 20px)",
                          }}
                        />{" "}
                        <div
                          style={{
                            position: "absolute",
                            inset: "0",
                            background: "linear-gradient(0deg,#171411 0%,rgba(23,20,17,0) 70%)",
                          }}
                        />{" "}
                        <div
                          style={{
                            position: "absolute",
                            left: "22px",
                            right: "22px",
                            bottom: "20px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              letterSpacing: ".24em",
                              textTransform: "uppercase",
                              color: "#DBAF57",
                            }}
                          >
                            {txt(f?.tag)}
                          </span>
                          <span
                            style={{
                              fontFamily: "'Cormorant Garamond',serif",
                              fontSize: "30px",
                              fontWeight: "500",
                              lineHeight: "1.05",
                            }}
                          >
                            {txt(f?.title)}
                          </span>
                          <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(f?.meta)}</span>
                        </div>{" "}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>{" "}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "13px",
                fontWeight: "500",
                border: "1px solid #DBAF57",
                color: "#DBAF57",
                padding: "3px 10px",
                borderRadius: "4px",
              }}
            >
              Comum
            </span>
            <span style={{ fontSize: "15px", fontWeight: "500" }}>Seções abaixo do hero (servem para 1a, 1b e 1c)</span>
          </div>
          <div
            style={{
              width: "1440px",
              background: "#171411",
              borderRadius: "10px",
              overflow: "hidden",
              border: "1px solid rgba(240,238,233,.06)",
              padding: "48px 48px 0",
              display: "flex",
              flexDirection: "column",
              gap: "56px",
            }}
          >
            {v.loading ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <span
                    style={{
                      display: "block",
                      width: "280px",
                      height: "28px",
                      borderRadius: "6px",
                      background: "#221F1B",
                    }}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "16px" }}>
                    {asList(v.skel4).map((s, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          <span
                            style={{
                              display: "block",
                              aspectRatio: "16/9",
                              borderRadius: "10px",
                              background: "#221F1B",
                            }}
                          />
                          <span
                            style={{
                              display: "block",
                              width: "70%",
                              height: "12px",
                              borderRadius: "4px",
                              background: "#221F1B",
                            }}
                          />
                          <span
                            style={{
                              display: "block",
                              width: "45%",
                              height: "10px",
                              borderRadius: "4px",
                              background: "#1E1B18",
                            }}
                          />
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <span
                    style={{
                      display: "block",
                      width: "220px",
                      height: "28px",
                      borderRadius: "6px",
                      background: "#221F1B",
                      marginTop: "24px",
                    }}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: "16px" }}>
                    {asList(v.skel6).map((s, $index) => (
                      <React.Fragment key={$index}>
                        <span
                          style={{ display: "block", aspectRatio: "2/3", borderRadius: "10px", background: "#221F1B" }}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
            {v.loaded ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "56px" }}>
                  {v.loggedIn ? (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                          <h3
                            style={{
                              margin: "0",
                              fontFamily: "'Cormorant Garamond',serif",
                              fontWeight: "500",
                              fontSize: "34px",
                            }}
                          >
                            Continuar assistindo
                          </h3>
                          <a href="#" style={{ fontSize: "14px" }}>
                            Ver histórico →
                          </a>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "16px" }}>
                          {asList(v.continueItems).map((c, $index) => (
                            <React.Fragment key={$index}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <div
                                  style={{
                                    position: "relative",
                                    aspectRatio: "16/9",
                                    borderRadius: "10px",
                                    overflow: "hidden",
                                    background: "repeating-linear-gradient(135deg,#2D2924 0 10px,#27231F 10px 20px)",
                                    border: "1px solid rgba(240,238,233,.06)",
                                  }}
                                >
                                  {" "}
                                  <span
                                    style={{
                                      position: "absolute",
                                      left: "10px",
                                      top: "10px",
                                      fontFamily: "'JetBrains Mono',monospace",
                                      fontSize: "10px",
                                      color: "#B7B1A4",
                                    }}
                                  >
                                    thumb do episódio
                                  </span>{" "}
                                  <span
                                    style={{
                                      position: "absolute",
                                      right: "10px",
                                      bottom: "12px",
                                      fontFamily: "'JetBrains Mono',monospace",
                                      fontSize: "11px",
                                      background: "rgba(26,23,20,.8)",
                                      padding: "3px 7px",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    {txt(c?.left)}
                                  </span>{" "}
                                  <span
                                    style={{
                                      position: "absolute",
                                      left: "0",
                                      right: "0",
                                      bottom: "0",
                                      height: "3px",
                                      background: "rgba(240,238,233,.15)",
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: "block",
                                        height: "100%",
                                        width: `${c?.pct ?? ""}`,
                                        background: "#DBAF57",
                                      }}
                                    />
                                  </span>{" "}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                  <span style={{ fontSize: "15px", fontWeight: "500" }}>{txt(c?.title)}</span>
                                  <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(c?.ep)}</span>
                                </div>
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}
                  {v.guest ? (
                    <>
                      <div
                        style={{
                          position: "relative",
                          height: "220px",
                          borderRadius: "14px",
                          border: "1px solid rgba(219,175,87,.2)",
                          background: "#1A1714",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 48px",
                        }}
                      >
                        <img
                          src="/assets/nekoflow-mascot.png"
                          alt=""
                          style={{ position: "absolute", right: "40px", top: "-30px", height: "300px" }}
                        />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                            maxWidth: "620px",
                            position: "relative",
                          }}
                        >
                          <h3
                            style={{
                              margin: "0",
                              fontFamily: "'Cormorant Garamond',serif",
                              fontWeight: "500",
                              fontSize: "36px",
                              lineHeight: "1.1",
                            }}
                          >
                            Retome de onde parou, em qualquer tela
                          </h3>
                          <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "#B7B1A4" }}>
                            Com uma conta, a Nekoflow guarda seu progresso, monta sua lista e avisa quando sai episódio
                            novo.
                          </p>
                          <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                            <span
                              style={{
                                height: "44px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 22px",
                                borderRadius: "999px",
                                background: "#DBAF57",
                                color: "#1A1714",
                                fontSize: "14px",
                                fontWeight: "600",
                              }}
                            >
                              Criar conta
                            </span>
                            <span
                              style={{
                                height: "44px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 22px",
                                borderRadius: "999px",
                                border: "1px solid rgba(240,238,233,.22)",
                                fontSize: "14px",
                              }}
                            >
                              Já tenho conta
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <h3
                          style={{
                            margin: "0",
                            fontFamily: "'Cormorant Garamond',serif",
                            fontWeight: "500",
                            fontSize: "34px",
                          }}
                        >
                          Temporada de outono 2026
                        </h3>
                        <span style={{ fontSize: "14px", color: "#B7B1A4" }}>32 títulos em exibição</span>
                      </div>
                      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                        <a href="#" style={{ fontSize: "14px" }}>
                          Ver todos →
                        </a>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <span
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              border: "1px solid rgba(219,175,87,.25)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "18px",
                            }}
                          >
                            ‹
                          </span>
                          <span
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              border: "1px solid rgba(219,175,87,.25)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "18px",
                            }}
                          >
                            ›
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: "16px" }}>
                      {asList(v.seasonItems).map((s, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div
                              style={{
                                position: "relative",
                                aspectRatio: "2/3",
                                borderRadius: "10px",
                                overflow: "hidden",
                                background: "repeating-linear-gradient(135deg,#2D2924 0 10px,#27231F 10px 20px)",
                                border: "1px solid rgba(240,238,233,.06)",
                              }}
                            >
                              {" "}
                              <span
                                style={{
                                  position: "absolute",
                                  left: "10px",
                                  top: "10px",
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: "10px",
                                  color: "#B7B1A4",
                                }}
                              >
                                pôster
                              </span>{" "}
                              <span
                                style={{
                                  position: "absolute",
                                  left: "10px",
                                  bottom: "10px",
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: "11px",
                                  background: "rgba(26,23,20,.85)",
                                  color: "#DBAF57",
                                  padding: "3px 7px",
                                  borderRadius: "4px",
                                }}
                              >
                                {txt(s?.day)}
                              </span>{" "}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                              <span
                                style={{
                                  fontSize: "15px",
                                  fontWeight: "500",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {txt(s?.title)}
                              </span>
                              <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(s?.meta)}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                      <h3
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "34px",
                        }}
                      >
                        Episódios recentes
                      </h3>
                      <a href="#" style={{ fontSize: "14px" }}>
                        Ver todos →
                      </a>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "16px" }}>
                      {asList(v.recentItems).map((r, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div
                              style={{
                                position: "relative",
                                aspectRatio: "16/9",
                                borderRadius: "10px",
                                overflow: "hidden",
                                background: "repeating-linear-gradient(135deg,#2D2924 0 10px,#27231F 10px 20px)",
                                border: "1px solid rgba(240,238,233,.06)",
                              }}
                            >
                              {" "}
                              <span
                                style={{
                                  position: "absolute",
                                  left: "10px",
                                  bottom: "10px",
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: "10px",
                                  color: "#B7B1A4",
                                }}
                              >
                                thumb do episódio
                              </span>{" "}
                              {r?.isNew ? (
                                <>
                                  <span
                                    style={{
                                      position: "absolute",
                                      left: "10px",
                                      top: "10px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontSize: "11px",
                                      fontWeight: "600",
                                      letterSpacing: ".14em",
                                      background: "rgba(26,23,20,.85)",
                                      color: "#DBAF57",
                                      padding: "4px 8px",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: "6px",
                                        height: "6px",
                                        transform: "rotate(45deg)",
                                        background: "#DBAF57",
                                      }}
                                    />
                                    NOVO
                                  </span>
                                </>
                              ) : null}{" "}
                              <span
                                style={{
                                  position: "absolute",
                                  right: "10px",
                                  top: "10px",
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: "11px",
                                  background: "rgba(26,23,20,.85)",
                                  padding: "3px 7px",
                                  borderRadius: "4px",
                                }}
                              >
                                {txt(r?.lang)}
                              </span>{" "}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                              <span
                                style={{
                                  fontSize: "15px",
                                  fontWeight: "500",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {txt(r?.title)}
                              </span>
                              <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(r?.ep)}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            <footer
              style={{
                margin: "0 -48px",
                borderTop: "1px solid rgba(240,238,233,.06)",
                background: "#1A1714",
                padding: "48px",
                display: "flex",
                flexDirection: "column",
                gap: "32px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  maxWidth: "200px",
                  width: "100%",
                  margin: "0 auto",
                }}
              >
                <span
                  style={{
                    flex: "1",
                    height: "1px",
                    background: "linear-gradient(90deg,transparent,rgba(219,175,87,.6))",
                  }}
                />
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    transform: "rotate(45deg)",
                    border: "1px solid rgba(219,175,87,.7)",
                  }}
                />
                <span
                  style={{
                    flex: "1",
                    height: "1px",
                    background: "linear-gradient(270deg,transparent,rgba(219,175,87,.6))",
                  }}
                />
              </div>
              <div
                style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: "32px", alignItems: "start" }}
              >
                <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                  <img
                    src="/assets/nekoflow-mascot.png"
                    alt=""
                    style={{ width: "72px", height: "72px", objectFit: "contain" }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "26px", fontWeight: "500" }}>
                      Nekoflow
                    </span>
                    <span style={{ fontSize: "13px", lineHeight: "1.6", color: "#B7B1A4", maxWidth: "260px" }}>
                      Curadoria editorial para o melhor do anime — temporada atual, clássicos e joias de autor.
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <span
                    style={{ fontSize: "10px", letterSpacing: ".28em", textTransform: "uppercase", color: "#DBAF57" }}
                  >
                    Navegação
                  </span>
                  <span style={{ fontSize: "14px", color: "#B7B1A4" }}>Início</span>
                  <span style={{ fontSize: "14px", color: "#B7B1A4" }}>Calendário</span>
                  <span style={{ fontSize: "14px", color: "#B7B1A4" }}>Explorar</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <span
                    style={{ fontSize: "10px", letterSpacing: ".28em", textTransform: "uppercase", color: "#DBAF57" }}
                  >
                    Conta
                  </span>
                  <span style={{ fontSize: "14px", color: "#B7B1A4" }}>Perfil</span>
                  <span style={{ fontSize: "14px", color: "#B7B1A4" }}>Minha lista</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <span
                    style={{ fontSize: "10px", letterSpacing: ".28em", textTransform: "uppercase", color: "#DBAF57" }}
                  >
                    Sobre
                  </span>
                  <span style={{ fontSize: "14px", color: "#B7B1A4" }}>Termos de Uso</span>
                  <span style={{ fontSize: "14px", color: "#B7B1A4" }}>Política de Privacidade</span>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: "1px solid rgba(240,238,233,.06)",
                  paddingTop: "20px",
                  fontSize: "10px",
                  letterSpacing: ".22em",
                  textTransform: "uppercase",
                }}
              >
                <span style={{ color: "#B7B1A4" }}>© 2026 Nekoflow · Feito com cuidado</span>
                <span style={{ color: "#DBAF57" }}>Sua próxima obsessão</span>
              </div>
            </footer>
          </div>
        </div>
      </section>
    </>
  );
}

export const defaults = { loggedIn: true, loading: false };

export default defineDC("Home Nekoflow", HomeDirecoesLogic, render, { helmet });
