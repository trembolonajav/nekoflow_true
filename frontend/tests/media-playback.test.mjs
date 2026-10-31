import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  browserSupport,
  rankSources,
  pickSource,
  createWatchMeter,
  markerAt,
  languageName,
  languageBadge,
  sourceLanguageSummary,
} from "../src/features/media/playbackRules.js";

const hls = { id: "h", type: "HLS", priority: 10, playsInPlayer: true };
const mp4 = { id: "m", type: "MP4", priority: 5, playsInPlayer: true };
const dash = { id: "d", type: "DASH", priority: 1, playsInPlayer: true };
const ext = { id: "x", type: "EXTERNAL_LINK", priority: 0, playsInPlayer: false, externalUrl: "https://site.test/ep1" };

test("navegador sem HLS nativo usa hls.js; DASH não é anunciado sem player dedicado", () => {
  const video = { canPlayType: (t) => (t.startsWith("video/mp4") ? "probably" : "") };
  assert.deepEqual(browserSupport(video, { isSupported: () => true }), { HLS: true, MP4: true, DASH: false });
  assert.equal(browserSupport(video, null).HLS, false);
  const safari = { canPlayType: (t) => (t === "application/vnd.apple.mpegurl" ? "maybe" : "") };
  assert.equal(browserSupport(safari, null).HLS, true);
});

test("fontes reproduzíveis vêm antes das externas; incompatíveis por último", () => {
  const ranked = rankSources([ext, dash, hls, mp4], { HLS: true, MP4: true, DASH: false });
  assert.deepEqual(
    ranked.map((s) => s.id),
    ["m", "h", "x", "d"],
  );
  assert.equal(ranked.find((s) => s.id === "d").compatible, false);
  assert.equal(pickSource(ranked).id, "m");
  assert.equal(pickSource(ranked, "h").id, "h", "preferência do usuário vale se compatível");
  assert.equal(pickSource(ranked, "d").id, "m", "fonte incompatível nunca é escolhida");
});

test("só link externo: nenhuma fonte para o player (sem reprodução fingida)", () => {
  const ranked = rankSources([ext], { HLS: true, MP4: true, DASH: false });
  assert.equal(pickSource(ranked), null);
});

test("tempo assistido conta só reprodução contínua; busca e pausa não contam", () => {
  const m = createWatchMeter();
  m.reset(0);
  for (let t = 0.25; t <= 10; t += 0.25) m.tick(t, { playing: true, seeking: false });
  assert.equal(m.take(), 10000);
  m.tick(600, { playing: true, seeking: false }); // arrastou até 10 min
  m.tick(600.25, { playing: true, seeking: false });
  assert.equal(m.take(), 250, "o salto não vira tempo assistido");
  m.tick(610, { playing: false, seeking: false }); // pausado
  m.tick(620, { playing: true, seeking: true }); // buscando
  m.tick(620.25, { playing: true, seeking: false });
  assert.equal(m.take(), 250);
  m.reset(0);
  for (let t = 0.5; t <= 4; t += 0.5) m.tick(t, { playing: true, seeking: false, rate: 2 });
  assert.equal(m.take(), 4000, "velocidade 2x mede o avanço real do vídeo");
});

test("marcações editoriais e nomes de idioma", () => {
  const markers = [{ kind: "INTRO", startMs: 90000, endMs: 180000 }];
  assert.equal(markerAt(markers, 100000, "INTRO").kind, "INTRO");
  assert.equal(markerAt(markers, 200000, "INTRO"), null);
  assert.equal(languageName("ja"), "Japonês");
  assert.equal(languageName("pt-BR"), "Português (Brasil)");
  assert.equal(languageName("fr"), "fr");
  assert.equal(languageBadge("pt-BR"), "🇧🇷 PT-BR");
  assert.equal(languageBadge("en"), "🇺🇸 EN");
  assert.equal(languageBadge("es"), "🇪🇸 ES");
  assert.equal(sourceLanguageSummary({ audioLanguages: ["ja"], subtitleLanguages: ["pt-BR"] }), "🇧🇷 PT-BR");
  assert.equal(sourceLanguageSummary({ audioLanguages: ["ja"], subtitleLanguages: ["en", "es"] }), "🇺🇸 EN / 🇪🇸 ES");
  assert.equal(sourceLanguageSummary({ audioLanguages: ["ja"], subtitleLanguages: [] }), "🇯🇵 JA");
});

test("player e leitor reais não usam temporizador de reprodução nem páginas fictícias", () => {
  const player = readFileSync(new URL("../src/pages/Player.jsx", import.meta.url), "utf8");
  const real = player.slice(player.indexOf("class RealPlayerLogic"));
  assert.doesNotMatch(real, /setInterval\(this\.step/, "o tempo vem do <video>, não de um contador");
  assert.match(real, /on\("timeupdate"/);
  assert.match(real, /mediaApi\.access/);
  const leitor = readFileSync(new URL("../src/pages/Leitor.jsx", import.meta.url), "utf8");
  const realReader = leitor.slice(leitor.indexOf("class RealLeitorLogic"));
  assert.match(realReader, /mediaApi\.manifest/);
  assert.doesNotMatch(realReader, /d\.banner|d\.chars|d\.cover/, "capas e personagens nunca viram páginas");
});
