// Origem: design/claude-design/Leituras.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css } from "../dc/runtime";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { session } from "../lib/session";

const hrefOf = (x) =>
  x.id === 151807 ? "/obra" : x.id === 105398 ? "/obra-leitura" : `/explorar?q=${encodeURIComponent(x.title || "")}`;

class LeiturasLogic extends DCLogic {
  state = { items: null, tab: "todas", day: "sab", theme: "regressao" };
  componentDidMount() {
    const p = new URLSearchParams(location.search).get("tipo");
    if (["mangas", "manhwas", "webtoons"].includes(p)) this.setState({ tab: p });
    api.get("/api/content/leituras")
      .then((items) => this.setState({ items }));
    if (session.loggedIn)
      api
        .get("/api/me/library")
        .then((lib) => this.setState({ lib }))
        .catch(() => {});
  }
  setTab(tab) {
    this.setState({ tab });
    try {
      history.replaceState(null, "", tab === "todas" ? location.pathname : `?tipo=${tab}`);
    } catch (e) {}
  }
  renderVals() {
    const loggedIn = this.props.loggedIn ?? true;
    const { items, tab, day, theme } = this.state;
    const all = items || [];
    const byTitle = (t) => all.find((x) => x.title === t) || all[0] || {};
    const typeLabel = (x) =>
      x.type === "Manhwa" && x.webtoon ? "Manhwa · Webtoon" : x.webtoon ? `${x.type} · Webtoon` : x.type;
    const pool =
      tab === "mangas"
        ? all.filter((x) => x.type === "Mangá")
        : tab === "manhwas"
          ? all.filter((x) => x.type === "Manhwa")
          : tab === "webtoons"
            ? all.filter((x) => x.webtoon)
            : all;
    const T = {
      todas: {
        kicker: "Mangás · Manhwas · Webtoons",
        title: "Leituras",
        sub: "Acompanhe capítulos novos das obras que você segue e retome a leitura de onde parou.",
        feat: "Witch Hat Atelier",
      },
      mangas: {
        kicker: "Japão · leitura por páginas",
        title: "Mangás",
        sub: "Lidos da direita para a esquerda, com capítulos semanais ou mensais. Muitos deram origem aos animes da temporada.",
        feat: "Kagurabachi",
      },
      manhwas: {
        kicker: "Coreia do Sul",
        title: "Manhwas",
        sub: "Regressão, murim, dungeons e romances de época. Capítulos coloridos, a maioria em rolagem vertical.",
        feat: "Return of the Blossoming Blade",
      },
      webtoons: {
        kicker: "Rolagem vertical",
        title: "Webtoons",
        sub: "Feitos para ler no celular: um capítulo curto por semana, sempre no mesmo dia.",
        feat: "Pick Me Up",
      },
    };
    const syn = {
      "Witch Hat Atelier":
        "Coco sempre quis ser bruxa, mas só quem nasce com magia pode aprender. Até descobrir que os feitiços são desenhados, e que um traço errado muda tudo.",
      Kagurabachi:
        "Chihiro quer vingança pela morte do pai, um ferreiro de espadas encantadas, e caça os feiticeiros que roubaram suas lâminas.",
      "Return of the Blossoming Blade":
        "Chung Myung, o maior espadachim da seita do Monte Hua, renasce cem anos depois e encontra a seita em ruínas. Agora precisa reerguê-la do zero.",
      "Pick Me Up":
        "Um jogador veterano acorda dentro do gacha que dominava, como um herói de uma estrela, e precisa guiar novatos até o topo de uma torre de cem andares.",
    };
    const ti = T[tab];
    const f = byTitle(ti.feat);
    const feat = {
      ...f,
      href: f.id ? hrefOf(f) : "#",
      hasBanner: !!f.banner,
      typeLabel: typeLabel(f),
      synopsis: syn[f.title] || "",
      score: f.score || "—",
      chList: [0, 1, 2].map((i) => ({
        n: (f.ch || 3) - i,
        when: i === 0 ? f.when : `há ${i * 7} d`,
        dot: i === 0 ? "#DBAF57" : "rgba(240,238,233,.25)",
      })),
    };
    const rest = pool.filter((x) => x.id !== f.id);
    // Continuar lendo: mesma fonte de progresso da Biblioteca e do Leitor.
    const kindOk = (x) =>
      tab === "todas" || (tab === "mangas" ? x.kind === "manga" : tab === "webtoons" ? x.webtoon : x.kind === "manhwa");
    const cont = (this.state.lib || [])
      .filter(
        (x) =>
          (x.kind === "manga" || x.kind === "manhwa") &&
          x.status === "andamento" &&
          x.hasProgress &&
          !x.done &&
          kindOk(x),
      )
      .slice(0, 3)
      .map((x) => ({
        ...x,
        type: x.kind === "manga" ? "Mangá" : "Manhwa",
        typeLabel: x.typeLabel,
        pct: `${x.pct}%`,
        where: `Cap. ${x.ch} · ${x.pct}% do capítulo`,
        href: x.unitHref,
      }));
    const updates = [...pool]
      .sort((a, b) => a.hoursAgo - b.hoursAgo)
      .slice(0, 10)
      .map((x) => ({
        ...x,
        href: hrefOf(x),
        typeLabel: typeLabel(x),
        prev: x.ch - 1,
        newBorder: x.hoursAgo < 12 ? "rgba(219,175,87,.45)" : "rgba(240,238,233,.08)",
        newDot: x.hoursAgo < 12 ? "#DBAF57" : "rgba(240,238,233,.3)",
      }));
    const ranking = [...all]
      .sort((a, b) => b.pop - a.pop)
      .slice(0, 10)
      .map((x, i) => ({
        ...x,
        rank: i + 1,
        href: hrefOf(x),
        typeLabel: typeLabel(x),
        score: x.score || "—",
        numColor: i < 3 ? "#DBAF57" : "rgba(240,238,233,.35)",
      }));
    const adaptations = ["Dandadan", "Sakamoto Days", "One-Punch Man"]
      .map(byTitle)
      .filter((x) => x.anime)
      .map((x) => ({ ...x, href: hrefOf(x), animeBanner: x.anime.banner || x.anime.cover }));
    const TH = [
      ["regressao", "Regressão"],
      ["murim", "Murim"],
      ["dungeon", "Dungeons e torres"],
      ["romance", "Romance"],
    ];
    const themeItems = all
      .filter(
        (x) =>
          x.type === "Manhwa" &&
          (theme === "romance" ? x.genres.includes("Romance") || x.themes.includes("epoca") : x.themes.includes(theme)),
      )
      .slice(0, 12)
      .map((x) => ({ ...x, href: hrefOf(x), score: x.score || "—" }));
    const D = [
      ["seg", "Seg"],
      ["ter", "Ter"],
      ["qua", "Qua"],
      ["qui", "Qui"],
      ["sex", "Sex"],
      ["sab", "Sáb"],
      ["dom", "Dom"],
    ];
    const dayItems = all
      .filter((x) => x.webtoon && x.day === day)
      .map((x) => ({
        ...x,
        next: x.ch + 1,
        href: hrefOf(x),
        badge: day === "sab" ? "HOJE" : D.find((d) => d[0] === day)[1].toUpperCase(),
      }));
    return {
      loggedIn,
      ready: !!items,
      tabInfo: ti,
      tabs: [
        ["todas", "Todas"],
        ["mangas", "Mangás"],
        ["manhwas", "Manhwas"],
        ["webtoons", "Webtoons"],
      ].map(([k, label]) => ({
        label,
        href: k === "todas" ? "/leituras" : `/leituras?tipo=${k}`,
        bg: k === tab ? "#DBAF57" : "transparent",
        color: k === tab ? "#1A1714" : "#F0EEE9",
        hover: k === tab ? "#1A1714" : "#DBAF57",
        go: (e) => {
          e.preventDefault();
          this.setTab(k);
        },
      })),
      isTodas: tab === "todas",
      isMangas: tab === "mangas",
      isManhwas: tab === "manhwas",
      isWebtoons: tab === "webtoons",
      feat,
      cont,
      updates,
      ranking,
      adaptations,
      themeItems,
      dayItems,
      themes: TH.map(([k, label]) => ({
        label,
        pick: () => this.setState({ theme: k }),
        bg: k === theme ? "rgba(219,175,87,.12)" : "transparent",
        border: k === theme ? "#DBAF57" : "rgba(240,238,233,.15)",
        color: k === theme ? "#DBAF57" : "#F0EEE9",
      })),
      days: D.map(([k, label]) => ({
        label,
        sub: k === "sab" ? "hoje" : String(all.filter((x) => x.webtoon && x.day === k).length),
        pick: () => this.setState({ day: k }),
        bg: k === day ? "#DBAF57" : "transparent",
        color: k === day ? "#1A1714" : "#F0EEE9",
        subColor: k === day ? "#1A1714" : "#B7B1A4",
      })),
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
          active="leituras"
          loggedIn={v.loggedIn}
          __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
        />
        <div className="nk-page-top" style={{ position: "relative", padding: "116px 48px 0", overflow: "hidden" }}>
          {" "}
          <div
            style={{
              position: "absolute",
              left: "0",
              right: "0",
              top: "0",
              height: "420px",
              background: "radial-gradient(ellipse 60% 100% at 85% 0%,rgba(219,175,87,.10),rgba(23,20,17,0) 70%)",
            }}
          />{" "}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: "24px 48px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "640px" }}>
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
                {txt(v.tabInfo?.kicker)}
              </span>
              <h1
                style={{
                  margin: "0",
                  fontFamily: "'Cormorant Garamond',serif",
                  fontWeight: "500",
                  fontSize: "60px",
                  lineHeight: "1",
                }}
              >
                {txt(v.tabInfo?.title)}
              </h1>
              <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "#B7B1A4", textWrap: "pretty" }}>
                {txt(v.tabInfo?.sub)}
              </p>
            </div>
            <nav
              style={{
                display: "flex",
                gap: "6px",
                padding: "5px",
                borderRadius: "999px",
                border: "1px solid rgba(240,238,233,.1)",
                background: "#1A1714",
              }}
            >
              {asList(v.tabs).map((t, $index) => (
                <React.Fragment key={$index}>
                  <a
                    className="nk-hover-wbwlzo"
                    href={t?.href}
                    onClick={t?.go}
                    style={{
                      height: "38px",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 18px",
                      borderRadius: "999px",
                      fontSize: "14px",
                      fontWeight: "500",
                      background: `${t?.bg ?? ""}`,
                      color: `${t?.color ?? ""}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {txt(t?.label)}
                  </a>
                </React.Fragment>
              ))}
            </nav>
          </div>{" "}
        </div>
        <main
          className="nk-main"
          style={{ padding: "32px 48px 80px", display: "flex", flexDirection: "column", gap: "64px" }}
        >
          {v.ready ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "64px" }}>
                <section
                  style={{
                    position: "relative",
                    borderRadius: "16px",
                    overflow: "hidden",
                    border: "1px solid rgba(219,175,87,.16)",
                    background: "#1A1714",
                  }}
                >
                  {" "}
                  {v.feat?.hasBanner ? (
                    <>
                      <img
                        src={v.feat?.banner}
                        alt=""
                        style={{
                          position: "absolute",
                          inset: "0",
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          opacity: ".32",
                          filter: "saturate(.8)",
                        }}
                      />
                    </>
                  ) : null}{" "}
                  <div
                    style={{
                      position: "absolute",
                      inset: "0",
                      background: "linear-gradient(90deg,#1A1714 0%,rgba(26,23,20,.85) 45%,rgba(26,23,20,.55) 100%)",
                    }}
                  />{" "}
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "28px 36px",
                      padding: "32px",
                      alignItems: "center",
                    }}
                  >
                    <img
                      src={v.feat?.cover}
                      alt={v.feat?.title}
                      style={{
                        width: "clamp(140px,14vw,200px)",
                        flexShrink: "0",
                        aspectRatio: "2/3",
                        objectFit: "cover",
                        borderRadius: "10px",
                        border: "1px solid rgba(219,175,87,.35)",
                        boxShadow: "0 24px 48px rgba(0,0,0,.5)",
                        display: "block",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                        minWidth: "0",
                        flex: "1 1 360px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "11px",
                          letterSpacing: ".22em",
                          textTransform: "uppercase",
                          color: "#DBAF57",
                        }}
                      >
                        {"Destaque · "}
                        {txt(v.feat?.typeLabel)}
                      </span>
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "clamp(32px,3.4vw,46px)",
                          lineHeight: "1.02",
                          textWrap: "balance",
                        }}
                      >
                        {txt(v.feat?.title)}
                      </h2>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                          alignItems: "center",
                          fontSize: "13px",
                          color: "rgba(240,238,233,.85)",
                        }}
                      >
                        <span style={{ color: "#DBAF57" }}>
                          {"★ "}
                          {txt(v.feat?.score)}
                        </span>
                        <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                        <span>{txt(v.feat?.genres)}</span>
                        <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                        <span>Em andamento</span>
                        <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                        <span>
                          {txt(v.feat?.ch)}
                          {" capítulos"}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "0",
                          fontSize: "15px",
                          lineHeight: "1.65",
                          color: "rgba(240,238,233,.86)",
                          maxWidth: "560px",
                          textWrap: "pretty",
                        }}
                      >
                        {txt(v.feat?.synopsis)}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "4px" }}>
                        <a
                          className="nk-hover-1uijps0"
                          href={v.feat?.href}
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
                          Ler capítulo 1
                        </a>
                        <a
                          className="nk-hover-1rcmvu"
                          href={v.feat?.href}
                          style={{
                            height: "44px",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 22px",
                            borderRadius: "999px",
                            border: "1px solid rgba(240,238,233,.25)",
                            color: "#F0EEE9",
                            fontSize: "14px",
                          }}
                        >
                          Ver obra
                        </a>
                        <span
                          title="Adicionar à biblioteca"
                          style={{
                            width: "44px",
                            height: "44px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "50%",
                            border: "1px solid rgba(240,238,233,.25)",
                            cursor: "pointer",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#F0EEE9"
                            strokeWidth="1.8"
                          >
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        borderLeft: "1px solid rgba(240,238,233,.1)",
                        paddingLeft: "28px",
                        flex: "1 1 240px",
                        maxWidth: "320px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          letterSpacing: ".24em",
                          textTransform: "uppercase",
                          color: "#B7B1A4",
                          marginBottom: "10px",
                        }}
                      >
                        Últimos capítulos
                      </span>
                      {asList(v.feat?.chList).map((c, $index) => (
                        <React.Fragment key={$index}>
                          <a
                            className="nk-hover-1d5grei"
                            href={v.feat?.href}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "12px",
                              padding: "12px 0",
                              borderBottom: "1px solid rgba(240,238,233,.07)",
                              color: "#F0EEE9",
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                fontSize: "14px",
                                fontWeight: "500",
                              }}
                            >
                              <span
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  transform: "rotate(45deg)",
                                  background: `${c?.dot ?? ""}`,
                                }}
                              />
                              {"Capítulo "}
                              {txt(c?.n)}
                            </span>
                            <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(c?.when)}</span>
                          </a>
                        </React.Fragment>
                      ))}
                      <a href={v.feat?.href} style={{ fontSize: "13px", marginTop: "12px" }}>
                        Todos os capítulos →
                      </a>
                    </div>
                  </div>{" "}
                </section>
                {v.loggedIn && v.cont.length ? (
                  <>
                    <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          justifyContent: "space-between",
                          gap: "24px",
                        }}
                      >
                        <h2
                          style={{
                            margin: "0",
                            fontFamily: "'Cormorant Garamond',serif",
                            fontWeight: "500",
                            fontSize: "36px",
                            lineHeight: "1.05",
                          }}
                        >
                          Continuar lendo
                        </h2>
                        <a href="/conta?aba=lendo" style={{ fontSize: "14px" }}>
                          Minha biblioteca →
                        </a>
                      </div>
                      <div
                        className="nk-grid-1"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))",
                          gap: "16px",
                        }}
                      >
                        {asList(v.cont).map((c, $index) => (
                          <React.Fragment key={$index}>
                            <div
                              style={{
                                display: "flex",
                                gap: "16px",
                                padding: "14px",
                                borderRadius: "12px",
                                background: "#1A1714",
                                border: "1px solid rgba(240,238,233,.06)",
                              }}
                            >
                              <img
                                src={c?.cover}
                                alt=""
                                style={{
                                  width: "76px",
                                  height: "114px",
                                  objectFit: "cover",
                                  borderRadius: "6px",
                                  flexShrink: "0",
                                  display: "block",
                                }}
                              />
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "6px",
                                  minWidth: "0",
                                  flex: "1",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "11px",
                                    letterSpacing: ".18em",
                                    textTransform: "uppercase",
                                    color: "#B7B1A4",
                                  }}
                                >
                                  {txt(c?.typeLabel)}
                                </span>
                                <span
                                  style={{
                                    fontSize: "15px",
                                    fontWeight: "500",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {txt(c?.title)}
                                </span>
                                <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(c?.where)}</span>
                                <span
                                  style={{
                                    display: "block",
                                    height: "3px",
                                    borderRadius: "2px",
                                    background: "rgba(240,238,233,.12)",
                                    overflow: "hidden",
                                    marginTop: "auto",
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
                                </span>
                                <a href={c?.href} style={{ fontSize: "13px", fontWeight: "600", marginTop: "4px" }}>
                                  Continuar →
                                </a>
                              </div>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}
                <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      gap: "24px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "36px",
                          lineHeight: "1.05",
                        }}
                      >
                        Atualizações recentes
                      </h2>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                        Capítulos publicados na Nekoflow, do mais novo para o mais antigo.
                      </span>
                    </div>
                    <a href="/calendario" style={{ fontSize: "14px" }}>
                      Ver todas →
                    </a>
                  </div>
                  <div
                    className="nk-grid-1"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(440px,1fr))",
                      gap: "0 40px",
                    }}
                  >
                    {asList(v.updates).map((u, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            padding: "14px 0",
                            borderBottom: "1px solid rgba(240,238,233,.07)",
                            alignItems: "center",
                          }}
                        >
                          <img
                            src={u?.cover}
                            alt=""
                            loading="lazy"
                            style={{
                              width: "56px",
                              height: "84px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              flexShrink: "0",
                              display: "block",
                            }}
                          />
                          <div
                            style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "0", flex: "1" }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                              <a
                                className="nk-hover-1d5grei"
                                href={u?.href}
                                style={{
                                  fontSize: "15px",
                                  fontWeight: "500",
                                  color: "#F0EEE9",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {txt(u?.title)}
                              </a>
                              <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                                {txt(u?.typeLabel)}
                                {" · PT-BR"}
                              </span>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                              <a
                                className="nk-hover-1rcmvu"
                                href={u?.href}
                                style={{
                                  height: "28px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "0 10px",
                                  borderRadius: "6px",
                                  background: "#221F1B",
                                  border: `1px solid ${u?.newBorder ?? ""}`,
                                  fontSize: "12px",
                                  color: "#F0EEE9",
                                }}
                              >
                                <span
                                  style={{
                                    width: "5px",
                                    height: "5px",
                                    transform: "rotate(45deg)",
                                    background: `${u?.newDot ?? ""}`,
                                  }}
                                />
                                {"Cap. "}
                                {txt(u?.ch)}
                                <span style={{ color: "#B7B1A4" }}>{txt(u?.when)}</span>
                              </a>
                              <a
                                className="nk-hover-1rcmvu"
                                href={u?.href}
                                style={{
                                  height: "28px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "0 10px",
                                  borderRadius: "6px",
                                  background: "#1E1B18",
                                  border: "1px solid rgba(240,238,233,.06)",
                                  fontSize: "12px",
                                  color: "#B7B1A4",
                                }}
                              >
                                {"Cap. "}
                                {txt(u?.prev)}
                                <span>{txt(u?.prevWhen)}</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </section>
                {v.isTodas ? (
                  <>
                    <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          justifyContent: "space-between",
                          gap: "24px",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <h2
                            style={{
                              margin: "0",
                              fontFamily: "'Cormorant Garamond',serif",
                              fontWeight: "500",
                              fontSize: "36px",
                              lineHeight: "1.05",
                            }}
                          >
                            Em alta nesta semana
                          </h2>
                          <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                            Por número de leitores nos últimos 7 dias.
                          </span>
                        </div>
                        <a href="/explorar" style={{ fontSize: "14px" }}>
                          Ranking completo →
                        </a>
                      </div>
                      <div
                        className="nk-grid-1"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill,minmax(440px,1fr))",
                          gap: "0 40px",
                        }}
                      >
                        {asList(v.ranking).map((r, $index) => (
                          <React.Fragment key={$index}>
                            <a
                              className="nk-hover-1d5grei"
                              href={r?.href}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "18px",
                                padding: "12px 0",
                                borderBottom: "1px solid rgba(240,238,233,.07)",
                                color: "#F0EEE9",
                              }}
                            >
                              <span
                                style={{
                                  width: "44px",
                                  fontFamily: "'Cormorant Garamond',serif",
                                  fontSize: "40px",
                                  fontWeight: "500",
                                  lineHeight: "1",
                                  color: `${r?.numColor ?? ""}`,
                                  textAlign: "right",
                                }}
                              >
                                {txt(r?.rank)}
                              </span>
                              <img
                                src={r?.cover}
                                alt=""
                                loading="lazy"
                                style={{
                                  width: "44px",
                                  height: "66px",
                                  objectFit: "cover",
                                  borderRadius: "5px",
                                  display: "block",
                                }}
                              />
                              <span
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "3px",
                                  minWidth: "0",
                                  flex: "1",
                                }}
                              >
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
                                <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                                  {txt(r?.typeLabel)}
                                  {" · "}
                                  {txt(r?.genres)}
                                </span>
                              </span>
                              <span
                                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#DBAF57" }}
                              >
                                {"★ "}
                                {txt(r?.score)}
                              </span>
                            </a>
                          </React.Fragment>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}
                {v.isMangas ? (
                  <>
                    <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <h2
                          style={{
                            margin: "0",
                            fontFamily: "'Cormorant Garamond',serif",
                            fontWeight: "500",
                            fontSize: "36px",
                            lineHeight: "1.05",
                          }}
                        >
                          Do anime para o original
                        </h2>
                        <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                          Viu a adaptação? Leia a história como ela foi publicada, desde o primeiro capítulo.
                        </span>
                      </div>
                      <div
                        className="nk-grid-1"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))",
                          gap: "20px",
                        }}
                      >
                        {asList(v.adaptations).map((a, $index) => (
                          <React.Fragment key={$index}>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                borderRadius: "14px",
                                overflow: "hidden",
                                background: "#1A1714",
                                border: "1px solid rgba(240,238,233,.07)",
                              }}
                            >
                              <div style={{ position: "relative", aspectRatio: "16/7" }}>
                                {" "}
                                <img
                                  src={a?.animeBanner}
                                  alt=""
                                  loading="lazy"
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />{" "}
                                <span
                                  style={{
                                    position: "absolute",
                                    inset: "0",
                                    background: "linear-gradient(0deg,#1A1714,rgba(26,23,20,0) 70%)",
                                  }}
                                />{" "}
                                <span
                                  style={{
                                    position: "absolute",
                                    right: "12px",
                                    top: "12px",
                                    fontSize: "10px",
                                    fontWeight: "600",
                                    letterSpacing: ".18em",
                                    background: "rgba(23,20,17,.85)",
                                    padding: "5px 8px",
                                    borderRadius: "4px",
                                    color: "#F0EEE9",
                                  }}
                                >
                                  ANIME
                                </span>{" "}
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "16px",
                                  padding: "0 20px 20px",
                                  marginTop: "-56px",
                                  position: "relative",
                                  alignItems: "flex-end",
                                }}
                              >
                                <img
                                  src={a?.cover}
                                  alt=""
                                  loading="lazy"
                                  style={{
                                    width: "84px",
                                    height: "126px",
                                    objectFit: "cover",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(219,175,87,.4)",
                                    boxShadow: "0 12px 24px rgba(0,0,0,.5)",
                                    flexShrink: "0",
                                    display: "block",
                                  }}
                                />
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "6px",
                                    minWidth: "0",
                                    paddingBottom: "2px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      letterSpacing: ".2em",
                                      textTransform: "uppercase",
                                      color: "#DBAF57",
                                    }}
                                  >
                                    Mangá original
                                  </span>
                                  <span
                                    style={{
                                      fontFamily: "'Cormorant Garamond',serif",
                                      fontSize: "24px",
                                      fontWeight: "500",
                                      lineHeight: "1.1",
                                    }}
                                  >
                                    {txt(a?.title)}
                                  </span>
                                  <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                                    {txt(a?.ch)}
                                    {" capítulos publicados"}
                                  </span>
                                </div>
                              </div>
                              <a
                                className="nk-hover-14cw581"
                                href={a?.href}
                                style={{
                                  margin: "0 20px 20px",
                                  height: "40px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(219,175,87,.4)",
                                  fontSize: "14px",
                                  fontWeight: "500",
                                }}
                              >
                                Ler do capítulo 1
                              </a>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}
                {v.isManhwas ? (
                  <>
                    <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "flex-end",
                          justifyContent: "space-between",
                          gap: "16px 24px",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <h2
                            style={{
                              margin: "0",
                              fontFamily: "'Cormorant Garamond',serif",
                              fontWeight: "500",
                              fontSize: "36px",
                              lineHeight: "1.05",
                            }}
                          >
                            Por tema
                          </h2>
                          <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                            Os enredos que os leitores de manhwa mais procuram.
                          </span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {asList(v.themes).map((t, $index) => (
                            <React.Fragment key={$index}>
                              <button
                                onClick={t?.pick}
                                style={{
                                  all: "unset",
                                  cursor: "pointer",
                                  height: "36px",
                                  display: "flex",
                                  alignItems: "center",
                                  padding: "0 16px",
                                  borderRadius: "999px",
                                  fontSize: "13px",
                                  fontWeight: "500",
                                  border: `1px solid ${t?.border ?? ""}`,
                                  background: `${t?.bg ?? ""}`,
                                  color: `${t?.color ?? ""}`,
                                }}
                              >
                                {txt(t?.label)}
                              </button>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                      <div
                        className="nk-grid-2"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
                          gap: "16px",
                        }}
                      >
                        {asList(v.themeItems).map((a, $index) => (
                          <React.Fragment key={$index}>
                            <a
                              className="nk-hover-1d5grei"
                              href={a?.href}
                              style={{ display: "flex", flexDirection: "column", gap: "10px", color: "#F0EEE9" }}
                            >
                              <span
                                style={{
                                  position: "relative",
                                  display: "block",
                                  aspectRatio: "2/3",
                                  borderRadius: "10px",
                                  overflow: "hidden",
                                  background: "#221F1B",
                                  border: "1px solid rgba(240,238,233,.06)",
                                }}
                              >
                                {" "}
                                <img
                                  src={a?.cover}
                                  alt=""
                                  loading="lazy"
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />{" "}
                                <span
                                  style={{
                                    position: "absolute",
                                    right: "8px",
                                    top: "8px",
                                    fontFamily: "'JetBrains Mono',monospace",
                                    fontSize: "11px",
                                    background: "rgba(23,20,17,.85)",
                                    color: "#DBAF57",
                                    padding: "3px 7px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  {"★ "}
                                  {txt(a?.score)}
                                </span>{" "}
                              </span>
                              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <span
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: "500",
                                    lineHeight: "1.35",
                                    display: "-webkit-box",
                                    WebkitLineClamp: "2",
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    minHeight: "38px",
                                  }}
                                >
                                  {txt(a?.title)}
                                </span>
                                <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                                  {"Cap. "}
                                  {txt(a?.ch)}
                                  {" · "}
                                  {txt(a?.genres)}
                                </span>
                              </span>
                            </a>
                          </React.Fragment>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}
                {v.isWebtoons ? (
                  <>
                    <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "flex-end",
                          justifyContent: "space-between",
                          gap: "16px 24px",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <h2
                            style={{
                              margin: "0",
                              fontFamily: "'Cormorant Garamond',serif",
                              fontWeight: "500",
                              fontSize: "36px",
                              lineHeight: "1.05",
                            }}
                          >
                            Agenda da semana
                          </h2>
                          <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                            Cada webtoon tem seu dia. Veja o que sai hoje e o que vem depois.
                          </span>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "4px",
                            padding: "4px",
                            borderRadius: "12px",
                            background: "#1A1714",
                            border: "1px solid rgba(240,238,233,.08)",
                          }}
                        >
                          {asList(v.days).map((d, $index) => (
                            <React.Fragment key={$index}>
                              <button
                                onClick={d?.pick}
                                style={{
                                  all: "unset",
                                  cursor: "pointer",
                                  width: "58px",
                                  height: "48px",
                                  borderRadius: "8px",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "2px",
                                  background: `${d?.bg ?? ""}`,
                                  color: `${d?.color ?? ""}`,
                                }}
                              >
                                <span style={{ fontSize: "13px", fontWeight: "600" }}>{txt(d?.label)}</span>
                                <span
                                  style={{ fontSize: "10px", letterSpacing: ".08em", color: `${d?.subColor ?? ""}` }}
                                >
                                  {txt(d?.sub)}
                                </span>
                              </button>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                      <div
                        className="nk-grid-2"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))",
                          gap: "16px",
                        }}
                      >
                        {asList(v.dayItems).map((a, $index) => (
                          <React.Fragment key={$index}>
                            <a
                              className="nk-hover-1d5grei"
                              href={a?.href}
                              style={{ display: "flex", flexDirection: "column", gap: "10px", color: "#F0EEE9" }}
                            >
                              <span
                                style={{
                                  position: "relative",
                                  display: "block",
                                  aspectRatio: "2/3",
                                  borderRadius: "10px",
                                  overflow: "hidden",
                                  background: "#221F1B",
                                  border: "1px solid rgba(240,238,233,.06)",
                                }}
                              >
                                {" "}
                                <img
                                  src={a?.cover}
                                  alt=""
                                  loading="lazy"
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />{" "}
                                <span
                                  style={{
                                    position: "absolute",
                                    left: "8px",
                                    top: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    fontSize: "10px",
                                    fontWeight: "600",
                                    letterSpacing: ".14em",
                                    background: "rgba(23,20,17,.88)",
                                    color: "#DBAF57",
                                    padding: "5px 8px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: "5px",
                                      height: "5px",
                                      transform: "rotate(45deg)",
                                      background: "#DBAF57",
                                    }}
                                  />
                                  {txt(a?.badge)}
                                </span>{" "}
                              </span>
                              <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <span
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: "500",
                                    lineHeight: "1.35",
                                    display: "-webkit-box",
                                    WebkitLineClamp: "2",
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    minHeight: "38px",
                                  }}
                                >
                                  {txt(a?.title)}
                                </span>
                                <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                                  {"Próximo: cap. "}
                                  {txt(a?.next)}
                                </span>
                              </span>
                            </a>
                          </React.Fragment>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </main>
        <Footer />
      </div>
    </>
  );
}

export const defaults = { loggedIn: true };

export default defineDC("Leituras", LeiturasLogic, render, { helmet });
