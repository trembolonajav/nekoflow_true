// Origem: design/claude-design/Calendario.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css } from "../dc/runtime";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { session, goLogin } from "../lib/session";
import { libraryApi } from "../features/library/libraryApi";
import { getWorkUrl } from "../features/catalog/workNavigation";

class CalendarioLogic extends DCLogic {
  state = { data: null, mode: "todos", week: 0, day: 17, follow: null };
  componentDidMount() {
    // Programação + publicações confirmadas; "Seguir" é o mesmo acompanhamento da obra.
    Promise.all([
      api.get("/api/calendar"),
      session.loggedIn
        ? libraryApi.follows().then((list) => list.map((f) => f.legacyId)).catch(() => [])
        : Promise.resolve([]),
    ]).then(([data, follow]) => this.setState({ data, follow }));
    this.tick = setInterval(() => this.forceUpdate(), 60000);
  }
  componentWillUnmount() {
    clearInterval(this.tick);
  }
  renderVals() {
    const loggedIn = this.props.loggedIn ?? true;
    const { data, mode, week, day } = this.state;
    const follow = new Set(this.state.follow || []);
    const now = Date.now() / 1000;
    const nowD = new Date((now - 3 * 3600) * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const todayN = nowD.getUTCMonth() === 9 && nowD.getUTCFullYear() === 2026 ? nowD.getUTCDate() : 17;
    const events = data ? [...data.anime, ...data.reads] : [];
    const inMode = (e) =>
      mode === "todos"
        ? true
        : mode === "anim"
          ? e.kind === "anime"
          : mode === "leit"
            ? e.kind !== "anime"
            : follow.has(e.id);
    const first = 12 + week * 7;
    const WD = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const days = WD.map((wd, i) => {
      const n = first + i;
      const sel = n === day;
      const c = events.filter((e) => e.day === n && inMode(e)).length;
      return {
        wd: n === todayN ? "Hoje" : wd,
        n,
        countLabel: c ? `${c} ${c === 1 ? "lançamento" : "lançamentos"}` : "—",
        bg: sel ? "#DBAF57" : n === todayN ? "rgba(219,175,87,.08)" : "#1A1714",
        border: sel ? "#DBAF57" : n === todayN ? "rgba(219,175,87,.4)" : "rgba(240,238,233,.07)",
        color: sel ? "#1A1714" : "#F0EEE9",
        subColor: sel ? "#1A1714" : "#B7B1A4",
        pick: () => this.setState({ day: n }),
      };
    });
    const list = events.filter((e) => e.day === day && inMode(e)).sort((a, b) => a.ts - b.ts || b.pop - a.pop);
    const kindLabel = (e) =>
      e.kind === "anime"
        ? "Anime"
        : e.kind === "manga"
          ? e.webtoon
            ? "Mangá · Webtoon"
            : "Mangá"
          : e.webtoon
            ? "Manhwa · Webtoon"
            : "Manhwa";
    let nowPlaced = false;
    const rows = list.map((e) => {
      const done = e.ts <= now;
      const hrs = (e.ts - now) / 3600;
      let status, sc, sb;
      if (done) {
        status = "Ver obra";
        sc = "#DBAF57";
        sb = "rgba(219,175,87,.5)";
      } else if (hrs < 24) {
        status = hrs < 1 ? `em ${Math.max(1, Math.round(hrs * 60))} min` : `em ${Math.round(hrs)} h`;
        sc = "#F0EEE9";
        sb = "rgba(240,238,233,.2)";
      } else if (e.estimated) {
        status = "Previsto";
        sc = "#B7B1A4";
        sb = "rgba(240,238,233,.12)";
      } else {
        status = "Confirmado";
        sc = "#B7B1A4";
        sb = "rgba(240,238,233,.12)";
      }
      const nowBefore = day === todayN && !done && !nowPlaced;
      if (nowBefore) nowPlaced = true;
      const f = follow.has(e.id);
      const h = parseInt(e.time, 10);
      return {
        ...e,
        href: getWorkUrl(e),
        period: h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3,
        sub:
          e.kind === "anime"
            ? `${e.unit} · ${kindLabel(e)} · no Japão às ${e.jp}`
            : `${e.unit} · ${kindLabel(e)}${e.estimated ? " · horário a confirmar" : ""}`,
        hasBadge: !!(e.premiere || e.final),
        badge: e.premiere ? "ESTREIA" : "FINAL",
        status,
        statusColor: sc,
        statusBorder: sb,
        opacity: 1,
        nowBefore,
        followFill: f ? "#DBAF57" : "none",
        followStroke: f ? "#DBAF57" : "#B7B1A4",
        followLabel: f ? "Deixar de seguir" : "Seguir",
        toggle: () => {
          if (!session.loggedIn) return goLogin();
          const on = !f;
          this.setState((s) => {
            const set = new Set(s.follow);
            on ? set.add(e.id) : set.delete(e.id);
            return { follow: [...set] };
          });
          libraryApi.follow(e.id, on).catch(() =>
            this.setState((s) => {
              const set = new Set(s.follow);
              on ? set.delete(e.id) : set.add(e.id);
              return { follow: [...set] };
            }),
          );
        },
      };
    });
    const P = ["Madrugada", "Manhã", "Tarde", "Noite"];
    const periods = P.map((label, i) => {
      const r = rows.filter((x) => x.period === i);
      return { label, rows: r, count: `${r.length}` };
    }).filter((p) => p.rows.length);
    const fmtD = (n) => `${n}`;
    const followCount = events.filter((e) => follow.has(e.id) && e.day >= first && e.day < first + 7).length;
    const M = [
      ["todos", "Todos"],
      ["anim", "Animações"],
      ["leit", "Leituras"],
      ["agenda", "Minha agenda"],
    ];
    const highlights = events
      .filter((e) => e.kind === "anime" && (e.premiere || e.final) && e.day >= first && e.day < first + 7)
      .sort((a, b) => a.ts - b.ts)
      .slice(0, 8)
      .map((e) => ({
        ...e,
        badge: e.premiere ? "ESTREIA" : "FINAL",
        when: `${WD[e.day - first]} ${e.day} · ${e.time}`,
        go: () => this.setState({ day: e.day }),
      }));
    return {
      loggedIn,
      highlights,
      noHighlights: !!data && highlights.length === 0,
      modes: M.filter(([k]) => k !== "agenda" || loggedIn).map(([k, label]) => ({
        label,
        hasCount: k === "agenda",
        count: followCount,
        pick: () => this.setState({ mode: k }),
        bg: k === mode ? "#DBAF57" : "transparent",
        color: k === mode ? "#1A1714" : "#F0EEE9",
      })),
      weekLabel: week === 0 ? "12 – 18 de outubro" : "19 – 25 de outubro",
      prevWeek: () => week > 0 && this.setState({ week: 0, day: 17 }),
      nextWeek: () => week < 1 && this.setState({ week: 1, day: 19 }),
      prevOpacity: week > 0 ? 1 : 0.35,
      nextOpacity: week < 1 ? 1 : 0.35,
      days,
      periods,
      nowTime: `${pad(nowD.getUTCHours())}:${pad(nowD.getUTCMinutes())}`,
      empty: !!data && rows.length === 0,
      emptyTitle: mode === "agenda" ? "Nada das suas obras neste dia" : "Nenhum lançamento neste dia",
      emptyText:
        mode === "agenda"
          ? "Toque no marcador ao lado de qualquer lançamento para seguir a obra e vê-la aqui."
          : "Escolha outro dia da semana ou mude o filtro.",
    };
  }
}

const helmet = [
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
    text: "\nbody{margin:0;background:#171411;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\n",
  },
];

function render(v) {
  return (
    <>
      <div style={{ minHeight: "100vh", background: "#171411", display: "flex", flexDirection: "column" }}>
        <Header
          active="calendario"
          loggedIn={v.loggedIn}
          solid={true}
          __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
        />
        <div
          className="nk-page"
          style={{ padding: "112px 48px 80px", display: "flex", flexDirection: "column", gap: "32px" }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: "20px 40px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <h1
                style={{
                  margin: "0",
                  fontFamily: "'Cormorant Garamond',serif",
                  fontWeight: "500",
                  fontSize: "56px",
                  lineHeight: "1",
                }}
              >
                Calendário
              </h1>
              <p style={{ margin: "0", fontSize: "15px", color: "#B7B1A4" }}>
                Episódios e capítulos da semana, no horário de Brasília.
              </p>
            </div>
            <nav
              className="nk-scroll-x"
              style={{
                display: "flex",
                gap: "6px",
                padding: "5px",
                borderRadius: "999px",
                border: "1px solid rgba(240,238,233,.1)",
                background: "#1A1714",
              }}
            >
              {asList(v.modes).map((m, $index) => (
                <React.Fragment key={$index}>
                  <button
                    onClick={m?.pick}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      height: "38px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "0 16px",
                      borderRadius: "999px",
                      fontSize: "14px",
                      fontWeight: "500",
                      background: `${m?.bg ?? ""}`,
                      color: `${m?.color ?? ""}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {txt(m?.label)}
                    {m?.hasCount ? (
                      <>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", opacity: ".75" }}>
                          {txt(m?.count)}
                        </span>
                      </>
                    ) : null}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "26px", fontWeight: "500" }}>
                {txt(v.weekLabel)}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="nk-hover-ucdklh"
                  onClick={v.prevWeek}
                  aria-label="Semana anterior"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    border: "1px solid rgba(219,175,87,.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#F0EEE9",
                    opacity: `${v.prevOpacity ?? ""}`,
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <button
                  className="nk-hover-ucdklh"
                  onClick={v.nextWeek}
                  aria-label="Próxima semana"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    border: "1px solid rgba(219,175,87,.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#F0EEE9",
                    opacity: `${v.nextOpacity ?? ""}`,
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: "8px" }}>
              {asList(v.days).map((d, $index) => (
                <React.Fragment key={$index}>
                  <button
                    className="nk-hover-1aaqvuu"
                    onClick={d?.pick}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      padding: "18px 0 16px",
                      borderRadius: "12px",
                      border: `1px solid ${d?.border ?? ""}`,
                      background: `${d?.bg ?? ""}`,
                      color: `${d?.color ?? ""}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        letterSpacing: ".18em",
                        textTransform: "uppercase",
                        color: `${d?.subColor ?? ""}`,
                      }}
                    >
                      {txt(d?.wd)}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Cormorant Garamond',serif",
                        fontSize: "40px",
                        fontWeight: "500",
                        lineHeight: "1",
                      }}
                    >
                      {txt(d?.n)}
                    </span>
                    <span style={{ fontSize: "12px", color: `${d?.subColor ?? ""}` }}>{txt(d?.countLabel)}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "40px 48px", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "36px", minWidth: "0", flex: "999 1 620px" }}>
              {asList(v.periods).map((p, $index) => (
                <React.Fragment key={$index}>
                  <section style={{ display: "flex", flexDirection: "column" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        paddingBottom: "10px",
                        borderBottom: "1px solid rgba(219,175,87,.18)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Cormorant Garamond',serif",
                          fontSize: "26px",
                          fontWeight: "500",
                          color: "#F0EEE9",
                        }}
                      >
                        {txt(p?.label)}
                      </span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#DBAF57" }}>
                        {txt(p?.count)}
                      </span>
                    </div>
                    {asList(p?.rows).map((r, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {r?.nowBefore ? (
                            <>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0" }}>
                                <span
                                  style={{
                                    fontFamily: "'JetBrains Mono',monospace",
                                    fontSize: "11px",
                                    color: "#DBAF57",
                                  }}
                                >
                                  {"AGORA · "}
                                  {txt(v.nowTime)}
                                </span>
                                <span style={{ flex: "1", height: "1px", background: "#DBAF57" }} />
                              </div>
                            </>
                          ) : null}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "auto 56px minmax(0,1fr) auto 40px",
                              gap: "clamp(12px,1.4vw,20px)",
                              alignItems: "center",
                              padding: "16px 0",
                              borderBottom: "1px solid rgba(240,238,233,.06)",
                              opacity: `${r?.opacity ?? ""}`,
                            }}
                          >
                            <span
                              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "18px", color: "#F0EEE9" }}
                            >
                              {txt(r?.time)}
                            </span>
                            <img
                              src={r?.cover}
                              alt=""
                              loading="lazy"
                              style={{
                                width: "56px",
                                height: "80px",
                                objectFit: "cover",
                                borderRadius: "6px",
                                display: "block",
                              }}
                            />
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "0" }}>
                                <a
                                  className="nk-hover-1d5grei"
                                  href={r?.href}
                                  style={{
                                    fontSize: "17px",
                                    fontWeight: "500",
                                    color: "#F0EEE9",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {txt(r?.title)}
                                </a>
                                {r?.hasBadge ? (
                                  <>
                                    <span
                                      style={{
                                        flexShrink: "0",
                                        fontSize: "9px",
                                        fontWeight: "700",
                                        letterSpacing: ".16em",
                                        padding: "3px 6px",
                                        borderRadius: "3px",
                                        background: "#DBAF57",
                                        color: "#1A1714",
                                      }}
                                    >
                                      {txt(r?.badge)}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                              <span
                                style={{
                                  fontSize: "14px",
                                  color: "#B7B1A4",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {txt(r?.sub)}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: "13px",
                                fontWeight: "500",
                                padding: "7px 14px",
                                borderRadius: "999px",
                                border: `1px solid ${r?.statusBorder ?? ""}`,
                                color: `${r?.statusColor ?? ""}`,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {txt(r?.status)}
                            </span>
                            <button
                              className="nk-hover-1owwya7"
                              onClick={r?.toggle}
                              aria-label={r?.followLabel}
                              title={r?.followLabel}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                width: "36px",
                                height: "36px",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <svg
                                width="17"
                                height="17"
                                viewBox="0 0 24 24"
                                fill={r?.followFill}
                                stroke={r?.followStroke}
                                strokeWidth="1.8"
                              >
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </section>
                </React.Fragment>
              ))}
              {v.empty ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "12px",
                      padding: "48px 24px",
                      borderRadius: "16px",
                      border: "1px dashed rgba(219,175,87,.25)",
                    }}
                  >
                    <img
                      src="/assets/nekoflow-mascot.png"
                      alt=""
                      style={{ width: "100px", height: "100px", objectFit: "contain" }}
                    />
                    <h3
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "28px",
                      }}
                    >
                      {txt(v.emptyTitle)}
                    </h3>
                    <p style={{ margin: "0", fontSize: "14px", color: "#B7B1A4", maxWidth: "420px" }}>
                      {txt(v.emptyText)}
                    </p>
                  </div>
                </>
              ) : null}
              <p style={{ margin: "0", fontSize: "12px", color: "#8F897D", lineHeight: "1.6" }}>
                O horário principal é quando o conteúdo fica disponível na Nekoflow. Para animes, o horário de exibição
                no Japão aparece abaixo do título.
              </p>
            </div>
            <aside
              className="nk-full"
              style={{
                flex: "1 1 300px",
                position: "sticky",
                top: "88px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                padding: "24px",
                borderRadius: "16px",
                background: "#1A1714",
                border: "1px solid rgba(219,175,87,.14)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "26px", fontWeight: "500" }}>
                  Estreias e finais
                </span>
                <span style={{ fontSize: "13px", color: "#B7B1A4" }}>Nesta semana</span>
              </div>
              {asList(v.highlights).map((h, $index) => (
                <React.Fragment key={$index}>
                  <button
                    className="nk-hover-1pre5kj"
                    onClick={h?.go}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "flex",
                      gap: "14px",
                      alignItems: "center",
                      padding: "10px 0",
                      borderTop: "1px solid rgba(240,238,233,.07)",
                    }}
                  >
                    <img
                      src={h?.cover}
                      alt=""
                      loading="lazy"
                      style={{
                        width: "44px",
                        height: "62px",
                        objectFit: "cover",
                        borderRadius: "5px",
                        flexShrink: "0",
                        display: "block",
                      }}
                    />
                    <span style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: "700",
                            letterSpacing: ".16em",
                            padding: "3px 6px",
                            borderRadius: "3px",
                            background: "#DBAF57",
                            color: "#1A1714",
                          }}
                        >
                          {txt(h?.badge)}
                        </span>
                        <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(h?.when)}</span>
                      </span>
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: "500",
                          color: "#F0EEE9",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {txt(h?.title)}
                      </span>
                    </span>
                  </button>
                </React.Fragment>
              ))}
              {v.noHighlights ? (
                <>
                  <span style={{ fontSize: "13px", color: "#B7B1A4" }}>Nenhuma estreia ou final nesta semana.</span>
                </>
              ) : null}
            </aside>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}

export const defaults = { loggedIn: true };

export default defineDC("Calendario", CalendarioLogic, render, { helmet });
