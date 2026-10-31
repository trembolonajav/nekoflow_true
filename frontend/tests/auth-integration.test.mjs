import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync(new URL("../src/pages/Entrar.jsx", import.meta.url), "utf8");
const session = readFileSync(new URL("../src/lib/session.js", import.meta.url), "utf8");

test("fluxos de autenticação não mantêm atalhos simulados", () => {
  assert.doesNotMatch(login, /Simular:/);
  assert.match(login, /\/api\/auth\/verify-email/);
  assert.match(login, /\/api\/auth\/forgot-password/);
  assert.match(login, /\/api\/auth\/reset-password/);
  assert.match(login, /L >= 15/);
});

test("sessão usa API e diferencia indisponibilidade de visitante", () => {
  assert.match(session, /authState: [^\n]*"unavailable"/);
  assert.match(session, /\/api\/auth\/login/);
  assert.match(session, /\/api\/auth\/logout/);
  assert.doesNotMatch(session, /localStorage\.setItem\([^\n]*(token|jwt)/i);
});
