import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import MobileNav from "../components/MobileNav";
import { goLogin, session } from "../lib/session";
import { routes } from "./router";
import { AuthProvider, useAuth } from "../features/auth/AuthProvider";

function Guarded({ route }) {
  const authState = useAuth();
  const { Component, defaults, auth, staff, nav = true } = route;
  if ((auth || staff) && authState.authState === "loading") return null;
  if ((auth || staff) && authState.authState === "unavailable") {
    return <main style={{padding:"140px 24px",color:"#F0EEE9",textAlign:"center"}}>Não foi possível confirmar sua sessão. Verifique a conexão e tente novamente.</main>;
  }
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

const router = createBrowserRouter(
  routes.map((route) => ({
    path: route.path,
    element: <Guarded route={route} />,
  })),
);

export default function App() {
  return <AuthProvider><RouterProvider router={router} /></AuthProvider>;
}
