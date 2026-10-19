// Origem: design/claude-design/Header.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css, val } from "../dc/runtime";
import { api } from "../lib/api";
import { session } from "../lib/session";
import { getWorkUrl } from "../features/catalog/workNavigation";
import { libraryApi } from "../features/library/libraryApi";

class HeaderLogic extends DCLogic {
  state = {
    scrolled: false,
    menu: false,
    userOpen: false,
    notifOpen: false,
    ntab: "todas",
    notifs: [],
    read: [],
    guest: false,
    sel: -1,
  };
  saveRead(read) {
    const prev = new Set(this.state.read);
    if (read.length && read.length === this.state.notifs.length)
      api.post("/api/me/notifications/read-all").catch(() => {});
    else
      read.filter((id) => !prev.has(id)).forEach((id) => api.post(`/api/me/notifications/${id}/read`).catch(() => {}));
    this.setState({ read });
  }
  loadPersonal() {
    if (!session.loggedIn) return;
    api
      .get("/api/me/notifications")
      .then((notifs) => this.setState({ notifs }))
      .catch(() => {});
    libraryApi
      .summary()
      .then((libCounts) => this.setState({ libCounts }))
      .catch(() => {});
  }
  closeMenus() {
    if (this.state.userOpen || this.state.notifOpen) this.setState({ userOpen: false, notifOpen: false });
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
    if (s !== this.state.scrolled) this.setState({ scrolled: s });
  };
  boxRef = React.createRef();
  inputRef = React.createRef();
  norm = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  loadCatalog() {
    if (this.catalogLoading) return;
    this.catalogLoading = true;
    api.get("/api/catalog/all")
      .then((items) => {
        this.catalog = items.map((x) => ({ ...x, _t: this.norm(x.title), _a: this.norm(x.alt) }));
        this.forceUpdate();
      });
  }
  onDocDown = (e) => {
    if (this.boxRef.current && !this.boxRef.current.contains(e.target) && this.state.open)
      this.setState({ open: false });
    if (!(e.target.closest && e.target.closest("[data-nk-menu]"))) this.closeMenus();
  };
  onDocKey = (e) => {
    if (e.key === "Escape") this.closeMenus();
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      this.inputRef.current && this.inputRef.current.focus();
    }
  };
  search(q) {
    const nq = this.norm(q);
    if (!nq || !this.catalog) return [];
    const out = [];
    for (const x of this.catalog) {
      let s = 0;
      if (x._t.startsWith(nq)) s = 100;
      else if ((" " + x._t).includes(" " + nq)) s = 70;
      else if (x._a.split(" | ").some((a) => this.norm(a).startsWith(nq))) s = 55;
      else if ((" " + x._a).includes(" " + nq)) s = 40;
      else if (x._t.includes(nq)) s = 25;
      if (s) out.push({ x, s: s + Math.log10(x.pop || 1) });
    }
    return out.sort((a, b) => b.s - a.s).map((o) => o.x);
  }
  hl(title, q) {
    const nq = this.norm(q);
    const nt = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    let i = nt.startsWith(nq) ? 0 : nt.indexOf(" " + nq);
    if (i > 0) i += 1;
    if (i < 0) i = nt.indexOf(nq);
    if (!nq || i < 0) return { pre: title, mid: "", post: "" };
    return { pre: title.slice(0, i), mid: title.slice(i, i + nq.length), post: title.slice(i + nq.length) };
  }
  componentDidMount() {
    this.setState({ read: [], guest: !session.loggedIn });
    this.loadPersonal();
    // Outras telas avisam quando algo pessoal muda (biblioteca, avisos lidos).
    this.onPersonal = () => this.loadPersonal();
    window.addEventListener("nk:personal", this.onPersonal);
    document.addEventListener("mousedown", this.onDocDown);
    document.addEventListener("keydown", this.onDocKey);
    document.addEventListener("scroll", this.onScroll, { passive: true, capture: true });
    this.poll = setInterval(() => this.onScroll(), 250);
    this.onScroll();
  }
  componentWillUnmount() {
    document.removeEventListener("scroll", this.onScroll, { capture: true });
    document.removeEventListener("mousedown", this.onDocDown);
    document.removeEventListener("keydown", this.onDocKey);
    clearInterval(this.poll);
    window.removeEventListener("nk:personal", this.onPersonal);
  }
  renderVals() {
    const active = this.props.active ?? "inicio";
    const loggedIn = (this.props.loggedIn ?? true) && !this.state.guest;
    const readSet = new Set(this.state.read);
    const isRead = (n) => n.read || readSet.has(n.id);
    const unread = this.state.notifs.filter((n) => !isRead(n)).length;
    const ntab = this.state.ntab;
    const NT = [
      ["todas", "Todas"],
      ["lanc", "Lançamentos"],
      ["com", "Comunidade"],
      ["sis", "Sistema"],
    ];
    const ICON = {
      chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
      req: "M12 8v8M8 12h8M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
      shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    };
    const notifList = this.state.notifs
      .filter((n) => ntab === "todas" || n.cat === ntab)
      .map((n) => {
        const r = isRead(n);
        return {
          ...n,
          hasCover: !!n.cover,
          hasIcon: !n.cover,
          iconPath: ICON[n.icon] || ICON.req,
          weight: r ? 400 : 600,
          bg: r ? "transparent" : "rgba(219,175,87,.06)",
          dot: r ? "transparent" : "#DBAF57",
          open: (e) => {
            if (n.href === "#") e.preventDefault();
            if (!r) this.saveRead([...this.state.read, n.id]);
          },
        };
      });
    const lc = this.state.libCounts || {};
    const I = {
      list: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
      play: "M7 4l13 8-13 8z",
      book: "M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z",
      clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
      req: ICON.req,
      gear: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
    };
    const userGroups = [
      {
        label: "Minha biblioteca",
        items: [
          { label: "Minha lista", icon: I.list, href: "/biblioteca", count: lc.lista },
          { label: "Continuar assistindo", icon: I.play, href: "/continuar-assistindo", count: lc.assistindo },
          { label: "Continuar lendo", icon: I.book, href: "/continuar-lendo", count: lc.lendo },
          { label: "Histórico", icon: I.clock, href: "/historico" },
        ],
      },
      {
        label: "Conta e plataforma",
        items: [
          { label: "Solicitar obra", icon: I.req, href: "/solicitacoes" },
          { label: "Configurações", icon: I.gear, href: "/configuracoes" },
          ...(session.user.staff
            ? [{ label: "Painel administrativo", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", href: "/admin" }]
            : []),
        ],
      },
    ].map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, hasCount: i.count != null && i.count > 0 })) }));
    const sc = this.state.scrolled || (this.props.solid ?? false);
    const defs = [
      ["inicio", "Início", "/"],
      ["animes", "Animes", "/animes"],
      ["leituras", "Leituras", "/leituras"],
      ["explorar", "Explorar", "/explorar"],
      ["calendario", "Calendário", "/calendario"],
    ];
    const q = this.state.q || "";
    const open = !!this.state.open;
    const hasQ = q.trim().length > 0;
    const kindLabel = (x) =>
      x.kind === "anime" ? "Anime" : x.kind === "filme" ? "Filme" : x.kind === "manga" ? "Mangá" : "Manhwa";
    const metaOf = (x) =>
      [
        kindLabel(x) + (x.webtoon ? " · Webtoon" : ""),
        x.year,
        x.kind === "anime" && x.eps ? `${x.eps} eps` : x.kind === "filme" ? x.studio : x.ch ? `${x.ch} caps` : x.status,
      ]
        .filter(Boolean)
        .join(" · ");
    const hrefOf = (x) => getWorkUrl(x) || `/explorar?q=${encodeURIComponent(x.title)}`;
    let found = [],
      trending = false;
    if (open && this.catalog) {
      if (hasQ) found = this.search(q);
      else {
        found = [...this.catalog].sort((a, b) => b.pop - a.pop).slice(0, 5);
        trending = true;
      }
    }
    const sel = this.state.sel ?? -1;
    const topX = hasQ && found[0] ? found[0] : null;
    const restX = hasQ ? found.slice(1) : found;
    const anim = restX.filter((x) => x.kind === "anime" || x.kind === "filme").slice(0, 4);
    const read = restX.filter((x) => x.kind === "manga" || x.kind === "manhwa").slice(0, 4);
    const flat = [topX, ...(trending ? found : [...anim, ...read])].filter(Boolean);
    this.flat = flat;
    const rowOf = (x) => {
      const idx = flat.indexOf(x);
      return {
        ...x,
        ...this.hl(x.title, hasQ ? q : ""),
        meta: metaOf(x),
        typeLabel: kindLabel(x),
        href: hrefOf(x),
        bg: idx === sel ? "#221F1B" : "transparent",
        hover: () => this.setState({ sel: idx }),
      };
    };
    const groups = trending
      ? [{ label: "Em alta agora", rows: found.map(rowOf) }]
      : [
          anim.length ? { label: "Animes e filmes", rows: anim.map(rowOf) } : null,
          read.length ? { label: "Leituras", rows: read.map(rowOf) } : null,
        ].filter(Boolean);
    const allHref = `/explorar?q=${encodeURIComponent(q.trim())}`;
    return {
      boxRef: this.boxRef,
      inputRef: this.inputRef,
      q,
      hasQ,
      open,
      showSlash: !hasQ && !open,
      searchBorder: open ? "rgba(219,175,87,.6)" : "rgba(240,238,233,.14)",
      searchBg: open ? "#1A1714" : "rgba(23,20,17,.55)",
      searchIcon: open ? "#DBAF57" : "#B7B1A4",
      onFocus: () => {
        this.loadCatalog();
        this.setState({ open: true, userOpen: false });
      },
      onQ: (e) => this.setState({ q: e.target.value, open: true, sel: -1 }),
      clearQ: () => {
        this.setState({ q: "", sel: -1 });
        this.inputRef.current && this.inputRef.current.focus();
      },
      onKey: (e) => {
        const n = (this.flat || []).length;
        if (e.key === "Escape") {
          this.setState({ open: false });
          e.target.blur();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          this.setState({ sel: Math.min(n - 1, sel + 1) });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.setState({ sel: Math.max(0, sel - 1) });
        } else if (e.key === "Enter") {
          const x = sel >= 0 ? (this.flat || [])[sel] : null;
          location.href = x ? hrefOf(x) : allHref;
        }
      },
      hasTop: !!topX,
      top: topX
        ? { ...rowOf(topX), img: topX.banner || topX.cover, border: sel === 0 ? "#DBAF57" : "rgba(219,175,87,.25)" }
        : {},
      groups,
      noResults: open && hasQ && !!this.catalog && found.length === 0,
      allHref,
      loggedIn,
      guest: !loggedIn,
      navH: sc ? "64px" : "76px",
      navBg: sc ? "rgba(23,20,17,.92)" : "linear-gradient(180deg,rgba(15,13,11,.7),rgba(15,13,11,0))",
      navBorder: sc ? "rgba(219,175,87,.12)" : "transparent",
      navBlur: sc ? "blur(14px)" : "none",
      links: defs.map(([k, label, href]) => ({
        label,
        href,
        color: k === active ? "#DBAF57" : "#F0EEE9",
        line: k === active ? "#DBAF57" : "transparent",
        hasMenu: k === "leituras",
        menuOpen: k === "leituras" && this.state.menu,
        enter: k === "leituras" ? () => this.setState({ menu: true }) : undefined,
        leave: k === "leituras" ? () => this.setState({ menu: false }) : undefined,
      })),
      userOpen: this.state.userOpen,
      notifOpen: this.state.notifOpen,
      toggleUser: () => this.setState((s) => ({ userOpen: !s.userOpen, notifOpen: false, open: false })),
      toggleNotif: () => this.setState((s) => ({ notifOpen: !s.notifOpen, userOpen: false, open: false })),
      avatarBorder: this.state.userOpen ? "#DBAF57" : "rgba(219,175,87,.45)",
      bellColor: this.state.notifOpen ? "#DBAF57" : "#F0EEE9",
      bellBg: this.state.notifOpen ? "rgba(240,238,233,.06)" : "transparent",
      hasUnread: unread > 0,
      unreadLabel: unread > 9 ? "9+" : String(unread),
      unreadText: unread ? `${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Tudo em dia",
      markAll: () => this.saveRead(this.state.notifs.map((n) => n.id)),
      notifTabs: NT.map(([k, label]) => ({
        label,
        pick: () => this.setState({ ntab: k }),
        bg: k === ntab ? "#DBAF57" : "transparent",
        color: k === ntab ? "#1A1714" : "#B7B1A4",
      })),
      notifList,
      notifEmpty: notifList.length === 0,
      userGroups,
      // Sair: encerra a sessão, limpa os dados pessoais deste dispositivo e recarrega a
      // página como visitante (páginas privadas mandam para o login).
      logout: () => {
        this.setState({ userOpen: false });
        session.logout().then(() => location.reload());
      },
      userInitial: session.user.initial || "M",
      userName: session.user.name || "",
      requestHref: `/solicitacoes?titulo=${encodeURIComponent(q.trim())}`,
    };
  }
}

const helmet = [];

function render(v) {
  return (
    <>
      <div
        className="nk-hdr"
        style={{
          position: "fixed",
          left: "0",
          right: "0",
          top: "0",
          height: `${v.navH ?? ""}`,
          display: "flex",
          alignItems: "center",
          gap: "clamp(10px,1.6vw,24px)",
          padding: "0 clamp(16px,3.3vw,48px)",
          zIndex: "50",
          background: `${v.navBg ?? ""}`,
          borderBottom: `1px solid ${v.navBorder ?? ""}`,
          backdropFilter: `${v.navBlur ?? ""}`,
          WebkitBackdropFilter: `${v.navBlur ?? ""}`,
          transition: "height .25s ease,background .25s ease,border-color .25s ease",
          fontFamily: "Inter,system-ui,sans-serif",
          color: "#F0EEE9",
        }}
      >
        <a
          href="/"
          className="nk-hdr-logo"
          style={{ width: "150px", height: "56px", overflow: "hidden", flexShrink: "0", display: "block" }}
        >
          <img src="/assets/nekoflow-logo.png" alt="Nekoflow" style={{ height: "110px", margin: "-27px 0 0 -32px" }} />
        </a>
        <nav className="nk-hdr-nav" style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          {asList(v.links).map((l, $index) => (
            <React.Fragment key={$index}>
              <div style={{ position: "relative" }} onMouseEnter={l?.enter} onMouseLeave={l?.leave}>
                {" "}
                <a
                  className="nk-hover-1d5grei"
                  href={l?.href}
                  style={{
                    padding: "8px 12px",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: `${l?.color ?? ""}`,
                    borderBottom: `1px solid ${l?.line ?? ""}`,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {txt(l?.label)}
                  {l?.hasMenu ? (
                    <>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </>
                  ) : null}
                </a>{" "}
                {l?.menuOpen ? (
                  <>
                    {" "}
                    <div style={{ position: "absolute", left: "0", top: "100%", paddingTop: "10px" }}>
                      {" "}
                      <div
                        style={{
                          width: "250px",
                          background: "#1A1714",
                          border: "1px solid rgba(219,175,87,.18)",
                          borderRadius: "12px",
                          padding: "8px",
                          display: "flex",
                          flexDirection: "column",
                          boxShadow: "0 20px 40px rgba(0,0,0,.45)",
                        }}
                      >
                        <a
                          className="nk-hover-jshwrk"
                          href="/leituras?tipo=mangas"
                          style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            color: "#F0EEE9",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>Mangás</span>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>Japoneses · leitura por páginas</span>
                        </a>
                        <a
                          className="nk-hover-jshwrk"
                          href="/leituras?tipo=manhwas"
                          style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            color: "#F0EEE9",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>Manhwas</span>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                            Coreanos · regressão, murim, dungeons
                          </span>
                        </a>
                        <a
                          className="nk-hover-jshwrk"
                          href="/leituras?tipo=webtoons"
                          style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            color: "#F0EEE9",
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>Webtoons</span>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                            Rolagem vertical · atualização semanal
                          </span>
                        </a>
                        <span style={{ height: "1px", background: "rgba(240,238,233,.08)", margin: "6px 4px" }} />
                        <a
                          className="nk-hover-jshwrk"
                          href="/leituras"
                          style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            fontSize: "14px",
                            fontWeight: "500",
                            color: "#DBAF57",
                          }}
                        >
                          Todas as leituras →
                        </a>
                      </div>{" "}
                    </div>{" "}
                  </>
                ) : null}{" "}
              </div>
            </React.Fragment>
          ))}
        </nav>
        <div
          className={"nk-hdr-search" + (v.open ? " is-open" : "")}
          ref={v.boxRef}
          style={{ marginLeft: "auto", flex: "0 1 380px", minWidth: "42px", position: "relative" }}
        >
          {" "}
          <div
            style={{
              height: "40px",
              overflow: "hidden",
              borderRadius: "999px",
              border: `1px solid ${v.searchBorder ?? ""}`,
              background: `${v.searchBg ?? ""}`,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "0 16px",
              fontSize: "13px",
              color: "#B7B1A4",
              transition: "border-color .2s,background .2s",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={v.searchIcon}
              strokeWidth="2"
              style={{ flexShrink: "0" }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={v.inputRef}
              value={val(v.q)}
              onChange={v.onQ}
              onFocus={v.onFocus}
              onKeyDown={v.onKey}
              placeholder="Buscar animes, mangás, webtoons…"
              style={{
                flex: "1",
                minWidth: "0",
                height: "100%",
                background: "transparent",
                border: "0",
                outline: "none",
                color: "#F0EEE9",
                fontFamily: "Inter,sans-serif",
                fontSize: "13px",
              }}
            />
            {v.showSlash ? (
              <>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: "11px",
                    border: "1px solid rgba(240,238,233,.15)",
                    borderRadius: "4px",
                    padding: "1px 6px",
                    flexShrink: "0",
                  }}
                >
                  /
                </span>
              </>
            ) : null}
            {v.hasQ ? (
              <>
                <button
                  className="nk-hover-1d5grei"
                  onClick={v.clearQ}
                  aria-label="Limpar busca"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontSize: "16px",
                    lineHeight: "1",
                    color: "#B7B1A4",
                    flexShrink: "0",
                  }}
                >
                  ×
                </button>
              </>
            ) : null}
          </div>{" "}
          {v.open ? (
            <>
              {" "}
              <div
                className="nk-hdr-results"
                style={{
                  position: "absolute",
                  right: "0",
                  top: "calc(100% + 10px)",
                  width: "min(560px,92vw)",
                  maxHeight: "calc(100vh - 110px)",
                  overflowY: "auto",
                  background: "#1A1714",
                  border: "1px solid rgba(219,175,87,.2)",
                  borderRadius: "14px",
                  boxShadow: "0 24px 60px rgba(0,0,0,.55)",
                  padding: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {v.hasTop ? (
                  <>
                    <a
                      href={v.top?.href}
                      onMouseEnter={v.top?.hover}
                      style={{
                        position: "relative",
                        display: "block",
                        height: "132px",
                        borderRadius: "10px",
                        overflow: "hidden",
                        border: `1px solid ${v.top?.border ?? ""}`,
                        color: "#F0EEE9",
                      }}
                    >
                      {" "}
                      <img
                        src={v.top?.img}
                        alt=""
                        style={{
                          position: "absolute",
                          inset: "0",
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "center 30%",
                        }}
                      />{" "}
                      <span
                        style={{
                          position: "absolute",
                          inset: "0",
                          background:
                            "linear-gradient(90deg,rgba(26,23,20,.95) 0%,rgba(26,23,20,.7) 50%,rgba(26,23,20,.2) 100%)",
                        }}
                      />{" "}
                      <span
                        style={{
                          position: "absolute",
                          left: "18px",
                          right: "18px",
                          bottom: "16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: "600",
                            letterSpacing: ".22em",
                            textTransform: "uppercase",
                            color: "#DBAF57",
                          }}
                        >
                          {"Melhor resultado · "}
                          {txt(v.top?.typeLabel)}
                        </span>
                        <span
                          style={{
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: "26px",
                            fontWeight: "500",
                            lineHeight: "1.05",
                          }}
                        >
                          <span>{txt(v.top?.pre)}</span>
                          <span style={{ color: "#DBAF57" }}>{txt(v.top?.mid)}</span>
                          <span>{txt(v.top?.post)}</span>
                        </span>
                        <span style={{ fontSize: "12px", color: "rgba(240,238,233,.8)" }}>{txt(v.top?.meta)}</span>
                      </span>{" "}
                    </a>
                  </>
                ) : null}
                {asList(v.groups).map((g, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "600",
                          letterSpacing: ".22em",
                          textTransform: "uppercase",
                          color: "#B7B1A4",
                          padding: "10px 10px 6px",
                        }}
                      >
                        {txt(g?.label)}
                      </span>
                      {asList(g?.rows).map((r, $index) => (
                        <React.Fragment key={$index}>
                          <a
                            href={r?.href}
                            onMouseEnter={r?.hover}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "8px 10px",
                              borderRadius: "8px",
                              background: `${r?.bg ?? ""}`,
                              color: "#F0EEE9",
                            }}
                          >
                            <img
                              src={r?.cover}
                              alt=""
                              style={{
                                width: "36px",
                                height: "52px",
                                objectFit: "cover",
                                borderRadius: "4px",
                                flexShrink: "0",
                                display: "block",
                              }}
                            />
                            <span
                              style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0", flex: "1" }}
                            >
                              <span
                                style={{
                                  fontSize: "14px",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                <span>{txt(r?.pre)}</span>
                                <span style={{ color: "#DBAF57", fontWeight: "600" }}>{txt(r?.mid)}</span>
                                <span>{txt(r?.post)}</span>
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
                                {txt(r?.meta)}
                              </span>
                            </span>
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: "600",
                                letterSpacing: ".12em",
                                textTransform: "uppercase",
                                color: "#B7B1A4",
                                border: "1px solid rgba(240,238,233,.12)",
                                borderRadius: "4px",
                                padding: "3px 6px",
                                flexShrink: "0",
                              }}
                            >
                              {txt(r?.typeLabel)}
                            </span>
                          </a>
                        </React.Fragment>
                      ))}
                    </div>
                  </React.Fragment>
                ))}
                {v.noResults ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "16px 10px" }}>
                      <img
                        src="/assets/nekoflow-mascot.png"
                        alt=""
                        style={{ width: "64px", height: "64px", objectFit: "contain", flexShrink: "0" }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "500" }}>Nada encontrado para “{txt(v.q)}”</span>
                        <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                          Confira a grafia ou tente o nome japonês. Se a obra não estiver no catálogo, peça para
                          incluirmos.
                        </span>
                        <a href={v.requestHref} style={{ fontSize: "13px", fontWeight: "600" }}>
                          Solicitar obra →
                        </a>
                      </div>
                    </div>
                  </>
                ) : null}
                {v.hasQ ? (
                  <>
                    <a
                      href={v.allHref}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 10px 6px",
                        marginTop: "4px",
                        borderTop: "1px solid rgba(240,238,233,.08)",
                        fontSize: "13px",
                        fontWeight: "500",
                      }}
                    >
                      Ver todos os resultados no Explorar
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#B7B1A4" }}>
                        ↑↓ navegar · Enter abrir
                      </span>
                    </a>
                  </>
                ) : null}
              </div>{" "}
            </>
          ) : null}{" "}
        </div>
        {v.loggedIn ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div data-nk-menu="1" style={{ position: "relative" }}>
                {" "}
                <button
                  className="nk-hover-1m5yhr"
                  onClick={v.toggleNotif}
                  aria-label="Notificações"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    position: "relative",
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: `${v.bellColor ?? ""}`,
                    background: `${v.bellBg ?? ""}`,
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  {v.hasUnread ? (
                    <>
                      <span
                        style={{
                          position: "absolute",
                          right: "3px",
                          top: "4px",
                          minWidth: "17px",
                          height: "17px",
                          padding: "0 4px",
                          borderRadius: "999px",
                          background: "#DBAF57",
                          color: "#1A1714",
                          fontSize: "10px",
                          fontWeight: "700",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "2px solid #171411",
                        }}
                      >
                        {txt(v.unreadLabel)}
                      </span>
                    </>
                  ) : null}
                </button>{" "}
                {v.notifOpen ? (
                  <>
                    {" "}
                    <div
                      className="nk-sheet"
                      style={{
                        position: "absolute",
                        right: "-56px",
                        top: "calc(100% + 12px)",
                        width: "400px",
                        maxHeight: "calc(100vh - 100px)",
                        display: "flex",
                        flexDirection: "column",
                        background: "#1A1714",
                        border: "1px solid rgba(219,175,87,.2)",
                        borderRadius: "14px",
                        boxShadow: "0 24px 60px rgba(0,0,0,.55)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          justifyContent: "space-between",
                          padding: "18px 18px 12px",
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span
                            style={{
                              fontFamily: "'Cormorant Garamond',serif",
                              fontSize: "24px",
                              fontWeight: "500",
                              lineHeight: "1",
                            }}
                          >
                            Notificações
                          </span>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(v.unreadText)}</span>
                        </div>
                        {v.hasUnread ? (
                          <>
                            <button
                              className="nk-hover-1e3fwvz"
                              onClick={v.markAll}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: "500",
                                color: "#DBAF57",
                              }}
                            >
                              Marcar todas como lidas
                            </button>
                          </>
                        ) : null}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          padding: "0 14px 10px",
                          borderBottom: "1px solid rgba(240,238,233,.07)",
                        }}
                      >
                        {asList(v.notifTabs).map((t, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onClick={t?.pick}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                height: "30px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 12px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: "500",
                                background: `${t?.bg ?? ""}`,
                                color: `${t?.color ?? ""}`,
                              }}
                            >
                              {txt(t?.label)}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", padding: "6px" }}>
                        {asList(v.notifList).map((n, $index) => (
                          <React.Fragment key={$index}>
                            <a
                              className="nk-hover-kqh291"
                              href={n?.href}
                              onClick={n?.open}
                              style={{
                                display: "flex",
                                gap: "12px",
                                padding: "12px 10px",
                                borderRadius: "10px",
                                background: `${n?.bg ?? ""}`,
                                color: "#F0EEE9",
                              }}
                            >
                              {n?.hasCover ? (
                                <>
                                  <img
                                    src={n?.cover}
                                    alt=""
                                    style={{
                                      width: "36px",
                                      height: "52px",
                                      objectFit: "cover",
                                      borderRadius: "4px",
                                      flexShrink: "0",
                                      display: "block",
                                    }}
                                  />
                                </>
                              ) : null}
                              {n?.hasIcon ? (
                                <>
                                  <span
                                    style={{
                                      width: "36px",
                                      height: "36px",
                                      borderRadius: "50%",
                                      flexShrink: "0",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      background: "#2D2924",
                                      color: "#DBAF57",
                                    }}
                                  >
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d={n?.iconPath} />
                                    </svg>
                                  </span>
                                </>
                              ) : null}
                              <span
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "4px",
                                  minWidth: "0",
                                  flex: "1",
                                }}
                              >
                                <span style={{ fontSize: "13px", fontWeight: `${n?.weight ?? ""}` }}>
                                  {txt(n?.title)}
                                </span>
                                <span style={{ fontSize: "12px", lineHeight: "1.45", color: "#B7B1A4" }}>
                                  {txt(n?.sub)}
                                </span>
                                <span style={{ fontSize: "11px", color: "#8F897D" }}>{txt(n?.when)}</span>
                              </span>
                              <span
                                style={{
                                  width: "7px",
                                  height: "7px",
                                  transform: "rotate(45deg)",
                                  background: `${n?.dot ?? ""}`,
                                  flexShrink: "0",
                                  marginTop: "6px",
                                }}
                              />
                            </a>
                          </React.Fragment>
                        ))}
                        {v.notifEmpty ? (
                          <>
                            <span
                              style={{ padding: "28px 12px", textAlign: "center", fontSize: "13px", color: "#B7B1A4" }}
                            >
                              Nada por aqui nesta categoria.
                            </span>
                          </>
                        ) : null}
                      </div>
                      <a
                        className="nk-hover-zuhwcw"
                        href="/notificacoes"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "46px",
                          borderTop: "1px solid rgba(240,238,233,.07)",
                          fontSize: "13px",
                          fontWeight: "500",
                        }}
                      >
                        Ver todas as notificações
                      </a>
                    </div>{" "}
                  </>
                ) : null}{" "}
              </div>
              <div data-nk-menu="1" style={{ position: "relative" }}>
                {" "}
                <button
                  onClick={v.toggleUser}
                  aria-label="Menu da conta"
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    border: `1px solid ${v.avatarBorder ?? ""}`,
                    background: "#2D2924",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "'Cormorant Garamond',serif",
                    fontSize: "18px",
                    color: "#DBAF57",
                  }}
                >
                  {txt(v.userInitial)}
                </button>{" "}
                {v.userOpen ? (
                  <>
                    {" "}
                    <div
                      className="nk-sheet"
                      style={{
                        position: "absolute",
                        right: "0",
                        top: "calc(100% + 12px)",
                        width: "270px",
                        maxHeight: "calc(100vh - 100px)",
                        overflowY: "auto",
                        background: "#1A1714",
                        border: "1px solid rgba(219,175,87,.2)",
                        borderRadius: "14px",
                        padding: "8px",
                        display: "flex",
                        flexDirection: "column",
                        boxShadow: "0 24px 60px rgba(0,0,0,.55)",
                      }}
                    >
                      <a
                        className="nk-hover-kqh291"
                        href="/conta"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "10px",
                          borderRadius: "10px",
                          color: "#F0EEE9",
                        }}
                      >
                        <span
                          style={{
                            width: "42px",
                            height: "42px",
                            borderRadius: "50%",
                            border: "1px solid rgba(219,175,87,.45)",
                            background: "#2D2924",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: "20px",
                            color: "#DBAF57",
                            flexShrink: "0",
                          }}
                        >
                          {txt(v.userInitial)}
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "14px", fontWeight: "600" }}>{txt(v.userName)}</span>
                          <span style={{ fontSize: "12px", color: "#DBAF57" }}>Ver meu perfil →</span>
                        </span>
                      </a>
                      {asList(v.userGroups).map((g, $index) => (
                        <React.Fragment key={$index}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              borderTop: "1px solid rgba(240,238,233,.07)",
                              marginTop: "6px",
                              paddingTop: "6px",
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
                              {txt(g?.label)}
                            </span>
                            {asList(g?.items).map((i, $index) => (
                              <React.Fragment key={$index}>
                                <a
                                  className="nk-hover-jshwrk"
                                  href={i?.href}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    padding: "9px 10px",
                                    borderRadius: "8px",
                                    fontSize: "14px",
                                    color: "#F0EEE9",
                                  }}
                                >
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ flexShrink: "0", opacity: ".8" }}
                                  >
                                    <path d={i?.icon} />
                                  </svg>
                                  <span style={{ flex: "1" }}>{txt(i?.label)}</span>
                                  {i?.hasCount ? (
                                    <>
                                      <span
                                        style={{
                                          fontFamily: "'JetBrains Mono',monospace",
                                          fontSize: "11px",
                                          color: "#B7B1A4",
                                        }}
                                      >
                                        {txt(i?.count)}
                                      </span>
                                    </>
                                  ) : null}
                                </a>
                              </React.Fragment>
                            ))}
                          </div>
                        </React.Fragment>
                      ))}
                      <div
                        style={{ borderTop: "1px solid rgba(240,238,233,.07)", marginTop: "6px", paddingTop: "6px" }}
                      >
                        {" "}
                        <button
                          className="nk-hover-kqh291"
                          onClick={v.logout}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            boxSizing: "border-box",
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "9px 10px",
                            borderRadius: "8px",
                            fontSize: "14px",
                            color: "#B7B1A4",
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                          </svg>
                          {"Sair "}
                        </button>{" "}
                      </div>
                    </div>{" "}
                  </>
                ) : null}{" "}
              </div>
            </div>
          </>
        ) : null}
        {v.guest ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <a
                className="nk-hover-1d5grei"
                href="/entrar"
                style={{
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 14px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#F0EEE9",
                  whiteSpace: "nowrap",
                }}
              >
                Entrar
              </a>
              <a
                className="nk-hover-1uijps0"
                href="/criar-conta"
                style={{
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 18px",
                  borderRadius: "8px",
                  background: "#DBAF57",
                  color: "#1A1714",
                  fontSize: "14px",
                  fontWeight: "600",
                  whiteSpace: "nowrap",
                }}
              >
                Criar conta
              </a>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

export const defaults = { active: "inicio", loggedIn: true, solid: false };

export default defineDC("Header", HeaderLogic, render, { helmet });
