import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalWorks,
  getUnitUrl,
  getWorkUrl,
  normalizeSearch,
  slugifyTitle,
} from "../src/features/catalog/workNavigation.js";

test("gera destinos canônicos distintos para anime e leitura com o mesmo título", () => {
  assert.equal(
    getWorkUrl({ id: 151807, kind: "anime", title: "Solo Leveling" }),
    "/animes/solo-leveling-151807",
  );
  assert.equal(
    getWorkUrl({ id: 105398, kind: "manhwa", title: "Solo Leveling" }),
    "/leituras/solo-leveling-105398",
  );
  assert.notEqual(
    canonicalWorks.soloLevelingAnime,
    canonicalWorks.soloLevelingReading,
  );
});

test("normaliza acentos e não inventa destino sem identidade", () => {
  assert.equal(slugifyTitle("Coração de Dragão!"), "coracao-de-dragao");
  assert.equal(normalizeSearch("  CORAÇÃO!! "), "coracao");
  assert.equal(getWorkUrl({ kind: "anime", title: "Sem ID" }), null);
  assert.equal(
    getWorkUrl({ id: 1, kind: "desconhecido", title: "Sem tipo" }),
    null,
  );
});

test("unidades só abrem experiências realmente cadastradas", () => {
  assert.equal(
    getUnitUrl({ id: 151807, kind: "anime" }, 2),
    "/player?obra=151807&ep=2",
  );
  assert.equal(getUnitUrl({ id: 9, kind: "anime" }, 2), null);
});
