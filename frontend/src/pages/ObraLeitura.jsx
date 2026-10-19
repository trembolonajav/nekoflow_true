// Origem: design/claude-design/ObraLeitura.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css, val } from "../dc/runtime";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { session, goLogin } from "../lib/session";
import { libraryApi } from "../features/library/libraryApi";
import { canonicalWorks, getUnitUrl, getWorkUrl } from "../features/catalog/workNavigation";

const WORK_ID = 105398;
const STATUS_CODE = {
  Lendo: "andamento",
  Planejado: "planejado",
  Concluído: "concluido",
  Pausado: "pausado",
  Abandonado: "abandonado",
};
const STATUS_LABEL = Object.fromEntries(Object.entries(STATUS_CODE).map(([k, v]) => [v, k]));

class ObraLeituraLogic extends DCLogic {
  state = {
    d: null,
    active: "caps",
    lang: "pt",
    asc: false,
    range: "all",
    hideRead: false,
    limit: 30,
    jump: "",
    hl: null,
    status: null,
    follow: false,
    me: null,
    listOpen: false,
    synOpen: false,
    mapOpen: false,
    mini: false,
    narrow: false,
    toast: null,
  };
  navRef = React.createRef();
  chRefs = {};
  TOTAL = 200;
  MAIN_END = 179;
  // Progresso real do leitor (mesma fonte do Leitor e da Biblioteca).
  get units() {
    return (this.state.me && this.state.me.units) || {};
  }
  get READ_TO() {
    const done = Object.keys(this.units)
      .map(Number)
      .filter((n) => this.units[n].done);
    return done.length ? Math.max(...done) : -1;
  }
  get CUR() {
    const me = this.state.me;
    return me && Object.keys(this.units).length && !me.upToDate ? me.resumeUnit : -1;
  }
  get CUR_PCT() {
    const u = this.units[this.CUR];
    return u ? Math.round(u.pct || 0) : 0;
  }
  loadMe() {
    if (!session.loggedIn) return;
    api
      .get(`/api/me/works/${WORK_ID}`)
      .then((me) => {
        this.setState({ me, status: me.status ? STATUS_LABEL[me.status] : null, follow: me.follow });
        window.dispatchEvent(new Event("nk:personal"));
      })
      .catch(() => {});
  }
  save(req, msg) {
    return req
      .then(() => {
        this.loadMe();
        this.flash(msg);
      })
      .catch(() => this.flash("Não foi possível salvar. Tente novamente."));
  }
  scrollY() {
    return Math.max(window.scrollY || 0, (document.scrollingElement || {}).scrollTop || 0);
  }
  scrollTo(y) {
    const se = document.scrollingElement || document.documentElement;
    try {
      window.scrollTo({ top: y, behavior: "smooth" });
      se.scrollTo({ top: y, behavior: "smooth" });
    } catch (e) {
      se.scrollTop = y;
    }
  }
  onScroll = () => {
    const n = this.navRef.current;
    const mini = n ? n.getBoundingClientRect().top <= 66 : false;
    if (mini !== this.state.mini) this.setState({ mini });
  };
  onResize = () => {
    const n = window.innerWidth < 760;
    if (n !== this.state.narrow) this.setState({ narrow: n });
  };
  onDown = (e) => {
    if (this.state.listOpen && !(e.target.closest && e.target.closest("[data-nk-menu]")))
      this.setState({ listOpen: false });
  };
  componentDidMount() {
    const a = new URLSearchParams(location.search).get("aba");
    if (["caps", "sobre", "adapt", "chars"].includes(a)) this.setState({ active: a });
    api.get("/api/content/leitura-obra")
      .then((d) => this.setState({ d }));
    this.loadMe();
    document.addEventListener("scroll", this.onScroll, { passive: true, capture: true });
    window.addEventListener("resize", this.onResize);
    document.addEventListener("mousedown", this.onDown);
    this.onResize();
  }
  componentWillUnmount() {
    document.removeEventListener("scroll", this.onScroll, { capture: true });
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("mousedown", this.onDown);
  }
  setTab(k) {
    this.setState({ active: k });
    try {
      history.replaceState(null, "", k === "caps" ? location.pathname : `?aba=${k}`);
    } catch (e) {}
    const n = this.navRef.current;
    if (n && n.getBoundingClientRect().top <= 66 && n.previousElementSibling)
      this.scrollTo(n.previousElementSibling.getBoundingClientRect().bottom + this.scrollY() - 64);
  }
  flash(t) {
    clearTimeout(this.tt);
    this.setState({ toast: t });
    this.tt = setTimeout(() => this.setState({ toast: null }), 2200);
  }
  ref(n) {
    if (!this.chRefs[n]) this.chRefs[n] = React.createRef();
    return this.chRefs[n];
  }
  renderVals() {
    const s = this.state;
    const d = s.d;
    const loggedIn = session.loggedIn;
    const bg = (u) => (u ? `url("${u}")` : "none");
    const RANGES = [
      ["all", "Todos", "201"],
      ["0-49", "0–49", ""],
      ["50-99", "50–99", ""],
      ["100-149", "100–149", ""],
      ["150-179", "150–179", ""],
      ["side", "Histórias paralelas", "21"],
    ];
    const inRange = (n) => {
      if (s.range === "all") return true;
      if (s.range === "side") return n > this.MAIN_END;
      const [a, b] = s.range.split("-").map(Number);
      return n >= a && n <= b;
    };
    const pt = s.lang === "pt";
    const all = [];
    for (let n = 0; n <= this.TOTAL; n++) all.push(n);
    let list = all.filter((n) => inRange(n) && !(loggedIn && s.hideRead && n <= this.READ_TO));
    if (!s.asc) list.reverse();
    const filtered = list.length;
    list = list.slice(0, s.limit);
    const chapters = list.map((n) => {
      const side = n > this.MAIN_END;
      const available = !(pt && n >= 196);
      const done = loggedIn && n <= this.READ_TO;
      const cur = loggedIn && n === this.CUR;
      const label = n === 0 ? "Prólogo" : side ? `História paralela ${n - this.MAIN_END}` : `Capítulo ${n}`;
      const hl = s.hl === n;
      return {
        n,
        ref: this.ref(n),
        href: getUnitUrl({ id: WORK_ID, kind: "manhwa" }, n),
        numLabel: n === 0 ? "0" : String(n),
        title: label,
        isSide: side,
        meta: available
          ? `${side ? `Cap. ${n} · ` : ""}${pt ? "Português" : "Inglês"} · vertical${n === this.TOTAL ? " · capítulo final" : ""}`
          : "Disponível em inglês",
        available,
        unavailable: !available,
        done,
        hasPct: cur && available,
        pctW: `${this.CUR_PCT}%`,
        cta: cur ? "Continuar" : done ? "Lido" : "Ler",
        aria: `${label}: ${cur ? "continuar" : done ? "reler" : "ler"}`,
        ctaBg: cur ? "#DBAF57" : "transparent",
        ctaColor: cur ? "#1A1714" : done ? "#B7B1A4" : "#F0EEE9",
        ctaBorder: cur ? "#DBAF57" : done ? "rgba(240,238,233,.1)" : "rgba(240,238,233,.22)",
        bg: hl ? "rgba(219,175,87,.14)" : cur ? "rgba(219,175,87,.07)" : "#1A1714",
        border: hl || cur ? "rgba(219,175,87,.5)" : "rgba(240,238,233,.06)",
        numColor: cur ? "#DBAF57" : done ? "#8F897D" : "#F0EEE9",
        opacity: available ? (done ? 0.78 : 1) : 0.5,
      };
    });
    const chip = (on) => ({
      bg: on ? "rgba(219,175,87,.14)" : "transparent",
      border: on ? "#DBAF57" : "rgba(240,238,233,.14)",
      color: on ? "#DBAF57" : "#F0EEE9",
    });
    const pill = (on) => ({ bg: on ? "#DBAF57" : "transparent", color: on ? "#1A1714" : "#F0EEE9" });
    const STATUS = ["Lendo", "Planejado", "Concluído", "Pausado", "Abandonado"];
    const inList = loggedIn && !!s.status;
    const need = () => {
      if (!loggedIn) {
        goLogin();
        return true;
      }
      return false;
    };
    const reading = loggedIn && this.CUR >= 0;
    const ctaLabel = reading ? `Continuar capítulo ${this.CUR}` : "Começar leitura";
    const jumpN = parseInt(s.jump, 10);
    const jumpOk = jumpN >= 0 && jumpN <= this.TOTAL;
    const TABS = [
      ["caps", "Capítulos", 201],
      ["sobre", "Sobre", null],
      ["adapt", "Adaptações", d ? d.related.length + 1 : null],
      ["chars", "Personagens", d ? d.chars.length : null],
    ];
    return {
      loggedIn,
      narrow: s.narrow,
      d: d || { native: "", score: "", synopsisShort: "" },
      bannerBg: bg(d && d.banner),
      coverBg: bg(d && d.cover),
      genresText: d ? d.genres.join(" · ") : "",
      curTitle: `Capítulo ${this.CUR}`,
      curPctW: `${this.CUR_PCT}%`,
      curMeta: `${this.CUR_PCT}% lido${this.CUR === 111 ? " · logo após o fim da 2ª temporada do anime" : ""}`,
      ctaHref: getUnitUrl({ id: WORK_ID, kind: "manhwa" }, reading ? this.CUR : 0),
      ctaLabel,
      ctaShort: reading ? `Continuar cap. ${this.CUR}` : "Começar leitura",
      overallPct: `${Math.round(((this.READ_TO + 1) / 201) * 100)}%`,
      progressText: reading
        ? `${this.READ_TO + 1} de 201 capítulos lidos · no capítulo ${this.CUR}`
        : `${this.READ_TO + 1} de 201 capítulos lidos`,
      listLabel: inList ? s.status : "Minha lista",
      listFill: inList ? "#DBAF57" : "none",
      listBorder: inList ? "rgba(219,175,87,.6)" : "rgba(240,238,233,.25)",
      listOpen: s.listOpen && loggedIn,
      toggleList: () => {
        if (need()) return;
        this.setState({ listOpen: !s.listOpen });
      },
      statusOpts: STATUS.map((l) => ({
        label: l,
        on: s.status === l,
        color: s.status === l ? "#DBAF57" : "#F0EEE9",
        pick: () => {
          this.setState({ status: l, listOpen: false });
          this.save(libraryApi.setStatus(WORK_ID, STATUS_CODE[l]), `Salvo como ${l}`);
        },
      })),
      inList,
      removeList: () => {
        this.setState({ status: null, listOpen: false });
        this.save(libraryApi.remove(WORK_ID), "Removido da sua lista · avisos mantidos");
      },
      followLabel: loggedIn && s.follow ? "Acompanhando" : "Acompanhar",
      followFill: loggedIn && s.follow ? "#DBAF57" : "none",
      followColor: loggedIn && s.follow ? "#DBAF57" : "#F0EEE9",
      followBorder: loggedIn && s.follow ? "rgba(219,175,87,.6)" : "rgba(240,238,233,.25)",
      followBg: loggedIn && s.follow ? "rgba(219,175,87,.08)" : "rgba(23,20,17,.45)",
      toggleFollow: () => {
        if (need()) return;
        this.setState({ follow: !s.follow });
        this.save(
          libraryApi.follow(WORK_ID, !s.follow),
          s.follow
            ? "Avisos de novos capítulos desligados"
            : "Você será avisado sobre novos capítulos e histórias paralelas",
        );
      },
      share: () => {
        try {
          navigator.clipboard.writeText(location.href);
        } catch (e) {}
        this.flash("Link copiado");
      },
      navRef: this.navRef,
      showMini: s.mini && !s.narrow,
      tabs: TABS.map(([k, label, count]) => ({
        label,
        count,
        hasCount: count != null,
        sel: String(s.active === k),
        color: s.active === k ? "#DBAF57" : "#B7B1A4",
        line: s.active === k ? "#DBAF57" : "transparent",
        go: () => this.setTab(k),
      })),
      p: {
        caps: s.active === "caps",
        sobre: s.active === "sobre",
        adapt: s.active === "adapt",
        chars: s.active === "chars",
      },
      showContinue: reading && s.range === "all" && !s.hl,
      capsInfo: `${filtered} ${filtered === 1 ? "capítulo" : "capítulos"} · ${pt ? "Português (Brasil)" : "Inglês"} · rolagem vertical`,
      jumpVal: s.jump,
      onJump: (e) => this.setState({ jump: e.target.value }),
      jumpBg: jumpOk ? "#DBAF57" : "#4A443D",
      jump: (e) => {
        e.preventDefault();
        if (!jumpOk) return;
        const n = jumpN;
        const r =
          n > this.MAIN_END
            ? "side"
            : RANGES.slice(1, 5).find(([k]) => {
                const [a, b] = k.split("-").map(Number);
                return n >= a && n <= b;
              })[0];
        this.setState({ range: r, hideRead: false, limit: 60, hl: n, jump: "" });
        setTimeout(() => {
          const el = this.chRefs[n] && this.chRefs[n].current;
          if (el) this.scrollTo(el.getBoundingClientRect().top + this.scrollY() - 200);
        }, 60);
        clearTimeout(this.ht);
        this.ht = setTimeout(() => this.setState({ hl: null }), 2600);
      },
      langTabs: [
        ["pt", "Português"],
        ["en", "Inglês"],
      ].map(([k, l]) => ({ label: l, ...pill(s.lang === k), pick: () => this.setState({ lang: k }) })),
      langNote: pt && (s.range === "all" || s.range === "side"),
      toggleSort: () => this.setState({ asc: !s.asc, limit: 30 }),
      sortLabel: s.asc ? "Do início" : "Mais recentes",
      ranges: RANGES.map(([k, l, sub]) => ({
        label: l,
        sub,
        ...chip(s.range === k),
        pick: () => this.setState({ range: k, limit: 30, hl: null }),
      })),
      toggleHideRead: () => this.setState({ hideRead: !s.hideRead, limit: 30 }),
      hrTrack: s.hideRead ? "#DBAF57" : "#2D2924",
      hrKnob: s.hideRead ? "#1A1714" : "#B7B1A4",
      hrX: s.hideRead ? "19px" : "3px",
      chapters,
      hasMore: filtered > s.limit,
      remaining: Math.max(0, filtered - s.limit),
      more: () => this.setState({ limit: s.limit + 30 }),
      capsEmpty: filtered === 0,
      clearCapFilters: () => this.setState({ range: "all", hideRead: false }),
      synopsis: d ? (s.synOpen ? d.synopsis : [d.synopsis[0]]) : [],
      synLabel: s.synOpen ? "Mostrar menos" : "Ler mais",
      toggleSyn: () => this.setState({ synOpen: !s.synOpen }),
      people: d ? d.people.map(([role, name]) => ({ role, name, initial: name[0] })) : [],
      genreTags: d ? d.genres : [],
      themeTags: d ? d.themes : [],
      altText: d ? d.alt.join(" · ") : "",
      ficha: d ? d.ficha.map(([k, v]) => ({ k, v })) : [],
      animeBannerBg: bg(d && d.anime.banner),
      animeCoverBg: bg(d && d.anime.cover),
      animeMeta: d ? d.anime.meta : "",
      mapHidden: !s.mapOpen,
      mapShown: s.mapOpen,
      showMap: () => this.setState({ mapOpen: true }),
      animeMap: d ? d.anime.map : [],
      related: d ? d.related.map((r) => ({ ...r, hasCover: !!r.cover, noCover: !r.cover, bg: bg(r.cover) })) : [],
      chars: d
        ? d.chars.map((c) => ({
            ...c,
            bg: bg(c.img),
            border: c.role === "Protagonista" ? "rgba(219,175,87,.5)" : "rgba(240,238,233,.06)",
            roleColor: c.role === "Protagonista" ? "#DBAF57" : "#B7B1A4",
          }))
        : [],
      recs: d ? d.recs.map((r) => ({ ...r, bg: bg(r.cover), href: getWorkUrl({ ...r, kind: "manhwa" }) })) : [],
      toast: !!s.toast,
      toastText: s.toast || "",
      toastBottom: s.narrow ? "92px" : "28px",
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
    text: "\nbody{margin:0;background:#171411;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\ninput::placeholder{color:#8F897D}\ninput[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}\n",
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
        <header
          style={{
            position: "relative",
            minHeight: "600px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "140px 48px 44px",
            overflow: "hidden",
            background: "#0F0D0B",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: "0",
              backgroundImage: `${v.bannerBg ?? ""}`,
              backgroundSize: "cover",
              backgroundPosition: "center 30%",
              filter: "saturate(.85)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(90deg,#171411 0%,rgba(23,20,17,.92) 36%,rgba(23,20,17,.45) 70%,rgba(23,20,17,.2) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(0deg,#171411 0%,rgba(23,20,17,.4) 35%,rgba(23,20,17,0) 60%,rgba(23,20,17,.6) 100%)",
            }}
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: "28px 40px",
              maxWidth: "1120px",
            }}
          >
            <span
              role="img"
              aria-label="Capa do manhwa Solo Leveling"
              style={{
                width: "clamp(170px,17vw,250px)",
                aspectRatio: "2/3",
                backgroundColor: "#221F1B",
                backgroundImage: `${v.coverBg ?? ""}`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: "12px",
                border: "1px solid rgba(219,175,87,.4)",
                boxShadow: "0 30px 60px rgba(0,0,0,.6)",
                flexShrink: "0",
                display: "block",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: "1 1 420px", minWidth: "0" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <span
                  style={{
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    borderRadius: "999px",
                    whiteSpace: "nowrap",
                    flexShrink: "0",
                    background: "#DBAF57",
                    color: "#1A1714",
                    fontSize: "11px",
                    fontWeight: "700",
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                  }}
                >
                  Manhwa
                </span>
                <span
                  style={{
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    borderRadius: "999px",
                    whiteSpace: "nowrap",
                    flexShrink: "0",
                    border: "1px solid rgba(219,175,87,.5)",
                    color: "#DBAF57",
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                  }}
                >
                  Webtoon · vertical
                </span>
                <span
                  style={{
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    borderRadius: "999px",
                    whiteSpace: "nowrap",
                    flexShrink: "0",
                    border: "1px solid rgba(240,238,233,.25)",
                    color: "#D9D5CC",
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                  }}
                >
                  Concluído
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <h1
                  style={{
                    margin: "0",
                    fontFamily: "'Cormorant Garamond',serif",
                    fontWeight: "500",
                    fontSize: "clamp(46px,5.4vw,76px)",
                    lineHeight: ".98",
                    letterSpacing: "-.01em",
                  }}
                >
                  Solo Leveling
                </h1>
                <span style={{ fontSize: "15px", color: "rgba(240,238,233,.7)" }}>{txt(v.d?.native)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px 14px",
                  alignItems: "center",
                  fontSize: "13px",
                  color: "rgba(240,238,233,.88)",
                }}
              >
                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#DBAF57" }}>
                  {"★ "}
                  {txt(v.d?.score)} <span style={{ color: "#B7B1A4" }}>no AniList</span>
                </span>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                <span>{txt(v.genresText)}</span>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                <span>Chugong · Jang Seong-rak</span>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                <span>201 capítulos</span>
              </div>
              <p
                style={{
                  margin: "0",
                  maxWidth: "640px",
                  fontSize: "16px",
                  lineHeight: "1.6",
                  color: "rgba(240,238,233,.88)",
                  textWrap: "pretty",
                }}
              >
                {txt(v.d?.synopsisShort)}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginTop: "4px" }}>
                <a
                  className="nk-hover-1uijps0"
                  href={v.ctaHref}
                  style={{
                    height: "50px",
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
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
                  </svg>
                  {txt(v.ctaLabel)}
                </a>
                <div data-nk-menu="1" style={{ position: "relative" }}>
                  {" "}
                  <button
                    className="nk-hover-ucdklh"
                    onClick={v.toggleList}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      height: "50px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "0 20px",
                      borderRadius: "999px",
                      border: `1px solid ${v.listBorder ?? ""}`,
                      background: "rgba(23,20,17,.45)",
                      fontSize: "15px",
                      color: "#F0EEE9",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill={v.listFill}
                      stroke="#DBAF57"
                      strokeWidth="1.8"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {txt(v.listLabel)}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>{" "}
                  {v.listOpen ? (
                    <>
                      {" "}
                      <div
                        style={{
                          position: "absolute",
                          left: "0",
                          top: "calc(100% + 10px)",
                          zIndex: "20",
                          width: "240px",
                          background: "#1A1714",
                          border: "1px solid rgba(219,175,87,.25)",
                          borderRadius: "12px",
                          padding: "8px",
                          boxShadow: "0 20px 44px rgba(0,0,0,.55)",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: "600",
                            letterSpacing: ".22em",
                            textTransform: "uppercase",
                            color: "#8F897D",
                            padding: "8px 10px 4px",
                          }}
                        >
                          Situação na sua lista
                        </span>
                        {asList(v.statusOpts).map((o, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              className="nk-hover-zuhwcw"
                              onClick={o?.pick}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "9px 10px",
                                borderRadius: "8px",
                                fontSize: "14px",
                                color: `${o?.color ?? ""}`,
                              }}
                            >
                              {txt(o?.label)}
                              {o?.on ? (
                                <>
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#DBAF57"
                                    strokeWidth="2.6"
                                  >
                                    <path d="M5 12l5 5 9-10" />
                                  </svg>
                                </>
                              ) : null}
                            </button>
                          </React.Fragment>
                        ))}
                        {v.inList ? (
                          <>
                            <span style={{ height: "1px", background: "rgba(240,238,233,.08)", margin: "6px 4px" }} />
                            <button
                              className="nk-hover-zuhwcw"
                              onClick={v.removeList}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                padding: "9px 10px",
                                borderRadius: "8px",
                                fontSize: "14px",
                                color: "#E08A7A",
                              }}
                            >
                              Remover da lista
                            </button>
                          </>
                        ) : null}
                      </div>{" "}
                    </>
                  ) : null}{" "}
                </div>
                <button
                  className="nk-hover-ucdklh"
                  onClick={v.toggleFollow}
                  title="Avisos de novos capítulos"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    height: "50px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "0 20px",
                    borderRadius: "999px",
                    border: `1px solid ${v.followBorder ?? ""}`,
                    background: `${v.followBg ?? ""}`,
                    fontSize: "15px",
                    color: `${v.followColor ?? ""}`,
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={v.followFill}
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" fill="none" />
                  </svg>
                  {txt(v.followLabel)}
                </button>
                <button
                  className="nk-hover-tdhed"
                  onClick={v.share}
                  aria-label="Compartilhar"
                  title="Copiar link"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    width: "50px",
                    height: "50px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    border: "1px solid rgba(240,238,233,.25)",
                    background: "rgba(23,20,17,.45)",
                    color: "#F0EEE9",
                  }}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14" />
                  </svg>
                </button>
              </div>
              {v.loggedIn ? (
                <>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px", color: "#B7B1A4" }}
                  >
                    <span
                      style={{
                        width: "180px",
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
                          width: `${v.overallPct ?? ""}`,
                          height: "100%",
                          background: "#DBAF57",
                        }}
                      />
                    </span>
                    {txt(v.progressText)}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>
        <nav
          ref={v.navRef}
          style={{
            position: "sticky",
            top: "64px",
            zIndex: "30",
            background: "rgba(23,20,17,.94)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(219,175,87,.12)",
          }}
        >
          {" "}
          <div style={{ display: "flex", alignItems: "center", gap: "24px", padding: "0 48px", height: "56px" }}>
            <div
              role="tablist"
              style={{
                display: "flex",
                gap: "4px",
                overflowX: "auto",
                scrollbarWidth: "none",
                flex: "1",
                minWidth: "0",
              }}
            >
              {asList(v.tabs).map((t, $index) => (
                <React.Fragment key={$index}>
                  <button
                    className="nk-hover-1d5grei"
                    onClick={t?.go}
                    role="tab"
                    aria-selected={t?.sel}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      height: "56px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "0 14px",
                      fontSize: "14px",
                      fontWeight: "500",
                      whiteSpace: "nowrap",
                      color: `${t?.color ?? ""}`,
                      borderBottom: `2px solid ${t?.line ?? ""}`,
                      boxSizing: "border-box",
                    }}
                  >
                    {txt(t?.label)}
                    {t?.hasCount ? (
                      <>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", opacity: ".7" }}>
                          {txt(t?.count)}
                        </span>
                      </>
                    ) : null}
                  </button>
                </React.Fragment>
              ))}
            </div>
            {v.showMini ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flexShrink: "0" }}>
                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "20px", fontWeight: "500" }}>
                    Solo Leveling
                  </span>
                  <a
                    className="nk-hover-1uijps0"
                    href={v.ctaHref}
                    style={{
                      height: "36px",
                      display: "flex",
                      alignItems: "center",
                      padding: "0 16px",
                      borderRadius: "999px",
                      background: "#DBAF57",
                      color: "#1A1714",
                      fontSize: "13px",
                      fontWeight: "600",
                    }}
                  >
                    {txt(v.ctaShort)}
                  </a>
                </div>
              </>
            ) : null}
          </div>{" "}
        </nav>
        <main style={{ padding: "36px 48px 88px", display: "flex", flexDirection: "column", gap: "80px" }}>
          <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column" }}>
            {v.p?.caps ? (
              <>
                <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {v.showContinue ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "16px 28px",
                          padding: "20px 24px",
                          borderRadius: "16px",
                          background: "linear-gradient(90deg,rgba(219,175,87,.1),rgba(219,175,87,.02))",
                          border: "1px solid rgba(219,175,87,.35)",
                        }}
                      >
                        <span style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1 1 280px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: "600",
                              letterSpacing: ".24em",
                              textTransform: "uppercase",
                              color: "#DBAF57",
                            }}
                          >
                            Sua última leitura
                          </span>
                          <span
                            style={{
                              fontFamily: "'Cormorant Garamond',serif",
                              fontSize: "30px",
                              fontWeight: "500",
                              lineHeight: "1",
                            }}
                          >
                            {txt(v.curTitle)}
                          </span>
                          <span
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
                                width: "140px",
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
                                  width: `${v.curPctW ?? ""}`,
                                  height: "100%",
                                  background: "#DBAF57",
                                }}
                              />
                            </span>
                            {txt(v.curMeta)}
                          </span>
                        </span>
                        <a
                          className="nk-hover-1uijps0"
                          href={v.ctaHref}
                          style={{
                            height: "46px",
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
                          {txt(v.ctaLabel)}
                        </a>
                      </div>
                    </>
                  ) : null}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      gap: "14px 24px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "40px",
                          lineHeight: "1",
                        }}
                      >
                        Capítulos
                      </h2>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>{txt(v.capsInfo)}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
                      <form
                        onSubmit={v.jump}
                        style={{
                          height: "44px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "0 6px 0 14px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.14)",
                          background: "#1A1714",
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B7B1A4" strokeWidth="2">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.5-3.5" />
                        </svg>
                        <input
                          type="number"
                          min="0"
                          max="200"
                          value={val(v.jumpVal)}
                          onChange={v.onJump}
                          placeholder="Ir para o capítulo"
                          style={{
                            width: "136px",
                            height: "100%",
                            background: "transparent",
                            border: "0",
                            outline: "none",
                            color: "#F0EEE9",
                            fontFamily: "Inter,sans-serif",
                            fontSize: "13px",
                          }}
                        />
                        <button
                          type="submit"
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            height: "32px",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 12px",
                            borderRadius: "999px",
                            background: `${v.jumpBg ?? ""}`,
                            color: "#1A1714",
                            fontSize: "12px",
                            fontWeight: "600",
                          }}
                        >
                          Ir
                        </button>
                      </form>
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          padding: "4px",
                          borderRadius: "999px",
                          background: "#1A1714",
                          border: "1px solid rgba(240,238,233,.08)",
                        }}
                      >
                        {asList(v.langTabs).map((s, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onClick={s?.pick}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                height: "34px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 14px",
                                borderRadius: "999px",
                                fontSize: "13px",
                                fontWeight: "500",
                                background: `${s?.bg ?? ""}`,
                                color: `${s?.color ?? ""}`,
                              }}
                            >
                              {txt(s?.label)}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                      <button
                        className="nk-hover-3sbhuj"
                        onClick={v.toggleSort}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "44px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "0 14px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.12)",
                          fontSize: "13px",
                          color: "#B7B1A4",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
                        </svg>
                        {txt(v.sortLabel)}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {asList(v.ranges).map((r, $index) => (
                        <React.Fragment key={$index}>
                          <button
                            onClick={r?.pick}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              height: "32px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "0 12px",
                              borderRadius: "8px",
                              fontSize: "13px",
                              border: `1px solid ${r?.border ?? ""}`,
                              background: `${r?.bg ?? ""}`,
                              color: `${r?.color ?? ""}`,
                            }}
                          >
                            {txt(r?.label)}
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", opacity: ".7" }}>
                              {txt(r?.sub)}
                            </span>
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                    {v.loggedIn ? (
                      <>
                        <button
                          onClick={v.toggleHideRead}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            fontSize: "13px",
                            color: "#D9D5CC",
                          }}
                        >
                          <span
                            style={{
                              width: "36px",
                              height: "20px",
                              borderRadius: "999px",
                              background: `${v.hrTrack ?? ""}`,
                              position: "relative",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: "3px",
                                left: `${v.hrX ?? ""}`,
                                width: "14px",
                                height: "14px",
                                borderRadius: "50%",
                                background: `${v.hrKnob ?? ""}`,
                                transition: "left .2s",
                              }}
                            />
                          </span>
                          {"Ocultar lidos "}
                        </button>
                      </>
                    ) : null}
                  </div>
                  {v.langNote ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 16px",
                          borderRadius: "10px",
                          background: "#1A1714",
                          border: "1px solid rgba(219,175,87,.2)",
                          fontSize: "13px",
                          color: "#D9D5CC",
                        }}
                      >
                        <span
                          style={{
                            width: "7px",
                            height: "7px",
                            transform: "rotate(45deg)",
                            background: "#DBAF57",
                            flexShrink: "0",
                          }}
                        />
                        <span>
                          Em português faltam 5 capítulos das histórias paralelas (196 a 200). Eles já estão disponíveis
                          em inglês.{" "}
                          <a href="/conta?aba=solicitacoes&obra=105398&pedido=traducao" style={{ fontWeight: "600" }}>
                            Pedir tradução →
                          </a>
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,340px),1fr))",
                      gap: "8px",
                    }}
                  >
                    {asList(v.chapters).map((c, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          ref={c?.ref}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "14px",
                            padding: "12px 14px",
                            borderRadius: "12px",
                            background: `${c?.bg ?? ""}`,
                            border: `1px solid ${c?.border ?? ""}`,
                            opacity: `${c?.opacity ?? ""}`,
                          }}
                        >
                          <span
                            style={{
                              width: "52px",
                              flexShrink: "0",
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: "18px",
                              color: `${c?.numColor ?? ""}`,
                              textAlign: "center",
                            }}
                          >
                            {txt(c?.numLabel)}
                          </span>
                          <span
                            style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1", minWidth: "0" }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: "500",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {txt(c?.title)}
                              </span>
                              {c?.isSide ? (
                                <>
                                  <span
                                    style={{
                                      flexShrink: "0",
                                      fontSize: "9px",
                                      fontWeight: "700",
                                      letterSpacing: ".12em",
                                      padding: "2px 6px",
                                      borderRadius: "3px",
                                      border: "1px solid rgba(219,175,87,.5)",
                                      color: "#DBAF57",
                                    }}
                                  >
                                    PARALELA
                                  </span>
                                </>
                              ) : null}
                            </span>
                            <span
                              style={{
                                fontSize: "12px",
                                color: "#B7B1A4",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {txt(c?.meta)}
                            </span>
                            {c?.hasPct ? (
                              <>
                                <span
                                  style={{
                                    display: "block",
                                    width: "120px",
                                    height: "3px",
                                    borderRadius: "2px",
                                    background: "rgba(240,238,233,.15)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "block",
                                      width: `${c?.pctW ?? ""}`,
                                      height: "100%",
                                      background: "#DBAF57",
                                    }}
                                  />
                                </span>
                              </>
                            ) : null}
                          </span>
                          {c?.available ? (
                            <>
                              <a
                                href={c?.href}
                                aria-label={c?.aria}
                                style={{
                                  height: "34px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "0 12px",
                                  borderRadius: "999px",
                                  fontSize: "12px",
                                  fontWeight: "600",
                                  border: `1px solid ${c?.ctaBorder ?? ""}`,
                                  background: `${c?.ctaBg ?? ""}`,
                                  color: `${c?.ctaColor ?? ""}`,
                                  whiteSpace: "nowrap",
                                  flexShrink: "0",
                                }}
                              >
                                {c?.done ? (
                                  <>
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="3"
                                    >
                                      <path d="M5 12l5 5 9-10" />
                                    </svg>
                                  </>
                                ) : null}
                                {txt(c?.cta)}
                              </a>
                            </>
                          ) : null}
                          {c?.unavailable ? (
                            <>
                              <span
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "500",
                                  padding: "5px 10px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(240,238,233,.15)",
                                  color: "#B7B1A4",
                                  whiteSpace: "nowrap",
                                  flexShrink: "0",
                                }}
                              >
                                Em tradução
                              </span>
                            </>
                          ) : null}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  {v.hasMore ? (
                    <>
                      <button
                        className="nk-hover-tdhed"
                        onClick={v.more}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          alignSelf: "center",
                          marginTop: "8px",
                          height: "44px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 24px",
                          borderRadius: "999px",
                          border: "1px solid rgba(219,175,87,.4)",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        {"Carregar mais · "}
                        {txt(v.remaining)}
                        {" restantes"}
                      </button>
                    </>
                  ) : null}
                  {v.capsEmpty ? (
                    <>
                      <div
                        style={{
                          padding: "40px",
                          textAlign: "center",
                          borderRadius: "14px",
                          border: "1px dashed rgba(219,175,87,.25)",
                          fontSize: "14px",
                          color: "#B7B1A4",
                        }}
                      >
                        {"Nenhum capítulo neste filtro. "}
                        <button
                          onClick={v.clearCapFilters}
                          style={{ all: "unset", cursor: "pointer", color: "#DBAF57", fontWeight: "600" }}
                        >
                          Mostrar todos
                        </button>
                      </div>
                    </>
                  ) : null}
                </section>
              </>
            ) : null}
            {v.p?.sobre ? (
              <>
                <section style={{ display: "flex", flexWrap: "wrap", gap: "40px 56px", alignItems: "flex-start" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "24px",
                      flex: "999 1 520px",
                      minWidth: "0",
                    }}
                  >
                    <h2
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "40px",
                        lineHeight: "1",
                      }}
                    >
                      Sobre a história
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px" }}>
                      {asList(v.synopsis).map((t, $index) => (
                        <React.Fragment key={$index}>
                          <p
                            style={{
                              margin: "0",
                              fontSize: "16px",
                              lineHeight: "1.75",
                              color: "#D9D5CC",
                              textWrap: "pretty",
                            }}
                          >
                            {txt(t)}
                          </p>
                        </React.Fragment>
                      ))}
                      <button
                        className="nk-hover-1e3fwvz"
                        onClick={v.toggleSyn}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          alignSelf: "flex-start",
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "#DBAF57",
                        }}
                      >
                        {txt(v.synLabel)}
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          letterSpacing: ".24em",
                          textTransform: "uppercase",
                          color: "#DBAF57",
                        }}
                      >
                        Autores
                      </span>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))",
                          gap: "10px",
                        }}
                      >
                        {asList(v.people).map((a, $index) => (
                          <React.Fragment key={$index}>
                            <a
                              className="nk-hover-1ifysxm"
                              href="/explorar"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                padding: "12px 14px",
                                borderRadius: "12px",
                                background: "#1A1714",
                                border: "1px solid rgba(240,238,233,.07)",
                                color: "#F0EEE9",
                              }}
                            >
                              <span
                                style={{
                                  width: "38px",
                                  height: "38px",
                                  borderRadius: "50%",
                                  flexShrink: "0",
                                  background: "#2D2924",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontFamily: "'Cormorant Garamond',serif",
                                  fontSize: "17px",
                                  color: "#DBAF57",
                                }}
                              >
                                {txt(a?.initial)}
                              </span>
                              <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                                <span style={{ fontSize: "14px", fontWeight: "500" }}>{txt(a?.name)}</span>
                                <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(a?.role)}</span>
                              </span>
                            </a>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          letterSpacing: ".24em",
                          textTransform: "uppercase",
                          color: "#DBAF57",
                        }}
                      >
                        Gêneros e temas
                      </span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {asList(v.genreTags).map((g, $index) => (
                          <React.Fragment key={$index}>
                            <a
                              className="nk-hover-1o5jsph"
                              href="/explorar?tipo=manhwas"
                              style={{
                                height: "34px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 14px",
                                borderRadius: "999px",
                                fontSize: "13px",
                                border: "1px solid rgba(219,175,87,.4)",
                                color: "#F0EEE9",
                              }}
                            >
                              {txt(g)}
                            </a>
                          </React.Fragment>
                        ))}
                        {asList(v.themeTags).map((g, $index) => (
                          <React.Fragment key={$index}>
                            <a
                              className="nk-hover-1i4rx9x"
                              href="/explorar?tipo=manhwas"
                              style={{
                                height: "34px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 14px",
                                borderRadius: "999px",
                                fontSize: "13px",
                                border: "1px solid rgba(240,238,233,.12)",
                                color: "#B7B1A4",
                              }}
                            >
                              {txt(g)}
                            </a>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          letterSpacing: ".24em",
                          textTransform: "uppercase",
                          color: "#DBAF57",
                        }}
                      >
                        Também conhecido como
                      </span>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>{txt(v.altText)}</span>
                    </div>
                  </div>
                  <aside
                    style={{
                      flex: "1 1 340px",
                      maxWidth: "460px",
                      padding: "24px",
                      borderRadius: "16px",
                      background: "#1A1714",
                      border: "1px solid rgba(219,175,87,.14)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Cormorant Garamond',serif",
                        fontSize: "26px",
                        fontWeight: "500",
                        paddingBottom: "12px",
                      }}
                    >
                      Ficha técnica
                    </span>
                    {asList(v.ficha).map((f, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "130px minmax(0,1fr)",
                            gap: "16px",
                            padding: "11px 0",
                            borderTop: "1px solid rgba(240,238,233,.07)",
                            fontSize: "14px",
                          }}
                        >
                          <span style={{ color: "#B7B1A4" }}>{txt(f?.k)}</span>
                          <span style={{ color: "#F0EEE9" }}>{txt(f?.v)}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </aside>
                </section>
              </>
            ) : null}
            {v.p?.adapt ? (
              <>
                <section style={{ display: "flex", flexDirection: "column", gap: "36px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h2
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "40px",
                        lineHeight: "1",
                      }}
                    >
                      Adaptações e obras relacionadas
                    </h2>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                      Versões desta mesma história. Para obras parecidas, veja as recomendações abaixo.
                    </span>
                  </div>
                  <div
                    style={{
                      position: "relative",
                      borderRadius: "18px",
                      overflow: "hidden",
                      border: "1px solid rgba(219,175,87,.25)",
                      background: "#1A1714",
                    }}
                  >
                    {" "}
                    <span
                      style={{
                        position: "absolute",
                        inset: "0",
                        backgroundImage: `${v.animeBannerBg ?? ""}`,
                        backgroundSize: "cover",
                        backgroundPosition: "center 30%",
                        opacity: ".28",
                      }}
                    />{" "}
                    <span
                      style={{
                        position: "absolute",
                        inset: "0",
                        background: "linear-gradient(90deg,#1A1714 20%,rgba(26,23,20,.6))",
                      }}
                    />{" "}
                    <div
                      style={{
                        position: "relative",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "28px 40px",
                        padding: "32px",
                      }}
                    >
                      <span
                        role="img"
                        aria-label="Capa do anime Solo Leveling"
                        style={{
                          width: "clamp(130px,13vw,180px)",
                          aspectRatio: "2/3",
                          backgroundColor: "#221F1B",
                          backgroundImage: `${v.animeCoverBg ?? ""}`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          borderRadius: "10px",
                          display: "block",
                          flexShrink: "0",
                          border: "1px solid rgba(240,238,233,.1)",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          flex: "1 1 320px",
                          minWidth: "0",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            letterSpacing: ".26em",
                            textTransform: "uppercase",
                            color: "#DBAF57",
                          }}
                        >
                          Adaptação em anime
                        </span>
                        <span
                          style={{
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: "38px",
                            fontWeight: "500",
                            lineHeight: "1",
                          }}
                        >
                          Solo Leveling
                        </span>
                        <span style={{ fontSize: "14px", color: "#D9D5CC" }}>{txt(v.animeMeta)}</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
                          <a
                            className="nk-hover-1uijps0"
                            href={canonicalWorks.soloLevelingAnime}
                            style={{
                              height: "44px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 20px",
                              borderRadius: "999px",
                              background: "#DBAF57",
                              color: "#1A1714",
                              fontSize: "14px",
                              fontWeight: "600",
                            }}
                          >
                            Ver página do anime
                          </a>
                          <a
                            className="nk-hover-1rcmvu"
                            href={getUnitUrl({ id: 151807, kind: "anime" }, 1)}
                            style={{
                              height: "44px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "0 18px",
                              borderRadius: "999px",
                              border: "1px solid rgba(240,238,233,.25)",
                              fontSize: "14px",
                              color: "#F0EEE9",
                            }}
                          >
                            <span
                              style={{
                                width: "0",
                                height: "0",
                                borderLeft: "8px solid currentColor",
                                borderTop: "5px solid transparent",
                                borderBottom: "5px solid transparent",
                              }}
                            />
                            Assistir episódio 1
                          </a>
                        </div>
                      </div>
                      <div
                        style={{
                          flex: "1 1 280px",
                          maxWidth: "400px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                          paddingLeft: "28px",
                          borderLeft: "1px solid rgba(240,238,233,.1)",
                        }}
                      >
                        <span style={{ fontSize: "15px", fontWeight: "500" }}>Já assistiu ao anime?</span>
                        <span style={{ fontSize: "13px", lineHeight: "1.55", color: "#B7B1A4" }}>
                          Veja até onde cada temporada chegou no manhwa. Os números revelam o ponto da história, por
                          isso ficam ocultos.
                        </span>
                        {v.mapHidden ? (
                          <>
                            <button
                              className="nk-hover-1eosf2m"
                              onClick={v.showMap}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                alignSelf: "flex-start",
                                height: "38px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 16px",
                                borderRadius: "999px",
                                border: "1px solid rgba(219,175,87,.5)",
                                fontSize: "13px",
                                fontWeight: "600",
                                color: "#DBAF57",
                              }}
                            >
                              Mostrar correspondência
                            </button>
                          </>
                        ) : null}
                        {v.mapShown ? (
                          <>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              {asList(v.animeMap).map((m, $index) => (
                                <React.Fragment key={$index}>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: "12px",
                                      padding: "10px 0",
                                      borderTop: "1px solid rgba(240,238,233,.07)",
                                    }}
                                  >
                                    <span style={{ fontSize: "14px" }}>{txt(m?.season)}</span>
                                    <span
                                      style={{
                                        fontFamily: "'JetBrains Mono',monospace",
                                        fontSize: "13px",
                                        color: "#DBAF57",
                                      }}
                                    >
                                      {txt(m?.range)}
                                    </span>
                                  </div>
                                </React.Fragment>
                              ))}
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  fontSize: "12px",
                                  color: "#B7B1A4",
                                  padding: "10px 0",
                                  borderTop: "1px solid rgba(240,238,233,.07)",
                                }}
                              >
                                <span
                                  style={{
                                    width: "6px",
                                    height: "6px",
                                    transform: "rotate(45deg)",
                                    background: "#9FC79A",
                                  }}
                                />
                                Verificado pela equipe · aproximado
                              </span>
                              <a
                                href={getUnitUrl({ id: WORK_ID, kind: "manhwa" }, 111)}
                                style={{
                                  alignSelf: "flex-start",
                                  height: "38px",
                                  display: "flex",
                                  alignItems: "center",
                                  padding: "0 16px",
                                  borderRadius: "999px",
                                  background: "#DBAF57",
                                  color: "#1A1714",
                                  fontSize: "13px",
                                  fontWeight: "600",
                                }}
                              >
                                Continuar após o anime · cap. 111
                              </a>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>{" "}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "30px", fontWeight: "500" }}>
                      Da mesma franquia
                    </span>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
                        gap: "16px",
                      }}
                    >
                      {asList(v.related).map((r, $index) => (
                        <React.Fragment key={$index}>
                          <a
                            className="nk-hover-1ifysxm"
                            href={r?.href}
                            style={{
                              display: "flex",
                              gap: "14px",
                              alignItems: "center",
                              padding: "14px",
                              borderRadius: "14px",
                              background: "#1A1714",
                              border: "1px solid rgba(240,238,233,.07)",
                              color: "#F0EEE9",
                            }}
                          >
                            {r?.hasCover ? (
                              <>
                                <span
                                  style={{
                                    width: "52px",
                                    height: "76px",
                                    borderRadius: "5px",
                                    flexShrink: "0",
                                    backgroundColor: "#221F1B",
                                    backgroundImage: `${r?.bg ?? ""}`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                  }}
                                />
                              </>
                            ) : null}
                            {r?.noCover ? (
                              <>
                                <span
                                  style={{
                                    width: "52px",
                                    height: "76px",
                                    borderRadius: "5px",
                                    flexShrink: "0",
                                    background: "#2D2924",
                                    border: "1px solid rgba(219,175,87,.25)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontFamily: "'Cormorant Garamond',serif",
                                    fontSize: "22px",
                                    color: "#DBAF57",
                                  }}
                                >
                                  SL
                                </span>
                              </>
                            ) : null}
                            <span style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: "600",
                                  letterSpacing: ".18em",
                                  textTransform: "uppercase",
                                  color: "#DBAF57",
                                }}
                              >
                                {txt(r?.type)}
                              </span>
                              <span style={{ fontSize: "15px", fontWeight: "500" }}>{txt(r?.title)}</span>
                              <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(r?.rel)}</span>
                            </span>
                          </a>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {v.p?.chars ? (
              <>
                <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h2
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "40px",
                        lineHeight: "1",
                      }}
                    >
                      Personagens
                    </h2>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                      Personagens do início da história. Quem aparece mais adiante fica oculto para não revelar
                      acontecimentos.
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))",
                      gap: "20px 16px",
                    }}
                  >
                    {asList(v.chars).map((c, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "0" }}>
                          <span
                            style={{
                              display: "block",
                              aspectRatio: "3/4",
                              borderRadius: "12px",
                              backgroundColor: "#221F1B",
                              backgroundImage: `${c?.bg ?? ""}`,
                              backgroundSize: "cover",
                              backgroundPosition: "center top",
                              border: `1px solid ${c?.border ?? ""}`,
                            }}
                          />
                          <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: "500",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {txt(c?.name)}
                            </span>
                            <span style={{ fontSize: "12px", color: `${c?.roleColor ?? ""}` }}>{txt(c?.role)}</span>
                          </span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </div>
          <section style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h2
                style={{
                  margin: "0",
                  fontFamily: "'Cormorant Garamond',serif",
                  fontWeight: "500",
                  fontSize: "40px",
                  lineHeight: "1",
                }}
              >
                Você também pode gostar
              </h2>
              <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                Outras leituras, fora desta franquia, com o motivo de cada sugestão.
              </span>
            </div>
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "24px 16px" }}
            >
              {asList(v.recs).map((r, $index) => (
                <React.Fragment key={$index}>
                  <a
                    className="nk-hover-1d5grei"
                    href={r?.href}
                    style={{ display: "flex", flexDirection: "column", gap: "10px", color: "#F0EEE9", minWidth: "0" }}
                  >
                    <span
                      style={{
                        display: "block",
                        aspectRatio: "2/3",
                        borderRadius: "10px",
                        backgroundColor: "#221F1B",
                        backgroundImage: `${r?.bg ?? ""}`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        border: "1px solid rgba(240,238,233,.06)",
                      }}
                    />
                    <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
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
                        {txt(r?.title)}
                      </span>
                      <span
                        style={{
                          alignSelf: "flex-start",
                          fontSize: "11px",
                          padding: "3px 8px",
                          borderRadius: "999px",
                          background: "rgba(219,175,87,.1)",
                          color: "#DBAF57",
                        }}
                      >
                        {txt(r?.reason)}
                      </span>
                    </span>
                  </a>
                </React.Fragment>
              ))}
            </div>
          </section>
        </main>
        {v.narrow ? (
          <>
            <div
              className="nk-above-nav"
              style={{
                position: "fixed",
                left: "0",
                right: "0",
                bottom: "0",
                zIndex: "40",
                padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
                background: "rgba(23,20,17,.96)",
                borderTop: "1px solid rgba(219,175,87,.18)",
                display: "flex",
                gap: "10px",
              }}
            >
              <a
                href={v.ctaHref}
                style={{
                  flex: "1",
                  height: "48px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "999px",
                  background: "#DBAF57",
                  color: "#1A1714",
                  fontSize: "15px",
                  fontWeight: "600",
                }}
              >
                {txt(v.ctaLabel)}
              </a>
              <button
                onClick={v.toggleFollow}
                aria-label={v.followLabel}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  border: "1px solid rgba(219,175,87,.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#DBAF57",
                }}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill={v.followFill}
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                </svg>
              </button>
            </div>
          </>
        ) : null}
        {v.toast ? (
          <>
            <div
              className="nk-toast-hi"
              style={{
                position: "fixed",
                left: "50%",
                bottom: `${v.toastBottom ?? ""}`,
                transform: "translateX(-50%)",
                zIndex: "90",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                height: "44px",
                padding: "0 18px",
                borderRadius: "999px",
                background: "#2D2924",
                border: "1px solid rgba(219,175,87,.4)",
                fontSize: "13px",
                boxShadow: "0 12px 30px rgba(0,0,0,.5)",
              }}
            >
              <span style={{ width: "7px", height: "7px", transform: "rotate(45deg)", background: "#DBAF57" }} />
              {txt(v.toastText)}
            </div>
          </>
        ) : null}
        <Footer />
      </div>
    </>
  );
}

export const defaults = { loggedIn: true };

export default defineDC("ObraLeitura", ObraLeituraLogic, render, { helmet });
