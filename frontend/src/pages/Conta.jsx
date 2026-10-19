// Origem: design/claude-design/Conta.dc.html (Claude Design).
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css, val } from "../dc/runtime";
import { api } from "../lib/api";
import { session } from "../lib/session";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { libraryApi } from "../features/library/libraryApi";
import { historyApi } from "../features/history/historyApi";

class ContaLogic extends DCLogic {
  state = {
    d: null,
    catalog: [],
    tab: "perfil",
    media: "todos",
    status: "todos",
    menuFor: null,
    histKind: "todos",
    removedH: [],
    confirmClear: false,
    ntab: "todas",
    read: [],
    reqType: "Anime",
    reqKind: "Adicionar ao catálogo",
    reqTitle: "",
    myReqs: [],
    sentId: null,
    cfgTab: "conta",
    cfg: {},
    toast: null,
  };
  TABS = ["perfil", "lista", "assistindo", "lendo", "historico", "notificacoes", "solicitacoes", "configuracoes"];
  ALIASES = { biblioteca: "lista", "continuar-assistindo": "assistindo", "continuar-lendo": "lendo" };
  accountAction = async (kind) => {
    try {
      if (kind === "name") {
        const displayName = window.prompt("Novo nome de exibição", session.user.name || "");
        if (!displayName) return;
        const me = await api.patch("/api/me", { displayName }); session.set(me);
        this.setState({ toast: "Nome de exibição atualizado." });
      } else if (kind === "password") {
        const currentPassword = window.prompt("Senha atual"); if (!currentPassword) return;
        const newPassword = window.prompt("Nova frase-senha (mínimo de 15 caracteres)"); if (!newPassword) return;
        await api.post("/api/me/change-password", { currentPassword, newPassword });
        this.setState({ toast: "Senha alterada; as outras sessões foram encerradas." });
      } else if (kind === "sessions") {
        const sessions = await api.get("/api/me/sessions");
        const others = sessions.filter((x) => !x.current);
        if (!others.length) return this.setState({ toast: "Somente esta sessão está conectada." });
        const answer = window.prompt(`Outras sessões: ${others.map((x, i) => `${i + 1}: ${new Date(x.lastAccess).toLocaleString("pt-BR")}`).join(" · ")}\nDigite o número para encerrar.`);
        const chosen = others[Number(answer) - 1]; if (!chosen) return;
        await api.del(`/api/me/sessions/${chosen.id}`); this.setState({ toast: "Sessão encerrada." });
      }
    } catch (e) { this.setState({ toast: e.message || "Não foi possível concluir." }); }
  };
  componentDidMount() {
    const p = new URLSearchParams(location.search);
    const a = this.ALIASES[p.get("aba")] || p.get("aba");
    const midia = p.get("midia");
    this.setState({
      tab: this.TABS.includes(a) ? a : "perfil",
      read: [],
      media: midia === "anime" ? "anim" : midia === "leitura" ? "leit" : "todos",
      status: p.get("situacao") || "todos",
      reqTitle: p.get("titulo") || "",
      reqWorkId: p.get("obra") ? Number(p.get("obra")) : null,
      reqKind:
        {
          faltando: "Episódios ou capítulos faltando",
          traducao: "Dublagem ou tradução",
          correcao: "Corrigir informações",
        }[p.get("pedido")] || "Adicionar ao catálogo",
      reqRef: "",
      reqNotes: "",
    });
    this.reload();
    api
      .get("/api/me/preferences")
      .then((cfg) => this.setState({ cfg: cfg || {} }))
      .catch(() => {});
    if (p.get("titulo") || p.get("obra")) this.checkReq();
  }
  /** Recarrega tudo que é pessoal; o Header é avisado pelo evento nk:personal. */
  reload() {
    return Promise.all([
      libraryApi.list({ size: 100 }).then((page) => page.items),
      api.get("/api/me/notifications"),
      historyApi.list(),
      api.get("/api/requests/mine"),
      libraryApi.favorites({ size: 12 }).then((page) => page.items),
    ])
      .then(([library, notifs, history, requests, favs]) => {
        this.setState({ d: { library, notifs, history, requests }, lib: library, favs });
        window.dispatchEvent(new Event("nk:personal"));
      })
      .catch(() => this.flash("Não foi possível carregar seus dados. Tente novamente."));
  }
  /** Executa uma ação no servidor e só então atualiza as telas. */
  act(promise, message) {
    this.setState({ menuFor: null });
    return promise
      .then(() => this.reload())
      .then(() => message && this.flash(message))
      .catch((e) => this.flash((e && e.body && e.body.message) || "Não foi possível concluir. Tente novamente."));
  }
  checkReq() {
    clearTimeout(this.ct);
    this.ct = setTimeout(() => {
      const s = this.state;
      const kind = this.kindCode(s.reqKind);
      const title = s.reqTitle.trim();
      if (kind === "ADD") {
        if (title.length < 3) return this.setState({ check: null });
        api
          .get(`/api/requests/check?kind=ADD&title=${encodeURIComponent(title)}`)
          .then((check) => this.setState({ check }))
          .catch(() => {});
      } else {
        // Pedidos de episódio, tradução ou correção precisam de uma obra do catálogo.
        const byId = s.reqWorkId ? api.get(`/api/catalog/works/${s.reqWorkId}`).then((w) => [w]) : null;
        (
          byId ||
          (title.length >= 2
            ? api.get(`/api/catalog/search?limit=1&q=${encodeURIComponent(title)}`)
            : Promise.resolve([]))
        )
          .then((found) => {
            const work = found[0] || null;
            if (!work) return this.setState({ check: { link: null } });
            return api.get(`/api/requests/check?kind=${kind}&workId=${work.id}`).then((c) =>
              this.setState({
                check: { link: work, request: c.request },
                reqTitle: this.state.reqTitle || work.title,
                reqType:
                  { anime: "Anime", filme: "Filme", manga: "Mangá" }[work.kind] ||
                  (work.webtoon ? "Webtoon" : "Manhwa"),
              }),
            );
          })
          .catch(() => {});
      }
    }, 300);
  }
  kindCode(label) {
    return (
      {
        "Adicionar ao catálogo": "ADD",
        "Episódios ou capítulos faltando": "MISSING",
        "Dublagem ou tradução": "DUB",
        "Corrigir informações": "FIX",
      }[label] || "ADD"
    );
  }
  go(tab) {
    this.setState({ tab, menuFor: null });
    try {
      history.replaceState(null, "", `?aba=${tab}`);
    } catch (e) {}
    window.scrollTo(0, 0);
  }
  flash(text) {
    clearTimeout(this.tt);
    this.setState({ toast: text });
    this.tt = setTimeout(() => this.setState({ toast: null }), 2200);
  }
  saveRead(read) {
    const all = this.state.d ? this.state.d.notifs : [];
    const prev = new Set(this.state.read);
    const req =
      read.length >= all.length
        ? api.post("/api/me/notifications/read-all")
        : Promise.all(read.filter((id) => !prev.has(id)).map((id) => api.post(`/api/me/notifications/${id}/read`)));
    this.setState({ read });
    req.then(() => window.dispatchEvent(new Event("nk:personal"))).catch(() => {});
  }
  setCfg(k, v) {
    const prev = this.state.cfg;
    const cfg = { ...prev, [k]: v };
    this.setState({ cfg });
    api
      .put("/api/me/preferences", cfg)
      .then(() => this.flash("Preferência salva"))
      .catch(() => {
        this.setState({ cfg: prev });
        this.flash("Não foi possível salvar. Tente novamente.");
      });
  }
  renderVals() {
    const s = this.state;
    const d = s.d;
    const lib = s.lib || [];
    const tab = s.tab;
    const t = {};
    this.TABS.forEach((k) => (t[k] = k === tab));
    const isAnim = (x) => x.kind === "anime" || x.kind === "filme";
    const typeLabel = (x) =>
      x.kind === "anime"
        ? "Anime"
        : x.kind === "filme"
          ? "Filme"
          : x.kind === "manga"
            ? "Mangá"
            : x.webtoon
              ? "Manhwa · Webtoon"
              : "Manhwa";
    const readSet = new Set(s.read);
    const isRead = (n) => n.read || readSet.has(n.id);
    const notifsAll = d ? d.notifs : [];
    const unread = notifsAll.filter((n) => !isRead(n)).length;
    const P = {
      user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
      list: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
      play: "M7 4l13 8-13 8z",
      book: "M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z",
      clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
      bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
      req: "M12 8v8M8 12h8M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
      gear: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
      chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
      shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    };
    const item = (k, label, icon, badge) => ({
      label,
      icon,
      href: `?aba=${k}`,
      go: (e) => {
        e.preventDefault();
        this.go(k);
      },
      bg: k === tab ? "#1E1B18" : "transparent",
      color: k === tab ? "#DBAF57" : "#F0EEE9",
      line: k === tab ? "#DBAF57" : "transparent",
      hasBadge: !!badge,
      badge,
    });
    const nav = [
      { label: "", hasLabel: false, pad: "0px", items: [item("perfil", "Meu perfil", P.user)] },
      {
        label: "Minha biblioteca",
        hasLabel: true,
        pad: "14px",
        items: [
          item("lista", "Minha lista", P.list),
          item("assistindo", "Continuar assistindo", P.play),
          item("lendo", "Continuar lendo", P.book),
          item("historico", "Histórico", P.clock),
        ],
      },
      {
        label: "Atividade",
        hasLabel: true,
        pad: "14px",
        items: [
          item("notificacoes", "Notificações", P.bell, unread || null),
          item("solicitacoes", "Solicitar obra", P.req),
        ],
      },
      { label: "Conta", hasLabel: true, pad: "14px", items: [item("configuracoes", "Configurações", P.gear)] },
    ];
    // perfil
    const hist = d ? d.history : [];
    const stats = [
      { n: lib.filter(isAnim).length, label: "Animes" },
      { n: lib.filter((x) => !isAnim(x)).length, label: "Leituras" },
      { n: lib.filter((x) => x.status === "concluido").length, label: "Concluídos" },
      { n: 28, label: "Avaliações" },
    ];
    const favorites = (s.favs || lib.filter((x) => x.favorite)).slice(0, 6);
    const recentActivity = hist
      .flatMap((g) => g.items.map((i) => ({ ...i, day: g.day, verb: isAnim(i) ? "Assistiu" : "Leu" })))
      .slice(0, 4);
    const pb = lib.find((x) => x.banner);
    // lista
    const ST = [
      ["andamento", "Em andamento", "#DBAF57"],
      ["planejado", "Planejado", "#B7B1A4"],
      ["concluido", "Concluído", "#9FC79A"],
      ["pausado", "Pausado", "#D9B98A"],
      ["abandonado", "Abandonado", "#E08A7A"],
    ];
    const stMap = Object.fromEntries(ST.map(([k, l, c]) => [k, { l, c }]));
    const byMedia = lib.filter((x) => s.media === "todos" || (s.media === "anim" ? isAnim(x) : !isAnim(x)));
    const libItems = byMedia
      .filter((x) => s.status === "todos" || x.status === s.status)
      .map((x) => {
        const anim = isAnim(x);
        // Textos derivados do progresso real: sem registro, a obra "ainda não começou".
        const unitText = anim ? `Ep. ${x.ep}` : `Cap. ${x.ch}`;
        const started = x.hasProgress;
        const progress = !started
          ? "Ainda não começou"
          : x.done
            ? `Em dia · ${unitText}`
            : x.resume && x.resume.state === "NEXT"
              ? `Próximo: ${unitText}`
              : anim
                ? `${unitText}${x.of ? ` de ${x.of}` : ""}`
                : unitText;
        const cta = !started
          ? x.status === "planejado" || x.status === "andamento"
            ? anim
              ? "Começar a assistir"
              : "Começar a ler"
            : "Ver obra"
          : x.status === "concluido" || x.done
            ? "Ver obra"
            : anim
              ? "Continuar assistindo"
              : "Continuar lendo";
        return {
          ...x,
          statusLabel: stMap[x.status].l,
          statusColor: stMap[x.status].c,
          progress,
          cta,
          hasPct: !!x.pct && x.status !== "concluido",
          pctW: `${x.pct || 0}%`,
          menuOpen: s.menuFor === x.id + x.kind,
          menu: () => this.setState({ menuFor: s.menuFor === x.id + x.kind ? null : x.id + x.kind }),
          ctaHref: !started || x.status === "concluido" || x.done ? x.href : x.unitHref,
          moves: ST.filter(([k]) => k !== x.status).map(([k, l]) => ({
            label: l,
            color: "#F0EEE9",
            pick: () => this.act(libraryApi.setStatus(x.publicId, k), `Movido para ${l}`),
          })),
          actions: [
            {
              label: x.favorite ? "Remover dos favoritos" : "Marcar como favorito",
              pick: () =>
                this.act(
                  libraryApi.favorite(x.publicId, !x.favorite),
                  x.favorite ? "Removido dos favoritos" : "Adicionado aos favoritos",
                ),
            },
            {
              label: x.follow ? "Desativar alertas de lançamento" : "Ativar alertas de lançamento",
              pick: () =>
                this.act(
                  libraryApi.follow(x.publicId, !x.follow),
                  x.follow ? "Alertas desativados" : "Você será avisado de novos lançamentos",
                ),
            },
            {
              label: "Atualizar progresso na ficha",
              pick: () => (location.href = x.href),
            },
            { label: "Ver obra", pick: () => (location.href = x.href) },
          ],
          remove: () => {
            if (!window.confirm(`Remover "${x.title}" da sua lista? O progresso e o histórico continuam salvos.`))
              return this.setState({ menuFor: null });
            this.act(libraryApi.remove(x.publicId), "Removido da lista · histórico e progresso mantidos");
          },
        };
      });
    const chip = (on) => ({
      bg: on ? "rgba(219,175,87,.14)" : "transparent",
      border: on ? "#DBAF57" : "rgba(240,238,233,.14)",
      color: on ? "#DBAF57" : "#F0EEE9",
    });
    const pill = (on) => ({ bg: on ? "#DBAF57" : "transparent", color: on ? "#1A1714" : "#F0EEE9" });
    const mediaChips = [
      ["todos", "Todos"],
      ["anim", "Animações"],
      ["leit", "Leituras"],
    ].map(([k, l]) => ({ label: l, ...pill(s.media === k), pick: () => this.setState({ media: k }) }));
    const statusChips = [["todos", "Todas"], ...ST.map(([k, l]) => [k, l])].map(([k, l]) => ({
      label: l,
      count: k === "todos" ? byMedia.length : byMedia.filter((x) => x.status === k).length,
      ...chip(s.status === k),
      pick: () => this.setState({ status: k }),
    }));
    // assistindo / lendo
    // Calculados a partir do progresso real (não são listas manuais).
    const watching = lib
      .filter((x) => isAnim(x) && x.status === "andamento" && x.hasProgress && !x.done)
      .map((x) => ({ ...x, thumb: x.banner || x.cover, pctW: `${x.pct}%` }));
    const waiting = lib.filter((x) => isAnim(x) && x.status === "andamento" && x.done);
    const reading = lib
      .filter((x) => !isAnim(x) && x.status === "andamento" && x.hasProgress && !x.done)
      .map((x) => ({ ...x, typeLabel: typeLabel(x), pctW: `${x.pct}%` }));
    // historico
    const rm = new Set(s.removedH);
    const history = s.cleared
      ? []
      : hist
          .map((g) => ({
            day: g.day,
            items: g.items
              .filter(
                (i) => !rm.has(i.hid) && (s.histKind === "todos" || (s.histKind === "vis" ? isAnim(i) : !isAnim(i))),
              )
              .map((i) => ({
                ...i,
                remove: () => {
                  this.setState({ removedH: [...s.removedH, i.hid] });
                  this.act(historyApi.remove(i.hid), "Removido do histórico");
                },
              })),
          }))
          .filter((g) => g.items.length);
    const histChips = [
      ["todos", "Todos"],
      ["vis", "Assistidos"],
      ["lid", "Lidos"],
    ].map(([k, l]) => ({ label: l, ...pill(s.histKind === k), pick: () => this.setState({ histKind: k }) }));
    // notificacoes
    const ICON = { chat: P.chat, req: P.req, shield: P.shield };
    const notifs = notifsAll
      .filter((n) => s.ntab === "todas" || n.cat === s.ntab)
      .map((n) => {
        const r = isRead(n);
        return {
          ...n,
          hasCover: !!n.cover,
          hasIcon: !n.cover,
          iconPath: ICON[n.icon] || P.req,
          weight: r ? 400 : 600,
          bg: r ? "transparent" : "rgba(219,175,87,.06)",
          dot: r ? "transparent" : "#DBAF57",
          open: (e) => {
            if (n.href === "#") e.preventDefault();
            if (!r) this.saveRead([...s.read, n.id]);
          },
        };
      });
    const notifChips = [
      ["todas", "Todas"],
      ["lanc", "Lançamentos"],
      ["com", "Comunidade"],
      ["sis", "Sistema"],
    ].map(([k, l]) => ({ label: l, ...pill(s.ntab === k), pick: () => this.setState({ ntab: k }) }));
    // solicitacoes
    const SC = {
      Recebida: "#B7B1A4",
      "Em análise": "#D9B98A",
      "Aguardando disponibilidade": "#D9B98A",
      Aprovada: "#DBAF57",
      Programada: "#DBAF57",
      Atendida: "#9FC79A",
      "Não atendida": "#E08A7A",
      Cancelada: "#8F897D",
    };
    // Barra de etapas: recebida → análise → aprovada/programada → atendida
    const stepOf = {
      Recebida: 0,
      "Em análise": 1,
      "Aguardando disponibilidade": 1,
      Aprovada: 2,
      Programada: 2,
      Atendida: 3,
      "Não atendida": 1,
      Cancelada: 0,
    };
    const requests = (d ? d.requests : []).map((r) => {
      const idx = stepOf[r.status] ?? 0;
      const bad = r.status === "Não atendida" || r.status === "Cancelada";
      return {
        ...r,
        color: SC[r.status],
        hasReason: !!r.reason,
        footNote: !r.mine
          ? "Você também quer esta obra"
          : r.supporters
            ? `+${r.supporters} ${r.supporters === 1 ? "pessoa também quer" : "pessoas também querem"}`
            : r.kindLabel,
        steps: [0, 1, 2, 3].map((i) => (i <= idx ? (bad ? "#E08A7A" : "#DBAF57") : "rgba(240,238,233,.12)")),
      };
    });
    const kind = this.kindCode(s.reqKind);
    const ck = s.check || {};
    // ADD: obra já existente bloqueia; demais tipos: o pedido é ligado à obra encontrada.
    const m = kind === "ADD" ? ck.work : ck.link;
    const dupReq = ck.request || null;
    const nq = s.reqTitle.trim().toLowerCase();
    const canSend = !s.sending && !dupReq && (kind === "ADD" ? nq.length >= 2 && !m : !!m);
    // configuracoes
    const c = s.cfg;
    const val = (k, dflt) => c[k] ?? dflt;
    const CFG = {
      conta: [
        {
          label: "Nome de exibição",
          desc: `${session.user.name || ""} · aparece no perfil e nos comentários`,
          action: "Alterar",
          act: () => this.accountAction("name"),
        },
        {
          label: "E-mail",
          desc: `${(session.user.email || "").replace(/^(.)[^@]*/, "$1•••••")} · exige confirmação por e-mail`,
          action: "Em preparação",
          disabled: true,
        },
        { label: "Senha", desc: "Use uma frase-senha com pelo menos 15 caracteres", action: "Alterar senha", act: () => this.accountAction("password") },
        { label: "Sessões conectadas", desc: "Consulte e encerre outras sessões reais", action: "Gerenciar", act: () => this.accountAction("sessions") },
        {
          label: "Verificação em duas etapas",
          desc: "Pede um código ao entrar em um novo dispositivo",
          action: "Ainda indisponível",
          disabled: true,
        },
      ],
      play: [
        {
          key: "autoplay",
          label: "Reproduzir próximo episódio",
          desc: "Começa o próximo episódio automaticamente",
          d: true,
        },
        { key: "skip", label: "Pular abertura e encerramento", desc: "Quando o episódio tiver marcações", d: false },
        {
          key: "audio",
          label: "Áudio preferido",
          desc: "Usado quando houver mais de uma opção",
          opts: ["Japonês", "Português"],
          d: "Japonês",
        },
        {
          key: "subs",
          label: "Legendas",
          desc: "Idioma padrão das legendas",
          opts: ["PT-BR", "Inglês", "Desligadas"],
          d: "PT-BR",
        },
        {
          key: "reader",
          label: "Modo de leitura de mangás",
          desc: "Webtoons sempre abrem em rolagem vertical",
          opts: ["Páginas", "Vertical"],
          d: "Páginas",
        },
        {
          key: "dir",
          label: "Direção das páginas",
          desc: "Oriental lê da direita para a esquerda",
          opts: ["Oriental", "Ocidental"],
          d: "Oriental",
        },
      ],
      notif: [
        { key: "nEp", label: "Novos episódios", desc: "Das obras com alerta ativado na sua lista", d: true },
        { key: "nCh", label: "Novos capítulos", desc: "Mangás, manhwas e webtoons acompanhados", d: true },
        { key: "nSched", label: "Mudanças de programação", desc: "Adiamentos e novos horários", d: true },
        { key: "nCom", label: "Respostas e menções", desc: "Prévias sempre sem spoilers", d: true },
        { key: "nReq", label: "Solicitações de obras", desc: "Quando um pedido seu mudar de situação", d: true },
        { key: "nRec", label: "Recomendações", desc: "Sugestões ocasionais com base no que você vê e lê", d: false },
      ],
      priv: [
        { key: "pub", label: "Perfil público", desc: "Outros usuários podem ver seu perfil", d: true },
        { key: "pubList", label: "Mostrar minha lista", desc: "Exibe a lista no perfil público", d: true },
        { key: "pubHist", label: "Mostrar atividade recente", desc: "O histórico é privado por padrão", d: false },
        { label: "Usuários bloqueados", desc: "Nenhum usuário bloqueado", action: "Ver lista" },
      ],
      apar: [
        {
          key: "motion",
          label: "Reduzir animações",
          desc: "Desliga transições do destaque e efeitos de rolagem",
          d: false,
        },
        {
          key: "cards",
          label: "Densidade dos cards",
          desc: "Quantidade de obras por linha nas grades",
          opts: ["Confortável", "Compacta"],
          d: "Confortável",
        },
      ],
    };
    const cfgRows = (CFG[s.cfgTab] || []).map((r) => {
      if (r.action) return { ...r, isAction: true };
      if (r.opts)
        return {
          ...r,
          isSeg: true,
          opts: r.opts.map((o) => ({ label: o, ...pill(val(r.key, r.d) === o), pick: () => this.setCfg(r.key, o) })),
        };
      const on = !!val(r.key, r.d);
      return {
        ...r,
        isToggle: true,
        on: String(on),
        track: on ? "#DBAF57" : "#2D2924",
        knob: on ? "#1A1714" : "#B7B1A4",
        knobX: on ? "23px" : "3px",
        toggle: () => this.setCfg(r.key, !on),
      };
    });
    const cfgTabs = [
      ["conta", "Conta e segurança"],
      ["play", "Reprodução e leitura"],
      ["notif", "Notificações"],
      ["priv", "Privacidade"],
      ["apar", "Aparência"],
    ].map(([k, l]) => ({
      label: l,
      color: s.cfgTab === k ? "#DBAF57" : "#B7B1A4",
      line: s.cfgTab === k ? "#DBAF57" : "transparent",
      pick: () => this.setState({ cfgTab: k }),
    }));
    return {
      me: { initial: session.user.initial, name: session.user.name, handle: "@" + (session.user.username || "") },
      t,
      nav,
      stats,
      favorites,
      recentActivity,
      hasProfileBanner: !!pb,
      profileBanner: pb ? pb.banner : "",
      mediaChips,
      statusChips,
      libItems,
      libEmpty: !!d && libItems.length === 0,
      watching,
      waiting,
      hasWaiting: waiting.length > 0,
      reading,
      history,
      histChips,
      histEmpty: !!d && history.length === 0,
      confirmClear: s.confirmClear,
      askClear: () => this.setState({ confirmClear: true }),
      cancelClear: () => this.setState({ confirmClear: false }),
      doClear: () => {
        this.setState({ confirmClear: false });
        this.act(historyApi.clear(), "Histórico apagado · lista e progresso mantidos");
      },
      notifs,
      notifChips,
      unreadText: unread ? `${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Tudo em dia",
      markAll: () => this.saveRead(notifsAll.map((n) => n.id)),
      reqTypes: ["Anime", "Filme", "Mangá", "Manhwa", "Webtoon"].map((l) => ({
        label: l,
        ...chip(s.reqType === l),
        pick: () => this.setState({ reqType: l }),
      })),
      reqKinds: [
        "Adicionar ao catálogo",
        "Episódios ou capítulos faltando",
        "Dublagem ou tradução",
        "Corrigir informações",
      ].map((l) => ({
        label: l,
        ...chip(s.reqKind === l),
        pick: () => {
          this.setState({ reqKind: l, check: null, reqError: null });
          this.checkReq();
        },
      })),
      reqTitle: s.reqTitle,
      onReqTitle: (e) => {
        this.setState({ reqTitle: e.target.value, sentId: null, reqWorkId: null, reqError: null });
        this.checkReq();
      },
      reqRef: s.reqRef,
      onReqRef: (e) => this.setState({ reqRef: e.target.value }),
      reqNotes: s.reqNotes,
      onReqNotes: (e) => this.setState({ reqNotes: e.target.value }),
      hasMatch: !!m,
      matchLabel: kind === "ADD" ? "Já está no catálogo" : "O pedido será ligado a esta obra",
      match: m ? { ...m, href: m.href || `/explorar?q=${encodeURIComponent(m.title)}` } : {},
      hasDupReq: !!dupReq,
      dupReq: dupReq
        ? {
            ...dupReq,
            canSupport: !dupReq.mine && !dupReq.supporting,
            supportersText: `${(dupReq.supporters || 0) + 1} ${(dupReq.supporters || 0) + 1 === 1 ? "pessoa quer" : "pessoas querem"}`,
          }
        : {},
      supportDup: () =>
        api
          .post(`/api/requests/${dupReq.numId}/support`)
          .then(() => {
            this.setState({ check: null, reqTitle: "" });
            this.flash("Interesse registrado · você será avisado das mudanças");
            this.reload();
          })
          .catch(() => this.flash("Não foi possível registrar. Tente novamente.")),
      sendBg: canSend ? "#DBAF57" : "#4A443D",
      sendCursor: canSend ? "pointer" : "not-allowed",
      sendLabel: s.sending ? "Enviando…" : "Enviar solicitação",
      reqError: s.reqError || null,
      sendReq: () => {
        if (!canSend) return;
        const details = [s.reqRef.trim() && `Referência: ${s.reqRef.trim()}`, s.reqNotes.trim()]
          .filter(Boolean)
          .join("\n");
        this.setState({ sending: true, reqError: null });
        api
          .post("/api/requests", {
            media: s.reqType,
            kind,
            title: s.reqTitle.trim(),
            workId: kind === "ADD" ? null : m.id,
            details,
          })
          .then((r) => {
            // Só limpa o formulário depois da confirmação do servidor.
            this.setState({
              sending: false,
              reqTitle: "",
              reqRef: "",
              reqNotes: "",
              check: null,
              sentId: r.id,
              sentHref: r.href,
            });
            this.reload();
          })
          .catch((e) => {
            if (e.status === 409 && e.body)
              this.setState({ sending: false, check: { work: e.body.work, link: m, request: e.body.request } });
            else
              this.setState({
                sending: false,
                reqError:
                  (e.body && e.body.message) || "Falha de conexão. Seus dados continuam no formulário; tente de novo.",
              });
          });
      },
      sent: !!s.sentId,
      sentId: s.sentId,
      sentHref: s.sentHref,
      requests,
      cfgTabs,
      cfgRows,
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
    text: "\nbody{margin:0;background:#171411;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\ninput::placeholder,textarea::placeholder{color:#8F897D}\n",
  },
];

function render(v) {
  return (
    <>
      <div style={{ minHeight: "100vh", background: "#171411", display: "flex", flexDirection: "column" }}>
        <Header
          active=""
          solid={true}
          __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
        />
        <div
          className="nk-conta"
          style={{
            padding: "108px 48px 80px",
            display: "grid",
            gridTemplateColumns: "250px minmax(0,1fr)",
            gap: "48px",
            alignItems: "start",
            flex: "1",
          }}
        >
          <aside
            className="nk-conta-nav"
            style={{ position: "sticky", top: "88px", display: "flex", flexDirection: "column", gap: "6px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "6px 10px 16px" }}>
              <span
                style={{
                  width: "46px",
                  height: "46px",
                  borderRadius: "50%",
                  border: "1px solid rgba(219,175,87,.5)",
                  background: "#2D2924",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: "22px",
                  color: "#DBAF57",
                }}
              >
                {txt(v.me?.initial)}
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "15px", fontWeight: "600" }}>{txt(v.me?.name)}</span>
                <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(v.me?.handle)}</span>
              </span>
            </div>
            {asList(v.nav).map((g, $index) => (
              <React.Fragment key={$index}>
                <div
                  className="nk-conta-group"
                  style={{ display: "flex", flexDirection: "column", paddingTop: `${g?.pad ?? ""}` }}
                >
                  {g?.hasLabel ? (
                    <>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "600",
                          letterSpacing: ".22em",
                          textTransform: "uppercase",
                          color: "#8F897D",
                          padding: "6px 12px",
                        }}
                      >
                        {txt(g?.label)}
                      </span>
                    </>
                  ) : null}
                  {asList(g?.items).map((i, $index) => (
                    <React.Fragment key={$index}>
                      <a
                        className="nk-conta-link nk-hover-1ud7yf8"
                        href={i?.href}
                        onClick={i?.go}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          height: "40px",
                          padding: "0 12px",
                          borderRadius: "9px",
                          fontSize: "14px",
                          fontWeight: "500",
                          background: `${i?.bg ?? ""}`,
                          color: `${i?.color ?? ""}`,
                          borderLeft: `2px solid ${i?.line ?? ""}`,
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
                          style={{ flexShrink: "0" }}
                        >
                          <path d={i?.icon} />
                        </svg>
                        <span style={{ flex: "1" }}>{txt(i?.label)}</span>
                        {i?.hasBadge ? (
                          <>
                            <span
                              style={{
                                minWidth: "20px",
                                height: "20px",
                                padding: "0 6px",
                                borderRadius: "999px",
                                background: "#DBAF57",
                                color: "#1A1714",
                                fontSize: "11px",
                                fontWeight: "700",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {txt(i?.badge)}
                            </span>
                          </>
                        ) : null}
                      </a>
                    </React.Fragment>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </aside>
          <main style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "28px" }}>
            {v.t?.perfil ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
                  <div
                    style={{
                      position: "relative",
                      borderRadius: "16px",
                      overflow: "hidden",
                      border: "1px solid rgba(219,175,87,.15)",
                      background: "#1A1714",
                    }}
                  >
                    {" "}
                    <div style={{ position: "relative", height: "200px" }}>
                      {" "}
                      {v.hasProfileBanner ? (
                        <>
                          <img
                            src={v.profileBanner}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        </>
                      ) : null}{" "}
                      <span
                        style={{
                          position: "absolute",
                          inset: "0",
                          background: "linear-gradient(0deg,#1A1714,rgba(26,23,20,.2))",
                        }}
                      />{" "}
                    </div>{" "}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "flex-end",
                        gap: "20px 28px",
                        padding: "0 28px 28px",
                        marginTop: "-48px",
                        position: "relative",
                      }}
                    >
                      <span
                        style={{
                          width: "104px",
                          height: "104px",
                          borderRadius: "50%",
                          border: "2px solid #DBAF57",
                          background: "#2D2924",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontSize: "48px",
                          color: "#DBAF57",
                          flexShrink: "0",
                        }}
                      >
                        {txt(v.me?.initial)}
                      </span>
                      <div
                        style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1", minWidth: "200px" }}
                      >
                        <span
                          style={{
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: "40px",
                            fontWeight: "500",
                            lineHeight: "1",
                          }}
                        >
                          {txt(v.me?.name)}
                        </span>
                        <span style={{ fontSize: "14px", color: "#B7B1A4" }}>{txt(v.me?.handle)}</span>
                      </div>
                      <button
                        className="nk-hover-ucdklh"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "40px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 18px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.25)",
                          fontSize: "14px",
                        }}
                      >
                        Editar perfil
                      </button>
                    </div>{" "}
                    <div
                      className="nk-grid-2"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                        borderTop: "1px solid rgba(240,238,233,.07)",
                      }}
                    >
                      {asList(v.stats).map((s, $index) => (
                        <React.Fragment key={$index}>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                              padding: "18px 28px",
                              borderRight: "1px solid rgba(240,238,233,.07)",
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "'Cormorant Garamond',serif",
                                fontSize: "34px",
                                fontWeight: "500",
                                lineHeight: "1",
                                color: "#DBAF57",
                              }}
                            >
                              {txt(s?.n)}
                            </span>
                            <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(s?.label)}</span>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>{" "}
                  </div>
                  <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "32px",
                        }}
                      >
                        Obras favoritas
                      </h2>
                      <span style={{ fontSize: "12px", color: "#B7B1A4" }}>Visível no perfil público</span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))",
                        gap: "16px",
                      }}
                    >
                      {asList(v.favorites).map((f, $index) => (
                        <React.Fragment key={$index}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <img
                              src={f?.cover}
                              alt=""
                              style={{
                                width: "100%",
                                aspectRatio: "2/3",
                                objectFit: "cover",
                                borderRadius: "10px",
                                display: "block",
                                border: "1px solid rgba(240,238,233,.06)",
                              }}
                            />
                            <span
                              style={{
                                fontSize: "13px",
                                fontWeight: "500",
                                lineHeight: "1.35",
                                display: "-webkit-box",
                                WebkitLineClamp: "2",
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {txt(f?.title)}
                            </span>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </section>
                  <section style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "space-between",
                        marginBottom: "10px",
                      }}
                    >
                      <h2
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "32px",
                        }}
                      >
                        Atividade recente
                      </h2>
                      <span style={{ fontSize: "12px", color: "#B7B1A4" }}>Só você vê · altere em Privacidade</span>
                    </div>
                    {asList(v.recentActivity).map((h, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "14px",
                            padding: "10px 0",
                            borderBottom: "1px solid rgba(240,238,233,.06)",
                          }}
                        >
                          <img
                            src={h?.cover}
                            alt=""
                            style={{
                              width: "36px",
                              height: "52px",
                              objectFit: "cover",
                              borderRadius: "4px",
                              display: "block",
                            }}
                          />
                          <span style={{ flex: "1", fontSize: "14px" }}>
                            {txt(h?.verb)} <span style={{ color: "#DBAF57" }}>{txt(h?.unit)}</span>
                            {" de "}
                            {txt(h?.title)}
                          </span>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(h?.day)}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </section>
                </div>
              </>
            ) : null}
            {v.t?.lista ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h1
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "48px",
                        lineHeight: "1",
                      }}
                    >
                      Minha lista
                    </h1>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                      Cada obra aparece uma vez, com a situação e o progresso dela.
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "12px 24px",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      className="nk-scroll-x"
                      style={{
                        display: "flex",
                        gap: "4px",
                        padding: "4px",
                        borderRadius: "999px",
                        background: "#1A1714",
                        border: "1px solid rgba(240,238,233,.08)",
                      }}
                    >
                      {asList(v.mediaChips).map((c, $index) => (
                        <React.Fragment key={$index}>
                          <button
                            onClick={c?.pick}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              height: "34px",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 16px",
                              borderRadius: "999px",
                              fontSize: "13px",
                              fontWeight: "500",
                              background: `${c?.bg ?? ""}`,
                              color: `${c?.color ?? ""}`,
                            }}
                          >
                            {txt(c?.label)}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {asList(v.statusChips).map((c, $index) => (
                        <React.Fragment key={$index}>
                          <button
                            onClick={c?.pick}
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
                              border: `1px solid ${c?.border ?? ""}`,
                              background: `${c?.bg ?? ""}`,
                              color: `${c?.color ?? ""}`,
                            }}
                          >
                            {txt(c?.label)}
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", opacity: ".7" }}>
                              {txt(c?.count)}
                            </span>
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                      gap: "28px 18px",
                    }}
                  >
                    {asList(v.libItems).map((w, $index) => (
                      <React.Fragment key={$index}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", position: "relative" }}>
                          <div
                            style={{
                              position: "relative",
                              aspectRatio: "2/3",
                              borderRadius: "10px",
                              overflow: "hidden",
                              border: "1px solid rgba(240,238,233,.06)",
                              background: "#221F1B",
                            }}
                          >
                            {" "}
                            <img
                              src={w?.cover}
                              alt=""
                              loading="lazy"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />{" "}
                            <span
                              style={{
                                position: "absolute",
                                left: "8px",
                                top: "8px",
                                fontSize: "10px",
                                fontWeight: "600",
                                letterSpacing: ".12em",
                                textTransform: "uppercase",
                                padding: "4px 7px",
                                borderRadius: "4px",
                                background: "rgba(23,20,17,.9)",
                                color: `${w?.statusColor ?? ""}`,
                              }}
                            >
                              {txt(w?.statusLabel)}
                            </span>{" "}
                            <button
                              className="nk-hover-1d5grei"
                              onClick={w?.menu}
                              aria-label="Mais opções"
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                position: "absolute",
                                right: "8px",
                                top: "8px",
                                width: "28px",
                                height: "28px",
                                borderRadius: "50%",
                                background: "rgba(23,20,17,.9)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#F0EEE9",
                                fontSize: "16px",
                                lineHeight: "1",
                              }}
                            >
                              ⋯
                            </button>{" "}
                            {w?.hasPct ? (
                              <>
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
                                      width: `${w?.pctW ?? ""}`,
                                      background: "#DBAF57",
                                    }}
                                  />
                                </span>
                              </>
                            ) : null}{" "}
                          </div>
                          {w?.menuOpen ? (
                            <>
                              <div
                                className="nk-sheet"
                                style={{
                                  position: "absolute",
                                  right: "0",
                                  top: "42px",
                                  zIndex: "5",
                                  width: "200px",
                                  background: "#1A1714",
                                  border: "1px solid rgba(219,175,87,.25)",
                                  borderRadius: "10px",
                                  padding: "6px",
                                  boxShadow: "0 16px 32px rgba(0,0,0,.5)",
                                  display: "flex",
                                  flexDirection: "column",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "10px",
                                    letterSpacing: ".2em",
                                    textTransform: "uppercase",
                                    color: "#8F897D",
                                    padding: "6px 8px",
                                  }}
                                >
                                  Mover para
                                </span>
                                {asList(w?.moves).map((m, $index) => (
                                  <React.Fragment key={$index}>
                                    <button
                                      className="nk-hover-zuhwcw"
                                      onClick={m?.pick}
                                      style={{
                                        all: "unset",
                                        cursor: "pointer",
                                        padding: "8px",
                                        borderRadius: "6px",
                                        fontSize: "13px",
                                        color: `${m?.color ?? ""}`,
                                      }}
                                    >
                                      {txt(m?.label)}
                                    </button>
                                  </React.Fragment>
                                ))}
                                <span style={{ height: "1px", background: "rgba(240,238,233,.08)", margin: "4px" }} />
                                {asList(w?.actions).map((m, $index) => (
                                  <React.Fragment key={"a" + $index}>
                                    <button
                                      className="nk-hover-zuhwcw"
                                      onClick={m?.pick}
                                      style={{
                                        all: "unset",
                                        cursor: "pointer",
                                        padding: "8px",
                                        borderRadius: "6px",
                                        fontSize: "13px",
                                        color: "#F0EEE9",
                                      }}
                                    >
                                      {txt(m?.label)}
                                    </button>
                                  </React.Fragment>
                                ))}
                                <span style={{ height: "1px", background: "rgba(240,238,233,.08)", margin: "4px" }} />
                                <button
                                  className="nk-hover-zuhwcw"
                                  onClick={w?.remove}
                                  style={{
                                    all: "unset",
                                    cursor: "pointer",
                                    padding: "8px",
                                    borderRadius: "6px",
                                    fontSize: "13px",
                                    color: "#E08A7A",
                                  }}
                                >
                                  Remover da lista
                                </button>
                              </div>
                            </>
                          ) : null}
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
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
                              {txt(w?.title)}
                            </span>
                            <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(w?.progress)}</span>
                            <a href={w?.ctaHref} style={{ fontSize: "13px", fontWeight: "600", marginTop: "2px" }}>
                              {txt(w?.cta)}
                            </a>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  {v.libEmpty ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "12px",
                          padding: "48px",
                          borderRadius: "16px",
                          border: "1px dashed rgba(219,175,87,.25)",
                          textAlign: "center",
                        }}
                      >
                        <img
                          src="/assets/nekoflow-mascot.png"
                          alt=""
                          style={{ width: "96px", height: "96px", objectFit: "contain" }}
                        />
                        <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "26px" }}>
                          Nada nesta situação
                        </span>
                        <a href="/explorar" style={{ fontSize: "14px", fontWeight: "600" }}>
                          Encontrar obras no Explorar →
                        </a>
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
            {v.t?.assistindo ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h1
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "48px",
                        lineHeight: "1",
                      }}
                    >
                      Continuar assistindo
                    </h1>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                      Episódios começados, do mais recente para o mais antigo. Sincronizado entre dispositivos.
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {asList(v.watching).map((w, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "16px 24px",
                            padding: "18px 0",
                            borderBottom: "1px solid rgba(240,238,233,.07)",
                          }}
                        >
                          <div
                            className="nk-full"
                            style={{
                              position: "relative",
                              width: "240px",
                              aspectRatio: "16/9",
                              borderRadius: "10px",
                              overflow: "hidden",
                              flexShrink: "0",
                              background: "#221F1B",
                            }}
                          >
                            {" "}
                            <img
                              src={w?.thumb}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />{" "}
                            <span
                              style={{
                                position: "absolute",
                                left: "0",
                                right: "0",
                                bottom: "0",
                                height: "4px",
                                background: "rgba(240,238,233,.2)",
                              }}
                            >
                              <span
                                style={{
                                  display: "block",
                                  height: "100%",
                                  width: `${w?.pctW ?? ""}`,
                                  background: "#DBAF57",
                                }}
                              />
                            </span>{" "}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                              flex: "1",
                              minWidth: "200px",
                            }}
                          >
                            <span style={{ fontSize: "17px", fontWeight: "500" }}>{txt(w?.title)}</span>
                            <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                              {"Episódio "}
                              {txt(w?.ep)}
                              {" de "}
                              {txt(w?.of)}
                              {" · "}
                              <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                                {txt(w?.t)}
                                {" / "}
                                {txt(w?.d)}
                              </span>
                            </span>
                            <span style={{ fontSize: "12px", color: "#8F897D" }}>
                              {"Visto "}
                              {txt(w?.last)}
                            </span>
                          </div>
                          <a
                            className="nk-hover-1uijps0"
                            href={w?.unitHref}
                            style={{
                              height: "44px",
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "0 22px",
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
                            {"Retomar ep. "}
                            {txt(w?.ep)}
                          </a>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  {v.hasWaiting ? (
                    <>
                      <section style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
                        <h2
                          style={{
                            margin: "0",
                            fontFamily: "'Cormorant Garamond',serif",
                            fontWeight: "500",
                            fontSize: "28px",
                          }}
                        >
                          Aguardando próximo episódio
                        </h2>
                        {asList(v.waiting).map((w, $index) => (
                          <React.Fragment key={$index}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "16px",
                                padding: "14px 16px",
                                borderRadius: "12px",
                                background: "#1A1714",
                                border: "1px solid rgba(240,238,233,.06)",
                              }}
                            >
                              <img
                                src={w?.cover}
                                alt=""
                                style={{
                                  width: "40px",
                                  height: "58px",
                                  objectFit: "cover",
                                  borderRadius: "4px",
                                  display: "block",
                                }}
                              />
                              <span style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "1" }}>
                                <span style={{ fontSize: "15px", fontWeight: "500" }}>{txt(w?.title)}</span>
                                <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                                  {"Você está em dia · episódio "}
                                  {txt(w?.ep)}
                                  {" assistido"}
                                </span>
                              </span>
                              <a href="/calendario" style={{ fontSize: "13px", fontWeight: "600" }}>
                                Ver no calendário →
                              </a>
                            </div>
                          </React.Fragment>
                        ))}
                      </section>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
            {v.t?.lendo ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h1
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "48px",
                        lineHeight: "1",
                      }}
                    >
                      Continuar lendo
                    </h1>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                      Mangás guardam a página; webtoons guardam a posição no capítulo.
                    </span>
                  </div>
                  <div
                    className="nk-grid-1"
                    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: "16px" }}
                  >
                    {asList(v.reading).map((w, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            gap: "18px",
                            padding: "16px",
                            borderRadius: "14px",
                            background: "#1A1714",
                            border: "1px solid rgba(240,238,233,.06)",
                          }}
                        >
                          <img
                            src={w?.cover}
                            alt=""
                            style={{
                              width: "92px",
                              height: "138px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              display: "block",
                              flexShrink: "0",
                            }}
                          />
                          <div
                            style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1", minWidth: "0" }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                letterSpacing: ".18em",
                                textTransform: "uppercase",
                                color: "#B7B1A4",
                              }}
                            >
                              {txt(w?.typeLabel)}
                            </span>
                            <span
                              style={{
                                fontSize: "16px",
                                fontWeight: "500",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {txt(w?.title)}
                            </span>
                            <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                              {"Capítulo "}
                              {txt(w?.ch)}
                              {" · "}
                              {txt(w?.pos)}
                            </span>
                            <span
                              style={{
                                display: "block",
                                height: "3px",
                                borderRadius: "2px",
                                background: "rgba(240,238,233,.12)",
                                overflow: "hidden",
                              }}
                            >
                              <span
                                style={{
                                  display: "block",
                                  height: "100%",
                                  width: `${w?.pctW ?? ""}`,
                                  background: "#DBAF57",
                                }}
                              />
                            </span>
                            <a
                              className="nk-hover-1uijps0"
                              href={w?.unitHref}
                              style={{
                                marginTop: "auto",
                                alignSelf: "flex-start",
                                height: "38px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 18px",
                                borderRadius: "999px",
                                background: "#DBAF57",
                                color: "#1A1714",
                                fontSize: "13px",
                                fontWeight: "600",
                              }}
                            >
                              {"Retomar capítulo "}
                              {txt(w?.ch)}
                            </a>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
            {v.t?.historico ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      gap: "16px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h1
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "48px",
                          lineHeight: "1",
                        }}
                      >
                        Histórico
                      </h1>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                        Registro do que você assistiu e leu. Remover daqui não apaga o progresso nem a lista.
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <div
                        className="nk-scroll-x"
                        style={{
                          display: "flex",
                          gap: "4px",
                          padding: "4px",
                          borderRadius: "999px",
                          background: "#1A1714",
                          border: "1px solid rgba(240,238,233,.08)",
                        }}
                      >
                        {asList(v.histChips).map((c, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onClick={c?.pick}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                height: "34px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 16px",
                                borderRadius: "999px",
                                fontSize: "13px",
                                fontWeight: "500",
                                background: `${c?.bg ?? ""}`,
                                color: `${c?.color ?? ""}`,
                              }}
                            >
                              {txt(c?.label)}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                      <button
                        className="nk-hover-1hxfbcg"
                        onClick={v.askClear}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "36px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 14px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.15)",
                          fontSize: "13px",
                          color: "#B7B1A4",
                        }}
                      >
                        Limpar histórico
                      </button>
                    </div>
                  </div>
                  {v.confirmClear ? (
                    <>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          padding: "16px 18px",
                          borderRadius: "12px",
                          background: "rgba(224,138,122,.08)",
                          border: "1px solid rgba(224,138,122,.35)",
                        }}
                      >
                        <span style={{ fontSize: "14px" }}>
                          Apagar todo o histórico? Sua lista e o progresso salvo continuam intactos.
                        </span>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={v.cancelClear}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              height: "36px",
                              padding: "0 14px",
                              display: "flex",
                              alignItems: "center",
                              borderRadius: "999px",
                              fontSize: "13px",
                              color: "#F0EEE9",
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={v.doClear}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              height: "36px",
                              padding: "0 16px",
                              display: "flex",
                              alignItems: "center",
                              borderRadius: "999px",
                              fontSize: "13px",
                              fontWeight: "600",
                              background: "#E08A7A",
                              color: "#1A1714",
                            }}
                          >
                            Apagar histórico
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                  {asList(v.history).map((d, $index) => (
                    <React.Fragment key={$index}>
                      <section style={{ display: "flex", flexDirection: "column" }}>
                        <span
                          style={{
                            fontFamily: "'Cormorant Garamond',serif",
                            fontSize: "24px",
                            fontWeight: "500",
                            paddingBottom: "8px",
                            borderBottom: "1px solid rgba(219,175,87,.18)",
                          }}
                        >
                          {txt(d?.day)}
                        </span>
                        {asList(d?.items).map((h, $index) => (
                          <React.Fragment key={$index}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "16px",
                                padding: "12px 0",
                                borderBottom: "1px solid rgba(240,238,233,.06)",
                              }}
                            >
                              <img
                                src={h?.cover}
                                alt=""
                                style={{
                                  width: "40px",
                                  height: "58px",
                                  objectFit: "cover",
                                  borderRadius: "4px",
                                  display: "block",
                                }}
                              />
                              <a
                                className="nk-hover-1d5grei"
                                href={h?.href}
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "3px",
                                  flex: "1",
                                  minWidth: "0",
                                  color: "#F0EEE9",
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
                                  {txt(h?.title)}
                                </span>
                                <span style={{ fontSize: "13px", color: "#B7B1A4" }}>
                                  {txt(h?.unit)}
                                  {" · "}
                                  {txt(h?.time)}
                                </span>
                              </a>
                              <button
                                className="nk-hover-kqh291"
                                onClick={h?.remove}
                                title="Remover do histórico"
                                style={{
                                  all: "unset",
                                  cursor: "pointer",
                                  width: "32px",
                                  height: "32px",
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
                      </section>
                    </React.Fragment>
                  ))}
                  {v.histEmpty ? (
                    <>
                      <span style={{ padding: "40px", textAlign: "center", fontSize: "14px", color: "#B7B1A4" }}>
                        Histórico vazio.
                      </span>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
            {v.t?.notificacoes ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "22px", maxWidth: "820px" }}>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      gap: "16px",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h1
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "48px",
                          lineHeight: "1",
                        }}
                      >
                        Notificações
                      </h1>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                        {txt(v.unreadText)}. Só avisamos sobre as obras que você acompanha.
                      </span>
                    </div>
                    <button
                      onClick={v.markAll}
                      style={{ all: "unset", cursor: "pointer", fontSize: "13px", fontWeight: "600", color: "#DBAF57" }}
                    >
                      Marcar todas como lidas
                    </button>
                  </div>
                  <div
                    className="nk-scroll-x"
                    style={{
                      display: "flex",
                      gap: "4px",
                      padding: "4px",
                      borderRadius: "999px",
                      background: "#1A1714",
                      border: "1px solid rgba(240,238,233,.08)",
                      alignSelf: "flex-start",
                    }}
                  >
                    {asList(v.notifChips).map((c, $index) => (
                      <React.Fragment key={$index}>
                        <button
                          onClick={c?.pick}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            height: "34px",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 16px",
                            borderRadius: "999px",
                            fontSize: "13px",
                            fontWeight: "500",
                            background: `${c?.bg ?? ""}`,
                            color: `${c?.color ?? ""}`,
                          }}
                        >
                          {txt(c?.label)}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {asList(v.notifs).map((n, $index) => (
                      <React.Fragment key={$index}>
                        <a
                          className="nk-hover-1vb73wp"
                          href={n?.href}
                          onClick={n?.open}
                          style={{
                            display: "flex",
                            gap: "16px",
                            alignItems: "center",
                            padding: "16px",
                            borderRadius: "12px",
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
                                  width: "44px",
                                  height: "64px",
                                  objectFit: "cover",
                                  borderRadius: "5px",
                                  display: "block",
                                  flexShrink: "0",
                                }}
                              />
                            </>
                          ) : null}
                          {n?.hasIcon ? (
                            <>
                              <span
                                style={{
                                  width: "44px",
                                  height: "44px",
                                  borderRadius: "50%",
                                  background: "#2D2924",
                                  color: "#DBAF57",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: "0",
                                }}
                              >
                                <svg
                                  width="18"
                                  height="18"
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
                            style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1", minWidth: "0" }}
                          >
                            <span style={{ fontSize: "15px", fontWeight: `${n?.weight ?? ""}` }}>{txt(n?.title)}</span>
                            <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(n?.sub)}</span>
                          </span>
                          <span style={{ fontSize: "12px", color: "#8F897D", whiteSpace: "nowrap" }}>
                            {txt(n?.when)}
                          </span>
                          <span
                            style={{
                              width: "8px",
                              height: "8px",
                              transform: "rotate(45deg)",
                              background: `${n?.dot ?? ""}`,
                              flexShrink: "0",
                            }}
                          />
                        </a>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
            {v.t?.solicitacoes ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "40px", alignItems: "flex-start" }}>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: "22px", flex: "1 1 440px", minWidth: "0" }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <h1
                        style={{
                          margin: "0",
                          fontFamily: "'Cormorant Garamond',serif",
                          fontWeight: "500",
                          fontSize: "48px",
                          lineHeight: "1",
                        }}
                      >
                        Solicitar obra
                      </h1>
                      <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                        Não encontrou uma história? Envie para a equipe analisar. Você recebe uma notificação a cada
                        mudança.
                      </span>
                    </div>
                    {v.sent ? (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "14px",
                            padding: "16px 18px",
                            borderRadius: "12px",
                            background: "rgba(219,175,87,.08)",
                            border: "1px solid rgba(219,175,87,.4)",
                          }}
                        >
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              transform: "rotate(45deg)",
                              background: "#DBAF57",
                              flexShrink: "0",
                            }}
                          />
                          <span style={{ fontSize: "14px" }}>
                            {"Solicitação "}
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#DBAF57" }}>
                              {txt(v.sentId)}
                            </span>
                            {" recebida. "}
                            <a href={v.sentHref}>Ver detalhes →</a>
                          </span>
                        </div>
                      </>
                    ) : null}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "500" }}>Tipo de obra</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {asList(v.reqTypes).map((c, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onClick={c?.pick}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                height: "36px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 14px",
                                borderRadius: "8px",
                                fontSize: "13px",
                                border: `1px solid ${c?.border ?? ""}`,
                                background: `${c?.bg ?? ""}`,
                                color: `${c?.color ?? ""}`,
                              }}
                            >
                              {txt(c?.label)}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "500" }}>Título da obra</span>
                      <input
                        value={val(v.reqTitle)}
                        onChange={v.onReqTitle}
                        placeholder="Nome original ou traduzido"
                        style={{
                          height: "46px",
                          borderRadius: "10px",
                          border: "1px solid rgba(240,238,233,.15)",
                          background: "#1A1714",
                          color: "#F0EEE9",
                          padding: "0 14px",
                          fontFamily: "Inter,sans-serif",
                          fontSize: "14px",
                          outline: "none",
                        }}
                      />
                    </label>
                    {v.hasMatch ? (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "14px",
                            padding: "12px 14px",
                            borderRadius: "10px",
                            background: "#1A1714",
                            border: "1px solid rgba(219,175,87,.35)",
                          }}
                        >
                          <img
                            src={v.match?.cover}
                            alt=""
                            style={{
                              width: "36px",
                              height: "52px",
                              objectFit: "cover",
                              borderRadius: "4px",
                              display: "block",
                            }}
                          />
                          <span style={{ display: "flex", flexDirection: "column", gap: "2px", flex: "1" }}>
                            <span style={{ fontSize: "12px", color: "#DBAF57" }}>{txt(v.matchLabel)}</span>
                            <span style={{ fontSize: "14px", fontWeight: "500" }}>{txt(v.match?.title)}</span>
                          </span>
                          <a href={v.match?.href} style={{ fontSize: "13px", fontWeight: "600" }}>
                            Ver obra →
                          </a>
                        </div>
                      </>
                    ) : null}
                    {v.hasDupReq ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "14px",
                          padding: "12px 14px",
                          borderRadius: "10px",
                          background: "#1A1714",
                          border: "1px solid rgba(219,175,87,.35)",
                        }}
                      >
                        <span
                          style={{ display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "200px" }}
                        >
                          <span style={{ fontSize: "12px", color: "#DBAF57" }}>Já existe um pedido aberto</span>
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>
                            {txt(v.dupReq?.id)}
                            {" · "}
                            {txt(v.dupReq?.title)}
                          </span>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                            {txt(v.dupReq?.status)}
                            {" · "}
                            {txt(v.dupReq?.supportersText)}
                          </span>
                        </span>
                        {v.dupReq?.canSupport ? (
                          <button
                            onClick={v.supportDup}
                            style={{
                              all: "unset",
                              cursor: "pointer",
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
                            Também quero esta obra
                          </button>
                        ) : (
                          <a href={v.dupReq?.href} style={{ fontSize: "13px", fontWeight: "600" }}>
                            Acompanhar →
                          </a>
                        )}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "500" }}>O que você quer pedir?</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {asList(v.reqKinds).map((c, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onClick={c?.pick}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                height: "36px",
                                display: "flex",
                                alignItems: "center",
                                padding: "0 14px",
                                borderRadius: "8px",
                                fontSize: "13px",
                                border: `1px solid ${c?.border ?? ""}`,
                                background: `${c?.bg ?? ""}`,
                                color: `${c?.color ?? ""}`,
                              }}
                            >
                              {txt(c?.label)}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "500" }}>
                        {"Link de referência "}
                        <span style={{ color: "#8F897D", fontWeight: "400" }}>· opcional</span>
                      </span>
                      <input
                        value={val(v.reqRef)}
                        onChange={v.onReqRef}
                        placeholder="Página oficial, AniList ou MyAnimeList"
                        style={{
                          height: "46px",
                          borderRadius: "10px",
                          border: "1px solid rgba(240,238,233,.15)",
                          background: "#1A1714",
                          color: "#F0EEE9",
                          padding: "0 14px",
                          fontFamily: "Inter,sans-serif",
                          fontSize: "14px",
                          outline: "none",
                        }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "500" }}>
                        {"Observações "}
                        <span style={{ color: "#8F897D", fontWeight: "400" }}>· opcional</span>
                      </span>
                      <textarea
                        rows="3"
                        value={val(v.reqNotes)}
                        onChange={v.onReqNotes}
                        placeholder="Algo que ajude a equipe a encontrar a obra"
                        style={{
                          borderRadius: "10px",
                          border: "1px solid rgba(240,238,233,.15)",
                          background: "#1A1714",
                          color: "#F0EEE9",
                          padding: "12px 14px",
                          fontFamily: "Inter,sans-serif",
                          fontSize: "14px",
                          outline: "none",
                          resize: "vertical",
                        }}
                      />
                    </label>
                    <button
                      onClick={v.sendReq}
                      style={{
                        all: "unset",
                        cursor: `${v.sendCursor ?? ""}`,
                        alignSelf: "flex-start",
                        height: "46px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 26px",
                        borderRadius: "999px",
                        background: `${v.sendBg ?? ""}`,
                        color: "#1A1714",
                        fontSize: "14px",
                        fontWeight: "600",
                      }}
                    >
                      {txt(v.sendLabel)}
                    </button>
                    {v.reqError ? <span style={{ fontSize: "13px", color: "#E08A7A" }}>{txt(v.reqError)}</span> : null}
                  </div>
                  <aside style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "28px", fontWeight: "500" }}>
                      Minhas solicitações
                    </span>
                    {asList(v.requests).map((r, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            padding: "16px",
                            borderRadius: "12px",
                            background: "#1A1714",
                            border: "1px solid rgba(240,238,233,.06)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "10px",
                            }}
                          >
                            <span style={{ fontSize: "15px", fontWeight: "500" }}>{txt(r?.title)}</span>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: "600",
                                padding: "4px 9px",
                                borderRadius: "999px",
                                border: `1px solid ${r?.color ?? ""}`,
                                color: `${r?.color ?? ""}`,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {txt(r?.status)}
                            </span>
                          </div>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{txt(r?.id)}</span>
                            {" · "}
                            {txt(r?.type)}
                            {" · "}
                            {txt(r?.date)}
                          </span>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "4px" }}>
                            {asList(r?.steps).map((s, $index) => (
                              <React.Fragment key={$index}>
                                <span style={{ height: "3px", borderRadius: "2px", background: `${s ?? ""}` }} />
                              </React.Fragment>
                            ))}
                          </div>
                          {r?.hasReason ? (
                            <>
                              <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(r?.reason)}</span>
                            </>
                          ) : null}
                          <span
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "10px",
                              fontSize: "12px",
                              color: "#8F897D",
                            }}
                          >
                            <span>{txt(r?.footNote)}</span>
                            <a href={r?.href} style={{ fontSize: "13px", fontWeight: "600" }}>
                              Ver detalhes →
                            </a>
                          </span>
                        </div>
                      </React.Fragment>
                    ))}
                  </aside>
                </div>
              </>
            ) : null}
            {v.t?.configuracoes ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "22px", maxWidth: "860px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h1
                      style={{
                        margin: "0",
                        fontFamily: "'Cormorant Garamond',serif",
                        fontWeight: "500",
                        fontSize: "48px",
                        lineHeight: "1",
                      }}
                    >
                      Configurações
                    </h1>
                    <span style={{ fontSize: "14px", color: "#B7B1A4" }}>
                      Preferências salvas na sua conta e aplicadas em todos os dispositivos.
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "4px",
                      borderBottom: "1px solid rgba(240,238,233,.08)",
                    }}
                  >
                    {asList(v.cfgTabs).map((c, $index) => (
                      <React.Fragment key={$index}>
                        <button
                          onClick={c?.pick}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            height: "42px",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 14px",
                            fontSize: "14px",
                            fontWeight: "500",
                            color: `${c?.color ?? ""}`,
                            borderBottom: `2px solid ${c?.line ?? ""}`,
                            marginBottom: "-1px",
                          }}
                        >
                          {txt(c?.label)}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {asList(v.cfgRows).map((r, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px 32px",
                            padding: "18px 0",
                            borderBottom: "1px solid rgba(240,238,233,.06)",
                          }}
                        >
                          <span style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 280px" }}>
                            <span style={{ fontSize: "15px", fontWeight: "500" }}>{txt(r?.label)}</span>
                            <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(r?.desc)}</span>
                          </span>
                          {r?.isToggle ? (
                            <>
                              <button
                                onClick={r?.toggle}
                                role="switch"
                                aria-checked={r?.on}
                                style={{
                                  all: "unset",
                                  cursor: "pointer",
                                  width: "46px",
                                  height: "26px",
                                  borderRadius: "999px",
                                  background: `${r?.track ?? ""}`,
                                  position: "relative",
                                  transition: "background .2s",
                                  flexShrink: "0",
                                }}
                              >
                                <span
                                  style={{
                                    position: "absolute",
                                    top: "3px",
                                    left: `${r?.knobX ?? ""}`,
                                    width: "20px",
                                    height: "20px",
                                    borderRadius: "50%",
                                    background: `${r?.knob ?? ""}`,
                                    transition: "left .2s",
                                  }}
                                />
                              </button>
                            </>
                          ) : null}
                          {r?.isSeg ? (
                            <>
                              <div
                                className="nk-scroll-x"
                                style={{
                                  display: "flex",
                                  gap: "4px",
                                  padding: "4px",
                                  borderRadius: "10px",
                                  background: "#1A1714",
                                  border: "1px solid rgba(240,238,233,.08)",
                                }}
                              >
                                {asList(r?.opts).map((o, $index) => (
                                  <React.Fragment key={$index}>
                                    <button
                                      onClick={o?.pick}
                                      style={{
                                        all: "unset",
                                        cursor: "pointer",
                                        height: "32px",
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "0 12px",
                                        borderRadius: "7px",
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
                          {r?.isAction ? (
                            <>
                              <button
                                className="nk-hover-ucdklh"
                                onClick={r?.act}
                                disabled={r?.disabled}
                                style={{
                                  all: "unset",
                                  cursor: r?.disabled ? "not-allowed" : "pointer",
                                  opacity: r?.disabled ? ".55" : "1",
                                  height: "36px",
                                  display: "flex",
                                  alignItems: "center",
                                  padding: "0 16px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(240,238,233,.2)",
                                  fontSize: "13px",
                                  color: "#F0EEE9",
                                }}
                              >
                                {txt(r?.action)}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </main>
        </div>
        {v.toast ? (
          <>
            <div
              className="nk-toast"
              style={{
                position: "fixed",
                left: "50%",
                bottom: "28px",
                transform: "translateX(-50%)",
                zIndex: "60",
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

export const defaults = {};

export default defineDC("Conta", ContaLogic, render, { helmet });
