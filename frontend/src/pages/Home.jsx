// Origem: design/claude-design/Home Nekoflow v2.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css } from "../dc/runtime";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { session, goLogin } from "../lib/session";
import { getWorkUrl } from "../features/catalog/workNavigation";
import { getLocale, subscribeLocale } from "../i18n/locale";
import { libraryApi } from "../features/library/libraryApi";
import { progressApi } from "../features/progress/progressApi";

const hrefOf = (id, title) => getWorkUrl({ id, title, kind: "anime" });

/** Páginas visíveis no paginador: primeira, última e vizinhas da atual; null = reticências. */
export function pagesAround(page, total) {
  const keep = new Set([0, total - 1, page - 1, page, page + 1]);
  const out = [];
  for (let p = 0; p < total; p++) {
    if (keep.has(p)) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

class HomeLogic extends DCLogic {
  state = { data: null, active: 0, t: 0, paused: false };
  rowRef = React.createRef();
  recentRef = React.createRef();
  DUR = 9000;
  componentDidMount() {
    // Conteúdo real: destaque curado, temporada vigente e episódios recentes (3 fileiras).
    this.recentSize = this.fitRecent();
    this.loadHome();
    // Sinopses do destaque vêm no idioma do site: trocar o idioma recarrega a Home.
    this.offLocale = subscribeLocale(() => this.loadHome());
    this.onResize = () => {
      const size = this.fitRecent();
      if (size !== this.recentSize) {
        this.recentSize = size;
        this.loadRecent(0);
      }
    };
    window.addEventListener("resize", this.onResize);
    this.loadMine();
    this.onPersonal = () => this.loadMine();
    window.addEventListener("nk:personal", this.onPersonal);
    this.timer = setInterval(() => {
      if (this.state.paused || !this.state.data || !this.state.data.hero.length) return;
      const t = this.state.t + 150;
      if (t >= this.DUR) this.setState((s) => ({ t: 0, active: (s.active + 1) % s.data.hero.length }));
      else this.setState({ t });
    }, 150);
  }
  onScroll = (e) => {
    const t = e && e.target && e.target.scrollTop;
    const y = Math.max(
      window.scrollY || 0,
      (document.scrollingElement || {}).scrollTop || 0,
      document.body.scrollTop || 0,
      typeof t === "number" ? t : 0,
    );
    const s = y > 24;
    if (s !== !!this.state.scrolled) this.setState({ scrolled: s });
  };
  /** Continuar assistindo e estado da lista vêm do progresso real da conta. */
  loadMine() {
    if (!session.loggedIn) return;
    Promise.all([progressApi.continueWatching(), libraryApi.list({ size: 100 })])
      .then(([cont, lib]) => this.setState({ cont, lib: lib.items }))
      .catch(() => {});
  }
  /** Colunas que cabem na grade (minmax 260px, gap 16px) × 3 fileiras. */
  fitRecent() {
    const el = this.recentRef.current;
    const width = el ? el.clientWidth : Math.max(260, (window.innerWidth || 1280) - 96);
    return Math.max(1, Math.floor((width + 16) / 276)) * 3;
  }
  loadHome() {
    api.get(`/api/v1/home?lang=${encodeURIComponent(getLocale())}&size=${this.recentSize}`)
      .then((data) => this.setState({ data, recentPage: data.recent }))
      .catch(() => this.setState({ data: { hero: [], season: [], recent: { items: [] } } }));
  }
  loadRecent(page) {
    api.get(`/api/v1/home/recent?page=${page}&size=${this.recentSize}&lang=${encodeURIComponent(getLocale())}`)
      .then((recentPage) => this.setState({ recentPage }))
      .catch(() => {});
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.onResize);
    if (this.offLocale) this.offLocale();
    window.removeEventListener("nk:personal", this.onPersonal);
    clearInterval(this.timer);
    document.removeEventListener("scroll", this.onScroll, { capture: true });
  }
  scroll(dir) {
    const el = this.rowRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  }
  renderVals() {
    const loggedIn = this.props.loggedIn ?? true;
    const d = this.state.data;
    const ready = !!d && !(this.props.loading ?? false);
    const { active, t } = this.state;
    const heroList = d ? d.hero : [];
    const h = heroList[active] || {};
    const lib = this.state.lib || [];
    const mine = loggedIn ? lib.find((x) => x.id === h.id) : null;
    const resumable = !!(mine && mine.hasProgress && !mine.done && mine.status !== "concluido");
    const rp = this.state.recentPage || {};
    return {
      loggedIn,
      guest: !loggedIn,
      ready,
      loading: !ready,
      navH: this.state.scrolled ? "64px" : "76px",
      navBg: this.state.scrolled ? "rgba(23,20,17,.92)" : "linear-gradient(180deg,rgba(15,13,11,.7),rgba(15,13,11,0))",
      navBorder: this.state.scrolled ? "rgba(219,175,87,.12)" : "transparent",
      navBlur: this.state.scrolled ? "blur(14px)" : "none",
      readsOpen: !!this.state.readsOpen,
      openReads: () => this.setState({ readsOpen: true }),
      closeReads: () => this.setState({ readsOpen: false }),
      userOpen: !!this.state.userOpen,
      toggleUser: () => this.setState((s) => ({ userOpen: !s.userOpen })),
      userMenu: ["Minha lista", "Continuar assistindo", "Histórico", "Solicitar obra", "Configurações"],
      pause: () => this.setState({ paused: true }),
      resume: () => this.setState({ paused: false }),
      hero: { ...h, epCount: h.lastEp ? `${h.lastEp} episódios` : "", href: hrefOf(h.id, h.title) },
      ctaLabel: resumable ? `Continuar Ep. ${mine.ep}` : "Ver detalhes",
      ctaPlayable: resumable,
      ctaHref: resumable ? mine.unitHref : hrefOf(h.id, h.title),
      showHeroProgress: resumable && mine.pct > 0,
      heroProgressLabel: resumable ? `Ep. ${mine.ep}${mine.left ? ` · faltam ${mine.left}` : ""}` : "",
      heroPctW: resumable ? `${mine.pct}%` : "0%",
      listMark: mine ? "✓" : "+",
      listTitle: mine ? "Na sua lista · abrir biblioteca" : "Adicionar à minha lista",
      addToList: () => {
        if (!loggedIn) return goLogin();
        if (mine) return (location.href = "/biblioteca");
        libraryApi.setStatus(h.id, "planejado").catch(() => {});
      },
      slides: heroList.map((s, i) => ({
        ...s,
        opacity: i === active ? 1 : 0,
        stripOpacity: i === active ? 1 : 0.6,
        bar: i === active ? `${Math.min(100, (t / this.DUR) * 100)}%` : "0%",
        select: () => this.setState({ active: i, t: 0 }),
      })),
      seasonLabel: (d && d.seasonLabel) || "Outono 2026",
      season: d ? d.season.map((a) => ({ ...a, href: hrefOf(a.id, a.title) })) : [],
      cont: loggedIn ? this.state.cont || [] : [],
      recent: asList(rp.items).map((r) => ({
        ...r,
        href: r.episodeId ? `/player?episode=${r.episodeId}` : hrefOf(r.id, r.title),
        epShort: r.ep.replace("Episódio ", "EP "),
      })),
      recentRef: this.recentRef,
      showPager: (rp.totalPages || 0) > 1,
      pagerLabel: `${(rp.page || 0) + 1} / ${rp.totalPages || 1}`,
      pages: pagesAround(rp.page || 0, rp.totalPages || 0).map((p) =>
        p == null
          ? { label: "…", gap: true }
          : {
              label: String(p + 1),
              on: p === rp.page,
              bg: p === rp.page ? "#DBAF57" : "transparent",
              color: p === rp.page ? "#1A1714" : "#F0EEE9",
              go: () => this.loadRecent(p),
            },
      ),
      prevDisabled: !(rp.page > 0),
      nextDisabled: !((rp.page || 0) + 1 < (rp.totalPages || 0)),
      recentPrev: () => rp.page > 0 && this.loadRecent(rp.page - 1),
      recentNext: () => (rp.page || 0) + 1 < (rp.totalPages || 0) && this.loadRecent((rp.page || 0) + 1),
      rowRef: this.rowRef,
      scrollPrev: () => this.scroll(-1),
      scrollNext: () => this.scroll(1),
      skel7: [1, 2, 3, 4, 5, 6, 7],
      skel4: [1, 2, 3, 4],
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
    text: "\nbody{margin:0;background:#171411;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\n.nk-row::-webkit-scrollbar{display:none}\n",
  },
];

function render(v) {
  return (
    <>
      <div style={{ minHeight: "100vh", background: "#171411", display: "flex", flexDirection: "column" }}>
        <Header
          active="inicio"
          loggedIn={v.loggedIn}
          __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
        />
        <header
          className="nk-home-hero"
          style={{
            position: "relative",
            minHeight: "640px",
            overflow: "hidden",
            background: "#0F0D0B",
            display: "flex",
            flexDirection: "column",
            padding: "150px 48px 28px",
          }}
          onMouseEnter={v.pause}
          onMouseLeave={v.resume}
        >
          {asList(v.slides).map((s, $index) => (
            <React.Fragment key={$index}>
              <img
                src={s?.banner}
                alt=""
                style={{
                  position: "absolute",
                  inset: "0",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center 30%",
                  opacity: `${s?.opacity ?? ""}`,
                  transition: "opacity .9s ease",
                }}
              />
            </React.Fragment>
          ))}
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(90deg,#171411 0%,rgba(23,20,17,.88) 30%,rgba(23,20,17,.25) 62%,rgba(23,20,17,0) 80%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(0deg,#171411 0%,rgba(23,20,17,.6) 22%,rgba(23,20,17,0) 50%,rgba(23,20,17,.55) 100%)",
            }}
          />
          {v.ready ? (
            <>
              <div
                style={{
                  position: "relative",
                  maxWidth: "600px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "18px",
                  zIndex: "2",
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
                <h1
                  style={{
                    margin: "0",
                    fontFamily: "'Cormorant Garamond',serif",
                    fontWeight: "500",
                    fontSize: "clamp(44px,5vw,64px)",
                    lineHeight: "1",
                    letterSpacing: "-.01em",
                    textWrap: "balance",
                    display: "-webkit-box",
                    WebkitLineClamp: "2",
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    paddingBottom: "4px",
                    textShadow: "0 2px 24px rgba(0,0,0,.4)",
                  }}
                >
                  {txt(v.hero?.title)}
                </h1>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "12px",
                    alignItems: "center",
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: "12px",
                    letterSpacing: ".14em",
                    textTransform: "uppercase",
                    color: "rgba(240,238,233,.85)",
                  }}
                >
                  <span style={{ color: "#DBAF57" }}>
                    {"★ "}
                    {txt(v.hero?.score)}
                  </span>
                  <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                  <span>{txt(v.hero?.genres)}</span>
                  <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                  <span>{txt(v.hero?.studio)}</span>
                  <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                  <span>{txt(v.hero?.epCount)}</span>
                </div>
                <p
                  style={{
                    margin: "0",
                    fontSize: "16px",
                    lineHeight: "1.65",
                    color: "rgba(240,238,233,.88)",
                    textWrap: "pretty",
                  }}
                >
                  {txt(v.hero?.synopsis)}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginTop: "6px" }}>
                  <a
                    className="nk-hover-1uijps0"
                    href={v.ctaHref}
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
                    {v.ctaPlayable ? (
                      <span
                        style={{
                          width: "0",
                          height: "0",
                          borderLeft: "10px solid #1A1714",
                          borderTop: "6px solid transparent",
                          borderBottom: "6px solid transparent",
                        }}
                      />
                    ) : null}
                    {txt(v.ctaLabel)}
                  </a>
                  <a
                    className="nk-hover-1rcmvu"
                    href={v.hero?.href}
                    style={{
                      height: "48px",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 24px",
                      borderRadius: "999px",
                      border: "1px solid rgba(240,238,233,.25)",
                      background: "rgba(23,20,17,.35)",
                      color: "#F0EEE9",
                      fontSize: "15px",
                    }}
                  >
                    Ver detalhes
                  </a>
                  <span
                    title={v.listTitle}
                    onClick={v.addToList}
                    style={{
                      width: "48px",
                      height: "48px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "50%",
                      border: "1px solid rgba(240,238,233,.25)",
                      background: "rgba(23,20,17,.35)",
                      fontSize: "22px",
                      fontWeight: "300",
                      cursor: "pointer",
                    }}
                  >
                    {txt(v.listMark)}
                  </span>
                </div>
                {v.showHeroProgress ? (
                  <>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px", color: "#B7B1A4" }}
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
                        <span
                          style={{
                            display: "block",
                            width: `${v.heroPctW ?? ""}`,
                            height: "100%",
                            background: "#DBAF57",
                          }}
                        />
                      </span>
                      {txt(v.heroProgressLabel)}
                    </div>
                  </>
                ) : null}
              </div>
              <div
                className="nk-home-strip"
                style={{
                  position: "relative",
                  marginTop: "auto",
                  paddingTop: "40px",
                  display: "grid",
                  gridTemplateColumns: "repeat(5,minmax(0,1fr))",
                  gap: "16px",
                  zIndex: "2",
                }}
              >
                {asList(v.slides).map((s, $index) => (
                  <React.Fragment key={$index}>
                    <button
                      className="nk-hover-1n7sm2x"
                      onClick={s?.select}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        opacity: `${s?.stripOpacity ?? ""}`,
                        transition: "opacity .3s",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          height: "2px",
                          background: "rgba(240,238,233,.18)",
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{ display: "block", height: "100%", width: `${s?.bar ?? ""}`, background: "#DBAF57" }}
                        />
                      </span>
                      <span style={{ display: "flex", gap: "12px", alignItems: "center", minWidth: "0" }}>
                        <img
                          src={s?.banner}
                          alt=""
                          style={{
                            width: "76px",
                            height: "44px",
                            borderRadius: "6px",
                            objectFit: "cover",
                            flexShrink: "0",
                            border: "1px solid rgba(240,238,233,.1)",
                          }}
                        />
                        <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: "500",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {txt(s?.title)}
                          </span>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(s?.genres)}</span>
                        </span>
                      </span>
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </>
          ) : null}
        </header>
        <main
          className="nk-main"
          style={{ padding: "24px 48px 72px", display: "flex", flexDirection: "column", gap: "64px" }}
        >
          {v.loading ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <span
                  style={{
                    display: "block",
                    width: "300px",
                    height: "30px",
                    borderRadius: "6px",
                    background: "#221F1B",
                  }}
                />
                <div
                  className="nk-grid-2"
                  style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: "16px" }}
                >
                  {asList(v.skel7).map((k, $index) => (
                    <React.Fragment key={$index}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <span
                          style={{ display: "block", aspectRatio: "2/3", borderRadius: "10px", background: "#221F1B" }}
                        />
                        <span
                          style={{
                            display: "block",
                            width: "80%",
                            height: "12px",
                            borderRadius: "4px",
                            background: "#221F1B",
                          }}
                        />
                        <span
                          style={{
                            display: "block",
                            width: "50%",
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
                    width: "240px",
                    height: "30px",
                    borderRadius: "6px",
                    background: "#221F1B",
                    marginTop: "40px",
                  }}
                />
                <div
                  className="nk-grid-2"
                  style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "16px" }}
                >
                  {asList(v.skel4).map((k, $index) => (
                    <React.Fragment key={$index}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <span
                          style={{ display: "block", aspectRatio: "16/9", borderRadius: "10px", background: "#221F1B" }}
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
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {v.ready ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "64px" }}>
                <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div
                    style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "11px",
                          letterSpacing: ".24em",
                          textTransform: "uppercase",
                          color: "#DBAF57",
                        }}
                      >
                        {txt(v.seasonLabel)}
                      </span>
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "36px",
                          lineHeight: "1.05",
                        }}
                      >
                        Novidades da temporada
                      </h2>
                    </div>
                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                      <a href="/explorar" style={{ fontSize: "14px" }}>
                        Ver todos →
                      </a>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="nk-hover-tdhed"
                          onClick={v.scrollPrev}
                          aria-label="Anterior"
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            width: "38px",
                            height: "38px",
                            borderRadius: "50%",
                            border: "1px solid rgba(219,175,87,.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#F0EEE9",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="m15 18-6-6 6-6" />
                          </svg>
                        </button>
                        <button
                          className="nk-hover-tdhed"
                          onClick={v.scrollNext}
                          aria-label="Próximo"
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            width: "38px",
                            height: "38px",
                            borderRadius: "50%",
                            border: "1px solid rgba(219,175,87,.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#F0EEE9",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div
                    className="nk-row"
                    ref={v.rowRef}
                    style={{
                      display: "grid",
                      gridAutoFlow: "column",
                      gridAutoColumns: "calc((100% - 96px) / 7)",
                      gap: "16px",
                      overflowX: "auto",
                      scrollSnapType: "x mandatory",
                      scrollBehavior: "smooth",
                      scrollbarWidth: "none",
                    }}
                  >
                    {asList(v.season).map((a, $index) => (
                      <React.Fragment key={$index}>
                        <a
                          className="nk-hover-1d5grei"
                          href={a?.href}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            color: "#F0EEE9",
                            scrollSnapAlign: "start",
                            minWidth: "0",
                          }}
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
                              alt={a?.title}
                              loading="lazy"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />{" "}
                            {a?.score ? (
                              <>
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
                                </span>
                              </>
                            ) : null}{" "}
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
                            <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(a?.meta)}</span>
                          </span>
                        </a>
                      </React.Fragment>
                    ))}
                  </div>
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
                          Continuar assistindo
                        </h2>
                        <a href="/historico" style={{ fontSize: "14px" }}>
                          Ver histórico →
                        </a>
                      </div>
                      <div
                        className="nk-grid-1"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
                          gap: "16px",
                        }}
                      >
                        {asList(v.cont).map((c, $index) => (
                          <React.Fragment key={$index}>
                            <a
                              className="nk-hover-1d5grei"
                              href={c?.href}
                              style={{ display: "flex", flexDirection: "column", gap: "10px", color: "#F0EEE9" }}
                            >
                              <span
                                style={{
                                  position: "relative",
                                  display: "block",
                                  aspectRatio: "16/9",
                                  borderRadius: "10px",
                                  overflow: "hidden",
                                  background: "#221F1B",
                                  border: "1px solid rgba(240,238,233,.06)",
                                }}
                              >
                                {" "}
                                <img
                                  src={c?.thumb}
                                  alt=""
                                  loading="lazy"
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />{" "}
                                <span
                                  style={{
                                    position: "absolute",
                                    inset: "0",
                                    background: "linear-gradient(0deg,rgba(23,20,17,.7),rgba(23,20,17,0) 55%)",
                                  }}
                                />{" "}
                                <span
                                  style={{
                                    position: "absolute",
                                    left: "50%",
                                    top: "50%",
                                    width: "44px",
                                    height: "44px",
                                    margin: "-22px 0 0 -22px",
                                    borderRadius: "50%",
                                    background: "rgba(23,20,17,.7)",
                                    border: "1px solid rgba(219,175,87,.5)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: "0",
                                      height: "0",
                                      marginLeft: "3px",
                                      borderLeft: "11px solid #DBAF57",
                                      borderTop: "7px solid transparent",
                                      borderBottom: "7px solid transparent",
                                    }}
                                  />
                                </span>{" "}
                                <span
                                  style={{
                                    position: "absolute",
                                    right: "10px",
                                    bottom: "12px",
                                    fontFamily: "'JetBrains Mono',monospace",
                                    fontSize: "11px",
                                    color: "#F0EEE9",
                                  }}
                                >
                                  {"faltam "}
                                  {txt(c?.left)}
                                </span>{" "}
                                <span
                                  style={{
                                    position: "absolute",
                                    left: "0",
                                    right: "0",
                                    bottom: "0",
                                    height: "3px",
                                    background: "rgba(240,238,233,.18)",
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
                              </span>
                              <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
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
                                <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(c?.ep)}</span>
                              </span>
                            </a>
                          </React.Fragment>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}
                <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div
                    style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "24px" }}
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
                      Episódios recentes
                    </h2>
                    <a href="/calendario" style={{ fontSize: "14px" }}>
                      Ver todos →
                    </a>
                  </div>
                  <div
                    className="nk-grid-1"
                    ref={v.recentRef}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
                      gap: "28px 16px",
                    }}
                  >
                    {asList(v.recent).map((r, $index) => (
                      <React.Fragment key={$index}>
                        <a
                          className="nk-hover-1d5grei"
                          href={r?.href}
                          style={{ display: "flex", flexDirection: "column", gap: "10px", color: "#F0EEE9" }}
                        >
                          <span
                            style={{
                              position: "relative",
                              display: "block",
                              aspectRatio: "16/9",
                              borderRadius: "10px",
                              overflow: "hidden",
                              background: "#221F1B",
                              border: "1px solid rgba(240,238,233,.06)",
                            }}
                          >
                            {" "}
                            <img
                              src={r?.thumb}
                              alt=""
                              loading="lazy"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                objectPosition: "center 25%",
                                display: "block",
                              }}
                            />{" "}
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
                                    fontSize: "10px",
                                    fontWeight: "600",
                                    letterSpacing: ".16em",
                                    background: "rgba(23,20,17,.88)",
                                    color: "#DBAF57",
                                    padding: "5px 8px",
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
                                fontSize: "10px",
                                letterSpacing: ".08em",
                                background: "rgba(23,20,17,.88)",
                                color: "#F0EEE9",
                                padding: "4px 7px",
                                borderRadius: "4px",
                              }}
                            >
                              {txt(r?.lang)}
                            </span>{" "}
                            <span
                              style={{
                                position: "absolute",
                                left: "10px",
                                bottom: "10px",
                                fontFamily: "'JetBrains Mono',monospace",
                                fontSize: "11px",
                                fontWeight: "500",
                                background: "rgba(23,20,17,.88)",
                                color: "#F0EEE9",
                                padding: "4px 8px",
                                borderRadius: "4px",
                              }}
                            >
                              {txt(r?.epShort)}
                            </span>{" "}
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
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
                            <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                              {txt(r?.ep)}
                              {" · "}
                              {txt(r?.when)}
                            </span>
                          </span>
                        </a>
                      </React.Fragment>
                    ))}
                  </div>
                  {v.showPager ? (
                    <nav
                      aria-label="Páginas de episódios recentes"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "8px" }}
                    >
                      <button
                        className="nk-hover-tdhed"
                        onClick={v.recentPrev}
                        disabled={v.prevDisabled}
                        aria-label="Página anterior"
                        style={{
                          all: "unset",
                          cursor: v.prevDisabled ? "default" : "pointer",
                          opacity: v.prevDisabled ? 0.35 : 1,
                          width: "38px",
                          height: "38px",
                          borderRadius: "50%",
                          border: "1px solid rgba(219,175,87,.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#F0EEE9",
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                      </button>
                      {asList(v.pages).map((p, $index) =>
                        p?.gap ? (
                          <span key={$index} style={{ color: "#8F897D", padding: "0 4px" }}>
                            …
                          </span>
                        ) : (
                          <button
                            key={$index}
                            onClick={p?.go}
                            aria-current={p?.on ? "page" : undefined}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              minWidth: "38px",
                              height: "38px",
                              borderRadius: "999px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: "13px",
                              background: `${p?.bg ?? ""}`,
                              color: `${p?.color ?? ""}`,
                            }}
                          >
                            {txt(p?.label)}
                          </button>
                        ),
                      )}
                      <button
                        className="nk-hover-tdhed"
                        onClick={v.recentNext}
                        disabled={v.nextDisabled}
                        aria-label="Próxima página"
                        style={{
                          all: "unset",
                          cursor: v.nextDisabled ? "default" : "pointer",
                          opacity: v.nextDisabled ? 0.35 : 1,
                          width: "38px",
                          height: "38px",
                          borderRadius: "50%",
                          border: "1px solid rgba(219,175,87,.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#F0EEE9",
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    </nav>
                  ) : null}
                </section>
              </div>
            </>
          ) : null}
        </main>
        <Footer />
      </div>
    </>
  );
}

export const defaults = { loggedIn: true, loading: false };

export default defineDC("Home Nekoflow v2", HomeLogic, render, { helmet });
