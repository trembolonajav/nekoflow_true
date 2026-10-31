"""Audita e gera o snapshot multilíngue do catálogo NekoFlow.

O pipeline somente publica metadados que possuem fonte. Sinopses das obras em
inglês são traduzidas localmente com Argos. Títulos e sinopses de episódios
são consultados no Jikan/MAL quando a fonte de vídeo carrega um ID MAL.
Imagens de capa/banner nunca são promovidas a preview de episódio.
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import html
import json
import os
import re
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "backend/src/main/resources/seed/catalog-localizations.json"
REPORT = ROOT / "audit/catalog-localization-coverage.json"
CACHE = ROOT / ".artifact-work/catalog-localization-cache"
ARGOS_ROOT = ROOT / ".artifact-work/argos"
# api.jikan.moe recusa conexões desta rede; o espelho entrega os mesmos dados do MAL.
JIKAN_EDGE = os.environ.get("NEKOFLOW_JIKAN_URL", "https://jikan.lucashdo.com/v1")
USER_AGENT = "NekoFlow-Catalog-Localization/1.0"
MAL_RE = re.compile(r"/stream/mal/(\d+)/([^/?]+)/", re.I)
# Casos agregados ou com pontuação que a busca textual não consegue decidir sozinha.
# IDs conferidos na API oficial; séries agregadas apontam para a primeira entrada e as
# temporadas seguintes continuam representadas pelas relações do AniList.
ANILIST_OVERRIDES = {
    "How NOT to Summon a Demon Lord": 101004,
    "Hitori no Shita - The Outcast": 21840,
    "BanG Dream! It's MyGO!!!!! / Ave Mujica (Zoku-hen)": 189121,
    "MURCIÉLAGO": 213877,
    "Historié": 205130,
}


def configure_argos() -> None:
    os.environ.setdefault("XDG_DATA_HOME", str(ARGOS_ROOT / "data"))
    os.environ.setdefault("XDG_CONFIG_HOME", str(ARGOS_ROOT / "config"))
    os.environ.setdefault("XDG_CACHE_HOME", str(ARGOS_ROOT / "cache"))
    os.environ.setdefault("ARGOS_PACKAGES_DIR", str(ARGOS_ROOT / "packages"))


def psql_json(sql: str) -> list[dict]:
    command = [
        "docker", "exec", "nekoflow_true-postgres-1", "psql",
        "-U", "nekoflow", "-d", "nekoflow", "-At", "-c",
        f"SELECT row_to_json(q)::text FROM ({sql}) q",
    ]
    result = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, text=True,
                            encoding="utf-8")
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def clean_text(value: str | None) -> str | None:
    if not value:
        return None
    value = re.sub(r"(?i)<br\s*/?>|</p>", "\n", value)
    value = html.unescape(re.sub(r"<[^>]+>", "", value))
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value).strip()
    return value or None


def first_paragraph(value: str | None, limit: int = 420) -> str | None:
    if not value:
        return None
    paragraph = value.split("\n\n", 1)[0].strip()
    if len(paragraph) <= limit:
        return paragraph
    cut = paragraph.rfind(" ", 0, limit - 1)
    return paragraph[: cut if cut > 100 else limit - 1].rstrip(" ,;:") + "…"


def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def save_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# Marcador que o Argos (OPUS-MT) devolve intacto em pt e es; "[0]" e "NKZ0Q" se perdem.
PLACEHOLDER_RE = re.compile(r"X\s?q\s?(\d+)\s?x", re.I)


@functools.lru_cache(maxsize=2048)
def terms_pattern(terms: tuple[str, ...]) -> re.Pattern:
    return re.compile(r"(?<![\w])(" + "|".join(re.escape(t) for t in terms) + r")(?![\w])")


def mask_terms(text: str, terms: list[str]) -> tuple[str, list[str]]:
    """Troca títulos e nomes em romaji por marcadores para o tradutor não traduzi-los
    ("Tensei Shitara Ken Deshita" virava "Tensei Mierda Ken Deshita")."""
    if not terms:
        return text, []
    pattern = terms_pattern(tuple(terms))
    found: list[str] = []

    def swap(match: re.Match) -> str:
        if match.group(1) not in found:
            found.append(match.group(1))
        return f"Xq{found.index(match.group(1))}x"

    return pattern.sub(swap, text), found


def unmask_terms(text: str, found: list[str]) -> str | None:
    """Devolve os nomes originais; None quando o tradutor perdeu ou inventou um marcador."""
    seen = {int(m.group(1)) for m in PLACEHOLDER_RE.finditer(text)}
    if seen != set(range(len(found))):
        return None
    return PLACEHOLDER_RE.sub(lambda m: found[int(m.group(1))], text)


PT_BR_MODEL = "Helsinki-NLP/opus-mt-tc-big-en-pt"
PT_BR_CT2 = ROOT / ".artifact-work/opus-en-pt-ct2"
# O modelo en→pt do Argos gera português de Portugal ("puxa-te", "ecrã"). O NekoFlow usa só
# português do Brasil: o OPUS-MT tc-big recebe o rótulo >>pob<< (pt-BR). A chave de cache
# separada impede reaproveitar traduções antigas em pt-PT.
CACHE_SLOT = {"pt-BR": "pt-BR-pob", "es": "es"}
SENTENCE_RE = re.compile(r"(?<=[.!?…])\s+(?=[\"“(\[A-Z0-9])")


UNK_FIXES = [
    (re.compile(r"<unk>(?=ltim)"), "Ú"),
    (re.compile(r"(?<=Br)<unk>(?=l[ée]e)"), "û"),
    (re.compile(r"(?<=Se)<unk>(?=or)"), "ñ"),
    (re.compile(r"(?<=q)<unk>(?=[eéêiíî])"), "u"),
    (re.compile(r"(?<=g)<unk>(?=[eéêiíî])"), "u"),
    (re.compile(r"(?<=Arco-)<unk>(?=ris)"), "í"),
    (re.compile(r"(?:(?<=^)|(?<=[.!?…]\s)|(?<=\n)|(?<=\())<unk>(?=\s+[a-zà-ú])"), "À"),
    (re.compile(r"(?<=\s)<unk>(?=\s+[a-zà-ú])"), "à"),
]
PT_PT_TO_BR = [
    (r"\bcomboios\b", "trens"), (r"\bcomboio\b", "trem"),
    (r"\bequipas\b", "equipes"), (r"\bequipa\b", "equipe"),
    (r"\bà casa de banho\b", "ao banheiro"), (r"\bna casa de banho\b", "no banheiro"),
    (r"\bda casa de banho\b", "do banheiro"), (r"\ba casa de banho\b", "o banheiro"),
    (r"\bcasas de banho\b", "banheiros"), (r"\bcasa de banho\b", "banheiro"),
    (r"\bautocarros?\b", "ônibus"), (r"\btelemóve(?:l|is)\b", "celular"),
    (r"\bpequeno-almoço\b", "café da manhã"), (r"\becrã\b", "tela"),
    (r"\ba tempo parcial\b", "de meio período"), (r"\ba tempo inteiro\b", "em tempo integral"),
    (r"\braparigas\b", "garotas"), (r"\brapariga\b", "garota"),
    (r"\bmiúdos\b", "garotos"), (r"\bmiúdo\b", "garoto"),
    (r"\bconseqüência", "consequência"), (r"\bfreqüente", "frequente"),
]


def fix_pt_br(text: str | None) -> str | None:
    """Pós-edição do OPUS-MT: recompõe letras que viram <unk> e troca vocabulário de Portugal."""
    if not text:
        return text
    for pattern, value in UNK_FIXES:
        text = pattern.sub(value, text)
    text = re.sub(r"\s*\(\s*<unk>[^)]*\)", "", text)  # "(<unk>)": grafia japonesa perdida
    text = text.replace("<unk>", "")
    for pattern, value in PT_PT_TO_BR:
        text = re.sub(pattern, lambda m: value[0].upper() + value[1:] if m.group(0)[0].isupper() else value,
                      text, flags=re.I)
    return re.sub(r"[ \t]{2,}", " ", text).strip()


class BrazilianPortuguese:
    """en→pt-BR frase a frase (o modelo pula frases quando recebe o parágrafo inteiro)."""

    def __init__(self) -> None:
        import ctranslate2
        from transformers import MarianTokenizer

        os.environ.setdefault("HF_HOME", str(ROOT / ".artifact-work/hf"))
        if not (PT_BR_CT2 / "model.bin").exists():
            from ctranslate2.converters import TransformersConverter
            TransformersConverter(PT_BR_MODEL).convert(str(PT_BR_CT2), quantization="int8", force=True)
        self.tokenizer = MarianTokenizer.from_pretrained(PT_BR_MODEL)
        self.engine = ctranslate2.Translator(str(PT_BR_CT2), device="cpu")

    def translate(self, texts: list[str]) -> list[str]:
        pieces: list[tuple[int, int, str]] = []  # (texto, parágrafo, frase)
        layout: list[list[int]] = []
        for index, text in enumerate(texts):
            paragraphs = text.split("\n")
            layout.append([])
            for p_index, paragraph in enumerate(paragraphs):
                sentences = [x for x in SENTENCE_RE.split(paragraph.strip()) if x.strip()] if paragraph.strip() else []
                layout[index].append(len(sentences))
                pieces.extend((index, p_index, sentence) for sentence in sentences)
        outputs: list[str] = []
        for start in range(0, len(pieces), 32):
            batch = pieces[start:start + 32]
            tokens = [self.tokenizer.convert_ids_to_tokens(self.tokenizer.encode(">>pob<< " + item[2]))
                      for item in batch]
            result = self.engine.translate_batch(tokens, beam_size=4, max_batch_size=32)
            outputs.extend(self.tokenizer.convert_tokens_to_string(r.hypotheses[0]).strip() for r in result)
        out: list[str] = []
        cursor = 0
        for counts in layout:
            paragraphs = []
            for count in counts:
                paragraphs.append(" ".join(outputs[cursor:cursor + count]))
                cursor += count
            out.append("\n".join(paragraphs).strip())
        return out


class Translator:
    def __init__(self) -> None:
        configure_argos()
        from argostranslate import translate

        languages = {item.code: item for item in translate.get_installed_languages()}
        if "en" not in languages or "pt" not in languages or "es" not in languages:
            raise RuntimeError("Modelos Argos ausentes; execute tools/install_argos_catalog_models.py")
        self.translators = {"es": languages["en"].get_translation(languages["es"])}
        self.brazilian = BrazilianPortuguese()
        self.cache_path = CACHE / "translations.json"
        self.cache: dict[str, dict[str, str]] = load_json(self.cache_path, {})
        self.changed = 0

    def translate(self, text: str | None, language: str, terms: list[str] | None = None) -> str | None:
        if not text:
            return None
        masked, found = mask_terms(text, terms or [])
        if found:
            value = unmask_terms(self._translate(masked, language), found)
            if value is not None:
                return value
        return self._translate(text, language)

    def _translate(self, text: str, language: str) -> str:
        key = hashlib.sha256(text.encode("utf-8")).hexdigest()
        slot = CACHE_SLOT[language]
        cached = self.cache.get(key, {}).get(slot)
        if cached:
            return cached
        translated = (self.brazilian.translate([text])[0] if language == "pt-BR"
                      else self.translators[language].translate(text).strip())
        self.cache.setdefault(key, {})[slot] = translated
        self.changed += 1
        if self.changed % 25 == 0:
            save_json(self.cache_path, self.cache)
            print(f"  {self.changed} traduções novas", flush=True)
        return translated

    def close(self) -> None:
        save_json(self.cache_path, self.cache)

    def translate_many(self, texts: list[str | None], language: str,
                       terms: list[list[str]] | None = None) -> list[str | None]:
        """Traduz em lote protegendo os nomes de cada texto; se um marcador se perder,
        aquele texto é traduzido de novo sem máscara."""
        masks = [mask_terms(t, (terms or [])[i] if terms else []) if t else (t, [])
                 for i, t in enumerate(texts)]
        out = self._translate_many([m[0] for m in masks], language)
        retry = []
        for i, ((_, found), value) in enumerate(zip(masks, out)):
            if found and value is not None:
                out[i] = unmask_terms(value, found)
                if out[i] is None:
                    retry.append(i)
        if retry:
            plain = self._translate_many([texts[i] for i in retry], language)
            for i, value in zip(retry, plain):
                out[i] = value
        return out

    def _translate_many(self, texts: list[str | None], language: str) -> list[str | None]:
        """Traduz textos curtos em lote usando o modelo CTranslate2 do Argos."""
        missing = []
        keys = []
        result: list[str | None] = []
        slot = CACHE_SLOT[language]
        for value in texts:
            if not value:
                keys.append(None)
                result.append(None)
                continue
            key = hashlib.sha256(value.encode("utf-8")).hexdigest()
            keys.append(key)
            cached = self.cache.get(key, {}).get(slot)
            result.append(cached)
            if cached is None:
                missing.append((len(result) - 1, key, value))
        if not missing:
            return result
        if language == "pt-BR":
            for start in range(0, len(missing), 256):
                batch = missing[start:start + 256]
                for (result_index, key, _), value in zip(batch, self.brazilian.translate([m[2] for m in batch])):
                    result[result_index] = value
                    self.cache.setdefault(key, {})[slot] = value
                save_json(self.cache_path, self.cache)
                print(f"  lote {start + len(batch)}/{len(missing)} (pt-BR)", flush=True)
            return result
        package_translation = self.translators[language]
        # get_translation pode devolver o wrapper de cache da biblioteca.
        underlying = getattr(package_translation, "underlying", package_translation)
        while hasattr(underlying, "t1"):
            underlying = underlying.t1
        from argostranslate import settings
        import ctranslate2

        engine = ctranslate2.Translator(
            str(underlying.pkg.package_path / "model"), device=settings.device,
            inter_threads=settings.inter_threads, intra_threads=settings.intra_threads,
            compute_type=settings.compute_type,
        )
        for start in range(0, len(missing), 64):
            batch = missing[start:start + 64]
            tokenized = [underlying.pkg.tokenizer.encode(item[2]) for item in batch]
            translated = engine.translate_batch(
                tokenized, replace_unknowns=True, max_batch_size=64, batch_type="examples",
                beam_size=1, num_hypotheses=1,
            )
            for (result_index, key, _), item in zip(batch, translated):
                value = underlying.pkg.tokenizer.decode(item.hypotheses[0]).strip()
                result[result_index] = value
                self.cache.setdefault(key, {})[slot] = value
            if start and start % 640 == 0:
                save_json(self.cache_path, self.cache)
                print(f"  lote {start}/{len(missing)} ({language})", flush=True)
        return result


def request_json(url: str, attempts: int = 4) -> dict | None:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urlopen(req, timeout=25) as response:
                return json.loads(response.read().decode("utf-8", "replace"))
        except HTTPError as exc:
            if exc.code == 404:
                return None
            last = exc
            time.sleep(1.5 * (attempt + 1))
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    print(f"AVISO: falha ao consultar {url}: {last}", file=sys.stderr)
    return None


def request_graphql(query: str, variables: dict, attempts: int = 4) -> dict | None:
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = Request("https://graphql.anilist.co", data=body, headers={
                "User-Agent": USER_AGENT, "Accept": "application/json",
                "Content-Type": "application/json",
            })
            with urlopen(req, timeout=25) as response:
                return json.loads(response.read().decode("utf-8", "replace"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    print(f"AVISO: falha ao consultar AniList: {last}", file=sys.stderr)
    return None


SEASON_SUFFIX = re.compile(
    r"\s*(?:[:\-–]\s*)?(?:\d+(?:st|nd|rd|th)\s+Season|Season\s+\d+|Part\s+\d+|"
    r"(?:II|III|IV|V|VI)|\d+)\s*$", re.I)
COMMON_WORDS = {
    "the", "and", "for", "with", "from", "into", "will", "hope", "rose", "king", "queen",
    "lord", "lady", "master", "sword", "hero", "demon", "girl", "boy", "man", "woman",
    "season", "part", "story", "world", "life", "love", "dark", "light", "black", "white",
    "red", "blue", "god", "goddess", "prince", "princess", "brother", "sister", "mother",
    "father", "teacher", "captain", "doctor", "angel", "witch", "dragon", "knight",
}


def character_alternatives(anilist_ids: list[int]) -> dict[str, list[str]]:
    """Nomes alternativos dos personagens no AniList, em cache (o retrato só guarda full/native)."""
    path = CACHE / "anilist-character-alternatives.json"
    cache = load_json(path, {})
    query = """query($id:Int){Media(id:$id){characters(perPage:25,sort:[ROLE,RELEVANCE]){
      nodes{name{full alternative}}}}}"""
    pending = [i for i in anilist_ids if str(i) not in cache]
    if pending:
        print(f"Buscando nomes alternativos de personagens de {len(pending)} obras...", flush=True)
    for index, anilist_id in enumerate(pending, 1):
        payload = request_graphql(query, {"id": anilist_id})
        if payload is None:
            continue
        nodes = ((((payload.get("data") or {}).get("Media") or {}).get("characters") or {}).get("nodes")) or []
        cache[str(anilist_id)] = sorted({alt for n in nodes for alt in ((n.get("name") or {}).get("alternative") or [])
                                         if alt and 3 <= len(alt) <= 40})
        if index % 25 == 0:
            save_json(path, cache)
            print(f"  personagens {index}/{len(pending)}", flush=True)
        time.sleep(2.2)
    save_json(path, cache)
    return cache


def protected_terms() -> dict[int, list[str]]:
    """Títulos e nomes em escrita latina de cada obra; ficam fora da tradução automática."""
    rows = psql_json("""
        SELECT w.id AS "workId",
               array_remove(array_cat(array_cat(ARRAY[w.title], string_to_array(coalesce(w.alt_titles,''),' | ')),
                 ARRAY(SELECT t.title FROM work_title t WHERE t.work_id=w.id)), '') AS titles,
               ARRAY(SELECT e->'node'->'name'->>'full'
                     FROM work_anilist_snapshot s, jsonb_array_elements(s.payload->'characters'->'edges') e
                     WHERE s.work_id=w.id) AS names,
               (SELECT s.anilist_id FROM work_anilist_snapshot s WHERE s.work_id=w.id) AS "anilistId"
        FROM work w WHERE w.visibility='PUBLISHED'
    """)
    # "All Might (オールマイト)" → "All Might": a grafia japonesa entre parênteses fica de fora.
    alternatives = {key: sorted({re.sub(r"\s*\([^)]*\)", "", alt).strip() for alt in names} - {""})
                    for key, names in character_alternatives(
                        sorted({int(r["anilistId"]) for r in rows if r.get("anilistId")})).items()}
    latin = re.compile(r"^[\x20-\x7e\u00c0-\u024f\u2019]+$")
    result: dict[int, list[str]] = {}
    for row in rows:
        terms: set[str] = set()
        for title in row.get("titles") or []:
            title = (title or "").strip()
            if not title or not latin.match(title):
                continue
            for value in (title, SEASON_SUFFIX.sub("", title), title.split(":")[0]):
                value = value.strip(" -:")
                if len(value) >= 4:
                    terms.add(value)
        for name in row.get("names") or []:
            name = (name or "").strip()
            if not name or not latin.match(name):
                continue
            terms.add(name)
            for token in re.split(r"[\s\-]+", name):
                if len(token) >= 3 and token[0].isupper() and token.lower() not in COMMON_WORDS:
                    terms.add(token)
        for alt in alternatives.get(str(row.get("anilistId")), []):
            if latin.match(alt) and alt.lower() not in COMMON_WORDS:
                terms.add(alt)
        result[int(row["workId"])] = terms
    # Nomes compostos ("All Might", "All For One") valem para a franquia toda: um personagem
    # pode faltar entre os 25 principais de uma temporada e aparecer nos episódios dela.
    shared = {alt for names in alternatives.values() for alt in names
              if " " in alt and latin.match(alt) and all(w[:1].isupper() for w in alt.split())
              and not all(w.lower() in COMMON_WORDS for w in alt.split())}
    return {work: sorted(terms | shared, key=len, reverse=True) for work, terms in result.items()}


def source_works() -> list[dict]:
    return psql_json("""
        SELECT w.id AS "workId", w.title, w.title AS "workTitle", w.year,
               concat_ws(' | ',w.title,w.alt_titles,
                 (SELECT string_agg(t.title,' | ') FROM work_title t WHERE t.work_id=w.id)) AS "workTitles",
               (SELECT x.external_id FROM external_identifier x
                WHERE x.work_id=w.id AND x.provider='ANILIST' LIMIT 1) AS "anilistId",
               COALESCE(NULLIF((SELECT t.synopsis_full FROM work_translation t
                                WHERE t.work_id=w.id AND t.language='en' LIMIT 1),''),
                        CASE WHEN w.synopsis_language='en' THEN w.synopsis_full END) AS synopsis,
               -- Só tradução revisada/manual bloqueia: a automática antiga (pt-PT do Argos) é refeita.
               EXISTS(SELECT 1 FROM work_translation t WHERE t.work_id=w.id AND t.language='pt-BR'
                      AND coalesce(t.source,'') NOT LIKE 'Tradução automática local%') AS "hasPt",
               EXISTS(SELECT 1 FROM work_translation t WHERE t.work_id=w.id AND t.language='es'
                      AND coalesce(t.source,'') NOT LIKE 'Traducción automática local%') AS "hasEs"
        FROM work w WHERE w.visibility='PUBLISHED'
        ORDER BY w.id
    """)


def source_episodes() -> list[dict]:
    return psql_json("""
        SELECT DISTINCT ON (e.id) e.id::text AS "episodeId", w.id AS "workId", w.title AS "workTitle",
               e.display_number AS "displayNumber", e.sort_position::text AS "sortPosition",
               e.title, e.synopsis, e.thumbnail_url AS thumbnail, es.source_url AS "sourceUrl",
               (SELECT x.external_id FROM external_identifier x
                WHERE x.work_id=w.id AND x.provider='ANILIST' LIMIT 1) AS "anilistId",
               (SELECT count(*) FROM season sx WHERE sx.work_id=w.id AND sx.visibility='PUBLISHED') AS "seasonCount",
               se.sort_position::text AS "seasonNumber", w.year,
               concat_ws(' | ',w.title,w.alt_titles,
                 (SELECT string_agg(t.title,' | ') FROM work_title t WHERE t.work_id=w.id)) AS "workTitles"
        FROM episode e
        JOIN season se ON se.id=e.season_id
        JOIN work w ON w.id=se.work_id
        LEFT JOIN episode_source es ON es.episode_id=e.id AND es.source_url LIKE '%/stream/mal/%'
        WHERE se.visibility='PUBLISHED' AND w.visibility='PUBLISHED'
        ORDER BY e.id, (es.source_url IS NOT NULL) DESC, es.priority
    """)


def normalize_title(value: str | None) -> str:
    return re.sub(r"[^0-9a-z\u3040-\u30ff\u4e00-\u9fff]+", "", (value or "").lower().replace("&", "and"))


def link_anilist(rows: list[dict]) -> list[dict]:
    """Liga ao AniList as obras sem ID, só quando a correspondência é segura: título idêntico
    (romaji, inglês, nativo ou sinônimo) a exatamente um resultado, ano compatível e a
    contagem de episódios do NekoFlow cabendo na do AniList. Na dúvida, fica sem vínculo."""
    pending = psql_json("""
        SELECT w.id AS "workId", w.title, w.year,
               ARRAY(SELECT t.title FROM work_title t WHERE t.work_id=w.id) AS titles,
               (SELECT count(*) FROM season se JOIN episode e ON e.season_id=se.id
                WHERE se.work_id=w.id) AS episodes
        FROM work w
        WHERE w.visibility='PUBLISHED' AND w.media_family='ANIMATION'
          AND NOT EXISTS(SELECT 1 FROM external_identifier x WHERE x.work_id=w.id AND x.provider='ANILIST')
        ORDER BY w.id
    """)
    path = CACHE / "anilist-search.json"
    cache = load_json(path, {})
    query = """query($q:String){Page(perPage:10){media(search:$q,type:ANIME){
      id format episodes seasonYear startDate{year}
      title{romaji english native} synonyms}}}"""
    links: list[dict] = []
    rejected = 0
    print(f"Procurando no AniList {len(pending)} obras sem vínculo...", flush=True)
    for index, work in enumerate(pending, 1):
        if work["title"] not in cache:
            payload = request_graphql(query, {"q": work["title"]})
            if payload is None:
                continue  # AniList indisponível: tenta na próxima execução
            cache[work["title"]] = (payload.get("data") or {}).get("Page", {}).get("media") or []
            save_json(path, cache)
            time.sleep(2.2)
        names = {normalize_title(work["title"])} | {normalize_title(t) for t in work.get("titles") or []}
        names.discard("")
        exact = []
        for media in cache[work["title"]]:
            titles = [*(media.get("title") or {}).values(), *(media.get("synonyms") or [])]
            if names & {normalize_title(t) for t in titles if t}:
                exact.append(media)
        # Um único título exatamente igual já identifica a obra. Ano e episódios são
        # desempate apenas quando o AniList devolve homônimos; temporadas agrupadas no
        # NekoFlow podem ter mais episódios que uma entrada sazonal do AniList.
        if len(exact) > 1:
            year = work.get("year")
            by_year = [m for m in exact if not year or abs(
                (m.get("seasonYear") or (m.get("startDate") or {}).get("year") or year) - year
            ) <= 1]
            if by_year:
                exact = by_year
        if len(exact) > 1:
            count = int(work.get("episodes") or 0)
            by_count = [m for m in exact if not m.get("episodes") or count == m["episodes"]]
            if by_count:
                exact = by_count
        if len(exact) == 1:
            media = exact[0]
            links.append({"workId": work["workId"], "anilistId": media["id"], "title": work["title"],
                          "matchedTitle": (media.get("title") or {}).get("romaji")})
        elif work["title"] in ANILIST_OVERRIDES:
            links.append({"workId": work["workId"], "anilistId": ANILIST_OVERRIDES[work["title"]],
                          "title": work["title"], "matchedTitle": "revisão manual da API oficial"})
        else:
            rejected += 1
            continue
        if index % 50 == 0:
            print(f"  AniList {index}/{len(pending)}", flush=True)
    by_work = {link["workId"]: link["anilistId"] for link in links}
    for row in rows:
        if not row.get("anilistId") and row["workId"] in by_work:
            row["anilistId"] = str(by_work[row["workId"]])
    print(f"Vínculos seguros com o AniList: {len(links)} de {len(pending)} ({rejected} sem correspondência única)",
          flush=True)
    return links


def anilist_descriptions(rows: list[dict]) -> int:
    """Preenche a sinopse inglesa ausente com a descrição do AniList (com fonte citada)."""
    missing = [row for row in rows if not clean_text(row.get("synopsis")) and row.get("anilistId")
               and str(row["anilistId"]).isdigit()]
    path = CACHE / "anilist-descriptions.json"
    cache = load_json(path, {})
    pending = sorted({int(row["anilistId"]) for row in missing if str(row["anilistId"]) not in cache})
    query = "query($ids:[Int]){Page(perPage:50){media(id_in:$ids){id description(asHtml:false)}}}"
    for start in range(0, len(pending), 50):
        batch = pending[start:start + 50]
        payload = request_graphql(query, {"ids": batch}) or {}
        media = payload.get("data", {}).get("Page", {}).get("media") or []
        for item in media:
            cache[str(item["id"])] = item.get("description")
        for value in batch:
            cache.setdefault(str(value), None)
        save_json(path, cache)
        time.sleep(0.8)
    filled = 0
    for row in missing:
        text = clean_text(cache.get(str(row["anilistId"])))
        if text:
            text = re.sub(r"\n*\(Source:[^)]*\)\s*$", "", text).strip()
            row["synopsis"] = text
            row["synopsisSource"] = "AniList"
            filled += 1
    print(f"Descrições do AniList para obras sem sinopse: {filled} de {len(missing)}", flush=True)
    return filled


def tvmaze_descriptions(rows: list[dict]) -> int:
    """Último fallback de texto-fonte: resumo inglês da série no TVMaze."""
    missing = [row for row in rows if not clean_text(row.get("synopsis"))]
    filled = 0
    if missing:
        print(f"Buscando no TVMaze sinopse para {len(missing)} obras ainda sem texto...", flush=True)
    for index, row in enumerate(missing, 1):
        show = tvmaze_show(row)
        synopsis = clean_text((show or {}).get("summary"))
        if synopsis:
            row["synopsis"] = synopsis
            row["synopsisSource"] = "TVMaze"
            filled += 1
        if index % 50 == 0:
            print(f"  sinopses TVMaze {index}/{len(missing)}", flush=True)
    print(f"Descrições do TVMaze: {filled} de {len(missing)}", flush=True)
    return filled


def build_work_translations(rows: list[dict], translator: Translator,
                            terms: dict[int, list[str]]) -> list[dict]:
    output = []
    candidates = [row for row in rows if clean_text(row.get("synopsis"))]
    print(f"Traduzindo sinopses de {len(candidates)} obras com texto-fonte em inglês...", flush=True)
    for index, row in enumerate(candidates, 1):
        english = clean_text(row["synopsis"])
        translations = {
            "en": {"synopsisFull": english, "synopsisShort": first_paragraph(english),
                   "source": (row.get("synopsisSource") + " (inglês)") if row.get("synopsisSource") else "Fonte original em inglês"}
        }
        names = terms.get(int(row["workId"]), [])
        if not row["hasPt"]:
            pt = translator.translate(english, "pt-BR", names)
            pt = fix_pt_br(pt)
            translations["pt-BR"] = {"synopsisFull": pt, "synopsisShort": first_paragraph(pt),
                                      "source": "Tradução automática local (OPUS-MT en→pt-BR)"}
        if not row["hasEs"]:
            es = translator.translate(english, "es", names)
            translations["es"] = {"synopsisFull": es, "synopsisShort": first_paragraph(es),
                                   "source": "Traducción automática local (Argos en→es)"}
        output.append({"workId": row["workId"], "translations": translations})
        if index % 50 == 0:
            print(f"  obras {index}/{len(candidates)}", flush=True)
    return output


def anilist_mal_mapping(rows: list[dict]) -> dict[int, int]:
    ids = sorted({int(row["anilistId"]) for row in rows
                  if row.get("anilistId") and int(row.get("seasonCount") or 0) == 1})
    path = CACHE / "anilist-mal-map.json"
    result = {int(key): int(value) for key, value in load_json(path, {}).items()}
    pending = [value for value in ids if value not in result]
    query = "query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id idMal}}}"
    for start in range(0, len(pending), 50):
        batch = pending[start:start + 50]
        payload = request_graphql(query, {"ids": batch}) or {}
        media = payload.get("data", {}).get("Page", {}).get("media") or []
        for item in media:
            if item.get("id") and item.get("idMal"):
                result[int(item["id"])] = int(item["idMal"])
        save_json(path, {str(key): value for key, value in result.items()})
        time.sleep(0.7)
    print(f"Mapeamento AniList→MAL: {len(result)} obras", flush=True)
    return result


def episode_mapping(rows: list[dict], anilist_to_mal: dict[int, int]) -> tuple[dict[int, list[dict]], list[dict]]:
    by_mal: dict[int, list[dict]] = {}
    unmapped = []
    for row in rows:
        match = MAL_RE.search(row.get("sourceUrl") or "")
        if match:
            mal_id = int(match.group(1))
            row["malEpisode"] = match.group(2)
        else:
            anilist_id = int(row["anilistId"]) if row.get("anilistId") else None
            mal_id = anilist_to_mal.get(anilist_id) if anilist_id else None
            # A correspondência em nível de obra só é inequívoca em obra com uma temporada.
            if not mal_id or int(row.get("seasonCount") or 0) != 1:
                unmapped.append(row)
                continue
            row["malEpisode"] = row.get("displayNumber")
        by_mal.setdefault(mal_id, []).append(row)
    return by_mal, unmapped


def jikan_list(mal_id: int) -> dict[int, dict]:
    """Todas as páginas da lista de episódios (100 por página)."""
    result: dict[int, dict] = {}
    page = 1
    while page <= 40:
        path = CACHE / "jikan" / (f"{mal_id}-list.json" if page == 1 else f"{mal_id}-list-p{page}.json")
        payload = load_json(path, None)
        if payload is None:
            payload = request_json(f"{JIKAN_EDGE}/anime/{mal_id}/episodes?page={page}")
            if payload is not None:
                save_json(path, payload)
            time.sleep(0.36)
        for item in (payload or {}).get("data", []):
            if item.get("number"):
                result[int(item["number"])] = item
        meta = ((payload or {}).get("meta") or {}).get("pagination") or (payload or {}).get("pagination") or {}
        if not (meta.get("hasNextPage") or meta.get("has_next_page")):
            break
        page += 1
    return result


def jikan_detail(mal_id: int, number: int) -> dict | None:
    path = CACHE / "jikan" / f"{mal_id}-{number}.json"
    payload = load_json(path, None)
    if payload is None:
        payload = request_json(f"{JIKAN_EDGE}/anime/{mal_id}/episodes/{number}")
        if payload is not None:
            save_json(path, payload)
        time.sleep(0.36)
    return payload


def integer_episode(value: str | None) -> int | None:
    try:
        number = float(value or "")
        return int(number) if number.is_integer() else None
    except ValueError:
        return None


def normalized(value: str | None) -> str:
    import unicodedata
    plain = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", plain.lower()).split())


def tvmaze_show(row: dict) -> dict | None:
    work_id = int(row["workId"])
    path = CACHE / "tvmaze" / f"{work_id}.json"
    cached = load_json(path, "missing")
    if cached != "missing":
        return cached or None
    titles = [part.strip() for part in (row.get("workTitles") or row.get("workTitle") or "").split("|")
              if part.strip()]
    accepted = {normalized(title) for title in titles}
    selected = None
    for query in titles[:4]:
        candidates = request_json(f"https://api.tvmaze.com/search/shows?q={quote_plus(query)}") or []
        exact = [item.get("show") or {} for item in candidates
                 if normalized((item.get("show") or {}).get("name")) in accepted]
        animated = [show for show in exact if show.get("type") == "Animation"
                    or show.get("language") == "Japanese"]
        if animated or exact:
            selected = (animated or exact)[0]
            break
        time.sleep(0.28)
    if selected:
        episodes = request_json(f"https://api.tvmaze.com/shows/{selected['id']}/episodes?specials=1") or []
        selected = {"id": selected["id"], "name": selected.get("name"),
                    "summary": selected.get("summary"), "episodes": episodes}
    save_json(path, selected)
    time.sleep(0.28)
    return selected


def enrich_tvmaze(rows: list[dict], records: list[dict]) -> dict:
    by_episode = {item["episodeId"]: item for item in records}
    by_work: dict[int, list[dict]] = {}
    for row in rows:
        by_work.setdefault(int(row["workId"]), []).append(row)
    shows = matched = images = synopses = 0
    print(f"Consultando TVMaze para {len(by_work)} obras (previews e sinopses reais)...", flush=True)
    for index, work_rows in enumerate(by_work.values(), 1):
        show = tvmaze_show(work_rows[0])
        if not show:
            continue
        shows += 1
        lookup = {(int(ep.get("season") or 0), int(ep.get("number") or 0)): ep
                  for ep in show.get("episodes", []) if ep.get("number") is not None}
        for row in work_rows:
            season = integer_episode(row.get("seasonNumber"))
            number = integer_episode(row.get("displayNumber"))
            meta = lookup.get((season or 1, number or -1))
            if not meta:
                continue
            matched += 1
            record = by_episode.setdefault(row["episodeId"], {
                "episodeId": row["episodeId"], "number": number, "translations": {},
            })
            english = record["translations"].setdefault("en", {
                "title": None, "synopsis": None, "source": "TVMaze",
            })
            title = clean_text(meta.get("name"))
            synopsis = clean_text(meta.get("summary"))
            if title and (not english.get("title") or english["title"].lower().startswith("episode ")):
                english["title"] = title
            if synopsis:
                english["synopsis"] = synopsis
                english["source"] = "TVMaze"
                synopses += 1
            image = (meta.get("image") or {}).get("original") or (meta.get("image") or {}).get("medium")
            if image:
                record["thumbnail"] = image
                record["thumbnailSource"] = "TVMaze"
                images += 1
            if meta.get("airdate"):
                record["originalAirDate"] = meta["airdate"]
        if index % 50 == 0:
            print(f"  TVMaze {index}/{len(by_work)}", flush=True)
    records[:] = list(by_episode.values())
    return {"tvmazeShowsMatched": shows, "tvmazeEpisodesMatched": matched,
            "tvmazeSynopsesFound": synopses, "tvmazePreviewsFound": images}


def localize_episode_records(records: list[dict], translator: Translator) -> None:
    names_of = {id(item): item.pop("_names", []) for item in records}
    candidates = [item for item in records if (item.get("translations") or {}).get("en")]
    names = [names_of[id(item)] for item in candidates]
    titles = [(item["translations"]["en"] or {}).get("title") for item in candidates]
    synopses = [(item["translations"]["en"] or {}).get("synopsis") for item in candidates]
    for language in ("pt-BR", "es"):
        print(f"Traduzindo {len(candidates)} episódios em lote para {language}...", flush=True)
        translated_titles = translator.translate_many(titles, language, names)
        translated_synopses = translator.translate_many(synopses, language, names)
        if language == "pt-BR":
            translated_titles = [fix_pt_br(x) for x in translated_titles]
            translated_synopses = [fix_pt_br(x) for x in translated_synopses]
        for item, title, synopsis in zip(candidates, translated_titles, translated_synopses):
            item["translations"][language] = {
                "title": title, "synopsis": synopsis,
                "source": ("Tradução automática local da fonte inglesa (OPUS-MT pt-BR)" if language == "pt-BR"
                           else "Tradução automática local da fonte inglesa (Argos)"),
            }


def build_episode_metadata(rows: list[dict], translator: Translator, details: bool,
                           terms: dict[int, list[str]]) -> tuple[list[dict], dict]:
    anilist_to_mal = anilist_mal_mapping(rows)
    by_mal, unmapped = episode_mapping(rows, anilist_to_mal)
    output: list[dict] = []
    found_titles = found_synopses = 0
    print(f"Consultando metadados de {len(by_mal)} obras mapeadas por ID MAL...", flush=True)
    for group_index, (mal_id, episodes) in enumerate(sorted(by_mal.items()), 1):
        listing = jikan_list(mal_id)
        for row in episodes:
            number = integer_episode(row.get("malEpisode"))
            meta = listing.get(number) if number is not None else None
            if not meta:
                continue
            title = clean_text(meta.get("title"))
            synopsis = None
            aired = meta.get("aired")
            if not title and not synopsis and not aired:
                continue
            translations = {}
            if title or synopsis:
                translations["en"] = {"title": title, "synopsis": synopsis,
                                      "source": "Jikan / MyAnimeList"}
            output.append({
                "episodeId": row["episodeId"], "malId": mal_id, "number": number,
                "originalAirDate": aired, "translations": translations,
            })
            found_titles += bool(title)
            found_synopses += bool(synopsis)
        if group_index % 20 == 0:
            print(f"  fontes MAL {group_index}/{len(by_mal)}", flush=True)
    tvmaze_stats = enrich_tvmaze(rows, output)
    if details:
        # Episódios vindos só do TVMaze não têm ID MAL; não há rota de detalhe para eles.
        missing_details = [item for item in output
                           if item.get("number") is not None and item.get("malId") is not None
                           and not clean_text(((item.get("translations") or {}).get("en") or {}).get("synopsis"))]
        print(f"Consultando detalhes Jikan para {len(missing_details)} episódios ainda sem sinopse...", flush=True)
        for index, item in enumerate(missing_details, 1):
            detail = jikan_detail(int(item["malId"]), int(item["number"])) or {}
            synopsis = clean_text(detail.get("synopsis") or (detail.get("data") or {}).get("synopsis"))
            if synopsis:
                english = item["translations"].setdefault("en", {
                    "title": None, "synopsis": None, "source": "Jikan / MyAnimeList",
                })
                english["synopsis"] = synopsis
                english["source"] = "Jikan / MyAnimeList"
                found_synopses += 1
            if index % 100 == 0:
                print(f"  detalhes {index}/{len(missing_details)}", flush=True)
    work_of = {row["episodeId"]: int(row["workId"]) for row in rows}
    for item in output:
        item["_names"] = terms.get(work_of.get(item["episodeId"]), [])
    localize_episode_records(output, translator)
    stats = {
        "mappedEpisodes": sum(len(value) for value in by_mal.values()),
        "unmappedEpisodes": len(unmapped),
        "jikanWorks": len(by_mal),
        "episodeTitlesFound": found_titles,
        "episodeSynopsesFound": found_synopses,
        **tvmaze_stats,
    }
    return output, stats


def coverage(works: list[dict], episodes: list[dict], episode_stats: dict) -> dict:
    with_synopsis = sum(bool(clean_text(row.get("synopsis"))) for row in works)
    return {
        "generatedAt": datetime.now(UTC).isoformat(),
        "works": {
            "total": len(works), "withEnglishSourceSynopsis": with_synopsis,
            "withoutAnyEnglishSourceSynopsis": len(works) - with_synopsis,
            "existingPtBrTranslations": sum(bool(row["hasPt"]) for row in works),
            "existingSpanishTranslations": sum(bool(row["hasEs"]) for row in works),
        },
        "episodes": {
            "total": len(episodes),
            "withThumbnail": sum(bool(row.get("thumbnail")) for row in episodes),
            "withoutThumbnail": sum(not bool(row.get("thumbnail")) for row in episodes),
            "withSourceSynopsis": sum(bool(clean_text(row.get("synopsis"))) for row in episodes),
            **episode_stats,
        },
        "policy": {
            "fabricatedText": False,
            "workCoverUsedAsEpisodePreview": False,
            "missingValuesRemainExplicitlyMissing": True,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--episode-details", action="store_true",
                        help="consulta a rota individual de cada episódio para obter sinopses")
    parser.add_argument("--skip-episodes", action="store_true")
    args = parser.parse_args()

    works = source_works()
    links = link_anilist(works)
    anilist_descriptions(works)
    tvmaze_descriptions(works)
    episodes = source_episodes()
    linked_ids = {int(link["workId"]): str(link["anilistId"]) for link in links}
    for episode in episodes:
        if not episode.get("anilistId") and int(episode["workId"]) in linked_ids:
            episode["anilistId"] = linked_ids[int(episode["workId"])]
    terms = protected_terms()
    translator = Translator()
    try:
        work_data = build_work_translations(works, translator, terms)
        episode_data, episode_stats = ([], {}) if args.skip_episodes else build_episode_metadata(
            episodes, translator, args.episode_details, terms
        )
    finally:
        translator.close()
    snapshot = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "anilistLinks": links,
        "works": work_data,
        "episodes": episode_data,
    }
    report = coverage(works, episodes, episode_stats)
    save_json(OUTPUT, snapshot)
    save_json(REPORT, report)
    print(f"Snapshot: {OUTPUT}")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
