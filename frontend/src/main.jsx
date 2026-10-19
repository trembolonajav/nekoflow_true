import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./styles/base.css";
import "./styles/pseudo.generated.css";
import "./styles/mobile.css";
import { routes } from "./routes";
import { session, goLogin } from "./lib/session";
import MobileNav from "./components/MobileNav";

/** Rotas privadas exigem login (e voltam para a página de origem depois). */
function Guarded({ route }) {
  const { Component, defaults, auth, staff, nav = true } = route;
  if ((auth || staff) && !session.loggedIn) {
    goLogin();
    return null;
  }
  if (staff && !session.user.staff) {
    location.replace("/");
    return null;
  }
  return (
    <>
      <Component {...defaults} loggedIn={session.loggedIn} />
      {nav && <MobileNav />}
    </>
  );
}

session.load().then(() => {
  const router = createBrowserRouter(routes.map((r) => ({ path: r.path, element: <Guarded route={r} /> })));
  // Reaproveita a raiz no hot reload do Vite (evita duas raízes no mesmo elemento).
  const el = document.getElementById("dc-root");
  el.__root = el.__root || createRoot(el);
  el.__root.render(<RouterProvider router={router} />);
});
