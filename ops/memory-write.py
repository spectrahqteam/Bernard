#!/usr/bin/env python3
"""Zapis do pamięci trwałej — WYŁĄCZNIE dopisywanie, bez możliwości skrócenia pliku.

27.07 MemorySpectra nadpisała MEMORY.md i zniknęło 95 linii wiedzy zespołu. Prompt z
zakazem nie wystarczył, więc odbieramy modelowi narzędzia zapisu i zostawiamy ten skrypt:
umie dopisać wpis i nic więcej. Skrócenie pliku jest technicznie niemożliwe.

  memory-write.py --plik MEMORY|DECISIONS|TROUBLESHOOTING --wpis "pełne zdanie"
"""

from __future__ import annotations

import argparse
import fcntl
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TEAM = Path("/path/to/YOUR_WORKSPACE")
WARSAW = ZoneInfo("Europe/Warsaw")
FILES = {
    "MEMORY": TEAM / "MEMORY.md",
    "DECISIONS": TEAM / "DECISIONS.md",
    "TROUBLESHOOTING": TEAM / "TROUBLESHOOTING.md",
}
MAX_ENTRY = 600
MAX_DAILY_WRITES = 3
LOCK = TEAM / "runtime/memory-write.lock"


def author_writes_today(author: str, now: datetime) -> int:
    marker = f"- ({now:%d.%m}) [{author}]"
    total = 0
    for path in FILES.values():
        try:
            total += sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.startswith(marker))
        except OSError:
            continue
    return total


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plik", required=True, choices=sorted(FILES))
    parser.add_argument("--wpis", required=True)
    parser.add_argument("--autor", default="MEMORYSPECTRA")
    args = parser.parse_args()

    entry = " ".join(args.wpis.split())[:MAX_ENTRY]
    if len(entry) < 25:
        print("BŁĄD: wpis jest za krótki, żeby miał wartość za miesiąc.")
        return 2

    now = datetime.now(WARSAW)
    author = " ".join(args.autor.split()).upper()[:40]
    path = FILES[args.plik]
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    lock_fd = os.open(LOCK, os.O_WRONLY | os.O_CREAT, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        before = path.read_text(encoding="utf-8") if path.exists() else ""

        # Nie dodajemy drugi raz tego samego — porównanie po początku treści bez znaków.
        canon = "".join(ch for ch in entry.lower() if ch.isalnum())[:90]
        if canon and canon in "".join(ch for ch in before.lower() if ch.isalnum()):
            print("Pominięto — ta informacja już jest zapisana.")
            return 0
        if author == "MEMORYSPECTRA" and author_writes_today(author, now) >= MAX_DAILY_WRITES:
            print(f"BŁĄD: dzienny limit MemorySpectra to {MAX_DAILY_WRITES} zapisy łącznie.")
            return 4

        block = f"\n- ({now:%d.%m}) [{author}] {entry}\n"
        # O_APPEND zachowuje inode pliku. To jest konieczne dla bind-mountów MEMORY.md;
        # write_text/replace zrywał współdzielenie pamięci agentów.
        path.parent.mkdir(parents=True, exist_ok=True)
        before_size = path.stat().st_size if path.exists() else 0
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, block.encode("utf-8"))
            os.fsync(fd)
        finally:
            os.close(fd)
        after_size = path.stat().st_size
        if after_size <= before_size:
            print("BŁĄD: wpis nie zwiększył pliku.")
            return 3
        print(f"Dopisano do {path.name} ({before_size} → {after_size} B).")
        return 0
    finally:
        os.close(lock_fd)


if __name__ == "__main__":
    raise SystemExit(main())
