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
    api
      .get(`/api/catalog/${section}/${encodeURIComponent(slug)}`)
      .then(
        (work) => active && setState({ loading: false, work, missing: false }),
      )
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
  if (RICH_IDS.has(Number(state.work.id))) {
    return (
      <RichComponent
        {...richDefaults}
        canonicalWork={state.work}
        loggedIn={loggedIn}
      />
    );
  }
  return (
    <BasicWorkDetail work={state.work} section={section} loggedIn={loggedIn} />
  );
}
