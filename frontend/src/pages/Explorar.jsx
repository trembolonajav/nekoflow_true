// Origem: design/claude-design/Explorar.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css, val } from "../dc/runtime";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { api } from "../lib/api";
import { session, goLogin } from "../lib/session";

const quickBtn = (on) => ({
  all: "unset",
  cursor: "pointer",
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "15px",
  background: on ? "#DBAF57" : "rgba(23,20,17,.85)",
  color: on ? "#1A1714" : "#F0EEE9",
  border: "1px solid rgba(219,175,87,.45)",
});

class ExplorarLogic extends DCLogic {
  state = {
    items: [],
    q: "",
    kind: "todos",
    genres: [],
    themes: [],
    status: null,
    origin: null,
    decade: null,
    minScore: null,
    vertical: false,
    epRange: null,
    sort: "pop",
    limit: 24,
  };
  componentDidMount() {
    const p = new URLSearchParams(location.search);
    const k = p.get("tipo");
    const q = p.get("q");
    this.setState({ kind: k || "todos", q: q || "" });
    // Catálogo editorial + obras cadastradas pela equipe (mesmo id, sem duplicar).
    Promise.all([
      fetch("/api/content/explorar").then((r) => r.json()),
      fetch("/api/catalog/all")
        .then((r) => r.json())
        .catch(() => []),
    ]).then(([items, all]) => {
      const known = new Set(items.map((x) => x.id));
      const extra = all
        .filter((w) => !known.has(w.id) && w.id >= 900000000)
        .map((w) => ({ ...w, genres: [], themes: [], score: null, origin: null, studio: "", pop: w.pop || 1 }));
      this.setState({ items: [...items, ...extra] });
    });
    this.loadMine();
  }
  /** Lista e favoritos da conta (fonte única), para os botões rápidos dos cards. */
  loadMine() {
    if (!session.loggedIn) return;
    api
      .get("/api/me/library")
      .then((lib) => this.setState({ lib }))
      .catch(() => {});
    api
      .get("/api/me/favorites")
      .then((favs) => this.setState({ favs: favs.map((f) => f.id) }))
      .catch(() => {});
  }
  quick(e, req) {
    e.preventDefault();
    e.stopPropagation();
    if (!session.loggedIn) return goLogin();
    req
      .then(() => {
        this.loadMine();
        window.dispatchEvent(new Event("nk:personal"));
      })
      .catch(() => {});
  }
  sync() {
    const s = this.state;
    const p = new URLSearchParams();
    if (s.kind !== "todos") p.set("tipo", s.kind);
    if (s.q) p.set("q", s.q);
    if (s.genres.length) p.set("genero", s.genres.join(","));
    try {
      history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
    } catch (e) {}
  }
  set(patch) {
    this.setState({ ...patch, limit: 24 }, () => this.sync());
  }
  toggleArr(key, v) {
    const a = this.state[key];
    this.set({ [key]: a.includes(v) ? a.filter((x) => x !== v) : [...a, v] });
  }
  toggleOne(key, v) {
    this.set({ [key]: this.state[key] === v ? null : v });
  }
  matchKind(x, k) {
    if (k === "todos") return true;
    if (k === "animes") return x.kind === "anime";
    if (k === "filmes") return x.kind === "filme";
    if (k === "mangas") return x.kind === "manga";
    if (k === "manhwas") return x.kind === "manhwa";
    if (k === "webtoons") return x.webtoon;
    return true;
  }
  renderVals() {
    const s = this.state;
    const loggedIn = this.props.loggedIn ?? true;
    const isAnim = s.kind === "animes" || s.kind === "filmes";
    const isRead = ["mangas", "manhwas", "webtoons"].includes(s.kind);
    const decades = { "2020s": [2020, 2099], "2010s": [2010, 2019], "2000s": [2000, 2009], "Antes de 2000": [0, 1999] };
    const eps = { "Até 13": [0, 13], "14 a 26": [14, 26], "Mais de 26": [27, 9999] };
    const ql = s.q.trim().toLowerCase();
    const base = s.items.filter((x) => {
      if (ql && !(x.title + " " + x.alt + " " + x.studio).toLowerCase().includes(ql)) return false;
      if (s.genres.length && !s.genres.every((g) => x.genres.includes(g))) return false;
      if (s.themes.length && !s.themes.every((t) => x.themes.includes(t))) return false;
      if (s.status && x.status !== s.status) return false;
      if (s.origin && x.origin !== { Japão: "JP", "Coreia do Sul": "KR" }[s.origin]) return false;
      if (s.decade) {
        const [a, b] = decades[s.decade];
        if (!x.year || x.year < a || x.year > b) return false;
      }
      if (s.minScore && !(x.score >= s.minScore * 10)) return false;
      if (isRead && s.vertical && !x.webtoon) return false;
      if (s.kind === "animes" && s.epRange) {
        const [a, b] = eps[s.epRange];
        if (!x.eps || x.eps < a || x.eps > b) return false;
      }
      return true;
    });
    const list = base.filter((x) => this.matchKind(x, s.kind));
    const sorters = {
      pop: (a, b) => b.pop - a.pop,
      score: (a, b) => (b.score || 0) - (a.score || 0),
      recent: (a, b) => (b.year || 0) - (a.year || 0),
      az: (a, b) => a.title.localeCompare(b.title),
    };
    list.sort(sorters[s.sort]);
    const label = (x) =>
      x.kind === "anime"
        ? "Anime"
        : x.kind === "filme"
          ? "Filme"
          : x.kind === "manga"
            ? x.webtoon
              ? "Mangá · Webtoon"
              : "Mangá"
            : x.webtoon
              ? "Manhwa · Webtoon"
              : "Manhwa";
    const meta = (x) => {
      if (x.kind === "anime")
        return [x.year, x.eps ? `${x.eps} eps` : null, x.status === "Em lançamento" ? "Em lançamento" : x.studio]
          .filter(Boolean)
          .join(" · ");
      if (x.kind === "filme") return [x.year, x.studio].filter(Boolean).join(" · ");
      return [x.year, x.ch ? `${x.ch} caps` : null, x.status].filter(Boolean).join(" · ");
    };
    const inLib = new Set((s.lib || []).map((y) => y.id));
    const favSet = new Set(s.favs || []);
    const results = list.slice(0, s.limit).map((x) => ({
      ...x,
      inList: inLib.has(x.id),
      fav: favSet.has(x.id),
      listTitle: inLib.has(x.id) ? "Na sua lista" : "Adicionar à minha lista",
      favTitle: favSet.has(x.id) ? "Remover dos favoritos" : "Favoritar",
      toggleList: (e) =>
        inLib.has(x.id)
          ? (e.preventDefault(), e.stopPropagation(), (location.href = "/conta?aba=lista"))
          : this.quick(e, api.put(`/api/me/library/${x.id}`, { status: "planejado" })),
      toggleFav: (e) => this.quick(e, api.put(`/api/me/favorites/${x.id}`, { on: !favSet.has(x.id) })),
      href: x.id === 151807 ? "/obra" : x.id === 105398 ? "/obra-leitura" : "#",
      typeLabel: label(x),
      meta: meta(x),
      hasScore: !!x.score,
      scoreLabel: x.score ? (x.score / 10).toFixed(1).replace(".", ",") : "",
    }));
    const chip = (on) => ({
      bg: on ? "rgba(219,175,87,.14)" : "transparent",
      border: on ? "#DBAF57" : "rgba(240,238,233,.14)",
      color: on ? "#DBAF57" : "#F0EEE9",
    });
    const G = [
      "Ação",
      "Aventura",
      "Comédia",
      "Drama",
      "Fantasia",
      "Romance",
      "Mistério",
      "Terror",
      "Ficção científica",
      "Sobrenatural",
      "Psicológico",
      "Cotidiano",
      "Esportes",
      "Suspense",
    ];
    const TH = [
      "Isekai",
      "Reencarnação",
      "Viagem no tempo",
      "Escola",
      "Artes marciais",
      "Dungeons",
      "Vingança",
      "Sobrevivência",
      "Magia",
    ];
    const groups = [
      {
        label: "Gênero",
        opts: G.map((g) => ({ label: g, ...chip(s.genres.includes(g)), pick: () => this.toggleArr("genres", g) })),
      },
      {
        label: "Temas",
        opts: TH.map((t) => ({ label: t, ...chip(s.themes.includes(t)), pick: () => this.toggleArr("themes", t) })),
      },
      {
        label: "Situação",
        opts: ["Em lançamento", "Concluído", "Hiato", "Anunciado"].map((v) => ({
          label: v,
          ...chip(s.status === v),
          pick: () => this.toggleOne("status", v),
        })),
      },
      {
        label: "Ano",
        opts: Object.keys(decades).map((v) => ({
          label: v,
          ...chip(s.decade === v),
          pick: () => this.toggleOne("decade", v),
        })),
      },
      {
        label: "Origem",
        opts: ["Japão", "Coreia do Sul"].map((v) => ({
          label: v,
          ...chip(s.origin === v),
          pick: () => this.toggleOne("origin", v),
        })),
      },
      {
        label: "Nota mínima",
        opts: [7, 8, 9].map((v) => ({
          label: `★ ${v}+`,
          ...chip(s.minScore === v),
          pick: () => this.toggleOne("minScore", v),
        })),
      },
    ];
    if (s.kind === "animes")
      groups.push({
        label: "Episódios",
        opts: Object.keys(eps).map((v) => ({
          label: v,
          ...chip(s.epRange === v),
          pick: () => this.toggleOne("epRange", v),
        })),
      });
    if (isRead)
      groups.push({
        label: "Formato de leitura",
        opts: [{ label: "Rolagem vertical", ...chip(s.vertical), pick: () => this.set({ vertical: !s.vertical }) }],
      });
    const applied = [
      ...s.genres.map((g) => ({ label: g, remove: () => this.toggleArr("genres", g) })),
      ...s.themes.map((t) => ({ label: t, remove: () => this.toggleArr("themes", t) })),
      ...[
        ["status", s.status],
        ["decade", s.decade],
        ["origin", s.origin],
        ["epRange", s.kind === "animes" ? s.epRange : null],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => ({ label: v, remove: () => this.set({ [k]: null }) })),
      ...(s.minScore ? [{ label: `★ ${s.minScore}+`, remove: () => this.set({ minScore: null }) }] : []),
      ...(isRead && s.vertical ? [{ label: "Rolagem vertical", remove: () => this.set({ vertical: false }) }] : []),
    ];
    const K = [
      ["todos", "Todos"],
      ["animes", "Animes"],
      ["filmes", "Filmes"],
      ["mangas", "Mangás"],
      ["manhwas", "Manhwas"],
      ["webtoons", "Webtoons"],
    ];
    const loaded = s.items.length > 0;
    return {
      loggedIn,
      q: s.q,
      hasQ: !!s.q,
      sort: s.sort,
      onQ: (e) => this.set({ q: e.target.value }),
      clearQ: () => this.set({ q: "" }),
      onSort: (e) => this.set({ sort: e.target.value }),
      kinds: K.map(([k, l]) => ({
        label: l,
        count: loaded ? base.filter((x) => this.matchKind(x, k)).length : "",
        pick: () => this.set({ kind: k }),
        bg: k === s.kind ? "#DBAF57" : "transparent",
        border: k === s.kind ? "#DBAF57" : "rgba(240,238,233,.15)",
        color: k === s.kind ? "#1A1714" : "#F0EEE9",
      })),
      groups,
      applied,
      hasFilters: applied.length > 0 || !!s.q,
      filtersOpen: !!s.filtersOpen,
      toggleFilters: () => this.setState({ filtersOpen: !s.filtersOpen }),
      filtersLabel: s.filtersOpen ? "Fechar filtros" : `Filtros${applied.length ? ` · ${applied.length}` : ""}`,
      clearAll: () =>
        this.set({
          q: "",
          genres: [],
          themes: [],
          status: null,
          origin: null,
          decade: null,
          minScore: null,
          vertical: false,
          epRange: null,
        }),
      countLabel: loaded ? `${list.length} ${list.length === 1 ? "obra" : "obras"}` : "Carregando…",
      results,
      hasResults: list.length > 0,
      empty: loaded && list.length === 0,
      requestHref: `/conta?aba=solicitacoes&titulo=${encodeURIComponent(s.q || "")}`,
      hasMore: list.length > s.limit,
      remaining: Math.max(0, list.length - s.limit),
      more: () => this.setState({ limit: s.limit + 24 }),
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
    text: "\nbody{margin:0;background:#171411;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\ninput::placeholder{color:#8F897D}\n",
  },
];

function render(v) {
  return (
    <>
      <div style={{ minHeight: "100vh", background: "#171411", display: "flex", flexDirection: "column" }}>
        <Header
          active="explorar"
          loggedIn={v.loggedIn}
          solid={true}
          __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
        />
        <div
          className="nk-page-top"
          style={{ padding: "112px 48px 0", display: "flex", flexDirection: "column", gap: "22px" }}
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
              Explorar
            </h1>
            <p style={{ margin: "0", fontSize: "15px", color: "#B7B1A4" }}>
              Todo o catálogo da Nekoflow: animes, filmes, mangás, manhwas e webtoons.
            </p>
          </div>
          <div
            style={{
              height: "56px",
              borderRadius: "14px",
              border: "1px solid rgba(219,175,87,.3)",
              background: "#1A1714",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "0 20px",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#DBAF57"
              strokeWidth="2"
              style={{ flexShrink: "0" }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={val(v.q)}
              onChange={v.onQ}
              placeholder="Buscar por título, nome japonês, estúdio…"
              style={{
                flex: "1",
                minWidth: "0",
                height: "100%",
                background: "transparent",
                border: "0",
                outline: "none",
                color: "#F0EEE9",
                fontFamily: "Inter,sans-serif",
                fontSize: "16px",
              }}
            />
            {v.hasQ ? (
              <>
                <button
                  className="nk-hover-1d5grei"
                  onClick={v.clearQ}
                  style={{ all: "unset", cursor: "pointer", fontSize: "13px", color: "#B7B1A4" }}
                >
                  Limpar
                </button>
              </>
            ) : null}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {asList(v.kinds).map((k, $index) => (
              <React.Fragment key={$index}>
                <button
                  onClick={k?.pick}
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
                    border: `1px solid ${k?.border ?? ""}`,
                    background: `${k?.bg ?? ""}`,
                    color: `${k?.color ?? ""}`,
                  }}
                >
                  {txt(k?.label)}
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", opacity: ".7" }}>
                    {txt(k?.count)}
                  </span>
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div
          className="nk-explorar"
          style={{
            padding: "28px 48px 80px",
            display: "grid",
            gridTemplateColumns: "240px minmax(0,1fr)",
            gap: "40px",
            alignItems: "start",
          }}
        >
          <button
            className="nk-show-m"
            onClick={v.toggleFilters}
            style={{
              all: "unset",
              cursor: "pointer",
              height: "42px",
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              borderRadius: "999px",
              border: "1px solid rgba(219,175,87,.35)",
              color: "#DBAF57",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            {txt(v.filtersLabel)}
          </button>
          <aside
            className={"nk-filters" + (v.filtersOpen ? " is-open" : "")}
            style={{
              position: "sticky",
              top: "88px",
              display: "flex",
              flexDirection: "column",
              gap: "26px",
              maxHeight: "calc(100vh - 104px)",
              overflowY: "auto",
              paddingRight: "6px",
              scrollbarWidth: "thin",
              scrollbarColor: "#2D2924 transparent",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "15px", fontWeight: "600" }}>Filtros</span>
              {v.hasFilters ? (
                <>
                  <button
                    className="nk-hover-1e3fwvz"
                    onClick={v.clearAll}
                    style={{ all: "unset", cursor: "pointer", fontSize: "13px", color: "#DBAF57" }}
                  >
                    Limpar tudo
                  </button>
                </>
              ) : null}
            </div>
            {asList(v.groups).map((g, $index) => (
              <React.Fragment key={$index}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      letterSpacing: ".24em",
                      textTransform: "uppercase",
                      color: "#DBAF57",
                    }}
                  >
                    {txt(g?.label)}
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {asList(g?.opts).map((o, $index) => (
                      <React.Fragment key={$index}>
                        <button
                          className="nk-hover-1aaqvuu"
                          onClick={o?.pick}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            height: "30px",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 11px",
                            borderRadius: "7px",
                            fontSize: "13px",
                            border: `1px solid ${o?.border ?? ""}`,
                            background: `${o?.bg ?? ""}`,
                            color: `${o?.color ?? ""}`,
                          }}
                        >
                          {txt(o?.label)}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </aside>
          <section style={{ display: "flex", flexDirection: "column", gap: "20px", minWidth: "0" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px 24px",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", marginRight: "6px" }}>{txt(v.countLabel)}</span>
                {asList(v.applied).map((a, $index) => (
                  <React.Fragment key={$index}>
                    <button
                      className="nk-hover-16fkng8"
                      onClick={a?.remove}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "0 10px",
                        borderRadius: "999px",
                        fontSize: "12px",
                        background: "rgba(219,175,87,.12)",
                        border: "1px solid rgba(219,175,87,.4)",
                        color: "#DBAF57",
                      }}
                    >
                      {txt(a?.label)}
                      <span style={{ fontSize: "14px", lineHeight: "1" }}>×</span>
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#B7B1A4" }}>
                {"Ordenar por "}
                <select
                  value={val(v.sort)}
                  onChange={v.onSort}
                  style={{
                    height: "36px",
                    borderRadius: "8px",
                    border: "1px solid rgba(240,238,233,.15)",
                    background: "#1A1714",
                    color: "#F0EEE9",
                    fontFamily: "Inter,sans-serif",
                    fontSize: "13px",
                    padding: "0 10px",
                  }}
                >
                  {" "}
                  <option value="pop">Popularidade</option> <option value="score">Melhor nota</option>{" "}
                  <option value="recent">Mais recentes</option> <option value="az">A–Z</option>{" "}
                </select>
              </label>
            </div>
            {v.hasResults ? (
              <>
                <div
                  className="nk-grid-2"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill,minmax(168px,1fr))",
                    gap: "28px 16px",
                  }}
                >
                  {asList(v.results).map((r, $index) => (
                    <React.Fragment key={$index}>
                      <a
                        className="nk-hover-1d5grei"
                        href={r?.href}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                          color: "#F0EEE9",
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
                            src={r?.cover}
                            alt={r?.title}
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />{" "}
                          <span
                            className="nk-quick"
                            style={{ position: "absolute", left: "8px", top: "8px", display: "flex", gap: "6px" }}
                          >
                            <button
                              className="nk-hover-1owwya7"
                              onClick={r?.toggleList}
                              title={r?.listTitle}
                              style={quickBtn(r?.inList)}
                            >
                              {r?.inList ? "✓" : "+"}
                            </button>
                            <button
                              className="nk-hover-1owwya7"
                              onClick={r?.toggleFav}
                              title={r?.favTitle}
                              style={quickBtn(r?.fav)}
                            >
                              {r?.fav ? "♥" : "♡"}
                            </button>
                          </span>
                          {r?.hasScore ? (
                            <>
                              <span
                                style={{
                                  position: "absolute",
                                  right: "8px",
                                  top: "8px",
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: "11px",
                                  background: "rgba(23,20,17,.88)",
                                  color: "#DBAF57",
                                  padding: "3px 7px",
                                  borderRadius: "4px",
                                }}
                              >
                                {"★ "}
                                {txt(r?.scoreLabel)}
                              </span>
                            </>
                          ) : null}{" "}
                          <span
                            style={{
                              position: "absolute",
                              left: "8px",
                              bottom: "8px",
                              fontSize: "10px",
                              fontWeight: "600",
                              letterSpacing: ".12em",
                              textTransform: "uppercase",
                              background: "rgba(23,20,17,.88)",
                              color: "#F0EEE9",
                              padding: "4px 7px",
                              borderRadius: "4px",
                            }}
                          >
                            {txt(r?.typeLabel)}
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
                            {txt(r?.title)}
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
                      </a>
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
                        marginTop: "16px",
                        height: "44px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 24px",
                        borderRadius: "999px",
                        border: "1px solid rgba(219,175,87,.4)",
                        fontSize: "14px",
                        fontWeight: "500",
                        color: "#F0EEE9",
                      }}
                    >
                      {"Carregar mais · "}
                      {txt(v.remaining)}
                      {" restantes"}
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
            {v.empty ? (
              <>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    textAlign: "center",
                    gap: "14px",
                    padding: "56px 24px",
                    borderRadius: "16px",
                    border: "1px dashed rgba(219,175,87,.25)",
                  }}
                >
                  <img
                    src="/assets/nekoflow-mascot.png"
                    alt=""
                    style={{ width: "120px", height: "120px", objectFit: "contain", opacity: ".9" }}
                  />
                  <h3
                    style={{
                      margin: "0",
                      fontFamily: "'Cormorant Garamond',serif",
                      fontWeight: "500",
                      fontSize: "32px",
                    }}
                  >
                    Nenhuma obra encontrada
                  </h3>
                  <p style={{ margin: "0", fontSize: "14px", color: "#B7B1A4", maxWidth: "420px" }}>
                    Tente remover alguns filtros ou buscar por outro nome. Se a obra ainda não está no catálogo, você
                    pode pedir para incluirmos.
                  </p>
                  <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                    <button
                      className="nk-hover-ucdklh"
                      onClick={v.clearAll}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "42px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 20px",
                        borderRadius: "999px",
                        border: "1px solid rgba(240,238,233,.25)",
                        fontSize: "14px",
                        color: "#F0EEE9",
                      }}
                    >
                      Limpar filtros
                    </button>
                    <a
                      className="nk-hover-1uijps0"
                      href={v.requestHref}
                      style={{
                        height: "42px",
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
                      Solicitar obra
                    </a>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}

export const defaults = { loggedIn: true };

export default defineDC("Explorar", ExplorarLogic, render, { helmet });
