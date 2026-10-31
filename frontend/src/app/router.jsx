import React, { useEffect } from "react";
import Home, { defaults as homeDefaults } from "../pages/Home";
import HomeDirecoes, {
  defaults as homeDirecoesDefaults,
} from "../pages/HomeDirecoes";
import Calendario, {
  defaults as calendarioDefaults,
} from "../pages/Calendario";
import Conta, { defaults as contaDefaults } from "../pages/Conta";
import Entrar, { defaults as entrarDefaults } from "../pages/Entrar";
import Explorar, { defaults as explorarDefaults } from "../pages/Explorar";
import Leituras, { defaults as leiturasDefaults } from "../pages/Leituras";
import Obra, { defaults as obraDefaults } from "../pages/Obra";
import ObraLeitura, {
  defaults as obraLeituraDefaults,
} from "../pages/ObraLeitura";
import Leitor, { defaults as leitorDefaults } from "../pages/Leitor";
import Player, { defaults as playerDefaults } from "../pages/Player";
import SolicitacaoDetalhe from "../pages/SolicitacaoDetalhe";
import Admin from "../pages/Admin";
import AdminPainel from "../pages/AdminPainel";
import NotFound from "../pages/NotFound";
import WorkRoute from "../pages/WorkRoute";
import { canonicalWorks } from "../features/catalog/workNavigation";
import { accountTab, routePaths } from "./routePaths";

function alias(to) {
  return function Redirect() {
    useEffect(() => {
      const destination = new URL(to, location.origin);
      const incoming = new URLSearchParams(location.search);
      incoming.forEach((value, key) =>
        destination.searchParams.append(key, value),
      );
      location.replace(destination.pathname + destination.search);
    }, []);
    return null;
  };
}

export const routes = [
  { path: routePaths.home, Component: Home, defaults: homeDefaults },
  {
    path: routePaths.homeDirections,
    Component: HomeDirecoes,
    defaults: homeDirecoesDefaults,
  },
  {
    path: routePaths.calendar,
    Component: Calendario,
    defaults: calendarioDefaults,
  },
  {
    path: routePaths.account,
    Component: Conta,
    defaults: contaDefaults,
    auth: true,
  },
  {
    path: routePaths.login,
    Component: Entrar,
    defaults: entrarDefaults,
    nav: false,
  },
  {
    path: routePaths.createAccount,
    Component: alias(`${routePaths.login}?modo=criar`),
    defaults: {},
    nav: false,
  },
  { path: routePaths.explore, Component: Explorar, defaults: explorarDefaults },
  {
    path: routePaths.animes,
    Component: Explorar,
    defaults: {
      ...explorarDefaults,
      initialKind: "animes",
      pageTitle: "Animes",
      pageSubtitle: "Animes e filmes de anime do catálogo NekoFlow.",
      activeSection: "animes",
    },
  },
  {
    path: routePaths.readings,
    Component: Leituras,
    defaults: leiturasDefaults,
  },
  {
    path: routePaths.animeWork,
    Component: WorkRoute,
    defaults: {
      section: "animes",
      RichComponent: Obra,
      richDefaults: obraDefaults,
    },
  },
  {
    path: routePaths.readingWork,
    Component: WorkRoute,
    defaults: {
      section: "leituras",
      RichComponent: ObraLeitura,
      richDefaults: obraLeituraDefaults,
    },
  },
  {
    path: routePaths.legacyAnimeWork,
    Component: alias(canonicalWorks.soloLevelingAnime),
    defaults: {},
    nav: false,
  },
  {
    path: routePaths.legacyReadingWork,
    Component: alias(canonicalWorks.soloLevelingReading),
    defaults: {},
    nav: false,
  },
  {
    path: routePaths.reader,
    Component: Leitor,
    defaults: leitorDefaults,
    nav: false,
  },
  { path: routePaths.player, Component: Player, defaults: playerDefaults },
  {
    path: routePaths.requestDetail,
    Component: SolicitacaoDetalhe,
    defaults: {},
    auth: true,
  },
  // Painel do Claude Design (Admin.dc.html); o painel operacional anterior segue em /admin/operacao.
  { path: routePaths.admin, Component: AdminPainel, defaults: {}, staff: true, nav: false },
  { path: routePaths.adminOperations, Component: Admin, defaults: {}, staff: true },
  {
    path: routePaths.library,
    Component: alias(accountTab("lista")),
    defaults: {},
    nav: false,
  },
  {
    path: routePaths.continueWatching,
    Component: alias(accountTab("assistindo")),
    defaults: {},
    nav: false,
  },
  {
    path: routePaths.continueReading,
    Component: alias(accountTab("lendo")),
    defaults: {},
    nav: false,
  },
  {
    path: routePaths.history,
    Component: alias(accountTab("historico")),
    defaults: {},
    nav: false,
  },
  {
    path: routePaths.requests,
    Component: alias(accountTab("solicitacoes")),
    defaults: {},
    nav: false,
  },
  {
    path: routePaths.notifications,
    Component: alias(accountTab("notificacoes")),
    defaults: {},
    nav: false,
  },
  {
    path: routePaths.settings,
    Component: alias(accountTab("configuracoes")),
    defaults: {},
    nav: false,
  },
  { path: "*", Component: NotFound, defaults: {} },
];
