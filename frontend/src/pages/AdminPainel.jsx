// Origem: design/claude-design/Admin.dc.html (Claude Design). Cópia literal do painel;
// únicos acréscimos: logo e "Voltar ao site" levam de volta à navegação do site.
/* eslint-disable */
import React from "react";
import { DCLogic, defineDC, txt, asList, css } from "../dc/runtime";

class AdminPainelLogic extends DCLogic {
  state = {
    tab: "overview",
    period: "hoje",
    online: 184,
    player: 61,
    pf: "all",
    ef: "all",
    user: 0,
    openRun: 0,
    running: false,
    added: {},
    done: {},
    extra: [],
    toast: null,
  };
  componentDidMount() {
    const t = new URLSearchParams(location.search).get("aba");
    if (t) this.setState({ tab: t });
    this.iv = setInterval(
      () =>
        this.setState((s) => ({
          online: Math.max(150, s.online + Math.round(Math.random() * 10 - 5)),
          player: Math.max(40, s.player + Math.round(Math.random() * 6 - 3)),
        })),
      3000,
    );
  }
  componentWillUnmount() {
    clearInterval(this.iv);
  }
  flash(t) {
    clearTimeout(this.tt);
    this.setState({ toast: t });
    this.tt = setTimeout(() => this.setState({ toast: null }), 2200);
  }
  go(tab) {
    this.setState({ tab });
    try {
      history.replaceState(null, "", `?aba=${tab}`);
    } catch (e) {}
    window.scrollTo(0, 0);
  }
  PEND = [
    [
      "crit",
      "Episódio 10 de Kaiju No. 8 (2ª temporada) aguardando revisão",
      "Host desconhecido no embed: streamtape.to. Publicar ou descartar.",
      "Sincronização",
      "auto",
      "12 min",
      "Revisar",
    ],
    [
      "crit",
      "Dandadan ep. 7 sem servidor funcionando",
      "Teste automático falhou nos 2 embeds · 9 trocas de servidor na última hora",
      "Fontes",
      "auto",
      "34 min",
      "Trocar fonte",
    ],
    [
      "med",
      "Solo Leveling 2ª temporada sem legenda PT-BR nos eps. 9–12",
      "Existem EN sub e EN dub. 41 pessoas abriram e saíram em menos de 1 min",
      "Legendas",
      "auto",
      "2 d",
      "Abrir obra",
    ],
    [
      "med",
      '"Frieren dublado" buscado 38 vezes',
      "A obra existe, mas sem versão dublada cadastrada",
      "Catálogo",
      "auto",
      "1 d",
      "Abrir obra",
    ],
    [
      "med",
      "Pedido: Blue Lock 2ª temporada",
      "17 usuários pediram · aberta por @kaio_r",
      "Solicitações",
      "auto",
      "3 d",
      "Responder",
    ],
    [
      "med",
      "Comentário denunciado no ep. 1 de Solo Leveling",
      "Spoiler sem marcação · 4 denúncias",
      "Denúncias",
      "auto",
      "5 h",
      "Moderar",
    ],
    ["low", "Sinopse só em inglês: 23 obras", "Vieram do AniList sem tradução", "Catálogo", "auto", "6 d", "Ver lista"],
    [
      "low",
      "Revisar banner do destaque da semana",
      "Trocar arte de Kaiju No. 8 antes de sexta",
      "Manual",
      "manual",
      "1 d",
      "Abrir Home",
    ],
  ];
  RUNS = [
    [
      "Hoje 20:30",
      "auto",
      "38 s",
      [
        ["Kaiju No. 8 · 2ª temporada", "Ep. 10", "review"],
        ["Shangri-La Frontier · 2ª temporada", "Ep. 22", "pub"],
      ],
    ],
    ["Hoje 20:15", "auto", "31 s", []],
    ["Hoje 20:00", "auto", "44 s", [["Dandadan", "Ep. 7 · revalidado", "pub"]]],
    ["Hoje 19:45", "auto", "—", "fail"],
    ["Hoje 19:30", "auto", "29 s", []],
    [
      "Hoje 19:12",
      "manual",
      "52 s",
      [
        ["Solo Leveling · 2ª temporada", "Ep. 12", "pub"],
        ["Re:Zero · 3ª temporada", "Ep. 16", "pub"],
        ["Ao no Hako", "Ep. 3 especial", "review"],
      ],
    ],
    ["Hoje 19:00", "auto", "33 s", []],
  ];
  USERS = [
    [
      "Marina Alves",
      "MA",
      "player",
      "Assistindo Frieren · ep. 14",
      "Membro desde mar 2026 · #1042 · usuário",
      ["126 h", "com player aberto"],
      ["218", "episódios marcados como vistos"],
      ["31", "capítulos lidos"],
      ["17:24", "última atividade"],
    ],
    [
      "Kaio Ribeiro",
      "KR",
      "online",
      "Navegando em Explorar",
      "Membro desde jan 2026 · #0877 · moderador",
      ["64 h", "com player aberto"],
      ["102", "episódios"],
      ["210", "capítulos"],
      ["agora", "última atividade"],
    ],
    [
      "Lia Tanaka",
      "LT",
      "player",
      "Lendo Solo Leveling · cap. 112",
      "Membro desde ago 2026 · #1611 · usuário",
      ["12 h", "com player aberto"],
      ["19", "episódios"],
      ["144", "capítulos"],
      ["agora", "última atividade"],
    ],
    [
      "Rafa Costa",
      "RC",
      "off",
      "Visto há 2 h",
      "Membro desde mai 2026 · #1220 · usuário",
      ["88 h", "com player aberto"],
      ["160", "episódios"],
      ["0", "capítulos"],
      ["18:40", "última atividade"],
    ],
    [
      "Duda Mendes",
      "DM",
      "off",
      "Visto ontem",
      "Membro desde out 2026 · #1702 · usuário",
      ["3 h", "com player aberto"],
      ["5", "episódios"],
      ["8", "capítulos"],
      ["ontem", "última atividade"],
    ],
  ];
  EVENTS = [
    [
      "17:24",
      "play",
      "Frieren · Ep. 14",
      "Legendado PT-BR · Servidor 1 (Blogger) · player aberto 18 min 40 s, aba visível",
    ],
    ["17:05", "play", "Frieren · Ep. 13 marcado como visto", "Clicou em Próximo episódio aos 23 min"],
    ["17:02", "search", 'Busca: "bleach dublado"', "2 resultados · clicou em Bleach: Thousand-Year Blood War"],
    ["16:58", "nav", "Clique no destaque da Home", "Banner 1 · Kaiju No. 8"],
    ["16:52", "server", "Trocou de servidor", "Dandadan ep. 7 · Servidor 1 → Servidor 2 após 40 s"],
    ["16:41", "read", "Solo Leveling · Capítulo 112", "Vertical · leu 100% · 14 min"],
    ["16:20", "comment", "Comentou em Solo Leveling · Ep. 1", '"A animação da luta final ficou absurda"'],
    ["16:12", "nav", "Entrou pelo celular", "Android · Chrome · sessão iniciada"],
  ];
  MODS = {
    catalog: [
      "Conteúdo",
      "Catálogo",
      "Hoje o catálogo e a manutenção de capítulos já existem. O que falta é tratar cada episódio como uma lista de versões × servidores, que é exatamente como os embeds chegam.",
      [
        [
          "Obras",
          "existe",
          [
            "Anime, filme, mangá, manhwa e webtoon no mesmo cadastro, separados por tipo",
            'Vínculo AniList obrigatório para evitar duplicadas, com botão "mesclar"',
            "Estado: rascunho, publicada, pausada",
          ],
        ],
        [
          "Fontes do episódio",
          "novo",
          [
            "Versões do episódio: Legendado PT-BR, Legendado EN, Dublado EN, Dublado PT-BR",
            "Cada versão com seus servidores em ordem de preferência",
            "Teste do embed a cada sincronização: responde, bloqueia iframe ou caiu",
            "Host desconhecido vai para Pendências antes de publicar",
          ],
        ],
        [
          "Idiomas da obra",
          "novo",
          [
            "Resumo calculado a partir das fontes: áudio, legendas, dublagem e quantos episódios têm cada um",
            "É o que alimenta a faixa de idiomas da página da obra",
          ],
        ],
        [
          "Leitura",
          "existe",
          [
            "Capítulos e páginas, detecção de capítulo duplicado ou fora de ordem",
            'Capítulo "em tradução" com idioma de origem disponível',
          ],
        ],
      ],
    ],
    editorial: [
      "Conteúdo",
      "Home e calendário",
      "A Home já vem da API. Aqui ela ganha controle, sem virar um construtor livre: são só três blocos, como no design.",
      [
        [
          "Destaque da semana",
          "novo",
          [
            "Até 5 obras, arrastar para ordenar",
            "Arte, frase e período de exibição (início e fim)",
            "Rascunho, pré-visualização no computador e no celular, publicar e desfazer",
          ],
        ],
        [
          "Novidades da temporada",
          "novo",
          ["Automático pela temporada do AniList", "Exceções manuais: fixar no início ou ocultar uma obra"],
        ],
        [
          "Episódios recentes",
          "novo",
          ["Automático pela sincronização", "Ocultar item publicado por engano, sem apagar o episódio"],
        ],
        [
          "Calendário",
          "novo",
          [
            "Dois horários por episódio: oficial no Japão e quando chegou ao NekoFlow, em horário de Brasília",
            "Tirar as datas fixas de outubro de 2026 do Calendario.jsx",
            "Obras da temporada sem programação aparecem como pendência",
          ],
        ],
      ],
    ],
    aud: [
      "Pessoas",
      "Audiência",
      "Métricas do site inteiro e por obra. Com iframe não dá para saber minutos assistidos nem onde a pessoa parou dentro do vídeo; o que medimos de fora é confiável e suficiente para decidir.",
      [
        [
          "O que dá para medir exato",
          "exato",
          [
            "Páginas, impressões de card (visível 50% por 1 s) e cliques",
            "Player aberto, versão e servidor escolhidos, trocas de servidor",
            'Clique em Próximo, "marcar como visto", reports',
            "Leitura inteira: o leitor é nosso, então segmento, página e tempo são reais",
          ],
        ],
        [
          "O que é estimativa",
          "estimado",
          [
            "Tempo com player aberto e aba visível (não é tempo de vídeo tocando)",
            "Conclusão: marcou como visto, clicou em Próximo ou ficou 80% da duração com a aba visível",
          ],
        ],
        [
          "Por obra",
          "novo",
          [
            "Funil: impressão → clique → ficha → player → próximo episódio",
            "Retenção por série: quantos passam do ep. 1 para o 2, do 2 para o 3",
            "Versão e servidor mais usados",
          ],
        ],
        ["Online agora", "novo", ["Heartbeat a cada 30 s, expira em 90 s", "Separado em navegando, no player e lendo"]],
      ],
    ],
    system: [
      "Sistema",
      "Sistema",
      "Papéis e auditoria já existem no painel atual. Entram configurações que hoje só se mudam no código.",
      [
        ["Papéis", "existe", ["ADMIN, EDITOR e MODERATOR, como no Admin.jsx", "Cada módulo do menu respeita o papel"]],
        ["Auditoria", "existe", ["Toda ação do painel com quem, quando e o antes/depois"]],
        [
          "Configurações",
          "novo",
          [
            "Intervalo de cada sincronização (HiAnime 15 min, AniList 6 h)",
            "Modo manutenção",
            "Aviso global no sininho para todos os usuários",
          ],
        ],
        [
          "Antes de publicar",
          "atenção",
          [
            "Desligar NEKOFLOW_DEMO e o login nekoflow / 123456",
            "Dividir o Admin.jsx (48 KB) em uma página por módulo",
          ],
        ],
      ],
    ],
  };
  renderVals() {
    const s = this.state;
    const pendAll = [...s.extra, ...this.PEND.map((p, i) => ({ id: "p" + i, p }))].filter((x) => !s.done[x.id]);
    const pendCount = pendAll.length,
      crit = pendAll.filter((x) => x.p[0] === "crit").length;
    const NAV = [
      [
        "Operação",
        [
          ["overview", "Visão geral"],
          ["pend", "Pendências", pendCount, crit ? "#E08A72" : "#DBAF57"],
          ["sync", "Integrações"],
        ],
      ],
      [
        "Conteúdo",
        [
          ["catalog", "Catálogo"],
          ["editorial", "Home e calendário", null, null, true],
        ],
      ],
      [
        "Pessoas",
        [
          ["aud", "Audiência", null, null, true],
          ["users", "Usuários"],
        ],
      ],
      ["Sistema", [["system", "Sistema"]]],
    ];
    const nav = NAV.map(([group, items]) => ({
      group,
      items: items.map(([k, label, badge, bb, planned]) => ({
        label,
        badge,
        hasBadge: !!badge,
        badgeBg: bb,
        planned: !!planned,
        go: () => this.go(k),
        bg: s.tab === k ? "rgba(219,175,87,.1)" : "transparent",
        color: s.tab === k ? "#DBAF57" : "#D9D5CC",
        mark: s.tab === k ? "#DBAF57" : "transparent",
      })),
    }));
    const titles = {
      overview: ["Operação", "Visão geral"],
      pend: ["Operação", "Pendências"],
      sync: ["Operação", "Integrações"],
      users: ["Pessoas", "Usuários"],
    };
    const mod = this.MODS[s.tab];
    const [crumb, title] = titles[s.tab] || (mod ? [mod[0], mod[1]] : ["", ""]);
    const tagC = {
      existe: ["rgba(240,238,233,.2)", "#B7B1A4", "já existe"],
      novo: ["rgba(219,175,87,.45)", "#DBAF57", "novo"],
      exato: ["rgba(127,183,126,.45)", "#7FB77E", "exato"],
      estimado: ["rgba(219,175,87,.45)", "#DBAF57", "estimado"],
      atenção: ["rgba(217,115,91,.5)", "#E08A72", "atenção"],
    };
    const mult = { hoje: 1, "7d": 6.4, "30d": 26 }[s.period];
    const fmt = (n) =>
      n >= 10000
        ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(".", ",")} mil`
        : Math.round(n).toLocaleString("pt-BR");
    const live = s.period === "hoje";
    const kpis = [
      {
        label: "Online agora",
        value: String(s.online),
        sub: `${s.player} no player · ${Math.round(s.online * 0.14)} lendo`,
        live: true,
        color: "#F0EEE9",
      },
      {
        label: "Players abertos",
        value: fmt(3120 * mult),
        sub: live ? "+12% que ontem" : "no período",
        color: "#F0EEE9",
      },
      {
        label: "Tempo com player aberto",
        value: `${fmt(1480 * mult)} h`,
        sub: "estimado · aba visível",
        color: "#F0EEE9",
      },
      {
        label: "Usuários ativos",
        value: fmt(1960 * (live ? 1 : mult * 0.55)),
        sub: `${live ? 212 : Math.round(212 * mult)} novos cadastros`,
        color: "#F0EEE9",
      },
      { label: "Trocas de servidor", value: "6,8%", sub: "dos players abertos", color: "#DBAF57" },
      {
        label: "Pendências críticas",
        value: String(crit),
        sub: `${pendCount} no total`,
        color: crit ? "#E08A72" : "#7FB77E",
      },
    ];
    const n = live ? 24 : s.period === "7d" ? 7 : 30;
    const vals = Array.from({ length: n }, (_, i) =>
      live
        ? 0.25 + 0.75 * Math.pow(Math.sin(((i - 5) / 24) * Math.PI), 2) * (i > 17 ? 1.1 : 0.85)
        : 0.55 + 0.35 * Math.abs(Math.sin(i * 1.3)) + (i % 7 >= 5 ? 0.15 : 0),
    );
    const mx = Math.max(...vals);
    const bars = vals.map((v, i) => ({
      play: `${(v / mx) * 38}%`,
      browse: `${(v / mx) * 54}%`,
      tip: live ? `${String(i).padStart(2, "0")}h` : `dia ${i + 1}`,
    }));
    const barLabels = live
      ? ["00h", "06h", "12h", "18h", "23h"]
      : s.period === "7d"
        ? ["seg", "qua", "sex", "dom"]
        : ["1", "8", "15", "22", "30"];
    const T = [
      ["Kaiju No. 8 · 2ª temporada", "Anime · em lançamento", 48200, 6120, 4380, "71%"],
      ["Solo Leveling · 2ª temporada", "Anime · completo", 39100, 5210, 3990, "83%"],
      ["Dandadan", "Anime · em lançamento", 30400, 3340, 2410, "64%"],
      ["Solo Leveling", "Manhwa · leitura", 21800, 2950, 2700, "88%"],
      ["Frieren", "Anime · completo", 19600, 1820, 1540, "79%"],
      ["Ao no Hako", "Anime · em lançamento", 17200, 980, 640, "42%"],
    ];
    const top = T.map(([name, kind, imp, clk, plays, next], i) => ({
      rank: i + 1,
      name,
      kind,
      imp: fmt(imp * mult),
      clk: fmt(clk * mult),
      ctr: `${((clk / imp) * 100).toFixed(1).replace(".", ",")}%`,
      plays: fmt(plays * mult),
      next,
      nextColor: parseInt(next) < 50 ? "#E08A72" : "#F0EEE9",
    }));
    const servers = [
      ["Blogger", "Legendado PT-BR · 1 servidor por episódio", "#7FB77E", "3,1%"],
      ["ZokoAnime", "Legendado e dublado EN", "#7FB77E", "5,4%"],
      ["HD-1 · MegaPlay", "Legendado e dublado EN · lento desde 19:40", "#DBAF57", "14,2%"],
    ].map(([name, sub, dot, swap]) => ({ name, sub: `${sub} · trocas`, dot, swap }));
    const misses = [
      ["frieren dublado", 38],
      ["blue lock 2", 17],
      ["one punch man 3", 14],
      ["omniscient reader manhwa", 9],
      ["haikyuu filme", 6],
    ].map(([q, c]) => ({
      q,
      n: c,
      label: s.added[q] ? "Na lista" : "Criar pendência",
      color: s.added[q] ? "#7FB77E" : "#DBAF57",
      add: () => {
        if (s.added[q]) return;
        this.setState({
          added: { ...s.added, [q]: 1 },
          extra: [
            {
              id: "q" + q,
              p: [
                "med",
                `Buscado sem resultado: "${q}"`,
                `${c} buscas no período`,
                "Catálogo",
                "auto",
                "agora",
                "Abrir busca",
              ],
            },
            ...s.extra,
          ],
        });
        this.flash("Pendência criada");
      },
    }));
    const runMeta = (r) => {
      if (r[3] === "fail")
        return {
          summary: "Falhou: HiAnime não respondeu (timeout 20 s). Nova tentativa às 20:00",
          color: "#E08A72",
          dot: "#E08A72",
          items: [],
        };
      const it = r[3];
      if (!it.length) return { summary: "Nenhum episódio novo", color: "#B7B1A4", dot: "#4A433B", items: [] };
      const pub = it.filter((x) => x[2] === "pub").length,
        rev = it.length - pub;
      return {
        summary: `${it.length} ${it.length > 1 ? "episódios encontrados" : "episódio encontrado"} · ${pub} publicado${pub !== 1 ? "s" : ""}${rev ? ` · ${rev} para revisão` : ""}`,
        color: "#F0EEE9",
        dot: rev ? "#DBAF57" : "#7FB77E",
        items: it.map(([anime, ep, res]) => ({
          anime,
          ep,
          res: res === "pub" ? "Publicado" : "Aguardando revisão",
          color: res === "pub" ? "#7FB77E" : "#DBAF57",
          border: res === "pub" ? "rgba(127,183,126,.4)" : "rgba(219,175,87,.4)",
        })),
      };
    };
    const runs = this.RUNS.map((r, i) => {
      const m = runMeta(r);
      return {
        ...m,
        when: r[0],
        trigger: r[1] === "auto" ? "automática" : "manual",
        dur: r[2],
        hasItems: m.items.length > 0,
        open: s.openRun === i && m.items.length > 0,
        rot: s.openRun === i ? "180deg" : "0deg",
        toggle: () => this.setState({ openRun: s.openRun === i ? -1 : i }),
      };
    });
    const runsShort = this.RUNS.slice(0, 5).map((r) => {
      const m = runMeta(r);
      return { t: r[0].replace("Hoje ", ""), summary: m.summary, color: m.color };
    });
    const PC = { crit: ["Crítica", "#E08A72"], med: ["Média", "#DBAF57"], low: ["Baixa", "#B7B1A4"] };
    const kinds = ["Sincronização", "Fontes", "Legendas", "Catálogo", "Solicitações", "Denúncias", "Manual"];
    const fl = [["all", "Todas"], ["crit", "Críticas"], ...kinds.map((k) => [k, k])];
    const match = (x, f) => f === "all" || (f === "crit" ? x.p[0] === "crit" : x.p[3] === f);
    const pendFilters = fl
      .map(([k, label]) => ({
        label,
        n: pendAll.filter((x) => match(x, k)).length,
        pick: () => this.setState({ pf: k }),
        bg: s.pf === k ? "rgba(219,175,87,.12)" : "transparent",
        border: s.pf === k ? "#DBAF57" : "rgba(240,238,233,.14)",
        color: s.pf === k ? "#DBAF57" : "#D9D5CC",
      }))
      .filter((f) => f.n > 0 || f.label === "Todas");
    const pend = pendAll
      .filter((x) => match(x, s.pf))
      .map((x) => {
        const [pr, t, d, kind, origin, age, action] = x.p;
        return {
          prio: PC[pr][0],
          pColor: PC[pr][1],
          title: t,
          detail: d,
          kind,
          origin: origin === "auto" ? "Automática" : "Manual",
          age,
          action,
          act: () => this.flash(`Abriria: ${action.toLowerCase()}`),
          done: () => {
            this.setState({ done: { ...s.done, [x.id]: 1 } });
            this.flash("Pendência resolvida");
          },
        };
      });
    const u = this.USERS[s.user];
    const dotC = { player: "#DBAF57", online: "#7FB77E", off: "#4A433B" };
    const users = this.USERS.map((x, i) => ({
      name: x[0],
      ini: x[1],
      now: x[3],
      dot: dotC[x[2]],
      pick: () => this.setState({ user: i, ef: "all" }),
      bg: i === s.user ? "rgba(219,175,87,.08)" : "transparent",
      edge: i === s.user ? "#DBAF57" : "transparent",
    }));
    const ET = {
      play: ["Assistiu", "#DBAF57"],
      read: ["Leitura", "#7FB77E"],
      search: ["Busca", "#D9D5CC"],
      nav: ["Navegação", "#B7B1A4"],
      server: ["Servidor", "#E08A72"],
      comment: ["Comentário", "#C9A3E0"],
    };
    const efl = [
      ["all", "Tudo"],
      ["play", "Assistidos"],
      ["read", "Leitura"],
      ["search", "Buscas"],
      ["nav", "Navegação"],
      ["comment", "Comentários"],
    ];
    const shift = s.user * 2;
    const events = this.EVENTS.filter(
      (e) => s.ef === "all" || e[1] === s.ef || (s.ef === "play" && e[1] === "server"),
    ).map((e) => ({
      t: e[0].replace(/^(\d\d)/, (h) => String((+h + 24 - shift) % 24).padStart(2, "0")),
      type: ET[e[1]][0],
      color: ET[e[1]][1],
      title: e[2],
      detail: e[3],
    }));
    const providers = [
      {
        name: "HiAnime",
        role: "Episódios e embeds",
        meta: "A cada 15 min · última 20:30 · 272 obras monitoradas",
        dot: "#7FB77E",
        border: "rgba(127,183,126,.25)",
      },
      {
        name: "AniList",
        role: "Fichas, imagens, temporada, relações",
        meta: "A cada 6 h · última 18:00 · 0 erros",
        dot: "#7FB77E",
        border: "rgba(240,238,233,.06)",
      },
      {
        name: "Leitura",
        role: "Capítulos de mangá, manhwa e webtoon",
        meta: "Sem provedor conectado · cadastro manual",
        dot: "#4A433B",
        border: "rgba(240,238,233,.06)",
      },
    ];
    return {
      nav,
      crumb,
      title,
      isOverview: s.tab === "overview",
      isPend: s.tab === "pend",
      isSync: s.tab === "sync",
      isUsers: s.tab === "users",
      isPlanned: !!mod,
      periods: [
        ["hoje", "Hoje"],
        ["7d", "7 dias"],
        ["30d", "30 dias"],
      ].map(([k, label]) => ({
        label,
        pick: () => this.setState({ period: k }),
        bg: s.period === k ? "#DBAF57" : "transparent",
        color: s.period === k ? "#1A1714" : "#F0EEE9",
      })),
      kpis,
      bars,
      barLabels,
      top,
      servers,
      misses,
      runsShort,
      goSync: () => this.go("sync"),
      pendFilters,
      pend,
      pendEmpty: pend.length === 0,
      addManual: () => {
        const id = "m" + Date.now();
        this.setState({
          extra: [
            {
              id,
              p: [
                "low",
                "Nova tarefa manual",
                "Descreva o que precisa ser feito",
                "Manual",
                "manual",
                "agora",
                "Editar",
              ],
            },
            ...s.extra,
          ],
        });
        this.flash("Tarefa criada");
      },
      providers,
      runs,
      syncState: s.running ? "Executando…" : "Próxima automática às 20:45",
      runNow: () => {
        if (s.running) return;
        this.setState({ running: true });
        setTimeout(() => {
          this.setState({ running: false });
          this.flash("Busca manual concluída · nenhum episódio novo");
        }, 1600);
      },
      users,
      cu: {
        name: u[0],
        ini: u[1],
        meta: u[4],
        kpis: [u[5], u[6], u[7], u[8]].map(([v, l], i) => ({
          v,
          l: ["Tempo no player", "Episódios", "Leitura", "Atividade"][i],
          s: l,
        })),
        note: "Tempo no player é o tempo com o embed aberto e a aba visível. Leitura é exata, porque o leitor é nosso.",
      },
      evFilters: efl.map(([k, label]) => ({
        label,
        pick: () => this.setState({ ef: k }),
        bg: s.ef === k ? "rgba(219,175,87,.12)" : "transparent",
        border: s.ef === k ? "#DBAF57" : "rgba(240,238,233,.14)",
        color: s.ef === k ? "#DBAF57" : "#D9D5CC",
      })),
      events,
      mod: mod
        ? {
            intro: mod[2],
            blocks: mod[3].map(([t, tag, items]) => ({
              t,
              tag: tagC[tag][2],
              tagBorder: tagC[tag][0],
              tagColor: tagC[tag][1],
              items,
            })),
          }
        : { intro: "", blocks: [] },
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
    text: "\nbody{margin:0;background:#0B0A09;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}\na{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}\n*{box-sizing:border-box}\ninput::placeholder{color:#8F897D}\n",
  },
];

function render(v) {
  return (
    <>
      <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "232px minmax(0,1fr)" }}>
        <aside
          style={{
            position: "sticky",
            top: "0",
            height: "100vh",
            overflowY: "auto",
            borderRight: "1px solid rgba(219,175,87,.12)",
            background: "#100E0D",
            display: "flex",
            flexDirection: "column",
            gap: "22px",
            padding: "20px 14px",
          }}
        >
          <a href="/" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 8px", color: "#F0EEE9" }}>
            <img
              src="/assets/nekoflow-logo.png"
              alt=""
              style={{ height: "26px", width: "auto", display: "block" }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <span style={{ display: "flex", flexDirection: "column", lineHeight: "1.1" }}>
              <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "22px", fontWeight: "600" }}>
                NekoFlow
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "600",
                  letterSpacing: ".26em",
                  textTransform: "uppercase",
                  color: "#DBAF57",
                }}
              >
                Admin
              </span>
            </span>
          </a>
          <a
            href="/"
            className="nk-hover-1owwy9a"
            style={{
              height: "36px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "0 10px",
              marginTop: "-10px",
              borderRadius: "8px",
              border: "1px solid rgba(219,175,87,.18)",
              fontSize: "13px",
              color: "#B7B1A4",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Voltar ao site
          </a>
          {asList(v.nav).map((g, $index) => (
            <React.Fragment key={$index}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "600",
                    letterSpacing: ".24em",
                    textTransform: "uppercase",
                    color: "#8F897D",
                    padding: "0 10px 6px",
                  }}
                >
                  {txt(g?.group)}
                </span>
                {asList(g?.items).map((it, $index) => (
                  <React.Fragment key={$index}>
                    <button
                      className="nk-hover-1owwy9a"
                      onClick={it?.go}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "38px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "0 10px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        background: `${it?.bg ?? ""}`,
                        color: `${it?.color ?? ""}`,
                      }}
                    >
                      <span
                        style={{
                          width: "5px",
                          height: "5px",
                          transform: "rotate(45deg)",
                          background: `${it?.mark ?? ""}`,
                          flexShrink: "0",
                        }}
                      />
                      <span style={{ flex: "1" }}>{txt(it?.label)}</span>
                      {it?.hasBadge ? (
                        <>
                          <span
                            style={{
                              minWidth: "22px",
                              height: "20px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "0 6px",
                              borderRadius: "999px",
                              background: `${it?.badgeBg ?? ""}`,
                              color: "#1A1714",
                              fontSize: "11px",
                              fontWeight: "600",
                            }}
                          >
                            {txt(it?.badge)}
                          </span>
                        </>
                      ) : null}
                      {it?.planned ? (
                        <>
                          <span style={{ fontSize: "10px", color: "#8F897D" }}>novo</span>
                        </>
                      ) : null}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </React.Fragment>
          ))}
          <span style={{ flex: "1" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px",
              borderRadius: "10px",
              background: "#1A1714",
            }}
          >
            <span
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "#2D2924",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: "600",
                color: "#DBAF57",
              }}
            >
              N
            </span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: "1.3", minWidth: "0" }}>
              <span style={{ fontSize: "13px", fontWeight: "600" }}>nekoflow</span>
              <span style={{ fontSize: "11px", color: "#B7B1A4" }}>Administrador</span>
            </span>
          </div>
        </aside>
        <main
          style={{
            minWidth: "0",
            padding: "26px clamp(18px,3vw,40px) 80px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <header style={{ display: "flex", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: "1", minWidth: "260px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  letterSpacing: ".24em",
                  textTransform: "uppercase",
                  color: "#DBAF57",
                }}
              >
                {txt(v.crumb)}
              </span>
              <h1
                style={{
                  margin: "0",
                  fontFamily: "'Cormorant Garamond',serif",
                  fontWeight: "500",
                  fontSize: "40px",
                  lineHeight: "1",
                }}
              >
                {txt(v.title)}
              </h1>
            </div>
            {v.isOverview ? (
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
                  {asList(v.periods).map((p, $index) => (
                    <React.Fragment key={$index}>
                      <button
                        onClick={p?.pick}
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
                          background: `${p?.bg ?? ""}`,
                          color: `${p?.color ?? ""}`,
                        }}
                      >
                        {txt(p?.label)}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </>
            ) : null}
          </header>
          {v.isOverview ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))",
                  gap: "12px",
                }}
              >
                {asList(v.kpis).map((k, $index) => (
                  <React.Fragment key={$index}>
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "14px",
                        background: "#1A1714",
                        border: "1px solid rgba(240,238,233,.06)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "12px",
                          color: "#B7B1A4",
                        }}
                      >
                        {k?.live ? (
                          <>
                            <span
                              style={{
                                width: "7px",
                                height: "7px",
                                borderRadius: "50%",
                                background: "#7FB77E",
                                boxShadow: "0 0 0 3px rgba(127,183,126,.2)",
                              }}
                            />
                          </>
                        ) : null}
                        {txt(k?.label)}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          fontSize: "28px",
                          fontWeight: "500",
                          color: `${k?.color ?? ""}`,
                        }}
                      >
                        {txt(k?.value)}
                      </span>
                      <span style={{ fontSize: "12px", color: "#8F897D" }}>{txt(k?.sub)}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,460px),1fr))",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    padding: "18px",
                    borderRadius: "14px",
                    background: "#1A1714",
                    border: "1px solid rgba(240,238,233,.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: "15px", fontWeight: "600" }}>Audiência</span>
                    <span style={{ display: "flex", gap: "14px", fontSize: "12px", color: "#B7B1A4" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#DBAF57" }} />
                        No player
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#4A433B" }} />
                        Navegando
                      </span>
                    </span>
                  </div>
                  <div style={{ height: "180px", display: "flex", alignItems: "flex-end", gap: "4px" }}>
                    {asList(v.bars).map((b, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          title={b?.tip}
                          style={{
                            flex: "1",
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "flex-end",
                            gap: "2px",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              height: `${b?.browse ?? ""}`,
                              background: "#4A433B",
                              borderRadius: "2px 2px 0 0",
                            }}
                          />
                          <span
                            style={{
                              display: "block",
                              height: `${b?.play ?? ""}`,
                              background: "#DBAF57",
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: "11px",
                      color: "#8F897D",
                    }}
                  >
                    {asList(v.barLabels).map((l, $index) => (
                      <React.Fragment key={$index}>
                        <span>{txt(l)}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    padding: "18px",
                    borderRadius: "14px",
                    background: "#1A1714",
                    border: "1px solid rgba(240,238,233,.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "15px", fontWeight: "600" }}>Sincronização HiAnime</span>
                    <button
                      onClick={v.goSync}
                      style={{ all: "unset", cursor: "pointer", fontSize: "13px", color: "#DBAF57" }}
                    >
                      Ver execuções
                    </button>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px",
                      borderRadius: "10px",
                      background: "rgba(127,183,126,.07)",
                      border: "1px solid rgba(127,183,126,.25)",
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#7FB77E",
                        flexShrink: "0",
                      }}
                    />
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "13px" }}>
                      <span style={{ fontWeight: "600" }}>Funcionando · a cada 15 min</span>
                      <span style={{ color: "#B7B1A4" }}>Última 20:30 · próxima 20:45 · 272 obras monitoradas</span>
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {asList(v.runsShort).map((r, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "9px 2px",
                            borderBottom: "1px solid rgba(240,238,233,.05)",
                            fontSize: "13px",
                          }}
                        >
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#B7B1A4", width: "44px" }}>
                            {txt(r?.t)}
                          </span>
                          <span style={{ flex: "1", color: `${r?.color ?? ""}` }}>{txt(r?.summary)}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
              <div
                style={{
                  padding: "18px",
                  borderRadius: "14px",
                  background: "#1A1714",
                  border: "1px solid rgba(240,238,233,.06)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  overflowX: "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: "15px", fontWeight: "600" }}>Obras em alta no NekoFlow</span>
                  <span style={{ fontSize: "12px", color: "#8F897D" }}>
                    Funil: card visto → clique → player → seguiu para o próximo episódio
                  </span>
                </div>
                <div
                  style={{
                    minWidth: "720px",
                    display: "grid",
                    gridTemplateColumns: "28px minmax(0,2.4fr) repeat(5,minmax(0,1fr))",
                    gap: "0 12px",
                    fontSize: "13px",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "#8F897D", padding: "8px 0" }}>#</span>
                  <span style={{ fontSize: "11px", color: "#8F897D", padding: "8px 0" }}>Obra</span>
                  <span style={{ fontSize: "11px", color: "#8F897D", padding: "8px 0", textAlign: "right" }}>
                    Impressões
                  </span>
                  <span style={{ fontSize: "11px", color: "#8F897D", padding: "8px 0", textAlign: "right" }}>
                    Cliques
                  </span>
                  <span style={{ fontSize: "11px", color: "#8F897D", padding: "8px 0", textAlign: "right" }}>CTR</span>
                  <span style={{ fontSize: "11px", color: "#8F897D", padding: "8px 0", textAlign: "right" }}>
                    Players abertos
                  </span>
                  <span style={{ fontSize: "11px", color: "#8F897D", padding: "8px 0", textAlign: "right" }}>
                    Seguiu p/ próximo
                  </span>
                  {asList(v.top).map((o, $index) => (
                    <React.Fragment key={$index}>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          color: "#DBAF57",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                        }}
                      >
                        {txt(o?.rank)}
                      </span>
                      <span
                        style={{
                          padding: "10px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                          minWidth: "0",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: "500",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {txt(o?.name)}
                        </span>
                        <span style={{ fontSize: "11px", color: "#8F897D" }}>{txt(o?.kind)}</span>
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          textAlign: "right",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                        }}
                      >
                        {txt(o?.imp)}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          textAlign: "right",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                        }}
                      >
                        {txt(o?.clk)}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          textAlign: "right",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                        }}
                      >
                        {txt(o?.ctr)}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          textAlign: "right",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                        }}
                      >
                        {txt(o?.plays)}
                      </span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono',monospace",
                          textAlign: "right",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                          color: `${o?.nextColor ?? ""}`,
                        }}
                      >
                        {txt(o?.next)}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    padding: "18px",
                    borderRadius: "14px",
                    background: "#1A1714",
                    border: "1px solid rgba(240,238,233,.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <span style={{ fontSize: "15px", fontWeight: "600" }}>Servidores</span>
                  <span style={{ fontSize: "12px", lineHeight: "1.5", color: "#8F897D" }}>
                    Embeds não informam erro. O sinal é o usuário trocar de servidor ou reportar, mais o teste
                    automático do link.
                  </span>
                  {asList(v.servers).map((s, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "10px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                        }}
                      >
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: `${s?.dot ?? ""}`,
                            flexShrink: "0",
                          }}
                        />
                        <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>{txt(s?.name)}</span>
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(s?.sub)}</span>
                        </span>
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono',monospace",
                            fontSize: "13px",
                            color: `${s?.dot ?? ""}`,
                          }}
                        >
                          {txt(s?.swap)}
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{
                    padding: "18px",
                    borderRadius: "14px",
                    background: "#1A1714",
                    border: "1px solid rgba(240,238,233,.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <span style={{ fontSize: "15px", fontWeight: "600" }}>Buscas sem resultado</span>
                  <span style={{ fontSize: "12px", lineHeight: "1.5", color: "#8F897D" }}>
                    O que pedem e o catálogo não tem. Vira pendência com um clique.
                  </span>
                  {asList(v.misses).map((m, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "8px 0",
                          borderTop: "1px solid rgba(240,238,233,.05)",
                        }}
                      >
                        <span style={{ flex: "1", fontSize: "14px" }}>{txt(m?.q)}</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#B7B1A4" }}>
                          {txt(m?.n)}×
                        </span>
                        <button
                          onClick={m?.add}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: `${m?.color ?? ""}`,
                          }}
                        >
                          {txt(m?.label)}
                        </button>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          {v.isPend ? (
            <>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {asList(v.pendFilters).map((f, $index) => (
                  <React.Fragment key={$index}>
                    <button
                      onClick={f?.pick}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "34px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "0 14px",
                        borderRadius: "999px",
                        fontSize: "13px",
                        border: `1px solid ${f?.border ?? ""}`,
                        background: `${f?.bg ?? ""}`,
                        color: `${f?.color ?? ""}`,
                      }}
                    >
                      {txt(f?.label)}
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", opacity: ".7" }}>
                        {txt(f?.n)}
                      </span>
                    </button>
                  </React.Fragment>
                ))}
                <span style={{ flex: "1" }} />
                <button
                  onClick={v.addManual}
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
                  Nova tarefa
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "14px",
                  background: "#1A1714",
                  border: "1px solid rgba(240,238,233,.06)",
                  overflow: "hidden",
                }}
              >
                {asList(v.pend).map((p, $index) => (
                  <React.Fragment key={$index}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        padding: "14px 16px",
                        borderTop: "1px solid rgba(240,238,233,.05)",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ width: "68px", fontSize: "11px", fontWeight: "600", color: `${p?.pColor ?? ""}` }}>
                        {txt(p?.prio)}
                      </span>
                      <span
                        style={{ flex: "1", minWidth: "240px", display: "flex", flexDirection: "column", gap: "3px" }}
                      >
                        <span style={{ fontSize: "14px", fontWeight: "500" }}>{txt(p?.title)}</span>
                        <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(p?.detail)}</span>
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "3px 8px",
                          borderRadius: "999px",
                          border: "1px solid rgba(240,238,233,.14)",
                          color: "#B7B1A4",
                          whiteSpace: "nowrap",
                          flexShrink: "0",
                        }}
                      >
                        {txt(p?.kind)}
                      </span>
                      <span style={{ width: "110px", fontSize: "12px", color: "#8F897D" }}>
                        {txt(p?.origin)}
                        {" · "}
                        {txt(p?.age)}
                      </span>
                      <button
                        className="nk-hover-ucdklh"
                        onClick={p?.act}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          height: "32px",
                          display: "flex",
                          alignItems: "center",
                          padding: "0 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(219,175,87,.35)",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#DBAF57",
                        }}
                      >
                        {txt(p?.action)}
                      </button>
                      <button
                        className="nk-hover-bgfie1"
                        onClick={p?.done}
                        aria-label="Marcar como resolvida"
                        title="Marcar como resolvida"
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#8F897D",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                        >
                          <path d="M5 12l5 5 9-10" />
                        </svg>
                      </button>
                    </div>
                  </React.Fragment>
                ))}
                {v.pendEmpty ? (
                  <>
                    <span style={{ padding: "40px", textAlign: "center", fontSize: "14px", color: "#B7B1A4" }}>
                      Nada pendente neste filtro.
                    </span>
                  </>
                ) : null}
              </div>
              <span style={{ fontSize: "12px", lineHeight: "1.6", color: "#8F897D", maxWidth: "760px" }}>
                As automáticas nascem da sincronização, do teste de embeds, das buscas sem resultado, das solicitações e
                dos reports do player. Somem sozinhas quando o problema é corrigido.
              </span>
            </>
          ) : null}
          {v.isSync ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))",
                  gap: "12px",
                }}
              >
                {asList(v.providers).map((v, $index) => (
                  <React.Fragment key={$index}>
                    <div
                      style={{
                        padding: "16px",
                        borderRadius: "14px",
                        background: "#1A1714",
                        border: `1px solid ${v?.border ?? ""}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{ width: "8px", height: "8px", borderRadius: "50%", background: `${v?.dot ?? ""}` }}
                        />
                        <span style={{ fontSize: "15px", fontWeight: "600" }}>{txt(v?.name)}</span>
                      </span>
                      <span style={{ fontSize: "13px", color: "#D9D5CC" }}>{txt(v?.role)}</span>
                      <span style={{ fontSize: "12px", color: "#8F897D" }}>{txt(v?.meta)}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "15px", fontWeight: "600", flex: "1" }}>Execuções</span>
                <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(v.syncState)}</span>
                <button
                  onClick={v.runNow}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    height: "38px",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 16px",
                    borderRadius: "999px",
                    border: "1px solid rgba(219,175,87,.4)",
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#DBAF57",
                  }}
                >
                  Buscar atualizações agora
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "14px",
                  background: "#1A1714",
                  border: "1px solid rgba(240,238,233,.06)",
                  overflow: "hidden",
                }}
              >
                {asList(v.runs).map((r, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ borderTop: "1px solid rgba(240,238,233,.05)" }}>
                      {" "}
                      <button
                        className="nk-hover-zkly44"
                        onClick={r?.toggle}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          width: "100%",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          gap: "14px",
                          padding: "13px 16px",
                        }}
                      >
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: `${r?.dot ?? ""}`,
                            flexShrink: "0",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono',monospace",
                            fontSize: "13px",
                            color: "#B7B1A4",
                            width: "92px",
                          }}
                        >
                          {txt(r?.when)}
                        </span>
                        <span style={{ flex: "1", fontSize: "14px", color: `${r?.color ?? ""}` }}>
                          {txt(r?.summary)}
                        </span>
                        <span style={{ fontSize: "12px", color: "#8F897D" }}>
                          {txt(r?.trigger)}
                          {" · "}
                          {txt(r?.dur)}
                        </span>
                        {r?.hasItems ? (
                          <>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#B7B1A4"
                              strokeWidth="2.4"
                              style={{ transform: `rotate(${r?.rot ?? ""})` }}
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </>
                        ) : null}
                      </button>{" "}
                      {r?.open ? (
                        <>
                          {" "}
                          <div
                            style={{
                              padding: "0 16px 14px 122px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                            }}
                          >
                            {asList(r?.items).map((x, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    fontSize: "13px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <span style={{ fontWeight: "500" }}>{txt(x?.anime)}</span>
                                  <span style={{ color: "#B7B1A4" }}>{txt(x?.ep)}</span>
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      padding: "2px 8px",
                                      borderRadius: "999px",
                                      border: `1px solid ${x?.border ?? ""}`,
                                      color: `${x?.color ?? ""}`,
                                      whiteSpace: "nowrap",
                                      flexShrink: "0",
                                    }}
                                  >
                                    {txt(x?.res)}
                                  </span>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>{" "}
                        </>
                      ) : null}{" "}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </>
          ) : null}
          {v.isUsers ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))",
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: "14px",
                    background: "#1A1714",
                    border: "1px solid rgba(240,238,233,.06)",
                    overflow: "hidden",
                    maxWidth: "360px",
                  }}
                >
                  <div style={{ padding: "12px", borderBottom: "1px solid rgba(240,238,233,.06)" }}>
                    <div
                      style={{
                        height: "38px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "0 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(240,238,233,.12)",
                        fontSize: "13px",
                        color: "#8F897D",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                      Buscar por nome, e-mail ou #id
                    </div>
                  </div>
                  {asList(v.users).map((u, $index) => (
                    <React.Fragment key={$index}>
                      <button
                        className="nk-hover-zkly44"
                        onClick={u?.pick}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px",
                          background: `${u?.bg ?? ""}`,
                          borderLeft: `2px solid ${u?.edge ?? ""}`,
                        }}
                      >
                        <span
                          style={{
                            position: "relative",
                            width: "34px",
                            height: "34px",
                            borderRadius: "50%",
                            background: "#2D2924",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "#DBAF57",
                            flexShrink: "0",
                          }}
                        >
                          {txt(u?.ini)}
                          <span
                            style={{
                              position: "absolute",
                              right: "-1px",
                              bottom: "-1px",
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              border: "2px solid #1A1714",
                              background: `${u?.dot ?? ""}`,
                            }}
                          />
                        </span>
                        <span
                          style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}
                        >
                          <span style={{ fontSize: "14px", fontWeight: "500" }}>{txt(u?.name)}</span>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#B7B1A4",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {txt(u?.now)}
                          </span>
                        </span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{ gridColumn: "span 2", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        width: "52px",
                        height: "52px",
                        borderRadius: "50%",
                        background: "#2D2924",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "18px",
                        fontWeight: "600",
                        color: "#DBAF57",
                      }}
                    >
                      {txt(v.cu?.ini)}
                    </span>
                    <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span
                        style={{
                          fontFamily: "'Cormorant Garamond',serif",
                          fontSize: "28px",
                          fontWeight: "500",
                          lineHeight: "1",
                        }}
                      >
                        {txt(v.cu?.name)}
                      </span>
                      <span style={{ fontSize: "13px", color: "#B7B1A4" }}>{txt(v.cu?.meta)}</span>
                    </span>
                    <button
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "36px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 14px",
                        borderRadius: "8px",
                        border: "1px solid rgba(240,238,233,.18)",
                        fontSize: "13px",
                      }}
                    >
                      Alterar papel
                    </button>
                    <button
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "36px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 14px",
                        borderRadius: "8px",
                        border: "1px solid rgba(240,238,233,.18)",
                        fontSize: "13px",
                      }}
                    >
                      Exportar histórico
                    </button>
                    <button
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        height: "36px",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 14px",
                        borderRadius: "8px",
                        border: "1px solid rgba(217,115,91,.45)",
                        fontSize: "13px",
                        color: "#E08A72",
                      }}
                    >
                      Suspender
                    </button>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,150px),1fr))",
                      gap: "10px",
                    }}
                  >
                    {asList(v.cu?.kpis).map((k, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            padding: "14px",
                            borderRadius: "12px",
                            background: "#1A1714",
                            border: "1px solid rgba(240,238,233,.06)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(k?.l)}</span>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "22px" }}>
                            {txt(k?.v)}
                          </span>
                          <span style={{ fontSize: "11px", color: "#8F897D" }}>{txt(k?.s)}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {asList(v.evFilters).map((f, $index) => (
                      <React.Fragment key={$index}>
                        <button
                          onClick={f?.pick}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            height: "32px",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 12px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            border: `1px solid ${f?.border ?? ""}`,
                            background: `${f?.bg ?? ""}`,
                            color: `${f?.color ?? ""}`,
                          }}
                        >
                          {txt(f?.label)}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: "14px",
                      background: "#1A1714",
                      border: "1px solid rgba(240,238,233,.06)",
                      overflow: "hidden",
                    }}
                  >
                    {asList(v.events).map((e, $index) => (
                      <React.Fragment key={$index}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "14px",
                            padding: "12px 16px",
                            borderTop: "1px solid rgba(240,238,233,.05)",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: "12px",
                              color: "#8F897D",
                              width: "44px",
                              paddingTop: "2px",
                            }}
                          >
                            {txt(e?.t)}
                          </span>
                          <span
                            style={{
                              width: "86px",
                              fontSize: "11px",
                              fontWeight: "600",
                              letterSpacing: ".06em",
                              textTransform: "uppercase",
                              color: `${e?.color ?? ""}`,
                              paddingTop: "3px",
                            }}
                          >
                            {txt(e?.type)}
                          </span>
                          <span
                            style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}
                          >
                            <span style={{ fontSize: "14px" }}>{txt(e?.title)}</span>
                            <span style={{ fontSize: "12px", color: "#B7B1A4" }}>{txt(e?.detail)}</span>
                          </span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <span style={{ fontSize: "12px", color: "#8F897D" }}>{txt(v.cu?.note)}</span>
                </div>
              </div>
            </>
          ) : null}
          {v.isPlanned ? (
            <>
              <p style={{ margin: "0", maxWidth: "760px", fontSize: "15px", lineHeight: "1.6", color: "#D9D5CC" }}>
                {txt(v.mod?.intro)}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
                  gap: "12px",
                }}
              >
                {asList(v.mod?.blocks).map((b, $index) => (
                  <React.Fragment key={$index}>
                    <div
                      style={{
                        padding: "18px",
                        borderRadius: "14px",
                        background: "#1A1714",
                        border: "1px solid rgba(240,238,233,.06)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      <span
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}
                      >
                        <span style={{ fontSize: "15px", fontWeight: "600" }}>{txt(b?.t)}</span>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            border: `1px solid ${b?.tagBorder ?? ""}`,
                            color: `${b?.tagColor ?? ""}`,
                          }}
                        >
                          {txt(b?.tag)}
                        </span>
                      </span>
                      {asList(b?.items).map((i, $index) => (
                        <React.Fragment key={$index}>
                          <span
                            style={{
                              display: "flex",
                              gap: "10px",
                              fontSize: "13px",
                              lineHeight: "1.5",
                              color: "#D9D5CC",
                            }}
                          >
                            <span
                              style={{
                                width: "5px",
                                height: "5px",
                                marginTop: "8px",
                                transform: "rotate(45deg)",
                                background: "#DBAF57",
                                flexShrink: "0",
                              }}
                            />
                            {txt(i)}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </>
          ) : null}
        </main>
        {v.toast ? (
          <>
            <div
              style={{
                position: "fixed",
                left: "50%",
                bottom: "28px",
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
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

export const defaults = {};

export default defineDC("Admin", AdminPainelLogic, render, { helmet });
