#!/usr/bin/env node
// Converte as telas exportadas do Claude Design (*.dc.html) em componentes
// React (.jsx), sem redesenhar nada: o template vira JSX com os mesmos estilos
// inline, a classe de lógica é copiada como está e os `style-hover` viram
// classes CSS com !important (igual ao runtime original).
//
// Uso: node scripts/dc-to-react.mjs <pasta-do-design>
//   - gera src/pages/*.jsx, src/components/*.jsx, src/styles/pseudo.generated.css
//   - copia assets/ para public/assets/
//   - copia data/*.json (com links reescritos) para ../backend/src/main/resources/seed/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFragment, parse } from "parse5";
import * as prettier from "prettier";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(here, "..");
const ROOT = path.resolve(FRONT, "..");
const SRC_DIR = path.resolve(process.argv[2] || path.join(ROOT, "design", "claude-design"));

// ---- mapa de telas -------------------------------------------------------

/** arquivo do design -> { componente, rota, pasta } */
const SCREENS = {
  "Home Nekoflow v2": { name: "Home", route: "/", dir: "pages" },
  "Home Nekoflow": { name: "HomeDirecoes", route: "/estudos/home-direcoes", dir: "pages" },
  Calendario: { name: "Calendario", route: "/calendario", dir: "pages" },
  Conta: { name: "Conta", route: "/conta", dir: "pages" },
  Entrar: { name: "Entrar", route: "/entrar", dir: "pages" },
  Explorar: { name: "Explorar", route: "/explorar", dir: "pages" },
  Leituras: { name: "Leituras", route: "/leituras", dir: "pages" },
  Obra: { name: "Obra", route: "/obra", dir: "pages" },
  ObraLeitura: { name: "ObraLeitura", route: "/obra-leitura", dir: "pages" },
  Leitor: { name: "Leitor", route: "/leitor", dir: "pages" },
  Player: { name: "Player", route: "/player", dir: "pages" },
  Header: { name: "Header", route: null, dir: "components" },
  Footer: { name: "Footer", route: null, dir: "components" },
};
// Leitor-standalone é a variante usada só no HTML empacotado (lê window.__resources).
const SKIP = new Set(["Leitor-standalone"]);

const DC_LINK_RE = /([A-Za-z][A-Za-z0-9]*(?:%20[A-Za-z0-9]+)*)\.dc\.html/g;

/** Reescreve links "Tela.dc.html?x" -> "/rota?x" e "assets/" -> "/assets/". */
function rewriteUrls(s) {
  s = s.replace(DC_LINK_RE, (m, raw) => {
    const key = decodeURIComponent(raw);
    const scr = SCREENS[key];
    if (!scr || !scr.route) {
      console.warn("  ! link sem rota:", m);
      return m;
    }
    return scr.route;
  });
  return s.replace(/(^|[\s'"`(=])assets\//g, "$1/assets/");
}

// ---- utilidades do runtime original --------------------------------------

const CAMEL_ATTR = "sc-camel-";
const RAW_WRAP = {
  select: "sc-raw-select", table: "sc-raw-table", tbody: "sc-raw-tbody", thead: "sc-raw-thead",
  tfoot: "sc-raw-tfoot", tr: "sc-raw-tr", td: "sc-raw-td", th: "sc-raw-th", caption: "sc-raw-caption",
};
const RAW_UNWRAP = Object.fromEntries(Object.entries(RAW_WRAP).map(([k, v]) => [v, k]));
const EVENT_MAP = {
  onclick: "onClick", onchange: "onChange", oninput: "onInput", onsubmit: "onSubmit", onkeydown: "onKeyDown",
  onkeyup: "onKeyUp", onkeypress: "onKeyPress", onmousedown: "onMouseDown", onmouseup: "onMouseUp",
  onmouseenter: "onMouseEnter", onmouseleave: "onMouseLeave", onfocus: "onFocus", onblur: "onBlur",
  ondoubleclick: "onDoubleClick", oncontextmenu: "onContextMenu", onmousemove: "onMouseMove",
  onmouseover: "onMouseOver", onmouseout: "onMouseOut", onpointerdown: "onPointerDown", onpointerup: "onPointerUp",
  onpointermove: "onPointerMove", onpointerenter: "onPointerEnter", onpointerleave: "onPointerLeave",
  onpointercancel: "onPointerCancel", onpointerover: "onPointerOver", onpointerout: "onPointerOut",
  ontouchstart: "onTouchStart", ontouchend: "onTouchEnd", ontouchmove: "onTouchMove", ontouchcancel: "onTouchCancel",
  ondragstart: "onDragStart", ondragend: "onDragEnd", ondragenter: "onDragEnter", ondragleave: "onDragLeave",
  ondragover: "onDragOver", onanimationstart: "onAnimationStart", onanimationend: "onAnimationEnd",
  onanimationiteration: "onAnimationIteration", ontransitionend: "onTransitionEnd",
};
const ATTRS = `(?:[^>"']|"[^"]*"|'[^']*')*`;
const IMPORT_SELF_CLOSE_RE = new RegExp("<(x-import|dc-import)(" + ATTRS + ")/>", "gi");
const CAMEL_ATTR_RE = /(\s)([a-z]+[A-Z][A-Za-z0-9]*)(\s*=)/g;

function encodeCase(html) {
  html = html.replace(IMPORT_SELF_CLOSE_RE, (_, t, a) => "<" + t + a + "></" + t + ">");
  html = html.replace(/<helmet(\s|>)/gi, "<sc-helmet$1");
  html = html.replace(/<\/helmet\s*>/gi, "</sc-helmet>");
  html = html.replace(
    CAMEL_ATTR_RE,
    (_, sp, name, eq) => sp + CAMEL_ATTR + name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()) + eq
  );
  for (const [real, alias] of Object.entries(RAW_WRAP)) {
    html = html.replace(new RegExp("(</?)" + real + "(?=[\\s>])", "gi"), "$1" + alias);
  }
  return html;
}
const kebabToCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function cssDecls(css) {
  const out = [];
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    out.push([prop.startsWith("--") ? prop : kebabToCamel(prop), decl.slice(i + 1).trim()]);
  }
  return out;
}

// importantify/stripComments do runtime (usado nos style-hover)
function scanUnquotedUrl(css, i) {
  if ((css[i] !== "u" && css[i] !== "U") || css.slice(i, i + 4).toLowerCase() !== "url(" || /[a-z0-9_-]/i.test(css[i - 1] ?? "")) return -1;
  let j = i + 4;
  while (j < css.length && /\s/.test(css[j])) j++;
  if (css[j] === '"' || css[j] === "'") return -1;
  while (j < css.length && css[j] !== ")") { if (css[j] === "\\") j++; j++; }
  return j < css.length ? j + 1 : css.length;
}
function stripComments(css) {
  let out = "", quote = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === "\\") { out += c + (css[i + 1] ?? ""); i++; continue; }
      if (c === quote) quote = "";
      out += c;
    } else if (c === "'" || c === '"') { quote = c; out += c; }
    else if (c === "/" && css[i + 1] === "*") { const end = css.indexOf("*/", i + 2); i = end === -1 ? css.length : end + 1; out += " "; }
    else { const end = scanUnquotedUrl(css, i); if (end === -1) out += c; else { out += css.slice(i, end); i = end - 1; } }
  }
  return out;
}
function importantify(css) {
  css = stripComments(css);
  const decls = [];
  let start = 0, depth = 0, quote = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) { decls.push(css.slice(start, i)); start = i + 1; }
    else { const end = scanUnquotedUrl(css, i); if (end !== -1) i = end - 1; }
  }
  decls.push(css.slice(start));
  // `{{ }}` não é interpolado em style-hover no runtime original: o navegador
  // descarta a declaração inválida, então ela é omitida aqui.
  return decls.map((d) => d.trim()).filter((d) => d && !d.includes("{{")).map((d) => (/!\s*important$/i.test(d) ? d : d + " !important")).join(";");
}

// ---- pseudo-classes (style-hover etc.) ------------------------------------

const pseudoRules = new Map(); // key -> { cls, rule }
function pseudoClass(pseudo, cssText) {
  const k = pseudo + "|" + cssText;
  const hit = pseudoRules.get(k);
  if (hit) return hit.cls;
  let h = 5381;
  for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0;
  const cls = "nk-" + pseudo.replace(/[^a-z]/g, "") + "-" + (h >>> 0).toString(36);
  const isEl = pseudo === "before" || pseudo === "after";
  const sel = isEl ? "." + cls + "::" + pseudo : "." + cls + ":" + pseudo;
  pseudoRules.set(k, { cls, rule: sel + "{" + (isEl ? cssText : importantify(cssText)) + "}" });
  return cls;
}

// ---- expressões {{ }} ----------------------------------------------------

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;

function parensWrapWhole(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length - 1; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") { depth--; if (depth === 0) return false; }
  }
  return true;
}
function findTopLevelEquality(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (depth === 0 && (c === "=" || c === "!") && expr[i + 1] === "=") {
      if (i > 0 && (expr[i - 1] === "=" || expr[i - 1] === "!")) continue;
      if (!expr.slice(0, i).trim()) continue;
      const op = expr[i + 2] === "=" ? c + "==" : c + "=";
      return { index: i, op };
    }
  }
  return null;
}
/** Compila uma expressão do template para JS. `scope` = variáveis de sc-for. */
function compileExpr(src, scope) {
  const expr = String(src).trim();
  if (!expr) return "undefined";
  if (expr[0] === "(" && expr[expr.length - 1] === ")" && parensWrapWhole(expr)) return compileExpr(expr.slice(1, -1), scope);
  const eq = findTopLevelEquality(expr);
  if (eq) {
    const l = compileExpr(expr.slice(0, eq.index), scope);
    const r = compileExpr(expr.slice(eq.index + eq.op.length), scope);
    return `(${l} ${eq.op} ${r})`;
  }
  if (expr[0] === "!") return `!(${compileExpr(expr.slice(1), scope)})`;
  if (expr === "true" || expr === "false" || expr === "null" || expr === "undefined") return expr;
  if (NUMBER_RE.test(expr)) return String(Number(expr));
  if (expr.length >= 2 && (expr[0] === '"' || expr[0] === "'") && expr[expr.length - 1] === expr[0]) return JSON.stringify(expr.slice(1, -1));
  return compilePath(expr, scope);
}
function compilePath(expr, scope) {
  const head = expr.match(IDENT_RE);
  if (!head) return "undefined";
  let out = scope.has(head[0]) ? head[0] : "v." + head[0];
  let i = head[0].length;
  while (i < expr.length) {
    if (expr[i] === ".") {
      const rest = expr.slice(i + 1);
      const m = rest.match(IDENT_RE) || rest.match(/^\d+/);
      if (!m) return "undefined";
      out += /^\d/.test(m[0]) ? `?.[${m[0]}]` : `?.${m[0]}`;
      i += 1 + m[0].length;
    } else if (expr[i] === "[") {
      let depth = 1, j = i + 1;
      while (j < expr.length && depth > 0) {
        if (expr[j] === "[") depth++;
        else if (expr[j] === "]") { depth--; if (depth === 0) break; }
        j++;
      }
      if (depth !== 0) return "undefined";
      out += `?.[${compileExpr(expr.slice(i + 1, j), scope)}]`;
      i = j + 1;
    } else return "undefined";
  }
  return out;
}

const INTERP_RE = /\{\{([\s\S]+?)\}\}/g;
const WHOLE_RE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;

/** Valor de atributo: expressão inteira -> valor cru; parcial -> string. */
function attrValue(raw, scope, rewrite) {
  const whole = raw.match(WHOLE_RE);
  if (whole) return { expr: compileExpr(whole[1], scope) };
  if (raw.includes("{{")) {
    const parts = raw.split(INTERP_RE);
    const tpl = parts
      .map((p, i) => (i & 1 ? "${" + compileExpr(p, scope) + ' ?? ""}' : escTpl(rewrite ? rewriteUrls(p) : p)))
      .join("");
    return { expr: "`" + tpl + "`" };
  }
  return { str: rewrite ? rewriteUrls(raw) : raw };
}
const escTpl = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

/** style="..." -> objeto JSX (estático ou com valores dinâmicos). */
function styleExpr(raw, scope) {
  const whole = raw.match(WHOLE_RE);
  if (whole) return `css(${compileExpr(whole[1], scope)})`;
  const PH = "\u0000";
  const exprs = [];
  const masked = raw.replace(INTERP_RE, (_, e) => { exprs.push(e); return PH + (exprs.length - 1) + PH; });
  const decls = cssDecls(masked);
  if (decls.some(([k]) => k.includes(PH))) {
    // nome de propriedade dinâmico: monta a string e converte em runtime
    return `css(${attrValue(raw, scope, true).expr ?? JSON.stringify(raw)})`;
  }
  const props = decls.map(([k, val]) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
    val = rewriteUrls(val);
    if (!val.includes(PH)) return `${key}: ${JSON.stringify(val)}`;
    const segs = val.split(new RegExp(PH + "(\\d+)" + PH));
    const tpl = segs.map((s, i) => (i & 1 ? "${" + compileExpr(exprs[+s], scope) + ' ?? ""}' : escTpl(s))).join("");
    return `${key}: \`${tpl}\``;
  });
  return `{ ${props.join(", ")} }`;
}

// ---- atributos DOM -> JSX --------------------------------------------------

const HTML_ATTR = {
  class: "className", for: "htmlFor", tabindex: "tabIndex", maxlength: "maxLength", minlength: "minLength",
  autocomplete: "autoComplete", readonly: "readOnly", autofocus: "autoFocus", spellcheck: "spellCheck",
  crossorigin: "crossOrigin", colspan: "colSpan", rowspan: "rowSpan", srcset: "srcSet", inputmode: "inputMode",
  enterkeyhint: "enterKeyHint", contenteditable: "contentEditable", referrerpolicy: "referrerPolicy",
  frameborder: "frameBorder", novalidate: "noValidate", allowfullscreen: "allowFullScreen",
  "accept-charset": "acceptCharset", "http-equiv": "httpEquiv", playsinline: "playsInline", autoplay: "autoPlay",
};
const BOOL_ATTR = new Set(["noValidate", "allowFullScreen", "readOnly", "autoFocus", "playsInline", "autoPlay",
  "disabled", "hidden", "checked", "selected", "multiple", "required", "open", "controls", "loop", "muted"]);
const SVG_ATTR = new Set(["stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "stroke-miterlimit", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule", "clip-path", "stop-color",
  "stop-opacity", "text-anchor", "font-weight", "font-size", "font-family", "dominant-baseline", "letter-spacing",
  "shape-rendering", "vector-effect", "alignment-baseline", "baseline-shift", "color-interpolation-filters",
  "flood-color", "flood-opacity", "marker-end", "marker-start", "paint-order", "text-decoration", "word-spacing"]);

function jsxAttr(name, v) {
  if (v.str !== undefined) {
    const s = v.str;
    return /["{}&\\\n]/.test(s) ? `${name}={${JSON.stringify(s)}}` : `${name}="${s}"`;
  }
  return `${name}={${v.expr}}`;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const HOST_STYLE_PROPS = new Set(["position", "left", "right", "top", "bottom", "inset", "width", "height", "z-index", "transform"]);

// ---- template -> JSX ---------------------------------------------------------

function styleOf(el) {
  const a = el.attrs.find((x) => x.name === "style");
  return a ? a.value : "";
}
function isFlexOrGrid(el) {
  const s = styleOf(el).replace(/\s+/g, "");
  const m = [...s.matchAll(/(?:^|;)display:([a-z-]+)/g)].pop();
  return !!m && /^(inline-)?(flex|grid)$/.test(m[1]);
}
function preservesSpace(el) {
  const s = styleOf(el).replace(/\s+/g, "");
  return /(?:^|;)white-space:(pre|pre-wrap|pre-line|break-spaces)/.test(s) || el.tagName === "pre" || el.tagName === "textarea";
}

function textJsx(raw, ctx) {
  const s = ctx.pre ? raw : raw.replace(/\s+/g, " ");
  if (!s) return "";
  if (!s.trim()) return ctx.flex ? "" : `{${JSON.stringify(s)}}`;
  if (/[{}<>&\\]/.test(s) || /^\s|\s$/.test(s) || ctx.pre) return `{${JSON.stringify(s)}}`;
  return s;
}

function genText(node, ctx) {
  const t = node.value;
  if (!t.includes("{{")) {
    if (!t.trim() && !t.includes(" ")) return "";
    return textJsx(t, ctx);
  }
  return t
    .split(INTERP_RE)
    .map((p, i) => (i & 1 ? `{txt(${compileExpr(p, ctx.scope)})}` : textJsx(p, ctx)))
    .join("");
}

function genChildren(nodes, ctx) {
  return nodes.map((n) => genNode(n, ctx)).join("");
}

function attrMap(el) {
  const m = new Map();
  for (const a of el.attrs) m.set(a.name, a.value);
  return m;
}

function genNode(node, ctx) {
  if (node.nodeName === "#text") return genText(node, ctx);
  if (node.nodeName === "#comment") return "";
  if (!node.tagName) return "";
  const tag = node.tagName.toLowerCase();
  const kids = node.tagName === "template" ? node.content.childNodes : node.childNodes;
  const a = attrMap(node);

  if (tag === "sc-helmet") {
    ctx.file.helmet.push(...collectHelmet(node));
    return "";
  }
  if (tag === "sc-for") {
    const list = a.get("list") || "";
    const as = a.get("as") || "item";
    const whole = list.match(WHOLE_RE);
    const listExpr = whole ? compileExpr(whole[1], ctx.scope) : "undefined";
    const scope = new Set(ctx.scope);
    scope.add(as);
    scope.add("$index");
    const inner = genChildren(kids, { ...ctx, scope });
    return `{asList(${listExpr}).map((${as}, $index) => (<React.Fragment key={$index}>${inner}</React.Fragment>))}`;
  }
  if (tag === "sc-if") {
    const raw = a.get("value") || "";
    const v = attrValue(raw, ctx.scope, false);
    const cond = v.expr ?? JSON.stringify(v.str);
    const inner = genChildren(kids, ctx);
    return `{${cond} ? (<>${inner}</>) : null}`;
  }
  if (tag === "dc-import" || tag === "x-import") {
    const name = a.get("name") || a.get("component") || "";
    const scr = SCREENS[name];
    if (!scr) throw new Error("dc-import desconhecido: " + name);
    ctx.file.imports.add(scr);
    const props = [];
    for (const [rawName, value] of a) {
      if (["name", "component", "hint-size", "data-dc-tpl"].includes(rawName)) continue;
      let key = rawName.startsWith(CAMEL_ATTR) ? kebabToCamel(rawName.slice(CAMEL_ATTR.length)) : rawName;
      if (key === "style") {
        if (value.includes("{{")) throw new Error("style dinâmico em dc-import não suportado");
        const host = cssDecls(value).filter(([k]) => HOST_STYLE_PROPS.has(k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())));
        if (host.length) props.push(`__hostStyle={{ ${host.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} }}`);
        continue;
      }
      if (key.startsWith("style-")) continue;
      if (key.includes("-")) key = kebabToCamel(key);
      props.push(jsxAttr(key, attrValue(value, ctx.scope, true)));
    }
    const inner = genChildren(kids, ctx);
    return inner ? `<${scr.name} ${props.join(" ")}>${inner}</${scr.name}>` : `<${scr.name} ${props.join(" ")} />`;
  }

  // elemento DOM comum
  const realTag = RAW_UNWRAP[tag] || node.tagName;
  const out = [];
  const pseudo = [];
  let classAttr = null;
  for (const [rawName, value] of a) {
    if (rawName === "data-dc-tpl" || rawName === "sc-name") continue;
    let key = rawName.startsWith(CAMEL_ATTR) ? kebabToCamel(rawName.slice(CAMEL_ATTR.length)) : rawName;
    if (key === "hint-size") continue;
    if (key.startsWith("style-")) {
      pseudo.push(pseudoClass(key.slice(6), value));
      continue;
    }
    if (key === "style") {
      out.push(`style={${styleExpr(value, ctx.scope)}}`);
      continue;
    }
    if (key.startsWith("on")) key = EVENT_MAP[key] || "on" + key[2].toUpperCase() + key.slice(3);
    else if (HTML_ATTR[key]) key = HTML_ATTR[key];
    else if (SVG_ATTR.has(key)) key = kebabToCamel(key);
    else if (key === "xlink:href") key = "xlinkHref";
    const v = attrValue(value, ctx.scope, key === "href" || key === "src" || key === "poster");
    if (key === "className") { classAttr = v; continue; }
    if (BOOL_ATTR.has(key) && v.str !== undefined) {
      // mesmo efeito do runtime: atributo HTML com caixa diferente do nome do
      // React chega ao DOM; com o mesmo nome, "" é tratado como false.
      const differentCase = Object.values(HTML_ATTR).includes(key);
      if (differentCase) out.push(key);
      else if (v.str !== "") out.push(jsxAttr(key, v));
      continue;
    }
    if ((key === "value" || key === "checked") && v.expr) {
      out.push(`${key}={${key === "value" ? "val" : "checked"}(${v.expr})}`);
      ctx.file.uses.add(key === "value" ? "val" : "checked");
      continue;
    }
    out.push(jsxAttr(key, v));
  }
  if (classAttr || pseudo.length) {
    if (!classAttr || classAttr.str !== undefined) {
      out.unshift(jsxAttr("className", { str: [classAttr?.str, ...pseudo].filter(Boolean).join(" ") }));
    } else {
      out.unshift(`className={[${classAttr.expr}, ${pseudo.map((p) => JSON.stringify(p)).join(", ")}].filter(Boolean).join(" ")}`);
    }
  }
  const childCtx = { ...ctx, flex: isFlexOrGrid(node), pre: ctx.pre || preservesSpace(node) };
  let inner = realTag === "textarea" ? "" : genChildren(kids, childCtx);
  const open = `<${realTag}${out.length ? " " + out.join(" ") : ""}`;
  if (VOID.has(realTag) || !inner) return open + " />";
  return `${open}>${inner}</${realTag}>`;
}

function collectHelmet(node) {
  const items = [];
  for (const c of node.childNodes) {
    if (!c.tagName) continue;
    const t = c.tagName.toLowerCase();
    if (t === "link" || t === "meta") {
      const attrs = Object.fromEntries(c.attrs.map((x) => [x.name.startsWith(CAMEL_ATTR) ? kebabToCamel(x.name.slice(CAMEL_ATTR.length)) : x.name, x.value]));
      if (t === "meta" && attrs.name === "design_doc_mode") {
        if (attrs.content === "canvas") items.push({ tag: "style", text: "html,body{background:#f0eee6}#dc-root>.sc-host{position:relative}" });
        continue;
      }
      items.push({ tag: t, attrs });
    } else if (t === "style" || t === "script") {
      const text = c.childNodes.map((x) => x.value || "").join("");
      items.push({ tag: t, text: rewriteUrls(text) });
    }
  }
  return items;
}

// ---- lógica -----------------------------------------------------------------

function convertLogic(js, logicName) {
  if (!js.trim()) return "";
  let out = js.replace(/class\s+Component\s+extends\s+DCLogic/, `class ${logicName} extends DCLogic`);
  out = out.replace(/fetch\((['"`])data\/([A-Za-z0-9_-]+)\.json\1\)/g, (_, q, k) => `fetch(${q}/api/content/${k}${q})`);
  out = out.replace(DC_LINK_RE, (m) => rewriteUrls(m));
  out = out.replace(/(['"`])assets\//g, "$1/assets/");
  return out.trim();
}

// ---- arquivo ------------------------------------------------------------------

async function convertFile(filePath) {
  const base = path.basename(filePath).replace(/\.dc\.html$/, "");
  const scr = SCREENS[base];
  if (!scr) throw new Error("tela sem mapeamento: " + base);
  const src = fs.readFileSync(filePath, "utf8");

  const open = /<x-dc(?:\s[^>]*)?>/.exec(src);
  const close = src.lastIndexOf("</x-dc>");
  const template = src.slice(open.index + open[0].length, close);
  const doc = parse(src);
  const script = findScript(doc);
  const js = script ? script.childNodes.map((c) => c.value).join("") : "";
  const propsRaw = script ? script.attrs.find((x) => x.name === "data-props")?.value : null;
  const defaults = {};
  if (propsRaw) {
    const meta = JSON.parse(propsRaw);
    for (const [k, m] of Object.entries(meta)) if (k[0] !== "$" && m && m.default !== undefined) defaults[k] = m.default;
  }

  const frag = parseFragment(encodeCase(template));
  const file = { helmet: [], imports: new Set(), uses: new Set() };
  const scope = new Set();
  const jsx = genChildren(frag.childNodes, { scope, file, flex: false, pre: false });

  const logicName = scr.name + "Logic";
  const logic = convertLogic(js, logicName);
  const rel = scr.dir === "pages" ? ".." : "..";
  const runtimeImports = ["DCLogic", "defineDC", "txt", "asList", "css", ...file.uses];
  const imports = [...file.imports]
    .map((s) => `import ${s.name} from "${scr.dir === s.dir ? "./" : "../" + s.dir + "/"}${s.name}";`)
    .join("\n");

  const code = `// Gerado a partir de design/claude-design/${base}.dc.html — não edite à mão.
// Para re-sincronizar com o Claude Design: npm run sync-design
/* eslint-disable */
import React from "react";
import { ${runtimeImports.join(", ")} } from "${rel}/dc/runtime";
${imports}

${logic || `class ${logicName} extends DCLogic {}`}

const helmet = ${JSON.stringify(file.helmet, null, 2)};

function render(v) {
  return (<>${jsx}</>);
}

export const defaults = ${JSON.stringify(defaults)};

export default defineDC(${JSON.stringify(base)}, ${logicName}, render, { helmet });
`;
  const pretty = await prettier.format(code, { parser: "babel", printWidth: 120 });
  const outDir = path.join(FRONT, "src", scr.dir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, scr.name + ".jsx"), pretty);
  console.log("  ✓", base, "->", path.join("src", scr.dir, scr.name + ".jsx"));
}

function findScript(node) {
  if (node.tagName === "script" && node.attrs.some((a) => a.name === "data-dc-script")) return node;
  for (const c of node.childNodes || []) {
    const r = findScript(c);
    if (r) return r;
  }
  return null;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ---- main -----------------------------------------------------------------------

console.log("Design:", SRC_DIR);
const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".dc.html") && !SKIP.has(f.replace(/\.dc\.html$/, "")));
for (const f of files) await convertFile(path.join(SRC_DIR, f));

const rules = [...pseudoRules.values()].map((r) => r.rule).join("\n");
fs.writeFileSync(path.join(FRONT, "src", "styles", "pseudo.generated.css"), "/* Gerado por scripts/dc-to-react.mjs (style-hover do design). */\n" + rules + "\n");
console.log("  ✓", pseudoRules.size, "regras de hover -> src/styles/pseudo.generated.css");

copyDir(path.join(SRC_DIR, "assets"), path.join(FRONT, "public", "assets"));
console.log("  ✓ assets -> public/assets");

const seedDir = path.join(ROOT, "backend", "src", "main", "resources", "seed");
fs.mkdirSync(seedDir, { recursive: true });
for (const f of fs.readdirSync(path.join(SRC_DIR, "data"))) {
  if (!f.endsWith(".json")) continue;
  const txt = fs.readFileSync(path.join(SRC_DIR, "data", f), "utf8");
  JSON.parse(txt); // valida
  fs.writeFileSync(path.join(seedDir, f), rewriteUrls(txt));
}
console.log("  ✓ data/*.json -> backend/src/main/resources/seed/");

