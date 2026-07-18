# Bernard — a self-improving AI agent team on OpenClaw

**Bernard** is an orchestrator AI agent that runs a small team of specialist agents on a
single VPS. This repo is a **clean, secrets-free blueprint** of how Bernard is built: his
skills, how he talks to the other agents, his hooks, and how his "backward memory" makes
the whole team a little smarter after every conversation.

Built by [SpectraHQteam](https://github.com/your-team). No passwords, no keys, no access —
just the architecture and the code, so you can build your own.

> ⚠️ This is a **template**. Every file ending in `.example` and every `YOUR_*` placeholder
> must be filled with your own values. Nothing here contains real credentials, IPs, or tokens.

---

## What Bernard is

Bernard is not a do-everything bot. His value is **understanding the goal, holding the
memory, and coordinating specialists** — then reporting back to you without being asked.

A minimal team is **three OpenClaw agents on one gateway**:

| Agent | Role |
|---|---|
| 🧠 **Bernard** | orchestrator — delegates, holds team memory, reports results to the owner |
| 🩷 **Polly** | content / research / campaigns (example specialist) |
| 🛠️ **Dexter** | infrastructure / security / monitoring (example specialist) |

(Our own team adds two headless coding agents driven by CLI — optional, see `INSTALL.md`.)

---

## How it works (the four ideas that matter)

### 1. Shared hybrid memory
All agents write to **one shared memory folder** (`memory/YYYY-MM-DD.md`) and read it before
answering. Bind-mounts (`/etc/fstab`) make it one physical store seen by every agent, so
**each agent knows what the others did** — no context copy-paste.

```
conversation/work → memory/today.md  (raw, signed [AGENT])
                  → memory/sorted/today/<tag>.md
                  → MEMORY.md (the essence — promoted nightly)
                  → vector index (memory_search, embeddings)
```

### 2. Hooks = automatic learning (`hooks/`)
- **message-memory-notes** — every message is de-noised, **secrets are redacted** (regex for
  API keys, tokens, private keys), tagged, and appended to today's shared note. This is the
  "backward memory": nothing is forgotten, everything is searchable later.
- **session-bootstrap-guard** — on every session start, injects `MEMORY.md` + today's note +
  hard anchors (real date/time, environment) so an agent **never starts blank**.

### 3. Nightly crons = getting smarter
Scheduled jobs read the last days of memory, extract lessons, and promote the essence into
`MEMORY.md`. After each day the team is measurably sharper — and cheaper, because the
long-term store stays small and true.

### 4. Deterministic guardrails (`ops/`) — outside the model
Shell scripts, not prompts, keep the system honest:
- **integrity-guard** — self-heals the shared core files, scans for stale facts.
- **team-doctor** — health check (gateway, mounts, hooks, sync, disk/RAM, crons); loud
  alert on silent failures.
- **sync-now** — continuous Git backup (only when something changed).

---

## Skills & agent-to-agent (A2A)

Bernard delegates with a tiny contract: **WHAT** (one line) / **WHY** (context) /
**WHEN** (deadline or async) / **FORMAT** (of the report). The executor acknowledges → does
the work → reports back. **A task is not closed until the owner got the report.** A simple
follow-up ledger + the bootstrap heartbeat guarantee nobody has to ask "and what about that?".

Each agent's character lives in its own `IDENTITY.md` / `SOUL.md`; the shared response
procedure, bans, and memory rules live in one `AGENTS-CORE.md` copied to every agent.

---

## Repo layout

```
README.md                     ← you are here
INSTALL.md                    ← build Bernard + 2 agents from zero
.env.example                  ← every env var NAME (no values)
openclaw.json.example         ← sanitized gateway config (${ENV} placeholders)
hooks/                        ← the two learning hooks (TypeScript)
ops/                          ← guard / doctor / sync scripts
agents/
  shared/AGENTS-CORE.example.md
  bernard|polly|dexter/IDENTITY.example.md
```

## Start here
1. Read `INSTALL.md`.
2. Copy every `.example` to its real name and fill `YOUR_*` placeholders.
3. Never commit real values — `.gitignore` blocks `.env`, `openclaw.json`, keys.

## License
MIT — do what you like, no warranty. Attribution welcome.

