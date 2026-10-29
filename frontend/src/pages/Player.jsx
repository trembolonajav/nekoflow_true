// Origem: design/claude-design/Player.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css, val } from "../dc/runtime";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { session, goLogin } from "../lib/session";
import { progressApi } from "../features/progress/progressApi";
import { saveUnit, recordOpened, loadWork } from "../lib/progress";
import { canonicalWorks } from "../features/catalog/workNavigation";
import { mediaApi, ISSUE_CATEGORIES } from "../features/media/mediaApi";
import {
  loadMediaPreferences,
} from "../features/preferences/preferencesApi";
import {
  groupVersions,
  versionOf,
  providerOf,
  rememberedProvider,
  rememberProvider,
} from "../features/media/serverGroups";
import { track } from "../features/telemetry/telemetry";
import {
  normalizePreferences,
  rankByPreference,
  preferenceScore,
  substitutionNotice,
} from "../features/preferences/mediaPreferences";
import {
  browserSupport,
  rankSources,
  pickSource,
  createWatchMeter,
  languageName,
  sourceLanguageSummary,
} from "../features/media/playbackRules";
import { getLocale, subscribeLocale, translate } from "../i18n/locale";

const WORK_ID = 151807;

class PlayerLogic extends DCLogic {
  DUR = 1440;
  OP = [90, 180];
  ED = [1300, 1390];
  state = {
    w: null,
    ep: (() => {
      const q = parseInt(new URLSearchParams(location.search).get("ep"), 10);
      return q >= 1 && q <= 25 ? q : 1;
    })(),
    t: 0,
    playing: false,
    played: 0,
    sinceSave: 0,
    savedAt: null,
    prog: {},
    resume: false,
    vol: 80,
    muted: false,
    cc: true,
    audio: "ja",
    subs: "pt",
    quality: "auto",
    speed: 1,
    autoNext: true,
    autoSkip: false,
    src: "auto",
    loading: false,
    loadingText: "",
    error: false,
    menu: null,
    sub: null,
    eps: false,
    nextDismissed: false,
    countdown: 10,
    active: true,
    hover: null,
    dragging: false,
    fs: false,
    narrow: false,
    synOpen: false,
    report: false,
    reportReason: null,
    reportText: "",
    toast: null,
    osd: null,
  };
  stageRef = React.createRef();
  barRef = React.createRef();
  rowRef = React.createRef();
  load(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  }
  store(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }
  /** Envia a posição da unidade para o servidor (fonte única de progresso). */
  sync(n, entry, reset) {
    saveUnit(WORK_ID, n, {
      position: Math.floor(entry.t || 0),
      duration: this.DUR,
      pct: entry.done ? 100 : Math.round(((entry.t || 0) / this.DUR) * 1000) / 10,
      completed: !!entry.done,
      reset: !!reset,
    });
  }
  componentDidMount() {
    const pp = this.load("nk-player", {});
    const q = parseInt(new URLSearchParams(location.search).get("ep"), 10);
    this.setState({ speed: pp.speed || 1, vol: pp.vol ?? 80, muted: !!pp.muted });
    // Preferências e progresso vêm da conta; visitante começa do episódio pedido ou do 1.
    const cfgP = session.loggedIn ? api.get("/api/me/preferences").catch(() => ({})) : Promise.resolve({});
    Promise.all([cfgP, loadWork(WORK_ID)]).then(([cfg, me]) => {
      cfg = cfg || {};
      this.cfg = cfg;
      const prog = {};
      Object.entries((me && me.units) || {}).forEach(
        ([n, u]) => (prog[n] = { t: u.done ? this.DUR : u.t || 0, done: u.done }),
      );
      const ep = q >= 1 && q <= 25 ? q : me && me.resumeUnit && me.resumeUnit <= 25 ? me.resumeUnit : 1;
      this.setState({
        prog,
        autoNext: cfg.autoplay ?? true,
        autoSkip: cfg.skip ?? false,
        audio: cfg.audio === "Português" ? "pt" : "ja",
        subs: cfg.subs === "Desligadas" ? "off" : cfg.subs === "Inglês" ? "en" : "pt",
      });
      this.enter(ep, prog, false);
    });
    api.get("/api/content/obra")
      .then((w) => this.setState({ w }));
    this.tick = setInterval(this.step, 250);
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("mousedown", this.onDown);
    document.addEventListener("fullscreenchange", this.onFs);
    window.addEventListener("resize", this.onResize);
    this.onResize();
    window.addEventListener("beforeunload", this.persist);
  }
  componentWillUnmount() {
    this.persist();
    clearInterval(this.tick);
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("mousedown", this.onDown);
    document.removeEventListener("fullscreenchange", this.onFs);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("beforeunload", this.persist);
  }
  onResize = () => {
    const n = window.innerWidth < 720;
    if (n !== this.state.narrow) this.setState({ narrow: n });
  };
  onFs = () => this.setState({ fs: !!document.fullscreenElement });
  onDown = (e) => {
    if (
      (this.state.menu || this.state.eps || this.state.srvOpen) &&
      !(e.target.closest && e.target.closest("[data-nk-pmenu]"))
    )
      this.setState({ menu: null, sub: null, eps: false, srvOpen: false });
  };
  persist = () => {
    const s = this.state;
    if (!s.ep) return;
    const entry = { ...(s.prog[s.ep] || {}), t: Math.floor(s.t) };
    const prog = { ...s.prog, [s.ep]: entry };
    // Só grava quando houve reprodução real (abrir a página não conta como assistir).
    if (s.played > 0 || s.t > 0) this.sync(s.ep, entry);
    this.setState({ prog, sinceSave: 0, savedAt: Date.now() });
  };
  enter(n, prog, autoplay) {
    const p = (prog || this.state.prog)[n];
    const resumeT = p && !p.done && p.t > 30 && p.t < this.ED[0] ? p.t : 0;
    this.setState({
      cOpen: false,
      cText: "",
      cTs: null,
      cSpoiler: false,
      cReplyTo: null,
      cRevealed: {},
      cOpenReplies: {},
    });
    this.setState({
      ep: n,
      t: autoplay ? 0 : resumeT,
      played: 0,
      resume: !autoplay && resumeT > 0,
      playing: !!autoplay,
      nextDismissed: false,
      countdown: 10,
      error: !!this.props.simularErro && !autoplay,
      eps: false,
      menu: null,
      sub: null,
      synOpen: false,
    });
    try {
      history.replaceState(null, "", `?ep=${n}`);
    } catch (e) {}
    recordOpened(WORK_ID, n);
  }
  goEp(n, autoplay) {
    if (n < 1 || n > 25 || n === this.state.ep) return;
    this.persist();
    setTimeout(() => this.enter(n, null, autoplay), 0);
    const el = document.scrollingElement || document.documentElement;
    try {
      el.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {}
  }
  flash(t) {
    clearTimeout(this.tt);
    this.setState({ toast: t });
    this.tt = setTimeout(() => this.setState({ toast: null }), 2200);
  }
  showOsd(t) {
    clearTimeout(this.ot);
    this.setState({ osd: t });
    this.ot = setTimeout(() => this.setState({ osd: null }), 900);
  }
  seek(t, label) {
    const nt = Math.max(0, Math.min(this.DUR - 1, t));
    this.setState({ t: nt, nextDismissed: nt < this.ED[0] ? false : this.state.nextDismissed, countdown: 10 });
    setTimeout(this.persist, 0);
    if (label) this.showOsd(label);
  }
  step = () => {
    const s = this.state;
    if (s.active && s.playing && !s.menu && !s.eps && !s.dragging && Date.now() - (this.lastMove || 0) > 2600)
      this.setState({ active: false });
    if (!s.playing || s.loading || s.error || s.resume || s.dragging) return;
    const dt = 0.25 * s.speed;
    let t = s.t + dt;
    const played = s.played + dt;
    let sinceSave = s.sinceSave + dt;
    const patch = { t, played, sinceSave };
    if (s.autoSkip && t >= this.OP[0] && t < this.OP[1] && s.t < this.OP[0] + 1) {
      patch.t = t = this.OP[1];
      this.showOsd("Abertura pulada");
    }
    const hasNext = s.ep < 25;
    if (t >= this.ED[0] && hasNext && !s.nextDismissed && s.autoNext) {
      const c = s.countdown - 0.25;
      patch.countdown = c;
      if (c <= 0) {
        this.markDone(s.ep, played);
        this.goEp(s.ep + 1, true);
        return;
      }
    }
    if (t >= this.DUR) {
      patch.t = this.DUR;
      patch.playing = false;
      this.setState(patch);
      this.markDone(s.ep, played);
      return;
    }
    this.setState(patch);
    if (sinceSave >= 15) this.persist();
  };
  markDone(n, played) {
    if (played < this.DUR * 0.5) {
      this.persist();
      return;
    }
    const prog = { ...this.state.prog, [n]: { t: this.DUR, done: true } };
    this.sync(n, prog[n]);
    this.setState({ prog });
    this.flash(`Episódio ${n} marcado como assistido`);
  }
  onKey = (e) => {
    if (/input|textarea|select/i.test((document.activeElement || {}).tagName || "") || this.state.report) return;
    const k = e.key.toLowerCase();
    const s = this.state;
    const map = {
      " ": () => this.togglePlay(),
      k: () => this.togglePlay(),
      arrowleft: () => this.seek(s.t - 10, "−10 s"),
      arrowright: () => this.seek(s.t + 10, "+10 s"),
      j: () => this.seek(s.t - 10, "−10 s"),
      l: () => this.seek(s.t + 10, "+10 s"),
      m: () => this.toggleMute(),
      f: () => this.toggleFs(),
      c: () => this.toggleCC(),
      n: () => this.goEp(s.ep + 1, true),
      escape: () => this.setState({ menu: null, sub: null, eps: false }),
    };
    if (map[k]) {
      e.preventDefault();
      this.wake();
      map[k]();
    }
  };
  wake = () => {
    this.lastMove = Date.now();
    if (!this.state.active) this.setState({ active: true });
  };
  togglePlay = () => {
    const s = this.state;
    if (s.resume || s.error) return;
    if (s.t >= this.DUR) this.setState({ t: 0, played: 0 });
    this.setState({ playing: !s.playing });
    if (s.playing) setTimeout(this.persist, 0);
    this.wake();
  };
  toggleMute = () => {
    const muted = !this.state.muted;
    this.setState({ muted });
    this.store("nk-player", { speed: this.state.speed, vol: this.state.vol, muted });
    this.showOsd(muted ? "Sem som" : `Volume ${this.state.vol}%`);
  };
  toggleCC = () => {
    const s = this.state;
    const subs = s.subs === "off" ? "pt" : "off";
    this.setState({ subs });
    this.showOsd(subs === "off" ? "Legendas desligadas" : "Legendas: Português");
  };
  toggleFs = () => {
    const el = this.stageRef.current;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el && el.requestFullscreen) el.requestFullscreen();
    } catch (e) {}
  };
  barT(clientX) {
    const r = this.barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * this.DUR;
  }
  setSource(k) {
    if (k === this.state.src && !this.state.error) {
      this.setState({ menu: null });
      return;
    }
    const was = this.state.playing;
    const t = this.state.t;
    const names = { auto: "Automática", f1: "Fonte 1", f2: "Fonte 2" };
    this.setState({
      src: k,
      menu: null,
      loading: true,
      error: false,
      loadingText: `Carregando ${names[k]}…`,
      playing: false,
    });
    setTimeout(() => {
      this.setState({ loading: false, t, playing: was || this.state.playing });
      this.flash(`${names[k]} · posição mantida em ${this.fmt(t)}`);
    }, 1100);
  }
  BASE_C = [
    {
      id: "c1",
      name: "Rafael",
      handle: "rafa.k",
      mins: 120,
      likes: 128,
      text: "A direção das cenas de luta neste episódio ficou absurda. Dá para sentir o cuidado em cada quadro.",
      replies: [
        {
          id: "c1r1",
          name: "Beatriz",
          handle: "biaw",
          mins: 70,
          likes: 14,
          text: "Concordo! E a trilha sonora nessa parte ajudou demais.",
        },
        {
          id: "c1r2",
          name: "Caio",
          handle: "caiio",
          mins: 40,
          likes: 3,
          text: "Assisti duas vezes só por causa disso.",
        },
      ],
    },
    {
      id: "c2",
      name: "Lucas",
      handle: "lucasmt",
      mins: 180,
      likes: 64,
      ts: 924,
      text: "Alguém mais voltou para rever esse trecho? O trabalho de som está muito bom.",
      replies: [],
    },
    {
      id: "c3",
      name: "Juliana",
      handle: "jujuh",
      mins: 300,
      likes: 41,
      spoiler: true,
      text: "Quem leu o manhwa sabe o que vem nos próximos capítulos. Preparem o coração.",
      replies: [
        { id: "c3r1", name: "Pedro", handle: "pedroh", mins: 250, likes: 6, text: "Sem spoilers aqui, por favor 😅" },
      ],
    },
    {
      id: "c4",
      name: "Thiago",
      handle: "thi.go",
      mins: 1500,
      likes: 9,
      text: "A legenda ficou fora de sincronia por alguns segundos na Fonte 2. Reportei, e na automática estava certa.",
      replies: [],
    },
  ];
  saveC(mine) {
    this.store("nk-comments", mine);
    this.setState({ myC: mine });
  }
  ago(m) {
    return m < 1
      ? "agora"
      : m < 60
        ? `há ${m} min`
        : m < 1440
          ? `há ${Math.round(m / 60)} h`
          : `há ${Math.round(m / 1440)} dia${Math.round(m / 1440) > 1 ? "s" : ""}`;
  }
  commentVals(loggedIn) {
    const s = this.state;
    const ep = s.ep;
    const mine = (s.myC || this.load("nk-comments", {}))[ep] || [];
    const likes = s.cLikes || {};
    const revealed = s.cRevealed || {};
    const openR = s.cOpenReplies || {};
    const now = Date.now();
    const myRepliesFor = (id) => mine.filter((m) => m.parent === id);
    const PAL = ["#3A3128", "#2F3530", "#33293A", "#2A3138"];
    const need = () => {
      if (!loggedIn) {
        location.href = "/entrar";
        return true;
      }
      return false;
    };
    const likeOf = (id, base) => {
      const on = !!likes[id];
      return {
        likes: base + (on ? 1 : 0),
        likedStr: String(on),
        likeColor: on ? "#DBAF57" : "#B7B1A4",
        likeFill: on ? "#DBAF57" : "none",
        like: () => {
          if (need()) return;
          this.setState({ cLikes: { ...likes, [id]: !on } });
        },
      };
    };
    const person = (c, i) => ({
      initial: c.name[0],
      avBg: c.mine ? "#2D2924" : PAL[i % PAL.length],
      avColor: c.mine ? "#DBAF57" : "#F0EEE9",
    });
    const toItem = (c, i) => {
      const rep = [
        ...(c.replies || []),
        ...myRepliesFor(c.id).map((r) => ({ ...r, mins: Math.round((now - r.at) / 60000) })),
      ];
      const hidden = c.spoiler && !revealed[c.id] && !c.mine;
      return {
        ...c,
        ...person(c, i),
        ...likeOf(c.id, c.likes || 0),
        when: this.ago(c.mins),
        hasTs: c.ts != null,
        tsLabel: c.ts != null ? this.fmt(c.ts) : "",
        seekTs: () => {
          this.seek(c.ts, `Indo para ${this.fmt(c.ts)}`);
          const el = document.scrollingElement || document.documentElement;
          try {
            el.scrollTo({ top: 0, behavior: "smooth" });
          } catch (e) {}
        },
        hidden,
        showText: !hidden,
        reveal: () => this.setState({ cRevealed: { ...revealed, [c.id]: true } }),
        mine: !!c.mine,
        notMine: !c.mine,
        remove: () => {
          const all = { ...(s.myC || this.load("nk-comments", {})) };
          all[ep] = (all[ep] || []).filter((m) => m.id !== c.id && m.parent !== c.id);
          this.saveC(all);
          this.flash("Comentário excluído");
        },
        report: () => {
          if (need()) return;
          this.flash("Denúncia enviada para a moderação");
        },
        reply: () => {
          if (need()) return;
          this.setState({ cReplyTo: s.cReplyTo === c.id ? null : c.id, cReplyText: "" });
        },
        replyOpen: s.cReplyTo === c.id,
        sendReply: () => {
          const t = (s.cReplyText || "").trim();
          if (!t) return;
          const all = { ...(s.myC || this.load("nk-comments", {})) };
          all[ep] = [
            ...(all[ep] || []),
            {
              id: `m${now}`,
              parent: c.id,
              name: session.user.name || "Você",
              handle: session.user.username || "voce",
              mine: true,
              at: now,
              likes: 0,
              text: t,
            },
          ];
          this.saveC(all);
          this.setState({ cReplyTo: null, cReplyText: "", cOpenReplies: { ...openR, [c.id]: true } });
        },
        replies: rep.map((r, j) => ({
          ...r,
          ...person(r, j + 1),
          ...likeOf(r.id, r.likes || 0),
          when: this.ago(r.mins),
        })),
        hasReplies: rep.length > 0,
        repliesOpen: !!openR[c.id] && rep.length > 0,
        repliesLabel: openR[c.id]
          ? "Ocultar respostas"
          : `Ver ${rep.length} ${rep.length === 1 ? "resposta" : "respostas"}`,
        toggleReplies: () => this.setState({ cOpenReplies: { ...openR, [c.id]: !openR[c.id] } }),
      };
    };
    const tops = [
      ...mine.filter((m) => !m.parent).map((m) => ({ ...m, mins: Math.round((now - m.at) / 60000), replies: [] })),
      ...this.BASE_C,
    ];
    const sort = s.cSort || "rel";
    const sorted =
      sort === "rel"
        ? [...tops].sort((a, b) => (b.mine ? 1e6 : b.likes) - (a.mine ? 1e6 : a.likes))
        : [...tops].sort((a, b) => a.mins - b.mins);
    const count = tops.length + tops.reduce((n, c) => n + (c.replies || []).length + myRepliesFor(c.id).length, 0);
    const text = s.cText || "";
    const can = text.trim().length > 0;
    const pill = (on) => ({ bg: on ? "#DBAF57" : "transparent", color: on ? "#1A1714" : "#F0EEE9" });
    const sp = !!s.cSpoiler;
    return {
      epN: ep,
      cCount: count,
      cCountText: `${count} ${count === 1 ? "comentário" : "comentários"}`,
      cOpen: !!s.cOpen,
      cClosed: !s.cOpen,
      openComments: () => this.setState({ cOpen: true }),
      closeComments: () => this.setState({ cOpen: false }),
      cSorts: [
        ["rel", "Mais curtidos"],
        ["new", "Mais recentes"],
      ].map(([k, l]) => ({ label: l, ...pill(sort === k), pick: () => this.setState({ cSort: k }) })),
      comments: sorted.map(toItem),
      cText: text,
      onCText: (e) => this.setState({ cText: e.target.value }),
      cLen: text.length,
      cFocus: () => this.setState({ cFocused: true }),
      cRows: s.cFocused || text ? 3 : 1,
      cBoxBorder: s.cFocused ? "rgba(219,175,87,.45)" : "rgba(240,238,233,.08)",
      cHasTs: s.cTs != null,
      cTsLabel: s.cTs != null ? this.fmt(s.cTs) : "",
      cAddTs: () => this.setState({ cTs: Math.floor(s.t), cFocused: true }),
      cClearTs: () => this.setState({ cTs: null }),
      cSpoiler: sp,
      cToggleSpoiler: () => this.setState({ cSpoiler: !sp }),
      cSpBorder: sp ? "#DBAF57" : "rgba(240,238,233,.14)",
      cSpBg: sp ? "rgba(219,175,87,.1)" : "transparent",
      cSpColor: sp ? "#DBAF57" : "#D9D5CC",
      cSpBox: sp ? "#DBAF57" : "transparent",
      cPostBg: can ? "#DBAF57" : "#4A443D",
      cPostCursor: can ? "pointer" : "not-allowed",
      cPost: () => {
        if (!can) return;
        const all = { ...(s.myC || this.load("nk-comments", {})) };
        all[ep] = [
          {
            id: `m${now}`,
            name: session.user.name || "Você",
            handle: session.user.username || "voce",
            mine: true,
            at: now,
            likes: 0,
            text: text.trim(),
            ts: s.cTs != null ? s.cTs : undefined,
            spoiler: sp,
          },
          ...(all[ep] || []),
        ];
        this.saveC(all);
        this.setState({ cText: "", cTs: null, cSpoiler: false, cFocused: false, cSort: "new" });
        this.flash("Comentário publicado");
      },
      replyText: s.cReplyText || "",
      onReplyText: (e) => this.setState({ cReplyText: e.target.value }),
      cancelReply: () => this.setState({ cReplyTo: null, cReplyText: "" }),
      replyBg: (s.cReplyText || "").trim() ? "#DBAF57" : "#4A443D",
      replyCursor: (s.cReplyText || "").trim() ? "pointer" : "not-allowed",
    };
  }
  fmt(x) {
    x = Math.max(0, Math.floor(x));
    return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  }
  renderVals() {
    const s = this.state;
    const w = s.w;
    const all = w ? [...w.seasons[0].eps, ...w.seasons[1].eps] : [];
    const ep = all.find((e) => e.n === s.ep) || { n: s.ep, title: "", thumb: "", pos: "center", dub: true };
    const seasonN = s.ep <= 12 ? 1 : 2;
    const seasonEps = w ? w.seasons[seasonN - 1].eps : [];
    const nextEp = all.find((e) => e.n === s.ep + 1);
    const bg = (u) => (u ? `url("${u}")` : "none");
    const dubOk = ep.dub;
    const audioEff = s.audio === "pt" && !dubOk ? "ja" : s.audio;
    const pctN = s.t / this.DUR;
    const inOp = s.t >= this.OP[0] && s.t < this.OP[1];
    const inEnd = s.t >= this.ED[0];
    const ctrls = !s.playing || s.active || !!s.menu || s.eps || s.dragging;
    const overlayBlock = s.resume || s.error || s.loading;
    const narrow = s.narrow;
    const btn = narrow ? "44px" : "40px";
    const srcNames = { auto: "Automática", f1: "Fonte 1", f2: "Fonte 2" };
    const audioName = { ja: "Japonês", pt: "Português" }[audioEff];
    const subsName = { off: "Desligadas", pt: "Português (Brasil)", en: "Inglês", forced: "Somente forçadas" }[s.subs];
    const qName = { auto: "Automática · 1080p", 1080: "1080p", 720: "720p", 480: "480p" }[s.quality];
    const spName = s.speed === 1 ? "Normal" : `${String(s.speed).replace(".", ",")}x`;
    const SUBS = {
      audio: [
        "Áudio",
        [
          ["ja", "Japonês", "Original"],
          ["pt", "Português (Brasil)", dubOk ? "Dublagem" : "Indisponível neste episódio", !dubOk],
        ],
      ],
      subs: [
        "Legendas",
        [
          ["off", "Desligadas"],
          ["pt", "Português (Brasil)", "Completa"],
          ["en", "Inglês", "Completa"],
          ["forced", "Somente forçadas", "Placas e falas em outro idioma"],
        ],
      ],
      quality: [
        "Qualidade",
        [
          ["auto", "Automática", "Ajusta à sua conexão · recomendada"],
          ["1080", "1080p"],
          ["720", "720p"],
          ["480", "480p"],
        ],
      ],
      speed: [
        "Velocidade",
        [
          [0.75, "0,75x"],
          [1, "Normal"],
          [1.25, "1,25x"],
          [1.5, "1,5x"],
          [2, "2x"],
        ],
      ],
    };
    const keyOf = { audio: "audio", subs: "subs", quality: "quality", speed: "speed" };
    const subOpts = s.sub
      ? SUBS[s.sub][1].map(([v, l, d, dis]) => {
          const cur = s.sub === "audio" ? audioEff : s[keyOf[s.sub]];
          return {
            label: l,
            desc: d || "",
            hasDesc: !!d,
            on: cur === v,
            color: cur === v ? "#DBAF57" : "#F0EEE9",
            opacity: dis ? 0.45 : 1,
            cursor: dis ? "not-allowed" : "pointer",
            pick: () => {
              if (dis) return;
              const patch = { [keyOf[s.sub]]: v, sub: null };
              this.setState(patch);
              if (s.sub === "speed") this.store("nk-player", { speed: v, vol: s.vol, muted: s.muted });
              this.showOsd(`${SUBS[s.sub][0]}: ${l}`);
            },
          };
        })
      : [];
    const tog = (on) => ({
      track: on ? "#DBAF57" : "#2D2924",
      knob: on ? "#1A1714" : "#B7B1A4",
      x: on ? "21px" : "3px",
    });
    const saveCfg = (k, v) => {
      this.cfg = { ...(this.cfg || {}), [k]: v };
      if (session.loggedIn) api.put("/api/me/preferences", this.cfg).catch(() => {});
    };
    const prog = s.prog;
    const epItem = (e) => {
      const p = prog[e.n] || {};
      const isCur = e.n === s.ep;
      const pctE = isCur ? pctN : (p.t || 0) / this.DUR;
      return {
        ...e,
        isCur,
        done: !!p.done && !isCur,
        hasPct: !p.done && pctE > 0.02,
        pctW: `${Math.round(pctE * 100)}%`,
        bgImg: bg(e.thumb),
        ring: isCur ? "#DBAF57" : "transparent",
        titleColor: isCur ? "#DBAF57" : "#F0EEE9",
        bg: isCur ? "rgba(219,175,87,.08)" : "transparent",
        border: isCur ? "rgba(219,175,87,.4)" : "transparent",
        numColor: isCur ? "#DBAF57" : "#B7B1A4",
        state: isCur ? "assistindo agora" : p.done ? "assistido" : p.t > 30 ? `parou em ${this.fmt(p.t)}` : "24 min",
        go: () => this.goEp(e.n, false),
      };
    };
    const epList = seasonEps.map(epItem);
    const curDone = !!(prog[s.ep] || {}).done;
    const hover = s.hover;
    const subLines = [
      "Legenda de exemplo · o texto do episódio aparece aqui",
      "[Fala do personagem]",
      "Legenda de exemplo · sincronizada com o vídeo",
    ];
    const subText =
      s.subs === "forced"
        ? "[Placa em coreano: Associação de Caçadores]"
        : s.subs === "en"
          ? "Sample subtitle · English track"
          : subLines[Math.floor(s.t / 6) % subLines.length];
    const showSub = s.subs !== "off" && !overlayBlock && !(s.subs === "forced" && Math.floor(s.t / 20) % 3 !== 0);
    const RR = [
      "O vídeo não carrega",
      "Áudio no idioma errado",
      "Legenda fora de sincronia",
      "Episódio errado",
      "Outro problema",
    ];
    const sinceSaved = s.savedAt ? Math.round((Date.now() - s.savedAt) / 1000) : null;
    const isNextSeason = nextEp && nextEp.n === 13;
    const loggedIn = session.loggedIn;
    return {
      loggedIn,
      // Valores do player demonstrativo; o player real (RealPlayerLogic) substitui todos.
      demoBanner: true,
      workTitle: "Solo Leveling",
      workHref: canonicalWorks.soloLevelingAnime,
      origHref: `${canonicalWorks.soloLevelingReading}?aba=adapt`,
      origCta: "Ver o manhwa →",
      hasOrig: true,
      realVideo: false,
      commentsOn: true,
      errorTitle: "Não foi possível carregar o vídeo",
      errorSaved: true,
      tryOtherLabel: "Tentar outra fonte",
      retryLabel: "Tentar novamente",
      durText: "24:00",
      synText:
        "A sinopse do episódio, cadastrada pela equipe, aparece aqui. Ela fica recolhida por padrão para quem ainda não assistiu.",
      meInitial: session.user.initial || "?",
      guest: !loggedIn,
      ...this.commentVals(loggedIn),
      stageRef: this.stageRef,
      barRef: this.barRef,
      rowRef: this.rowRef,
      stageMax: s.fs ? "100vw" : "1280px",
      stageMaxH: s.fs ? "100vh" : "calc(100vh - 150px)",
      stageHeight: s.fs ? "100vh" : "auto",
      stageRadius: s.fs ? "0px" : "14px",
      stageCursor: ctrls ? "default" : "none",
      crumb: `Temporada ${seasonN} · Episódio ${s.ep}`,
      crumbShort: `T${seasonN} · Episódio ${s.ep}`,
      savedText:
        sinceSaved == null
          ? "Progresso sincronizado"
          : sinceSaved < 5
            ? "Progresso salvo agora"
            : `Progresso salvo há ${sinceSaved} s`,
      frameBg: bg(ep.thumb),
      framePos: ep.pos || "center",
      frameDim: s.playing ? 1 : 0.6,
      stageClick: () => {
        if (s.menu || s.eps) {
          this.setState({ menu: null, sub: null, eps: false });
          return;
        }
        if (narrow && !s.active) {
          this.wake();
          return;
        }
        this.togglePlay();
      },
      wake: this.wake,
      sleepNow: () => {
        if (s.playing && !s.menu && !s.eps) this.setState({ active: false });
      },
      showSub,
      subText,
      subSize: narrow ? "14px" : s.fs ? "28px" : "20px",
      subBottom: ctrls ? (narrow ? "96px" : "108px") : "40px",
      showBigPlay: !s.playing && !overlayBlock && !narrow,
      loading: s.loading,
      loadingText: s.loadingText,
      error: s.error,
      errorText: `A ${srcNames[s.src]} não respondeu.`,
      tryOther: () => this.setSource(s.src === "f2" ? "f1" : "f2"),
      retry: () => this.setSource(s.src),
      resumeAsk: s.resume,
      resumeText: this.fmt(s.t),
      resumePct: `${Math.round(pctN * 100)}%`,
      resumeYes: () => this.setState({ resume: false, playing: true }),
      resumeNo: () => this.setState({ resume: false, t: 0, playing: true }),
      showTop: ctrls && !overlayBlock && s.fs,
      showSkipOp: inOp && !s.autoSkip && !overlayBlock,
      skipOp: () => this.seek(this.OP[1], "Abertura pulada"),
      skipBottom: ctrls ? (narrow ? "100px" : "110px") : "28px",
      showNext: inEnd && !s.nextDismissed && !overlayBlock && (!!nextEp || s.t >= this.DUR - 1),
      next: nextEp
        ? {
            label:
              s.autoNext && s.playing
                ? `Próximo em ${Math.ceil(s.countdown)} s`
                : isNextSeason
                  ? "A seguir · Temporada 2"
                  : "A seguir",
            title: `Episódio ${nextEp.n} · ${nextEp.title}`,
            meta: "24 min",
            bg: bg(nextEp.thumb),
            pos: nextEp.pos || "center",
            hasCount: s.autoNext && s.playing,
            countPct: `${Math.max(0, ((10 - s.countdown) / 10) * 100)}%`,
            cta: "Assistir próximo",
            go: () => {
              this.markDone(s.ep, s.played);
              this.goEp(s.ep + 1, true);
            },
            dismissLabel: s.autoNext && s.playing ? "Cancelar" : "Ver créditos",
          }
        : {
            label: "Fim da animação",
            title: "Você chegou ao último episódio lançado",
            meta: "A história continua no manhwa",
            bg: bg(ep.thumb),
            pos: "center",
            hasCount: false,
            countPct: "0%",
            cta: "Continuar na obra original",
            go: () => {
              location.href = `${canonicalWorks.soloLevelingAnime}?aba=uni`;
            },
            dismissLabel: "Fechar",
          },
      dismissNext: () => this.setState({ nextDismissed: true }),
      showControls: ctrls && !s.resume && !s.error,
      barH: hover != null || s.dragging ? "6px" : "4px",
      knobScale: hover != null || s.dragging ? 1 : 0.7,
      pct: `${pctN * 100}%`,
      bufPct: `${Math.min(100, pctN * 100 + 9)}%`,
      opLeft: `${(this.OP[0] / this.DUR) * 100}%`,
      opW: `${((this.OP[1] - this.OP[0]) / this.DUR) * 100}%`,
      edLeft: `${(this.ED[0] / this.DUR) * 100}%`,
      edW: `${((this.ED[1] - this.ED[0]) / this.DUR) * 100}%`,
      hoverOn: hover != null && !narrow,
      hoverLeft: `${((hover || 0) / this.DUR) * 100}%`,
      hoverText: this.fmt(hover || 0),
      hoverChapter:
        hover >= this.OP[0] && hover < this.OP[1]
          ? "Abertura"
          : hover >= this.ED[0] && hover < this.ED[1]
            ? "Encerramento"
            : "",
      barHover: (e) => this.setState({ hover: this.barT(e.clientX) }),
      barLeave: () => this.setState({ hover: null }),
      barDown: (e) => {
        e.preventDefault();
        this.setState({ dragging: true, t: this.barT(e.clientX) });
        const mv = (ev) => this.setState({ t: this.barT(ev.clientX), hover: this.barT(ev.clientX) });
        const up = (ev) => {
          document.removeEventListener("pointermove", mv);
          document.removeEventListener("pointerup", up);
          this.setState({ dragging: false, hover: null });
          this.seek(this.barT(ev.clientX));
        };
        document.addEventListener("pointermove", mv);
        document.addEventListener("pointerup", up);
      },
      ctrlGap: narrow ? "2px" : "6px",
      btn,
      wideCtrls: !narrow,
      playing: s.playing,
      paused: !s.playing,
      playLabel: s.playing ? "Pausar" : "Reproduzir",
      togglePlay: this.togglePlay,
      back10: () => this.seek(s.t - 10, "−10 s"),
      fwd10: () => this.seek(s.t + 10, "+10 s"),
      toggleMute: this.toggleMute,
      muteLabel: s.muted ? "Ativar som" : "Silenciar",
      volPath:
        s.muted || s.vol === 0
          ? "M22 9l-6 6M16 9l6 6"
          : s.vol < 50
            ? "M15.5 8.5a5 5 0 0 1 0 7"
            : "M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14",
      volVal: s.muted ? 0 : s.vol,
      onVol: (e) => {
        const vol = +e.target.value;
        this.setState({ vol, muted: vol === 0 });
        this.store("nk-player", { speed: s.speed, vol, muted: vol === 0 });
      },
      timeText: this.fmt(s.t),
      hasNextEp: !!nextEp,
      goNextNow: () => {
        if (nextEp) this.goEp(s.ep + 1, true);
      },
      toggleCC: this.toggleCC,
      ccColor: s.subs === "off" ? "#8F897D" : "#DBAF57",
      toggleEps: () => this.setState({ eps: !s.eps, menu: null }),
      epsColor: s.eps ? "#DBAF57" : "#F0EEE9",
      toggleSource: () => this.setState({ menu: s.menu === "src" ? null : "src", sub: null, eps: false }),
      srcOpen: s.menu === "src",
      srcColor: s.menu === "src" ? "#DBAF57" : "#F0EEE9",
      sources: [
        ["auto", "Automática", "Escolhe a melhor fonte disponível", true],
        ["f1", "Fonte 1", "Reprodução integrada · progresso automático"],
        ["f2", "Fonte 2", "Alternativa autorizada"],
      ].map(([k, l, d, rec]) => ({
        label: l,
        desc: d,
        rec: !!rec,
        on: s.src === k,
        color: s.src === k ? "#DBAF57" : "#F0EEE9",
        bg: s.src === k ? "rgba(219,175,87,.08)" : "transparent",
        pick: () => this.setSource(k),
      })),
      toggleSettings: () => this.setState({ menu: s.menu === "set" ? null : "set", sub: null, eps: false }),
      setOpen: s.menu === "set",
      setColor: s.menu === "set" ? "#DBAF57" : "#F0EEE9",
      gearRot: s.menu === "set" ? "60deg" : "0deg",
      menuMaxH: s.fs ? "70vh" : "min(420px, calc(100vh - 260px))",
      setMain: !s.sub,
      setSub: !!s.sub,
      subTitle: s.sub ? SUBS[s.sub][0] : "",
      subOpts,
      setBack: () => this.setState({ sub: null }),
      setRows: [
        ["audio", "Áudio", audioName],
        ["subs", "Legendas", subsName],
        ["quality", "Qualidade", qName],
        ["speed", "Velocidade", spName],
      ].map(([k, l, v]) => ({ label: l, value: v, open: () => this.setState({ sub: k }) })),
      setToggles: [
        {
          label: "Próximo episódio automático",
          desc: "Contagem de 10 s no encerramento",
          on: s.autoNext,
          toggle: () => {
            this.setState({ autoNext: !s.autoNext });
            saveCfg("autoplay", !s.autoNext);
          },
        },
        {
          label: "Pular abertura automaticamente",
          desc: "Quando o episódio tiver marcação",
          on: s.autoSkip,
          toggle: () => {
            this.setState({ autoSkip: !s.autoSkip });
            saveCfg("skip", !s.autoSkip);
          },
        },
      ].map((r) => ({ ...r, ...tog(r.on) })),
      toggleFs: this.toggleFs,
      fsLabel: s.fs ? "Sair da tela cheia" : "Tela cheia",
      fsPath: s.fs ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
      epsOpen: s.eps,
      epList,
      seasonLabel: seasonN === 1 ? "Temporada 1" : "Temporada 2 · Arise from the Shadow",
      osd: !!s.osd,
      osdText: s.osd || "",
      ep,
      chips: [
        `24 min`,
        `Áudio ${audioName}`,
        s.subs === "off"
          ? "Sem legenda"
          : `Legenda ${s.subs === "en" ? "EN" : s.subs === "forced" ? "forçada" : "PT-BR"}`,
        s.quality === "auto" ? "Qualidade automática" : `${s.quality}p`,
        `Fonte ${(srcNames[s.src] || "").toLowerCase()}`,
      ],
      fallbackNote: s.audio === "pt" && !dubOk,
      synOpen: s.synOpen,
      synLabel: s.synOpen ? "Ocultar sinopse" : "Mostrar sinopse do episódio",
      toggleSyn: () => this.setState({ synOpen: !s.synOpen }),
      goPrev: () => this.goEp(s.ep - 1, false),
      prevCursor: s.ep > 1 ? "pointer" : "not-allowed",
      prevOpacity: s.ep > 1 ? 1 : 0.4,
      nextCursor: nextEp ? "pointer" : "not-allowed",
      nextBg: nextEp ? "#DBAF57" : "#4A443D",
      nextColor: "#1A1714",
      toggleDone: () => {
        const p = { ...prog, [s.ep]: curDone ? { t: Math.floor(s.t), done: false } : { t: this.DUR, done: true } };
        this.sync(s.ep, p[s.ep], curDone);
        this.setState({ prog: p });
        this.flash(curDone ? "Marcado como não assistido" : `Episódio ${s.ep} marcado como assistido`);
      },
      doneLabel: curDone ? "Assistido · desfazer" : "Marcar como assistido",
      doneColor: curDone ? "#DBAF57" : "#F0EEE9",
      doneBorder: curDone ? "rgba(219,175,87,.6)" : "rgba(240,238,233,.18)",
      origText:
        seasonN === 1
          ? "A Temporada 1 adapta os capítulos 1 a 45 do manhwa Solo Leveling."
          : "A Temporada 2 adapta os capítulos 46 a 110 do manhwa Solo Leveling.",
      openReport: () => this.setState({ report: true, menu: null, playing: false }),
      closeReport: () => this.setState({ report: false, reportReason: null, reportText: "" }),
      reportOpen: s.report,
      reportCtx: `T${seasonN} · Episódio ${s.ep} · em ${this.fmt(s.t)} · ${srcNames[s.src]}`,
      reportOpts: RR.map((l) => {
        const on = s.reportReason === l;
        return {
          label: l,
          border: on ? "#DBAF57" : "rgba(240,238,233,.1)",
          bg: on ? "rgba(219,175,87,.08)" : "transparent",
          dotBorder: on ? "#DBAF57" : "rgba(240,238,233,.3)",
          dot: on ? "#DBAF57" : "transparent",
          pick: () => this.setState({ reportReason: l }),
        };
      }),
      reportText: s.reportText,
      onReportText: (e) => this.setState({ reportText: e.target.value }),
      reportBg: s.reportReason ? "#DBAF57" : "#4A443D",
      reportCursor: s.reportReason ? "pointer" : "not-allowed",
      sendReport: () => {
        if (!s.reportReason) return;
        this.setState({ report: false, reportReason: null, reportText: "" });
        this.flash("Obrigado! A equipe vai verificar este episódio.");
      },
      toast: !!s.toast,
      toastText: s.toast || "",
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
    text: "\nbody{margin:0;background:#0F0D0B;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\n@keyframes nkspin{to{transform:rotate(360deg)}}\ninput[type=range]{accent-color:#DBAF57}\ntextarea::placeholder{color:#8F897D}\n",
  },
];

function render(v) {
  return (
    <>
      <div style={{ minHeight: "100vh", background: "#0F0D0B", display: "flex", flexDirection: "column" }}>
        <Header
          active=""
          solid={true}
          __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
        />
        {v.demoBanner ? (
        <div
          role="status"
          style={{
            position: "fixed",
            top: "68px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 55,
            padding: "6px 12px",
            borderRadius: "999px",
            background: "rgba(23,20,17,.94)",
            border: "1px solid rgba(219,175,87,.45)",
            color: "#D9D5CC",
            fontSize: "11px",
            maxWidth: "calc(100vw - 32px)",
            textAlign: "center",
          }}
        >
          Demonstração de interface · nenhuma fonte oficial de vídeo integrada
        </div>
        ) : null}
        <div
          style={{
            padding: "132px clamp(16px,3.3vw,48px) 0",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: `${v.stageMax ?? ""}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              minHeight: "40px",
            }}
          >
            <a
              className="nk-hover-1d5grei"
              href={v.workHref}
              style={{ display: "flex", alignItems: "center", gap: "10px", color: "#F0EEE9", minWidth: "0" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ flexShrink: "0" }}
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {txt(v.workTitle)}
                </span>
                <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(v.crumb)}</span>
              </span>
            </a>
            <span style={{ fontSize: "12px", color: "#8F897D", whiteSpace: "nowrap" }}>{txt(v.savedText)}</span>
          </div>
          {v.showVersions ? (
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: `${v.stageMax ?? ""}`,
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  padding: "4px",
                  borderRadius: "999px",
                  background: "#1A1714",
                  border: "1px solid rgba(240,238,233,.08)",
                  flexWrap: "wrap",
                }}
              >
                {asList(v.versions).map((o, $index) => (
                  <button
                    key={$index}
                    type="button"
                    onClick={o?.pick}
                    aria-pressed={!!o?.on}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      height: "36px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "0 16px",
                      borderRadius: "999px",
                      fontSize: "13px",
                      fontWeight: "500",
                      background: `${o?.bg ?? ""}`,
                      color: `${o?.color ?? ""}`,
                    }}
                  >
                    {txt(o?.label)}
                  </button>
                ))}
              </div>
              <span style={{ flex: "1" }} />
              <button
                type="button"
                data-nk-pmenu="1"
                className="nk-hover-srv"
                onClick={v.toggleSrv}
                aria-expanded={!!v.srvOpen}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  height: "44px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "0 14px",
                  borderRadius: "999px",
                  border: `1px solid ${v.srvBorder ?? ""}`,
                  fontSize: "13px",
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: `${v.srvDot ?? ""}` }} />
                <span style={{ color: "#B7B1A4" }}>Servidor</span>
                <span style={{ fontWeight: "600" }}>{txt(v.srvName)}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {v.srvOpen ? (
                <div
                  data-nk-pmenu="1"
                  style={{
                    position: "absolute",
                    top: "52px",
                    right: "0",
                    zIndex: 5,
                    width: "min(340px,100%)",
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
                    {txt(v.srvHead)}
                  </span>
                  {asList(v.servers).map((r, $index) => (
                    <button
                      key={$index}
                      type="button"
                      className="nk-hover-srvitem"
                      onClick={r?.pick}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px",
                        borderRadius: "8px",
                        background: `${r?.bg ?? ""}`,
                      }}
                    >
                      <span
                        style={{ width: "7px", height: "7px", borderRadius: "50%", background: `${r?.dot ?? ""}`, flexShrink: "0" }}
                      />
                      <span style={{ display: "flex", flexDirection: "column", gap: "1px", flex: "1" }}>
                        <span style={{ fontSize: "14px", color: `${r?.color ?? ""}` }}>{txt(r?.name)}</span>
                        <span style={{ fontSize: "12px", color: "#8F897D" }}>{txt(r?.sub)}</span>
                      </span>
                      {r?.on ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DBAF57" strokeWidth="2.6">
                          <path d="M5 12l5 5 9-10" />
                        </svg>
                      ) : null}
                    </button>
                  ))}
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
                    Lembramos o servidor que funcionou para você.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div
            ref={v.stageRef}
            onMouseMove={v.wake}
            onMouseLeave={v.sleepNow}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: `${v.stageMax ?? ""}`,
              height: `${v.stageHeight ?? ""}`,
              aspectRatio: "16/9",
              maxHeight: `${v.stageMaxH ?? ""}`,
              background: "#000",
              borderRadius: `${v.stageRadius ?? ""}`,
              overflow: "hidden",
              cursor: `${v.stageCursor ?? ""}`,
              userSelect: "none",
            }}
          >
            {" "}
            <span
              style={{
                position: "absolute",
                inset: "0",
                backgroundImage: `${v.frameBg ?? ""}`,
                backgroundSize: "cover",
                backgroundPosition: `${v.framePos ?? ""}`,
                filter: `brightness(${v.frameDim ?? ""})`,
                transition: "filter .3s",
              }}
            />{" "}
            {v.embedUrl ? (
              <iframe
                src={v.embedUrl}
                title={`${v.workTitle || "Anime"} · player incorporado`}
                allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                style={{
                  position: "absolute",
                  inset: "0",
                  width: "100%",
                  height: "100%",
                  border: "0",
                  background: "#000",
                }}
              />
            ) : v.realVideo ? (
              <video
                ref={v.videoRef}
                playsInline
                preload="metadata"
                poster={v.videoPoster || undefined}
                style={{
                  position: "absolute",
                  inset: "0",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "transparent",
                }}
              />
            ) : null}{" "}
            {!v.embedUrl ? (
              <span onClick={v.stageClick} onDoubleClick={v.toggleFs} style={{ position: "absolute", inset: "0" }} />
            ) : null}{" "}
            {v.showSub ? (
              <>
                {" "}
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: `${v.subBottom ?? ""}`,
                    transform: "translateX(-50%)",
                    maxWidth: "80%",
                    textAlign: "center",
                    fontSize: `${v.subSize ?? ""}`,
                    fontWeight: "500",
                    lineHeight: "1.35",
                    color: "#fff",
                    background: "rgba(0,0,0,.55)",
                    padding: "4px 12px",
                    borderRadius: "4px",
                    transition: "bottom .25s",
                    pointerEvents: "none",
                  }}
                >
                  {txt(v.subText)}
                </span>{" "}
              </>
            ) : null}{" "}
            {v.showBigPlay ? (
              <>
                {" "}
                <button
                  className="nk-hover-1eosgod"
                  onClick={v.togglePlay}
                  aria-label="Reproduzir"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "84px",
                    height: "84px",
                    margin: "-42px 0 0 -42px",
                    borderRadius: "50%",
                    background: "rgba(23,20,17,.72)",
                    border: "1px solid rgba(219,175,87,.6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      width: "0",
                      height: "0",
                      marginLeft: "6px",
                      borderLeft: "24px solid #DBAF57",
                      borderTop: "15px solid transparent",
                      borderBottom: "15px solid transparent",
                    }}
                  />
                </button>{" "}
              </>
            ) : null}{" "}
            {v.loading ? (
              <>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "14px",
                    background: "rgba(10,9,8,.55)",
                  }}
                >
                  <span
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      border: "3px solid rgba(219,175,87,.25)",
                      borderTopColor: "#DBAF57",
                      animation: "nkspin .8s linear infinite",
                    }}
                  />
                  <span style={{ fontSize: "13px", color: "#D9D5CC" }}>{txt(v.loadingText)}</span>
                </div>{" "}
              </>
            ) : null}{" "}
            {v.error ? (
              <>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(10,9,8,.88)",
                    padding: "24px",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "440px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "12px",
                    }}
                  >
                    <img
                      src="/assets/nekoflow-mascot.png"
                      alt=""
                      style={{ width: "84px", height: "84px", objectFit: "contain" }}
                    />
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "28px", fontWeight: "500" }}>
                      {txt(v.errorTitle)}
                    </span>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                      {txt(v.errorText)}
                      {v.errorSaved ? (
                        <>
                          {" Sua posição em "}
                          {txt(v.timeText)}
                          {" está salva."}
                        </>
                      ) : null}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: "10px",
                        marginTop: "6px",
                      }}
                    >
                      <button
                        onClick={v.tryOther}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "42px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 18px",
                          borderRadius: "999px",
                          background: "#DBAF57",
                          color: "#1A1714",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        {txt(v.tryOtherLabel)}
                      </button>
                      <button
                        onClick={v.retry}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "42px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 18px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.25)",
                          fontSize: "14px",
                        }}
                      >
                        {txt(v.retryLabel)}
                      </button>
                      <a
                        href={v.workHref}
                        style={{
                          height: "42px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 12px",
                          fontSize: "14px",
                          color: "#B7B1A4",
                        }}
                      >
                        Voltar à obra
                      </a>
                    </div>
                  </div>
                </div>{" "}
              </>
            ) : null}{" "}
            {v.resumeAsk ? (
              <>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(10,9,8,.6)",
                    padding: "24px",
                  }}
                >
                  <div
                    style={{
                      width: "min(420px,100%)",
                      padding: "26px",
                      borderRadius: "16px",
                      background: "rgba(26,23,20,.96)",
                      border: "1px solid rgba(219,175,87,.3)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          letterSpacing: ".24em",
                          textTransform: "uppercase",
                          color: "#DBAF57",
                        }}
                      >
                        {txt(v.crumbShort)}
                      </span>
                      <span
                        style={{
                          fontFamily: "'Cormorant Garamond',serif",
                          fontSize: "30px",
                          fontWeight: "500",
                          lineHeight: "1.05",
                        }}
                      >
                        Continuar de onde parou?
                      </span>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                        {"Você parou em "}
                        {txt(v.resumeText)}. O progresso é o mesmo em todos os seus dispositivos.
                      </span>
                    </div>
                    <span
                      style={{
                        display: "block",
                        height: "3px",
                        borderRadius: "2px",
                        background: "rgba(240,238,233,.15)",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          width: `${v.resumePct ?? ""}`,
                          background: "#DBAF57",
                        }}
                      />
                    </span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        className="nk-hover-1c8eb9m"
                        onClick={v.resumeYes}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          flex: "1",
                          height: "46px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "10px",
                          borderRadius: "999px",
                          background: "#DBAF57",
                          color: "#1A1714",
                          fontSize: "14px",
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
                        {"Continuar de "}
                        {txt(v.resumeText)}
                      </button>
                      <button
                        className="nk-hover-ucdklh"
                        onClick={v.resumeNo}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "46px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 18px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.25)",
                          fontSize: "14px",
                        }}
                      >
                        Desde o início
                      </button>
                    </div>
                  </div>
                </div>{" "}
              </>
            ) : null}{" "}
            {v.showTop ? (
              <>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    left: "0",
                    right: "0",
                    top: "0",
                    padding: "18px 22px 40px",
                    background: "linear-gradient(180deg,rgba(0,0,0,.7),rgba(0,0,0,0))",
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    pointerEvents: "none",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>{txt(v.workTitle)}</span>
                  <span style={{ fontSize: "13px", color: "#D9D5CC" }}>{txt(v.crumb)}</span>
                </div>{" "}
              </>
            ) : null}{" "}
            {v.showSkipOp ? (
              <>
                {" "}
                <button
                  className="nk-hover-14cw581"
                  onClick={v.skipOp}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    position: "absolute",
                    right: "22px",
                    bottom: `${v.skipBottom ?? ""}`,
                    height: "44px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "0 18px",
                    borderRadius: "8px",
                    background: "rgba(23,20,17,.85)",
                    border: "1px solid rgba(219,175,87,.6)",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#F0EEE9",
                    transition: "bottom .25s",
                  }}
                >
                  Pular abertura
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 4l10 8-10 8zM17 4h2v16h-2z" />
                  </svg>
                </button>{" "}
              </>
            ) : null}{" "}
            {v.showNext ? (
              <>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    right: "22px",
                    bottom: `${v.skipBottom ?? ""}`,
                    width: "min(380px,calc(100% - 44px))",
                    borderRadius: "14px",
                    overflow: "hidden",
                    background: "rgba(23,20,17,.96)",
                    border: "1px solid rgba(219,175,87,.35)",
                    boxShadow: "0 20px 40px rgba(0,0,0,.5)",
                    transition: "bottom .25s",
                  }}
                >
                  {" "}
                  <div style={{ display: "flex", gap: "14px", padding: "14px" }}>
                    <span
                      style={{
                        width: "120px",
                        aspectRatio: "16/9",
                        borderRadius: "8px",
                        flexShrink: "0",
                        backgroundImage: `${v.next?.bg ?? ""}`,
                        backgroundSize: "cover",
                        backgroundPosition: `${v.next?.pos ?? ""}`,
                      }}
                    />
                    <span style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "600",
                          letterSpacing: ".22em",
                          textTransform: "uppercase",
                          color: "#DBAF57",
                        }}
                      >
                        {txt(v.next?.label)}
                      </span>
                      <span style={{ fontSize: "14px", fontWeight: "500", lineHeight: "1.3" }}>
                        {txt(v.next?.title)}
                      </span>
                      <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(v.next?.meta)}</span>
                    </span>
                  </div>{" "}
                  {v.next?.hasCount ? (
                    <>
                      <span style={{ display: "block", height: "3px", background: "rgba(240,238,233,.12)" }}>
                        <span
                          style={{
                            display: "block",
                            height: "100%",
                            width: `${v.next?.countPct ?? ""}`,
                            background: "#DBAF57",
                            transition: "width .25s linear",
                          }}
                        />
                      </span>
                    </>
                  ) : null}{" "}
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      padding: "12px 14px",
                      borderTop: "1px solid rgba(240,238,233,.07)",
                    }}
                  >
                    <button
                      onClick={v.next?.go}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        flex: "1",
                        height: "40px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        borderRadius: "999px",
                        background: "#DBAF57",
                        color: "#1A1714",
                        fontSize: "13px",
                        fontWeight: "600",
                      }}
                    >
                      {txt(v.next?.cta)}
                    </button>
                    <button
                      onClick={v.dismissNext}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "40px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 14px",
                        borderRadius: "999px",
                        border: "1px solid rgba(240,238,233,.2)",
                        fontSize: "13px",
                      }}
                    >
                      {txt(v.next?.dismissLabel)}
                    </button>
                  </div>{" "}
                </div>{" "}
              </>
            ) : null}{" "}
            {v.showControls ? (
              <>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    left: "0",
                    right: "0",
                    bottom: "0",
                    padding: "48px 18px 12px",
                    background: "linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,0))",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    ref={v.barRef}
                    onPointerDown={v.barDown}
                    onMouseMove={v.barHover}
                    onMouseLeave={v.barLeave}
                    style={{
                      position: "relative",
                      height: "18px",
                      display: "flex",
                      alignItems: "center",
                      cursor: "pointer",
                      touchAction: "none",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: "0",
                        right: "0",
                        height: `${v.barH ?? ""}`,
                        borderRadius: "3px",
                        background: "rgba(240,238,233,.22)",
                        transition: "height .15s",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: "0",
                        width: `${v.bufPct ?? ""}`,
                        height: `${v.barH ?? ""}`,
                        borderRadius: "3px",
                        background: "rgba(240,238,233,.35)",
                        transition: "height .15s",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: `${v.opLeft ?? ""}`,
                        width: `${v.opW ?? ""}`,
                        height: `${v.barH ?? ""}`,
                        background: "rgba(219,175,87,.25)",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: `${v.edLeft ?? ""}`,
                        width: `${v.edW ?? ""}`,
                        height: `${v.barH ?? ""}`,
                        background: "rgba(219,175,87,.25)",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: "0",
                        width: `${v.pct ?? ""}`,
                        height: `${v.barH ?? ""}`,
                        borderRadius: "3px",
                        background: "#DBAF57",
                        transition: "height .15s",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        left: `${v.pct ?? ""}`,
                        width: "14px",
                        height: "14px",
                        marginLeft: "-7px",
                        borderRadius: "50%",
                        background: "#DBAF57",
                        boxShadow: "0 0 0 4px rgba(219,175,87,.25)",
                        transform: `scale(${v.knobScale ?? ""})`,
                        transition: "transform .15s",
                      }}
                    />
                    {v.hoverOn ? (
                      <>
                        <span
                          style={{
                            position: "absolute",
                            left: `${v.hoverLeft ?? ""}`,
                            bottom: "22px",
                            transform: "translateX(-50%)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "4px",
                            pointerEvents: "none",
                          }}
                        >
                          <span style={{ fontSize: "11px", fontWeight: "500", color: "#DBAF57" }}>
                            {txt(v.hoverChapter)}
                          </span>
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: "12px",
                              background: "rgba(23,20,17,.92)",
                              border: "1px solid rgba(219,175,87,.3)",
                              padding: "3px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            {txt(v.hoverText)}
                          </span>
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: `${v.ctrlGap ?? ""}` }}>
                    <button
                      className="nk-hover-1d5grei"
                      onClick={v.togglePlay}
                      aria-label={v.playLabel}
                      title={`${v.playLabel ?? ""} (espaço)`}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        width: `${v.btn ?? ""}`,
                        height: `${v.btn ?? ""}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                        color: "#F0EEE9",
                      }}
                    >
                      {v.playing ? (
                        <>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        </>
                      ) : null}
                      {v.paused ? (
                        <>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7 4l13 8-13 8z" />
                          </svg>
                        </>
                      ) : null}
                    </button>
                    <button
                      className="nk-hover-1d5grei"
                      onClick={v.back10}
                      aria-label="Voltar 10 segundos"
                      title="Voltar 10 s (←)"
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        width: `${v.btn ?? ""}`,
                        height: `${v.btn ?? ""}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                        color: "#F0EEE9",
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      >
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                        <text
                          x="12"
                          y="15.5"
                          fontSize="7"
                          textAnchor="middle"
                          fill="currentColor"
                          stroke="none"
                          fontFamily="Inter"
                          fontWeight="700"
                        >
                          10
                        </text>
                      </svg>
                    </button>
                    <button
                      className="nk-hover-1d5grei"
                      onClick={v.fwd10}
                      aria-label="Avançar 10 segundos"
                      title="Avançar 10 s (→)"
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        width: `${v.btn ?? ""}`,
                        height: `${v.btn ?? ""}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                        color: "#F0EEE9",
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      >
                        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                        <path d="M21 3v5h-5" />
                        <text
                          x="12"
                          y="15.5"
                          fontSize="7"
                          textAnchor="middle"
                          fill="currentColor"
                          stroke="none"
                          fontFamily="Inter"
                          fontWeight="700"
                        >
                          10
                        </text>
                      </svg>
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        className="nk-hover-1d5grei"
                        onClick={v.toggleMute}
                        aria-label={v.muteLabel}
                        title={`${v.muteLabel ?? ""} (M)`}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          width: `${v.btn ?? ""}`,
                          height: `${v.btn ?? ""}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "8px",
                          color: "#F0EEE9",
                        }}
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" />
                          <path d={v.volPath} />
                        </svg>
                      </button>
                      {v.wideCtrls ? (
                        <>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={val(v.volVal)}
                            onChange={v.onVol}
                            aria-label="Volume"
                            style={{ width: "84px" }}
                          />
                        </>
                      ) : null}
                    </div>
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: "13px",
                        color: "#F0EEE9",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {txt(v.timeText)} <span style={{ color: "#B7B1A4" }}>/ {txt(v.durText)}</span>
                    </span>
                    <span style={{ flex: "1" }} />
                    {v.hasNextEp ? (
                      <>
                        <button
                          className="nk-hover-1d5grei"
                          onClick={v.goNextNow}
                          aria-label="Próximo episódio"
                          title="Próximo episódio (N)"
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            height: `${v.btn ?? ""}`,
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "0 10px",
                            borderRadius: "8px",
                            fontSize: "13px",
                            fontWeight: "500",
                            color: "#F0EEE9",
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M5 4l10 8-10 8zM17 4h2v16h-2z" />
                          </svg>
                          {v.wideCtrls ? (
                            <>
                              <span>Próximo</span>
                            </>
                          ) : null}
                        </button>
                      </>
                    ) : null}
                    <button
                      className="nk-hover-1d5grei"
                      onClick={v.toggleCC}
                      aria-label="Legendas"
                      title="Legendas (C)"
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        width: `${v.btn ?? ""}`,
                        height: `${v.btn ?? ""}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                        color: `${v.ccColor ?? ""}`,
                      }}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <rect x="2" y="5" width="20" height="14" rx="3" />
                        <path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3" strokeLinecap="round" />
                      </svg>
                    </button>
                    <div data-nk-pmenu="1" style={{ position: "relative" }}>
                      {" "}
                      <button
                        className="nk-hover-1d5grei"
                        onClick={v.toggleEps}
                        aria-label="Episódios"
                        title="Episódios"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          width: `${v.btn ?? ""}`,
                          height: `${v.btn ?? ""}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "8px",
                          color: `${v.epsColor ?? ""}`,
                        }}
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <path d="M4 6h16M4 12h16M4 18h10" />
                        </svg>
                      </button>{" "}
                    </div>
                    <div data-nk-pmenu="1" style={{ position: "relative" }}>
                      {" "}
                      <button
                        className="nk-hover-1d5grei"
                        onClick={v.toggleSource}
                        aria-label="Fonte de reprodução"
                        title="Fonte de reprodução"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          width: `${v.btn ?? ""}`,
                          height: `${v.btn ?? ""}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "8px",
                          color: `${v.srcColor ?? ""}`,
                        }}
                      >
                        <svg
                          width="21"
                          height="21"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <rect x="3" y="4" width="18" height="6" rx="2" />
                          <rect x="3" y="14" width="18" height="6" rx="2" />
                          <path d="M7 7h.01M7 17h.01" />
                        </svg>
                      </button>{" "}
                      {v.srcOpen ? (
                        <>
                          {" "}
                          <div
                            style={{
                              position: "absolute",
                              right: "0",
                              bottom: "calc(100% + 12px)",
                              width: "300px",
                              background: "rgba(23,20,17,.97)",
                              border: "1px solid rgba(219,175,87,.25)",
                              borderRadius: "12px",
                              padding: "8px",
                              boxShadow: "0 16px 40px rgba(0,0,0,.6)",
                              display: "flex",
                              flexDirection: "column",
                              cursor: "default",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: "600",
                                letterSpacing: ".22em",
                                textTransform: "uppercase",
                                color: "#8F897D",
                                padding: "8px 10px 6px",
                              }}
                            >
                              Fonte de reprodução
                            </span>
                            {asList(v.sources).map((o, $index) => (
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
                                    gap: "10px",
                                    padding: "10px",
                                    borderRadius: "8px",
                                    background: `${o?.bg ?? ""}`,
                                  }}
                                >
                                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        fontSize: "14px",
                                        fontWeight: "500",
                                        color: `${o?.color ?? ""}`,
                                      }}
                                    >
                                      {txt(o?.label)}
                                      {o?.rec ? (
                                        <>
                                          <span
                                            style={{
                                              fontSize: "9px",
                                              fontWeight: "700",
                                              letterSpacing: ".12em",
                                              padding: "2px 5px",
                                              borderRadius: "3px",
                                              background: "#DBAF57",
                                              color: "#1A1714",
                                            }}
                                          >
                                            RECOMENDADA
                                          </span>
                                        </>
                                      ) : null}
                                    </span>
                                    <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(o?.desc)}</span>
                                  </span>
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
                            <span
                              style={{ fontSize: "12px", lineHeight: "1.5", color: "#8F897D", padding: "4px 10px" }}
                            >
                              Ao trocar, a posição atual é mantida.
                            </span>
                            <button
                              className="nk-hover-zuhwcw"
                              onClick={v.openReport}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                padding: "8px 10px",
                                borderRadius: "8px",
                                fontSize: "13px",
                                color: "#DBAF57",
                              }}
                            >
                              Reportar problema de reprodução
                            </button>
                          </div>{" "}
                        </>
                      ) : null}{" "}
                    </div>
                    <div data-nk-pmenu="1" style={{ position: "relative" }}>
                      {" "}
                      <button
                        className="nk-hover-1d5grei"
                        onClick={v.toggleSettings}
                        aria-label="Configurações do player"
                        title="Configurações"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          width: `${v.btn ?? ""}`,
                          height: `${v.btn ?? ""}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "8px",
                          color: `${v.setColor ?? ""}`,
                        }}
                      >
                        <svg
                          width="21"
                          height="21"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ transform: `rotate(${v.gearRot ?? ""})`, transition: "transform .3s" }}
                        >
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </button>{" "}
                      {v.setOpen ? (
                        <>
                          {" "}
                          <div
                            style={{
                              position: "absolute",
                              right: "0",
                              bottom: "calc(100% + 12px)",
                              width: "310px",
                              maxHeight: `${v.menuMaxH ?? ""}`,
                              overflowY: "auto",
                              background: "rgba(23,20,17,.97)",
                              border: "1px solid rgba(219,175,87,.25)",
                              borderRadius: "12px",
                              padding: "8px",
                              boxShadow: "0 16px 40px rgba(0,0,0,.6)",
                              display: "flex",
                              flexDirection: "column",
                              cursor: "default",
                            }}
                          >
                            {v.setMain ? (
                              <>
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                  {asList(v.setRows).map((r, $index) => (
                                    <React.Fragment key={$index}>
                                      <button
                                        className="nk-hover-zuhwcw"
                                        onClick={r?.open}
                                        style={{
                                          all: "unset",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: "12px",
                                          padding: "11px 10px",
                                          borderRadius: "8px",
                                          fontSize: "14px",
                                        }}
                                      >
                                        <span style={{ color: "#F0EEE9" }}>{txt(r?.label)}</span>
                                        <span
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            fontSize: "13px",
                                            color: "#B7B1A4",
                                          }}
                                        >
                                          {txt(r?.value)}
                                          <svg
                                            width="12"
                                            height="12"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.2"
                                          >
                                            <path d="m9 18 6-6-6-6" />
                                          </svg>
                                        </span>
                                      </button>
                                    </React.Fragment>
                                  ))}
                                  <span
                                    style={{ height: "1px", background: "rgba(240,238,233,.08)", margin: "6px 4px" }}
                                  />
                                  {asList(v.setToggles).map((r, $index) => (
                                    <React.Fragment key={$index}>
                                      <button
                                        className="nk-hover-zuhwcw"
                                        onClick={r?.toggle}
                                        style={{
                                          all: "unset",
                                          cursor: "pointer",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: "12px",
                                          padding: "10px",
                                          borderRadius: "8px",
                                        }}
                                      >
                                        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                          <span style={{ fontSize: "14px", color: "#F0EEE9" }}>{txt(r?.label)}</span>
                                          <span style={{ fontSize: "12px", color: "#8F897D" }}>{txt(r?.desc)}</span>
                                        </span>
                                        <span
                                          style={{
                                            width: "40px",
                                            height: "22px",
                                            borderRadius: "999px",
                                            background: `${r?.track ?? ""}`,
                                            position: "relative",
                                            flexShrink: "0",
                                          }}
                                        >
                                          <span
                                            style={{
                                              position: "absolute",
                                              top: "3px",
                                              left: `${r?.x ?? ""}`,
                                              width: "16px",
                                              height: "16px",
                                              borderRadius: "50%",
                                              background: `${r?.knob ?? ""}`,
                                              transition: "left .2s",
                                            }}
                                          />
                                        </span>
                                      </button>
                                    </React.Fragment>
                                  ))}
                                </div>
                              </>
                            ) : null}
                            {v.setSub ? (
                              <>
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                  <button
                                    onClick={v.setBack}
                                    style={{
                                      all: "unset",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "10px",
                                      fontSize: "14px",
                                      fontWeight: "600",
                                      color: "#F0EEE9",
                                      borderBottom: "1px solid rgba(240,238,233,.08)",
                                      marginBottom: "4px",
                                    }}
                                  >
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.2"
                                    >
                                      <path d="m15 18-6-6 6-6" />
                                    </svg>
                                    {txt(v.subTitle)}
                                  </button>
                                  {asList(v.subOpts).map((o, $index) => (
                                    <React.Fragment key={$index}>
                                      <button
                                        className="nk-hover-zuhwcw"
                                        onClick={o?.pick}
                                        style={{
                                          all: "unset",
                                          cursor: `${o?.cursor ?? ""}`,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: "10px",
                                          padding: "10px",
                                          borderRadius: "8px",
                                          opacity: `${o?.opacity ?? ""}`,
                                        }}
                                      >
                                        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                          <span style={{ fontSize: "14px", color: `${o?.color ?? ""}` }}>
                                            {txt(o?.label)}
                                          </span>
                                          {o?.hasDesc ? (
                                            <>
                                              <span style={{ fontSize: "12px", color: "#8F897D" }}>{txt(o?.desc)}</span>
                                            </>
                                          ) : null}
                                        </span>
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
                                </div>
                              </>
                            ) : null}
                          </div>{" "}
                        </>
                      ) : null}{" "}
                    </div>
                    <button
                      className="nk-hover-1d5grei"
                      onClick={v.toggleFs}
                      aria-label={v.fsLabel}
                      title={`${v.fsLabel ?? ""} (F)`}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        width: `${v.btn ?? ""}`,
                        height: `${v.btn ?? ""}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                        color: "#F0EEE9",
                      }}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                      >
                        <path d={v.fsPath} />
                      </svg>
                    </button>
                  </div>
                </div>{" "}
              </>
            ) : null}{" "}
            {v.epsOpen ? (
              <>
                {" "}
                <div
                  data-nk-pmenu="1"
                  style={{
                    position: "absolute",
                    top: "0",
                    right: "0",
                    bottom: "0",
                    width: "min(380px,90%)",
                    background: "rgba(18,16,14,.97)",
                    borderLeft: "1px solid rgba(219,175,87,.2)",
                    display: "flex",
                    flexDirection: "column",
                    cursor: "default",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 16px 12px",
                    }}
                  >
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span
                        style={{
                          fontFamily: "'Cormorant Garamond',serif",
                          fontSize: "24px",
                          fontWeight: "500",
                          lineHeight: "1",
                        }}
                      >
                        Episódios
                      </span>
                      <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(v.seasonLabel)}</span>
                    </span>
                    <button
                      className="nk-hover-kqh291"
                      onClick={v.toggleEps}
                      aria-label="Fechar"
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        width: "34px",
                        height: "34px",
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
                  </div>
                  <div
                    style={{
                      flex: "1",
                      overflowY: "auto",
                      padding: "0 10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    {asList(v.epList).map((e, $index) => (
                      <React.Fragment key={$index}>
                        <button
                          className="nk-hover-zuhwcw"
                          onClick={e?.go}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            display: "flex",
                            gap: "12px",
                            alignItems: "center",
                            padding: "8px",
                            borderRadius: "10px",
                            background: `${e?.bg ?? ""}`,
                            border: `1px solid ${e?.border ?? ""}`,
                          }}
                        >
                          <span
                            style={{
                              position: "relative",
                              width: "112px",
                              aspectRatio: "16/9",
                              borderRadius: "6px",
                              flexShrink: "0",
                              backgroundImage: `${e?.bgImg ?? ""}`,
                              backgroundSize: "cover",
                              backgroundPosition: `${e?.pos ?? ""}`,
                              overflow: "hidden",
                            }}
                          >
                            {" "}
                            {e?.hasPct ? (
                              <>
                                <span
                                  style={{
                                    position: "absolute",
                                    left: "0",
                                    right: "0",
                                    bottom: "0",
                                    height: "3px",
                                    background: "rgba(240,238,233,.25)",
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
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono',monospace",
                                fontSize: "11px",
                                color: `${e?.numColor ?? ""}`,
                              }}
                            >
                              {"EP "}
                              {txt(e?.n)}
                              {" · "}
                              {txt(e?.state)}
                            </span>
                            <span
                              style={{
                                fontSize: "13px",
                                fontWeight: "500",
                                lineHeight: "1.3",
                                display: "-webkit-box",
                                WebkitLineClamp: "2",
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {txt(e?.title)}
                            </span>
                          </span>
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                </div>{" "}
              </>
            ) : null}{" "}
            {v.osd ? (
              <>
                {" "}
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "22px",
                    transform: "translateX(-50%)",
                    padding: "8px 16px",
                    borderRadius: "999px",
                    background: "rgba(23,20,17,.9)",
                    border: "1px solid rgba(219,175,87,.35)",
                    fontSize: "13px",
                    pointerEvents: "none",
                  }}
                >
                  {txt(v.osdText)}
                </span>{" "}
              </>
            ) : null}{" "}
          </div>
          {v.showVersions ? (
            <div
              style={{
                width: "100%",
                maxWidth: `${v.stageMax ?? ""}`,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "12px", color: "#8F897D" }}>{txt(v.srvProv)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", fontSize: "13px", color: "#B7B1A4" }}>
                <span>Vídeo não carregou ou travou?</span>
                <button
                  type="button"
                  className="nk-hover-1e3fwvz"
                  onClick={v.nextSrv}
                  style={{ all: "unset", cursor: "pointer", color: "#DBAF57", fontWeight: "600" }}
                >
                  Tentar outro servidor
                </button>
                <span>·</span>
                <button
                  type="button"
                  className="nk-hover-1e3fwvz"
                  onClick={v.openReport}
                  style={{ all: "unset", cursor: "pointer", color: "#B7B1A4" }}
                >
                  Reportar problema
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <main
          style={{
            width: "100%",
            maxWidth: `calc(${v.stageMax ?? ""} + 2 * clamp(16px,3.3vw,48px))`,
            margin: "0 auto",
            padding: "28px clamp(16px,3.3vw,48px) 80px",
            display: "flex",
            flexDirection: "column",
            gap: "44px",
          }}
        >
          <section
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "24px 40px",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: "1 1 420px", minWidth: "0" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  letterSpacing: ".26em",
                  textTransform: "uppercase",
                  color: "#DBAF57",
                }}
              >
                {txt(v.crumbShort)}
              </span>
              <h1
                style={{
                  margin: "0",
                  fontFamily: "'Cormorant Garamond',serif",
                  fontWeight: "500",
                  fontSize: "clamp(32px,3.4vw,44px)",
                  lineHeight: "1.05",
                }}
              >
                {txt(v.ep?.title)}
              </h1>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {asList(v.chips).map((c, $index) => (
                  <React.Fragment key={$index}>
                    <span
                      style={{
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 10px",
                        borderRadius: "999px",
                        whiteSpace: "nowrap",
                        flexShrink: "0",
                        fontSize: "12px",
                        border: "1px solid rgba(240,238,233,.14)",
                        color: "#D9D5CC",
                      }}
                    >
                      {txt(c)}
                    </span>
                  </React.Fragment>
                ))}
              </div>
              {v.fallbackNote ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      background: "#1A1714",
                      border: "1px solid rgba(219,175,87,.25)",
                      fontSize: "13px",
                      color: "#D9D5CC",
                      alignSelf: "flex-start",
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
                    Este episódio ainda não tem dublagem. Reproduzindo em japonês com legenda em português.
                  </div>
                </>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "720px" }}>
                {v.synOpen ? (
                  <>
                    <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.7", color: "#D9D5CC" }}>
                      {txt(v.synText)}
                    </p>
                  </>
                ) : null}
                <button
                  onClick={v.toggleSyn}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#DBAF57",
                  }}
                >
                  {txt(v.synLabel)}
                </button>
              </div>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px", flex: "0 1 340px", minWidth: "260px" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <button
                  className="nk-hover-ucdklh"
                  onClick={v.goPrev}
                  style={{
                    all: "unset",
                    cursor: `${v.prevCursor ?? ""}`,
                    height: "46px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    borderRadius: "999px",
                    border: "1px solid rgba(240,238,233,.18)",
                    fontSize: "14px",
                    color: "#F0EEE9",
                    opacity: `${v.prevOpacity ?? ""}`,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  Anterior
                </button>
                <button
                  onClick={v.goNextNow}
                  style={{
                    all: "unset",
                    cursor: `${v.nextCursor ?? ""}`,
                    height: "46px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    borderRadius: "999px",
                    background: `${v.nextBg ?? ""}`,
                    color: `${v.nextColor ?? ""}`,
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  Próximo
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
              <button
                className="nk-hover-ucdklh"
                onClick={v.toggleDone}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  height: "44px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  borderRadius: "999px",
                  border: `1px solid ${v.doneBorder ?? ""}`,
                  fontSize: "14px",
                  color: `${v.doneColor ?? ""}`,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12l5 5 9-10" />
                </svg>
                {txt(v.doneLabel)}
              </button>
              <button
                className="nk-hover-1e3fwvz"
                onClick={v.openReport}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  alignSelf: "center",
                  fontSize: "13px",
                  color: "#B7B1A4",
                  padding: "6px",
                }}
              >
                Reportar problema de reprodução
              </button>
            </div>
          </section>
          <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px" }}>
              <h2
                style={{
                  margin: "0",
                  fontFamily: "'Cormorant Garamond',serif",
                  fontWeight: "500",
                  fontSize: "32px",
                  lineHeight: "1",
                }}
              >
                {txt(v.seasonLabel)}
              </h2>
              <a href={v.workHref} style={{ fontSize: "14px" }}>
                Ver todas as temporadas →
              </a>
            </div>
            <div
              ref={v.rowRef}
              style={{
                display: "grid",
                gridAutoFlow: "column",
                gridAutoColumns: "minmax(220px,260px)",
                gap: "14px",
                overflowX: "auto",
                padding: "4px 4px 8px",
                scrollbarWidth: "thin",
                scrollbarColor: "#2D2924 transparent",
              }}
            >
              {asList(v.epList).map((e, $index) => (
                <React.Fragment key={$index}>
                  <button
                    className="nk-hover-10b6rb3"
                    onClick={e?.go}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      minWidth: "0",
                    }}
                  >
                    <span
                      style={{
                        position: "relative",
                        display: "block",
                        aspectRatio: "16/9",
                        borderRadius: "10px",
                        overflow: "hidden",
                        backgroundImage: `${e?.bgImg ?? ""}`,
                        backgroundSize: "cover",
                        backgroundPosition: `${e?.pos ?? ""}`,
                        outline: `2px solid ${e?.ring ?? ""}`,
                        outlineOffset: "2px",
                      }}
                    >
                      {" "}
                      <span
                        style={{
                          position: "absolute",
                          left: "8px",
                          top: "8px",
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "11px",
                          background: "rgba(23,20,17,.88)",
                          padding: "3px 7px",
                          borderRadius: "4px",
                        }}
                      >
                        {"EP "}
                        {txt(e?.n)}
                      </span>{" "}
                      {e?.isCur ? (
                        <>
                          <span
                            style={{
                              position: "absolute",
                              right: "8px",
                              top: "8px",
                              fontSize: "10px",
                              fontWeight: "700",
                              letterSpacing: ".12em",
                              background: "#DBAF57",
                              color: "#1A1714",
                              padding: "3px 7px",
                              borderRadius: "4px",
                            }}
                          >
                            ASSISTINDO
                          </span>
                        </>
                      ) : null}{" "}
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
                      {e?.hasPct ? (
                        <>
                          <span
                            style={{
                              position: "absolute",
                              left: "0",
                              right: "0",
                              bottom: "0",
                              height: "3px",
                              background: "rgba(240,238,233,.25)",
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
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        lineHeight: "1.35",
                        color: `${e?.titleColor ?? ""}`,
                        display: "-webkit-box",
                        WebkitLineClamp: "2",
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {txt(e?.title)}
                    </span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </section>
          {v.commentsOn ? (
          <section style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: "12px 24px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <h2
                  style={{
                    margin: "0",
                    fontFamily: "'Cormorant Garamond',serif",
                    fontWeight: "500",
                    fontSize: "32px",
                    lineHeight: "1",
                  }}
                >
                  Comentários do episódio
                </h2>
                <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                  {txt(v.cCountText)}
                  {" · só sobre o episódio "}
                  {txt(v.epN)}
                </span>
              </div>
              {v.cOpen ? (
                <>
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
                    {asList(v.cSorts).map((o, $index) => (
                      <React.Fragment key={$index}>
                        <button
                          onClick={o?.pick}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            height: "32px",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 14px",
                            borderRadius: "999px",
                            fontSize: "13px",
                            fontWeight: "500",
                            background: `${o?.bg ?? ""}`,
                            color: `${o?.color ?? ""}`,
                          }}
                        >
                          {txt(o?.label)}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            {v.cClosed ? (
              <>
                <button
                  className="nk-hover-ucdklh"
                  onClick={v.openComments}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px 24px",
                    padding: "18px 22px",
                    borderRadius: "14px",
                    background: "#1A1714",
                    border: "1px dashed rgba(219,175,87,.3)",
                  }}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "15px", fontWeight: "500", color: "#F0EEE9" }}>
                      Os comentários ficam fechados para evitar spoilers
                    </span>
                    <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                      Abra quando terminar o episódio ou se não se importar com revelações.
                    </span>
                  </span>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "#DBAF57" }}>
                    Mostrar comentários ({txt(v.cCount)})
                  </span>
                </button>
              </>
            ) : null}
            {v.cOpen ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {v.loggedIn ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          gap: "14px",
                          padding: "16px",
                          borderRadius: "14px",
                          background: "#1A1714",
                          border: `1px solid ${v.cBoxBorder ?? ""}`,
                        }}
                      >
                        <span
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            flexShrink: "0",
                            border: "1px solid rgba(219,175,87,.45)",
                            background: "#2D2924",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: "18px",
                            color: "#DBAF57",
                          }}
                        >
                          {txt(v.meInitial)}
                        </span>
                        <div
                          style={{ display: "flex", flexDirection: "column", gap: "10px", flex: "1", minWidth: "0" }}
                        >
                          <textarea
                            rows={v.cRows}
                            maxLength="500"
                            value={val(v.cText)}
                            onChange={v.onCText}
                            onFocus={v.cFocus}
                            placeholder={`Comente sobre o episódio ${v.epN ?? ""}…`}
                            style={{
                              width: "100%",
                              border: "0",
                              background: "transparent",
                              color: "#F0EEE9",
                              fontFamily: "Inter,sans-serif",
                              fontSize: "15px",
                              lineHeight: "1.55",
                              outline: "none",
                              resize: "vertical",
                              padding: "8px 0",
                            }}
                          />
                          {v.cHasTs ? (
                            <>
                              <span
                                style={{
                                  alignSelf: "flex-start",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  height: "28px",
                                  padding: "0 10px",
                                  borderRadius: "999px",
                                  background: "rgba(219,175,87,.12)",
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: "12px",
                                  color: "#DBAF57",
                                }}
                              >
                                {"em "}
                                {txt(v.cTsLabel)}
                                <button
                                  onClick={v.cClearTs}
                                  aria-label="Remover minuto"
                                  style={{ all: "unset", cursor: "pointer", fontSize: "14px", lineHeight: "1" }}
                                >
                                  ×
                                </button>
                              </span>
                            </>
                          ) : null}
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "10px",
                            }}
                          >
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                              <button
                                className="nk-hover-tdhed"
                                onClick={v.cAddTs}
                                style={{
                                  all: "unset",
                                  cursor: "pointer",
                                  height: "32px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "0 12px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(240,238,233,.14)",
                                  fontSize: "12px",
                                  color: "#D9D5CC",
                                }}
                              >
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <circle cx="12" cy="12" r="9" />
                                  <path d="M12 7v5l3 2" />
                                </svg>
                                {"Marcar minuto atual · "}
                                {txt(v.timeText)}
                              </button>
                              <button
                                onClick={v.cToggleSpoiler}
                                style={{
                                  all: "unset",
                                  cursor: "pointer",
                                  height: "32px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "0 12px",
                                  borderRadius: "999px",
                                  border: `1px solid ${v.cSpBorder ?? ""}`,
                                  background: `${v.cSpBg ?? ""}`,
                                  fontSize: "12px",
                                  color: `${v.cSpColor ?? ""}`,
                                }}
                              >
                                <span
                                  style={{
                                    width: "14px",
                                    height: "14px",
                                    borderRadius: "4px",
                                    border: `1px solid ${v.cSpBorder ?? ""}`,
                                    background: `${v.cSpBox ?? ""}`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {v.cSpoiler ? (
                                    <>
                                      <svg
                                        width="9"
                                        height="9"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#1A1714"
                                        strokeWidth="4"
                                      >
                                        <path d="M5 12l5 5 9-10" />
                                      </svg>
                                    </>
                                  ) : null}
                                </span>
                                Contém spoiler
                              </button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <span
                                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#8F897D" }}
                              >
                                {txt(v.cLen)}/500
                              </span>
                              <button
                                onClick={v.cPost}
                                style={{
                                  all: "unset",
                                  cursor: `${v.cPostCursor ?? ""}`,
                                  height: "38px",
                                  display: "flex",
                                  alignItems: "center",
                                  padding: "0 18px",
                                  borderRadius: "999px",
                                  background: `${v.cPostBg ?? ""}`,
                                  color: "#1A1714",
                                  fontSize: "13px",
                                  fontWeight: "600",
                                }}
                              >
                                Publicar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}
                  {v.guest ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px 24px",
                          padding: "16px 18px",
                          borderRadius: "14px",
                          background: "#1A1714",
                          border: "1px solid rgba(219,175,87,.2)",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                          <img
                            src="/assets/nekoflow-mascot.png"
                            alt=""
                            style={{ width: "44px", height: "44px", objectFit: "contain" }}
                          />
                          <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            <span style={{ fontSize: "15px", fontWeight: "500" }}>Entre para comentar</span>
                            <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                              Qualquer pessoa pode ler. Para comentar, curtir e responder, é preciso ter uma conta.
                            </span>
                          </span>
                        </span>
                        <span style={{ display: "flex", gap: "8px" }}>
                          <a
                            href="/entrar"
                            style={{
                              height: "40px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 16px",
                              borderRadius: "999px",
                              border: "1px solid rgba(240,238,233,.25)",
                              fontSize: "14px",
                              color: "#F0EEE9",
                            }}
                          >
                            Entrar
                          </a>
                          <a
                            href="/entrar?modo=criar"
                            style={{
                              height: "40px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 16px",
                              borderRadius: "999px",
                              background: "#DBAF57",
                              color: "#1A1714",
                              fontSize: "14px",
                              fontWeight: "600",
                            }}
                          >
                            Criar conta
                          </a>
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {asList(v.comments).map((c, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            gap: "14px",
                            padding: "18px 0",
                            borderTop: "1px solid rgba(240,238,233,.07)",
                          }}
                        >
                          <span
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              flexShrink: "0",
                              background: `${c?.avBg ?? ""}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontFamily: "'Cormorant Garamond',serif",
                              fontSize: "18px",
                              color: `${c?.avColor ?? ""}`,
                            }}
                          >
                            {txt(c?.initial)}
                          </span>
                          <div
                            style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1", minWidth: "0" }}
                          >
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px" }}>
                              <span style={{ fontSize: "14px", fontWeight: "600" }}>{txt(c?.name)}</span>
                              {c?.mine ? (
                                <>
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: "700",
                                      letterSpacing: ".1em",
                                      padding: "2px 6px",
                                      borderRadius: "3px",
                                      background: "rgba(219,175,87,.15)",
                                      color: "#DBAF57",
                                    }}
                                  >
                                    VOCÊ
                                  </span>
                                </>
                              ) : null}
                              <span style={{ fontSize: "12px", color: "#8F897D" }}>
                                @{txt(c?.handle)}
                                {" · "}
                                {txt(c?.when)}
                              </span>
                              {c?.hasTs ? (
                                <>
                                  <button
                                    className="nk-hover-1eosgod"
                                    onClick={c?.seekTs}
                                    title="Ir para este minuto"
                                    style={{
                                      all: "unset",
                                      cursor: "pointer",
                                      height: "22px",
                                      display: "flex",
                                      alignItems: "center",
                                      padding: "0 8px",
                                      borderRadius: "999px",
                                      background: "rgba(219,175,87,.12)",
                                      fontFamily: "'JetBrains Mono',monospace",
                                      fontSize: "11px",
                                      color: "#DBAF57",
                                    }}
                                  >
                                    {"▶ "}
                                    {txt(c?.tsLabel)}
                                  </button>
                                </>
                              ) : null}
                            </div>
                            {c?.showText ? (
                              <>
                                <p
                                  style={{
                                    margin: "0",
                                    fontSize: "15px",
                                    lineHeight: "1.6",
                                    color: "#E6E2D9",
                                    textWrap: "pretty",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {txt(c?.text)}
                                </p>
                              </>
                            ) : null}
                            {c?.hidden ? (
                              <>
                                <button
                                  className="nk-hover-ucdklh"
                                  onClick={c?.reveal}
                                  style={{
                                    all: "unset",
                                    cursor: "pointer",
                                    alignSelf: "flex-start",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "10px 14px",
                                    borderRadius: "10px",
                                    background: "#221F1B",
                                    border: "1px dashed rgba(219,175,87,.35)",
                                    fontSize: "13px",
                                    color: "#D9D5CC",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: "700",
                                      letterSpacing: ".12em",
                                      padding: "2px 6px",
                                      borderRadius: "3px",
                                      background: "#DBAF57",
                                      color: "#1A1714",
                                    }}
                                  >
                                    SPOILER
                                  </span>
                                  Comentário oculto · toque para mostrar
                                </button>
                              </>
                            ) : null}
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: "4px 16px",
                                fontSize: "13px",
                              }}
                            >
                              <button
                                className="nk-hover-1d5grei"
                                onClick={c?.like}
                                aria-pressed={c?.likedStr}
                                style={{
                                  all: "unset",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  color: `${c?.likeColor ?? ""}`,
                                }}
                              >
                                <svg
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill={c?.likeFill}
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
                                </svg>
                                {txt(c?.likes)}
                              </button>
                              <button
                                className="nk-hover-1e3fwvz"
                                onClick={c?.reply}
                                style={{ all: "unset", cursor: "pointer", color: "#B7B1A4" }}
                              >
                                Responder
                              </button>
                              {c?.mine ? (
                                <>
                                  <button
                                    className="nk-hover-1dfuzmv"
                                    onClick={c?.remove}
                                    style={{ all: "unset", cursor: "pointer", color: "#B7B1A4" }}
                                  >
                                    Excluir
                                  </button>
                                </>
                              ) : null}
                              {c?.notMine ? (
                                <>
                                  <button
                                    className="nk-hover-1e3fwvz"
                                    onClick={c?.report}
                                    style={{ all: "unset", cursor: "pointer", color: "#8F897D" }}
                                  >
                                    Denunciar
                                  </button>
                                </>
                              ) : null}
                            </div>
                            {c?.replyOpen ? (
                              <>
                                <div
                                  style={{ display: "flex", gap: "10px", alignItems: "flex-start", paddingTop: "4px" }}
                                >
                                  <span
                                    style={{
                                      width: "30px",
                                      height: "30px",
                                      borderRadius: "50%",
                                      flexShrink: "0",
                                      border: "1px solid rgba(219,175,87,.45)",
                                      background: "#2D2924",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontFamily: "'Cormorant Garamond',serif",
                                      fontSize: "14px",
                                      color: "#DBAF57",
                                    }}
                                  >
                                    {txt(v.meInitial)}
                                  </span>
                                  <div
                                    style={{
                                      flex: "1",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "8px",
                                      minWidth: "0",
                                    }}
                                  >
                                    <textarea
                                      rows="2"
                                      maxLength="500"
                                      value={val(v.replyText)}
                                      onChange={v.onReplyText}
                                      placeholder={`Responder a ${c?.name ?? ""}…`}
                                      style={{
                                        width: "100%",
                                        borderRadius: "10px",
                                        border: "1px solid rgba(240,238,233,.15)",
                                        background: "#141210",
                                        color: "#F0EEE9",
                                        padding: "10px 12px",
                                        fontFamily: "Inter,sans-serif",
                                        fontSize: "14px",
                                        outline: "none",
                                        resize: "vertical",
                                      }}
                                    />
                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                                      <button
                                        onClick={v.cancelReply}
                                        style={{
                                          all: "unset",
                                          cursor: "pointer",
                                          height: "34px",
                                          display: "flex",
                                          alignItems: "center",
                                          padding: "0 12px",
                                          fontSize: "13px",
                                          color: "#B7B1A4",
                                        }}
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={c?.sendReply}
                                        style={{
                                          all: "unset",
                                          cursor: `${v.replyCursor ?? ""}`,
                                          height: "34px",
                                          display: "flex",
                                          alignItems: "center",
                                          padding: "0 16px",
                                          borderRadius: "999px",
                                          background: `${v.replyBg ?? ""}`,
                                          color: "#1A1714",
                                          fontSize: "13px",
                                          fontWeight: "600",
                                        }}
                                      >
                                        Responder
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </>
                            ) : null}
                            {c?.hasReplies ? (
                              <>
                                <button
                                  onClick={c?.toggleReplies}
                                  style={{
                                    all: "unset",
                                    cursor: "pointer",
                                    alignSelf: "flex-start",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    fontSize: "13px",
                                    fontWeight: "600",
                                    color: "#DBAF57",
                                  }}
                                >
                                  <span style={{ width: "20px", height: "1px", background: "rgba(219,175,87,.6)" }} />
                                  {txt(c?.repliesLabel)}
                                </button>
                              </>
                            ) : null}
                            {c?.repliesOpen ? (
                              <>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "14px",
                                    paddingLeft: "4px",
                                    borderLeft: "1px solid rgba(240,238,233,.08)",
                                  }}
                                >
                                  {asList(c?.replies).map((r, $index) => (
                                    <React.Fragment key={$index}>
                                      <div style={{ display: "flex", gap: "12px", paddingLeft: "12px" }}>
                                        <span
                                          style={{
                                            width: "30px",
                                            height: "30px",
                                            borderRadius: "50%",
                                            flexShrink: "0",
                                            background: `${r?.avBg ?? ""}`,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontFamily: "'Cormorant Garamond',serif",
                                            fontSize: "14px",
                                            color: `${r?.avColor ?? ""}`,
                                          }}
                                        >
                                          {txt(r?.initial)}
                                        </span>
                                        <div
                                          style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "6px",
                                            minWidth: "0",
                                          }}
                                        >
                                          <span
                                            style={{
                                              display: "flex",
                                              flexWrap: "wrap",
                                              alignItems: "center",
                                              gap: "4px 10px",
                                            }}
                                          >
                                            <span style={{ fontSize: "13px", fontWeight: "600" }}>{txt(r?.name)}</span>
                                            <span style={{ fontSize: "12px", color: "#8F897D" }}>
                                              @{txt(r?.handle)}
                                              {" · "}
                                              {txt(r?.when)}
                                            </span>
                                          </span>
                                          <p
                                            style={{
                                              margin: "0",
                                              fontSize: "14px",
                                              lineHeight: "1.55",
                                              color: "#E6E2D9",
                                              whiteSpace: "pre-wrap",
                                            }}
                                          >
                                            {txt(r?.text)}
                                          </p>
                                          <button
                                            onClick={r?.like}
                                            style={{
                                              all: "unset",
                                              cursor: "pointer",
                                              alignSelf: "flex-start",
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "6px",
                                              fontSize: "12px",
                                              color: `${r?.likeColor ?? ""}`,
                                            }}
                                          >
                                            <svg
                                              width="13"
                                              height="13"
                                              viewBox="0 0 24 24"
                                              fill={r?.likeFill}
                                              stroke="currentColor"
                                              strokeWidth="1.8"
                                            >
                                              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
                                            </svg>
                                            {txt(r?.likes)}
                                          </button>
                                        </div>
                                      </div>
                                    </React.Fragment>
                                  ))}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <button
                    className="nk-hover-1e3fwvz"
                    onClick={v.closeComments}
                    style={{ all: "unset", cursor: "pointer", alignSelf: "center", fontSize: "13px", color: "#B7B1A4" }}
                  >
                    Fechar comentários
                  </button>
                </div>
              </>
            ) : null}
          </section>
          ) : null}
          <a
            className="nk-hover-1ifysxm"
            href={v.origHref}
            style={{
              display: v.hasOrig ? "flex" : "none",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px 24px",
              padding: "18px 22px",
              borderRadius: "14px",
              background: "#1A1714",
              border: "1px solid rgba(219,175,87,.18)",
              color: "#F0EEE9",
            }}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  letterSpacing: ".22em",
                  textTransform: "uppercase",
                  color: "#DBAF57",
                }}
              >
                Obra original
              </span>
              <span style={{ fontSize: "15px" }}>{txt(v.origText)}</span>
            </span>
            <span style={{ fontSize: "14px", fontWeight: "600", color: "#DBAF57" }}>{txt(v.origCta)}</span>
          </a>
        </main>
        {v.reportOpen ? (
          <>
            <div
              onClick={v.closeReport}
              style={{ position: "fixed", inset: "0", zIndex: "80", background: "rgba(10,9,8,.7)" }}
            />
            <div
              role="dialog"
              aria-label="Reportar problema"
              style={{
                position: "fixed",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
                zIndex: "81",
                width: "min(460px,calc(100vw - 32px))",
                padding: "24px",
                borderRadius: "16px",
                background: "#1A1714",
                border: "1px solid rgba(219,175,87,.25)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                boxShadow: "0 30px 60px rgba(0,0,0,.6)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: "28px",
                    fontWeight: "500",
                    lineHeight: "1",
                  }}
                >
                  Reportar problema
                </span>
                <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(v.reportCtx)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {asList(v.reportOpts).map((o, $index) => (
                  <React.Fragment key={$index}>
                    <button
                      onClick={o?.pick}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "11px 12px",
                        borderRadius: "10px",
                        border: `1px solid ${o?.border ?? ""}`,
                        background: `${o?.bg ?? ""}`,
                        fontSize: "14px",
                      }}
                    >
                      <span
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          border: `1px solid ${o?.dotBorder ?? ""}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: "0",
                        }}
                      >
                        <span
                          style={{ width: "8px", height: "8px", borderRadius: "50%", background: `${o?.dot ?? ""}` }}
                        />
                      </span>
                      {txt(o?.label)}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <textarea
                rows="3"
                value={val(v.reportText)}
                onChange={v.onReportText}
                placeholder="Detalhes opcionais, como o minuto em que acontece"
                style={{
                  borderRadius: "10px",
                  border: "1px solid rgba(240,238,233,.15)",
                  background: "#141210",
                  color: "#F0EEE9",
                  padding: "12px 14px",
                  fontFamily: "Inter,sans-serif",
                  fontSize: "14px",
                  outline: "none",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  onClick={v.closeReport}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    height: "42px",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 16px",
                    fontSize: "14px",
                    color: "#B7B1A4",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={v.sendReport}
                  style={{
                    all: "unset",
                    cursor: `${v.reportCursor ?? ""}`,
                    height: "42px",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 20px",
                    borderRadius: "999px",
                    background: `${v.reportBg ?? ""}`,
                    color: "#1A1714",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  Enviar
                </button>
              </div>
            </div>
          </>
        ) : null}
        {v.toast ? (
          <>
            <div
              className="nk-toast"
              style={{
                position: "fixed",
                left: "50%",
                bottom: "28px",
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

export const defaults = { loggedIn: true, simularErro: false };

const LegacyPlayer = defineDC("Player", PlayerLogic, render, { helmet });

/**
 * Player real (Protocolo 06): mesma interface do design, mecanismo trocado.
 * - a mídia vem do Java (fontes autorizadas, acesso validado) e toca no <video>;
 * - o tempo, a duração, o buffer e o fim vêm dos eventos reais do elemento de vídeo;
 * - qualidade, áudio e legenda listam só as faixas que a mídia realmente tem;
 * - o progresso usa o serviço do Protocolo 05 (sessão, sequência, versão);
 * - fonte que só abre no provedor não gera tempo assistido: conclusão é manual.
 */
const REPORT_EVERY_MS = 20_000;

class RealPlayerLogic extends PlayerLogic {
  videoRef = React.createRef();
  meter = createWatchMeter();
  state = {
    ...this.state,
    w: { seasons: [{ eps: [] }, { eps: [] }] },
    ep: 1,
    pb: null,
    ranked: [],
    src: null,
    levels: [],
    level: -1,
    curHeight: null,
    audioTracks: [],
    audioIdx: 0,
    subTracks: [],
    subIdx: -1,
    bufEnd: 0,
    ended: false,
    unitProg: {},
    syncStatus: null,
    external: false,
    embedUrl: null,
    fatal: null,
    loading: true,
    loadingText: "Preparando o episódio…",
  };

  get episodeId() {
    return this.props.episodeId;
  }

  componentDidMount() {
    const pp = this.load("nk-player", {});
    this.setState({ speed: pp.speed || 1, vol: pp.vol ?? 80, muted: !!pp.muted });
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("mousedown", this.onDown);
    document.addEventListener("fullscreenchange", this.onFs);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("pagehide", this.onLeave);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.onResize();
    this.uiTimer = setInterval(this.uiStep, 500);
    this.wireVideo();
    this.unsubscribeLocale = subscribeLocale(() => {
      mediaApi.playback(this.episodeId).then((pb) => this.setState({ pb })).catch(() => {});
    });
    this.boot();
  }

  componentWillUnmount() {
    this.report({ force: true });
    clearInterval(this.uiTimer);
    this.detach();
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("mousedown", this.onDown);
    document.removeEventListener("fullscreenchange", this.onFs);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pagehide", this.onLeave);
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.unsubscribeLocale) this.unsubscribeLocale();
  }

  get video() {
    return this.videoRef.current;
  }

  // ---- carga -------------------------------------------------------------------------

  async boot() {
    let pb;
    try {
      pb = await mediaApi.playback(this.episodeId);
    } catch (error) {
      this.setState({
        loading: false,
        error: true,
        fatal: error?.status === 404 ? "missing" : "network",
        errorText:
          error?.status === 404
            ? "Este episódio não existe ou não está publicado."
            : "Não foi possível falar com o NekoFlow agora.",
      });
      return;
    }
    await session.load();
    const index = pb.units.findIndex((u) => u.id === pb.episodeId);
    this.DUR = pb.episode.durationSeconds || 0;
    this.applyMarkers(pb.markers);
    const Hls = await loadHls();
    this.Hls = Hls;
    const ranked = rankSources(pb.sources, browserSupport(this.video, Hls));
    this.setState({ pb, ranked, ep: index + 1 });
    document.title = `${pb.work.title} · ${translate(`Episódio ${pb.episode.number}`, getLocale())} — NekoFlow`;

    if (session.loggedIn) {
      api.get("/api/me/preferences")
        .then((cfg) => {
          this.cfg = cfg || {};
          this.setState({ autoNext: this.cfg.autoplay ?? true, autoSkip: this.cfg.skip ?? false });
        })
        .catch(() => {});
      this.loadUnits();
    }

    let startT = 0;
    if (session.loggedIn) {
      this.sync = progressApi.sync("episode", this.episodeId, null, (st) =>
        this.setState({ syncStatus: st.status, savedAt: st.status === "saved" ? Date.now() : this.state.savedAt }),
      );
      try {
        const server = await this.sync.load();
        await this.sync.flush();
        const t = (server?.positionMs || 0) / 1000;
        if (!server?.completed && t > 30 && (!this.DUR || t < this.DUR - 60)) startT = t;
        this.serverWatchedMs = server?.watchedMs || 0;
      } catch {
        /* sem progresso salvo: começa do início */
      }
    }

    // Fonte inicial pelas preferências do usuário (áudio, legenda, alternativa); entre
    // fontes igualmente boas, o player nativo vem antes do embed. Nunca troca em silêncio.
    const prefs = await loadMediaPreferences().catch(() => normalizePreferences({}));
    this.prefs = prefs;
    const candidates = ranked.filter((x) => (x.playsInPlayer && x.compatible) || x.embedUrl);
    const preferred = rankByPreference(candidates, prefs).sort(
      (a, b) => preferenceScore(b, prefs) - preferenceScore(a, prefs) || (a.embedUrl ? 1 : 0) - (b.embedUrl ? 1 : 0),
    )[0];
    let preferredSrc = preferred;
    if (preferred) {
      const v = versionOf(preferred);
      const remembered = rememberedProvider(pb.work.id, v.key);
      const same = remembered && candidates.find((x) => versionOf(x).key === v.key && providerOf(x) === remembered);
      if (same) preferredSrc = same;
    }
    const notice = substitutionNotice(preferredSrc, prefs, languageName);
    if (notice) this.flashLong(translate(notice, getLocale()));
    const src = preferredSrc && !preferredSrc.embedUrl ? preferredSrc : preferredSrc ? null : pickSource(ranked);
    if (!src) {
      const embed = preferredSrc && preferredSrc.embedUrl ? preferredSrc : ranked.find((s) => s.embedUrl);
      if (embed) {
        this.trackSource(embed);
        this.setState({
          loading: false,
          external: false,
          embedUrl: embed.embedUrl,
          error: false,
          playing: false,
          src: embed.id,
        });
        return;
      }
      const ext = ranked.find((s) => s.externalUrl);
      this.setState({ loading: false, external: true, error: true, playing: false, src: ext ? ext.id : null });
      return;
    }
    this.trackSource(src);
    this.attach(src, startT, { ask: startT > 0 });
  }

  loadUnits() {
    const pb = this.state.pb;
    if (!pb || !session.loggedIn) return;
    progressApi
      .workUnits(pb.work.id)
      .then((p) => {
        const unitProg = {};
        for (const u of p.episodes || []) unitProg[u.episodeId] = u;
        this.setState({ unitProg });
      })
      .catch(() => {});
  }

  applyMarkers(markers) {
    const intro = (markers || []).find((m) => m.kind === "INTRO");
    const outro = (markers || []).find((m) => m.kind === "OUTRO");
    this.OP = intro ? [intro.startMs / 1000, intro.endMs / 1000] : [-1, -1];
    this.hasOutro = !!outro;
    this.ED = outro ? [outro.startMs / 1000, outro.endMs / 1000] : [Math.max(0, (this.DUR || 0) - 25), this.DUR || 0];
  }

  async attach(src, startT, { ask = false, autoplay = false } = {}) {
    this.detach();
    this.attempts = 0;
    this.meter.reset(startT);
    this.setState({
      src: src.id,
      embedUrl: null,
      loading: true,
      error: false,
      fatal: null,
      external: false,
      loadingText: `Carregando ${src.label}…`,
      playing: false,
      levels: [],
      level: -1,
      audioTracks: [],
      subTracks: [],
      subIdx: -1,
      t: startT,
      resume: ask,
      ended: false,
    });
    let access;
    try {
      access = await mediaApi.access(this.episodeId, src.id);
    } catch (error) {
      this.fail(error?.status === 404 ? "A fonte deixou de estar disponível." : "A fonte não respondeu.");
      return;
    }
    const video = this.video;
    if (!video) return;
    this.startT = startT;
    this.wantPlay = autoplay && !ask;
    for (const el of [...video.querySelectorAll("track")]) el.remove();
    if ((access.subtitles || []).length) video.crossOrigin = "anonymous";
    for (const tr of access.subtitles || []) {
      const el = document.createElement("track");
      el.kind = tr.kind === "CAPTIONS" ? "captions" : "subtitles";
      el.srclang = tr.language;
      el.label = tr.label;
      el.src = tr.url;
      video.appendChild(el);
    }
    const Hls = this.Hls;
    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
    if (src.type === "HLS" && !nativeHls && Hls) {
      const hls = new Hls({ startPosition: startT, capLevelToPlayerSize: true, maxBufferLength: 30 });
      this.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, d) =>
        this.setState({
          levels: (d.levels || []).map((l, i) => ({ index: i, height: l.height, bitrate: l.bitrate })),
        }),
      );
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => {
        const l = hls.levels[d.level];
        this.setState({ curHeight: l ? l.height : null });
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, d) =>
        this.setState({
          audioTracks: (d.audioTracks || []).map((a, i) => ({ index: i, lang: a.lang, name: a.name })),
          audioIdx: hls.audioTrack,
        }),
      );
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, d) =>
        this.setState({
          subTracks: (d.subtitleTracks || []).map((t, i) => ({ index: i, lang: t.lang, name: t.name, hls: true })),
        }),
      );
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        this.attempts += 1;
        if (this.attempts <= 2 && d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (this.attempts <= 2 && d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else this.fail(d.type === Hls.ErrorTypes.NETWORK_ERROR ? "A conexão com a fonte caiu." : "O vídeo não pôde ser decodificado.");
      });
      hls.loadSource(access.url);
      hls.attachMedia(video);
    } else if (src.type === "HLS" && !nativeHls) {
      this.fail("Este navegador não reproduz HLS.", true);
      return;
    } else {
      video.src = access.url;
      video.load();
    }
    // URL temporária: renova o acesso antes de expirar mantendo a posição.
    const ttl = Date.parse(access.expiresAt) - Date.now();
    clearTimeout(this.renewTimer);
    if (ttl > 60_000 && src.type !== "HLS") {
      this.renewTimer = setTimeout(() => {
        const t = this.video ? this.video.currentTime : this.state.t;
        this.attach(src, t, { autoplay: this.state.playing });
      }, ttl - 30_000);
    }
  }

  detach() {
    clearTimeout(this.renewTimer);
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        /* já destruído */
      }
      this.hls = null;
    }
    const video = this.video;
    if (video && video.getAttribute("src")) {
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* sem mídia */
      }
    }
  }

  fail(text, incompatible) {
    this.report();
    this.setState({ loading: false, error: true, playing: false, errorText: text, incompatible: !!incompatible });
  }

  // ---- eventos reais do <video> -------------------------------------------------------

  wireVideo() {
    const v = this.video;
    if (!v) return;
    v.volume = (this.state.vol ?? 80) / 100;
    v.muted = !!this.state.muted;
    const on = (name, fn) => v.addEventListener(name, fn);
    on("loadedmetadata", () => {
      if (isFinite(v.duration) && v.duration > 0) {
        this.DUR = v.duration;
        this.applyMarkers(this.state.pb?.markers);
      }
      if (this.startT && !this.hls && Math.abs(v.currentTime - this.startT) > 1) v.currentTime = this.startT;
      v.playbackRate = this.state.speed || 1;
      this.setState({ loading: false });
      if (this.wantPlay) this.playNow();
    });
    on("durationchange", () => {
      if (isFinite(v.duration) && v.duration > 0) this.DUR = v.duration;
    });
    on("canplay", () => {
      if (this.state.loading) this.setState({ loading: false });
      if (this.wantPlay && !this.state.resume) this.playNow();
    });
    on("playing", () => {
      this.engaged = true; // só a partir da primeira reprodução real há algo a salvar
      this.setState({ playing: true, loading: false, error: false, ended: false });
    });
    on("pause", () => {
      this.setState({ playing: false });
      if (!v.ended) this.report({ force: true });
    });
    on("waiting", () => this.setState({ loading: true, loadingText: "Carregando…" }));
    on("seeking", () => this.meter.reset(v.currentTime));
    on("seeked", () => {
      this.meter.reset(v.currentTime);
      this.setState({ t: v.currentTime });
      // Só buscas do usuário salvam; ajustes internos do hls.js (pulos de buffer) não.
      if (this.userSeek) {
        this.userSeek = false;
        this.report({ force: true });
      }
    });
    on("timeupdate", () => {
      const s = this.state;
      const t = v.currentTime;
      this.meter.tick(t, { playing: !v.paused, seeking: v.seeking, rate: v.playbackRate });
      if (!s.dragging) this.setState({ t });
      if (s.autoSkip && this.OP[0] >= 0 && t >= this.OP[0] && t < this.OP[0] + 1) {
        v.currentTime = this.OP[1];
        this.showOsd("Abertura pulada");
      }
      if (!v.paused && Date.now() - (this.lastReportAt || 0) >= REPORT_EVERY_MS) this.report();
    });
    on("progress", () => {
      try {
        const b = v.buffered;
        if (b.length) this.setState({ bufEnd: b.end(b.length - 1) });
      } catch {
        /* sem buffer ainda */
      }
    });
    on("ended", () => {
      this.setState({ playing: false, ended: true, countdown: 10, nextDismissed: false });
      this.report({ ended: true });
    });
    on("ratechange", () => this.setState({ speed: v.playbackRate }));
    on("error", () => {
      const code = v.error && v.error.code;
      if (this.hls) return; // o hls.js trata os próprios erros
      this.fail(
        code === 4
          ? "A fonte não respondeu: o link pode ter expirado ou estar fora do ar."
          : "O vídeo não pôde ser carregado.",
      );
    });
  }

  /** Versões do episódio e servidores da versão atual (guia "Idiomas e Servidores"). */
  versionVals() {
    const s = this.state;
    const prefs = this.prefs || normalizePreferences({});
    const groups = groupVersions(s.ranked, (x) => preferenceScore(x, prefs));
    const cur = groups.find((g) => g.servers.some((r) => r.source.id === s.src)) || groups[0];
    if (!cur || !groups.some((g) => g.servers.some((r) => r.source.embedUrl))) return { showVersions: false };
    const idx = Math.max(0, cur.servers.findIndex((r) => r.source.id === s.src));
    const server = cur.servers[idx];
    const workId = s.pb ? s.pb.work.id : "";
    const go = (r) => {
      rememberProvider(workId, cur.key, r.provider);
      this.setState({ srvOpen: false });
      this.setSource(r.source.id);
    };
    return {
      showVersions: true,
      versions: groups.map((g) => {
        const on = g.key === cur.key;
        return {
          label: g.label,
          on,
          bg: on ? "#DBAF57" : "transparent",
          color: on ? "#1A1714" : "#F0EEE9",
          pick: () => {
            if (on) return;
            const remembered = rememberedProvider(workId, g.key);
            const r = g.servers.find((x) => x.provider === remembered) || g.servers[0];
            this.setState({ srvOpen: false });
            this.setSource(r.source.id);
          },
        };
      }),
      toggleSrv: () => this.setState({ srvOpen: !s.srvOpen, menu: null, eps: false }),
      srvOpen: !!s.srvOpen,
      srvBorder: s.srvOpen ? "#DBAF57" : "rgba(240,238,233,.2)",
      // O site não verifica o estado dos servidores externos: ponto neutro, sem "funcionando".
      srvDot: "#8F897D",
      srvName: server.name.replace("Servidor ", ""),
      srvProv: server.provider,
      srvHead: `${cur.label} · ${cur.servers.length} ${cur.servers.length > 1 ? "servidores" : "servidor"}`,
      servers: cur.servers.map((r, i) => ({
        name: r.name,
        sub: r.provider,
        dot: "#8F897D",
        on: i === idx,
        bg: i === idx ? "rgba(219,175,87,.1)" : "transparent",
        color: i === idx ? "#DBAF57" : "#F0EEE9",
        pick: () => go(r),
      })),
      nextSrv: () => go(cur.servers[(idx + 1) % cur.servers.length]),
    };
  }

  /** Aviso que fica mais tempo na tela (substituição de idioma). */
  flashLong(text) {
    clearTimeout(this.tt);
    this.setState({ toast: text });
    this.tt = setTimeout(() => this.setState({ toast: null }), 6000);
  }

  playNow() {
    const v = this.video;
    if (!v) return;
    if (v.readyState < 2) {
      // Pedido antes de haver dados: toca assim que o vídeo puder (evento canplay).
      this.wantPlay = true;
      this.setState({ loading: true, loadingText: "Carregando…" });
      return;
    }
    this.wantPlay = false;
    const p = v.play();
    if (p && p.catch) p.catch(() => this.setState({ playing: false })); // autoplay bloqueado: botão de play
  }

  /**
   * Envia a posição real ao Protocolo 05. Só declara conclusão quando posição e tempo
   * assistido passam das regras do servidor; arrastar até o fim não conclui.
   */
  report({ ended = false, force = false } = {}) {
    const v = this.video;
    if (!this.sync || !v || !this.engaged || !this.state.src || this.state.external) return;
    // Intervalo mínimo entre envios automáticos; pausa, fim, saída e buscas do usuário passam.
    if (!ended && !force && !v.paused && Date.now() - (this.lastReportAt || 0) < REPORT_EVERY_MS) return;
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : this.DUR;
    if (!dur) return;
    const positionMs = Math.round(Math.min(v.currentTime, dur) * 1000);
    if (positionMs === this.lastPositionMs && this.meter.pendingMs === 0 && !ended) return;
    const watchedDeltaMs = this.meter.take();
    this.serverWatchedMs = (this.serverWatchedMs || 0) + watchedDeltaMs;
    const completed = positionMs >= dur * 900 && this.serverWatchedMs >= dur * 500;
    this.lastReportAt = Date.now();
    this.lastPositionMs = positionMs;
    const values = { positionMs, durationMs: Math.round(dur * 1000), watchedDeltaMs, completed };
    this.sync
      .report(values, { live: true })
      .then((server) => {
        if (server && typeof server.watchedMs === "number") this.serverWatchedMs = server.watchedMs;
        if (server && server.completed && completed) {
          this.flash(`Episódio ${this.state.pb.episode.number} assistido`);
          window.dispatchEvent(new Event("nk:personal"));
          this.loadUnits();
        }
      })
      .catch((error) => {
        // Conclusão não comprovada: guarda só a posição, sem afirmar que foi assistido.
        if (completed && error?.body?.code === "PLAYBACK_COMPLETION_UNVERIFIED")
          this.sync.report({ ...values, watchedDeltaMs: 0, completed: false }, { live: true }).catch(() => {});
      });
  }

  onLeave = () => this.report({ force: true });
  onVisibility = () => {
    if (document.visibilityState === "hidden") this.report({ force: true });
  };

  uiStep = () => {
    const s = this.state;
    if (s.active && s.playing && !s.menu && !s.eps && !s.dragging && Date.now() - (this.lastMove || 0) > 2600)
      this.setState({ active: false });
    // Contagem do próximo episódio: só depois do fim real (ou na marcação de encerramento).
    const next = s.pb && s.pb.next;
    const inEnd = s.ended || (this.hasOutro && s.t >= this.ED[0]);
    if (next && inEnd && s.autoNext && !s.nextDismissed && (s.playing || s.ended)) {
      const c = s.countdown - 0.5;
      if (c <= 0) this.goUnit(next.id);
      else this.setState({ countdown: c });
    }
  };

  // ---- comandos (substituem os do player demonstrativo) --------------------------------

  togglePlay = () => {
    const s = this.state;
    const v = this.video;
    if (s.resume || s.error || !v) return;
    if (v.paused) this.playNow();
    else v.pause();
    this.wake();
  };
  seek(t, label) {
    const v = this.video;
    if (!v || this.state.error) return;
    const dur = isFinite(v.duration) ? v.duration : this.DUR;
    this.userSeek = true;
    v.currentTime = Math.max(0, Math.min(Math.max(0, dur - 0.5), t));
    this.setState({ t: v.currentTime, countdown: 10, ended: false });
    if (label) this.showOsd(label);
  }
  toggleMute = () => {
    const v = this.video;
    const muted = !this.state.muted;
    if (v) v.muted = muted;
    this.setState({ muted });
    this.store("nk-player", { speed: this.state.speed, vol: this.state.vol, muted });
    this.showOsd(muted ? "Sem som" : `Volume ${this.state.vol}%`);
  };
  toggleCC = () => {
    const s = this.state;
    if (!s.subTracks.length && !this.nativeTracks().length) {
      this.showOsd("Esta fonte não tem legendas separadas");
      return;
    }
    this.pickSub(s.subIdx >= 0 ? -1 : 0);
  };
  nativeTracks() {
    const v = this.video;
    if (!v || this.hls) return [];
    return [...(v.textTracks || [])].map((t, i) => ({ index: i, lang: t.language, name: t.label }));
  }
  pickSub(i) {
    const v = this.video;
    if (this.hls) this.hls.subtitleTrack = i;
    else if (v) [...v.textTracks].forEach((t, j) => (t.mode = j === i ? "showing" : "disabled"));
    this.setState({ subIdx: i, sub: null });
    this.showOsd(i < 0 ? "Legendas desligadas" : "Legenda ativada");
  }
  goEp(n) {
    const u = this.state.pb && this.state.pb.units[n - 1];
    if (u && u.available) this.goUnit(u.id);
  }
  goUnit(id) {
    const pb = this.state.pb;
    if (pb && pb.next && pb.next.id === id) {
      track("next_click", { work: pb.work ? pb.work.legacyId ?? pb.work.id : null, episodeId: this.episodeId });
    }
    this.report({ force: true });
    location.href = `/player?episode=${id}`;
  }
  /** Audiência (painel): primeiro servidor = player aberto; depois, cada troca de servidor. */
  trackSource(src, cur) {
    const pb = this.state.pb;
    const ref = { work: pb && pb.work ? pb.work.legacyId ?? pb.work.id : null, episodeId: this.episodeId };
    if (!this.openTracked) {
      this.openTracked = true;
      track("player_open", { ...ref, provider: providerOf(src), version: versionOf(src).label, sourceId: src.id });
    } else if (cur && cur.id !== src.id) {
      // fromVersion/ids alimentam a saúde dos servidores: trocar dentro da mesma versão é desistir do servidor.
      track("server_switch", {
        ...ref,
        from: providerOf(cur),
        to: providerOf(src),
        version: versionOf(src).label,
        fromVersion: versionOf(cur).label,
        fromId: cur.id,
        toId: src.id,
      });
    }
  }

  setSource(id) {
    const s = this.state;
    const src = s.ranked.find((x) => x.id === id);
    if (!src) return;
    // Troca manual vale só para este episódio (as preferências globais não mudam), mas o
    // usuário é avisado quando o idioma do áudio ou da legenda muda.
    const cur = s.ranked.find((x) => x.id === s.src);
    this.trackSource(src, cur);
    const langs = (x) => [...(x?.audioLanguages || []), "|", ...(x?.subtitleLanguages || [])].join(",");
    const langChanged = cur && src.id !== cur.id && langs(cur) !== langs(src);
    if (langChanged) {
      const audio = (src.audioLanguages || []).map(languageName).join(", ") || "não informado";
      const subs = (src.subtitleLanguages || []).map(languageName).join(", ") || "sem legenda informada";
      setTimeout(() => this.flashLong(`Idioma desta fonte: áudio ${audio} · legenda ${subs}`), 0);
    }
    if (src.embedUrl) {
      this.detach();
      this.setState({
        menu: null,
        src: src.id,
        embedUrl: src.embedUrl,
        external: false,
        loading: false,
        error: false,
        playing: false,
      });
      this.flash(`${src.label} · player incorporado`);
      return;
    }
    if (!src.playsInPlayer) {
      this.setState({ menu: null });
      if (src.externalUrl) window.open(src.externalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!src.compatible) {
      this.flash("Este navegador não reproduz esta fonte");
      return;
    }
    if (id === s.src && !s.error) {
      this.setState({ menu: null });
      return;
    }
    const v = this.video;
    const t = v && v.currentTime ? v.currentTime : s.t;
    this.report({ force: true }); // salva antes de trocar
    this.setState({ menu: null });
    this.attach(src, t, { autoplay: s.playing });
    this.flash(`${src.label} · posição mantida em ${this.fmt(t)}`);
  }

  // ---- valores da interface -------------------------------------------------------------

  renderVals() {
    const base = super.renderVals();
    const s = this.state;
    const pb = s.pb;
    const v = this.video;
    const loggedIn = session.loggedIn;
    const dur = this.DUR || 0;
    const pctN = dur ? Math.min(1, s.t / dur) : 0;
    const units = pb ? pb.units : [];
    const unit = pb ? pb.episode : { number: "", title: "" };
    const src = s.ranked.find((x) => x.id === s.src) || null;
    const bg = (u) => (u ? `url("${u}")` : "none");
    // Títulos técnicos de importação ("T1 EP16") aparecem como "Episódio 16".
    const unitLabel = (u) => translate(
      u.title && !/^T\d+\s*EP\d+$/i.test(u.title.trim()) && !/^(episódio|episode)\s*\d+$/i.test(u.title.trim())
        ? u.title
        : `Episódio ${u.number}`,
      getLocale(),
    );
    const crumb = pb
      ? `${pb.work.title} · ${translate(`Episódio ${unit.number}`, getLocale())}`
      : translate("Carregando…", getLocale());
    const myProg = s.unitProg;
    const nextU = pb && pb.next;
    const prevU = pb && pb.previous;
    const cur = myProg[this.episodeId];
    const curDone = !!(cur && cur.completed);
    const inEnd = s.ended || (this.hasOutro && s.t >= this.ED[0]);
    const overlayBlock = s.resume || s.error || s.loading;
    const ctrls = !s.playing || s.active || !!s.menu || s.eps || s.dragging;

    // menus com opções reais
    const heights = s.levels.map((l) => l.height).filter(Boolean);
    const audioOpts = s.audioTracks.length
      ? s.audioTracks.map((a) => [a.index, languageName(a.lang) + (a.name && a.name !== a.lang ? ` · ${a.name}` : ""), ""])
      : (src ? src.audioLanguages : []).map((l) => [0, languageName(l), "Faixa única desta fonte"]);
    const subList = s.subTracks.length ? s.subTracks : this.nativeTracks();
    const subOptsRaw = [[-1, "Desligadas", subList.length ? "" : "Esta fonte não tem faixas de legenda separadas"]].concat(
      subList.map((t) => [t.index, t.name || languageName(t.lang), languageName(t.lang)]),
    );
    const qualityOpts = [[-1, "Automática", heights.length > 1 ? "Ajusta à sua conexão" : "Única qualidade disponível"]].concat(
      heights.length > 1 ? s.levels.map((l) => [l.index, `${l.height}p`, ""]) : [],
    );
    const speedOpts = [0.75, 1, 1.25, 1.5, 2].map((x) => [x, x === 1 ? "Normal" : `${String(x).replace(".", ",")}x`, ""]);
    const MENUS = {
      audio: ["Áudio", audioOpts, s.audioTracks.length ? s.audioIdx : 0],
      subs: ["Legendas", subOptsRaw, s.subIdx],
      quality: ["Qualidade", qualityOpts, s.level],
      speed: ["Velocidade", speedOpts, s.speed],
    };
    const curHeight = s.curHeight || (heights.length ? Math.max(...heights) : src && src.maxHeight) || null;
    const qName = s.level >= 0 ? `${(s.levels[s.level] || {}).height}p` : `Automática${curHeight ? ` · ${curHeight}p` : ""}`;
    const audioName = (audioOpts.find((o) => o[0] === MENUS.audio[2]) || [0, "Original"])[1];
    const subsName = (subOptsRaw.find((o) => o[0] === s.subIdx) || [0, "Desligadas"])[1];
    const spName = s.speed === 1 ? "Normal" : `${String(s.speed).replace(".", ",")}x`;
    const pickers = {
      audio: (i) => {
        if (this.hls && s.audioTracks.length) this.hls.audioTrack = i;
        this.setState({ audioIdx: i, sub: null });
      },
      subs: (i) => this.pickSub(i),
      quality: (i) => {
        if (this.hls) this.hls.currentLevel = i;
        this.setState({ level: i, sub: null });
        this.showOsd(i < 0 ? "Qualidade automática" : `Qualidade: ${(s.levels[i] || {}).height}p`);
      },
      speed: (x) => {
        if (v) v.playbackRate = x;
        this.setState({ speed: x, sub: null });
        this.store("nk-player", { speed: x, vol: s.vol, muted: s.muted });
        this.showOsd(`Velocidade: ${x === 1 ? "Normal" : `${x}x`}`);
      },
    };
    const subOpts = s.sub
      ? MENUS[s.sub][1].map(([val, l, d]) => {
          const on = MENUS[s.sub][2] === val;
          return {
            label: l,
            desc: d || "",
            hasDesc: !!d,
            on,
            color: on ? "#DBAF57" : "#F0EEE9",
            opacity: 1,
            cursor: "pointer",
            pick: () => pickers[s.sub](val),
          };
        })
      : [];

    const savedText = !loggedIn
      ? "Entre para salvar seu progresso"
      : s.external || s.embedUrl
        ? "Marque como assistido quando terminar"
        : {
            saving: "Salvando progresso…",
            pending: "Sem conexão · progresso pendente",
            "auth-required": "Sessão expirada · entre para salvar",
            conflict: "Progresso atualizado em outro aparelho",
            error: "Não foi possível salvar o progresso",
          }[s.syncStatus] ||
          (s.savedAt
            ? Math.round((Date.now() - s.savedAt) / 1000) < 5
              ? "Progresso salvo agora"
              : `Progresso salvo há ${Math.round((Date.now() - s.savedAt) / 1000)} s`
            : "Progresso sincronizado");

    const epList = units.map((u, i) => {
      const p = myProg[u.id];
      const isCur = u.id === this.episodeId;
      const pctE = isCur ? pctN : p && p.durationMs ? p.positionMs / p.durationMs : 0;
      return {
        n: u.number,
        title: unitLabel(u),
        isCur,
        done: !!(p && p.completed) && !isCur,
        hasPct: !(p && p.completed) && pctE > 0.02,
        pctW: `${Math.round(pctE * 100)}%`,
        bgImg: bg(u.thumbnail),
        pos: "center",
        ring: isCur ? "#DBAF57" : "transparent",
        titleColor: isCur ? "#DBAF57" : u.available ? "#F0EEE9" : "#8F897D",
        bg: isCur ? "rgba(219,175,87,.08)" : "transparent",
        border: isCur ? "rgba(219,175,87,.4)" : "transparent",
        numColor: isCur ? "#DBAF57" : "#B7B1A4",
        state: isCur
          ? "assistindo agora"
          : !u.available
            ? "ainda indisponível"
            : p && p.completed
              ? "assistido"
              : p && p.positionMs > 30000
                ? `parou em ${this.fmt(p.positionMs / 1000)}`
                : u.durationSeconds
                  ? `${Math.round(u.durationSeconds / 60)} min`
                  : u.playable
                    ? "disponível"
                    : "abre no provedor",
        go: () => (u.available && !isCur ? this.goUnit(u.id) : null),
        _i: i,
      };
    });

    const extSrc = s.ranked.find((x) => x.externalUrl);
    const playableAlt = s.ranked.filter((x) => x.playsInPlayer && x.compatible && x.id !== s.src);
    const errorVals = s.external
      ? {
          errorTitle: "Este episódio abre no site do provedor",
          errorText:
            "A fonte disponível não roda dentro do NekoFlow e não informa o tempo assistido. Marque como assistido quando terminar.",
          errorSaved: false,
          tryOtherLabel: extSrc ? "Assistir no provedor ↗" : "Voltar à obra",
          tryOther: () =>
            extSrc ? window.open(extSrc.externalUrl, "_blank", "noopener,noreferrer") : (location.href = pb.work.href),
          retryLabel: curDone ? "Assistido · desfazer" : "Marcar como assistido",
          retry: () => this.toggleDoneReal(curDone),
        }
      : s.fatal
        ? {
            errorTitle: "Episódio indisponível",
            errorText: s.errorText,
            errorSaved: false,
            tryOtherLabel: "Tentar novamente",
            tryOther: () => location.reload(),
            retryLabel: "Voltar",
            retry: () => history.back(),
          }
        : {
            errorTitle: s.incompatible ? "Formato não suportado neste navegador" : "Não foi possível carregar o vídeo",
            errorText: s.errorText || "A fonte não respondeu.",
            errorSaved: loggedIn && s.t > 0,
            tryOtherLabel: playableAlt.length
              ? "Tentar outra fonte"
              : extSrc
                ? "Assistir no provedor ↗"
                : "Reportar problema",
            tryOther: () =>
              playableAlt.length
                ? this.setSource(playableAlt[0].id)
                : extSrc
                  ? window.open(extSrc.externalUrl, "_blank", "noopener,noreferrer")
                  : loggedIn
                    ? this.setState({ report: true, reportReason: "VIDEO_NOT_LOADING", menu: null })
                    : goLogin(),
            retryLabel: "Tentar novamente",
            retry: () => {
              const cur2 = s.ranked.find((x) => x.id === s.src);
              if (cur2) this.attach(cur2, s.t, { autoplay: true });
            },
          };

    return {
      ...base,
      ...errorVals,
      demoBanner: false,
      realVideo: !s.embedUrl,
      embedUrl: s.embedUrl,
      // Guia "Idiomas e Servidores": versão (legendado/dublado + idioma) e servidor separados.
      ...this.versionVals(),
      commentsOn: false,
      videoRef: this.videoRef,
      videoPoster: pb ? pb.work.banner : null,
      workTitle: pb ? pb.work.title : "",
      workHref: pb ? pb.work.href : "/animes",
      hasOrig: !!(pb && pb.adaptation),
      origHref: pb && pb.adaptation ? pb.adaptation.href : "#",
      origCta: pb && pb.adaptation ? `Ver o ${pb.adaptation.kind === "manga" ? "mangá" : "original"} →` : "",
      origText: pb && pb.adaptation ? `Este anime adapta ${pb.adaptation.title}.` : "",
      crumb,
      crumbShort: pb ? `${pb.work.title} · ${translate(`Episódio ${unit.number}`, getLocale())}` : "",
      savedText,
      frameBg: "none",
      frameDim: 1,
      showSub: false,
      subText: "",
      stageClick: () => {
        if (s.menu || s.eps) {
          this.setState({ menu: null, sub: null, eps: false });
          return;
        }
        if (s.narrow && !s.active) {
          this.wake();
          return;
        }
        this.togglePlay();
      },
      showBigPlay: !s.embedUrl && !s.playing && !overlayBlock && !s.narrow,
      resumeYes: () => {
        this.setState({ resume: false });
        this.playNow();
      },
      resumeNo: () => {
        this.setState({ resume: false });
        this.seek(0);
        this.playNow();
      },
      showSkipOp: this.OP[0] >= 0 && s.t >= this.OP[0] && s.t < this.OP[1] && !s.autoSkip && !overlayBlock,
      skipOp: () => this.seek(this.OP[1], "Abertura pulada"),
      showNext: inEnd && !s.nextDismissed && !overlayBlock && (!!nextU || s.ended),
      next: nextU
        ? {
            label: s.autoNext && (s.playing || s.ended) ? `Próximo em ${Math.ceil(s.countdown)} s` : "A seguir",
            title: `Episódio ${nextU.number}${nextU.title ? ` · ${nextU.title}` : ""}`,
            meta: nextU.durationSeconds ? `${Math.round(nextU.durationSeconds / 60)} min` : "",
            bg: bg(null),
            pos: "center",
            hasCount: s.autoNext && (s.playing || s.ended),
            countPct: `${Math.max(0, ((10 - s.countdown) / 10) * 100)}%`,
            cta: "Assistir próximo",
            go: () => this.goUnit(nextU.id),
            dismissLabel: s.autoNext && (s.playing || s.ended) ? "Cancelar" : "Ver créditos",
          }
        : {
            label: "Fim do episódio",
            title: "Você chegou ao último episódio disponível",
            meta: pb && pb.adaptation ? `A história continua em ${pb.adaptation.title}` : "",
            bg: bg(null),
            pos: "center",
            hasCount: false,
            countPct: "0%",
            cta: pb && pb.adaptation ? "Continuar na obra original" : "Voltar à obra",
            go: () => (location.href = pb && pb.adaptation ? pb.adaptation.href : pb.work.href),
            dismissLabel: "Fechar",
          },
      showControls: !s.embedUrl && ctrls && !s.resume && !s.error,
      pct: `${pctN * 100}%`,
      bufPct: dur ? `${Math.min(100, (s.bufEnd / dur) * 100)}%` : "0%",
      opLeft: this.OP[0] >= 0 && dur ? `${(this.OP[0] / dur) * 100}%` : "0%",
      opW: this.OP[0] >= 0 && dur ? `${((this.OP[1] - this.OP[0]) / dur) * 100}%` : "0%",
      edLeft: this.hasOutro && dur ? `${(this.ED[0] / dur) * 100}%` : "0%",
      edW: this.hasOutro && dur ? `${((this.ED[1] - this.ED[0]) / dur) * 100}%` : "0%",
      hoverLeft: dur ? `${((s.hover || 0) / dur) * 100}%` : "0%",
      hoverChapter:
        this.OP[0] >= 0 && s.hover >= this.OP[0] && s.hover < this.OP[1]
          ? "Abertura"
          : this.hasOutro && s.hover >= this.ED[0] && s.hover < this.ED[1]
            ? "Encerramento"
            : "",
      onVol: (e) => {
        const vol = +e.target.value;
        if (v) {
          v.volume = vol / 100;
          v.muted = vol === 0;
        }
        this.setState({ vol, muted: vol === 0 });
        this.store("nk-player", { speed: s.speed, vol, muted: vol === 0 });
      },
      durText: this.fmt(dur),
      hasNextEp: !!nextU,
      goNextNow: () => nextU && this.goUnit(nextU.id),
      ccColor: s.subIdx >= 0 ? "#DBAF57" : "#8F897D",
      sources: s.ranked.map((x) => ({
        label: [x.label, sourceLanguageSummary(x)].filter(Boolean).join(" · "),
        desc: x.embedUrl
          ? `Player incorporado no NekoFlow${x.subtitleLanguages?.length ? ` · legenda ${x.subtitleLanguages.map(languageName).join(" / ")}` : ""}`
          : x.playsInPlayer
          ? !x.compatible
            ? "Incompatível com este navegador"
            : x.capabilities.progress
              ? "Reprodução integrada · progresso automático"
              : "Reprodução integrada"
          : "Abre no site do provedor ↗",
        rec: x.id === (pickSource(s.ranked) || {}).id,
        on: s.src === x.id,
        color: s.src === x.id ? "#DBAF57" : x.compatible ? "#F0EEE9" : "#8F897D",
        bg: s.src === x.id ? "rgba(219,175,87,.08)" : "transparent",
        pick: () => this.setSource(x.id),
      })),
      subTitle: s.sub ? MENUS[s.sub][0] : "",
      subOpts,
      setRows: [
        ["audio", "Áudio", audioName],
        ["subs", "Legendas", subsName],
        ["quality", "Qualidade", qName],
        ["speed", "Velocidade", spName],
      ].map(([k, l, val]) => ({ label: l, value: val, open: () => this.setState({ sub: k }) })),
      epList,
      seasonLabel: pb ? pb.work.title : "",
      ep: { n: unit.number, title: unitLabel(unit) },
      chips: [
        dur ? `${Math.round(dur / 60)} min` : null,
        `Áudio ${audioName}`,
        s.subIdx >= 0 ? `Legenda ${subsName}` : "Sem legenda separada",
        qName,
        src ? src.label : "Fonte externa",
      ].filter(Boolean),
      fallbackNote: false,
      synText: (pb && pb.episode.synopsis) || "A sinopse deste episódio ainda não foi cadastrada.",
      goPrev: () => prevU && this.goUnit(prevU.id),
      prevCursor: prevU ? "pointer" : "not-allowed",
      prevOpacity: prevU ? 1 : 0.4,
      nextCursor: nextU ? "pointer" : "not-allowed",
      nextBg: nextU ? "#DBAF57" : "#4A443D",
      toggleDone: () => this.toggleDoneReal(curDone),
      doneLabel: curDone ? "Assistido · desfazer" : "Marcar como assistido",
      doneColor: curDone ? "#DBAF57" : "#F0EEE9",
      doneBorder: curDone ? "rgba(219,175,87,.6)" : "rgba(240,238,233,.18)",
      reportCtx: `${crumb} · em ${this.fmt(s.t)} · ${src ? src.label : "fonte externa"}`,
      reportOpts: Object.entries(ISSUE_CATEGORIES).map(([k, l]) => {
        const on = s.reportReason === k;
        return {
          label: l,
          border: on ? "#DBAF57" : "rgba(240,238,233,.1)",
          bg: on ? "rgba(219,175,87,.08)" : "transparent",
          dotBorder: on ? "#DBAF57" : "rgba(240,238,233,.3)",
          dot: on ? "#DBAF57" : "transparent",
          pick: () => this.setState({ reportReason: k }),
        };
      }),
      openReport: () => {
        if (!loggedIn) return goLogin();
        if (v && !v.paused) v.pause();
        this.setState({ report: true, menu: null });
      },
      sendReport: () => {
        if (!s.reportReason) return;
        mediaApi
          .reportIssue({
            episodeId: this.episodeId,
            sourceId: src && src.playsInPlayer ? src.id : null,
            category: s.reportReason,
            detail: (s.reportText || "").trim() || null,
            positionMs: Math.round(s.t * 1000),
          })
          .then(() => this.flash("Obrigado! A equipe vai verificar este episódio."))
          .catch((e) => this.flash(e?.body?.message || "Não foi possível enviar o relato."));
        this.setState({ report: false, reportReason: null, reportText: "" });
      },
    };
  }

  async toggleDoneReal(done) {
    if (!session.loggedIn) return goLogin();
    try {
      await progressApi.setEpisodeCompleted(this.episodeId, !done);
      this.loadUnits();
      this.flash(done ? "Marcado como não assistido" : `Episódio ${this.state.pb.episode.number} marcado como assistido`);
    } catch (e) {
      this.flash(e?.body?.message || "Não foi possível salvar.");
    }
  }
}

let hlsPromise = null;
function loadHls() {
  if (!hlsPromise) hlsPromise = import("hls.js").then((m) => m.default).catch(() => null);
  return hlsPromise;
}

const RealPlayer = defineDC("Player", RealPlayerLogic, render, { helmet });

export default function Player(props) {
  const episodeId = new URLSearchParams(location.search).get("episode");
  return episodeId ? <RealPlayer key={episodeId} episodeId={episodeId} {...props} /> : <LegacyPlayer {...props} />;
}
