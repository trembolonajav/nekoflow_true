// Origem: design/claude-design/Obra.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css } from "../dc/runtime";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { session, goLogin } from "../lib/session";
import { libraryApi } from "../features/library/libraryApi";
import { progressApi } from "../features/progress/progressApi";
import { canonicalWorks, getUnitUrl, getWorkUrl } from "../features/catalog/workNavigation";
import { languageBadge } from "../features/media/playbackRules";

const WORK_ID = 151807;
const STATUS_CODE = {
  Assistindo: "andamento",
  Planejado: "planejado",
  Concluído: "concluido",
  Pausado: "pausado",
  Abandonado: "abandonado",
};
const STATUS_LABEL = Object.fromEntries(Object.entries(STATUS_CODE).map(([k, v]) => [v, k]));

class ObraLogic extends DCLogic {
  state = {
    w: null,
    season: 2,
    audio: "leg",
    asc: true,
    synOpen: false,
    status: null,
    follow: false,
    me: null,
    listOpen: false,
    trailer: false,
    char: null,
    spoiler: false,
    contAsk: false,
    active: "eps",
    mini: false,
    narrow: false,
    toast: null,
  };
  refEps = React.createRef();
  refSobre = React.createRef();
  refUni = React.createRef();
  refChars = React.createRef();
  refRecs = React.createRef();
  sections() {
    return [
      ["eps", this.refEps],
      ["sobre", this.refSobre],
      ["uni", this.refUni],
      ["chars", this.refChars],
      ["recs", this.refRecs],
    ];
  }
  scrollY(e) {
    const t = e && e.target && e.target.scrollTop;
    return Math.max(
      window.scrollY || 0,
      (document.scrollingElement || {}).scrollTop || 0,
      typeof t === "number" ? t : 0,
    );
  }
  navRef = React.createRef();
  onScroll = () => {
    const n = this.navRef.current;
    const mini = n ? n.getBoundingClientRect().top <= 66 : false;
    if (mini !== this.state.mini) this.setState({ mini });
  };
  setTab(k) {
    this.setState({ active: k });
    try {
      history.replaceState(null, "", k === "eps" ? location.pathname : `?aba=${k}`);
    } catch (e) {}
    const n = this.navRef.current;
    if (n && n.getBoundingClientRect().top <= 66) {
      const anchor = n.parentElement ? n.previousElementSibling : null;
      const y = anchor ? anchor.getBoundingClientRect().bottom + this.scrollY() - 64 : this.scrollY();
      const se = document.scrollingElement || document.documentElement;
      try {
        window.scrollTo({ top: y });
        se.scrollTo({ top: y });
      } catch (e) {
        se.scrollTop = y;
      }
    }
  }
  onResize = () => {
    const n = window.innerWidth < 760;
    if (n !== this.state.narrow) this.setState({ narrow: n });
  };
  onKey = (e) => {
    if (e.key === "Escape") this.setState({ trailer: false, char: null, listOpen: false });
  };
  onDown = (e) => {
    if (this.state.listOpen && !(e.target.closest && e.target.closest("[data-nk-menu]")))
      this.setState({ listOpen: false });
  };
  componentDidMount() {
    const a = new URLSearchParams(location.search).get("aba");
    if (["eps", "sobre", "uni", "chars"].includes(a)) this.setState({ active: a });
    api.get("/api/content/obra")
      .then((w) => this.setState({ w }));
    this.loadMe();
    document.addEventListener("scroll", this.onScroll, { passive: true, capture: true });
    window.addEventListener("resize", this.onResize);
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("mousedown", this.onDown);
    this.onResize();
  }
  componentWillUnmount() {
    document.removeEventListener("scroll", this.onScroll, { capture: true });
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("mousedown", this.onDown);
  }
  go(ref) {
    const el = ref.current;
    if (!el) return;
    const y = el.getBoundingClientRect().top + this.scrollY() - 128;
    const se = document.scrollingElement || document.documentElement;
    try {
      window.scrollTo({ top: y, behavior: "smooth" });
      se.scrollTo({ top: y, behavior: "smooth" });
    } catch (e) {
      se.scrollTop = y;
    }
  }
  /** Estado pessoal da obra (lista, alertas e progresso), sempre do servidor. */
  loadMe(first = true) {
    if (!session.loggedIn) return;
    api
      .get(`/api/me/works/${WORK_ID}`)
      .then((me) => {
        const patch = { me, status: me.status ? STATUS_LABEL[me.status] : null, follow: me.follow };
        if (first && me.resumeUnit) patch.season = me.resumeUnit > 12 ? 2 : 1;
        this.setState(patch);
        window.dispatchEvent(new Event("nk:personal"));
      })
      .catch(() => {});
  }
  save(req, msg) {
    return req
      .then(() => {
        this.loadMe(false);
        this.flash(msg);
      })
      .catch(() => this.flash("Não foi possível salvar. Tente novamente."));
  }
  flash(t) {
    clearTimeout(this.tt);
    this.setState({ toast: t });
    this.tt = setTimeout(() => this.setState({ toast: null }), 2200);
  }
  renderVals() {
    const s = this.state;
    const w = s.w;
    const loggedIn = session.loggedIn;
    const ready = !!w;
    const bg = (u) => (u ? `url("${u}")` : "none");
    // Progresso real por episódio (mesma fonte da Home, do Player e da Biblioteca).
    const units = (s.me && s.me.units) || {};
    const started = Object.keys(units).length > 0;
    const cur = loggedIn && started && !(s.me && s.me.upToDate) ? s.me.resumeUnit : 0;
    const curU = units[cur] || {};
    const left = curU.d && curU.t != null ? Math.max(1, Math.ceil((curU.d - curU.t) / 60)) : null;
    const progress = { done: (n) => !!(units[n] && units[n].done), cur, pct: Math.round(curU.pct || 0) };
    const seasons = w ? w.seasons : [];
    const season = seasons.find((x) => x.n === s.season) || { eps: [], label: "" };
    const dub = s.audio === "dub";
    let eps = season.eps.map((e) => {
      const done = progress.done(e.n);
      const cur = e.n === progress.cur;
      const available = !dub || e.dub;
      return {
        ...e,
        done,
        available,
        unavailable: !available,
        href: getUnitUrl({ id: WORK_ID, kind: "anime" }, e.n),
        hasPct: cur && available,
        pctW: `${progress.pct}%`,
        meta: available
          ? `24 min · ${dub ? "Áudio PT-BR" : "Áudio JA · Legenda PT-BR"}${cur && left ? ` · faltam ${left} min` : ""}`
          : "24 min · Áudio JA · Legenda PT-BR",
        cta: cur ? "Continuar episódio" : done ? "Assistir de novo" : "Assistir episódio",
        ctaColor: cur ? "#DBAF57" : done ? "#B7B1A4" : "#F0EEE9",
        bg: cur ? "rgba(219,175,87,.07)" : "#1A1714",
        border: cur ? "rgba(219,175,87,.45)" : "rgba(240,238,233,.06)",
        opacity: available ? 1 : 0.55,
        filter: available ? "none" : "grayscale(.7)",
      };
    });
    if (!s.asc) eps = [...eps].reverse();
    const notDub = season.eps.filter((e) => !e.dub).length;
    const TABS = [
      ["eps", "Episódios", w ? 25 : null],
      ["sobre", "Sobre", null],
      ["uni", "Universo", w ? w.order.length + w.reads.length : null],
      ["chars", "Personagens", w ? w.chars.length : null],
    ];
    const p = {
      eps: s.active === "eps",
      sobre: s.active === "sobre",
      uni: s.active === "uni",
      chars: s.active === "chars",
    };
    const pill = (on) => ({ bg: on ? "#DBAF57" : "transparent", color: on ? "#1A1714" : "#F0EEE9" });
    const STATUS = ["Assistindo", "Planejado", "Concluído", "Pausado", "Abandonado"];
    const inList = loggedIn && !!s.status;
    const ch = w && s.char != null ? w.chars.find((c) => c.id === s.char) : null;
    const curSeason = cur > 12 ? 2 : 1;
    const ctaLabel = cur
      ? `Continuar T${curSeason} · Ep. ${cur}`
      : started && s.me.upToDate
        ? "Rever T1 · Ep. 1"
        : "Assistir T1 · Ep. 1";
    return {
      // Textos da ficha original do design; a ficha dinâmica (DynamicObraLogic) substitui.
      workTitle: "Solo Leveling",
      legacyId: WORK_ID,
      heroEyebrow: "Anime · Série de TV · 2024–2025",
      ageRating: "16",
      statusText: "Concluído · 2 temporadas",
      hasTrailer: true,
      heroProgress: loggedIn && cur > 0,
      heroProgressText: `T${curSeason} · Episódio ${cur}${left ? ` · faltam ${left} min` : ""}`,
      heroProgressW: `${progress.pct}%`,
      endHintText: "A história continua no manhwa original. Veja onde a animação parou.",
      hasOrig: true,
      hasOrigMap: true,
      origHref: canonicalWorks.soloLevelingReading,
      origFirstHref: getUnitUrl({ id: 105398, kind: "manhwa" }, 1),
      origNextHref: getUnitUrl({ id: 105398, kind: "manhwa" }, 111),
      origFirstCta: "Ler do capítulo 1",
      origPageCta: "Ver página do manhwa →",
      loggedIn,
      ready,
      narrow: s.narrow,
      w: w || { native: "", score: "", synopsisShort: "" },
      bannerBg: bg(w && w.banner),
      coverBg: bg(w && w.cover),
      origBg: bg(w && w.original && w.original.cover),
      genresText: w ? w.genres.join(" · ") : "",
      ctaHref: getUnitUrl({ id: WORK_ID, kind: "anime" }, cur || 1),
      ctaLabel,
      ctaShort: cur ? `Continuar ep. ${cur}` : "Assistir ep. 1",
      listLabel: inList ? s.status : "Minha lista",
      listFill: inList ? "#DBAF57" : "none",
      listBorder: inList ? "rgba(219,175,87,.6)" : "rgba(240,238,233,.25)",
      listOpen: s.listOpen && loggedIn,
      toggleList: () => {
        if (!loggedIn) {
          goLogin();
          return;
        }
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
        this.save(libraryApi.remove(WORK_ID), "Removido da sua lista · progresso mantido");
      },
      toggleFollow: () => {
        if (!loggedIn) return goLogin();
        this.setState({ follow: !s.follow });
        this.save(
          libraryApi.follow(WORK_ID, !s.follow),
          s.follow ? "Avisos desativados" : "Você será avisado sobre novidades",
        );
      },
      followTrack: s.follow ? "#DBAF57" : "#2D2924",
      followKnob: s.follow ? "#1A1714" : "#B7B1A4",
      followX: s.follow ? "21px" : "3px",
      openTrailer: () => this.setState({ trailer: true }),
      closeTrailer: () => this.setState({ trailer: false }),
      trailerOpen: s.trailer && !!(w && w.trailer),
      trailerSrc: w && w.trailer ? `https://www.youtube-nocookie.com/embed/${w.trailer}?autoplay=1&rel=0` : "",
      share: () => {
        try {
          navigator.clipboard.writeText(location.href);
        } catch (e) {}
        this.flash("Link copiado");
      },
      p,
      navRef: this.navRef,
      tabs: TABS.map(([k, label, count]) => ({
        label,
        count,
        hasCount: count != null,
        sel: String(s.active === k),
        color: s.active === k ? "#DBAF57" : "#B7B1A4",
        line: s.active === k ? "#DBAF57" : "transparent",
        go: () => this.setTab(k),
      })),
      showMini: s.mini && !s.narrow,
      refEps: this.refEps,
      refSobre: this.refSobre,
      refUni: this.refUni,
      refChars: this.refChars,
      refRecs: this.refRecs,
      seasonInfo:
        season.n === 2
          ? "Temporada 2 · Arise from the Shadow · 2025 · 13 episódios"
          : "Temporada 1 · 2024 · 12 episódios",
      seasonTabs: seasons.map((x) => ({
        label: x.short || x.label,
        count: x.eps.length,
        ...pill(x.n === s.season),
        pick: () => this.setState({ season: x.n }),
      })),
      audioTabs: [
        ["leg", "Legendado"],
        ["dub", "Dublado"],
      ].map(([k, l]) => ({ label: l, ...pill(s.audio === k), pick: () => this.setState({ audio: k }) })),
      dubNote: dub && notDub > 0,
      dubNoteText: `A dublagem desta temporada está em andamento: ${season.eps.length - notDub} de ${season.eps.length} episódios dublados. Os demais seguem disponíveis legendados.`,
      toggleSort: () => this.setState({ asc: !s.asc }),
      sortLabel: s.asc ? "Mais antigos primeiro" : "Mais recentes primeiro",
      episodes: eps,
      showEndHint: season.n === 2,
      goUniverso: () => this.setTab("uni"),
      synopsis: w ? (s.synOpen ? w.synopsis : [w.synopsis[0]]) : [],
      synLabel: s.synOpen ? "Mostrar menos" : "Ler mais",
      toggleSyn: () => this.setState({ synOpen: !s.synOpen }),
      genreTags: w ? w.genres : [],
      themeTags: w ? w.themes : [],
      altText: w ? w.alt.join(" · ") : "",
      ficha: w ? w.ficha.map(([k, v]) => ({ k, v })) : [],
      orig: (w && w.original) || { map: [], title: "", meta: "", info: "", credits: "", nextCh: "" },
      continueAsk: s.contAsk,
      askContinue: () => this.setState({ contAsk: true }),
      cancelContinue: () => this.setState({ contAsk: false }),
      order: w
        ? w.order.map((o) => ({
            ...o,
            hasBadge: !!o.badge,
            hasNote: !!o.note,
            border: o.badge === "Anunciado" ? "rgba(240,238,233,.06)" : "rgba(219,175,87,.18)",
            imgOpacity: o.badge === "Anunciado" ? 0.6 : 1,
          }))
        : [],
      reads: w ? w.reads.map((r) => ({ ...r, hasCover: !!r.cover, noCover: !r.cover })) : [],
      chars: w
        ? w.chars.map((c) => ({
            ...c,
            hasVa: !!c.va,
            vaName: c.va ? c.va.name : "",
            vaImg: c.va ? c.va.img : "",
            border: c.role === "Protagonista" ? "rgba(219,175,87,.5)" : "rgba(240,238,233,.06)",
            roleColor: c.role === "Protagonista" ? "#DBAF57" : "#B7B1A4",
            open: () => this.setState({ char: c.id, spoiler: false }),
          }))
        : [],
      charOpen: !!ch,
      closeChar: () => this.setState({ char: null }),
      ch: ch
        ? { ...ch, imgBg: bg(ch.img), hasVa: !!ch.va, vaBg: bg(ch.va && ch.va.img), vaName: ch.va ? ch.va.name : "" }
        : { name: "", native: "", role: "", imgBg: "none", vaBg: "none", vaName: "", hasVa: false },
      spoilerOpen: s.spoiler,
      toggleSpoiler: () => this.setState({ spoiler: !s.spoiler }),
      spoilerLabel: s.spoiler ? "Ocultar" : "Mostrar mesmo assim",
      recs: w ? w.recs.map((r) => ({ ...r, href: getWorkUrl({ ...r, kind: "anime" }) })) : [],
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
    text: "\nbody{margin:0;background:#171411;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\n",
  },
];

function render(v) {
  return (
    <>
      <div style={{ minHeight: "100vh", background: "#171411", display: "flex", flexDirection: "column" }}>
        <Header
          active=""
          loggedIn={v.loggedIn}
          __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
        />
        <header
          style={{
            position: "relative",
            minHeight: "640px",
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
              backgroundPosition: "center 25%",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(90deg,#171411 0%,rgba(23,20,17,.9) 32%,rgba(23,20,17,.35) 65%,rgba(23,20,17,.1) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "0",
              background:
                "linear-gradient(0deg,#171411 0%,rgba(23,20,17,.5) 30%,rgba(23,20,17,0) 60%,rgba(23,20,17,.6) 100%)",
            }}
          />
          <div
            style={{
              position: "relative",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: "28px 36px",
              maxWidth: "1100px",
            }}
          >
            <span
              role="img"
              aria-label={`Capa de ${v.workTitle ?? ""}`}
              style={{
                width: "clamp(150px,15vw,220px)",
                aspectRatio: "2/3",
                backgroundColor: "#221F1B",
                backgroundImage: `${v.coverBg ?? ""}`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: "12px",
                border: "1px solid rgba(219,175,87,.35)",
                boxShadow: "0 30px 60px rgba(0,0,0,.55)",
                flexShrink: "0",
                display: "block",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: "1 1 420px", minWidth: "0" }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "11px",
                  fontWeight: "500",
                  letterSpacing: ".3em",
                  textTransform: "uppercase",
                  color: "#DBAF57",
                }}
              >
                <span style={{ width: "32px", height: "1px", background: "rgba(219,175,87,.6)" }} />
                {txt(v.heroEyebrow)}
              </span>
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
                  {txt(v.workTitle)}
                </h1>
                <span style={{ fontSize: "15px", color: "rgba(240,238,233,.7)" }}>{txt(v.w?.native)}</span>
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
                  {txt(v.w?.score)} <span style={{ color: "#B7B1A4" }}>no AniList</span>
                </span>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                <span>{txt(v.genresText)}</span>
                {v.ageRating ? (
                  <>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid rgba(240,238,233,.4)",
                      }}
                    >
                      {txt(v.ageRating)}
                    </span>
                  </>
                ) : null}
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B7B1A4" }} />
                <span>{txt(v.statusText)}</span>
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
                {txt(v.w?.synopsisShort)}
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
                          width: "260px",
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
                        <span style={{ height: "1px", background: "rgba(240,238,233,.08)", margin: "6px 4px" }} />
                        <button
                          className="nk-hover-zuhwcw"
                          onClick={v.toggleFollow}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                            padding: "9px 10px",
                            borderRadius: "8px",
                            fontSize: "14px",
                            color: "#F0EEE9",
                          }}
                        >
                          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span>Avisar sobre novidades</span>
                            <span style={{ fontSize: "12px", color: "#B7B1A4" }}>Nova temporada, filme e dublagem</span>
                          </span>
                          <span
                            style={{
                              width: "40px",
                              height: "22px",
                              borderRadius: "999px",
                              background: `${v.followTrack ?? ""}`,
                              position: "relative",
                              flexShrink: "0",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                top: "3px",
                                left: `${v.followX ?? ""}`,
                                width: "16px",
                                height: "16px",
                                borderRadius: "50%",
                                background: `${v.followKnob ?? ""}`,
                                transition: "left .2s",
                              }}
                            />
                          </span>
                        </button>
                        {v.inList ? (
                          <>
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
                {v.hasTrailer ? (
                <button
                  className="nk-hover-ucdklh"
                  onClick={v.openTrailer}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    height: "50px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "0 20px",
                    borderRadius: "999px",
                    border: "1px solid rgba(240,238,233,.25)",
                    background: "rgba(23,20,17,.45)",
                    fontSize: "15px",
                    color: "#F0EEE9",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="2" y="5" width="20" height="14" rx="3" />
                    <path d="m10 9 5 3-5 3z" fill="currentColor" />
                  </svg>
                  {"Trailer "}
                </button>
                ) : null}
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
              {v.loggedIn && v.heroProgress ? (
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
                      <span style={{ display: "block", width: `${v.heroProgressW ?? "0%"}`, height: "100%", background: "#DBAF57" }} />
                    </span>
                    {txt(v.heroProgressText)}
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
                    aria-selected={t?.sel}
                    role="tab"
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
                    {txt(v.workTitle)}
                  </span>
                  <a
                    className="nk-hover-1uijps0"
                    href={v.ctaHref}
                    style={{
                      height: "36px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "0 16px",
                      borderRadius: "999px",
                      background: "#DBAF57",
                      color: "#1A1714",
                      fontSize: "13px",
                      fontWeight: "600",
                    }}
                  >
                    <span
                      style={{
                        width: "0",
                        height: "0",
                        borderLeft: "8px solid #1A1714",
                        borderTop: "5px solid transparent",
                        borderBottom: "5px solid transparent",
                      }}
                    />
                    {txt(v.ctaShort)}
                  </a>
                </div>
              </>
            ) : null}
          </div>{" "}
        </nav>
        <main style={{ padding: "40px 48px 88px", display: "flex", flexDirection: "column", gap: "80px" }}>
          <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column" }}>
            {v.p?.eps ? (
              <>
                <section
                  ref={v.refEps}
                  style={{ display: "flex", flexDirection: "column", gap: "22px", scrollMarginTop: "140px" }}
                >
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
                          fontSize: "40px",
                          lineHeight: "1",
                        }}
                      >
                        Episódios
                      </h2>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>{txt(v.seasonInfo)}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
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
                        {asList(v.seasonTabs).map((s, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onClick={s?.pick}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                height: "36px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "0 16px",
                                borderRadius: "999px",
                                fontSize: "13px",
                                fontWeight: "500",
                                background: `${s?.bg ?? ""}`,
                                color: `${s?.color ?? ""}`,
                              }}
                            >
                              {txt(s?.label)}
                              <span
                                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", opacity: ".7" }}
                              >
                                {txt(s?.count)}
                              </span>
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
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
                        {asList(v.audioTabs).map((s, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onClick={s?.pick}
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
                        title="Inverter ordem"
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
                  {v.dubNote ? (
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
                          {txt(v.dubNoteText)}{" "}
                          <a href={`/conta?aba=solicitacoes&obra=${v.legacyId}&pedido=traducao`} style={{ fontWeight: "600" }}>
                            Pedir prioridade na dublagem →
                          </a>
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,520px),1fr))",
                      gap: "14px",
                    }}
                  >
                    {asList(v.episodes).map((e, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            alignItems: "center",
                            padding: "12px",
                            borderRadius: "14px",
                            background: `${e?.bg ?? ""}`,
                            border: `1px solid ${e?.border ?? ""}`,
                            opacity: `${e?.opacity ?? ""}`,
                          }}
                        >
                          <div
                            style={{
                              position: "relative",
                              width: "clamp(150px,30%,210px)",
                              aspectRatio: "16/9",
                              borderRadius: "9px",
                              overflow: "hidden",
                              flexShrink: "0",
                              background: "#221F1B",
                            }}
                          >
                            {" "}
                            <img
                              src={e?.thumb}
                              alt=""
                              loading="lazy"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                objectPosition: `${e?.pos ?? ""}`,
                                display: "block",
                                filter: `${e?.filter ?? ""}`,
                              }}
                            />{" "}
                            <span
                              style={{
                                position: "absolute",
                                left: "8px",
                                top: "8px",
                                fontFamily: "'JetBrains Mono',monospace",
                                fontSize: "11px",
                                fontWeight: "500",
                                background: "rgba(23,20,17,.88)",
                                padding: "3px 7px",
                                borderRadius: "4px",
                              }}
                            >
                              {"EP "}
                              {txt(e?.n)}
                            </span>{" "}
                            {e?.done ? (
                              <>
                                <span
                                  style={{
                                    position: "absolute",
                                    right: "8px",
                                    top: "8px",
                                    width: "22px",
                                    height: "22px",
                                    borderRadius: "50%",
                                    background: "#DBAF57",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#1A1714"
                                    strokeWidth="3.4"
                                  >
                                    <path d="M5 12l5 5 9-10" />
                                  </svg>
                                </span>
                              </>
                            ) : null}{" "}
                            {e?.languageBadges?.length ? (
                              <span style={{position:"absolute",right:"7px",bottom:"7px",display:"flex",gap:"4px",flexWrap:"wrap",justifyContent:"flex-end"}}>
                                {e.languageBadges.map((badge) => (
                                  <span key={badge} style={{padding:"3px 6px",borderRadius:"999px",background:"rgba(15,13,11,.86)",border:"1px solid rgba(240,238,233,.14)",fontSize:"9px",fontWeight:"650",letterSpacing:".03em"}}>{badge}</span>
                                ))}
                              </span>
                            ) : null}{" "}
                            {e?.hasPct ? (
                              <>
                                <span
                                  style={{
                                    position: "absolute",
                                    left: "0",
                                    right: "0",
                                    bottom: "0",
                                    height: "3px",
                                    background: "rgba(240,238,233,.2)",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "block",
                                      height: "100%",
                                      width: `${e?.pctW ?? ""}`,
                                      background: "#DBAF57",
                                    }}
                                  />
                                </span>
                              </>
                            ) : null}{" "}
                          </div>
                          <div
                            style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1", minWidth: "0" }}
                          >
                            <span
                              style={{
                                fontSize: "15px",
                                fontWeight: "500",
                                lineHeight: "1.35",
                                display: "-webkit-box",
                                WebkitLineClamp: "2",
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {txt(e?.title)}
                            </span>
                            <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(e?.meta)}</span>
                            {e?.available ? (
                              <>
                                <a
                                  className="nk-hover-1e3fwvz"
                                  href={e?.href}
                                  style={{
                                    alignSelf: "flex-start",
                                    marginTop: "4px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    color: `${e?.ctaColor ?? ""}`,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: "0",
                                      height: "0",
                                      borderLeft: `8px solid ${e?.ctaColor ?? ""}`,
                                      borderTop: "5px solid transparent",
                                      borderBottom: "5px solid transparent",
                                    }}
                                  />
                                  {txt(e?.cta)}
                                </a>
                              </>
                            ) : null}
                            {e?.unavailable ? (
                              <>
                                <span
                                  style={{
                                    alignSelf: "flex-start",
                                    marginTop: "4px",
                                    fontSize: "12px",
                                    fontWeight: "500",
                                    padding: "4px 10px",
                                    borderRadius: "999px",
                                    border: "1px solid rgba(240,238,233,.15)",
                                    color: "#B7B1A4",
                                  }}
                                >
                                  {txt(e?.unavailableText ?? "Dublagem em breve · disponível legendado")}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  {v.showEndHint ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px 24px",
                          padding: "18px 22px",
                          borderRadius: "14px",
                          border: "1px dashed rgba(219,175,87,.35)",
                        }}
                      >
                        <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontSize: "15px", fontWeight: "500" }}>Fim dos episódios lançados</span>
                          <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                            {txt(v.endHintText)}
                          </span>
                        </span>
                        <button
                          className="nk-hover-1e3fwvz"
                          onClick={v.goUniverso}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "#DBAF57",
                          }}
                        >
                          Continuar na obra original →
                        </button>
                      </div>
                    </>
                  ) : null}
                </section>
              </>
            ) : null}
            {v.p?.sobre ? (
              <>
                <section
                  ref={v.refSobre}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "40px 56px",
                    alignItems: "flex-start",
                    scrollMarginTop: "140px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "22px",
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
                      Sobre
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px" }}>
                      {asList(v.synopsis).map((p, $index) => (
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
                            {txt(p)}
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
                              href="/explorar"
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
                              href="/explorar"
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
                            gridTemplateColumns: "120px minmax(0,1fr)",
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
            {v.p?.uni ? (
              <>
                <section
                  ref={v.refUni}
                  style={{ display: "flex", flexDirection: "column", gap: "36px", scrollMarginTop: "140px" }}
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
                      Universo
                    </h2>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                      De onde veio a história, o que já foi adaptado e a ordem para acompanhar.
                    </span>
                  </div>
                  {v.hasOrig ? (
                  <div
                    style={{
                      position: "relative",
                      borderRadius: "18px",
                      overflow: "hidden",
                      border: "1px solid rgba(219,175,87,.22)",
                      background: "#1A1714",
                    }}
                  >
                    {" "}
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
                        aria-label={`Capa de ${v.orig?.title ?? ""}`}
                        style={{
                          width: "clamp(130px,13vw,180px)",
                          aspectRatio: "2/3",
                          backgroundColor: "#221F1B",
                          backgroundImage: `${v.origBg ?? ""}`,
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
                          Obra original
                        </span>
                        <span
                          style={{
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: "38px",
                            fontWeight: "500",
                            lineHeight: "1",
                          }}
                        >
                          {txt(v.orig?.title)}
                        </span>
                        <span style={{ fontSize: "14px", color: "#D9D5CC" }}>
                          {txt(v.orig?.meta)}
                          {" · "}
                          {txt(v.orig?.info)}
                        </span>
                        <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(v.orig?.credits)}</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
                          <a
                            className="nk-hover-1uijps0"
                            href={v.origFirstHref}
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
                            {txt(v.origFirstCta)}
                          </a>
                          {v.orig?.nextCh ? (
                          <button
                            className="nk-hover-1eosf2m"
                            onClick={v.askContinue}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              height: "44px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 20px",
                              borderRadius: "999px",
                              border: "1px solid rgba(219,175,87,.5)",
                              fontSize: "14px",
                              fontWeight: "600",
                              color: "#DBAF57",
                            }}
                          >
                            Continuar após o anime
                          </button>
                          ) : null}
                          <a
                            className="nk-hover-1e3fwvz"
                            href={v.origHref}
                            style={{
                              height: "44px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 16px",
                              fontSize: "14px",
                              color: "#B7B1A4",
                            }}
                          >
                            {txt(v.origPageCta)}
                          </a>
                        </div>
                        {v.continueAsk ? (
                          <>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                                padding: "16px",
                                borderRadius: "12px",
                                background: "#221F1B",
                                border: "1px solid rgba(219,175,87,.3)",
                              }}
                            >
                              <span style={{ fontSize: "14px", fontWeight: "500" }}>
                                {"A animação vai até o capítulo 110. Continuar no capítulo "}
                                {txt(v.orig?.nextCh)}?
                              </span>
                              <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                                As capas e títulos a partir daqui podem revelar acontecimentos que ainda não foram
                                animados. A lista de capítulos abre com miniaturas ocultas.
                              </span>
                              <div style={{ display: "flex", gap: "10px" }}>
                                <a
                                  href={v.origNextHref}
                                  style={{
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
                                  {"Ir para o capítulo "}
                                  {txt(v.orig?.nextCh)}
                                </a>
                                <button
                                  onClick={v.cancelContinue}
                                  style={{
                                    all: "unset",
                                    cursor: "pointer",
                                    height: "38px",
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "0 12px",
                                    fontSize: "13px",
                                    color: "#B7B1A4",
                                  }}
                                >
                                  Agora não
                                </button>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                      {v.hasOrigMap ? (
                      <div
                        style={{
                          flex: "1 1 280px",
                          maxWidth: "380px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                          paddingLeft: "28px",
                          borderLeft: "1px solid rgba(240,238,233,.1)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            letterSpacing: ".24em",
                            textTransform: "uppercase",
                            color: "#B7B1A4",
                            paddingBottom: "10px",
                          }}
                        >
                          O que o anime adaptou
                        </span>
                        {asList(v.orig?.map).map((m, $index) => (
                          <React.Fragment key={$index}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "12px",
                                padding: "12px 0",
                                borderTop: "1px solid rgba(240,238,233,.07)",
                              }}
                            >
                              <span style={{ fontSize: "14px" }}>{txt(m?.season)}</span>
                              <span
                                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "13px", color: "#DBAF57" }}
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
                            paddingTop: "12px",
                            borderTop: "1px solid rgba(240,238,233,.07)",
                          }}
                        >
                          <span
                            style={{ width: "6px", height: "6px", transform: "rotate(45deg)", background: "#9FC79A" }}
                          />
                          Verificado pela equipe · a correspondência é aproximada
                        </span>
                      </div>
                      ) : null}
                    </div>{" "}
                  </div>
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "flex-end",
                        justifyContent: "space-between",
                        gap: "10px",
                      }}
                    >
                      <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "30px", fontWeight: "500" }}>
                        Ordem para assistir
                      </span>
                      <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                        Ordem de lançamento, que aqui coincide com a ordem da história
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                        gap: "16px",
                      }}
                    >
                      {asList(v.order).map((o, $index) => (
                        <React.Fragment key={$index}>
                          <div
                            title="Item informativo da ordem da franquia"
                            style={{
                              display: "flex",
                              gap: "14px",
                              padding: "14px",
                              borderRadius: "14px",
                              background: "#1A1714",
                              border: `1px solid ${o?.border ?? ""}`,
                              color: "#F0EEE9",
                            }}
                          >
                            <img
                              src={o?.cover}
                              alt=""
                              loading="lazy"
                              style={{
                                width: "64px",
                                height: "92px",
                                objectFit: "cover",
                                borderRadius: "6px",
                                display: "block",
                                flexShrink: "0",
                                opacity: `${o?.imgOpacity ?? ""}`,
                              }}
                            />
                            <span style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: "0" }}>
                              <span
                                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#DBAF57" }}
                              >
                                {txt(o?.n)}
                              </span>
                              <span style={{ fontSize: "14px", fontWeight: "500", lineHeight: "1.3" }}>
                                {txt(o?.title)}
                              </span>
                              <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                                {txt(o?.type)}
                                {" · "}
                                {txt(o?.meta)}
                              </span>
                              {o?.hasBadge ? (
                                <>
                                  <span
                                    style={{
                                      alignSelf: "flex-start",
                                      fontSize: "10px",
                                      fontWeight: "600",
                                      letterSpacing: ".1em",
                                      textTransform: "uppercase",
                                      padding: "3px 7px",
                                      borderRadius: "4px",
                                      border: "1px solid rgba(240,238,233,.2)",
                                      color: "#D9D5CC",
                                    }}
                                  >
                                    {txt(o?.badge)}
                                  </span>
                                </>
                              ) : null}
                              {o?.hasNote ? (
                                <>
                                  <span style={{ fontSize: "12px", lineHeight: "1.45", color: "#8F897D" }}>
                                    {txt(o?.note)}
                                  </span>
                                </>
                              ) : null}
                            </span>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "30px", fontWeight: "500" }}>
                      Para ler
                    </span>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
                        gap: "16px",
                      }}
                    >
                      {asList(v.reads).map((r, $index) => (
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
                                <img
                                  src={r?.cover}
                                  alt=""
                                  loading="lazy"
                                  style={{
                                    width: "52px",
                                    height: "76px",
                                    objectFit: "cover",
                                    borderRadius: "5px",
                                    display: "block",
                                    flexShrink: "0",
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
                                  {txt(r?.initials)}
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
                <section
                  ref={v.refChars}
                  style={{ display: "flex", flexDirection: "column", gap: "20px", scrollMarginTop: "140px" }}
                >
                  <div
                    style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}
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
                        Personagens
                      </h2>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                        Toque em um personagem para ver o dublador original.
                      </span>
                    </div>
                    <span title="Todos os personagens cadastrados já estão exibidos" style={{ fontSize: "14px", color: "#8F897D" }}>
                      Lista disponível nesta ficha
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
                        <button
                          className="nk-hover-1pre5km"
                          onClick={c?.open}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            minWidth: "0",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              aspectRatio: "3/4",
                              borderRadius: "12px",
                              overflow: "hidden",
                              background: "#221F1B",
                              border: `1px solid ${c?.border ?? ""}`,
                            }}
                          >
                            <img
                              src={c?.img}
                              alt={c?.name}
                              loading="lazy"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          </span>
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
                            {c?.hasVa ? (
                              <span style={{display:"flex",alignItems:"center",gap:"7px",marginTop:"4px",color:"#B7B1A4",fontSize:"11px",minWidth:0}}>
                                {c?.vaImg ? <img src={c.vaImg} alt="" loading="lazy" style={{width:"24px",height:"24px",borderRadius:"50%",objectFit:"cover",flexShrink:0}} /> : null}
                                <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>🎙 {txt(c?.vaName)}</span>
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </div>
          {v.hasRecs !== false ? (
          <section
            ref={v.refRecs}
            style={{ display: "flex", flexDirection: "column", gap: "20px", scrollMarginTop: "140px" }}
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
                Você também pode gostar
              </h2>
              <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                Outras histórias, fora desta franquia, com o motivo de cada sugestão.
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
                        overflow: "hidden",
                        background: "#221F1B",
                        border: "1px solid rgba(240,238,233,.06)",
                      }}
                    >
                      <img
                        src={r?.cover}
                        alt={r?.title}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </span>
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
          ) : null}
        </main>
        {v.charOpen ? (
          <>
            <div
              onClick={v.closeChar}
              style={{ position: "fixed", inset: "0", zIndex: "70", background: "rgba(10,9,8,.6)" }}
            />
            <aside
              style={{
                position: "fixed",
                top: "0",
                right: "0",
                bottom: "0",
                zIndex: "71",
                width: "min(420px,100vw)",
                background: "#1A1714",
                borderLeft: "1px solid rgba(219,175,87,.2)",
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                overflowY: "auto",
                boxShadow: "-20px 0 50px rgba(0,0,0,.5)",
              }}
            >
              <button
                className="nk-hover-kqh291"
                onClick={v.closeChar}
                aria-label="Fechar"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  alignSelf: "flex-end",
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  color: "#B7B1A4",
                }}
              >
                ×
              </button>
              <span
                role="img"
                aria-label={v.ch?.name}
                style={{
                  width: "100%",
                  aspectRatio: "3/4",
                  backgroundColor: "#221F1B",
                  backgroundImage: `${v.ch?.imgBg ?? ""}`,
                  backgroundSize: "cover",
                  backgroundPosition: "center top",
                  borderRadius: "14px",
                  display: "block",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: ".24em",
                    textTransform: "uppercase",
                    color: "#DBAF57",
                  }}
                >
                  {txt(v.ch?.role)}
                </span>
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: "36px",
                    fontWeight: "500",
                    lineHeight: "1",
                  }}
                >
                  {txt(v.ch?.name)}
                </span>
                <span style={{ fontSize: "14px", color: "#B7B1A4" }}>{txt(v.ch?.native)}</span>
              </div>
              {v.ch?.hasVa ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      padding: "14px",
                      borderRadius: "12px",
                      background: "#221F1B",
                    }}
                  >
                    <span
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        backgroundColor: "#2D2924",
                        backgroundImage: `${v.ch?.vaBg ?? ""}`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        display: "block",
                        flexShrink: "0",
                      }}
                    />
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "12px", color: "#B7B1A4" }}>Dublador original · japonês</span>
                      <span style={{ fontSize: "15px", fontWeight: "500" }}>{txt(v.ch?.vaName)}</span>
                    </span>
                  </div>
                </>
              ) : null}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "14px",
                  borderRadius: "12px",
                  border: "1px dashed rgba(219,175,87,.3)",
                }}
              >
                <span style={{ fontSize: "13px", color: "#D9D5CC" }}>
                  A descrição completa pode revelar acontecimentos da história.
                </span>
                <button
                  onClick={v.toggleSpoiler}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#DBAF57",
                  }}
                >
                  {txt(v.spoilerLabel)}
                </button>
                {v.spoilerOpen ? (
                  <>
                    <span style={{ fontSize: "13px", lineHeight: "1.6", color: "#B7B1A4" }}>
                      Aqui entra a biografia cadastrada pela equipe, marcada por temporada para que o conteúdo revelado
                      acompanhe o progresso de cada pessoa.
                    </span>
                  </>
                ) : null}
              </div>
            </aside>
          </>
        ) : null}
        {v.trailerOpen ? (
          <>
            <div
              onClick={v.closeTrailer}
              style={{
                position: "fixed",
                inset: "0",
                zIndex: "80",
                background: "rgba(10,9,8,.86)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
              }}
            >
              <div style={{ width: "min(1100px,100%)", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "26px" }}>
                    {`Trailer · ${v.workTitle ?? ""}`}
                  </span>
                  <button
                    className="nk-hover-1e3fwvz"
                    onClick={v.closeTrailer}
                    aria-label="Fechar trailer"
                    style={{ all: "unset", cursor: "pointer", fontSize: "28px", color: "#B7B1A4" }}
                  >
                    ×
                  </button>
                </div>
                <iframe
                  src={v.trailerSrc}
                  title={`Trailer de ${v.workTitle ?? ""}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  style={{ width: "100%", aspectRatio: "16/9", border: "0", borderRadius: "12px", background: "#000" }}
                />
              </div>
            </div>
          </>
        ) : null}
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
                  gap: "10px",
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
                    borderLeft: "9px solid #1A1714",
                    borderTop: "6px solid transparent",
                    borderBottom: "6px solid transparent",
                  }}
                />
                {txt(v.ctaLabel)}
              </a>
              <button
                onClick={v.toggleList}
                aria-label="Minha lista"
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
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill={v.listFill} stroke="#DBAF57" strokeWidth="1.8">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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

/**
 * Ficha do design para qualquer anime do catálogo: o mesmo layout, com o documento de
 * apresentação do Java (catálogo + AniList) e o estado pessoal da API v1.
 */
class DynamicObraLogic extends ObraLogic {
  state = { ...this.state, season: 1, unitProg: {}, lib: null };

  componentDidMount() {
    const a = new URLSearchParams(location.search).get("aba");
    if (["eps", "sobre", "uni", "chars"].includes(a)) this.setState({ active: a });
    (this.props.presentation
      ? Promise.resolve(this.props.presentation)
      : api.get(`/api/v1/works/${this.props.presentationId}/presentation`)
    )
      .then((w) => {
        this.setState({ w });
        document.title = `${w.title} — NekoFlow`;
      })
      .catch(() => this.setState({ failed: true }));
    this.loadMe();
    document.addEventListener("scroll", this.onScroll, { passive: true, capture: true });
    window.addEventListener("resize", this.onResize);
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("mousedown", this.onDown);
    window.addEventListener("nk:personal", this.onPersonal);
    this.unsub = session.subscribe(() => this.loadMe());
    this.onResize();
  }
  componentWillUnmount() {
    super.componentWillUnmount();
    window.removeEventListener("nk:personal", this.onPersonal);
    if (this.unsub) this.unsub();
  }
  onPersonal = () => {
    clearTimeout(this.pt);
    this.pt = setTimeout(() => this.loadMe(), 150);
  };
  /** Situação na lista e progresso de cada episódio, pela API v1. */
  loadMe() {
    if (!session.loggedIn) return;
    const id = this.props.presentationId;
    Promise.all([libraryApi.state(id).catch(() => null), progressApi.workUnits(id).catch(() => null)]).then(
      ([lib, p]) => {
        const unitProg = {};
        for (const u of (p && p.episodes) || []) unitProg[u.episodeId] = u;
        this.setState({
          lib,
          unitProg,
          status: lib && lib.status ? STATUS_LABEL[lib.status] : null,
          follow: !!(lib && lib.follow),
        });
      },
    );
  }
  save(req, msg) {
    return req.then(() => this.flash(msg)).catch(() => this.flash("Não foi possível salvar. Tente novamente."));
  }
  renderVals() {
    const base = super.renderVals();
    const s = this.state;
    const w = s.w;
    if (!w) return { ...base, workTitle: "", heroEyebrow: "", statusText: "", hasOrig: false, heroProgress: false };
    const loggedIn = session.loggedIn;
    const id = w.id;
    const bg = (u) => (u ? `url("${u}")` : "none");
    const prog = s.unitProg;
    const resume = s.lib && s.lib.resume;
    const allEps = w.seasons.flatMap((x) => x.eps.map((e) => ({ ...e, season: x })));
    const firstAvailable = allEps.find((e) => e.available);
    const resumeEp = resume && resume.state !== "UP_TO_DATE" ? allEps.find((e) => e.id === resume.unitId) : null;
    const season = w.seasons.find((x) => x.n === s.season) || w.seasons[0] || { eps: [], label: "", n: 1 };
    const lastSeason = w.seasons.length ? w.seasons[w.seasons.length - 1].n : 1;
    let eps = season.eps.map((e) => {
      const p = prog[e.id];
      const done = !!(p && p.completed);
      const isCur = !!resumeEp && resumeEp.id === e.id;
      const pct = p && p.durationMs ? Math.round((p.positionMs / p.durationMs) * 100) : 0;
      const left = p && p.durationMs && !done ? Math.max(1, Math.ceil((p.durationMs - p.positionMs) / 60000)) : null;
      const languageBadges = [
        ...(e.subtitleLanguages || []).map((language) => `CC ${languageBadge(language)}`),
        ...(e.audioLanguages || []).filter((language) => language && language !== "ja").map((language) => `🎙 ${languageBadge(language)}`),
      ].filter((value, index, values) => values.indexOf(value) === index);
      return {
        ...e,
        languageBadges,
        done,
        available: e.available,
        unavailable: !e.available,
        unavailableText: "Ainda sem fonte disponível no NekoFlow",
        href: `/player?episode=${e.id}`,
        hasPct: isCur && pct > 0,
        pctW: `${pct}%`,
        meta: [
          e.durationMin ? `${e.durationMin} min` : null,
          e.audio ? `Áudio ${e.audio === "ja" ? "JA" : e.audio === "pt-BR" ? "PT-BR" : e.audio}` : null,
          e.available && !e.playable ? "abre no provedor" : null,
          isCur && left ? `faltam ${left} min` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        cta: isCur ? "Continuar episódio" : done ? "Assistir de novo" : "Assistir episódio",
        ctaColor: isCur ? "#DBAF57" : done ? "#B7B1A4" : "#F0EEE9",
        bg: isCur ? "rgba(219,175,87,.07)" : "#1A1714",
        border: isCur ? "rgba(219,175,87,.45)" : "rgba(240,238,233,.06)",
        opacity: e.available ? 1 : 0.55,
        filter: e.available ? "none" : "grayscale(.7)",
      };
    });
    if (!s.asc) eps = [...eps].reverse();
    const doneCount = allEps.filter((e) => prog[e.id] && prog[e.id].completed).length;
    const curP = resumeEp ? prog[resumeEp.id] : null;
    const curPct = curP && curP.durationMs ? Math.round((curP.positionMs / curP.durationMs) * 100) : 0;
    const curLeft = curP && curP.durationMs ? Math.max(1, Math.ceil((curP.durationMs - curP.positionMs) / 60000)) : null;
    const target = resumeEp || firstAvailable;
    const sLabel = (e) => (w.seasons.length > 1 ? `T${e.season.n} · ` : "");
    const orig = w.original;
    const origWord = orig ? (orig.typeLabel === "Mangá" ? "mangá" : orig.typeLabel === "Manhwa" ? "manhwa" : "original") : "";
    const STATUS = ["Assistindo", "Planejado", "Concluído", "Pausado", "Abandonado"];
    return {
      ...base,
      w: { ...w, score: w.score || "—", native: w.native || "" },
      workTitle: w.title,
      legacyId: id,
      heroEyebrow: w.heroEyebrow,
      ageRating: null,
      statusText: w.statusText,
      hasTrailer: !!w.trailer,
      heroProgress: loggedIn && !!resumeEp,
      heroProgressText: resumeEp
        ? `${sLabel(resumeEp)}Episódio ${resumeEp.n}${curLeft ? ` · faltam ${curLeft} min` : ""} · ${doneCount} de ${w.episodeCount} assistidos`
        : "",
      heroProgressW: `${curPct}%`,
      bannerBg: bg(w.banner || w.cover),
      coverBg: bg(w.cover),
      origBg: bg(orig && orig.cover),
      genresText: w.genres.join(" · "),
      ctaHref: target ? `/player?episode=${target.id}` : "#",
      ctaLabel: resumeEp
        ? `Continuar ${sLabel(resumeEp)}Ep. ${resumeEp.n}`
        : target
          ? `Assistir ${sLabel(target)}Ep. ${target.n}`
          : "Episódios em breve",
      ctaShort: resumeEp ? `Continuar ep. ${resumeEp.n}` : target ? `Assistir ep. ${target.n}` : "Em breve",
      statusOpts: STATUS.map((l) => ({
        label: l,
        on: s.status === l,
        color: s.status === l ? "#DBAF57" : "#F0EEE9",
        pick: () => {
          this.setState({ status: l, listOpen: false });
          this.save(libraryApi.setStatus(id, STATUS_CODE[l]), `Salvo como ${l}`);
        },
      })),
      removeList: () => {
        this.setState({ status: null, listOpen: false });
        this.save(libraryApi.remove(id), "Removido da sua lista · progresso mantido");
      },
      toggleFollow: () => {
        if (!loggedIn) return goLogin();
        this.setState({ follow: !s.follow });
        this.save(libraryApi.follow(id, !s.follow), s.follow ? "Avisos desativados" : "Você será avisado sobre novidades");
      },
      tabs: [
        ["eps", "Episódios", w.episodeCount],
        ["sobre", "Sobre", null],
        ["uni", "Universo", w.order.length + w.reads.length],
        ["chars", "Personagens", w.chars.length || null],
      ].map(([k, label, count]) => ({
        label,
        count,
        hasCount: count != null,
        sel: String(s.active === k),
        color: s.active === k ? "#DBAF57" : "#B7B1A4",
        line: s.active === k ? "#DBAF57" : "transparent",
        go: () => this.setTab(k),
      })),
      seasonInfo: [
        season.label,
        season.years,
        `${season.eps.length} ${season.eps.length === 1 ? "episódio" : "episódios"}`,
        w.plannedEpisodes && w.plannedEpisodes > w.episodeCount ? `${w.plannedEpisodes} previstos` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      seasonTabs: w.seasons.map((x) => ({
        label: x.short || x.label,
        count: x.eps.length,
        bg: x.n === season.n ? "#DBAF57" : "transparent",
        color: x.n === season.n ? "#1A1714" : "#F0EEE9",
        pick: () => this.setState({ season: x.n }),
      })),
      // Só o áudio que as fontes realmente têm: sem dublagem cadastrada, sem a opção.
      audioTabs: [{ label: "Legendado", bg: "#DBAF57", color: "#1A1714", pick: () => {} }],
      dubNote: false,
      episodes: eps,
      showEndHint: !!orig && season.n === lastSeason,
      endHintText: orig ? `A história continua no ${origWord}. Veja a obra original.` : "",
      synopsis: s.synOpen ? w.synopsis : w.synopsis.slice(0, 1),
      genreTags: w.genres,
      themeTags: w.themes,
      altText: w.alt.join(" · "),
      ficha: w.ficha.map(([k, v]) => ({ k, v })),
      hasOrig: !!orig,
      hasOrigMap: !!(orig && orig.map && orig.map.length),
      orig: orig
        ? { ...orig, meta: orig.meta || "", info: orig.info || "", credits: orig.credits || "", map: orig.map || [] }
        : { map: [], title: "", meta: "", info: "", credits: "", nextCh: "" },
      origHref: orig ? orig.href : "#",
      origFirstHref: orig ? orig.firstHref : "#",
      origNextHref: "#",
      origFirstCta: orig && orig.firstHref !== orig.href ? "Ler do capítulo 1" : "Ver capítulos",
      origPageCta: orig ? `Ver página do ${origWord} →` : "",
      order: w.order.map((o) => ({
        ...o,
        hasBadge: !!o.badge,
        hasNote: !!o.note,
        border: o.badge === "Anunciado" ? "rgba(240,238,233,.06)" : "rgba(219,175,87,.18)",
        imgOpacity: o.badge === "Anunciado" ? 0.6 : 1,
      })),
      reads: w.reads.map((r) => ({ ...r, href: r.href || "#", hasCover: !!r.cover, noCover: !r.cover })),
      hasRecs: w.recs.length > 0,
      recs: w.recs.map((r) => ({ ...r, href: r.href || "#" })),
    };
  }
}

const LegacyObra = defineDC("Obra", ObraLogic, render, { helmet });
const DynamicObra = defineDC("Obra", DynamicObraLogic, render, { helmet });

export default function Obra(props) {
  return props.presentationId ? <DynamicObra key={props.presentationId} {...props} /> : <LegacyObra {...props} />;
}
