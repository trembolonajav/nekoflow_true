// Runtime mínimo que reproduz, em React puro, a semântica dos componentes do
// Claude Design (dc-runtime): estado síncrono da lógica, renderVals() mesclado
// sobre as props, wrapper `.sc-host`, interpolação em <span class="sc-interp">
// e o <helmet> (fontes/estilos injetados no <head>).
import React from "react";

/** Base das classes de lógica — equivalente ao DCLogic/StreamableLogic. */
export class DCLogic {
  constructor(props) {
    this.props = props || {};
    this.state = {};
    this.__host = undefined;
  }
  // O estado é mesclado na hora (síncrono), como no Claude Design; o
  // componente React só é avisado para re-renderizar.
  setState(update, cb) {
    this.__host && this.__host.__setLogicState(update, cb);
  }
  forceUpdate() {
    this.__host && this.__host.forceUpdate();
  }
  componentDidMount() {}
  componentDidUpdate(_prevProps) {}
  componentWillUnmount() {}
  renderVals() {
    return {};
  }
}

/** Interpolação de texto `{{ expr }}`. */
export function txt(v) {
  if (v === undefined || v === null || typeof v === "boolean") return null;
  if (React.isValidElement(v) || Array.isArray(v)) return v;
  return <span className="sc-interp">{String(v)}</span>;
}

/** Lista de um `sc-for` — qualquer coisa que não seja array vira []. */
export function asList(v) {
  return Array.isArray(v) ? v : [];
}

/** `value`/`checked` indefinidos viram "" / false (inputs controlados). */
export function val(v) {
  return v === undefined ? "" : v;
}
export function checked(v) {
  return v === undefined ? false : v;
}

function kebabToCamel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** CSS inline em string -> objeto de estilo do React (mesma regra do original). */
export function css(style) {
  if (style == null || typeof style !== "string") return style;
  const o = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    o[prop.startsWith("--") ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
  }
  return o;
}

// ---- helmet -------------------------------------------------------------

const mounted = new Set();
const live = new Map();

function mountHelmet(name, items) {
  if (!items || typeof document === "undefined") return;
  items.forEach((item, i) => {
    if (item.tag === "link" || item.tag === "meta") {
      const key = item.tag + "|" + (item.attrs.href || item.attrs.src || JSON.stringify(item.attrs));
      if (mounted.has(key)) return;
      mounted.add(key);
      if (item.tag === "link" && item.attrs.href) {
        const exists = [...document.head.querySelectorAll("link")].some(
          (l) => l.getAttribute("href") === item.attrs.href,
        );
        if (exists) return;
      }
      const el = document.createElement(item.tag);
      for (const [k, v] of Object.entries(item.attrs)) el.setAttribute(k, v);
      document.head.appendChild(el);
    } else {
      const key = name + "|" + i;
      let el = live.get(key);
      if (!el) {
        el = document.createElement(item.tag);
        el.setAttribute("data-dc-helmet", name);
        live.set(key, el);
        document.head.appendChild(el);
      }
      if (el.textContent !== item.text) el.textContent = item.text;
    }
  });
}

// ---- componente ---------------------------------------------------------

/**
 * Cria o componente React de uma tela/componente do design.
 * @param name     nome original do arquivo .dc.html
 * @param Logic    classe que estende DCLogic
 * @param template função (vals) => JSX
 * @param options  { helmet }
 */
export function defineDC(name, Logic, template, options = {}) {
  class DC extends React.Component {
    constructor(props) {
      super(props);
      this.state = { __v: 0, __err: null };
      this.__ctorError = null;
      try {
        this.logic = new (Logic || DCLogic)(this.__userProps());
      } catch (e) {
        console.error(e);
        this.__ctorError = name + ": " + (e && e.message ? e.message : String(e));
        this.logic = new DCLogic(this.__userProps());
      }
      this.logic.__host = this;
    }

    static getDerivedStateFromError(e) {
      return { __err: e instanceof Error && e.message ? e.message : String(e) };
    }

    componentDidCatch(e, info) {
      console.error("[nekoflow] erro de renderização em <" + name + ">:", e, info?.componentStack || "");
    }

    __userProps() {
      const { __hostStyle, ...rest } = this.props;
      return rest;
    }

    __setLogicState(update, cb) {
      const prev = this.logic.state;
      const patch = typeof update === "function" ? update(prev) : update;
      this.logic.state = { ...prev, ...patch };
      this.setState((s) => ({ __v: s.__v + 1 }), cb);
    }

    componentDidMount() {
      try {
        this.logic.componentDidMount();
      } catch (e) {
        console.error(e);
      }
    }

    componentDidUpdate(prevProps) {
      this.logic.props = this.__userProps();
      try {
        this.logic.componentDidUpdate(prevProps);
      } catch (e) {
        console.error(e);
      }
    }

    componentWillUnmount() {
      try {
        this.logic.componentWillUnmount();
      } catch (e) {
        console.error(e);
      }
    }

    render() {
      mountHelmet(name, options.helmet);
      const hostBase = { className: "sc-host", style: this.props.__hostStyle, "data-sc-name": name };
      if (this.state.__err) {
        return (
          <div {...hostBase} className="sc-host sc-has-error">
            <div className="sc-logic-error">{name + ": " + this.state.__err}</div>
          </div>
        );
      }
      const userProps = this.__userProps();
      this.logic.props = userProps;
      let vals = userProps;
      let renderErr = this.__ctorError;
      try {
        vals = { ...userProps, ...(this.logic.renderVals() || {}) };
      } catch (e) {
        console.error(e);
        renderErr = name + ".renderVals(): " + (e && e.message ? e.message : String(e));
      }
      return (
        <div {...hostBase} className={"sc-host" + (renderErr ? " sc-has-error" : "")}>
          {renderErr && <div className="sc-logic-error">{renderErr}</div>}
          {template(vals)}
        </div>
      );
    }
  }
  DC.displayName = name;
  return DC;
}
