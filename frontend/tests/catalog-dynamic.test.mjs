import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mergeCatalogItem, mergeCatalogList } from "../src/features/catalog/mergeCatalog.js";

test("catálogo canônico corrige metadados sem apagar curadoria visual", () => {
  const merged = mergeCatalogItem(
    { id: 1, title: "Antigo", genres: ["Ação"], score: 8.2, banner: "curado.jpg" },
    { id: 1, title: "Canônico", cover: "capa.jpg", banner: null },
  );
  assert.equal(merged.title, "Canônico");
  assert.equal(merged.cover, "capa.jpg");
  assert.equal(merged.banner, "curado.jpg");
  assert.deepEqual(merged.genres, ["Ação"]);
  assert.equal(merged.score, 8.2);
});

test("mesma identidade não duplica e nova obra pode entrar na coleção", () => {
  const result = mergeCatalogList([{ id: 10, title: "A" }], [{ id: 10, title: "A2" }, { id: 11, title: "B" }]);
  assert.deepEqual(result.map((x) => x.id), [10, 11]);
  assert.equal(result[0].title, "A2");
});

test("fichas usam API v1 e fonte externa não fabrica progresso", async () => {
  const route = await readFile(new URL("../src/pages/WorkRoute.jsx", import.meta.url), "utf8");
  const detail = await readFile(new URL("../src/pages/BasicWorkDetail.jsx", import.meta.url), "utf8");
  const player = await readFile(new URL("../src/pages/Player.jsx", import.meta.url), "utf8");
  assert.match(route, /\/api\/v1\/works\/resolve/);
  assert.match(detail, /\/api\/v1\/works\/\$\{work\.id\}\/seasons/);
  assert.match(detail, /\/api\/v1\/seasons\/\$\{selectedSeason\}\/episodes/);
  assert.match(detail, /Temporada \{season\.display_number\}/);
  // Protocolo 06: fonte que só abre no provedor fica com conclusão manual, sem tempo inventado.
  assert.match(player, /Este episódio abre no site do provedor/);
  assert.match(player, /não informa o tempo assistido/);
});
