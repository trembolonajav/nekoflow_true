// Moldura das telas novas: mesmo CSS base das telas do design + Header e Footer.
import React, { useLayoutEffect } from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { page } from "./tokens";

const BASE_CSS =
  "body{margin:0;background:#171411;color:#F0EEE9;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}" +
  "a{color:#DBAF57;text-decoration:none}a:hover{color:#F0EEE9}*{box-sizing:border-box}";

export default function Shell({ children, loggedIn = true }) {
  useLayoutEffect(() => {
    let el = document.querySelector("style[data-nk-base]");
    if (!el) {
      el = document.createElement("style");
      el.setAttribute("data-nk-base", "");
      el.textContent = BASE_CSS;
      document.head.appendChild(el);
    }
  }, []);
  return (
    <div className="sc-host" style={page}>
      <Header
        active=""
        loggedIn={loggedIn}
        solid={true}
        __hostStyle={{ position: "absolute", top: "0", left: "0", right: "0", height: "0", zIndex: "50" }}
      />
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</main>
      <Footer />
    </div>
  );
}
