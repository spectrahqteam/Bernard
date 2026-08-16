# Bernard Runtime Guard

Native OpenClaw plugin enforcing two runtime invariants for the `bernard` agent:

1. If every current-run tool-result block has `type: "text"`, Bernard cannot
   claim that the results are images or unreadable text.
2. An async process with `status: "running"` cannot be reported as completed
   until a terminal `process poll` result is observed.
3. Gateway restart/stop/start through `exec` is blocked; Bernard must use the
   native `gateway` tool so the post-restart sentinel can resume the run.

Enforcement layers:

- `before_agent_finalize`: requests one bounded corrective model pass.
- `before_tool_call`: blocks unsafe gateway lifecycle commands through `exec`.
- `before_message_write`: prevents a false assistant message from contaminating
  the session transcript.
- `reply_payload_sending`: replaces any still-invalid outbound payload with a
  deterministic fail-closed notice.

Run unit tests:

```bash
node --test guard-core.test.mjs
```
