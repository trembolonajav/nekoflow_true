"""Gera o seed editorial e de mídia do NekoFlow a partir da auditoria FIB Anime.

O FIB Anime e o NekoFlow pertencem à mesma operação. Por isso, além do catálogo,
o seed preserva as fontes ativas auditadas (HLS, MP4 e EMBED) para reprodução no
player novo. A página antiga continua somente como proveniência.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "audit" / "fibanime" / "catalogo.json"
OUTPUT = ROOT / "backend" / "src" / "main" / "resources" / "seed" / "fibanime-catalog.json"


def first_cover(anime: dict) -> str | None:
    for episode in anime.get("episodes", []):
        thumbnail = (episode.get("meta") or {}).get("thumbnail")
        if thumbnail:
            return thumbnail
    return None


HEALTH = ROOT / "audit" / "fibanime" / "saude.csv"


def load_health() -> dict[str, bool]:
    """Resultado do teste ao vivo (tools/fibanime_healthcheck.py), se existir. Só respostas
    definitivas (400/403/404/410, manifesto inválido) contam como fora do ar; timeout e erro
    de rede podem ser bloqueio por excesso de requisições e não descartam a fonte."""
    if not HEALTH.exists():
        return {}
    import csv

    definitive = {"400", "403", "404", "410"}
    with HEALTH.open(encoding="utf-8") as f:
        return {
            row["source_id"]: not (row["ok"] != "1" and (row["http_status"] in definitive
                                                          or row["motivo"] == "manifesto-invalido"))
            for row in csv.DictReader(f)
        }


HEALTHY = load_health()


def signed_url_expired(url: str) -> bool:
    """Links assinados (S3 / expires=) vencidos nunca tocam: são tratados como quebrados."""
    import re
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    m1 = re.search(r"X-Amz-Date=(\d{8}T\d{6}Z)", url)
    m2 = re.search(r"X-Amz-Expires=(\d+)", url)
    if m1 and m2:
        start = datetime.strptime(m1.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return start + timedelta(seconds=int(m2.group(1))) < now
    m3 = re.search(r"[?&](?:expires|exp)=(\d{9,11})", url)
    return bool(m3) and int(m3.group(1)) < now.timestamp()


BROKEN = {"FALLBACK_HTTP_404", "FALLBACK_HTTP_403", "EXTERNAL_ONLY", "FALLBACK_TIMEOUT", "FALLBACK_FETCH_ERROR"}
TYPE_ORDER = {"HLS": 0, "MP4": 1, "EMBED": 2}


def is_signed(source: dict) -> bool:
    """Link com assinatura que expira (S3 X-Amz-*, expires=)."""
    import re

    url = str(source.get("resolved_url") or source.get("source_url") or "")
    return "X-Amz-Signature=" in url or bool(re.search(r"[?&](?:expires|exp)=\d{9,11}", url))


def is_dead(source: dict) -> bool:
    """Comprovadamente fora do ar hoje: reprovada no teste ao vivo ou link assinado vencido.
    Nunca vira o player do episódio; sem alternativa, o episódio fica indisponível."""
    url = str(source.get("resolved_url") or source.get("source_url") or "")
    return signed_url_expired(url) or HEALTHY.get(str(source.get("source_id")), True) is False


def player_rank(source: dict) -> tuple:
    """Quanto menor, melhor: FIBPlayer > Player ext 1 > Player ext 2... > demais > Alternativo.
    Fontes que o auditor não conseguiu abrir (404, 403, timeout, só externa) vão para o fim."""
    label = str(source.get("label") or "").strip().lower()
    if label.startswith("fibplayer"):
        rank = 0 if label == "fibplayer" else 1
    elif label.startswith("player ext ") and label[11:].strip().isdigit():
        rank = 10 + int(label[11:].strip())
    elif label.startswith("player extern"):
        rank = 40
    elif label.startswith("alternativo"):
        rank = 90
    else:
        rank = 50
    url = str(source.get("resolved_url") or source.get("source_url") or "")
    broken = 1 if (
        str(source.get("resolver_status") or "") in BROKEN
        or signed_url_expired(url)
        or HEALTHY.get(str(source.get("source_id")), True) is False
    ) else 0
    return (broken, rank, TYPE_ORDER.get(str(source.get("type") or "").upper(), 9),
            int(source.get("source_number") or 999))


def selected_sources(episode: dict) -> list[dict]:
    """Um único player por episódio: o melhor disponível para cada áudio (legendado,
    dublado, dual). Nunca dois players para a mesma versão do episódio."""
    all_active = [s for s in episode.get("sources", []) if s.get("active")]
    active = [s for s in all_active if not is_dead(s)]
    if any(is_signed(s) for s in all_active):
        # Episódio com link assinado (vence e precisa ser regerado na origem): entram todos os
        # players que ainda respondem, em ordem, para o usuário trocar se um deles falhar.
        seen, ordered = set(), []
        for source in sorted(active, key=player_rank):
            url = str(source.get("resolved_url") or source.get("source_url") or "")
            if url not in seen:
                seen.add(url)
                ordered.append(source)
        return ordered
    best: dict[str, dict] = {}
    for source in sorted(active, key=player_rank):
        audio = str(source.get("audio_type") or "").upper() or "PADRAO"
        best.setdefault(audio, source)
    order = {"LEGENDADA": 0, "DUAL": 1, "DUBLADA": 2}
    return sorted(best.values(), key=lambda s: order.get(str(s.get("audio_type") or "").upper(), 3))


def media_sources(episode: dict) -> list[dict]:
    result = []
    for source in selected_sources(episode):
        source_type = str(source.get("type") or "").upper()
        effective_url = str(source.get("resolved_url") or source.get("source_url") or "").strip()
        if not source.get("active") or source_type not in {"HLS", "MP4", "EMBED"}:
            continue
        parsed = urlparse(effective_url)
        if parsed.scheme != "https" or not parsed.hostname:
            continue
        audio_type = str(source.get("audio_type") or "").strip()
        base_label = str(source.get("label") or "FIBPlayer").strip()
        label = f"{base_label} · {audio_type.title()}" if audio_type else base_label
        result.append(
            {
                "type": source_type,
                "url": effective_url,
                "host": parsed.hostname.lower(),
                "label": label,
                "priority": 10 + len(result),
                "audioLanguage": source.get("audio_language_code"),
                "subtitleLanguage": source.get("subtitle_language_code"),
                "embedAllowed": source_type == "EMBED",
                "reportsProgress": source_type in {"HLS", "MP4"},
                "sourceId": source.get("source_id"),
            }
        )
    return result


def build_work(anime: dict) -> dict:
    episodes_by_season: dict[int, list[dict]] = {}
    for episode in anime.get("episodes", []):
        meta = episode.get("meta") or {}
        season_number = int(episode.get("season") or 0)
        episodes_by_season.setdefault(season_number, []).append(
            {
                "number": int(episode.get("episode") or 0),
                "code": episode.get("code") or meta.get("episodeCode") or "",
                "title": meta.get("episodeTitle") or episode.get("code") or "",
                "thumbnail": meta.get("thumbnail"),
                "durationSeconds": meta.get("durationSeconds"),
                "sourcePageUrl": episode.get("url"),
                "sourceStatus": episode.get("status") or "unavailable",
                "sources": media_sources(episode),
                # Link assinado no episódio: todos os players vivos entram (não só o melhor).
                "signedFallback": any(is_signed(s) for s in episode.get("sources", []) if s.get("active")),
            }
        )

    seasons = []
    known = {int(s.get("season") or 0): s for s in anime.get("seasons", [])}
    for number in sorted(set(known) | set(episodes_by_season)):
        declared = known.get(number, {})
        episodes = sorted(episodes_by_season.get(number, []), key=lambda item: item["number"])
        seasons.append(
            {
                "number": number,
                "title": declared.get("title") or f"Temporada {number}",
                "expectedEpisodes": declared.get("expected_episodes"),
                "episodes": episodes,
            }
        )

    return {
        "order": int(anime["order"]),
        "title": anime["title"],
        "slug": anime["slug"],
        "sourceUrl": anime["url"],
        "sourceStatus": anime.get("status") or "unavailable",
        "cover": first_cover(anime),
        "episodeCount": sum(len(season["episodes"]) for season in seasons),
        "seasons": seasons,
    }


def main() -> None:
    source = json.loads(INPUT.read_text(encoding="utf-8"))
    works = [build_work(anime) for anime in source["animes"]]
    allowed_hosts = sorted(
        {
            media["host"]
            for work in works
            for season in work["seasons"]
            for episode in season["episodes"]
            for media in episode["sources"]
        }
    )
    source_count = sum(
        len(episode["sources"])
        for work in works
        for season in work["seasons"]
        for episode in season["episodes"]
    )
    payload = {
        "source": "FIB Anime",
        "sourceSite": source.get("site"),
        "auditedAt": source.get("updated_at"),
        "policy": "authorized first-party transfer; one best player per episode audio (FIBPlayer > Player ext 1 > ...); all live players when the episode has an expiring signed link",
        "allowedHosts": allowed_hosts,
        "sourceCount": source_count,
        "works": works,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"{len(works)} obras, "
        f"{sum(len(work['seasons']) for work in works)} temporadas, "
        f"{sum(work['episodeCount'] for work in works)} episodios, "
        f"{source_count} fontes -> {OUTPUT}"
    )


if __name__ == "__main__":
    main()
