#!/usr/bin/env python3
"""Krótki raport dnia YOUR_TEAM bez wywołań modeli.

Łączy nazwane wpisy wykonanej pracy z daily note z aktualnym stanem gatewaya,
cronów, kolejki zleceń i team-doctora. Historyczne alerty zapisane wcześniej
w daily nie są traktowane jako bieżący stan.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
import sqlite3
import subprocess
from zoneinfo import ZoneInfo


TEAM = Path("/path/to/YOUR_WORKSPACE")
MEMORY_ROOT = TEAM / "memory"
CRON_DB = Path("/path/to/YOUR_OPENCLAW/state/openclaw.sqlite")
DOCTOR_STATUS = Path("/path/to/YOUR_OPENCLAW/private/team-doctor.status")
WARSAW = ZoneInfo("Europe/Warsaw")
DEFAULT_MAX_CHARS = 2800

HEADING = re.compile(
    r"^##\s+(?:(?P<date>\d{4}-\d{2}-\d{2})\s+)?"
    r"(?P<time>\d{2}:\d{2})\s+\[(?P<agent>[^\]]+)\]"
    r"(?:\s+[—-]\s*(?P<title>.*))?\s*$"
)
WORK_AGENTS = {"ENZO", "CHARLIE", "DEXTER", "POLLY", "BERNARD"}


@dataclass(frozen=True)
class WorkItem:
    time: str
    agent: str
    title: str
    body: tuple[str, ...]


def normalized(text: str) -> str:
    text = re.sub(r"[`*_#]", "", text)
    text = re.sub(r"\s+", " ", text).strip(" .:-")
    return text


def clip(text: str, limit: int) -> str:
    text = normalized(text)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def parse_work(markdown: str, requested_day: str) -> list[WorkItem]:
    """Czyta tylko nazwane sekcje pracy; pomija alerty i surowy autozapis."""
    parsed: list[WorkItem] = []
    current: dict[str, object] | None = None

    def flush() -> None:
        nonlocal current
        if not current:
            return
        agent = str(current["agent"]).upper()
        title = normalized(str(current["title"]))
        if agent in WORK_AGENTS and title and title not in {"⚠️", "⚠️:"}:
            parsed.append(
                WorkItem(
                    time=str(current["time"]),
                    agent=agent,
                    title=title,
                    body=tuple(current["body"]),  # type: ignore[arg-type]
                )
            )
        current = None

    for raw_line in markdown.splitlines():
        match = HEADING.match(raw_line)
        if match:
            flush()
            heading_day = match.group("date") or requested_day
            current = {
                "date": heading_day,
                "time": match.group("time"),
                "agent": match.group("agent"),
                "title": match.group("title") or "",
                "body": [],
            }
            if heading_day != requested_day:
                current = None
            continue
        if current is not None:
            body = current["body"]
            assert isinstance(body, list)
            body.append(raw_line)
    flush()

    unique: dict[tuple[str, str], WorkItem] = {}
    for item in parsed:
        unique[(item.agent, item.title.casefold())] = item
    return list(unique.values())


def category(item: WorkItem) -> str:
    # Tytuł jest granicą źródła. Body daily może zawierać późniejsze linie autozapisu
    # z innego projektu, więc nie wolno nim klasyfikować całej sekcji.
    haystack = item.title.casefold()
    if re.search(r"x1|walidator|validator|stake|scoring|skip feed", haystack):
        return "X1 i walidatory"
    if re.search(
        r"studioimage|bracia ratownicy|braciaratownicy|imagebr|grafik|ilustrac|rozdział|kanon",
        haystack,
    ):
        return "Bracia Ratownicy i Studio"
    return "System, pamięć i organizacja"


def remove_superseded(items: list[WorkItem]) -> list[WorkItem]:
    """Usuwa diagnozy i pierwsze próby, jeśli daily zawiera późniejszą naprawę."""
    titles = " | ".join(item.title.casefold() for item in items)
    result: list[WorkItem] = []
    for item in items:
        title = item.title.casefold()
        if "diagnoza" in title and re.search(r"smart/cheap|napraw|usunię", titles):
            continue
        if "grafiki do" in title and "regeneracja grafik" in titles:
            continue
        result.append(item)
    return result


def render_work(items: list[WorkItem]) -> list[str]:
    grouped: dict[str, list[WorkItem]] = {
        "System, pamięć i organizacja": [],
        "Bracia Ratownicy i Studio": [],
        "X1 i walidatory": [],
    }
    for item in remove_superseded(items):
        grouped[category(item)].append(item)

    lines: list[str] = []
    for label, group in grouped.items():
        if not group:
            continue
        lines.append(f"{label}:")
        for item in group:
            lines.append(
                f"- {item.time} [{item.agent.title()}] {clip(item.title, 135)}."
            )
    return lines or ["- Brak nazwanych wpisów wykonanej pracy w dzisiejszej notatce."]


def run(command: list[str], timeout: int = 15) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            text=True,
            capture_output=True,
            check=False,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(command, 127, "", str(exc))


def service_state() -> str:
    result = run(["systemctl", "is-active", "openclaw-vps"], timeout=5)
    return "OK" if result.returncode == 0 and result.stdout.strip() == "active" else "AWARIA"


def task_state() -> str:
    result = run(
        ["python3", str(TEAM / "ops/team-task-status.py"), "--check", "--quiet"]
    )
    return "OK" if result.returncode == 0 else "WYMAGA UWAGI"


def cron_config_state() -> str:
    result = run(["python3", str(TEAM / "ops/cron-config-check.py")])
    return "OK" if result.returncode == 0 else "ROZJAZD"


def cron_state(db_path: Path) -> tuple[str, list[str]]:
    if not db_path.exists():
        return "brak bazy cronów", ["Nie można sprawdzić aktualnego stanu cronów."]
    query = """
        SELECT name, last_run_at_ms, COALESCE(last_run_status, ''),
               COALESCE(last_delivery_status, ''), COALESCE(last_error, '')
        FROM cron_jobs
        WHERE enabled = 1
        ORDER BY name
    """
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
            rows = connection.execute(query).fetchall()
    except (OSError, sqlite3.Error) as exc:
        return "błąd odczytu bazy", [clip(str(exc), 180)]

    green = 0
    waiting: list[str] = []
    failures: list[str] = []
    for name, last_run, run_status, delivery_status, last_error in rows:
        if last_run is None:
            waiting.append(str(name))
        elif run_status in {"ok", "success"} and delivery_status in {"", "delivered"}:
            green += 1
        else:
            failures.append(
                clip(
                    f"{name}: {run_status or 'brak statusu'}/"
                    f"{delivery_status or 'brak dostawy'} {last_error or ''}",
                    210,
                )
            )

    summary = f"{green}/{len(rows) - len(waiting)} wykonanych jobów ma status OK/delivered"
    details = [f"Aktywne awarie cronów: {failure}" for failure in failures]
    if waiting:
        details.append(
            "Na pierwszy zaplanowany przebieg czeka: "
            + ", ".join(clip(name, 90) for name in waiting)
            + "."
        )
    return summary, details


def doctor_state(status_path: Path) -> tuple[list[str], list[str]]:
    try:
        lines = status_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return ["Brak aktualnego wyniku team-doctora."], []
    problems = [
        normalized(line.split("=", 1)[1])
        for line in lines
        if line.startswith("problem=")
    ]
    active: list[str] = []
    historical: list[str] = []
    for problem in problems:
        if re.search(r"koszt 24h .*token", problem, flags=re.IGNORECASE):
            historical.append(
                f"{problem} — to ruchomy licznik historyczny, nie bieżąca awaria usług."
            )
        else:
            active.append(problem)
    return active, historical


def fit(lines: list[str], max_chars: int) -> str:
    output: list[str] = []
    used = 0
    for line in lines:
        addition = len(line) + (1 if output else 0)
        if used + addition <= max_chars:
            output.append(line)
            used += addition
            continue
        marker = "- Dalsze mniej istotne wpisy pominięto przez limit długości."
        while output and used + len(marker) + 1 > max_chars:
            removed = output.pop()
            used -= len(removed) + (1 if output else 0)
        output.append(marker)
        break
    return "\n".join(output)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="dzień YYYY-MM-DD; domyślnie dziś w Warszawie")
    parser.add_argument("--memory-root", type=Path, default=MEMORY_ROOT)
    parser.add_argument("--cron-db", type=Path, default=CRON_DB)
    parser.add_argument("--doctor-status", type=Path, default=DOCTOR_STATUS)
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    parser.add_argument("--compact", action="store_true", help="zgodność z kontraktem Bernarda")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    now = datetime.now(WARSAW)
    requested_day = args.date or now.date().isoformat()
    note = args.memory_root / f"{requested_day}.md"
    try:
        markdown = note.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"Nie mogę przygotować raportu: brak dziennika {note} ({exc}).")
        return 2

    cron_summary, cron_details = cron_state(args.cron_db)
    active_doctor, historical_doctor = doctor_state(args.doctor_status)
    live_lines = [
        f"- Gateway: {service_state()}; kolejka zleceń: {task_state()}; konfiguracja cronów: {cron_config_state()}.",
        f"- Crony: {cron_summary}.",
        *[f"- {detail}" for detail in cron_details],
    ]
    if active_doctor:
        live_lines.extend(f"- Aktywny problem: {problem}." for problem in active_doctor)
    else:
        live_lines.append("- Aktywne awarie wykrywane przez team-doctor: brak.")
    live_lines.extend(f"- Uwaga budżetowa: {problem}" for problem in historical_doctor)

    report = [
        f"YOUR_TEAM — {requested_day}, stan live {now:%H:%M}",
        "",
        "ZROBIONE DZISIAJ",
        *render_work(parse_work(markdown, requested_day)),
        "",
        "STAN TERAZ",
        *live_lines,
    ]
    print(fit(report, max(900, args.max_chars)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
