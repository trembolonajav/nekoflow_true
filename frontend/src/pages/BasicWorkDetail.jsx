import React, { useEffect, useState } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { goLogin } from "../lib/session";
import { api } from "../services/api";

const labelStyle = {
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "#DBAF57",
};

export default function BasicWorkDetail({
  work,
  section,
  loading = false,
  missing = false,
  loggedIn = false,
}) {
  const [catalog, setCatalog] = useState({ seasons: [], episodes: [], chapters: [], relations: [], contributors: [] });
  useEffect(() => {
    let active = true;
    if (!work?.id || !work?.mediaFamily) return undefined;
    const common = [
      api.get(`/api/v1/works/${work.id}/relations`).catch(() => []),
      api.get(`/api/v1/works/${work.id}/contributors`).catch(() => []),
    ];
    const media = work.mediaFamily === "ANIMATION"
      ? api.get(`/api/v1/works/${work.id}/seasons`).then(async (seasons) => ({ seasons, episodes: (await Promise.all(seasons.map((s) => api.get(`/api/v1/seasons/${s.id}/episodes`)))).flat() }))
      : api.get(`/api/v1/works/${work.id}/chapters`).then((chapters) => ({ chapters }));
    Promise.all([...common, media]).then(([relations, contributors, units]) => {
      if (active) setCatalog({ seasons: [], episodes: [], chapters: [], relations, contributors, ...units });
    });
    return () => { active = false; };
  }, [work?.id, work?.mediaFamily]);
  const title = loading
    ? "Carregando obra…"
    : missing
      ? "Obra não encontrada"
      : work.title;
  const activeSection = work?.section || section;
  const explore = activeSection === "animes" ? "/animes" : "/leituras";
  const units = work?.availableUnits ?? work?.totalUnits;
  const cover = work?.coverUrl || work?.cover;
  const banner = work?.bannerUrl || work?.banner;
  const synopsis = work?.synopsis || work?.synopsisShort;
  const typeLabel = work?.mediaFamily === "ANIMATION" ? "Anime" : work?.readingCategory === "MANGA" ? "Mangá" : work?.typeLabel;
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#171411",
        color: "#F0EEE9",
        fontFamily: "Inter,system-ui,sans-serif",
      }}
    >
      <Header
        active={activeSection === "animes" ? "animes" : "leituras"}
        loggedIn={loggedIn}
        solid
      />
      <main
        style={{
          minHeight: "72vh",
          padding: "112px clamp(20px,5vw,72px) 72px",
        }}
      >
        <section
          style={{
            minHeight: "420px",
            borderRadius: "20px",
            overflow: "hidden",
            border: "1px solid rgba(219,175,87,.15)",
            background: banner
              ? `linear-gradient(90deg,rgba(20,18,16,.98),rgba(20,18,16,.72)),url(${banner}) center/cover`
              : "linear-gradient(135deg,#221F1B,#171411)",
            display: "grid",
            gridTemplateColumns: cover
              ? "repeat(auto-fit,minmax(min(100%,260px),1fr))"
              : "1fr",
            gap: "clamp(24px,5vw,64px)",
            alignItems: "center",
            padding: "clamp(24px,5vw,64px)",
          }}
        >
          {cover && (
            <img
              src={cover}
              alt={`Capa de ${work.title}`}
              style={{
                width: "100%",
                maxWidth: "240px",
                borderRadius: "12px",
                justifySelf: "center",
              }}
            />
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              maxWidth: "760px",
            }}
          >
            <span style={labelStyle}>
              {missing ? "Catálogo" : typeLabel || "NekoFlow"}
            </span>
            <h1
              style={{
                margin: 0,
                fontFamily: "'Cormorant Garamond',serif",
                fontWeight: 500,
                fontSize: "clamp(42px,7vw,78px)",
                lineHeight: 1,
              }}
            >
              {title}
            </h1>
            {!loading && !missing && (
              <>
                {(work.alt || work.titles?.length > 1) && (
                  <p style={{ margin: 0, color: "#B7B1A4", lineHeight: 1.6 }}>
                    {work.alt ? work.alt.split(" | ").join(" · ") : work.titles.slice(1).map((x) => x.title).join(" · ")}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    color: "#D9D5CC",
                  }}
                >
                  {[
                    work.year,
                    work.storyStatus || work.status,
                    units != null
                      ? `${units} ${work.mediaFamily === "ANIMATION" || work.section === "animes" ? "episódios disponíveis" : "capítulos disponíveis"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .map((item) => (
                      <span
                        key={item}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid rgba(240,238,233,.14)",
                          borderRadius: "999px",
                        }}
                      >
                        {item}
                      </span>
                    ))}
                </div>
                <p style={{ margin: 0, color: "#B7B1A4", lineHeight: 1.7 }}>
                  {synopsis || "A sinopse desta obra ainda não foi cadastrada."}
                </p>
              </>
            )}
            {missing && (
              <p style={{ margin: 0, color: "#B7B1A4" }}>
                O endereço não corresponde a nenhuma obra cadastrada.
              </p>
            )}
            {!loading && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                <a
                  href={missing ? "/explorar" : explore}
                  style={{
                    padding: "12px 18px",
                    borderRadius: "8px",
                    background: "#DBAF57",
                    color: "#1A1714",
                    fontWeight: 600,
                  }}
                >
                  {missing
                    ? "Voltar ao catálogo"
                    : "Explorar obras semelhantes"}
                </a>
                {!missing && !loggedIn && (
                  <button
                    onClick={goLogin}
                    style={{
                      padding: "12px 18px",
                      borderRadius: "8px",
                      border: "1px solid rgba(219,175,87,.5)",
                      background: "transparent",
                      color: "#DBAF57",
                      cursor: "pointer",
                    }}
                  >
                    Entrar para adicionar à lista
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
        {!loading && !missing && (
          <section style={{ maxWidth: "1180px", margin: "36px auto 0", display: "grid", gap: "28px" }}>
            {!!work.genres?.length && <div><span style={labelStyle}>Gêneros</span><p style={{ color: "#D9D5CC" }}>{work.genres.map((g) => g.name).join(" · ")}</p></div>}
            <CatalogUnits work={work} catalog={catalog} loggedIn={loggedIn} />
            {!!catalog.contributors.length && <div><span style={labelStyle}>Equipe</span><p style={{ color: "#D9D5CC" }}>{catalog.contributors.map((x) => `${x.name} — ${String(x.role).replaceAll("_", " ")}`).join(" · ")}</p></div>}
            {!!catalog.relations.length && <div><span style={labelStyle}>Obras relacionadas</span><div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "12px" }}>{catalog.relations.map((x) => <a key={`${x.id}-${x.direction}`} href={`${x.media_family === "ANIMATION" ? "/animes/" : "/leituras/"}${x.slug}`} style={{ color: "#DBAF57" }}>{x.title}</a>)}</div></div>}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

function CatalogUnits({ work, catalog, loggedIn }) {
  const [opening, setOpening] = useState(null);
  const open = async (kind, id) => {
    setOpening(id);
    try {
      const source = await api.get(`/api/v1/${kind}/${id}/source`);
      if (source.source_type === "EMBED" && source.embed_allowed) location.href = `/player?episode=${id}`;
      else window.open(source.source_url, "_blank", "noopener,noreferrer");
    } finally { setOpening(null); }
  };
  const rows = work.mediaFamily === "ANIMATION" ? catalog.episodes : catalog.chapters;
  const noun = work.mediaFamily === "ANIMATION" ? "episódios" : "capítulos";
  if (!rows.length) return <div><span style={labelStyle}>{noun}</span><p style={{ color: "#B7B1A4" }}>Nenhum {noun.slice(0, -1)} disponível foi cadastrado.</p></div>;
  return <div><span style={labelStyle}>{noun}</span><div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>{rows.map((x) => {
    const available = x.has_source;
    return <div key={x.id} style={{ padding: "14px 16px", border: "1px solid rgba(240,238,233,.12)", borderRadius: "10px", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center" }}>
      <div><strong>{work.mediaFamily === "ANIMATION" ? "Episódio" : "Capítulo"} {x.display_number}</strong>{x.title && <span style={{ color: "#B7B1A4" }}> · {x.title}</span>}<div style={{ color: available ? "#8BCB88" : "#827B70", fontSize: "12px", marginTop: "4px" }}>{available ? "Fonte verificada" : "Indisponível"}</div></div>
      {available && <button disabled={opening === x.id} onClick={() => open(work.mediaFamily === "ANIMATION" ? "episodes" : "chapters", x.id)} style={{ border: 0, borderRadius: "8px", padding: "10px 14px", background: "#DBAF57", color: "#1A1714", cursor: "pointer", fontWeight: 600 }}>{opening === x.id ? "Abrindo…" : work.mediaFamily === "ANIMATION" ? "Assistir" : "Ler no provedor"}</button>}
    </div>;
  })}</div>{work.mediaFamily === "READING" && <p style={{ color: "#827B70", fontSize: "12px" }}>A leitura externa não produz progresso automático. Usuários autenticados podem registrar conclusão manual.</p>}{!loggedIn && <p style={{ color: "#827B70", fontSize: "12px" }}>Entre na conta para sincronizar biblioteca e progresso.</p>}</div>;
}
