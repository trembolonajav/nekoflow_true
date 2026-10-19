// Origem: design/claude-design/Entrar.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { api } from "../lib/api";
import { session } from "../lib/session";
import { DCLogic, defineDC, txt, asList, css, val } from "../dc/runtime";
import Header from "../components/Header";

class EntrarLogic extends DCLogic {
  state = {
    mode: "entrar",
    covers: [],
    wide: true,
    email: "",
    emailTouched: false,
    pw: "",
    showPw: false,
    user: "",
    terms: false,
    loading: false,
    loginError: false,
    cooldown: 0,
    step: 1,
    genres: [],
    follow: [],
  };
  MODES = ["entrar", "criar", "verificar", "recuperar", "enviado", "redefinir", "pronto", "boas"];
  onResize = () => {
    const w = window.innerWidth >= 960;
    if (w !== this.state.wide) this.setState({ wide: w });
  };
  componentDidMount() {
    const p = new URLSearchParams(location.search).get("modo");
    this.setState({ mode: p === "boas-vindas" ? "boas" : this.MODES.includes(p) ? p : "entrar" });
    this.onResize();
    window.addEventListener("resize", this.onResize);
    api.get("/api/content/entrar")
      .then((covers) => this.setState({ covers }));
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.onResize);
    clearInterval(this.cd);
  }
  setMode(mode) {
    this.setState({ mode, loginError: false, pw: "", showPw: false, emailTouched: false });
    try {
      history.replaceState(
        null,
        "",
        mode === "entrar" ? location.pathname : `?modo=${mode === "boas" ? "boas-vindas" : mode}`,
      );
    } catch (e) {}
  }
  /** Volta para a página de origem (?next=), só dentro do próprio site. */
  done(dest) {
    const next = new URLSearchParams(location.search).get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    location.href = dest || safe || "/";
  }
  /** Boas-vindas: gêneros viram preferência; obras escolhidas entram na lista e são acompanhadas. */
  finishOnboarding() {
    const s = this.state;
    const jobs = [];
    if (s.genres.length) jobs.push(api.put("/api/me/preferences", { genres: s.genres }));
    s.follow.forEach((id) => {
      jobs.push(api.put(`/api/me/library/${id}`, { status: "planejado" }));
      jobs.push(api.put(`/api/me/follows/${id}`, { on: true }));
    });
    Promise.allSettled(jobs).then(() => this.done("/"));
  }
  startCooldown() {
    this.setState({ cooldown: 30 });
    clearInterval(this.cd);
    this.cd = setInterval(() => {
      const c = this.state.cooldown - 1;
      this.setState({ cooldown: Math.max(0, c) });
      if (c <= 0) clearInterval(this.cd);
    }, 1000);
  }
  renderVals() {
    const s = this.state;
    const m = {};
    this.MODES.forEach((k) => (m[k] = k === s.mode));
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim());
    const emailErr = s.emailTouched && !!s.email && !emailOk;
    const u = s.user.trim().toLowerCase();
    const reserved = ["admin", "nekoflow", "suporte", "moderador", "marina"];
    let userMsg = "De 3 a 20 caracteres: letras, números, ponto ou _. Aparece no seu perfil.",
      userColor = "#8F897D",
      userOk = false;
    if (u) {
      if (!/^[a-z0-9_.]{3,20}$/.test(u)) {
        userMsg = "Use de 3 a 20 caracteres: letras, números, ponto ou _";
        userColor = "#E08A7A";
      } else if (reserved.includes(u)) {
        userMsg = `@${u} não está disponível`;
        userColor = "#E08A7A";
      } else {
        userMsg = `@${u} está disponível`;
        userColor = "#9FC79A";
        userOk = true;
      }
    }
    const L = s.pw.length;
    const lvl = L === 0 ? 0 : L < 8 ? 1 : L < 15 ? 2 : 3;
    const lvlColor = ["rgba(240,238,233,.12)", "#E08A7A", "#D9B98A", "#9FC79A"][lvl];
    const pwBars = [1, 2, 3].map((i) => (i <= lvl ? lvlColor : "rgba(240,238,233,.12)"));
    const pwMsg =
      L === 0
        ? "Pelo menos 8 caracteres. Com 15 ou mais, a senha fica forte."
        : lvl === 1
          ? `Muito curta · ${L} de 8 caracteres`
          : lvl === 2
            ? `Aceitável · ${L} caracteres, 15 ou mais é recomendado`
            : "Senha forte";
    const pwOk = L >= 8;
    const canSignup = userOk && emailOk && pwOk && s.terms && !s.loading;
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
      "Cotidiano",
      "Esportes",
      "Sobrenatural",
    ];
    const cov = s.covers;
    const cols = [0, 1, 2, 3].map((c) => ({
      offset: ["-60px", "40px", "-20px", "80px"][c],
      items: cov.filter((_, i) => i % 4 === c),
    }));
    const pill = (on) => ({ bg: on ? "#DBAF57" : "transparent", color: on ? "#1A1714" : "#B7B1A4" });
    const art =
      s.mode === "boas"
        ? [
            "Sua conta está pronta.",
            "Dois passos rápidos para a Home já abrir com a sua cara. Se preferir, pule e personalize depois.",
          ]
        : s.mode === "criar" || s.mode === "verificar"
          ? [
              "Um universo de histórias espera por você.",
              "Com uma conta, a Nekoflow guarda seu progresso, monta sua lista e avisa quando sai episódio ou capítulo novo.",
            ]
          : [
              "Um universo de histórias espera por você.",
              "Assista animes, leia suas obras favoritas e acompanhe cada lançamento.",
            ];
    return {
      m,
      wide: s.wide,
      narrow: !s.wide,
      dir: s.wide ? "row" : "column",
      colPad: s.wide ? "104px clamp(32px,5vw,96px) 28px clamp(16px,2vw,40px)" : "8px 24px 28px",
      cols,
      artTitle: art[0],
      artText: art[1],
      formMax: s.mode === "boas" ? "520px" : "420px",
      showTabs: s.mode === "entrar" || s.mode === "criar",
      tabA: pill(s.mode === "entrar"),
      tabB: pill(s.mode === "criar"),
      toEntrar: () => this.setMode("entrar"),
      toCriar: () => this.setMode("criar"),
      toRecuperar: () => this.setMode("recuperar"),
      toRedefinir: () => this.setMode("redefinir"),
      toBoas: () => {
        this.setMode("boas");
        this.setState({ step: 1 });
      },
      email: s.email,
      onEmail: (e) => this.setState({ email: e.target.value, loginError: false }),
      blurEmail: () => this.setState({ emailTouched: true }),
      emailErr,
      emailBorder: emailErr ? "#E08A7A" : "rgba(240,238,233,.15)",
      emailShown: s.email.trim() || "seu e-mail",
      pw: s.pw,
      onPw: (e) => this.setState({ pw: e.target.value, loginError: false }),
      pwType: s.showPw ? "text" : "password",
      togglePw: () => this.setState({ showPw: !s.showPw }),
      pwToggleLabel: s.showPw ? "Ocultar" : "Mostrar",
      hasLoginError: s.loginError,
      loginLabel: s.loading ? "Entrando…" : "Entrar",
      btnOpacity: s.loading ? 0.7 : 1,
      submitLogin: (e) => {
        e.preventDefault();
        if (s.loading) return;
        if (!emailOk) {
          this.setState({ emailTouched: true });
          return;
        }
        this.setState({ loading: true });
        session
          .login(s.email.trim(), s.pw)
          .then(() => this.done())
          .catch(() => this.setState({ loading: false, loginError: true }));
      },
      google: () => this.setState({ loginError: true }),
      user: s.user,
      onUser: (e) => this.setState({ user: e.target.value.replace(/^@/, ""), signupError: null }),
      userMsg: s.signupError || userMsg,
      userMsgColor: s.signupError ? "#E08A7A" : userColor,
      userBorder: u && !userOk ? "#E08A7A" : "rgba(240,238,233,.15)",
      pwBars,
      pwMsg,
      pwMsgColor: lvl === 0 ? "#8F897D" : lvlColor,
      terms: s.terms,
      toggleTerms: () => this.setState({ terms: !s.terms }),
      termsBg: s.terms ? "#DBAF57" : "transparent",
      termsBorder: s.terms ? "#DBAF57" : "rgba(240,238,233,.3)",
      signupBg: canSignup ? "#DBAF57" : "#4A443D",
      signupCursor: canSignup ? "pointer" : "not-allowed",
      signupLabel: s.loading ? "Criando conta…" : "Criar conta",
      submitSignup: (e) => {
        e.preventDefault();
        if (!canSignup) {
          this.setState({ emailTouched: true });
          return;
        }
        this.setState({ loading: true, signupError: null });
        session
          .register(u, s.email.trim(), s.pw)
          .then(() => {
            this.setState({ loading: false, step: 1 });
            this.setMode("boas");
          })
          .catch((err) =>
            this.setState({
              loading: false,
              signupError:
                err.status === 409 && err.body && err.body.message === "email"
                  ? "Este e-mail já tem uma conta. Entre com ele."
                  : err.status === 409
                    ? `@${u} não está disponível`
                    : "Não foi possível criar a conta. Tente novamente.",
            }),
          );
      },
      resend: () => {
        if (s.cooldown === 0) this.startCooldown();
      },
      resendLabel: s.cooldown ? `Reenviar em ${s.cooldown}s` : "Reenviar e-mail",
      resendColor: s.cooldown ? "#8F897D" : "#DBAF57",
      resendCursor: s.cooldown ? "default" : "pointer",
      submitRecover: (e) => {
        e.preventDefault();
        if (!emailOk) {
          this.setState({ emailTouched: true });
          return;
        }
        this.setMode("enviado");
      },
      resetBg: pwOk ? "#DBAF57" : "#4A443D",
      resetCursor: pwOk ? "pointer" : "not-allowed",
      submitReset: (e) => {
        e.preventDefault();
        if (pwOk) this.setMode("pronto");
      },
      stepN: s.step,
      step1: s.step === 1,
      step2: s.step === 2,
      step2Bar: s.step === 2 ? "#DBAF57" : "rgba(240,238,233,.12)",
      genreChips: G.map((g) => {
        const on = s.genres.includes(g);
        return {
          label: g,
          bg: on ? "rgba(219,175,87,.14)" : "transparent",
          border: on ? "#DBAF57" : "rgba(240,238,233,.18)",
          color: on ? "#DBAF57" : "#F0EEE9",
          pick: () => this.setState({ genres: on ? s.genres.filter((x) => x !== g) : [...s.genres, g] }),
        };
      }),
      picks: cov.slice(0, 8).map((p) => {
        const on = s.follow.includes(p.id);
        return {
          ...p,
          on,
          bgImg: `url("${p.cover}")`,
          ring: on ? "#DBAF57" : "transparent",
          opacity: on ? 1 : 0.75,
          pick: () => this.setState({ follow: on ? s.follow.filter((x) => x !== p.id) : [...s.follow, p.id] }),
        };
      }),
      next: () => (s.step === 1 ? this.setState({ step: 2 }) : this.finishOnboarding()),
      nextLabel:
        s.step === 1
          ? s.genres.length
            ? `Continuar · ${s.genres.length} ${s.genres.length === 1 ? "gênero" : "gêneros"}`
            : "Continuar"
          : s.follow.length
            ? `Ir para a Home · ${s.follow.length} na lista`
            : "Ir para a Home",
      back: () => this.setState({ step: 1 }),
      finish: () => {},
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
    text: "\nbody{margin:0;background:#171411;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\ninput::placeholder{color:#8F897D}\ninput:-webkit-autofill{-webkit-text-fill-color:#F0EEE9;-webkit-box-shadow:0 0 0 40px #1A1714 inset}\n",
  },
];

function render(v) {
  return (
    <>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0A0908" }}>
        <Header
          active=""
          loggedIn={false}
          __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
        />
        <div
          style={{
            position: "relative",
            flex: "1",
            minHeight: "100vh",
            display: "flex",
            flexDirection: `${v.dir ?? ""}`,
            overflow: "hidden",
          }}
        >
          {v.wide ? (
            <>
              <img
                src="/assets/auth-background.png"
                alt="Nekoflow · Entre episódios e capítulos"
                style={{
                  position: "absolute",
                  inset: "0",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "left center",
                  display: "block",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: "0",
                  background: "linear-gradient(90deg,rgba(10,9,8,0) 45%,rgba(10,9,8,.55) 70%,rgba(10,9,8,.75) 100%)",
                }}
              />
              <div style={{ flex: "1 1 52%" }} />
            </>
          ) : null}
          {v.narrow ? (
            <>
              <div style={{ position: "relative", height: "clamp(260px,62vw,440px)", overflow: "hidden" }}>
                {" "}
                <img
                  src="/assets/auth-background.png"
                  alt="Nekoflow · Entre episódios e capítulos"
                  style={{
                    position: "absolute",
                    inset: "0",
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "16% 70%",
                    display: "block",
                  }}
                />{" "}
                <div
                  style={{
                    position: "absolute",
                    inset: "0",
                    background: "linear-gradient(0deg,#0A0908 0%,rgba(10,9,8,0) 40%)",
                  }}
                />{" "}
              </div>
            </>
          ) : null}
          <div
            style={{
              position: "relative",
              flex: "1 1 48%",
              minWidth: "0",
              display: "flex",
              flexDirection: "column",
              padding: `${v.colPad ?? ""}`,
            }}
          >
            <div
              style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0" }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: `${v.formMax ?? ""}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "24px",
                }}
              >
                {v.showTabs ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        padding: "4px",
                        borderRadius: "999px",
                        background: "#1A1714",
                        border: "1px solid rgba(240,238,233,.08)",
                      }}
                    >
                      <button
                        onClick={v.toEntrar}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "40px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          fontSize: "14px",
                          fontWeight: "600",
                          background: `${v.tabA?.bg ?? ""}`,
                          color: `${v.tabA?.color ?? ""}`,
                        }}
                      >
                        Entrar
                      </button>
                      <button
                        onClick={v.toCriar}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "40px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          fontSize: "14px",
                          fontWeight: "600",
                          background: `${v.tabB?.bg ?? ""}`,
                          color: `${v.tabB?.color ?? ""}`,
                        }}
                      >
                        Criar conta
                      </button>
                    </div>
                  </>
                ) : null}
                {v.m?.entrar ? (
                  <>
                    <form
                      onSubmit={v.submitLogin}
                      style={{ display: "flex", flexDirection: "column", gap: "18px" }}
                      noValidate
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
                          Bem-vindo de volta
                        </h2>
                        <span style={{ fontSize: "14px", color: "#B7B1A4" }}>Entre para continuar de onde parou.</span>
                      </div>
                      {v.hasLoginError ? (
                        <>
                          <div
                            role="alert"
                            style={{
                              padding: "12px 14px",
                              borderRadius: "10px",
                              background: "rgba(224,138,122,.08)",
                              border: "1px solid rgba(224,138,122,.4)",
                              fontSize: "13px",
                              color: "#F0C7BE",
                            }}
                          >
                            Não foi possível entrar. Verifique seus dados e tente de novo.
                          </div>
                        </>
                      ) : null}
                      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "500" }}>E-mail</span>
                        <input
                          type="email"
                          autoComplete="email"
                          value={val(v.email)}
                          onChange={v.onEmail}
                          onBlur={v.blurEmail}
                          placeholder="seu@email.com"
                          style={{
                            height: "48px",
                            borderRadius: "10px",
                            border: `1px solid ${v.emailBorder ?? ""}`,
                            background: "rgba(20,18,15,.85)",
                            color: "#F0EEE9",
                            padding: "0 14px",
                            fontFamily: "Inter,sans-serif",
                            fontSize: "15px",
                            outline: "none",
                          }}
                        />
                        {v.emailErr ? (
                          <>
                            <span style={{ fontSize: "12px", color: "#E08A7A" }}>
                              Digite um e-mail válido, como nome@exemplo.com
                            </span>
                          </>
                        ) : null}
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "13px",
                            fontWeight: "500",
                          }}
                        >
                          Senha
                          <button
                            className="nk-hover-1e3fwvz"
                            type="button"
                            onClick={v.toRecuperar}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              fontSize: "13px",
                              fontWeight: "500",
                              color: "#DBAF57",
                            }}
                          >
                            Esqueceu a senha?
                          </button>
                        </span>
                        <span style={{ position: "relative", display: "flex" }}>
                          <input
                            type={v.pwType}
                            autoComplete="current-password"
                            value={val(v.pw)}
                            onChange={v.onPw}
                            placeholder="Sua senha"
                            style={{
                              flex: "1",
                              height: "48px",
                              borderRadius: "10px",
                              border: "1px solid rgba(240,238,233,.15)",
                              background: "rgba(20,18,15,.85)",
                              color: "#F0EEE9",
                              padding: "0 76px 0 14px",
                              fontFamily: "Inter,sans-serif",
                              fontSize: "15px",
                              outline: "none",
                            }}
                          />
                          <button
                            className="nk-hover-1d5grei"
                            type="button"
                            onClick={v.togglePw}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              position: "absolute",
                              right: "12px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#B7B1A4",
                            }}
                          >
                            {txt(v.pwToggleLabel)}
                          </button>
                        </span>
                      </label>
                      <button
                        className="nk-hover-1c8eb9m"
                        type="submit"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "50px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "10px",
                          borderRadius: "999px",
                          background: "#DBAF57",
                          color: "#1A1714",
                          fontSize: "15px",
                          fontWeight: "600",
                          opacity: `${v.btnOpacity ?? ""}`,
                        }}
                      >
                        {txt(v.loginLabel)}
                      </button>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                          fontSize: "12px",
                          color: "#8F897D",
                        }}
                      >
                        <span style={{ flex: "1", height: "1px", background: "rgba(240,238,233,.1)" }} />
                        ou
                        <span style={{ flex: "1", height: "1px", background: "rgba(240,238,233,.1)" }} />
                      </div>
                      <button
                        className="nk-hover-ucdklh"
                        type="button"
                        onClick={v.google}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "50px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "12px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.2)",
                          fontSize: "15px",
                          fontWeight: "500",
                          color: "#F0EEE9",
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 48 48">
                          <path
                            fill="#FFC107"
                            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
                          />
                          <path
                            fill="#FF3D00"
                            d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                          />
                          <path
                            fill="#4CAF50"
                            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
                          />
                          <path
                            fill="#1976D2"
                            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
                          />
                        </svg>
                        {" Continuar com Google "}
                      </button>
                    </form>
                  </>
                ) : null}
                {v.m?.criar ? (
                  <>
                    <form
                      onSubmit={v.submitSignup}
                      style={{ display: "flex", flexDirection: "column", gap: "18px" }}
                      noValidate
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
                          Crie sua conta
                        </h2>
                        <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                          Guarde progresso, monte sua lista e receba avisos dos lançamentos.
                        </span>
                      </div>
                      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "500" }}>Nome de usuário</span>
                        <span style={{ position: "relative", display: "flex" }}>
                          <span
                            style={{
                              position: "absolute",
                              left: "14px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              fontSize: "15px",
                              color: "#8F897D",
                            }}
                          >
                            @
                          </span>
                          <input
                            autoComplete="username"
                            value={val(v.user)}
                            onChange={v.onUser}
                            placeholder="marina"
                            style={{
                              flex: "1",
                              height: "48px",
                              borderRadius: "10px",
                              border: `1px solid ${v.userBorder ?? ""}`,
                              background: "rgba(20,18,15,.85)",
                              color: "#F0EEE9",
                              padding: "0 14px 0 32px",
                              fontFamily: "Inter,sans-serif",
                              fontSize: "15px",
                              outline: "none",
                            }}
                          />
                        </span>
                        <span style={{ fontSize: "12px", color: `${v.userMsgColor ?? ""}` }}>{txt(v.userMsg)}</span>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "500" }}>E-mail</span>
                        <input
                          type="email"
                          autoComplete="email"
                          value={val(v.email)}
                          onChange={v.onEmail}
                          onBlur={v.blurEmail}
                          placeholder="seu@email.com"
                          style={{
                            height: "48px",
                            borderRadius: "10px",
                            border: `1px solid ${v.emailBorder ?? ""}`,
                            background: "rgba(20,18,15,.85)",
                            color: "#F0EEE9",
                            padding: "0 14px",
                            fontFamily: "Inter,sans-serif",
                            fontSize: "15px",
                            outline: "none",
                          }}
                        />
                        {v.emailErr ? (
                          <>
                            <span style={{ fontSize: "12px", color: "#E08A7A" }}>
                              Digite um e-mail válido, como nome@exemplo.com
                            </span>
                          </>
                        ) : null}
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "500" }}>Senha</span>
                        <span style={{ position: "relative", display: "flex" }}>
                          <input
                            type={v.pwType}
                            autoComplete="new-password"
                            value={val(v.pw)}
                            onChange={v.onPw}
                            placeholder="Uma frase longa funciona bem"
                            style={{
                              flex: "1",
                              height: "48px",
                              borderRadius: "10px",
                              border: "1px solid rgba(240,238,233,.15)",
                              background: "rgba(20,18,15,.85)",
                              color: "#F0EEE9",
                              padding: "0 76px 0 14px",
                              fontFamily: "Inter,sans-serif",
                              fontSize: "15px",
                              outline: "none",
                            }}
                          />
                          <button
                            className="nk-hover-1d5grei"
                            type="button"
                            onClick={v.togglePw}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              position: "absolute",
                              right: "12px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#B7B1A4",
                            }}
                          >
                            {txt(v.pwToggleLabel)}
                          </button>
                        </span>
                        <span style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "4px" }}>
                          {asList(v.pwBars).map((b, $index) => (
                            <React.Fragment key={$index}>
                              <span style={{ height: "3px", borderRadius: "2px", background: `${b ?? ""}` }} />
                            </React.Fragment>
                          ))}
                        </span>
                        <span style={{ fontSize: "12px", color: `${v.pwMsgColor ?? ""}` }}>{txt(v.pwMsg)}</span>
                      </label>
                      <button
                        type="button"
                        onClick={v.toggleTerms}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "12px",
                          fontSize: "13px",
                          lineHeight: "1.5",
                          color: "#B7B1A4",
                        }}
                      >
                        <span
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "5px",
                            border: `1px solid ${v.termsBorder ?? ""}`,
                            background: `${v.termsBg ?? ""}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: "0",
                            marginTop: "1px",
                          }}
                        >
                          {v.terms ? (
                            <>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#1A1714"
                                strokeWidth="3.5"
                              >
                                <path d="M5 12l5 5 9-10" />
                              </svg>
                            </>
                          ) : null}
                        </span>
                        <span>
                          {"Li e aceito os "}
                          <a href="#" style={{ color: "#DBAF57" }}>
                            Termos de Uso
                          </a>
                          {" e a "}
                          <a href="#" style={{ color: "#DBAF57" }}>
                            Política de Privacidade
                          </a>
                          .
                        </span>
                      </button>
                      <button
                        type="submit"
                        style={{
                          all: "unset",
                          cursor: `${v.signupCursor ?? ""}`,
                          height: "50px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          background: `${v.signupBg ?? ""}`,
                          color: "#1A1714",
                          fontSize: "15px",
                          fontWeight: "600",
                        }}
                      >
                        {txt(v.signupLabel)}
                      </button>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                          fontSize: "12px",
                          color: "#8F897D",
                        }}
                      >
                        <span style={{ flex: "1", height: "1px", background: "rgba(240,238,233,.1)" }} />
                        ou
                        <span style={{ flex: "1", height: "1px", background: "rgba(240,238,233,.1)" }} />
                      </div>
                      <button
                        className="nk-hover-ucdklh"
                        type="button"
                        onClick={v.google}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "50px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "12px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.2)",
                          fontSize: "15px",
                          fontWeight: "500",
                          color: "#F0EEE9",
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 48 48">
                          <path
                            fill="#FFC107"
                            d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
                          />
                          <path
                            fill="#FF3D00"
                            d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                          />
                          <path
                            fill="#4CAF50"
                            d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
                          />
                          <path
                            fill="#1976D2"
                            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
                          />
                        </svg>
                        {" Criar com Google "}
                      </button>
                    </form>
                  </>
                ) : null}
                {v.m?.verificar ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "18px", alignItems: "flex-start" }}>
                      <span
                        style={{
                          width: "64px",
                          height: "64px",
                          borderRadius: "50%",
                          background: "rgba(219,175,87,.1)",
                          border: "1px solid rgba(219,175,87,.4)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#DBAF57" strokeWidth="1.8">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m3 7 9 6 9-6" />
                        </svg>
                      </span>
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "40px",
                          lineHeight: "1",
                        }}
                      >
                        Confirme seu e-mail
                      </h2>
                      <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "#B7B1A4" }}>
                        {"Enviamos um link para "}
                        <span style={{ color: "#F0EEE9", fontWeight: "500" }}>{txt(v.emailShown)}</span>. Abra-o para
                        ativar a conta. O link vale por 24 horas.
                      </p>
                      <button
                        className="nk-hover-1c8eb9m"
                        onClick={v.toBoas}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          boxSizing: "border-box",
                          width: "100%",
                          height: "50px",
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
                        Simular: abri o link de confirmação
                      </button>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: "13px" }}>
                        <button
                          onClick={v.resend}
                          style={{
                            all: "unset",
                            cursor: `${v.resendCursor ?? ""}`,
                            fontWeight: "600",
                            color: `${v.resendColor ?? ""}`,
                          }}
                        >
                          {txt(v.resendLabel)}
                        </button>
                        <button
                          className="nk-hover-1e3fwvz"
                          onClick={v.toCriar}
                          style={{ all: "unset", cursor: "pointer", color: "#B7B1A4" }}
                        >
                          Usar outro e-mail
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
                {v.m?.recuperar ? (
                  <>
                    <form
                      onSubmit={v.submitRecover}
                      style={{ display: "flex", flexDirection: "column", gap: "18px" }}
                      noValidate
                    >
                      <button
                        className="nk-hover-1d5grei"
                        type="button"
                        onClick={v.toEntrar}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
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
                          <path d="m15 18-6-6 6-6" />
                        </svg>
                        Voltar para Entrar
                      </button>
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
                          Recuperar acesso
                        </h2>
                        <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                          Informe o e-mail da conta. Enviaremos um link para criar uma nova senha.
                        </span>
                      </div>
                      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "500" }}>E-mail</span>
                        <input
                          type="email"
                          autoComplete="email"
                          value={val(v.email)}
                          onChange={v.onEmail}
                          onBlur={v.blurEmail}
                          placeholder="seu@email.com"
                          style={{
                            height: "48px",
                            borderRadius: "10px",
                            border: `1px solid ${v.emailBorder ?? ""}`,
                            background: "rgba(20,18,15,.85)",
                            color: "#F0EEE9",
                            padding: "0 14px",
                            fontFamily: "Inter,sans-serif",
                            fontSize: "15px",
                            outline: "none",
                          }}
                        />
                        {v.emailErr ? (
                          <>
                            <span style={{ fontSize: "12px", color: "#E08A7A" }}>
                              Digite um e-mail válido, como nome@exemplo.com
                            </span>
                          </>
                        ) : null}
                      </label>
                      <button
                        className="nk-hover-1c8eb9m"
                        type="submit"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "50px",
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
                        Enviar link
                      </button>
                    </form>
                  </>
                ) : null}
                {v.m?.enviado ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "18px", alignItems: "flex-start" }}>
                      <span
                        style={{
                          width: "64px",
                          height: "64px",
                          borderRadius: "50%",
                          background: "rgba(219,175,87,.1)",
                          border: "1px solid rgba(219,175,87,.4)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#DBAF57" strokeWidth="1.8">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="m3 7 9 6 9-6" />
                        </svg>
                      </span>
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "40px",
                          lineHeight: "1",
                        }}
                      >
                        Confira seu e-mail
                      </h2>
                      <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "#B7B1A4" }}>
                        {"Se existir uma conta com "}
                        <span style={{ color: "#F0EEE9", fontWeight: "500" }}>{txt(v.emailShown)}</span>, você receberá
                        um link para criar uma nova senha. Ele vale por 30 minutos e só pode ser usado uma vez.
                      </p>
                      <button
                        className="nk-hover-1eosf2m"
                        onClick={v.toRedefinir}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          boxSizing: "border-box",
                          width: "100%",
                          height: "50px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          border: "1px solid rgba(219,175,87,.5)",
                          fontSize: "15px",
                          fontWeight: "600",
                          color: "#DBAF57",
                        }}
                      >
                        Simular: abri o link recebido
                      </button>
                      <button
                        className="nk-hover-1e3fwvz"
                        onClick={v.toEntrar}
                        style={{ all: "unset", cursor: "pointer", fontSize: "13px", color: "#B7B1A4" }}
                      >
                        Voltar para Entrar
                      </button>
                    </div>
                  </>
                ) : null}
                {v.m?.redefinir ? (
                  <>
                    <form
                      onSubmit={v.submitReset}
                      style={{ display: "flex", flexDirection: "column", gap: "18px" }}
                      noValidate
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
                          Nova senha
                        </h2>
                        <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                          Ao salvar, as outras sessões abertas da conta serão encerradas.
                        </span>
                      </div>
                      <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span style={{ fontSize: "13px", fontWeight: "500" }}>Nova senha</span>
                        <span style={{ position: "relative", display: "flex" }}>
                          <input
                            type={v.pwType}
                            autoComplete="new-password"
                            value={val(v.pw)}
                            onChange={v.onPw}
                            placeholder="Uma frase longa funciona bem"
                            style={{
                              flex: "1",
                              height: "48px",
                              borderRadius: "10px",
                              border: "1px solid rgba(240,238,233,.15)",
                              background: "rgba(20,18,15,.85)",
                              color: "#F0EEE9",
                              padding: "0 76px 0 14px",
                              fontFamily: "Inter,sans-serif",
                              fontSize: "15px",
                              outline: "none",
                            }}
                          />
                          <button
                            className="nk-hover-1d5grei"
                            type="button"
                            onClick={v.togglePw}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              position: "absolute",
                              right: "12px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              fontSize: "12px",
                              fontWeight: "600",
                              color: "#B7B1A4",
                            }}
                          >
                            {txt(v.pwToggleLabel)}
                          </button>
                        </span>
                        <span style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "4px" }}>
                          {asList(v.pwBars).map((b, $index) => (
                            <React.Fragment key={$index}>
                              <span style={{ height: "3px", borderRadius: "2px", background: `${b ?? ""}` }} />
                            </React.Fragment>
                          ))}
                        </span>
                        <span style={{ fontSize: "12px", color: `${v.pwMsgColor ?? ""}` }}>{txt(v.pwMsg)}</span>
                      </label>
                      <button
                        type="submit"
                        style={{
                          all: "unset",
                          cursor: `${v.resetCursor ?? ""}`,
                          height: "50px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "999px",
                          background: `${v.resetBg ?? ""}`,
                          color: "#1A1714",
                          fontSize: "15px",
                          fontWeight: "600",
                        }}
                      >
                        Salvar nova senha
                      </button>
                    </form>
                  </>
                ) : null}
                {v.m?.pronto ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "18px", alignItems: "flex-start" }}>
                      <span
                        style={{
                          width: "64px",
                          height: "64px",
                          borderRadius: "50%",
                          background: "rgba(159,199,154,.1)",
                          border: "1px solid rgba(159,199,154,.5)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#9FC79A" strokeWidth="2.2">
                          <path d="M5 12l5 5 9-10" />
                        </svg>
                      </span>
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "40px",
                          lineHeight: "1",
                        }}
                      >
                        Senha alterada
                      </h2>
                      <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.6", color: "#B7B1A4" }}>
                        Pronto. Use a nova senha para entrar. As outras sessões foram encerradas.
                      </p>
                      <button
                        className="nk-hover-1c8eb9m"
                        onClick={v.toEntrar}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          boxSizing: "border-box",
                          width: "100%",
                          height: "50px",
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
                        Ir para Entrar
                      </button>
                    </div>
                  </>
                ) : null}
                {v.m?.boas ? (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            letterSpacing: ".26em",
                            textTransform: "uppercase",
                            color: "#DBAF57",
                          }}
                        >
                          {"Etapa "}
                          {txt(v.stepN)}
                          {" de 2 · opcional"}
                        </span>
                        <a
                          className="nk-hover-1e3fwvz"
                          href="/"
                          onClick={v.finish}
                          style={{ fontSize: "13px", color: "#B7B1A4" }}
                        >
                          Pular tudo
                        </a>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                        <span style={{ height: "3px", borderRadius: "2px", background: "#DBAF57" }} />
                        <span style={{ height: "3px", borderRadius: "2px", background: `${v.step2Bar ?? ""}` }} />
                      </div>
                      {v.step1 ? (
                        <>
                          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
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
                                Que histórias você curte?
                              </h2>
                              <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                                Escolha alguns gêneros. Usamos isso para montar suas primeiras recomendações.
                              </span>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                              {asList(v.genreChips).map((g, $index) => (
                                <React.Fragment key={$index}>
                                  <button
                                    onClick={g?.pick}
                                    style={{
                                      all: "unset",
                                      cursor: "pointer",
                                      height: "40px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "0 16px",
                                      borderRadius: "999px",
                                      fontSize: "14px",
                                      border: `1px solid ${g?.border ?? ""}`,
                                      background: `${g?.bg ?? ""}`,
                                      color: `${g?.color ?? ""}`,
                                    }}
                                  >
                                    {txt(g?.label)}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : null}
                      {v.step2 ? (
                        <>
                          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
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
                                Comece sua lista
                              </h2>
                              <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                                Toque nas obras que você já acompanha ou quer ver. Elas entram como “Planejado”.
                              </span>
                            </div>
                            <div
                              style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "10px" }}
                            >
                              {asList(v.picks).map((p, $index) => (
                                <React.Fragment key={$index}>
                                  <button
                                    onClick={p?.pick}
                                    style={{
                                      all: "unset",
                                      cursor: "pointer",
                                      position: "relative",
                                      display: "block",
                                      aspectRatio: "2/3",
                                      borderRadius: "8px",
                                      overflow: "hidden",
                                      outline: `2px solid ${p?.ring ?? ""}`,
                                      outlineOffset: "2px",
                                    }}
                                  >
                                    {" "}
                                    <span
                                      role="img"
                                      aria-label={p?.title}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        height: "100%",
                                        backgroundImage: `${p?.bgImg ?? ""}`,
                                        backgroundSize: "cover",
                                        backgroundPosition: "center",
                                        opacity: `${p?.opacity ?? ""}`,
                                      }}
                                    />{" "}
                                    {p?.on ? (
                                      <>
                                        <span
                                          style={{
                                            position: "absolute",
                                            right: "6px",
                                            top: "6px",
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
                                            strokeWidth="3.5"
                                          >
                                            <path d="M5 12l5 5 9-10" />
                                          </svg>
                                        </span>
                                      </>
                                    ) : null}{" "}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : null}
                      <div style={{ display: "flex", gap: "10px" }}>
                        {v.step2 ? (
                          <>
                            <button
                              onClick={v.back}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                height: "50px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 22px",
                                borderRadius: "999px",
                                border: "1px solid rgba(240,238,233,.2)",
                                fontSize: "15px",
                                color: "#F0EEE9",
                              }}
                            >
                              Voltar
                            </button>
                          </>
                        ) : null}
                        <button
                          className="nk-hover-1c8eb9m"
                          onClick={v.next}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            flex: "1",
                            height: "50px",
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
                          {txt(v.nextLabel)}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "8px 20px",
                fontSize: "12px",
                color: "#8F897D",
              }}
            >
              <a className="nk-hover-1d5grei" href="#" style={{ color: "#8F897D" }}>
                Termos de Uso
              </a>
              <a className="nk-hover-1d5grei" href="#" style={{ color: "#8F897D" }}>
                Política de Privacidade
              </a>
              <a className="nk-hover-1d5grei" href="#" style={{ color: "#8F897D" }}>
                Ajuda
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const defaults = {};

export default defineDC("Entrar", EntrarLogic, render, { helmet });
