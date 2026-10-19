import React from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import MobileNav from "../components/MobileNav";
import { goLogin, session } from "../lib/session";
import { routes } from "./router";

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

const router = createBrowserRouter(
  routes.map((route) => ({
    path: route.path,
    element: <Guarded route={route} />,
  })),
);

export default function App() {
  return <RouterProvider router={router} />;
}
