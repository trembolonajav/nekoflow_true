import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  accountTab,
  requestDetailPath,
  routePaths,
} from "../src/app/routePaths.js";

test("contrato de caminhos não possui rotas estáticas duplicadas", () => {
  const paths = Object.values(routePaths);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(routePaths.home, "/");
  assert.equal(
    accountTab("lista", { midia: "anime" }),
    "/conta?aba=lista&midia=anime",
  );
  assert.equal(requestDetailPath("10/20"), "/solicitacoes/10%2F20");
});

test("roteador possui uma página 404 explícita", async () => {
  const source = await readFile(
    new URL("../src/app/router.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /path:\s*"\*",\s*Component:\s*NotFound/);
});
