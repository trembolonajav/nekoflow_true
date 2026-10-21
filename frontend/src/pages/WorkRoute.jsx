import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../services/api";
import BasicWorkDetail from "./BasicWorkDetail";

const RICH_IDS = new Set([151807, 105398]);

export default function WorkRoute({
  section,
  RichComponent,
  richDefaults,
  loggedIn,
}) {
  const { slug } = useParams();
  const [state, setState] = useState({
    loading: true,
    work: null,
    missing: false,
  });

  useEffect(() => {
    let active = true;
    setState({ loading: true, work: null, missing: false });
    const resolve = `/api/v1/works/resolve?section=${encodeURIComponent(section)}&slug=${encodeURIComponent(slug)}`;
    api
      .get(resolve)
      .catch((error) => {
        // Compatibilidade temporária para URLs históricas que ainda carregam o ID no slug.
        if (error?.status !== 404) throw error;
        return api.get(`/api/catalog/${section}/${encodeURIComponent(slug)}`);
      })
      .then(async (work) => {
        // Ficha do design para toda obra do catálogo: o Java monta o documento de
        // apresentação (catálogo + AniList). Se ele falhar, a ficha simples continua.
        let presentation = null;
        const legacy = Number(work.legacyId ?? work.id);
        if (!RICH_IDS.has(legacy) && work.legacyId != null) {
          presentation = await api.get(`/api/v1/works/${work.id}/presentation`).catch(() => null);
        }
        if (active) setState({ loading: false, work, presentation, missing: false });
      })
      .catch((error) => {
        if (active)
          setState({
            loading: false,
            work: null,
            missing: error?.status === 404,
          });
      });
    return () => {
      active = false;
    };
  }, [section, slug]);

  if (state.loading)
    return <BasicWorkDetail loading section={section} loggedIn={loggedIn} />;
  if (!state.work)
    return <BasicWorkDetail missing section={section} loggedIn={loggedIn} />;
  if (RICH_IDS.has(Number(state.work.legacyId ?? state.work.id))) {
    return (
      <RichComponent
        {...richDefaults}
        canonicalWork={{ ...state.work, id: state.work.legacyId ?? state.work.id }}
        loggedIn={loggedIn}
      />
    );
  }
  if (state.presentation) {
    return (
      <RichComponent
        {...richDefaults}
        presentationId={state.work.id}
        presentation={state.presentation}
        loggedIn={loggedIn}
      />
    );
  }
  return (
    <BasicWorkDetail work={state.work} section={section} loggedIn={loggedIn} />
  );
}
