import React, { useEffect, useRef, useState } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { goLogin } from "../lib/session";
import { api } from "../services/api";
import { libraryApi } from "../features/library/libraryApi";
import { progressApi } from "../features/progress/progressApi";
import { languageBadge } from "../features/media/playbackRules";
import "./work-detail.css";

const STATUS_LABELS = {
  COMPLETED: "Concluído",
  ONGOING: "Em lançamento",
  HIATUS: "Em pausa",
  CANCELLED: "Cancelado",
  UNKNOWN: "Catálogo auditado",
};

function usePersonal(load, deps) {
  useEffect(() => {
    load();
    window.addEventListener("nk:personal", load);
    return () => window.removeEventListener("nk:personal", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function formatDuration(seconds) {
  return seconds ? `${Math.max(1, Math.round(Number(seconds) / 60))} min` : null;
}

function displayTitle(unit, animation) {
  const generic = animation ? `Episódio ${unit.display_number}` : `Capítulo ${unit.display_number}`;
  const title = String(unit.title || "").trim();
  if (!title || /^T\d+\s+EP\d+$/i.test(title) || /^(episódio|capítulo)\s*\d+$/i.test(title)) return generic;
  return title;
}

function episodeLanguageBadges(unit) {
  const split = (value) => Array.isArray(value)
    ? value
    : String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  const subtitles = split(unit.subtitle_languages).map((language) => `CC ${languageBadge(language)}`);
  const dubbed = split(unit.audio_languages)
    .filter((language) => language !== "ja")
    .map((language) => `🎙 ${languageBadge(language)}`);
  return [...new Set([...subtitles, ...dubbed])];
}

export default function BasicWorkDetail({ work, section, loading = false, missing = false, loggedIn = false }) {
  const animation = work?.mediaFamily === "ANIMATION" || section === "animes";
  const [catalog, setCatalog] = useState({ seasons: [], chapters: [], relations: [], contributors: [] });
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("units");
  const unitsRef = useRef(null);
  const aboutRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (!work?.id || !work?.mediaFamily) return undefined;
    const common = Promise.all([
      api.get(`/api/v1/works/${work.id}/relations`).catch(() => []),
      api.get(`/api/v1/works/${work.id}/contributors`).catch(() => []),
    ]);
    const media = animation
      ? api.get(`/api/v1/works/${work.id}/seasons`).then((seasons) => ({ seasons, chapters: [] }))
      : api.get(`/api/v1/works/${work.id}/chapters`).then((chapters) => ({ seasons: [], chapters }));
    Promise.all([common, media]).then(([[relations, contributors], content]) => {
      if (!active) return;
      setCatalog({ ...content, relations, contributors });
      if (animation && content.seasons.length) setSelectedSeason((current) => current || content.seasons[0].id);
      if (!animation) setUnits(content.chapters);
    });
    return () => {
      active = false;
    };
  }, [work?.id, work?.mediaFamily, animation]);

  useEffect(() => {
    let active = true;
    if (!animation || !selectedSeason) return undefined;
    setUnitsLoading(true);
    api.get(`/api/v1/seasons/${selectedSeason}/episodes`)
      .then((episodes) => active && setUnits(episodes))
      .catch(() => active && setUnits([]))
      .finally(() => active && setUnitsLoading(false));
    return () => {
      active = false;
    };
  }, [animation, selectedSeason]);

  const selected = catalog.seasons.find((item) => item.id === selectedSeason);
  const firstAvailable = units.find((item) => item.has_source);
  const cover = work?.coverUrl || work?.cover;
  const banner = work?.bannerUrl || work?.banner || cover;
  const title = loading ? "Carregando obra…" : missing ? "Obra não encontrada" : work?.title;
  const synopsis = work?.synopsis || work?.synopsisShort;
  const status = STATUS_LABELS[work?.storyStatus] || work?.status || "Catálogo auditado";
  const totalUnits = work?.episodeCount || work?.chapterCount || work?.totalUnits || 0;
  const unitLabel = animation ? "Episódios" : "Capítulos";
  const sectionHref = animation ? "/animes" : "/leituras";

  const scrollTo = (ref, tab) => {
    setActiveTab(tab);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading || missing) {
    return (
      <div className="nk-work-page">
        <Header active={animation ? "animes" : "leituras"} loggedIn={loggedIn} solid />
        <main className="nk-work-state">
          <span>{loading ? "Catálogo NekoFlow" : "404"}</span>
          <h1>{title}</h1>
          {!loading && <a href={sectionHref}>Voltar ao catálogo</a>}
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="nk-work-page">
      <Header active={animation ? "animes" : "leituras"} loggedIn={loggedIn} />
      <section className="nk-work-hero">
        <div className="nk-work-backdrop" style={{ backgroundImage: banner ? `url("${banner}")` : "none" }} />
        <div className="nk-work-shade" />
        <div className="nk-work-hero-content">
          <div className="nk-work-cover-wrap">
            {cover ? <img className="nk-work-cover" src={cover} alt={`Capa de ${title}`} /> : <div className="nk-work-cover nk-work-cover-empty">N</div>}
          </div>
          <div className="nk-work-copy">
            <div className="nk-work-eyebrow"><i />{animation ? "Anime · Série" : work?.readingCategory === "MANGA" ? "Mangá" : "Leitura"}{work?.year ? ` · ${work.year}` : ""}</div>
            <h1>{title}</h1>
            {!!work?.titles?.length && work.titles[1]?.title && <p className="nk-work-native">{work.titles[1].title}</p>}
            <div className="nk-work-meta">
              {!!work?.genres?.length && <span>{work.genres.map((genre) => genre.name).join(" · ")}</span>}
              <b>{status}</b>
              {!!totalUnits && <span>{totalUnits} {animation ? "episódios" : "capítulos"}</span>}
              {animation && !!work?.seasonCount && <span>{work.seasonCount} {Number(work.seasonCount) === 1 ? "temporada" : "temporadas"}</span>}
            </div>
            <p className="nk-work-synopsis">{synopsis || "A sinopse desta obra ainda está em preparação editorial."}</p>
            <div className="nk-work-actions">
              {firstAvailable ? (
                <a className="nk-work-primary" href={animation ? `/player?episode=${firstAvailable.id}` : `/leitor?chapter=${firstAvailable.id}&edition=${firstAvailable.edition_id}`}>
                  <span>▶</span> {animation ? "Assistir agora" : "Ler agora"}
                </a>
              ) : (
                <button className="nk-work-primary" onClick={() => scrollTo(unitsRef, "units")}><span>↓</span> Ver {unitLabel.toLowerCase()}</button>
              )}
              {loggedIn ? <PersonalButton work={work} /> : <button className="nk-work-secondary" onClick={goLogin}>♡ Minha lista</button>}
            </div>
          </div>
        </div>
      </section>

      <nav className="nk-work-tabs" aria-label="Seções da obra">
        <button className={activeTab === "units" ? "is-active" : ""} onClick={() => scrollTo(unitsRef, "units")}>{unitLabel} <small>{totalUnits || ""}</small></button>
        <button className={activeTab === "about" ? "is-active" : ""} onClick={() => scrollTo(aboutRef, "about")}>Sobre</button>
      </nav>

      <main className="nk-work-main">
        <section className="nk-work-units" ref={unitsRef}>
          <div className="nk-work-section-head">
            <div>
              <h2>{unitLabel}</h2>
              <p>{animation ? selected?.title || "Temporadas e episódios do catálogo" : "Capítulos disponíveis nesta edição"}</p>
            </div>
            {animation && catalog.seasons.length > 0 && (
              <div className="nk-season-tabs" aria-label="Temporadas">
                {catalog.seasons.map((season) => (
                  <button key={season.id} className={season.id === selectedSeason ? "is-active" : ""} onClick={() => setSelectedSeason(season.id)}>
                    Temporada {season.display_number} <small>{season.episode_count}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {unitsLoading ? <div className="nk-units-empty">Carregando episódios…</div> : units.length ? (
            <UnitGrid work={work} units={units} animation={animation} loggedIn={loggedIn} />
          ) : <div className="nk-units-empty">Nenhum {animation ? "episódio" : "capítulo"} publicado nesta seção.</div>}
        </section>

        <section className="nk-work-about" ref={aboutRef}>
          <div>
            <span className="nk-work-kicker">Sobre a obra</span>
            <h2>Sinopse</h2>
            <p>{synopsis || "A sinopse desta obra ainda está em preparação editorial."}</p>
            {work?.synopsisSource && <small>Fonte editorial: {work.synopsisSource}</small>}
          </div>
          <aside>
            <dl>
              <div><dt>Formato</dt><dd>{animation ? "Anime" : work?.readingCategory === "MANGA" ? "Mangá" : "Leitura"}</dd></div>
              <div><dt>Situação</dt><dd>{status}</dd></div>
              {!!work?.year && <div><dt>Ano</dt><dd>{work.year}</dd></div>}
              {!!work?.originCountry && <div><dt>Origem</dt><dd>{work.originCountry}</dd></div>}
              <div><dt>{animation ? "Temporadas" : "Capítulos"}</dt><dd>{animation ? work?.seasonCount || 0 : totalUnits}</dd></div>
            </dl>
          </aside>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function PersonalButton({ work }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  usePersonal(() => libraryApi.state(work.id).then(setState).catch(() => {}), [work.id]);
  const toggle = async () => {
    setBusy(true);
    try {
      const next = state?.inLibrary ? await libraryApi.remove(work.id) : await libraryApi.setStatus(work.id, "planejado");
      setState(next);
      window.dispatchEvent(new Event("nk:personal"));
    } finally {
      setBusy(false);
    }
  };
  return <button className="nk-work-secondary" disabled={busy} onClick={toggle}>{state?.inLibrary ? "✓ Na minha lista" : "♡ Minha lista"}</button>;
}

function UnitGrid({ work, units, animation, loggedIn }) {
  const [progress, setProgress] = useState({});
  const [busy, setBusy] = useState(null);
  usePersonal(() => {
    if (!loggedIn) return;
    progressApi.workUnits(work.id).then((data) => {
      const next = {};
      for (const item of data.episodes || []) next[item.episodeId] = item;
      for (const item of data.chapters || []) next[`${item.chapterId}:${item.editionId}`] = item;
      setProgress(next);
    }).catch(() => {});
  }, [work.id, loggedIn]);

  const mark = async (unit, done) => {
    if (!loggedIn) return goLogin();
    setBusy(unit.id);
    try {
      if (animation) await progressApi.setEpisodeCompleted(unit.id, !done);
      else await progressApi.setChapterCompleted(unit.id, unit.edition_id, !done);
      const key = animation ? unit.id : `${unit.id}:${unit.edition_id}`;
      setProgress((current) => ({ ...current, [key]: { ...(current[key] || {}), completed: !done } }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="nk-unit-grid">
      {units.map((unit) => {
        const key = animation ? unit.id : `${unit.id}:${unit.edition_id}`;
        const done = !!progress[key]?.completed;
        const playable = animation ? unit.playable : unit.readable;
        const hasSource = !!unit.has_source;
        const href = animation ? `/player?episode=${unit.id}` : `/leitor?chapter=${unit.id}&edition=${unit.edition_id}`;
        const languageBadges = animation ? episodeLanguageBadges(unit) : [];
        return (
          <article className={`nk-unit-card${done ? " is-done" : ""}`} key={key}>
            <div className="nk-unit-thumb">
              {unit.thumbnail_url ? <img src={unit.thumbnail_url} alt="" loading="lazy" /> : <span>N</span>}
              <b>{animation ? "EP" : "CAP"} {unit.display_number}</b>
              {!!languageBadges.length && <span className="nk-unit-languages">{languageBadges.map((badge) => <i key={badge}>{badge}</i>)}</span>}
            </div>
            <div className="nk-unit-copy">
              <h3>{displayTitle(unit, animation)}</h3>
              <p>{[formatDuration(unit.duration_seconds), hasSource ? (playable ? "Disponível no NekoFlow" : "Fonte externa") : "Fonte em revisão"].filter(Boolean).join(" · ")}</p>
              <div className="nk-unit-actions">
                {hasSource ? <a href={href}>▶ {animation ? "Assistir" : "Ler"}</a> : <span>Catálogo integrado</span>}
                {loggedIn && <button disabled={busy === unit.id} onClick={() => mark(unit, done)}>{done ? "✓ Concluído" : "Marcar concluído"}</button>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
