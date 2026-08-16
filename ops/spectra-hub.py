#!/usr/bin/env python3
"""Jeden, bezsekretowy punkt kontroli całego YOUR_TEAM.

Łączy dowody z repo, konfiguracji OpenClaw, wspólnych plików, bind-mountów,
lokalnych indeksów FTS, cronów i prywatnego sejfu. Nie drukuje nazw ani wartości
sekretów. Opcja --live dodaje połączenia systemd, Telegram i GitHub.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime
import json
import os
from pathlib import Path
import sqlite3
import subprocess
from typing import Iterable
from zoneinfo import ZoneInfo


TEAM = Path("/path/to/YOUR_WORKSPACE")
OPENCLAW = Path("/path/to/YOUR_OPENCLAW")
CONFIG = OPENCLAW / "openclaw.json"
CRON_DB = OPENCLAW / "state/openclaw.sqlite"
AGENTS = ("bernard", "dexter", "polly")
# Pełny skład wykonawczy zespołu pod Bernardem (w tym app-launch Enzo/Charlie)
EXECUTORS = ("polly", "dexter", "enzo", "charlie")
WARSAW = ZoneInfo("Europe/Warsaw")
REQUIRED_ROOT = (
    "TEAM-CONSTITUTION.md",
    "SYSTEM-MAP.md",
    "CODE-MAP.md",
    "TEAM-PROTOCOL.md",
    "CODEX-WORKFLOW.md",
    "MEMORY.md",
    "shared/AGENTS-CORE.md",
    "shared/USER-CORE.md",
    "ops/zlec",
    "ops/team-task-runner.py",
    "ops/team-doctor.sh",
)
SERVICES = (
    "openclaw-vps.service",
    "openclaw-sync.timer",
    "repo-sync.timer",
    "team-doctor.timer",
    "memory-retention.timer",
    "cron-learning-sync.timer",
)


@dataclass(frozen=True)
class Check:
    key: str
    label: str
    status: str
    detail: str


def check(key: str, label: str, ok: bool, detail: str) -> Check:
    return Check(key, label, "ok" if ok else "fail", detail)


def warning(key: str, label: str, detail: str) -> Check:
    return Check(key, label, "warn", detail)


def run(argv: list[str], timeout: int = 25) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            argv,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return subprocess.CompletedProcess(argv, 124, "", str(exc))


def connected_telegram_accounts(payload: object) -> int:
    """Count healthy Telegram accounts from the stable JSON status contract."""
    if not isinstance(payload, dict):
        return 0
    accounts = payload.get("channelAccounts", {}).get("telegram", [])
    if not isinstance(accounts, list):
        return 0
    return sum(
        1
        for account in accounts
        if isinstance(account, dict)
        and account.get("enabled") is True
        and account.get("configured") is True
        and account.get("running") is True
        and account.get("connected") is True
        and isinstance(account.get("probe"), dict)
        and account["probe"].get("ok") is True
    )


def mode(path: Path) -> int | None:
    try:
        return path.stat().st_mode & 0o777
    except OSError:
        return None


def owner_is_root(path: Path) -> bool:
    try:
        stat = path.stat()
        return stat.st_uid == 0 and stat.st_gid == 0
    except OSError:
        return False


def same_file(left: Path, right: Path) -> bool:
    try:
        return os.path.samefile(left, right)
    except OSError:
        return False


def root_layout() -> Check:
    missing = [item for item in REQUIRED_ROOT if not (TEAM / item).exists()]
    detail = (
        f"dom={TEAM}; dokumenty i kontrolery {len(REQUIRED_ROOT)}/{len(REQUIRED_ROOT)}"
        if not missing
        else "brak: " + ", ".join(missing)
    )
    return check("home", "Dom i kod zespołu", not missing, detail)


def load_config() -> dict:
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def agent_contract(config: dict) -> Check:
    items = {
        str(item.get("id")): item
        for item in config.get("agents", {}).get("list", [])
        if isinstance(item, dict) and str(item.get("id")) in AGENTS
    }
    expected_workspaces = {
        agent: str(TEAM / agent)
        for agent in AGENTS
    }
    problems: list[str] = []
    if set(items) != set(AGENTS):
        problems.append("lista agentów runtime odbiega od bernard/dexter/polly")
    defaults = [agent for agent, item in items.items() if item.get("default") is True]
    if defaults != ["bernard"]:
        problems.append("Bernard nie jest jedynym agentem domyślnym")
    for agent in AGENTS:
        item = items.get(agent, {})
        if item.get("workspace") != expected_workspaces[agent]:
            problems.append(f"{agent}: błędny workspace")
        primary = item.get("model", {}).get("primary")
        fallback = item.get("model", {}).get("fallbacks", [])
        if primary != "deepseek/deepseek-v4-pro" or "google/gemini-2.5-flash" not in fallback:
            problems.append(f"{agent}: model odbiega od smart/cheap")
        if item.get("skills", []) != []:
            problems.append(f"{agent}: ciężkie skille są wstrzykiwane na start")
        # Decyzja YOUR_NAMEa 04.08: agent ładuje na starcie komplet swoich plików, więc próg
        # jest teraz zabezpieczeniem przed niekontrolowanym rozrostem, a nie oszczędnością.
        if int(item.get("bootstrapTotalMaxChars", 10**9)) > 80_000:
            problems.append(f"{agent}: bootstrap >80k")
    bernard_tools = set(items.get("bernard", {}).get("tools", {}).get("allow", []))
    required_tools = {
        "read",
        "exec",
        "memory_search",
        "codex_endpoint_probe",
        "codex_sessions_list",
        "codex_session_send",
    }
    if not required_tools.issubset(bernard_tools):
        problems.append("Bernard nie ma pełnego mostu do pamięci/Enzo")
    launcher = (TEAM / "ops/zlec").read_text(encoding="utf-8", errors="ignore")
    if "polly|dexter|enzo|charlie" not in launcher or not all(e in launcher for e in EXECUTORS):
        problems.append("launcher nie obejmuje wszystkich wykonawców")
    return check(
        "agents",
        "Bernard i jego wykonawcy",
        not problems,
        "Bernard zarządza Polly, Dexterem, Enzo i Charliem; profil smart/cheap"
        if not problems
        else "; ".join(problems),
    )


def shared_files() -> Check:
    problems: list[str] = []
    for agent in AGENTS:
        for target, source in (
            ("AGENTS.md", "shared/AGENTS-CORE.md"),
            ("USER.md", "shared/USER-CORE.md"),
        ):
            dst = TEAM / agent / target
            src = TEAM / source
            if dst.is_symlink() or not dst.is_file():
                problems.append(f"{agent}/{target}: nie jest zwykłym plikiem")
            elif dst.read_bytes() != src.read_bytes():
                problems.append(f"{agent}/{target}: różni się od shared")
        for name in (
            "IDENTITY.md",
            "SOUL.md",
            "TOOLS.md",
            "OPERATIONS.md",
            "MEMORY.md",
            "TEAM-CONSTITUTION.md",
            "SYSTEM-MAP.md",
        ):
            path = TEAM / agent / name
            if not path.exists() or not os.access(path, os.R_OK):
                problems.append(f"{agent}/{name}: brak odczytu")
    return check(
        "shared",
        "Wspólne pliki i bootstrap",
        not problems,
        "AGENTS/USER 3/3 identyczne; role własne; mapy wspólne i czytelne"
        if not problems
        else "; ".join(problems[:6]),
    )


def memory_contract(config: dict) -> Check:
    problems: list[str] = []
    counts: list[tuple[int, int]] = []
    for agent in AGENTS:
        if not same_file(TEAM / "memory", TEAM / agent / "memory"):
            problems.append(f"{agent}: memory nie wskazuje kanonu")
        if not same_file(TEAM / "MEMORY.md", TEAM / agent / "MEMORY.md"):
            problems.append(f"{agent}: MEMORY.md nie wskazuje kanonu")
        db = OPENCLAW / f"agents/{agent}/agent/openclaw-agent.sqlite"
        try:
            with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as conn:
                files = int(conn.execute(
                    "SELECT COUNT(*) FROM memory_index_sources"
                ).fetchone()[0])
                chunks = int(conn.execute(
                    "SELECT COUNT(*) FROM memory_index_chunks"
                ).fetchone()[0])
                raw_meta = conn.execute(
                    "SELECT value FROM memory_index_meta WHERE key='memory_index_meta_v1'"
                ).fetchone()
            meta = json.loads(raw_meta[0]) if raw_meta else {}
            if meta.get("provider") != "none" or meta.get("model") != "fts-only":
                problems.append(f"{agent}: indeks nie jest FTS-only")
            if files < 20 or chunks < 100:
                problems.append(f"{agent}: niepełny indeks {files}/{chunks}")
            counts.append((files, chunks))
        except (OSError, sqlite3.Error, json.JSONDecodeError):
            problems.append(f"{agent}: indeks pamięci nieczytelny")
    search = config.get("agents", {}).get("defaults", {}).get("memorySearch", {})
    if search.get("provider") != "none" or search.get("fallback") != "none":
        problems.append("globalna pamięć nie jest darmowym FTS-only")
    # Fragmenty mogą się różnić o kilka sztuk między reindeksami (agenci indeksują
    # w różnych momentach) — czerwone dopiero przy realnej rozbieżności plików
    # albo dryfie fragmentów większym niż 5% (YOUR_NAME, 07.08).
    if counts:
        files_set = {f for f, _ in counts}
        chunk_min = min(c for _, c in counts)
        chunk_max = max(c for _, c in counts)
        if len(files_set) > 1 or chunk_max - chunk_min > max(10, chunk_max // 20):
            problems.append("agenci mają różne indeksy pamięci")
    size = f"{counts[0][0]} plików/{counts[0][1]} fragmentów" if counts else "brak indeksu"
    return check(
        "memory",
        "Wspólna pamięć hybrydowa",
        not problems,
        f"6/6 bind-mountów; FTS 3/3 po {size}; bez API"
        if not problems
        else "; ".join(problems),
    )


def learning_contract() -> Check:
    learning = sorted((TEAM / "memory/cron-learning").glob("*.md"), reverse=True)
    problems: list[str] = []
    if not learning:
        problems.append("brak nauki z cronów")
    else:
        latest = learning[0]
        age_h = (
            datetime.now().timestamp() - latest.stat().st_mtime
        ) / 3600
        text = latest.read_text(encoding="utf-8", errors="ignore")
        missing = [
            agent
            for agent in ("Bernard", "Dexter", "Polly")
            if f"- Agent: {agent}" not in text
        ]
        if age_h > 36:
            problems.append(f"ostatnia nauka ma {int(age_h)} h")
        if missing:
            problems.append("brak agentów w nauce: " + ", ".join(missing))
        rejected = text.count("- Status: wymaga poprawy — nie promować jako wiedzy")
        omitted = text.count(
            "- Wynik: pominięty; cron nie dostarczył poprawnego raportu."
        )
        if rejected != omitted:
            problems.append("odrzucony raport przedostał się do wiedzy")
    lessons = TEAM / "memory/research-state/TEAM-LESSONS.md"
    if not lessons.is_file():
        problems.append("brak TEAM-LESSONS.md")
    return check(
        "learning",
        "Codzienna nauka",
        not problems,
        f"crony 7/7 → {learning[0].name}; lekcje wspólne"
        if not problems
        else "; ".join(problems),
    )


def secret_contract() -> Check:
    env = OPENCLAW / ".env"
    private = OPENCLAW / "private"
    inventory = private / "BERNARD-ACCESS-INVENTORY.md"
    problems: list[str] = []
    expected = ((env, 0o600), (private, 0o700), (inventory, 0o600))
    for path, expected_mode in expected:
        if mode(path) != expected_mode or not owner_is_root(path):
            problems.append(f"{path}: wymagane root:{oct(expected_mode)[2:]}")
    unsafe: list[str] = []
    if private.is_dir():
        for path in private.rglob("*"):
            if "venv" in path.parts:
                continue
            current = mode(path)
            if current is not None and current & 0o077:
                unsafe.append(str(path.relative_to(private)))
    if unsafe:
        problems.append(f"{len(unsafe)} prywatnych ścieżek ma za szerokie prawa")
    try:
        key_count = sum(
            1
            for line in env.read_text(encoding="utf-8").splitlines()
            if line and not line.startswith("#") and "=" in line
        )
        sections = sum(
            1
            for line in inventory.read_text(encoding="utf-8").splitlines()
            if line.startswith("## ")
        )
    except OSError:
        key_count = sections = 0
    if key_count == 0 or sections == 0:
        problems.append("sejf lub mapa dostępu są puste")
    return check(
        "secrets",
        "Prywatny sejf",
        not problems,
        f"{key_count} wpisów env; {sections} sekcji mapy Bernarda; wartości poza Git"
        if not problems
        else "; ".join(problems),
    )


def runtime_code() -> Check:
    pairs = (
        (
            TEAM / "hooks/message-memory-notes/handler.ts",
            OPENCLAW / "hooks/message-memory-notes/handler.ts",
        ),
        (
            TEAM / "hooks/session-bootstrap-guard/handler.ts",
            OPENCLAW / "hooks/session-bootstrap-guard/handler.ts",
        ),
        (TEAM / "ops/team-doctor.sh", OPENCLAW / "team-doctor.sh"),
        (TEAM / "ops/integrity-guard.sh", OPENCLAW / "integrity-guard.sh"),
        (TEAM / "ops/sync-now.sh", OPENCLAW / "sync-now.sh"),
    )
    drift = [
        str(source.relative_to(TEAM))
        for source, live in pairs
        if not source.is_file() or not live.is_file() or source.read_bytes() != live.read_bytes()
    ]
    return check(
        "runtime",
        "Kod źródłowy i runtime",
        not drift,
        "hooki, guard, doctor i sync zgodne ze źródłem"
        if not drift
        else "drift runtime: " + ", ".join(drift),
    )


def cron_contract() -> Check:
    problems: list[str] = []
    total = 0
    bad = 0
    try:
        with sqlite3.connect(f"file:{CRON_DB}?mode=ro", uri=True) as conn:
            total = int(conn.execute(
                "SELECT COUNT(*) FROM cron_jobs WHERE enabled=1"
            ).fetchone()[0])
            bad = int(conn.execute(
                """SELECT COUNT(*) FROM cron_jobs
                   WHERE enabled=1 AND last_run_at_ms IS NOT NULL
                     AND (COALESCE(last_run_status,'') != 'ok'
                      OR COALESCE(last_delivery_status,'') != 'delivered')"""
            ).fetchone()[0])
    except sqlite3.Error:
        problems.append("baza cronów nieczytelna")
    # 06.08: siódmy cron to X1 Research (topik 267) — sygnały z grupy X1
    # wydzielone z raportu inwestycyjnego decyzją YOUR_NAMEa.
    if total != 7:
        problems.append(f"aktywnych cronów {total}/7")
    if bad:
        problems.append(f"{bad} cronów bez zielonego wyniku/dostawy")
    prompts = run(["python3", str(TEAM / "ops/cron-config-check.py")], timeout=15)
    if prompts.returncode != 0:
        problems.append("runtime promptów odbiega od źródła")
    return check(
        "cron",
        "Crony i raporty",
        not problems,
        "7/7 aktywnych; ostatnie wyniki dostarczone; prompty zgodne"
        if not problems
        else "; ".join(problems),
    )


def git_contract(live: bool) -> Check:
    head = run(["git", "-C", str(TEAM), "rev-parse", "HEAD"]).stdout.strip()
    origin = run(["git", "-C", str(TEAM), "rev-parse", "origin/master"]).stdout.strip()
    if not head or not origin:
        return check("git", "GitHub i backup", False, "brak lokalnego HEAD/origin")
    status = run(["git", "-C", str(TEAM), "status", "--porcelain"]).stdout.splitlines()
    ahead_raw = run([
        "git", "-C", str(TEAM), "rev-list", "--count", "origin/master..HEAD"
    ]).stdout.strip()
    ahead = int(ahead_raw or 0)
    if live:
        remote = run([
            "gh", "api",
            "repos/YOUR_GH_ORG/YOUR_REPO/commits/master",
            "--jq", ".sha",
        ], timeout=30)
        remote_sha = remote.stdout.strip()
        if remote.returncode != 0:
            return check("git", "GitHub i backup", False, "GitHub live niedostępny")
        if remote_sha != head:
            return check(
                "git",
                "GitHub i backup",
                False,
                f"GitHub nie ma bieżącego HEAD; lokalnie oczekuje {ahead} commitów",
            )
        return check(
            "git",
            "GitHub i backup",
            True,
            f"GitHub live={head[:12]}; lokalnie {len(status)} zmian oczekuje na auto-sync",
        )
    if ahead > 2:
        return check("git", "GitHub i backup", False, f"{ahead} commitów oczekuje na push")
    detail = (
        f"HEAD/origin={head[:12]}; {len(status)} zmian oczekuje na auto-sync"
        if status or head != origin
        else f"HEAD/origin={head[:12]}; lokalny tracking zgodny"
    )
    return check("git", "GitHub i backup", True, detail)


def live_contracts() -> Iterable[Check]:
    states = run(["systemctl", "is-active", *SERVICES], timeout=20)
    values = [line.strip() for line in states.stdout.splitlines()]
    bad = [
        service
        for service, state in zip(SERVICES, values)
        if state != "active"
    ]
    yield check(
        "services",
        "Usługi i samonaprawa",
        not bad and len(values) == len(SERVICES),
        f"{len(SERVICES)}/{len(SERVICES)} aktywnych"
        if not bad and len(values) == len(SERVICES)
        else "nieaktywne: " + ", ".join(bad or ["status niedostępny"]),
    )
    # OpenClaw 2026.7 performs a richer probe and can need more than the old
    # 45-second budget. Parse JSON instead of depending on human wording.
    channels = run(
        ["openclaw", "channels", "status", "--probe", "--json"],
        timeout=120,
    )
    try:
        works = connected_telegram_accounts(json.loads(channels.stdout))
    except json.JSONDecodeError:
        works = 0
    yield check(
        "channels",
        "Kanały Telegram",
        channels.returncode == 0 and works == 3,
        "Bernard, Dexter i Polly połączeni 3/3"
        if channels.returncode == 0 and works == 3
        else f"połączone kanały {works}/3",
    )


def collect(live: bool, core_only: bool) -> list[Check]:
    config = load_config()
    checks = [
        root_layout(),
        agent_contract(config),
        shared_files(),
        memory_contract(config),
        learning_contract(),
        secret_contract(),
        runtime_code(),
        cron_contract(),
        git_contract(live and not core_only),
    ]
    if live and not core_only:
        checks.extend(live_contracts())
    return checks


def main() -> int:
    parser = argparse.ArgumentParser(description="YOUR_TEAM — jeden kontroler całości")
    parser.add_argument("--live", action="store_true", help="sprawdź też systemd, Telegram i GitHub")
    parser.add_argument("--core-only", action="store_true", help="szybki kontrakt dla team-doctor")
    parser.add_argument("--json", action="store_true", help="wynik maszynowy bez sekretów")
    parser.add_argument("--quiet", action="store_true", help="tylko linia podsumowania")
    args = parser.parse_args()

    checks = collect(args.live, args.core_only)
    failed = [item for item in checks if item.status == "fail"]
    warned = [item for item in checks if item.status == "warn"]
    now = datetime.now(WARSAW).isoformat(timespec="seconds")

    if args.json:
        print(json.dumps(
            {
                "timestamp": now,
                "status": "ok" if not failed else "failed",
                "checks": [asdict(item) for item in checks],
            },
            ensure_ascii=False,
            indent=2,
        ))
    elif args.quiet:
        print(
            f"SPECTRA HUB: {'OK' if not failed else 'FAILED'} "
            f"({len(checks) - len(failed)}/{len(checks)}; ostrzeżenia {len(warned)})"
        )
    else:
        print(
            f"SPECTRA HUB: {'OK' if not failed else 'FAILED'} "
            f"— {len(checks) - len(failed)}/{len(checks)} warstw"
        )
        for item in checks:
            icon = "✅" if item.status == "ok" else ("⚠️" if item.status == "warn" else "❌")
            print(f"{icon} {item.label}: {item.detail}")
        print("🔐 Wartości haseł i tokenów nie są odczytywane ani wyświetlane.")
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
