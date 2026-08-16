#!/usr/bin/env python3
"""Zapisuje notatkę dzienną z Porannego skrótu — deterministycznie, jednym wywołaniem.

Cron Bernarda gubił fazę zapisu, gdy musiał sam edytować pliki. Tu wystarczy jedno
`exec`, a skrypt sam dba o datę, godzinę, podpis i miejsce zapisu.
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import subprocess
import sys
from zoneinfo import ZoneInfo

TEAM = Path("/path/to/YOUR_WORKSPACE")
MEMORY = TEAM / "memory"
WARSAW = ZoneInfo("Europe/Warsaw")
MAX_CHARS = 1200


def append(path: Path, block: str) -> None:
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    if existing and not existing.endswith("\n"):
        existing += "\n"
    path.write_text(existing + block, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--note", required=True, help="2-4 zdania: co dziś ważne i dlaczego")
    parser.add_argument("--sentyment", default="", help="jedno zdanie o nastroju rynku")
    parser.add_argument("--wniosek", default="", help="jedna linia trwałego wniosku dla zespołu")
    parser.add_argument("--lekcja", default="", help="nowa lekcja domenowa (rotuje przy 10)")
    parser.add_argument("--watek", default="", help="aktywny wątek: temat i stan")
    args = parser.parse_args()

    now = datetime.now(WARSAW)
    note = " ".join(args.note.split())[:MAX_CHARS]
    if not note:
        print("BŁĄD: pusta notatka — nic nie zapisano.")
        return 2

    lines = [f"\n## {now:%Y-%m-%d %H:%M} [BERNARD] — Poranny skrót", note]
    if args.sentyment.strip():
        lines.append(f"**Sentyment:** {' '.join(args.sentyment.split())[:300]}")
    append(MEMORY / f"{now:%Y-%m-%d}.md", "\n".join(lines) + "\n")

    if args.wniosek.strip():
        wniosek = " ".join(args.wniosek.split())[:300]
        append(MEMORY / "DZIŚ.md", f"{now:%H:%M} [BERNARD] wniosek: {wniosek}\n")

    done = ["notatka dzienna"]
    if args.wniosek.strip():
        done.append("wniosek do DZIŚ.md")

    # Lekcja i wątek idą przez research-state.py — ten sam skrypt pilnuje limitów i rotacji.
    extra = []
    if args.lekcja.strip():
        extra += ["--lekcja", args.lekcja.strip()]
    if args.watek.strip():
        extra += ["--thread", args.watek.strip()]
    if extra:
        result = subprocess.run(
            [sys.executable, str(TEAM / "ops/research-state.py"), "--agent", "bernard", *extra],
            text=True, capture_output=True, timeout=60, check=False,
        )
        done.append("pamięć researchu" if result.returncode == 0 else "pamięć researchu (BŁĄD)")

    print(f"Zapisano {now:%Y-%m-%d %H:%M} [BERNARD]: " + ", ".join(done) + ".")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
