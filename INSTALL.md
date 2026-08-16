# INSTALL — one Bernard agent from zero

> Tested pattern, secrets removed. Fill every `YOUR_*` placeholder with your own values.
> Prereqs: a Linux VPS (Ubuntu 22.04+), Node.js 20+, a Telegram bot token,
> one LLM API key (this template assumes an OpenAI-compatible provider).

## 1. Install the OpenClaw gateway
Follow the upstream OpenClaw install for your platform, then verify it runs.

## 2. Copy the agent files
```bash
cd YOUR_WORKSPACE
for f in IDENTITY SOUL AGENTS OPERATIONS TOOLS USER MEMORY BOOT HEARTBEAT; do
  cp agents/bernard/$f.example.md $f.md
done
```
Edit each file and replace every `YOUR_*` placeholder (name, paths, timezone, voice).

## 3. Install the hooks
```bash
mkdir -p ~/.openclaw/hooks/message-memory-notes
cp hooks/message-memory-notes/handler.ts ~/.openclaw/hooks/message-memory-notes/handler.ts

mkdir -p ~/.openclaw/hooks/session-bootstrap-guard
cp hooks/session-bootstrap-guard/handler.ts ~/.openclaw/hooks/session-bootstrap-guard/handler.ts
```
Replace `/path/to/YOUR_WORKSPACE` in both hooks with your real workspace path.

## 4. Install the ops scripts
```bash
cp ops/* /usr/local/bin/   # or another dir on your PATH
```
Set your workspace path in each script (`YOUR_WORKSPACE`).

## 5. Install the runtime guard plugin
```bash
cp -r plugins/bernard-runtime-guard ~/.openclaw/plugins/bernard-runtime-guard
cd ~/.openclaw/plugins/bernard-runtime-guard && npm install
node --test   # verify the guard logic passes
```

## 6. Configure the gateway
Copy `openclaw.json.example` to your OpenClaw config and fill the `${ENV}` placeholders.
Copy `.env.example` to `.env` and add your real keys (never commit it).

## 7. Verify
```bash
node --check hooks/message-memory-notes/handler.ts
node --check hooks/session-bootstrap-guard/handler.ts
node --test plugins/bernard-runtime-guard/guard-core.test.mjs
```

## What you get
A single agent that remembers everything, learns over time, and is kept honest by
deterministic guardrails — with zero secrets in the repo.
