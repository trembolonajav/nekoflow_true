import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicNavigationFiles = [
  "../src/components/Footer.jsx",
  "../src/components/Header.jsx",
  "../src/pages/Calendario.jsx",
  "../src/pages/Entrar.jsx",
  "../src/pages/Explorar.jsx",
  "../src/pages/Home.jsx",
  "../src/pages/Leituras.jsx",
  "../src/pages/Obra.jsx",
  "../src/pages/ObraLeitura.jsx",
];

test("navegação pública não usa href vazio como simulação", async () => {
  for (const path of publicNavigationFiles) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /href=["']#["']/, path);
  }
});

test("player e leitor identificam explicitamente o modo demonstrativo", async () => {
  const player = await readFile(
    new URL("../src/pages/Player.jsx", import.meta.url),
    "utf8",
  );
  const reader = await readFile(
    new URL("../src/pages/Leitor.jsx", import.meta.url),
    "utf8",
  );
  assert.match(player, /Demonstração de interface/);
  assert.match(reader, /Demonstração de interface/);
});
