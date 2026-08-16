#!/usr/bin/env python3
"""Tygodniowa konserwacja wspólnej pamięci: lokalny FTS, zero tokenów AI."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
from zoneinfo import ZoneInfo


TEAM = Path("/path/to/YOUR_WORKSPACE")
MEMORY = TEAM / "memory"
AGENTS = ("bernard", "dexter", "polly")
WARSAW = ZoneInfo("Europe/Warsaw")
IMPORTANT = re.compile(
    r"(?:\bdecyzj|\bustalon|\bnapraw|\bwdroż|\bwniosek|\blekcj|\bblocker|"
    r"\bfailed\b|❌|⚠️|do zrobienia|następny krok|status:\s*zapisano|"
    r"wymaga poprawy|wynik:)",
    flags=re.IGNORECASE,
)


def run(command: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def index_stats(agent: str) -> tuple[int, int]:
    database = Path(f"/path/to/YOUR_OPENCLAW/agents/{agent}/agent/openclaw-agent.sqlite")
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as connection:
        files = connection.execute("SELECT COUNT(*) FROM memory_index_sources").fetchone()[0]
        chunks = connection.execute("SELECT COUNT(*) FROM memory_index_chunks").fetchone()[0]
    return int(files), int(chunks)


def recent_note_stats(days: int = 7) -> tuple[int, int]:
    current = datetime.now(WARSAW).date()
    entries = 0
    important = 0
    for offset in range(days):
        path = MEMORY / f"{(current - timedelta(days=offset)).isoformat()}.md"
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("## ") or stripped.startswith("- "):
                entries += 1
                if IMPORTANT.search(stripped):
                    important += 1
    return entries, important


DIGEST_MAX_LINES = 40
DIGEST_MAX_CHARS = 4000
NOISE = re.compile(
    r"(?:auto-compaction|compacting context|could not recover|please try again|"
    r"pominięta przez filtr|\[auto:|^-\s*\d{2}:\d{2}\s*\[\w+\]\s*U:\s*/\w+|"
    r"\[(?:doctor|doktor)\].*⚠️|^-?\s*❌|do decyzji YOUR_NAMEa:.*bind-mount|"
    r"wskazuje usunięty inode|pamięć\s+(?:bernard|dexter|polly).*różni się|"
    r"memoryspectra.*problemy z bind-mountami|next: czekam na decyzję YOUR_NAMEa)",
    flags=re.IGNORECASE,
)


def digest() -> str:
    """Lokalny, darmowy wyciąg kandydatów dla MemorySpectry — zamiast całej notatki.

    Czyta DZIŚ.md i notatkę z wczoraj, zostawia tylko linie z sygnałem decyzji/naprawy/
    blokera i przycina wynik, żeby model nie dostawał 30 kB surowego dziennika.
    """
    today = datetime.now(WARSAW).date()
    picked: list[str] = []
    seen: set[str] = set()
    sources = [
        MEMORY / f"{today.isoformat()}.md",
        MEMORY / f"{(today - timedelta(days=1)).isoformat()}.md",
        MEMORY / "cron-learning" / f"{today.isoformat()}.md",
        MEMORY / "cron-learning" / f"{(today - timedelta(days=1)).isoformat()}.md",
    ]
    for path in sources:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        # Najnowsze wnioski mają pierwszeństwo. To zapobiega sytuacji, w której
        # poranny alert wypycha z limitu wieczorną naprawę tego samego incydentu.
        for line in reversed(lines):
            text = line.strip()
            if len(text) < 25 or not IMPORTANT.search(text) or NOISE.search(text):
                continue
            key = re.sub(r"\d+", "N", text.lower())[:120]
            if key in seen:
                continue
            seen.add(key)
            picked.append(text[:300])
    if not picked:
        return "KANDYDACI: brak — nic nowego do zapamiętania."
    return "KANDYDACI (tylko te linie oceniaj, nie otwieraj notatek):\n" + "\n".join(
        f"- {item}" for item in picked[:DIGEST_MAX_LINES]
    )[:DIGEST_MAX_CHARS]


def hygiene() -> str:
    """Lokalna kontrola limitów nauki — zamiast drogiego czytania plików przez model."""
    issues: list[str] = []
    state = MEMORY / "research-state"
    for path in sorted(state.glob("*.md")):
        if path.name in {"README.md", "dexter-validators.md"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            issues.append(f"{path.name}: nie da się odczytać ({exc.__class__.__name__})")
            continue
        lessons = re.findall(r"^- Lekcja #.*$", text, flags=re.M)
        rows = [
            line for line in text.splitlines()
            if line.startswith("| ") and not re.match(r"^\|\s*-{2,}", line)
        ]
        threads = max(len(rows) - 2, 0)  # bez nagłówka i separatora tabeli
        if len(lessons) > 10:
            issues.append(f"{path.name}: {len(lessons)} lekcji (limit 10)")
        if threads > 20:
            issues.append(f"{path.name}: {threads} wątków (limit 20)")
        canon = [re.sub(r"\W+", " ", item.lower())[:80] for item in lessons]
        if len(canon) != len(set(canon)):
            issues.append(f"{path.name}: są zduplikowane lekcje")
        if len(text) > 12000:
            issues.append(f"{path.name}: plik urósł do {len(text)} znaków")
    return "HIGIENA: " + ("; ".join(issues) if issues else "limity nauki OK, nic nie trzeba przycinać.")


def main() -> int:
    # `--digest` = tylko szybki, darmowy wyciąg kandydatów (bez wolnego reindeksu FTS),
    # żeby cron nie czekał ~90 s i nie tracił wyniku.
    if "--digest" in sys.argv:
        print(digest())
        if datetime.now(WARSAW).weekday() == 0:  # poniedziałek
            print()
            print(hygiene())
        return 0

    failures: list[str] = []
    stats: list[tuple[int, int]] = []
    for agent in AGENTS:
        result = run(["openclaw", "memory", "index", "--agent", agent])
        if result.returncode:
            failures.append(agent)
            continue
        try:
            stats.append(index_stats(agent))
        except (OSError, sqlite3.Error):
            failures.append(agent)

    entries, important = recent_note_stats()
    tasks = run(["python3", str(TEAM / "ops/team-task-status.py"), "--check"])
    failed_tasks = sum(
        1 for line in tasks.stdout.splitlines() if re.search(r"\b(failed|timed_out)\b", line)
    )

    if failures:
        print(
            "Pamięć zespołu wymaga uwagi: nie udało się odświeżyć lokalnego indeksu dla "
            + ", ".join(failures)
            + "."
        )
        return 2

    files = min(value[0] for value in stats)
    chunks = min(value[1] for value in stats)
    print(
        f"Pamięć zespołu: FTS odświeżony 3/3 — po {files} plików i {chunks} fragmentów. "
        f"W 7 dniach: {entries} krótkich wpisów, {important} sygnałów decyzji/napraw/alertów. "
        f"Otwarte nieudane zlecenia: {failed_tasks}. "
        "Daily notes i research-state pozostają źródłem nauki; bez modelu i bez tokenów."
    )
    print()
    print(digest())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
