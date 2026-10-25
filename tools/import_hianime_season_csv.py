"""Importa um CSV sazonal, metadados AniList e episódios/players do HiAnime.

O projeto ryanwtf7/hianime-api é usado para busca. A listagem de episódios e
servidores usa as rotas atuais do site porque o endpoint v2 de episódios ainda
depende do token antigo. O script nunca escolhe um resultado apenas pela posição:
todo casamento passa por comparação normalizada dos títulos.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "backend/src/main/resources/seed/hianime-catalog.json"
ANILIST = "https://graphql.anilist.co"
USER_AGENT = "NekoFlow-Catalog-Importer/1.0"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def normalized(value: str | None) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    value = value.lower().replace("&", " and ")
    value = re.sub(r"\b(1st|first)\b", "1", value)
    value = re.sub(r"\b(2nd|second)\b", "2", value)
    value = re.sub(r"\b(3rd|third)\b", "3", value)
    value = re.sub(r"\b(4th|fourth)\b", "4", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def title_score(left: str, right: str) -> float:
    a, b = normalized(left), normalized(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    seq = SequenceMatcher(None, a, b).ratio()
    sa, sb = set(a.split()), set(b.split())
    token = len(sa & sb) / max(len(sa), len(sb), 1)
    contain = min(len(a), len(b)) / max(len(a), len(b)) if a in b or b in a else 0.0
    return max(seq, token, contain)


def request_json(url: str, *, data: dict | None = None, referer: str | None = None,
                 attempts: int = 5, timeout: int = 25) -> dict:
    body = None if data is None else json.dumps(data).encode()
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if referer:
        headers["Referer"] = referer
        headers["X-Requested-With"] = "XMLHttpRequest"
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            with urlopen(Request(url, data=body, headers=headers), timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8", "replace"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            if attempt + 1 < attempts:
                if isinstance(exc, HTTPError) and exc.code == 429:
                    retry = exc.headers.get("Retry-After") if exc.headers else None
                    time.sleep(max(int(retry or 0), 35 * (attempt + 1)))
                else:
                    time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"falha em {url}: {last}")


ANILIST_QUERY = """
query($page:Int!){Page(page:$page,perPage:50){pageInfo{hasNextPage}
media(seasonYear:2026,type:ANIME,sort:[START_DATE,POPULARITY_DESC]){
id idMal status format episodes duration season seasonYear description bannerImage
title{romaji english native} synonyms coverImage{extraLarge large}
startDate{year month day} genres averageScore isAdult countryOfOrigin}}}
"""


def anilist_2026() -> list[dict]:
    result: list[dict] = []
    page = 1
    while True:
        payload = request_json(ANILIST, data={"query": ANILIST_QUERY, "variables": {"page": page}})
        block = payload.get("data", {}).get("Page", {})
        result.extend(block.get("media") or [])
        if not block.get("pageInfo", {}).get("hasNextPage"):
            return result
        page += 1
        time.sleep(0.45)


def media_titles(media: dict) -> list[str]:
    title = media.get("title") or {}
    return [x for x in [title.get("english"), title.get("romaji"), title.get("native"),
                        *(media.get("synonyms") or [])] if x]


def best_media(title: str, media: list[dict]) -> tuple[dict | None, float]:
    best, score = None, 0.0
    for candidate in media:
        current = max((title_score(title, x) for x in media_titles(candidate)), default=0.0)
        if current > score:
            best, score = candidate, current
    return (best, score) if score >= 0.68 else (None, score)


def search_hianime(api_base: str, title: str) -> tuple[dict | None, float]:
    data = request_json(f"{api_base.rstrip('/')}/api/v2/search?{urlencode({'keyword': title, 'page': 1})}")
    rows = data.get("data", {}).get("response") or []
    best, score = None, 0.0
    for candidate in rows:
        current = max(title_score(title, candidate.get("title", "")),
                      title_score(title, candidate.get("alternativeTitle", "")))
        if current > score:
            best, score = candidate, current
    # A busca é ruidosa. Abaixo desse limiar é melhor deixar sem mídia que anexar outro anime.
    return (best, score) if score >= 0.72 else (None, score)


EPISODE_RE = re.compile(
    r'<a[^>]*class="[^"]*ep-item[^"]*"[^>]*data-number="([^"]+)"[^>]*data-id="([^"]+)"'
    r'[^>]*href="([^"]+)"[^>]*>.*?<div class="ep-name[^"]*"[^>]*data-jname="([^"]*)"'
    r'[^>]*title="([^"]*)"', re.S | re.I)
SERVER_RE = re.compile(
    r'<div class="item server-item"\s+data-type="([^"]+)"\s+data-server-name="([^"]+)"'
    r'\s+data-hash="([^"]+)"', re.S | re.I)


def numeric_anime_id(source_id: str) -> str:
    match = re.search(r"-(\d+)$", source_id)
    if not match:
        raise ValueError(f"ID HiAnime inválido: {source_id}")
    return match.group(1)


def list_episodes(origin: str, anime: dict) -> list[dict]:
    anime_id = anime["id"]
    page = f"{origin.rstrip('/')}/{anime_id}"
    data = request_json(f"{origin.rstrip('/')}/api/theme/episode/list/{numeric_anime_id(anime_id)}",
                        referer=page)
    found = []
    for number, episode_id, href, japanese, title in EPISODE_RE.findall(data.get("html", "")):
        try:
            sort = float(number)
            display = str(int(sort)) if sort.is_integer() else str(sort)
        except ValueError:
            continue
        found.append({
            "number": display,
            "sort": sort,
            "title": html.unescape(title).strip() or f"Episode {display}",
            "alternativeTitle": html.unescape(japanese).strip() or None,
            "sourceEpisodeId": episode_id,
            "sourcePageUrl": html.unescape(href),
        })
    return found


def decode_hash(value: str) -> str | None:
    try:
        return base64.b64decode(value + "=" * (-len(value) % 4)).decode().strip()
    except Exception:
        return None


def episode_sources(origin: str, episode: dict) -> list[dict]:
    url = f"{origin.rstrip('/')}/api/theme/episode/servers?episodeId={quote(episode['sourceEpisodeId'])}"
    data = request_json(url, referer=episode["sourcePageUrl"])
    sources, seen = [], set()
    for index, (kind, name, encoded) in enumerate(SERVER_RE.findall(data.get("html", "")), 1):
        target = decode_hash(encoded)
        parsed = urlparse(target or "")
        if not target or parsed.scheme != "https" or not parsed.hostname or target in seen:
            continue
        seen.add(target)
        kind = kind.lower()
        dubbed = kind in {"dub", "dubbed"}
        hard_sub = kind in {"hsub", "hard-sub", "hard_sub"}
        sources.append({
            "type": "EMBED",
            "url": target,
            "host": parsed.hostname.lower(),
            "label": f"{html.unescape(name).strip()} · " + ("Dublado (EN)" if dubbed else "Legendado (EN)"),
            "priority": (100 if dubbed else 10) + index,
            "audioLanguage": "en" if dubbed else "ja",
            "subtitleLanguage": None if dubbed else "en",
            "hardSub": hard_sub,
            "reportsProgress": False,
            "embedAllowed": True,
        })
    return sources


def derive_zoko_sources(template_episode: dict, target_episode: dict) -> list[dict]:
    """O ZokoAnime expõe /stream/mal/{mal}/{episodio}/{sub|dub}.

    A consulta do primeiro episódio fornece o ID MAL e os tipos realmente disponíveis;
    somente esse padrão explícito é extrapolado. Outros hosts continuam sem suposição.
    """
    result = []
    for source in template_episode.get("sources", []):
        match = re.search(r"(/stream/mal/\d+/)([^/]+)(/(?:sub|dub)(?:[/?]|$))", source["url"])
        if not match:
            continue
        clone = dict(source)
        clone["url"] = source["url"][:match.start(2)] + str(target_episode["number"]) + source["url"][match.end(2):]
        result.append(clone)
    return result


def load_cache(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_cache(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def clean_description(value: str | None) -> str | None:
    if not value:
        return None
    value = re.sub(r"(?i)<br\s*/?>|</p>", "\n", value)
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip() or None


def slug(value: str) -> str:
    return normalized(value).replace(" ", "-")[:180].strip("-")


def local_id(row: dict) -> int:
    digest = int.from_bytes(hashlib.sha256(f"{row['season']}:{row['position']}:{row['title']}".encode()).digest()[:4], "big")
    return 930_000_000 + digest % 60_000_000


def work_payload(row: dict, media: dict | None, anime: dict | None, episodes: list[dict]) -> dict:
    titles = (media or {}).get("title") or {}
    canonical = titles.get("romaji") or (anime or {}).get("alternativeTitle") or row["title"]
    english = titles.get("english") or (anime or {}).get("title") or row["title"]
    cover = ((media or {}).get("coverImage") or {}).get("extraLarge") or (anime or {}).get("poster")
    date = (media or {}).get("startDate") or {}
    return {
        "anilistId": (media or {}).get("id"),
        "malId": (media or {}).get("idMal"),
        "localId": None if media else local_id(row),
        "sourceAnimeId": (anime or {}).get("id"),
        "sourceTitle": (anime or {}).get("title"),
        "sourceAlternativeTitle": (anime or {}).get("alternativeTitle"),
        "sourceCsvTitle": row["title"],
        "title": canonical,
        "englishTitle": english,
        "nativeTitle": titles.get("native"),
        "synonyms": (media or {}).get("synonyms") or [],
        "slug": f"{slug(canonical)}-{(media or {}).get('id') or local_id(row)}",
        "poster": cover,
        "banner": (media or {}).get("bannerImage"),
        "synopsis": clean_description((media or {}).get("description")),
        "year": 2026,
        "startDate": date,
        "catalogSeason": row["season"],
        "catalogSeasonPt": row["season_pt"],
        "catalogPosition": int(row["position"]),
        "format": (media or {}).get("format") or row.get("format") or "TV",
        "status": (media or {}).get("status") or "UNKNOWN",
        "rating": (media or {}).get("averageScore"),
        "durationSeconds": ((media or {}).get("duration") or 24) * 60,
        "plannedEpisodes": (media or {}).get("episodes"),
        "genres": (media or {}).get("genres") or [],
        "referenceUrl": row.get("reference_url"),
        "season": {"number": 1, "title": canonical, "episodes": episodes},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv")
    parser.add_argument("--api-base", default="http://localhost:5000")
    parser.add_argument("--origin", default="https://hianime.at")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--search-workers", type=int,
                        help="concorrência apenas da API de busca local")
    parser.add_argument("--max-episodes", type=int, default=40)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--cache-dir", default=str(ROOT / ".artifact-work/hianime-cache"))
    parser.add_argument("--cooldown", type=int, default=75,
                        help="pausa entre busca, episódios e servidores para evitar HTTP 429")
    args = parser.parse_args()
    search_workers = args.search_workers or args.workers

    with open(args.csv, encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    # A planilha pode repetir uma obra quando a previsão de estreia mudou de temporada.
    # Catálogo é por obra: conserva a primeira ocorrência e nunca gera duplicata.
    unique_rows: dict[str, dict] = {}
    for row in rows:
        unique_rows.setdefault(normalized(row["title"]), row)
    rows = list(unique_rows.values())
    if args.limit:
        rows = rows[:args.limit]
    print(f"CSV: {len(rows)} títulos; carregando índice AniList 2026...", flush=True)
    media = anilist_2026()
    matched_media = {}
    for index, row in enumerate(rows):
        matched_media[index] = best_media(row["title"], media)[0]
    print(f"AniList: {sum(x is not None for x in matched_media.values())}/{len(rows)} associados; buscando HiAnime...", flush=True)

    cache_dir = Path(args.cache_dir)
    search_cache = load_cache(cache_dir / "search.json")
    matched_anime: dict[int, dict | None] = {}
    for i, row in enumerate(rows):
        if normalized(row["title"]) in search_cache:
            matched_anime[i] = search_cache[normalized(row["title"])]
    pending_search = [(i, row) for i, row in enumerate(rows) if i not in matched_anime]
    with ThreadPoolExecutor(max_workers=max(1, search_workers)) as pool:
        futures = {pool.submit(search_hianime, args.api_base, row["title"]): i for i, row in pending_search}
        for done, future in enumerate(as_completed(futures), 1):
            i = futures[future]
            try:
                matched_anime[i] = future.result()[0]
            except Exception as exc:
                matched_anime[i] = None
                print(f"busca falhou: {rows[i]['title']}: {exc}", flush=True)
            search_cache[normalized(rows[i]["title"])] = matched_anime[i]
            if done % 25 == 0:
                save_cache(cache_dir / "search.json", search_cache)
            if done % 25 == 0 or done == len(futures):
                print(f"  buscas {done}/{len(futures)} · {sum(x is not None for x in matched_anime.values())} encontrados", flush=True)
    save_cache(cache_dir / "search.json", search_cache)

    episode_lists: dict[int, list[dict]] = {}
    matched_indices = [i for i, anime in matched_anime.items() if anime]
    print(f"HiAnime: {len(matched_indices)}/{len(rows)} associados; listando episódios...", flush=True)
    if pending_search and args.cooldown:
        print(f"  aguardando {args.cooldown}s para respeitar a janela de requisições...", flush=True)
        time.sleep(args.cooldown)
    episode_cache = load_cache(cache_dir / "episodes.json")
    for i in matched_indices:
        source_id = matched_anime[i]["id"]
        if source_id in episode_cache:
            episode_lists[i] = episode_cache[source_id][:args.max_episodes]
    pending_lists = [i for i in matched_indices if i not in episode_lists]
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(list_episodes, args.origin, matched_anime[i]): i for i in pending_lists}
        for done, future in enumerate(as_completed(futures), 1):
            i = futures[future]
            try:
                episode_lists[i] = future.result()[:args.max_episodes]
            except Exception as exc:
                episode_lists[i] = []
                print(f"episódios falharam: {rows[i]['title']}: {exc}", flush=True)
            episode_cache[matched_anime[i]["id"]] = episode_lists[i]
            if done % 25 == 0:
                save_cache(cache_dir / "episodes.json", episode_cache)
            if done % 25 == 0 or done == len(futures):
                print(f"  listas {done}/{len(futures)} · {sum(len(x) for x in episode_lists.values())} episódios", flush=True)
    save_cache(cache_dir / "episodes.json", episode_cache)

    # Uma consulta por obra basta para o padrão estável do ZokoAnime. Isso reduz milhares
    # de requisições a poucas centenas e evita acionar a proteção 429 da origem.
    template_jobs = [(i, episodes[0]) for i, episodes in episode_lists.items() if episodes]
    print(f"Coletando servidores-base de {len(template_jobs)} obras...", flush=True)
    if pending_lists and args.cooldown:
        print(f"  aguardando {args.cooldown}s para respeitar a janela de requisições...", flush=True)
        time.sleep(args.cooldown)
    source_cache = load_cache(cache_dir / "sources.json")
    pending_sources = [(i, ep) for i, ep in template_jobs if ep["sourceEpisodeId"] not in source_cache]
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(episode_sources, args.origin, episode): (i, episode)
                   for i, episode in pending_sources}
        for done, future in enumerate(as_completed(futures), 1):
            _i, episode = futures[future]
            try:
                source_cache[episode["sourceEpisodeId"]] = future.result()
            except Exception as exc:
                source_cache[episode["sourceEpisodeId"]] = []
                print(f"servidores falharam ep {episode['sourceEpisodeId']}: {exc}", flush=True)
            if done % 25 == 0:
                save_cache(cache_dir / "sources.json", source_cache)
            if done % 25 == 0 or done == len(futures):
                print(f"  servidores-base {done}/{len(futures)}", flush=True)
    save_cache(cache_dir / "sources.json", source_cache)
    for _i, episodes in episode_lists.items():
        if not episodes:
            continue
        template = episodes[0]
        template["sources"] = source_cache.get(template["sourceEpisodeId"], [])
        for episode in episodes[1:]:
            episode["sources"] = derive_zoko_sources(template, episode)

    # O player Zoko expõe o ID MAL na própria URL. Quando ele difere do idMal da
    # ficha AniList, a busca textual encontrou outra temporada/obra. Mantemos os
    # metadados editoriais, mas não publicamos episódios ou players incorretos.
    rejected_media = 0
    for i, episodes in list(episode_lists.items()):
        expected_mal = (matched_media.get(i) or {}).get("idMal")
        source_mal = {
            int(match.group(1))
            for episode in episodes
            for source in episode.get("sources", [])
            if (match := re.search(r"/stream/mal/(\d+)/", source.get("url", ""), re.I))
        }
        if expected_mal and source_mal and source_mal != {int(expected_mal)}:
            print(f"  mídia rejeitada: {rows[i]['title']} · AniList/MAL {expected_mal} != fonte {sorted(source_mal)}",
                  flush=True)
            episode_lists[i] = []
            rejected_media += 1
    if rejected_media:
        print(f"HiAnime: {rejected_media} associações de mídia incorretas rejeitadas por ID MAL", flush=True)

    works = [work_payload(row, matched_media.get(i), matched_anime.get(i), episode_lists.get(i, []))
             for i, row in enumerate(rows)]
    hosts = sorted({source["host"] for work in works for episode in work["season"]["episodes"]
                    for source in episode.get("sources", [])})
    payload = {
        "provider": {
            "code": "HIANIME_API_EMBED",
            "name": "HiAnime API · player externo",
            "allowedHosts": hosts,
            "testedAt": time.strftime("%Y-%m-%d"),
            "policy": "Players externos retornados por rotas públicas do HiAnime/API não oficial; sem telemetria e sem hospedagem pelo NekoFlow.",
        },
        "sourceCsv": str(Path(args.csv).name),
        "works": works,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    episodes = sum(len(work["season"]["episodes"]) for work in works)
    sources = sum(len(ep.get("sources", [])) for work in works for ep in work["season"]["episodes"])
    print(f"concluído: {len(works)} obras, {episodes} episódios, {sources} fontes -> {output}", flush=True)


if __name__ == "__main__":
    main()
