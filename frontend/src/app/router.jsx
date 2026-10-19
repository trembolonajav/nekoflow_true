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
import NotFound from "../pages/NotFound";
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
  { path: routePaths.explore, Component: Explorar, defaults: explorarDefaults },
  {
    path: routePaths.readings,
    Component: Leituras,
    defaults: leiturasDefaults,
  },
  { path: routePaths.animeWork, Component: Obra, defaults: obraDefaults },
  {
    path: routePaths.readingWork,
    Component: ObraLeitura,
    defaults: obraLeituraDefaults,
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
  { path: routePaths.admin, Component: Admin, defaults: {}, staff: true },
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
