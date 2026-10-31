"""Relatório de cobertura da migração FIB Anime: qual player cada obra usa.

Lê o seed gerado (o que de fato vai para o NekoFlow) e a auditoria (situação de cada
fonte) e grava docs/fibanime-cobertura.md.
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "backend" / "src" / "main" / "resources" / "seed" / "fibanime-catalog.json"
AUDIT = ROOT / "audit" / "fibanime" / "fontes.csv"
OUTPUT = ROOT / "docs" / "fibanime-cobertura.md"
BROKEN = {"FALLBACK_HTTP_404", "FALLBACK_HTTP_403", "EXTERNAL_ONLY", "FALLBACK_TIMEOUT", "FALLBACK_FETCH_ERROR"}


def main() -> None:
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    status = {}
    with AUDIT.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            status[str(row["source_id"])] = row["resolver_status"]

    per_work = []
    totals = Counter()
    for work in seed["works"]:
        c = Counter()
        players = Counter()
        for season in work["seasons"]:
            for ep in season["episodes"]:
                c["episodios"] += 1
                if not ep["sources"]:
                    c["sem_fonte"] += 1
                    continue
                labels = {s["label"].split(" · ")[0] for s in ep["sources"]}
                players.update(labels)
                if any(l.lower().startswith("fibplayer") for l in labels):
                    c["fibplayer"] += 1
                else:
                    c["outro_player"] += 1
                if any(status.get(str(s.get("sourceId"))) in BROKEN for s in ep["sources"]):
                    c["fonte_quebrada"] += 1
        totals.update(c)
        per_work.append((work["title"], c, players))

    lines = [
        "# Cobertura da migração FIB Anime",
        "",
        "Regra: um único player por episódio (por versão de áudio), na ordem FIBPlayer > Player ext 1 >",
        "Player ext 2 > … > demais > Alternativo; fontes que o auditor não abriu (404, 403, timeout,",
        "somente externa) só são usadas quando não existe outra.",
        "",
        f"- Obras: {len(per_work)}",
        f"- Episódios: {totals['episodios']}",
        f"- Com FIBPlayer: {totals['fibplayer']}",
        f"- Sem FIBPlayer (melhor player disponível): {totals['outro_player']}",
        f"- Sem nenhuma fonte cadastrada no FIB: {totals['sem_fonte']}",
        f"- Usando fonte que falhou na auditoria (única opção): {totals['fonte_quebrada']}",
        "",
        "## Obras sem FIBPlayer em algum episódio",
        "",
        "| Obra | Episódios | Com FIBPlayer | Outro player | Sem fonte | Fonte com falha | Players usados |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for title, c, players in sorted(per_work, key=lambda x: (-(x[1]["outro_player"] + x[1]["sem_fonte"]), x[0])):
        if c["outro_player"] == 0 and c["sem_fonte"] == 0:
            continue
        used = ", ".join(f"{k} ({v})" for k, v in players.most_common())
        lines.append(f"| {title} | {c['episodios']} | {c['fibplayer']} | {c['outro_player']} | {c['sem_fonte']} | "
                     f"{c['fonte_quebrada']} | {used} |")
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(dict(totals), "->", OUTPUT)
    print(sum(1 for _, c, _ in per_work if c["outro_player"] or c["sem_fonte"]), "obras com episódios sem FIBPlayer")
    print(sum(1 for _, c, _ in per_work if c["fibplayer"] == 0 and c["episodios"] > 0), "obras sem nenhum FIBPlayer")


if __name__ == "__main__":
    main()
