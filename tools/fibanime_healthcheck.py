"""Verifica, de verdade, se cada fonte coletada do FIB Anime ainda responde.

- HLS: o manifesto precisa começar com #EXTM3U;
- MP4: os primeiros bytes precisam vir com status 200/206 (links assinados vencidos dão 403);
- EMBED: a página do player precisa responder 2xx.

Grava audit/fibanime/saude.csv (source_id, ok, http_status, motivo, verificado_em), lido por
build_fibanime_seed.py para escolher sempre o melhor player que funciona hoje.
"""

from __future__ import annotations

import csv
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "audit" / "fibanime" / "fontes.csv"
OUTPUT = ROOT / "audit" / "fibanime" / "saude.csv"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"


def check(row: dict) -> dict:
    url = (row.get("resolved_url") or row.get("source_url") or "").strip()
    kind = (row.get("type") or "").upper()
    result = {"source_id": row["source_id"], "ok": "0", "http_status": "", "motivo": ""}
    if not url.startswith("https://"):
        result["motivo"] = "url-invalida"
        return result
    headers = {"User-Agent": UA, "Referer": "https://fibanime.cc/"}
    if kind == "MP4":
        headers["Range"] = "bytes=0-1023"
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.status
            body = resp.read(4096)
            result["http_status"] = str(status)
            if kind == "HLS":
                ok = body.lstrip(b"\xef\xbb\xbf").lstrip().startswith(b"#EXTM3U")
                result["motivo"] = "" if ok else "manifesto-invalido"
            elif kind == "MP4":
                ctype = resp.headers.get("Content-Type", "")
                ok = status in (200, 206) and not ctype.startswith("text/")
                result["motivo"] = "" if ok else f"conteudo-{ctype or 'desconhecido'}"
            else:
                ok = 200 <= status < 300
            result["ok"] = "1" if ok else "0"
    except urllib.error.HTTPError as e:
        result["http_status"] = str(e.code)
        result["motivo"] = f"http-{e.code}"
    except Exception as e:  # timeout, DNS, TLS
        result["motivo"] = type(e).__name__
    return result


def main() -> None:
    with SOURCES.open(encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if r.get("active") == "1"]
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    results = []
    with ThreadPoolExecutor(max_workers=int(sys.argv[1]) if len(sys.argv) > 1 else 24) as pool:
        for i, res in enumerate(pool.map(check, rows), 1):
            res["verificado_em"] = stamp
            results.append(res)
            if i % 500 == 0:
                print(f"{i}/{len(rows)}", flush=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["source_id", "ok", "http_status", "motivo", "verificado_em"])
        w.writeheader()
        w.writerows(results)
    bad = [r for r in results if r["ok"] != "1"]
    print(f"{len(results)} fontes verificadas, {len(bad)} sem resposta válida -> {OUTPUT}")


if __name__ == "__main__":
    main()
