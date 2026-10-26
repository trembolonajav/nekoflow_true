// Origem: design/claude-design/Leitor.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { api } from "../lib/api";
import { saveUnit, recordOpened, loadWork } from "../lib/progress";
import { DCLogic, defineDC, txt, asList, css, val } from "../dc/runtime";
import { canonicalWorks } from "../features/catalog/workNavigation";
import { session } from "../lib/session";
import { mediaApi } from "../features/media/mediaApi";
import { progressApi } from "../features/progress/progressApi";
import { track } from "../features/telemetry/telemetry";

class LeitorLogic extends DCLogic {
  SEGS = 24;
  LAST = 200;
  WORK_ID = 105398;
  /** Posição no capítulo: segmento*1000 + deslocamento dentro dele (0–999). */
  encodePos(p) {
    return Math.round((p.seg || 0) * 1000 + Math.min(0.999, p.off || 0) * 1000);
  }
  sync(ch, p, reset) {
    saveUnit(this.WORK_ID, ch, {
      position: this.encodePos(p),
      pct: Math.round((p.pct || 0) * 1000) / 10,
      completed: !!p.done,
      reset: !!reset,
    });
  }
  RATIOS = ["720/1100", "720/900", "720/1400", "720/760", "720/1250", "720/980"];
  state = {
    d: null,
    ch: (() => {
      const q = parseInt(new URLSearchParams(location.search).get("cap"), 10);
      return q >= 0 && q <= 200 ? q : 0;
    })(),
    mode: "vertical",
    dir: "auto",
    fit: "width",
    zoom: 100,
    theme: "black",
    offerNext: true,
    showPct: true,
    autoNext: false,
    pct: 0,
    seg: 0,
    off: 0,
    page: 0,
    prog: {},
    bm: [],
    resume: false,
    ctrl: true,
    panel: null,
    pickTab: "ch",
    pickQ: "",
    wide: true,
    fs: false,
    sync: "idle",
    pagedEnd: false,
    toast: null,
  };
  rootRef = React.createRef();
  scrollRef = React.createRef();
  endRef = React.createRef();
  pagedRef = React.createRef();
  pickListRef = React.createRef();
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
  componentDidMount() {
    const prefs = this.load("nk-reader-prefs", {});
    const q = parseInt(new URLSearchParams(location.search).get("cap"), 10);
    // Progresso vem da conta (mesma fonte da página da obra e da biblioteca).
    loadWork(this.WORK_ID).then((me) => {
      const prog = {};
      Object.entries((me && me.units) || {}).forEach(([n, u]) => {
        const pos = u.t || 0;
        const seg = Math.floor(pos / 1000);
        prog[n] = {
          done: u.done,
          pct: u.done ? 1 : (u.pct || 0) / 100,
          seg,
          off: (pos % 1000) / 1000,
          page: seg,
          at: u.at,
        };
      });
      const ch =
        q >= 0 && q <= this.LAST ? q : me && me.resumeUnit != null && me.resumeUnit <= this.LAST ? me.resumeUnit : 0;
      this.setState({ ...prefs, prog, bm: this.load("nk-reader-bm", []) }, () => this.enter(ch, true));
    });
    api.get("/api/content/leitura-obra")
      .then((d) => this.setState({ d }));
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("fullscreenchange", this.onFs);
    window.addEventListener("resize", this.onResize);
    this.onResize();
    window.addEventListener("beforeunload", this.flush);
    this.idle = setInterval(() => {
      const s = this.state;
      if (s.ctrl && !s.panel && !s.resume && Date.now() - (this.lastMove || 0) > 3000 && this.started)
        this.setState({ ctrl: false });
    }, 500);
  }
  componentWillUnmount() {
    this.flush();
    clearInterval(this.idle);
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("fullscreenchange", this.onFs);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("beforeunload", this.flush);
  }
  onResize = () => {
    const w = window.innerWidth >= 760;
    if (w !== this.state.wide)
      this.setState({ wide: w, mode: !w && this.state.mode === "double" ? "single" : this.state.mode });
  };
  onFs = () => this.setState({ fs: !!document.fullscreenElement });
  savePrefs(patch) {
    this.setState(patch, () => {
      const s = this.state;
      this.store("nk-reader-prefs", {
        mode: s.mode,
        dir: s.dir,
        fit: s.fit,
        zoom: s.zoom,
        theme: s.theme,
        offerNext: s.offerNext,
        showPct: s.showPct,
        autoNext: s.autoNext,
      });
    });
  }
  flash(t) {
    clearTimeout(this.tt);
    this.setState({ toast: t });
    this.tt = setTimeout(() => this.setState({ toast: null }), 2200);
  }
  flush = () => {
    const s = this.state;
    if (s.ch == null || !this.started) return;
    const cur = s.prog[s.ch] || {};
    const prog = { ...s.prog, [s.ch]: { ...cur, seg: s.seg, off: s.off, page: s.page, pct: s.pct, at: Date.now() } };
    this.sync(s.ch, prog[s.ch]);
    this.setState({ prog, sync: "saved", savedAt: Date.now() });
  };
  queueSave() {
    this.setState({ sync: "pending" });
    clearTimeout(this.sv);
    this.sv = setTimeout(this.flush, 1500);
  }
  enter(ch, first) {
    const p = this.state.prog[ch] || {};
    const hasPos = !p.done && p.pct > 0.03;
    this.started = false;
    this.setState({
      ch,
      pct: 0,
      seg: 0,
      off: 0,
      page: 0,
      pagedEnd: false,
      resume: hasPos,
      panel: null,
      pickQ: "",
      ctrl: true,
    });
    try {
      history.replaceState(null, "", `?cap=${ch}`);
    } catch (e) {}
    recordOpened(this.WORK_ID, ch);
    setTimeout(() => {
      const el = this.scrollRef.current;
      if (el) el.scrollTop = 0;
      if (!hasPos) this.started = true;
    }, 30);
  }
  goCh(n) {
    if (n < 0 || n > this.LAST || n === this.state.ch) return;
    if (this.state.pt !== false && n >= 196 && n <= 200) {
      this.flash("Capítulo em tradução para português");
      return;
    }
    this.flush();
    this.enter(n);
  }
  restore(p) {
    const s = this.state;
    if (s.mode === "vertical") {
      setTimeout(() => {
        const box = this.scrollRef.current;
        if (!box) return;
        const el = box.querySelector(`[data-seg="${p.seg || 0}"]`);
        if (el) box.scrollTop = el.offsetTop + (p.off || 0) * el.offsetHeight - 70;
        this.started = true;
        this.onScroll();
      }, 40);
    } else {
      this.setState({ page: Math.min(this.SEGS - 1, p.page || Math.round((p.pct || 0) * (this.SEGS - 1))) });
      this.started = true;
    }
  }
  onScroll = () => {
    const box = this.scrollRef.current;
    if (!box) return;
    const st = box.scrollTop;
    const max = box.scrollHeight - box.clientHeight;
    const endTop = this.endRef.current ? this.endRef.current.offsetTop : box.scrollHeight;
    const pct = Math.max(0, Math.min(1, (st + box.clientHeight * 0.5) / endTop));
    let seg = 0,
      off = 0;
    const probe = st + 70;
    const els = box.querySelectorAll("[data-seg]");
    for (const el of els) {
      if (el.offsetTop <= probe) {
        seg = +el.dataset.seg;
        off = (probe - el.offsetTop) / el.offsetHeight;
      }
    }
    const dy = st - (this.lastSt || 0);
    this.lastSt = st;
    const patch = { pct, seg, off: Math.min(1, off) };
    if (this.started && Math.abs(dy) > 6 && !this.state.panel) patch.ctrl = dy < 0 && st > 40 ? this.state.ctrl : false;
    if (st < 40) patch.ctrl = true;
    this.setState(patch);
    if (this.started) {
      this.queueSave();
      if (st >= max - 4 || st + box.clientHeight >= endTop + 60) this.complete();
    }
  };
  complete() {
    const s = this.state;
    const cur = s.prog[s.ch] || {};
    if (cur.done) return;
    const prog = { ...s.prog, [s.ch]: { ...cur, done: true, pct: 1 } };
    this.sync(s.ch, prog[s.ch]);
    this.setState({ prog });
    if (s.autoNext && s.ch < this.LAST) setTimeout(() => this.goCh(s.ch + 1), 1200);
  }
  wake = () => {
    this.lastMove = Date.now();
    if (!this.state.ctrl && this.state.wide && this.state.mode !== "vertical") this.setState({ ctrl: true });
  };
  fwd() {
    const s = this.state;
    const step = s.mode === "double" ? 2 : 1;
    if (s.page + step > this.SEGS - 1) {
      this.setState({ pagedEnd: true });
      this.complete();
      return;
    }
    this.setPage(s.page + step);
  }
  back() {
    const s = this.state;
    if (s.pagedEnd) {
      this.setState({ pagedEnd: false });
      return;
    }
    const step = s.mode === "double" ? 2 : 1;
    this.setPage(Math.max(0, s.page - step));
  }
  setPage(p) {
    this.setState({ page: p, pct: p / (this.SEGS - 1), pagedEnd: false });
    this.started = true;
    this.queueSave();
  }
  rtl() {
    return this.state.dir === "rtl";
  }
  setMode(m) {
    const s = this.state;
    if (m === s.mode) return;
    if (m === "double" && !s.wide) return;
    const pct = s.pct;
    this.savePrefs({ mode: m, pagedEnd: false });
    if (m === "vertical") this.restore({ seg: Math.round(pct * (this.SEGS - 1)), off: 0 });
    else {
      let page = Math.round(pct * (this.SEGS - 1));
      if (m === "double" && page % 2 === 1) page -= 1;
      this.setState({ page });
    }
  }
  onKey = (e) => {
    if (/input|textarea/i.test((document.activeElement || {}).tagName || "")) return;
    const s = this.state;
    const k = e.key;
    if (k === "Escape") {
      this.setState({ panel: null });
      return;
    }
    if (k === "f" || k === "F") {
      this.toggleFs();
      return;
    }
    if (k === "b" || k === "B") {
      this.addBookmark();
      return;
    }
    if (s.mode !== "vertical" && (k === "ArrowRight" || k === "ArrowLeft")) {
      e.preventDefault();
      const forward = (k === "ArrowRight") !== this.rtl();
      forward ? this.fwd() : this.back();
    }
  };
  toggleFs = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.rootRef.current.requestFullscreen();
    } catch (e) {}
  };
  addBookmark = () => {
    const s = this.state;
    const where = s.mode === "vertical" ? `${Math.round(s.pct * 100)}%` : `página ${s.page + 1}`;
    const bm = [
      { id: Date.now(), ch: s.ch, seg: s.seg, off: s.off, page: s.page, pct: s.pct, where, at: Date.now() },
      ...s.bm,
    ];
    this.store("nk-reader-bm", bm);
    this.setState({ bm });
    this.flash(`Marcador salvo · capítulo ${s.ch}, ${where}`);
  };
  ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1
      ? "agora"
      : m < 60
        ? `há ${m} min`
        : m < 1440
          ? `há ${Math.round(m / 60)} h`
          : `há ${Math.round(m / 1440)} d`;
  }
  renderVals() {
    const s = this.state;
    const d = s.d;
    const bg = (u) => (u ? `url("${u}")` : "none");
    const pool = d ? [d.banner, d.anime.banner, d.cover, d.anime.cover, ...d.chars.map((c) => c.img)] : [];
    const P = ["center 20%", "center 50%", "center 80%", "30% 40%", "70% 30%", "center top"];
    const shades = [
      "linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.25))",
      "linear-gradient(0deg,rgba(0,0,0,0),rgba(0,0,0,.2))",
      "rgba(0,0,0,.08)",
      "radial-gradient(circle at 50% 40%,rgba(0,0,0,0),rgba(0,0,0,.45))",
    ];
    const segs = pool.length
      ? Array.from({ length: this.SEGS }, (_, i) => ({
          i,
          ratio: this.RATIOS[(i + s.ch) % this.RATIOS.length],
          bg: bg(pool[(s.ch * 3 + i * 5) % pool.length]),
          size: "cover",
          pos: P[(i + s.ch) % P.length],
          shade: shades[i % shades.length],
          label: `seg. ${String(i + 1).padStart(2, "0")}`,
        }))
      : [];
    const vertical = s.mode === "vertical";
    const paged = !vertical;
    const dbl = s.mode === "double";
    const rtl = this.rtl();
    const spreadIdx = dbl ? [s.page, s.page + 1].filter((i) => i < this.SEGS) : [s.page];
    const spread = segs.length ? spreadIdx.map((i) => ({ ...segs[i], label: `p. ${i + 1}` })) : [];
    const zoom = s.zoom / 100;
    const panelWide = s.wide;
    const pc = s.prog;
    const isDone = (n) => !!(pc[n] && pc[n].done);
    const nextLocked = (n) => n >= 196 && n <= 200;
    const chName = (n) => (n === 0 ? "Prólogo" : n > 179 ? `História paralela ${n - 179}` : `Capítulo ${n}`);
    const pq = parseInt(s.pickQ, 10);
    const pickNums = [];
    for (let n = this.LAST; n >= 0; n--) pickNums.push(n);
    const pickList = (isNaN(pq) ? pickNums : pickNums.filter((n) => String(n).startsWith(String(pq)))).map((n) => {
      const cur = n === s.ch;
      const done = isDone(n);
      const locked = nextLocked(n);
      const p = pc[n] || {};
      return {
        n,
        title: chName(n),
        done: done && !cur,
        go: () => this.goCh(n),
        cursor: locked ? "not-allowed" : "pointer",
        state: cur
          ? "Lendo agora"
          : locked
            ? "Em tradução · disponível em inglês"
            : done
              ? "Concluído"
              : p.pct > 0.03
                ? `Parou em ${Math.round(p.pct * 100)}%`
                : "Disponível",
        stateColor: cur ? "#DBAF57" : "#B7B1A4",
        numColor: cur ? "#DBAF57" : done ? "#8F897D" : "#F0EEE9",
        bg: cur ? "rgba(219,175,87,.1)" : "transparent",
        border: cur ? "rgba(219,175,87,.45)" : "transparent",
        opacity: locked ? 0.5 : 1,
      };
    });
    const choice = (on, dis) => ({
      bg: on ? "rgba(219,175,87,.14)" : "#1A1714",
      border: on ? "#DBAF57" : "rgba(240,238,233,.1)",
      color: on ? "#DBAF57" : "#F0EEE9",
      opacity: dis ? 0.4 : 1,
      cursor: dis ? "not-allowed" : "pointer",
    });
    const opt = (label, sub, on, pick, dis, hint) => ({
      label,
      sub: sub || "",
      hasSub: !!sub,
      ...choice(on, dis),
      pick: dis ? () => {} : pick,
      hint: hint || "",
    });
    const prefGroups = [
      {
        label: "Modo de leitura",
        cols: 3,
        opts: [
          opt("Vertical", "contínuo", vertical, () => this.setMode("vertical")),
          opt("Página única", "", s.mode === "single", () => this.setMode("single")),
          opt("Página dupla", s.wide ? "" : "só no computador", dbl, () => this.setMode("double"), !s.wide),
        ],
      },
      {
        label: "Direção das páginas",
        cols: 3,
        opts: [
          opt("Automática", "esq. → dir.", s.dir === "auto", () => this.savePrefs({ dir: "auto" }), vertical),
          opt("Oriental", "dir. → esq.", s.dir === "rtl", () => this.savePrefs({ dir: "rtl" }), vertical),
          opt("Ocidental", "esq. → dir.", s.dir === "ltr", () => this.savePrefs({ dir: "ltr" }), vertical),
        ],
      },
      {
        label: "Ajuste",
        cols: 2,
        opts: [
          opt("Largura", "", s.fit === "width", () => this.savePrefs({ fit: "width" })),
          opt(
            "Altura",
            vertical ? "só paginado" : "",
            s.fit === "height",
            () => this.savePrefs({ fit: "height" }),
            vertical,
          ),
        ],
      },
      {
        label: "Fundo",
        cols: 3,
        opts: [
          opt("Preto", "", s.theme === "black", () => this.savePrefs({ theme: "black" })),
          opt("Cinza", "", s.theme === "gray", () => this.savePrefs({ theme: "gray" })),
          opt("Branco", "", s.theme === "white", () => this.savePrefs({ theme: "white" })),
        ],
      },
    ];
    const tog = (on) => ({
      track: on ? "#DBAF57" : "#2D2924",
      knob: on ? "#1A1714" : "#B7B1A4",
      x: on ? "21px" : "3px",
    });
    const prefToggles = [
      {
        label: "Oferecer próximo capítulo ao terminar",
        desc: "Mostra o resumo no fim do capítulo",
        on: s.offerNext,
        toggle: () => this.savePrefs({ offerNext: !s.offerNext }),
      },
      {
        label: "Avançar automaticamente",
        desc: "Abre o próximo capítulo sozinho. Desligado por padrão",
        on: s.autoNext,
        toggle: () => this.savePrefs({ autoNext: !s.autoNext }),
      },
      {
        label: "Mostrar indicador de progresso",
        desc: "Linha dourada fina no topo",
        on: s.showPct,
        toggle: () => this.savePrefs({ showPct: !s.showPct }),
      },
    ].map((r) => ({ ...r, ...tog(r.on) }));
    const fitH = paged && s.fit === "height";
    const pageH = fitH
      ? `calc((100vh - ${s.ctrl ? 0 : 0}px) * ${zoom})`
      : dbl
        ? `calc(min(100vh, (100vw - 40px) * 0.75) * ${zoom})`
        : `calc(min(100vh * 1.4, (100vw - 40px) * 1.5) * ${zoom})`;
    const p = pc[s.ch] || {};
    const hasNext = s.ch < this.LAST;
    const nextName = hasNext ? chName(s.ch + 1) : "";
    const bmHere = s.bm.some((b) => b.ch === s.ch && Math.abs(b.pct - s.pct) < 0.03);
    const sinceSaved = s.savedAt ? Math.round((Date.now() - s.savedAt) / 1000) : null;
    const leftIsForward = rtl;
    return {
      // Valores do leitor demonstrativo; o leitor real (RealLeitorLogic) substitui.
      demoBanner: true,
      workTitle: "Solo Leveling",
      workHref: canonicalWorks.soloLevelingReading,
      rootRef: this.rootRef,
      scrollRef: this.scrollRef,
      endRef: this.endRef,
      pagedRef: this.pagedRef,
      pickListRef: this.pickListRef,
      readerBg: { black: "#0B0A09", gray: "#2A2826", white: "#EDEAE4" }[s.theme],
      vertical,
      paged,
      segs,
      wide: s.wide,
      ch: s.ch,
      colW: `calc(${s.wide ? 720 : 100 * 7.2}px * ${zoom})`,
      colMax: zoom > 1 ? "none" : "100%",
      topPad: "0px",
      onScroll: this.onScroll,
      tapToggle: () => {
        if (s.panel) {
          this.setState({ panel: null });
          return;
        }
        this.lastMove = Date.now();
        this.setState({ ctrl: !s.ctrl });
      },
      spread,
      spreadDir: rtl ? "row-reverse" : "row",
      pageH,
      pagedAlign: fitH || zoom > 1 ? "flex-start" : "center",
      pagedPad: fitH ? "0" : "20px",
      zoneLeft: () => (leftIsForward ? this.fwd() : this.back()),
      zoneRight: () => (leftIsForward ? this.back() : this.fwd()),
      leftLabel: leftIsForward ? "Próxima página" : "Página anterior",
      rightLabel: leftIsForward ? "Página anterior" : "Próxima página",
      zoneCursorL: leftIsForward ? "e-resize" : "w-resize",
      zoneCursorR: leftIsForward ? "w-resize" : "e-resize",
      pagedEnd: s.pagedEnd,
      backFromEnd: () => this.setState({ pagedEnd: false }),
      endTitle: hasNext ? "Capítulo concluído" : "Você chegou ao fim de Solo Leveling",
      endText: hasNext
        ? s.offerNext
          ? `Você terminou ${chName(s.ch).toLowerCase()}. ${nextLocked(s.ch + 1) ? "O próximo ainda está em tradução para português." : `A seguir: ${nextName}.`}`
          : `Você terminou ${chName(s.ch).toLowerCase()}.`
        : "A história continua em Solo Leveling: Ragnarok.",
      hasNextCh: hasNext && s.offerNext && !nextLocked(s.ch + 1),
      nextChLabel: `Ler ${nextName.toLowerCase()}`,
      goNextCh: () => this.goCh(s.ch + 1),
      goPrevCh: () => this.goCh(s.ch - 1),
      prevCursor: s.ch > 0 ? "pointer" : "not-allowed",
      prevOpacity: s.ch > 0 ? 1 : 0.4,
      nextCursor: hasNext ? "pointer" : "not-allowed",
      nextOpacity: hasNext && !nextLocked(s.ch + 1) ? 1 : 0.4,
      showDiscussion: () => this.flash("A discussão do capítulo abre numa página própria, com aviso de spoilers"),
      resumeAsk: s.resume,
      resumePct: `${Math.round((p.pct || 0) * 100)}%`,
      resumeText: `Você parou em ${Math.round((p.pct || 0) * 100)}% deste capítulo${p.at ? `, ${this.ago(p.at)}` : ", ontem"}. A posição é a mesma em todos os seus dispositivos.`,
      resumeYes: () => {
        this.setState({ resume: false });
        this.restore(p);
      },
      resumeNo: () => {
        this.setState({ resume: false });
        this.started = true;
      },
      topY: s.ctrl ? "0" : "-110%",
      botY: s.ctrl ? "0" : "110%",
      chTitle: chName(s.ch),
      syncDisplay: s.wide ? "block" : "none",
      syncText:
        s.sync === "pending"
          ? "Salvando…"
          : s.sync === "saved"
            ? sinceSaved < 5
              ? "Progresso salvo"
              : `Salvo há ${sinceSaved} s`
            : "Sincronizado",
      addBookmark: this.addBookmark,
      bmColor: bmHere ? "#DBAF57" : "#F0EEE9",
      bmFill: bmHere ? "#DBAF57" : "none",
      toggleSettings: () => this.setState({ panel: s.panel === "set" ? null : "set", ctrl: true }),
      setColor: s.panel === "set" ? "#DBAF57" : "#F0EEE9",
      toggleFs: this.toggleFs,
      fsLabel: s.fs ? "Sair da tela cheia" : "Tela cheia",
      fsPath: s.fs ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
      showProgressLine: s.showPct && !s.ctrl,
      pctW: `${Math.round(s.pct * 100)}%`,
      sliderMax: vertical ? 100 : this.SEGS - 1,
      sliderVal: vertical ? Math.round(s.pct * 100) : s.page,
      sliderDir: paged && rtl ? "rtl" : "ltr",
      onSlider: (e) => {
        const v = +e.target.value;
        if (vertical) {
          const box = this.scrollRef.current;
          const endTop = this.endRef.current ? this.endRef.current.offsetTop : box.scrollHeight;
          box.scrollTop = (v / 100) * endTop - box.clientHeight * 0.5;
        } else this.setPage(dbl && v % 2 ? v - 1 : v);
      },
      posText: vertical
        ? `${Math.round(s.pct * 100)}% · segmento ${s.seg + 1} de ${this.SEGS}`
        : dbl
          ? `Páginas ${s.page + 1}–${Math.min(this.SEGS, s.page + 2)} de ${this.SEGS}`
          : `Página ${s.page + 1} de ${this.SEGS}`,
      modeText: vertical
        ? "Rolagem vertical"
        : `${dbl ? "Página dupla" : "Página única"} · ${rtl ? "dir. → esq." : "esq. → dir."}`,
      openPicker: () => {
        this.setState({ panel: "pick", pickTab: "ch", ctrl: true });
        setTimeout(() => {
          const box = this.pickListRef.current;
          const el = box && box.querySelector(`[data-pick="${s.ch}"]`);
          if (el) box.scrollTop = el.offsetTop - box.clientHeight / 2;
        }, 50);
      },
      closePanels: () => this.setState({ panel: null }),
      pickerOpen: s.panel === "pick",
      setOpen: s.panel === "set",
      panelStyle: panelWide
        ? "position:absolute;top:0;right:0;bottom:0;width:min(380px,100vw);border-width:0 0 0 1px"
        : "position:absolute;left:0;right:0;bottom:0;max-height:78vh;border-radius:18px 18px 0 0;border-width:1px 0 0 0",
      pickTabs: [
        ["ch", "Capítulos", null],
        ["bm", "Marcadores", s.bm.length],
      ].map(([k, l, c]) => ({
        label: l,
        count: c,
        hasCount: !!c,
        bg: s.pickTab === k ? "#DBAF57" : "transparent",
        color: s.pickTab === k ? "#1A1714" : "#F0EEE9",
        pick: () => this.setState({ pickTab: k }),
      })),
      pickChapters: s.pickTab === "ch",
      pickBookmarks: s.pickTab === "bm",
      pickQ: s.pickQ,
      onPickQ: (e) => this.setState({ pickQ: e.target.value }),
      pickList,
      bookmarks: s.bm.map((b) => ({
        ...b,
        when: this.ago(b.at),
        go: () => {
          this.setState({ panel: null });
          if (b.ch !== s.ch) {
            this.flush();
            this.enter(b.ch);
            setTimeout(() => {
              this.setState({ resume: false });
              this.restore(b);
            }, 60);
          } else this.restore(b);
        },
        remove: () => {
          const bm = s.bm.filter((x) => x.id !== b.id);
          this.store("nk-reader-bm", bm);
          this.setState({ bm });
        },
      })),
      noBookmarks: s.bm.length === 0,
      editionNote: paged,
      prefGroups,
      prefToggles,
      zoomText: `${s.zoom}%`,
      zoomVal: s.zoom,
      onZoom: (e) => this.savePrefs({ zoom: +e.target.value }),
      zoomIn: () => this.savePrefs({ zoom: Math.min(200, s.zoom + 10) }),
      zoomOut: () => this.savePrefs({ zoom: Math.max(50, s.zoom - 10) }),
      shortcutText: vertical
        ? "Atalhos: rolagem do mouse ou setas ↑ ↓ para ler · B marca a posição · F tela cheia · Esc fecha painéis."
        : `Atalhos: ${rtl ? "← avança e → volta (leitura oriental)" : "→ avança e ← volta"} · B marca a posição · F tela cheia · Esc fecha painéis.`,
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
    text: "\nhtml,body{margin:0;height:100%;overflow:hidden;background:#0B0A09;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\ninput::placeholder{color:#8F897D}\ninput[type=range]{accent-color:#DBAF57}\ninput[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}\n",
  },
];

function render(v) {
  return (
    <>
      <div
        ref={v.rootRef}
        onMouseMove={v.wake}
        style={{
          position: "fixed",
          inset: "0",
          background: `${v.readerBg ?? ""}`,
          transition: "background .25s",
          overflow: "hidden",
        }}
      >
        {v.demoBanner ? (
        <div
          role="status"
          style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 80,
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
          Demonstração de interface · páginas de leitura não são conteúdo oficial
        </div>
        ) : null}
        {" "}
        {v.vertical ? (
          <>
            {" "}
            <div
              ref={v.scrollRef}
              onScroll={v.onScroll}
              style={{
                position: "absolute",
                inset: "0",
                overflowY: "auto",
                overflowX: "auto",
                scrollbarWidth: "thin",
                scrollbarColor: "#3A342E transparent",
              }}
            >
              {" "}
              <div
                onClick={v.tapToggle}
                style={{
                  width: `${v.colW ?? ""}`,
                  maxWidth: `${v.colMax ?? ""}`,
                  margin: "0 auto",
                  display: "flex",
                  flexDirection: "column",
                  paddingTop: `${v.topPad ?? ""}`,
                }}
              >
                {asList(v.segs).map((g, $index) => (
                  <React.Fragment key={$index}>
                    <div
                      data-seg={g?.i}
                      style={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: `${g?.ratio ?? ""}`,
                        backgroundColor: "#1A1714",
                        backgroundImage: `${g?.bg ?? ""}`,
                        backgroundSize: `${g?.size ?? ""}`,
                        backgroundPosition: `${g?.pos ?? ""}`,
                      }}
                    >
                      {" "}
                      {g?.src ? (
                        <>
                          <img
                            src={g.src}
                            alt={g.alt}
                            loading={g.eager ? "eager" : "lazy"}
                            decoding="async"
                            draggable={false}
                            onLoad={g.onLoad}
                            onError={g.onError}
                            style={{
                              position: "absolute",
                              inset: "0",
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              display: g.failed ? "none" : "block",
                            }}
                          />
                          {g.failed ? (
                            <button
                              onClick={g.retry}
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                transform: "translate(-50%,-50%)",
                                padding: "10px 16px",
                                borderRadius: "999px",
                                border: "1px solid rgba(219,175,87,.6)",
                                background: "#1A1714",
                                color: "#DBAF57",
                                fontSize: "13px",
                                cursor: "pointer",
                                zIndex: 2,
                              }}
                            >
                              Página {g.position} não carregou · recarregar
                            </button>
                          ) : null}
                        </>
                      ) : null}{" "}
                      <span style={{ position: "absolute", inset: "0", background: `${g?.shade ?? ""}` }} />{" "}
                      <span
                        style={{
                          position: "absolute",
                          right: "8px",
                          bottom: "6px",
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "10px",
                          color: "rgba(240,238,233,.45)",
                        }}
                      >
                        {txt(g?.label)}
                      </span>{" "}
                    </div>
                  </React.Fragment>
                ))}
                <div
                  ref={v.endRef}
                  style={{
                    padding: "56px 24px 140px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: "16px",
                    background: "#0B0A09",
                  }}
                >
                  <span style={{ width: "12px", height: "12px", transform: "rotate(45deg)", background: "#DBAF57" }} />
                  <span
                    style={{
                      fontFamily: "'Cormorant Garamond',serif",
                      fontSize: "34px",
                      fontWeight: "500",
                      lineHeight: "1",
                    }}
                  >
                    {txt(v.endTitle)}
                  </span>
                  <span style={{ fontSize: "14px", color: "#B7B1A4", maxWidth: "360px" }}>{txt(v.endText)}</span>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "center",
                      gap: "10px",
                      marginTop: "6px",
                    }}
                  >
                    {v.hasNextCh ? (
                      <>
                        <button
                          className="nk-hover-1c8eb9m"
                          onClick={v.goNextCh}
                          style={{
                            all: "unset",
                            cursor: "pointer",
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
                          {txt(v.nextChLabel)}
                        </button>
                      </>
                    ) : null}
                    <a
                      href={v.workHref}
                      style={{
                        height: "46px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 20px",
                        borderRadius: "999px",
                        border: "1px solid rgba(240,238,233,.25)",
                        fontSize: "14px",
                        color: "#F0EEE9",
                      }}
                    >
                      Voltar à obra
                    </a>
                    <button
                      className="nk-hover-1e3fwvz"
                      onClick={v.showDiscussion}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "46px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 16px",
                        fontSize: "14px",
                        color: "#B7B1A4",
                      }}
                    >
                      Ver discussão do capítulo
                    </button>
                  </div>
                </div>
              </div>{" "}
            </div>{" "}
          </>
        ) : null}{" "}
        {v.paged ? (
          <>
            {" "}
            <div
              ref={v.pagedRef}
              style={{
                position: "absolute",
                inset: "0",
                overflow: "auto",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-start",
                padding: `${v.pagedPad ?? ""}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: `${v.spreadDir ?? ""}`,
                  gap: "0",
                  flexShrink: "0",
                  margin: "auto",
                }}
              >
                {asList(v.spread).map((g, $index) => (
                  <React.Fragment key={$index}>
                    <div
                      style={{
                        position: "relative",
                        height: `${v.pageH ?? ""}`,
                        aspectRatio: `${g?.aspect ?? "2/3"}`,
                        backgroundColor: "#1A1714",
                        backgroundImage: `${g?.bg ?? ""}`,
                        backgroundSize: "cover",
                        backgroundPosition: `${g?.pos ?? ""}`,
                        boxShadow: "0 10px 40px rgba(0,0,0,.4)",
                      }}
                    >
                      {" "}
                      {g?.src ? (
                        <>
                          <img
                            src={g.src}
                            alt={g.alt}
                            loading={g.eager ? "eager" : "lazy"}
                            decoding="async"
                            draggable={false}
                            onLoad={g.onLoad}
                            onError={g.onError}
                            style={{
                              position: "absolute",
                              inset: "0",
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              display: g.failed ? "none" : "block",
                            }}
                          />
                          {g.failed ? (
                            <button
                              onClick={g.retry}
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                transform: "translate(-50%,-50%)",
                                padding: "10px 16px",
                                borderRadius: "999px",
                                border: "1px solid rgba(219,175,87,.6)",
                                background: "#1A1714",
                                color: "#DBAF57",
                                fontSize: "13px",
                                cursor: "pointer",
                                zIndex: 2,
                              }}
                            >
                              Página {g.position} não carregou · recarregar
                            </button>
                          ) : null}
                        </>
                      ) : null}{" "}
                      <span style={{ position: "absolute", inset: "0", background: `${g?.shade ?? ""}` }} />{" "}
                      <span
                        style={{
                          position: "absolute",
                          right: "8px",
                          bottom: "6px",
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "10px",
                          color: "rgba(240,238,233,.5)",
                        }}
                      >
                        {txt(g?.label)}
                      </span>{" "}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>{" "}
            <button
              onClick={v.zoneLeft}
              aria-label={v.leftLabel}
              style={{
                all: "unset",
                position: "absolute",
                left: "0",
                top: "0",
                bottom: "0",
                width: "30%",
                cursor: `${v.zoneCursorL ?? ""}`,
              }}
            />{" "}
            <button
              onClick={v.tapToggle}
              aria-label="Mostrar controles"
              style={{
                all: "unset",
                position: "absolute",
                left: "30%",
                right: "30%",
                top: "0",
                bottom: "0",
                cursor: "default",
              }}
            />{" "}
            <button
              onClick={v.zoneRight}
              aria-label={v.rightLabel}
              style={{
                all: "unset",
                position: "absolute",
                right: "0",
                top: "0",
                bottom: "0",
                width: "30%",
                cursor: `${v.zoneCursorR ?? ""}`,
              }}
            />{" "}
            {v.pagedEnd ? (
              <>
                {" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(11,10,9,.92)",
                    padding: "24px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      gap: "16px",
                      maxWidth: "420px",
                    }}
                  >
                    <span
                      style={{ width: "12px", height: "12px", transform: "rotate(45deg)", background: "#DBAF57" }}
                    />
                    <span
                      style={{
                        fontFamily: "'Cormorant Garamond',serif",
                        fontSize: "34px",
                        fontWeight: "500",
                        lineHeight: "1",
                      }}
                    >
                      {txt(v.endTitle)}
                    </span>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>{txt(v.endText)}</span>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: "10px",
                        marginTop: "6px",
                      }}
                    >
                      {v.hasNextCh ? (
                        <>
                          <button
                            onClick={v.goNextCh}
                            style={{
                              all: "unset",
                              cursor: "pointer",
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
                            {txt(v.nextChLabel)}
                          </button>
                        </>
                      ) : null}
                      <a
                        href={v.workHref}
                        style={{
                          height: "46px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 20px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.25)",
                          fontSize: "14px",
                          color: "#F0EEE9",
                        }}
                      >
                        Voltar à obra
                      </a>
                      <button
                        onClick={v.backFromEnd}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "46px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 16px",
                          fontSize: "14px",
                          color: "#B7B1A4",
                        }}
                      >
                        Rever última página
                      </button>
                    </div>
                  </div>
                </div>{" "}
              </>
            ) : null}{" "}
          </>
        ) : null}{" "}
        {v.resumeAsk ? (
          <>
            {" "}
            <div
              style={{
                position: "absolute",
                inset: "0",
                zIndex: "30",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(11,10,9,.7)",
                padding: "24px",
              }}
            >
              <div
                style={{
                  width: "min(400px,100%)",
                  padding: "26px",
                  borderRadius: "16px",
                  background: "#1A1714",
                  border: "1px solid rgba(219,175,87,.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    letterSpacing: ".24em",
                    textTransform: "uppercase",
                    color: "#DBAF57",
                  }}
                >
                  {"Capítulo "}
                  {txt(v.ch)}
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
                <span style={{ fontSize: "14px", color: "#B7B1A4" }}>{txt(v.resumeText)}</span>
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
                    style={{ display: "block", height: "100%", width: `${v.resumePct ?? ""}`, background: "#DBAF57" }}
                  />
                </span>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={v.resumeYes}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      flex: "1",
                      height: "46px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "999px",
                      background: "#DBAF57",
                      color: "#1A1714",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    Continuar
                  </button>
                  <button
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
                    Do início
                  </button>
                </div>
              </div>
            </div>{" "}
          </>
        ) : null}{" "}
        <div
          style={{
            position: "absolute",
            left: "0",
            right: "0",
            top: "0",
            zIndex: "20",
            transform: `translateY(${v.topY ?? ""})`,
            transition: "transform .25s ease",
            background: "rgba(18,16,14,.94)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            borderBottom: "1px solid rgba(219,175,87,.12)",
            padding: "env(safe-area-inset-top) 0 0",
          }}
        >
          {" "}
          <div
            style={{
              height: "60px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "0 clamp(10px,2vw,20px)",
            }}
          >
            <a
              className="nk-hover-1m5yhr"
              href={v.workHref}
              aria-label="Voltar à obra"
              title="Voltar à obra"
              style={{
                width: "44px",
                height: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
                color: "#F0EEE9",
                flexShrink: "0",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </a>
            <div style={{ display: "flex", flexDirection: "column", minWidth: "0", flex: "0 1 auto" }}>
              <span
                style={{
                  fontSize: "12px",
                  color: "#B7B1A4",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {txt(v.workTitle)}
              </span>
              <button
                className="nk-hover-1d5grei"
                onClick={v.openPicker}
                data-nk-rmenu="1"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "15px",
                  fontWeight: "600",
                  whiteSpace: "nowrap",
                }}
              >
                {txt(v.chTitle)}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
            <span style={{ flex: "1" }} />
            <span
              style={{ fontSize: "12px", color: "#8F897D", whiteSpace: "nowrap", display: `${v.syncDisplay ?? ""}` }}
            >
              {txt(v.syncText)}
            </span>
            <button
              className="nk-hover-1owwya7"
              onClick={v.addBookmark}
              aria-label="Marcar esta posição"
              title="Marcar esta posição (B)"
              style={{
                all: "unset",
                cursor: "pointer",
                width: "44px",
                height: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
                color: `${v.bmColor ?? ""}`,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={v.bmFill} stroke="currentColor" strokeWidth="1.8">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              className="nk-hover-1owwya7"
              onClick={v.toggleSettings}
              data-nk-rmenu="1"
              aria-label="Preferências de leitura"
              title="Preferências de leitura"
              style={{
                all: "unset",
                cursor: "pointer",
                width: "44px",
                height: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
                color: `${v.setColor ?? ""}`,
              }}
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4" />
              </svg>
            </button>
            {v.wide ? (
              <>
                <button
                  className="nk-hover-1m5yhr"
                  onClick={v.toggleFs}
                  aria-label={v.fsLabel}
                  title={`${v.fsLabel ?? ""} (F)`}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    width: "44px",
                    height: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "10px",
                    color: "#F0EEE9",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  >
                    <path d={v.fsPath} />
                  </svg>
                </button>
              </>
            ) : null}
          </div>{" "}
        </div>{" "}
        {v.showProgressLine ? (
          <>
            {" "}
            <span
              style={{
                position: "absolute",
                left: "0",
                top: "0",
                zIndex: "19",
                height: "2px",
                width: `${v.pctW ?? ""}`,
                background: "#DBAF57",
                transition: "width .15s",
                pointerEvents: "none",
              }}
            />{" "}
          </>
        ) : null}{" "}
        <div
          style={{
            position: "absolute",
            left: "0",
            right: "0",
            bottom: "0",
            zIndex: "20",
            transform: `translateY(${v.botY ?? ""})`,
            transition: "transform .25s ease",
            background: "rgba(18,16,14,.94)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            borderTop: "1px solid rgba(219,175,87,.12)",
            padding: "0 0 env(safe-area-inset-bottom)",
          }}
        >
          {" "}
          <div
            style={{
              maxWidth: "980px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              gap: "clamp(6px,1.4vw,14px)",
              padding: "10px clamp(10px,2vw,20px)",
            }}
          >
            <button
              className="nk-hover-1owwya7"
              onClick={v.goPrevCh}
              aria-label="Capítulo anterior"
              title="Capítulo anterior"
              style={{
                all: "unset",
                cursor: `${v.prevCursor ?? ""}`,
                height: "44px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "0 12px",
                borderRadius: "10px",
                fontSize: "13px",
                color: "#F0EEE9",
                opacity: `${v.prevOpacity ?? ""}`,
                flexShrink: "0",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
              </svg>
              {v.wide ? (
                <>
                  <span>Anterior</span>
                </>
              ) : null}
            </button>
            <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
              <input
                type="range"
                min="0"
                max={v.sliderMax}
                value={val(v.sliderVal)}
                onChange={v.onSlider}
                aria-label="Posição no capítulo"
                style={{ width: "100%", direction: `${v.sliderDir ?? ""}` }}
              />
              <span style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#B7B1A4" }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{txt(v.posText)}</span>
                <span>{txt(v.modeText)}</span>
              </span>
            </div>
            <button
              className="nk-hover-ucdklh"
              onClick={v.openPicker}
              data-nk-rmenu="1"
              style={{
                all: "unset",
                cursor: "pointer",
                height: "44px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "0 14px",
                borderRadius: "10px",
                border: "1px solid rgba(219,175,87,.3)",
                fontSize: "13px",
                fontWeight: "500",
                color: "#F0EEE9",
                flexShrink: "0",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
              Capítulos
            </button>
            <button
              className="nk-hover-1owwya7"
              onClick={v.goNextCh}
              aria-label="Próximo capítulo"
              title="Próximo capítulo"
              style={{
                all: "unset",
                cursor: `${v.nextCursor ?? ""}`,
                height: "44px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "0 12px",
                borderRadius: "10px",
                fontSize: "13px",
                color: "#F0EEE9",
                opacity: `${v.nextOpacity ?? ""}`,
                flexShrink: "0",
              }}
            >
              {v.wide ? (
                <>
                  <span>Próximo</span>
                </>
              ) : null}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
              </svg>
            </button>
          </div>{" "}
        </div>{" "}
        {v.pickerOpen ? (
          <>
            {" "}
            <div
              onClick={v.closePanels}
              style={{ position: "absolute", inset: "0", zIndex: "40", background: "rgba(0,0,0,.45)" }}
            />{" "}
            <aside
              data-nk-rmenu="1"
              style={{
                zIndex: "41",
                background: "#141210",
                border: "1px solid rgba(219,175,87,.2)",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 20px 60px rgba(0,0,0,.6)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "18px 18px 10px",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: "26px",
                    fontWeight: "500",
                    lineHeight: "1",
                  }}
                >
                  Capítulos
                </span>
                <button
                  className="nk-hover-kqh291"
                  onClick={v.closePanels}
                  aria-label="Fechar"
                  style={{
                    all: "unset",
                    cursor: "pointer",
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
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  margin: "0 18px 12px",
                  padding: "4px",
                  borderRadius: "999px",
                  background: "#1A1714",
                  border: "1px solid rgba(240,238,233,.08)",
                }}
              >
                {asList(v.pickTabs).map((t, $index) => (
                  <React.Fragment key={$index}>
                    <button
                      onClick={t?.pick}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        flex: "1",
                        height: "34px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        borderRadius: "999px",
                        fontSize: "13px",
                        fontWeight: "500",
                        background: `${t?.bg ?? ""}`,
                        color: `${t?.color ?? ""}`,
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
              {v.pickChapters ? (
                <>
                  <div
                    style={{
                      margin: "0 18px 10px",
                      height: "42px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "0 14px",
                      borderRadius: "10px",
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
                      value={val(v.pickQ)}
                      onChange={v.onPickQ}
                      placeholder="Número do capítulo"
                      style={{
                        flex: "1",
                        minWidth: "0",
                        height: "100%",
                        background: "transparent",
                        border: "0",
                        outline: "none",
                        color: "#F0EEE9",
                        fontFamily: "Inter,sans-serif",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                  <div
                    ref={v.pickListRef}
                    style={{
                      flex: "1",
                      overflowY: "auto",
                      padding: "0 10px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    {asList(v.pickList).map((c, $index) => (
                      <React.Fragment key={$index}>
                        <button
                          className="nk-hover-zkly44"
                          data-pick={c?.n}
                          onClick={c?.go}
                          style={{
                            all: "unset",
                            cursor: `${c?.cursor ?? ""}`,
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "10px",
                            borderRadius: "10px",
                            background: `${c?.bg ?? ""}`,
                            border: `1px solid ${c?.border ?? ""}`,
                            opacity: `${c?.opacity ?? ""}`,
                          }}
                        >
                          <span
                            style={{
                              width: "40px",
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: "15px",
                              textAlign: "center",
                              color: `${c?.numColor ?? ""}`,
                            }}
                          >
                            {txt(c?.n)}
                          </span>
                          <span
                            style={{ display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0" }}
                          >
                            <span style={{ fontSize: "14px", fontWeight: "500" }}>{txt(c?.title)}</span>
                            <span style={{ fontSize: "12px", color: `${c?.stateColor ?? ""}` }}>{txt(c?.state)}</span>
                          </span>
                          {c?.done ? (
                            <>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#8F897D"
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
              {v.pickBookmarks ? (
                <>
                  <div
                    style={{
                      flex: "1",
                      overflowY: "auto",
                      padding: "0 10px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <span style={{ fontSize: "12px", lineHeight: "1.5", color: "#8F897D", padding: "0 8px 8px" }}>
                      Marcadores ficam separados do progresso automático: abrir um deles não muda onde você parou.
                    </span>
                    {asList(v.bookmarks).map((b, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "10px",
                            borderRadius: "10px",
                            background: "#1A1714",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="#DBAF57"
                            stroke="#DBAF57"
                            strokeWidth="1.8"
                            style={{ flexShrink: "0" }}
                          >
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                          <button
                            onClick={b?.go}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: "2px",
                              flex: "1",
                              minWidth: "0",
                            }}
                          >
                            <span style={{ fontSize: "14px", fontWeight: "500" }}>
                              {"Capítulo "}
                              {txt(b?.ch)}
                              {" · "}
                              {txt(b?.where)}
                            </span>
                            <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(b?.when)}</span>
                          </button>
                          <button
                            className="nk-hover-kqh291"
                            onClick={b?.remove}
                            aria-label="Remover marcador"
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              width: "30px",
                              height: "30px",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#8F897D",
                              fontSize: "18px",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </React.Fragment>
                    ))}
                    {v.noBookmarks ? (
                      <>
                        <span style={{ padding: "28px 12px", textAlign: "center", fontSize: "13px", color: "#B7B1A4" }}>
                          Nenhum marcador ainda. Use o ícone de marcador no topo para salvar uma passagem.
                        </span>
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </aside>{" "}
          </>
        ) : null}{" "}
        {v.setOpen ? (
          <>
            {" "}
            <div
              onClick={v.closePanels}
              style={{ position: "absolute", inset: "0", zIndex: "40", background: "rgba(0,0,0,.35)" }}
            />{" "}
            <aside
              data-nk-rmenu="1"
              style={{
                zIndex: "41",
                background: "#141210",
                border: "1px solid rgba(219,175,87,.2)",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 20px 60px rgba(0,0,0,.6)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "18px 18px 6px",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: "26px",
                    fontWeight: "500",
                    lineHeight: "1",
                  }}
                >
                  Preferências de leitura
                </span>
                <button
                  className="nk-hover-kqh291"
                  onClick={v.closePanels}
                  aria-label="Fechar"
                  style={{
                    all: "unset",
                    cursor: "pointer",
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
              </div>
              <div
                style={{
                  flex: "1",
                  overflowY: "auto",
                  padding: "8px 18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                }}
              >
                {v.editionNote ? (
                  <>
                    <span
                      style={{
                        fontSize: "12px",
                        lineHeight: "1.5",
                        color: "#D9D5CC",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: "#1A1714",
                        border: "1px solid rgba(219,175,87,.2)",
                      }}
                    >
                      Esta edição foi feita para rolagem vertical. No modo paginado, cada segmento vira uma página.
                    </span>
                  </>
                ) : null}
                {asList(v.prefGroups).map((g, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          letterSpacing: ".22em",
                          textTransform: "uppercase",
                          color: "#DBAF57",
                        }}
                      >
                        {txt(g?.label)}
                      </span>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${g?.cols ?? ""},minmax(0,1fr))`,
                          gap: "6px",
                        }}
                      >
                        {asList(g?.opts).map((o, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onClick={o?.pick}
                              title={o?.hint}
                              style={{
                                all: "unset",
                                cursor: `${o?.cursor ?? ""}`,
                                minHeight: "40px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "2px",
                                padding: "6px 8px",
                                borderRadius: "10px",
                                textAlign: "center",
                                border: `1px solid ${o?.border ?? ""}`,
                                background: `${o?.bg ?? ""}`,
                                color: `${o?.color ?? ""}`,
                                opacity: `${o?.opacity ?? ""}`,
                              }}
                            >
                              <span style={{ fontSize: "13px", fontWeight: "500" }}>{txt(o?.label)}</span>
                              {o?.hasSub ? (
                                <>
                                  <span style={{ fontSize: "11px", opacity: ".75" }}>{txt(o?.sub)}</span>
                                </>
                              ) : null}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      fontWeight: "600",
                      letterSpacing: ".22em",
                      textTransform: "uppercase",
                      color: "#DBAF57",
                    }}
                  >
                    Zoom
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0", color: "#F0EEE9" }}>
                      {txt(v.zoomText)}
                    </span>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      onClick={v.zoomOut}
                      aria-label="Diminuir zoom"
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        border: "1px solid rgba(240,238,233,.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "18px",
                      }}
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      step="10"
                      value={val(v.zoomVal)}
                      onChange={v.onZoom}
                      aria-label="Zoom"
                      style={{ flex: "1" }}
                    />
                    <button
                      onClick={v.zoomIn}
                      aria-label="Aumentar zoom"
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        border: "1px solid rgba(240,238,233,.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "18px",
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    borderTop: "1px solid rgba(240,238,233,.08)",
                    paddingTop: "6px",
                  }}
                >
                  {asList(v.prefToggles).map((r, $index) => (
                    <React.Fragment key={$index}>
                      <button
                        onClick={r?.toggle}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "14px",
                          padding: "12px 0",
                        }}
                      >
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "14px" }}>{txt(r?.label)}</span>
                          <span style={{ fontSize: "12px", color: "#8F897D" }}>{txt(r?.desc)}</span>
                        </span>
                        <span
                          style={{
                            width: "42px",
                            height: "24px",
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
                              width: "18px",
                              height: "18px",
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
                <span style={{ fontSize: "12px", lineHeight: "1.6", color: "#8F897D" }}>{txt(v.shortcutText)}</span>
              </div>
            </aside>{" "}
          </>
        ) : null}{" "}
        {v.toast ? (
          <>
            {" "}
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: "96px",
                transform: "translateX(-50%)",
                zIndex: "50",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                height: "44px",
                padding: "0 18px",
                borderRadius: "999px",
                background: "#2D2924",
                border: "1px solid rgba(219,175,87,.4)",
                fontSize: "13px",
                whiteSpace: "nowrap",
                boxShadow: "0 12px 30px rgba(0,0,0,.5)",
              }}
            >
              <span style={{ width: "7px", height: "7px", transform: "rotate(45deg)", background: "#DBAF57" }} />
              {txt(v.toastText)}
            </div>{" "}
          </>
        ) : null}
      </div>
    </>
  );
}

export const defaults = {};

/**
 * Leitor real (Protocolo 06): mesma interface do design, páginas de verdade.
 * - o manifesto vem do Java (lote publicado do capítulo + edição, na ordem editorial);
 * - cada página reserva a altura pelas dimensões antes de carregar (sem saltos);
 * - modo e direção padrão vêm da edição; página dupla isola a capa e páginas duplas;
 * - a posição salva é página (paginado) ou segmento + deslocamento (vertical), por edição;
 * - abrir o capítulo não conta como leitura: só a navegação real gera progresso.
 */
const PRELOAD_AHEAD = 3;

class RealLeitorLogic extends LeitorLogic {
  state = {
    ...this.state,
    d: null,
    man: null,
    ch: 0,
    loadState: "loading",
    failed: {},
    retry: {},
    syncStatus: null,
    serverProg: null,
    unitProg: {},
  };

  get chapterId() {
    return this.props.chapterId;
  }
  get editionId() {
    return this.props.editionId;
  }

  componentDidMount() {
    const prefs = this.load("nk-reader-prefs", {});
    this.prefs = prefs;
    this.allBm = this.load("nk-reader-bm", []);
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("fullscreenchange", this.onFs);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("pagehide", this.flushNow);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.onResize();
    this.idle = setInterval(() => {
      const s = this.state;
      if (s.ctrl && !s.panel && !s.resume && Date.now() - (this.lastMove || 0) > 3000 && this.started)
        this.setState({ ctrl: false });
    }, 500);
    this.boot();
  }

  componentWillUnmount() {
    this.flushNow();
    clearInterval(this.idle);
    clearTimeout(this.sv);
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("fullscreenchange", this.onFs);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("pagehide", this.flushNow);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }

  onVisibility = () => {
    if (document.visibilityState === "hidden") this.flushNow();
  };

  async boot() {
    let man;
    try {
      man = await mediaApi.manifest(this.chapterId, this.editionId);
    } catch (error) {
      let external = null;
      if (error?.status === 404) external = await api.get(`/api/v1/chapters/${this.chapterId}/source`).catch(() => null);
      this.setState({ loadState: error?.status === 404 ? "unavailable" : "error", external });
      return;
    }
    this.applyManifest(man);
    await session.load(); // o leitor não tem Header: a sessão é carregada aqui
    const index = man.chapters.findIndex((c) => c.id === this.chapterId);
    const prefs = this.prefs || {};
    // Modo e direção da edição; o leitor só muda se a pessoa escolher outro aqui.
    const editionMode = man.readingMode === "VERTICAL" ? "vertical" : "single";
    this.setState({
      ...prefs,
      mode: prefs.modeFor === man.editionId && prefs.mode ? prefs.mode : editionMode,
      dir: prefs.modeFor === man.editionId && prefs.dir ? prefs.dir : "auto",
      man,
      ch: index,
      loadState: "ready",
      bm: this.allBm.filter((b) => b.chapterId && man.chapters.some((c) => c.id === b.chapterId)),
    });
    document.title = `${man.work.title} · Capítulo ${man.chapter.number} — NekoFlow`;
    track("chapter_open", { work: man.work.legacyId ?? man.work.id, chapterId: this.chapterId });

    if (session.loggedIn) {
      this.loadUnits();
      this.sync = progressApi.sync("chapter", this.chapterId, this.editionId, (st) =>
        this.setState({ syncStatus: st.status, savedAt: st.status === "saved" ? Date.now() : this.state.savedAt }),
      );
      try {
        const server = await this.sync.load();
        await this.sync.flush();
        const pos = this.fromServer(server);
        this.setState({ serverProg: server });
        if (pos && !server.completed && pos.pct > 0.03) {
          this.setState({ resume: true, resumePos: pos });
          return;
        }
      } catch {
        /* sem progresso: começa do início */
      }
    }
    this.started = true;
  }

  applyManifest(man) {
    this.SEGS = man.pages.length;
    this.LAST = man.chapters.length - 1;
    this.expiresAt = Date.parse(man.expiresAt) || 0;
  }

  loadUnits() {
    const man = this.state.man;
    if (!man) return;
    progressApi
      .workUnits(man.work.id)
      .then((p) => {
        const unitProg = {};
        for (const u of p.chapters || []) unitProg[`${u.chapterId}:${u.editionId}`] = u;
        this.setState({ unitProg });
      })
      .catch(() => {});
  }

  /** Converte o registro do servidor em página/segmento deste manifesto. */
  fromServer(server) {
    const man = this.state.man;
    if (!server || !man) return null;
    let seg = server.pageIndex != null ? server.pageIndex : 0;
    if (server.segmentKey) {
      const i = man.pages.findIndex((p) => p.id === server.segmentKey);
      if (i >= 0) seg = i;
    }
    seg = Math.max(0, Math.min(man.pages.length - 1, seg));
    return {
      seg,
      page: seg,
      off: server.segmentOffset != null ? Number(server.segmentOffset) : 0,
      pct: Number(server.percentComplete || 0) / 100,
      at: server.lastActivityAt ? Date.parse(server.lastActivityAt) : null,
    };
  }

  rtl() {
    const s = this.state;
    if (s.dir === "rtl") return true;
    if (s.dir === "ltr") return false;
    return !!(s.man && s.man.direction === "RTL");
  }

  isWide(i) {
    const p = this.state.man && this.state.man.pages[i];
    return !!p && (p.type === "DOUBLE" || p.width > p.height);
  }

  /** Páginas mostradas juntas no modo duplo: capa sozinha, páginas duplas sozinhas. */
  spreadAt(i) {
    const s = this.state;
    if (s.mode !== "double") return [i];
    if (i === 0 || this.isWide(i)) return [i];
    if (i + 1 < this.SEGS && !this.isWide(i + 1)) return [i, i + 1];
    return [i];
  }

  fwd() {
    const s = this.state;
    if (!s.man || s.resume) return;
    const next = s.page + this.spreadAt(s.page).length;
    if (next > this.SEGS - 1) {
      this.setState({ pagedEnd: true });
      this.complete();
      return;
    }
    this.setPage(next);
  }

  back() {
    const s = this.state;
    if (!s.man || s.resume) return;
    if (s.pagedEnd) {
      this.setState({ pagedEnd: false });
      return;
    }
    let p = Math.max(0, s.page - 1);
    if (s.mode === "double" && p > 0 && !this.isWide(p) && !this.isWide(p - 1) && this.spreadAt(p - 1).length === 2)
      p -= 1;
    this.setPage(p);
  }

  setPage(p) {
    this.setState({ page: p, seg: p, off: 0, pct: this.SEGS > 1 ? p / (this.SEGS - 1) : 1, pagedEnd: false });
    this.started = true;
    this.queueSave();
    this.preload(p);
  }

  preload(p) {
    const man = this.state.man;
    if (!man) return;
    for (let i = p - 1; i <= p + PRELOAD_AHEAD + 1; i++) {
      const page = man.pages[i];
      if (page && !this.preloaded?.has(i)) {
        (this.preloaded ||= new Set()).add(i);
        const img = new Image();
        img.decoding = "async";
        img.src = page.url;
      }
    }
  }

  setMode(m) {
    const s = this.state;
    if (m === s.mode) return;
    if (m === "double" && !s.wide) return;
    // Preserva a página atual (não a porcentagem): as páginas têm alturas diferentes.
    const cur = s.mode === "vertical" ? s.seg : s.page;
    this.savePrefs({ mode: m, pagedEnd: false });
    if (m === "vertical") this.restore({ seg: cur, off: s.mode === "vertical" ? s.off : 0 });
    else this.setState({ page: cur, seg: cur });
  }

  restore(p) {
    if (this.state.mode === "vertical") {
      setTimeout(() => {
        const box = this.scrollRef.current;
        if (!box) return;
        const el = box.querySelector(`[data-seg="${p.seg || 0}"]`);
        if (el) box.scrollTop = el.offsetTop + (p.off || 0) * el.offsetHeight - 70;
        this.started = true;
        this.onScroll();
      }, 40);
    } else {
      const page = Math.max(0, Math.min(this.SEGS - 1, p.page ?? p.seg ?? 0));
      this.setState({ page, seg: page });
      this.preload(page);
      this.started = true;
    }
  }

  queueSave() {
    clearTimeout(this.sv);
    this.sv = setTimeout(this.flushNow, 1500);
  }

  flush = () => this.flushNow();

  /** Envia a posição real ao Protocolo 05 (página/segmento estável + edição). */
  flushNow = (completed = false) => {
    const s = this.state;
    if (!this.sync || !this.started || !s.man) return;
    const vertical = s.mode === "vertical";
    const idx = vertical ? s.seg : s.page;
    const page = s.man.pages[idx];
    const key = `${idx}:${Math.round((vertical ? s.off : 0) * 100)}:${completed}`;
    if (key === this.lastSent) return;
    this.lastSent = key;
    const pct = completed === true ? 1 : Math.min(vertical ? s.pct : this.SEGS > 1 ? s.page / (this.SEGS - 1) : 1, 0.999);
    this.sync
      .report(
        {
          pageIndex: idx,
          segmentKey: vertical && page ? page.id : null,
          segmentOffset: vertical ? Math.round(Math.min(1, Math.max(0, s.off)) * 1e6) / 1e6 : null,
          percentComplete: Math.round(pct * 1000) / 10,
          completed: completed === true,
        },
        { live: true },
      )
      .then((server) => {
        if (completed === true && server && server.completed) {
          window.dispatchEvent(new Event("nk:personal"));
          this.loadUnits();
        }
      })
      .catch(() => {});
  };

  complete() {
    const s = this.state;
    const cur = s.unitProg[`${this.chapterId}:${this.editionId}`];
    if (this.sentComplete) return;
    this.sentComplete = true;
    clearTimeout(this.sv);
    this.flushNow(true);
    if (!cur || !cur.completed) this.flash(`Capítulo ${s.man.chapter.number} lido`);
    const next = s.man.next;
    if (s.autoNext && next && next.readable) setTimeout(() => this.goChapter(next.id), 1200);
  }

  enter(ch) {
    this.goCh(ch);
  }

  /** Preferências do aparelho; modo e direção valem só para a edição em que foram escolhidos. */
  savePrefs(patch) {
    this.setState(patch, () => {
      const s = this.state;
      this.store("nk-reader-prefs", {
        mode: s.mode,
        dir: s.dir,
        modeFor: s.man ? s.man.editionId : null,
        fit: s.fit,
        zoom: s.zoom,
        theme: s.theme,
        offerNext: s.offerNext,
        showPct: s.showPct,
        autoNext: s.autoNext,
      });
    });
  }

  goChapter(id) {
    this.flushNow();
    location.href = `/leitor?chapter=${id}&edition=${this.editionId}`;
  }

  goCh(n) {
    const c = this.state.man && this.state.man.chapters[n];
    if (!c || c.id === this.chapterId) return;
    if (!c.available) {
      this.flash("Este capítulo ainda não está disponível");
      return;
    }
    this.goChapter(c.id);
  }

  addBookmark = () => {
    const s = this.state;
    if (!s.man) return;
    const where = s.mode === "vertical" ? `${Math.round(s.pct * 100)}%` : `página ${s.page + 1}`;
    const entry = {
      id: Date.now(),
      chapterId: this.chapterId,
      editionId: this.editionId,
      ch: s.ch,
      seg: s.seg,
      off: s.off,
      page: s.page,
      pct: s.pct,
      where: `Cap. ${s.man.chapter.number} · ${where}`,
      at: Date.now(),
    };
    this.allBm = [entry, ...this.allBm];
    this.store("nk-reader-bm", this.allBm);
    this.setState({ bm: [entry, ...s.bm] });
    this.flash(`Marcador salvo · capítulo ${s.man.chapter.number}, ${where}`);
  };

  async retryPage(i) {
    // URLs assinadas expiram: renova o manifesto antes de tentar de novo.
    if (this.expiresAt && Date.now() > this.expiresAt - 60_000) {
      try {
        const man = await mediaApi.manifest(this.chapterId, this.editionId);
        this.applyManifest(man);
        this.setState({ man });
      } catch {
        /* mantém o manifesto atual */
      }
    }
    const failed = { ...this.state.failed };
    delete failed[i];
    this.setState({ failed, retry: { ...this.state.retry, [i]: (this.state.retry[i] || 0) + 1 } });
  }

  renderVals() {
    const base = super.renderVals();
    const s = this.state;
    const man = s.man;
    if (!man) {
      return {
        ...base,
        demoBanner: false,
        segs: [],
        spread: [],
        workTitle: "",
        workHref: "/leituras",
        chTitle: s.loadState === "loading" ? "Carregando capítulo…" : "Capítulo indisponível",
        pagedEnd: s.loadState !== "loading",
        endTitle: s.loadState === "unavailable" ? "Este capítulo ainda não tem páginas no NekoFlow" : "Não foi possível abrir o capítulo",
        endText:
          s.loadState === "unavailable"
            ? s.external && s.external.source_url
              ? "A leitura deste capítulo acontece no site do provedor autorizado."
              : "Assim que as páginas forem publicadas, ele aparece aqui."
            : "Verifique sua conexão e tente novamente.",
        hasNextCh: !!(s.external && s.external.source_url),
        nextChLabel: "Ler no provedor ↗",
        goNextCh: () => s.external && window.open(s.external.source_url, "_blank", "noopener,noreferrer"),
        resumeAsk: false,
        syncText: "",
      };
    }
    const vertical = s.mode === "vertical";
    const rtl = this.rtl();
    const zoom = s.zoom / 100;
    const pageVal = (p, i) => {
      const n = s.retry[i] || 0;
      const src = n ? `${p.url}${p.url.includes("?") ? "&" : "?"}r=${n}` : p.url;
      return {
        i,
        ratio: `${p.width}/${p.height}`,
        aspect: `${p.width}/${p.height}`,
        bg: "none",
        size: "contain",
        pos: "center",
        shade: "none",
        label: "",
        src,
        alt: `Página ${p.position} de ${man.pages.length}`,
        position: p.position,
        eager: vertical ? i < 3 : true,
        failed: !!s.failed[i],
        onLoad: () => s.failed[i] && this.setState({ failed: { ...this.state.failed, [i]: false } }),
        onError: () => this.setState({ failed: { ...this.state.failed, [i]: true } }),
        retry: () => this.retryPage(i),
      };
    };
    const segs = man.pages.map(pageVal);
    const spreadIdx = this.spreadAt(Math.min(s.page, man.pages.length - 1));
    const spread = spreadIdx.map((i) => segs[i]);
    const landscape = spreadIdx.some((i) => this.isWide(i));
    const pageH = landscape
      ? `calc(min(100vh - 40px, (100vw - 40px) * ${
          man.pages[spreadIdx[0]].height / man.pages[spreadIdx[0]].width
        }) * ${zoom})`
      : base.pageH;
    const chName = (c) => `Capítulo ${c.number}`;
    const prog = s.unitProg;
    const next = man.next;
    const prev = man.previous;
    const curP = s.resumePos || {};
    const sinceSaved = s.savedAt ? Math.round((Date.now() - s.savedAt) / 1000) : null;
    const loggedIn = session.loggedIn;
    const pq = String(s.pickQ || "").trim();
    const pickList = man.chapters
      .map((c, n) => ({ c, n }))
      .reverse()
      .filter(({ c }) => !pq || String(c.number).startsWith(pq))
      .map(({ c, n }) => {
        const cur = c.id === this.chapterId;
        const p = prog[`${c.id}:${man.editionId}`];
        const done = !!(p && p.completed);
        return {
          n,
          title: c.title && c.title !== chName(c) ? `${chName(c)} · ${c.title}` : chName(c),
          done: done && !cur,
          go: () => this.goCh(n),
          cursor: c.available ? "pointer" : "not-allowed",
          state: cur
            ? "Lendo agora"
            : !c.available
              ? "Ainda indisponível"
              : !c.readable
                ? "Abre no provedor"
                : done
                  ? "Concluído"
                  : p && Number(p.percentComplete) > 3
                    ? `Parou em ${Math.round(Number(p.percentComplete))}%`
                    : "Disponível",
          stateColor: cur ? "#DBAF57" : "#B7B1A4",
          numColor: cur ? "#DBAF57" : done ? "#8F897D" : "#F0EEE9",
          bg: cur ? "rgba(219,175,87,.1)" : "transparent",
          border: cur ? "rgba(219,175,87,.45)" : "transparent",
          opacity: c.available ? 1 : 0.5,
        };
      });
    return {
      ...base,
      demoBanner: false,
      workTitle: man.work.title,
      workHref: man.work.href,
      segs,
      spread,
      pageH,
      chTitle: chName(man.chapter),
      endTitle: next ? "Capítulo concluído" : "Você chegou ao último capítulo disponível",
      endText: next
        ? s.offerNext
          ? `Você terminou o ${chName(man.chapter).toLowerCase()}. A seguir: ${chName(next).toLowerCase()}.`
          : `Você terminou o ${chName(man.chapter).toLowerCase()}.`
        : "Novos capítulos aparecem aqui assim que forem publicados.",
      hasNextCh: !!next && s.offerNext,
      nextChLabel: next ? `Ler ${chName(next).toLowerCase()}${next.readable ? "" : " no provedor"}` : "",
      goNextCh: () => next && this.goChapter(next.id),
      goPrevCh: () => prev && this.goChapter(prev.id),
      prevCursor: prev ? "pointer" : "not-allowed",
      prevOpacity: prev ? 1 : 0.4,
      nextCursor: next ? "pointer" : "not-allowed",
      nextOpacity: next ? 1 : 0.4,
      resumePct: `${Math.round((curP.pct || 0) * 100)}%`,
      resumeText: `Você parou na página ${(curP.seg || 0) + 1} deste capítulo${
        curP.at ? `, ${this.ago(curP.at)}` : ""
      }. A posição é a mesma em todos os seus dispositivos.`,
      resumeYes: () => {
        this.setState({ resume: false });
        this.restore(curP);
      },
      resumeNo: () => {
        this.setState({ resume: false });
        this.started = true;
      },
      syncText: !loggedIn
        ? "Entre para salvar"
        : {
            saving: "Salvando…",
            pending: "Sem conexão · pendente",
            "auth-required": "Entre para salvar",
            conflict: "Atualizado em outro aparelho",
            error: "Não foi possível salvar",
          }[s.syncStatus] ||
          (s.savedAt ? (sinceSaved < 5 ? "Progresso salvo" : `Salvo há ${sinceSaved} s`) : "Sincronizado"),
      posText: vertical
        ? `${Math.round(s.pct * 100)}% · página ${s.seg + 1} de ${this.SEGS}`
        : spreadIdx.length === 2
          ? `Páginas ${s.page + 1}–${s.page + 2} de ${this.SEGS}`
          : `Página ${s.page + 1} de ${this.SEGS}`,
      modeText: vertical
        ? "Rolagem vertical"
        : `${s.mode === "double" ? "Página dupla" : "Página única"} · ${rtl ? "dir. → esq." : "esq. → dir."}`,
      pickList,
      editionNote: man.readingMode === "VERTICAL" && !vertical,
      showDiscussion: () => this.flash("A discussão do capítulo chega com o protocolo de Comunidade"),
    };
  }
}

const RealLeitor = defineDC("Leitor", RealLeitorLogic, render, { helmet });
const LegacyLeitor = defineDC("Leitor", LeitorLogic, render, { helmet });

export default function Leitor(props) {
  const q = new URLSearchParams(location.search);
  const chapterId = q.get("chapter");
  const editionId = q.get("edition");
  return chapterId && editionId ? (
    <RealLeitor key={chapterId + editionId} chapterId={chapterId} editionId={editionId} {...props} />
  ) : (
    <LegacyLeitor {...props} />
  );
}
