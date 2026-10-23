import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePreferences,
  rankByPreference,
  preferenceScore,
  substitutionNotice,
} from "../src/features/preferences/mediaPreferences.js";
import { translateError } from "../src/i18n/errors.js";
import { languageName } from "../src/features/media/playbackRules.js";

const subEn = { id: "en", audioLanguages: ["ja"], subtitleLanguages: ["en"] };
const subEs = { id: "es", audioLanguages: ["ja"], subtitleLanguages: ["es"] };
const subPt = { id: "pt", audioLanguages: ["ja"], subtitleLanguages: ["pt-BR"] };
const dubPt = { id: "dub", audioLanguages: ["pt-BR"], subtitleLanguages: [] };
const unknown = { id: "x", audioLanguages: [], subtitleLanguages: [] };

test("rótulos da tela Conta viram códigos; idioma do site é independente", () => {
  const p = normalizePreferences({ audio: "Japonês", subs: "PT-BR", subsAlt: "Inglês", locale: "English" });
  assert.deepEqual(p, { audio: "ja", subtitle: "pt-BR", subtitlesOff: false, subtitleFallback: "en", locale: "en" });
  const d = normalizePreferences({});
  assert.equal(d.audio, "ja");
  assert.equal(d.subtitle, "pt-BR");
  assert.equal(normalizePreferences({ subs: "Desligadas" }).subtitlesOff, true);
});

test("PT-BR + áudio JA + legenda EN alternativa: escolhe a legenda certa", () => {
  const prefs = normalizePreferences({ audio: "Japonês", subs: "PT-BR", subsAlt: "Inglês" });
  assert.equal(rankByPreference([subEs, subEn, subPt], prefs)[0].id, "pt");
  assert.equal(rankByPreference([subEs, subEn], prefs)[0].id, "en", "sem PT-BR, a alternativa EN");
  assert.equal(rankByPreference([subEs, unknown], prefs)[0].id, "es", "ordem editorial quando nada combina");
});

test("áudio preferido em português escolhe a dublagem, não a legenda PT-BR", () => {
  const prefs = normalizePreferences({ audio: "Português (Brasil)", subs: "PT-BR" });
  assert.equal(rankByPreference([subPt, dubPt], prefs)[0].id, "dub");
  assert.ok(preferenceScore(dubPt, prefs) > preferenceScore(subPt, prefs));
});

test("substituição de idioma sempre avisada; idioma desconhecido não é presumido", () => {
  const prefs = normalizePreferences({ audio: "Japonês", subs: "PT-BR", subsAlt: "Inglês" });
  assert.equal(substitutionNotice(subPt, prefs, languageName), null);
  assert.match(substitutionNotice(subEn, prefs, languageName), /Legenda Português \(Brasil\) indisponível.*Inglês/);
  assert.match(substitutionNotice(unknown, prefs, languageName), /não informada/);
  const dub = normalizePreferences({ audio: "Português (Brasil)" });
  assert.match(substitutionNotice(subEn, dub, languageName), /Áudio Português \(Brasil\) indisponível/);
});

test("erros do Java seguem o idioma do site pelo código", () => {
  assert.equal(translateError("EPISODE_NOT_FOUND", "Episódio não encontrado.", "pt-BR"), "Episódio não encontrado.");
  assert.equal(translateError("EPISODE_NOT_FOUND", "Episódio não encontrado.", "en"), "Episode not found.");
  assert.equal(translateError("EPISODE_NOT_FOUND", "Episódio não encontrado.", "es"), "Episodio no encontrado.");
  assert.equal(translateError("CODIGO_NOVO", "Mensagem do servidor", "en"), "Mensagem do servidor");
});

test("primeira visita usa o idioma do navegador; título nunca é traduzido", async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  Object.defineProperty(globalThis, "navigator", { value: { languages: ["es-MX", "en"] }, configurable: true });
  const m = await import(`../src/i18n/locale.js?es=${Date.now()}`);
  assert.equal(m.getLocale(), "es");
  assert.equal(m.translate("Tsuihou Sareta Tensei Juukishi wa Game Chishiki de Musou Suru", "es"),
    "Tsuihou Sareta Tensei Juukishi wa Game Chishiki de Musou Suru");
  assert.equal(m.translate("Ação e fantasia", "en"), "Action and fantasy");
});
