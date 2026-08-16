# INSTALL — Bernard + 2 OpenClaw agents from zero

> Tested pattern, secrets removed. Fill every `YOUR_*` placeholder with your own values.
> Prereqs: a Linux VPS (Ubuntu 22.04+), Node.js 20+, a Telegram bot token per agent,
> one LLM API key (this template assumes an OpenAI-compatible provider + an embeddings
> provider for memory search).

## 1. Install the OpenClaw gateway
Follow the upstream OpenClaw install for your platform, then verify:
```
openclaw --version
```

## 2. Create the team home
```
mkdir -p /root/YOURTEAM/{memory,shared,ops,hooks,bernard,polly,dexter,inbox}
```
Copy this repo's `agents/shared/AGENTS-CORE.example.md` → `/root/YOURTEAM/shared/AGENTS-CORE.md`
and each `agents/<name>/IDENTITY.example.md` → `/root/YOURTEAM/<name>/IDENTITY.md`. Give every
agent an identical copy of `AGENTS-CORE.md` as its `AGENTS.md` (a guard keeps them in sync).

## 3. Shared memory via bind-mounts
So all three agents see ONE memory store, add to `/etc/fstab` (then `mount -a`):
```
/root/YOURTEAM/memory       /root/YOURTEAM/bernard/memory   none bind 0 0
/root/YOURTEAM/MEMORY.md     /root/YOURTEAM/bernard/MEMORY.md none bind 0 0
# ...repeat for polly and dexter (6 lines total)
```

## 4. Secrets — never in the repo
```
cp .env.example /root/.openclaw/.env      # then fill real values
chmod 600 /root/.openclaw/.env
```
`.env` holds API keys + one Telegram bot token per agent. The config only references
`${ENV_NAME}` — values live in `.env` alone.

## 5. Gateway config
Copy `openclaw.json.example` → `~/.openclaw/openclaw.json`, set each agent's `workspace`,
`model` (primary + fallback), and Telegram routing. Validate:
```
openclaw config validate
```

## 6. Hooks (automatic learning)
Copy `hooks/` → `~/.openclaw/hooks/` (the gateway loads them from there). They enable the
shared memory notes + the bootstrap guard.

## 7. Guardrails + backup
Copy `ops/*.sh` somewhere runnable, set up a 30s timer for `sync-now.sh`/`integrity-guard.sh`
and a 3h timer for `team-doctor.sh` (systemd timers or cron). Point `sync-now.sh` at your
own private Git backup.

## 7b. Runtime guard plugin
Copy `plugins/bernard-runtime-guard/` to your gateway's plugin directory, then enable it in
your gateway config. Verify with its own unit tests:
```
cd plugins/bernard-runtime-guard && node --test
```
The plugin needs the team scripts it references (`ops/team-roadmap.py`, etc.) — point its
paths at your own `ops/` directory (fill the `YOUR_*` placeholders in its source).

## 7c. Delegation + memory scripts
Copy `ops/*.py` and `ops/zlec` next to the shell guardrails. `zlec` launches a background
worker and reports back to you automatically; `spectra-hub.py --live` is your one-command
whole-team health check; `memory-write.py` is the append-only gate the nightly memory cron
uses so a model can never truncate `MEMORY.md`.

## 8. Run
```
systemctl start openclaw-vps        # or: openclaw gateway run
```
Message your Bernard bot. On first reply the bootstrap guard proves memory is loaded.

## Optional: headless coding agents
Our team drives two CLI coding agents (one per subscription) via small launcher scripts that
run in the background and auto-report to the owner on completion (result → topic, ✅/⚠️ → DM,
timeout → kill). That layer is team-specific and not shipped here, but the pattern is: wrap
the CLI in `timeout`, then a deterministic notifier posts the outcome. Build your own to taste.
