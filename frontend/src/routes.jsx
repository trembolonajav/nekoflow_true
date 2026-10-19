// Rotas do app. auth = exige login (volta para a página de origem depois);
// staff = exige papel de moderador ou acima (validado também no servidor).
import React, { useEffect } from "react";
import Home, { defaults as homeDefaults } from "./pages/Home";
import HomeDirecoes, { defaults as homeDirecoesDefaults } from "./pages/HomeDirecoes";
import Calendario, { defaults as calendarioDefaults } from "./pages/Calendario";
import Conta, { defaults as contaDefaults } from "./pages/Conta";
import Entrar, { defaults as entrarDefaults } from "./pages/Entrar";
import Explorar, { defaults as explorarDefaults } from "./pages/Explorar";
import Leituras, { defaults as leiturasDefaults } from "./pages/Leituras";
import Obra, { defaults as obraDefaults } from "./pages/Obra";
import ObraLeitura, { defaults as obraLeituraDefaults } from "./pages/ObraLeitura";
import Leitor, { defaults as leitorDefaults } from "./pages/Leitor";
import Player, { defaults as playerDefaults } from "./pages/Player";
import SolicitacaoDetalhe from "./pages/SolicitacaoDetalhe";
import Admin from "./pages/Admin";

/** Atalhos com nomes padronizados que apontam para as abas da Conta. */
function alias(to) {
  return function Redirect() {
    useEffect(() => {
      const extra = location.search ? "&" + location.search.slice(1) : "";
      location.replace(to + extra);
    }, []);
    return null;
  };
}

export const routes = [
  { path: "/", Component: Home, defaults: homeDefaults },
  { path: "/estudos/home-direcoes", Component: HomeDirecoes, defaults: homeDirecoesDefaults },
  { path: "/calendario", Component: Calendario, defaults: calendarioDefaults },
  { path: "/conta", Component: Conta, defaults: contaDefaults, auth: true },
  { path: "/entrar", Component: Entrar, defaults: entrarDefaults, nav: false },
  { path: "/explorar", Component: Explorar, defaults: explorarDefaults },
  { path: "/leituras", Component: Leituras, defaults: leiturasDefaults },
  { path: "/obra", Component: Obra, defaults: obraDefaults },
  { path: "/obra-leitura", Component: ObraLeitura, defaults: obraLeituraDefaults },
  { path: "/leitor", Component: Leitor, defaults: leitorDefaults, nav: false },
  { path: "/player", Component: Player, defaults: playerDefaults },
  { path: "/solicitacoes/:id", Component: SolicitacaoDetalhe, defaults: {}, auth: true },
  { path: "/admin", Component: Admin, defaults: {}, staff: true },
  { path: "/biblioteca", Component: alias("/conta?aba=lista"), defaults: {}, nav: false },
  { path: "/continuar-assistindo", Component: alias("/conta?aba=assistindo"), defaults: {}, nav: false },
  { path: "/continuar-lendo", Component: alias("/conta?aba=lendo"), defaults: {}, nav: false },
  { path: "/historico", Component: alias("/conta?aba=historico"), defaults: {}, nav: false },
  { path: "/solicitacoes", Component: alias("/conta?aba=solicitacoes"), defaults: {}, nav: false },
  { path: "/notificacoes", Component: alias("/conta?aba=notificacoes"), defaults: {}, nav: false },
  { path: "/configuracoes", Component: alias("/conta?aba=configuracoes"), defaults: {}, nav: false },
  { path: "*", Component: Home, defaults: homeDefaults },
];
