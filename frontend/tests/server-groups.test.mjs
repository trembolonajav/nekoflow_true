import test from "node:test";
import assert from "node:assert/strict";
import {
  versionOf,
  providerOf,
  groupVersions,
  rememberedProvider,
  rememberProvider,
} from "../src/features/media/serverGroups.js";

// Os cinco embeds reais do episódio 1 de Tensei Shitara Ken Deshita 2nd Season.
const sources = [
  { id: "1", label: "Player ext 1 · Legendada", audioLanguages: ["ja"], subtitleLanguages: ["pt-BR"],
    embedUrl: "https://www.blogger.com/video.g?token=x" },
  { id: "2", label: "ZokoAnime · Legendado (EN)", audioLanguages: ["ja"], subtitleLanguages: ["en"],
    embedUrl: "https://zokoanime.video/stream/mal/49891/1/sub" },
  { id: "3", label: "HD-1 · Legendado (EN)", audioLanguages: ["ja"], subtitleLanguages: ["en"],
    embedUrl: "https://megaplay.buzz/stream/s-2/94330/sub?s=tcdn" },
  { id: "4", label: "ZokoAnime · Dublado (EN)", audioLanguages: ["en"], subtitleLanguages: [],
    embedUrl: "https://zokoanime.video/stream/mal/49891/1/dub" },
  { id: "5", label: "HD-1 · Dublado (EN)", audioLanguages: ["en"], subtitleLanguages: [],
    embedUrl: "https://megaplay.buzz/stream/s-2/94330/dub?s=tcdn" },
];

test("cinco embeds viram três versões, cada uma com seus servidores", () => {
  const groups = groupVersions(sources);
  assert.deepEqual(groups.map((g) => g.label), ["Legendado PT-BR", "Legendado EN", "Dublado EN"]);
  assert.deepEqual(groups[1].servers.map((r) => `${r.name} · ${r.provider}`), [
    "Servidor 1 · ZokoAnime",
    "Servidor 2 · HD-1 · MegaPlay",
  ]);
  assert.equal(groups[0].servers[0].provider, "Blogger · legenda embutida");
});

test("a versão da preferência da pessoa vem primeiro", () => {
  const prefersEnDub = (s) => ((s.audioLanguages || [])[0] === "en" ? 100 : 0);
  assert.equal(groupVersions(sources, prefersEnDub)[0].label, "Dublado EN");
});

test("áudio duplo e idioma ausente não são inventados", () => {
  assert.equal(versionOf({ audioLanguages: ["multi"], subtitleLanguages: ["pt-BR"] }).label, "Dual áudio · PT-BR");
  assert.equal(versionOf({ audioLanguages: ["ja"], subtitleLanguages: [] }).label, "Legendado");
  assert.equal(providerOf({ label: "Player ext 2 · Legendada", embedUrl: "https://abc.example.test/e/1" }), "abc.example.test");
});

test("o servidor que funcionou fica lembrado por obra e versão", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(rememberedProvider("w1", "leg:en", storage), null);
  rememberProvider("w1", "leg:en", "HD-1 · MegaPlay", storage);
  assert.equal(rememberedProvider("w1", "leg:en", storage), "HD-1 · MegaPlay");
  assert.equal(rememberedProvider("w1", "dub:en", storage), null);
});
