# Bernard — a solo AI agent blueprint for OpenClaw

**Bernard** is a self-improving AI agent. This repo is a **clean, secrets-free blueprint**
of how a single agent works: his character files, the hooks that let him learn and remember,
and the guardrails that keep him honest.

Built as the cleaned template of a real production agent. No passwords, no keys, no access —
just the architecture and the code, so you can build your own.

> ⚠️ This is a **template**. Every file ending in `.example` and every `YOUR_*` placeholder
> must be filled with your own values. Nothing here contains real credentials, IPs, or tokens.

---

## How Bernard works — the ideas that matter

### 1. Hybrid memory
Everything is written to `memory/YYYY-MM-DD.md` and read before answering:

```
conversation/work → memory/today.md   (raw, signed [AGENT])
                  → MEMORY.md          (the essence — promoted over time)
                  → local search index (memory_search)
```

### 2. Hooks = automatic learning (`hooks/`)
- **message-memory-notes** — every message is de-noised, **secrets are redacted** (regex for
  API keys, tokens, private keys), tagged, and appended to today's note. Nothing is forgotten,
  everything is searchable later.
- **session-bootstrap-guard** — on every session start, injects `MEMORY.md` + today's note +
  hard anchors (real date/time, environment) so the agent **never starts blank**.

### 3. Guardrails outside the model (`ops/`)
Shell/Python scripts — not prompts — keep the system honest:
- **integrity-guard** — self-heals the core files and scans for stale facts.
- **memory-write** — append-only write to long-term memory (a model can never truncate the
  file); enforces a daily write limit.
- **research-note** — deterministic daily-note append (date/time/signature handled by the
  script, not the model).
- **sync-now** — continuous Git backup (only when something changed).

### 4. Runtime guard plugin (`plugins/bernard-runtime-guard`)
A native OpenClaw plugin that enforces invariants the model cannot be trusted to keep on its
own: it blocks claiming a `type: "text"` tool result is an image, blocks reporting a still-
`running` process as done, blocks gateway restart/stop/start through `exec`, and rewrites
empty tool results into an explicit "no data" notice. Ships with unit tests (`node --test`).

---

## Repo layout

```
README.md                     ← you are here
INSTALL.md                    ← build one Bernard agent from zero
.env.example                  ← every env var NAME (no values)
openclaw.json.example         ← sanitized gateway config (${ENV} placeholders)
hooks/                        ← the two learning hooks (TypeScript)
plugins/                      ← runtime guard plugin + unit tests
ops/                          ← integrity / memory / sync scripts
agents/bernard/               ← the agent's character + operating files (.example)
skills/                       ← reusable skills
```

## Start here
1. Read `INSTALL.md`.
2. Copy every `.example` to its real name and fill `YOUR_*` placeholders.
3. Never commit real values — `.gitignore` blocks `.env`, `openclaw.json`, keys.

## License
MIT — do what you like, no warranty. Attribution welcome.
