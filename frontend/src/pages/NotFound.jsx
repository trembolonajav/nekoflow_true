import React from "react";
import Shell from "../ui/Shell";
import { routePaths } from "../app/routePaths";
import { C, F, btn, container } from "../ui/tokens";

export default function NotFound({ loggedIn }) {
  return (
    <Shell loggedIn={loggedIn}>
      <section
        style={{
          ...container(760),
          alignItems: "flex-start",
          paddingTop: "160px",
        }}
      >
        <span
          style={{
            color: C.gold,
            fontFamily: F.mono,
            letterSpacing: ".22em",
            textTransform: "uppercase",
          }}
        >
          Erro 404
        </span>
        <h1
          style={{
            margin: 0,
            fontFamily: F.serif,
            fontWeight: 500,
            fontSize: "clamp(42px,8vw,72px)",
          }}
        >
          Esta página não foi encontrada.
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "600px",
            color: C.muted,
            lineHeight: 1.7,
          }}
        >
          O endereço pode ter mudado ou pertencer a uma funcionalidade que ainda
          não foi publicada.
        </p>
        <a href={routePaths.home} style={btn("primary")}>
          Voltar para o início
        </a>
      </section>
    </Shell>
  );
}
