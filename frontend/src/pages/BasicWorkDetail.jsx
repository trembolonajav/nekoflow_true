import React, { useEffect, useState } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { goLogin } from "../lib/session";
import { api } from "../services/api";
import { libraryApi } from "../features/library/libraryApi";
import { progressApi } from "../features/progress/progressApi";

const labelStyle = {
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: ".2em",
  textTransform: "uppercase",
  color: "#DBAF57",
};

export default function BasicWorkDetail({ work, section, loading = false, missing = false, loggedIn = false }) {
  const [catalog, setCatalog] = useState({ seasons: [], episodes: [], chapters: [], relations: [], contributors: [] });
  useEffect(() => {
    let active = true;
    if (!work?.id || !work?.mediaFamily) return undefined;
    const common = [
      api.get(`/api/v1/works/${work.id}/relations`).catch(() => []),
      api.get(`/api/v1/works/${work.id}/contributors`).catch(() => []),
    ];
    const media =
      work.mediaFamily === "ANIMATION"
        ? api
            .get(`/api/v1/works/${work.id}/seasons`)
            .then(async (seasons) => ({
              seasons,
              episodes: (await Promise.all(seasons.map((s) => api.get(`/api/v1/seasons/${s.id}/episodes`)))).flat(),
            }))
        : api.get(`/api/v1/works/${work.id}/chapters`).then((chapters) => ({ chapters }));
    Promise.all([...common, media]).then(([relations, contributors, units]) => {
      if (active) setCatalog({ seasons: [], episodes: [], chapters: [], relations, contributors, ...units });
    });
    return () => {
      active = false;
    };
  }, [work?.id, work?.mediaFamily]);
  const title = loading ? "Carregando obra…" : missing ? "Obra não encontrada" : work.title;
  const activeSection = work?.section || section;
  const explore = activeSection === "animes" ? "/animes" : "/leituras";
  const units = work?.availableUnits ?? work?.totalUnits;
  const cover = work?.coverUrl || work?.cover;
  const banner = work?.bannerUrl || work?.banner;
  const synopsis = work?.synopsis || work?.synopsisShort;
  const typeLabel =
    work?.mediaFamily === "ANIMATION" ? "Anime" : work?.readingCategory === "MANGA" ? "Mangá" : work?.typeLabel;
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#171411",
        color: "#F0EEE9",
        fontFamily: "Inter,system-ui,sans-serif",
      }}
    >
      <Header active={activeSection === "animes" ? "animes" : "leituras"} loggedIn={loggedIn} solid />
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
            gridTemplateColumns: cover ? "repeat(auto-fit,minmax(min(100%,260px),1fr))" : "1fr",
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
            <span style={labelStyle}>{missing ? "Catálogo" : typeLabel || "NekoFlow"}</span>
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
                    {work.alt
                      ? work.alt.split(" | ").join(" · ")
                      : work.titles
                          .slice(1)
                          .map((x) => x.title)
                          .join(" · ")}
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
              <p style={{ margin: 0, color: "#B7B1A4" }}>O endereço não corresponde a nenhuma obra cadastrada.</p>
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
                  {missing ? "Voltar ao catálogo" : "Explorar obras semelhantes"}
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
            {!loading && !missing && loggedIn && work?.id && <PersonalControls work={work} />}
          </div>
        </section>
        {!loading && !missing && (
          <section style={{ maxWidth: "1180px", margin: "36px auto 0", display: "grid", gap: "28px" }}>
            {!!work.genres?.length && (
              <div>
                <span style={labelStyle}>Gêneros</span>
                <p style={{ color: "#D9D5CC" }}>{work.genres.map((g) => g.name).join(" · ")}</p>
              </div>
            )}
            <CatalogUnits work={work} catalog={catalog} loggedIn={loggedIn} />
            {!!catalog.contributors.length && (
              <div>
                <span style={labelStyle}>Equipe</span>
                <p style={{ color: "#D9D5CC" }}>
                  {catalog.contributors.map((x) => `${x.name} — ${String(x.role).replaceAll("_", " ")}`).join(" · ")}
                </p>
              </div>
            )}
            {!!catalog.relations.length && (
              <div>
                <span style={labelStyle}>Obras relacionadas</span>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "12px" }}>
                  {catalog.relations.map((x) => (
                    <a
                      key={`${x.id}-${x.direction}`}
                      href={`${x.media_family === "ANIMATION" ? "/animes/" : "/leituras/"}${x.slug}`}
                      style={{ color: "#DBAF57" }}
                    >
                      {x.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

const STATUSES = [
  ["planejado", "Planejado"],
  ["andamento", "Em andamento"],
  ["concluido", "Concluído"],
  ["pausado", "Pausado"],
  ["abandonado", "Abandonado"],
];

const chipStyle = (on) => ({
  padding: "8px 12px",
  borderRadius: "999px",
  border: `1px solid ${on ? "#DBAF57" : "rgba(240,238,233,.18)"}`,
  background: on ? "rgba(219,175,87,.14)" : "transparent",
  color: on ? "#DBAF57" : "#F0EEE9",
  cursor: "pointer",
  fontSize: "13px",
});

/** Recarrega quando qualquer tela alterar dados pessoais (evento nk:personal). */
function usePersonal(load, deps) {
  useEffect(() => {
    load();
    window.addEventListener("nk:personal", load);
    return () => window.removeEventListener("nk:personal", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Situação na biblioteca, favorito e alertas — três escolhas independentes. */
function PersonalControls({ work }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  usePersonal(
    () =>
      libraryApi
        .state(work.id)
        .then(setState)
        .catch(() => setMessage("Não foi possível carregar sua biblioteca.")),
    [work.id],
  );
  const run = async (promise, ok) => {
    setBusy(true);
    setMessage(null);
    try {
      setState(await promise);
      setMessage(ok);
    } catch (error) {
      setMessage(error?.body?.message || "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  if (!state) return message ? <p style={{ margin: 0, color: "#E08A7A", fontSize: "13px" }}>{message}</p> : null;
  const resume = state.resume;
  const noun = work.mediaFamily === "ANIMATION" ? "Ep." : "Cap.";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <span style={labelStyle}>Minha biblioteca</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {STATUSES.map(([code, label]) => (
          <button
            key={code}
            disabled={busy}
            onClick={() => run(libraryApi.setStatus(work.id, code), `Salvo como ${label}.`)}
            style={chipStyle(state.status === code)}
          >
            {label}
          </button>
        ))}
        {state.inLibrary && (
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm("Remover da sua lista? O progresso e o histórico continuam salvos."))
                run(libraryApi.remove(work.id), "Removido da lista · progresso e histórico mantidos.");
            }}
            style={{ ...chipStyle(false), color: "#E08A7A" }}
          >
            Remover da lista
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <button
          disabled={busy}
          onClick={() =>
            run(
              libraryApi.favorite(work.id, !state.favorite),
              state.favorite ? "Removido dos favoritos." : "Adicionado aos favoritos.",
            )
          }
          style={chipStyle(state.favorite)}
        >
          {state.favorite ? "♥ Favorito" : "♡ Favoritar"}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(
              libraryApi.follow(work.id, !state.follow),
              state.follow ? "Alertas desativados." : "Você será avisado de novos lançamentos.",
            )
          }
          style={chipStyle(state.follow)}
        >
          {state.follow ? "Acompanhando lançamentos" : "Acompanhar lançamentos"}
        </button>
      </div>
      {resume && (
        <p style={{ margin: 0, color: "#D9D5CC", fontSize: "14px" }}>
          {resume.state === "UP_TO_DATE" ? (
            <>
              Em dia · você viu tudo o que está disponível até {noun} {resume.unitNumber}.
            </>
          ) : (
            <>
              {resume.state === "NEXT" ? "Próximo" : "Continuar"}: {noun} {resume.unitNumber}
              {resume.state === "RESUME" && resume.percent > 0 ? ` · ${Math.round(resume.percent)}%` : ""}
              {!resume.available && " · indisponível no momento"}
            </>
          )}
        </p>
      )}
      {message && <p style={{ margin: 0, color: "#DBAF57", fontSize: "13px" }}>{message}</p>}
    </div>
  );
}

function formatClock(ms) {
  const total = Math.floor((ms || 0) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Episódios/capítulos reais com o progresso do usuário em cada um. */
function CatalogUnits({ work, catalog, loggedIn }) {
  const [opening, setOpening] = useState(null);
  const [message, setMessage] = useState(null);
  const [progress, setProgress] = useState({});
  const animation = work.mediaFamily === "ANIMATION";
  usePersonal(() => {
    if (!loggedIn || !work?.id) return;
    progressApi
      .workUnits(work.id)
      .then((p) => {
        const map = {};
        for (const u of p.episodes) map[u.episodeId] = u;
        for (const u of p.chapters) map[`${u.chapterId}:${u.editionId}`] = u;
        setProgress(map);
      })
      .catch(() => {});
  }, [work?.id, loggedIn]);
  const open = async (kind, id) => {
    setOpening(id);
    try {
      const source = await api.get(`/api/v1/${kind}/${id}/source`);
      if (source.source_type === "EMBED" && source.embed_allowed) location.href = `/player?episode=${id}`;
      else window.open(source.source_url, "_blank", "noopener,noreferrer");
    } catch {
      setMessage("Esta fonte está indisponível no momento.");
    } finally {
      setOpening(null);
    }
  };
  const toggle = async (x, done) => {
    if (!loggedIn) return goLogin();
    setOpening(x.id);
    setMessage(null);
    const label = animation ? "Episódio" : "Capítulo";
    try {
      if (animation) await progressApi.setEpisodeCompleted(x.id, !done);
      else await progressApi.setChapterCompleted(x.id, x.edition_id, !done);
      setMessage(
        done
          ? `${label} ${x.display_number} desmarcado.`
          : `${label} ${x.display_number} marcado como ${animation ? "assistido" : "lido"} por você.`,
      );
    } catch (error) {
      setMessage(error?.body?.message || "Não foi possível salvar o progresso.");
    } finally {
      setOpening(null);
    }
  };
  const rows = animation ? catalog.episodes : catalog.chapters;
  const noun = animation ? "episódios" : "capítulos";
  if (!rows.length)
    return (
      <div>
        <span style={labelStyle}>{noun}</span>
        <p style={{ color: "#B7B1A4" }}>Nenhum {noun.slice(0, -1)} disponível foi cadastrado.</p>
      </div>
    );
  return (
    <div>
      <span style={labelStyle}>{noun}</span>
      <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
        {rows.map((x) => {
          const available = x.has_source;
          const p = progress[animation ? x.id : `${x.id}:${x.edition_id}`];
          const done = !!p?.completed;
          let status = null;
          if (p && done) {
            const word = animation ? "Assistido" : "Lido";
            status = p.completionSource === "MANUAL" ? `${word} · marcado por você` : word;
          } else if (p) {
            status = animation
              ? `Parou em ${formatClock(p.positionMs)}`
              : `${Math.round(Number(p.percentComplete || 0))}% lido`;
          }
          return (
            <div
              key={x.id}
              style={{
                padding: "14px 16px",
                border: `1px solid ${done ? "rgba(219,175,87,.35)" : "rgba(240,238,233,.12)"}`,
                borderRadius: "10px",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: "16px",
                alignItems: "center",
              }}
            >
              <div>
                <strong>
                  {animation ? "Episódio" : "Capítulo"} {x.display_number}
                </strong>
                {x.title && <span style={{ color: "#B7B1A4" }}> · {x.title}</span>}
                {!animation && x.edition_name && <span style={{ color: "#827B70" }}> · {x.edition_name}</span>}
                <div style={{ color: available ? "#8BCB88" : "#827B70", fontSize: "12px", marginTop: "4px" }}>
                  {available ? "Fonte verificada" : "Indisponível"}
                  {status && <span style={{ color: "#DBAF57" }}> · {status}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {available && (
                  <button
                    disabled={opening === x.id}
                    onClick={() => open(animation ? "episodes" : "chapters", x.id)}
                    style={{
                      border: 0,
                      borderRadius: "8px",
                      padding: "10px 14px",
                      background: "#DBAF57",
                      color: "#1A1714",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {opening === x.id ? "Abrindo…" : animation ? "Assistir" : "Ler no provedor"}
                  </button>
                )}
                {loggedIn && (
                  <button
                    disabled={opening === x.id}
                    onClick={() => toggle(x, done)}
                    style={{
                      border: "1px solid rgba(219,175,87,.45)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      background: "transparent",
                      color: "#DBAF57",
                      cursor: "pointer",
                    }}
                  >
                    {done ? "Desmarcar" : animation ? "Marcar como assistido" : "Marcar como lido"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {message && <p style={{ color: "#DBAF57", fontSize: "13px" }}>{message}</p>}
      <p style={{ color: "#827B70", fontSize: "12px" }}>
        {animation
          ? "Estas fontes abrem fora do NekoFlow e não informam o tempo assistido. Marque o episódio quando terminar; nenhum tempo é inventado."
          : "A leitura externa não informa a página lida. Marque o capítulo quando terminar."}
      </p>
      {!loggedIn && (
        <p style={{ color: "#827B70", fontSize: "12px" }}>Entre na conta para sincronizar biblioteca e progresso.</p>
      )}
    </div>
  );
}
