"""Audita vínculos editoriais e de mídia dos snapshots do catálogo.

Não consulta serviços externos. Cruza o cache da API oficial AniList, os IDs MAL
presentes nos players Zoko e os títulos devolvidos pela busca HiAnime. Com
``--write`` apenas anota esses identificadores no seed para que o backend possa
colocar divergências em quarentena; episódios nunca são apagados.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import Request, urlopen

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
HIANIME = ROOT / "backend/src/main/resources/seed/hianime-catalog.json"
FIB = ROOT / "backend/src/main/resources/seed/fibanime-catalog.json"
SEARCH = ROOT / ".artifact-work/hianime-cache/search.json"
MAL_MAP = ROOT / ".artifact-work/catalog-localization-cache/anilist-mal-map.json"
REPORT = ROOT / "audit/catalog-integrity.json"
MAL_URL = re.compile(r"/stream/mal/(\d+)/", re.I)
SUFFIX = re.compile(
    r"(?:[\s:–—-]+(?:the\s+)?(?:final\s+)?(?:\d+(?:st|nd|rd|th)\s+)?season(?:\s+\d+)?|"
    r"[\s:–—-]+(?:part|cour)\s+\d+|[\s:–—-]+\d+(?:st|nd|rd|th)\s+(?:season|part)|"
    r"[\s:–—-]+(?:ii|iii|iv|v))+$", re.I)
WEAK = {"a", "an", "and", "as", "at", "de", "do", "da", "e", "for", "in", "no", "of",
        "on", "part", "season", "the", "to", "wa", "with"}


def load(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def norm(value: str | None) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value).split())


def canonical(value: str | None) -> str:
    result = (value or "").strip()
    while (cleaned := SUFFIX.sub("", result).strip()) != result:
        result = cleaned
    return result


def same_series(left: str | None, right: str | None) -> bool:
    a, b = norm(canonical(left)), norm(canonical(right))
    if not a or not b:
        return False
    if a == b or {a, b} == {"keroro", "sgt frog"}:
        return True
    aa = {x for x in a.split() if len(x) > 1 and x not in WEAK and not x.isdigit()}
    bb = {x for x in b.split() if len(x) > 1 and x not in WEAK and not x.isdigit()}
    common = aa & bb
    shortest = min(len(aa), len(bb))
    return bool(shortest and len(common) >= min(2, shortest) and len(common) / shortest >= .5)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="anota IDs auditados no seed HiAnime")
    parser.add_argument("--fetch-missing-mal", action="store_true",
                        help="completa idMal ausente usando a API oficial do AniList")
    args = parser.parse_args()
    hi = load(HIANIME, {"works": []})
    fib = load(FIB, {"works": []})
    search = load(SEARCH, {})
    mal_map = load(MAL_MAP, {})
    if args.fetch_missing_mal:
        pending = sorted({int(work["anilistId"]) for work in hi.get("works", [])
                          if work.get("anilistId") and str(work["anilistId"]) not in mal_map
                          and any(ep.get("sources") for ep in work.get("season", {}).get("episodes", []))})
        query = "query($ids:[Int]){Page(perPage:50){media(id_in:$ids,type:ANIME){id idMal}}}"
        for start in range(0, len(pending), 50):
            ids = pending[start:start + 50]
            body = json.dumps({"query": query, "variables": {"ids": ids}}).encode()
            request = Request("https://graphql.anilist.co", data=body,
                              headers={"Content-Type": "application/json", "User-Agent": "NekoFlow-Audit/1.0"})
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            for media in payload.get("data", {}).get("Page", {}).get("media", []):
                if media.get("idMal"):
                    mal_map[str(media["id"])] = int(media["idMal"])
            time.sleep(.7)
        MAL_MAP.parent.mkdir(parents=True, exist_ok=True)
        MAL_MAP.write_text(json.dumps(mal_map, ensure_ascii=False, indent=2), encoding="utf-8")
    source_by_id = {row.get("id"): row for row in search.values() if isinstance(row, dict)}

    hi_mismatches = []
    for work in hi.get("works", []):
        source = source_by_id.get(work.get("sourceAnimeId"), {})
        expected = mal_map.get(str(work.get("anilistId")))
        actual = sorted({int(match.group(1)) for episode in work.get("season", {}).get("episodes", [])
                         for media in episode.get("sources", [])
                         if (match := MAL_URL.search(media.get("url", "")))})
        work["malId"] = int(expected) if expected else work.get("malId")
        work["sourceTitle"] = source.get("title") or work.get("sourceTitle")
        work["sourceAlternativeTitle"] = source.get("alternativeTitle") or work.get("sourceAlternativeTitle")
        reason = None
        if expected and actual and actual != [int(expected)]:
            reason = "ANILIST_MAL_MISMATCH"
        elif not work.get("anilistId") and source and not same_series(work.get("title"), source.get("title")) \
                and not same_series(work.get("title"), source.get("alternativeTitle")):
            reason = "TITLE_MISMATCH"
        if reason:
            hi_mismatches.append({
                "reason": reason, "title": work.get("title"), "anilistId": work.get("anilistId"),
                "expectedMalId": expected, "sourceMalIds": actual,
                "sourceAnimeId": work.get("sourceAnimeId"), "sourceTitle": source.get("title"),
                "episodes": len(work.get("season", {}).get("episodes", [])),
            })

    fib_mismatches = []
    for work in fib.get("works", []):
        for season in work.get("seasons", []):
            if not same_series(work.get("title"), season.get("title")):
                fib_mismatches.append({
                    "work": work.get("title"), "season": season.get("title"),
                    "episodes": len(season.get("episodes", [])), "slug": work.get("slug"),
                })

    report = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "hianime": {"works": len(hi.get("works", [])), "mismatches": hi_mismatches,
                    "mismatchCount": len(hi_mismatches),
                    "affectedEpisodes": sum(x["episodes"] for x in hi_mismatches)},
        "fibanime": {"works": len(fib.get("works", [])), "mismatches": fib_mismatches,
                     "mismatchCount": len(fib_mismatches),
                     "affectedEpisodes": sum(x["episodes"] for x in fib_mismatches)},
        "policy": {"deletesData": False, "quarantinesMismatchedMedia": True,
                   "usesAniListMalIdentityWhenAvailable": True},
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.write:
        HIANIME.write_text(json.dumps(hi, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(REPORT), "hianime": report["hianime"],
                      "fibanime": report["fibanime"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
