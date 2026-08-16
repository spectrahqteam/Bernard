import assert from 'node:assert/strict';
import test from 'node:test';

import plugin from './index.js';

test('registers roadmap context for every OpenClaw agent turn', () => {
  const hooks = new Map();
  plugin.register({
    on(name, handler) {
      hooks.set(name, handler);
    },
    logger: { info() {}, warn() {} },
  });

  const hook = hooks.get('before_prompt_build');
  assert.equal(typeof hook, 'function');
  for (const agentId of ['bernard', 'dexter', 'polly']) {
    const result = hook(
      { prompt: 'stan zespołu' },
      { agentId, workspaceDir: `/path/to/YOUR_WORKSPACE/${agentId}` },
    );
    assert.match(result.prependContext, /TEAM-ROADMAP CONTEXT/);
    assert.match(result.prependContext, /Pamięć hybrydowa jest priorytetem/);
    assert.doesNotMatch(result.prependContext, /(?:sk-|ghp_|TELEGRAM_BOT_TOKEN)=/);
  }
});

test('ignores unknown agents', () => {
  const hooks = new Map();
  plugin.register({
    on(name, handler) {
      hooks.set(name, handler);
    },
    logger: { info() {}, warn() {} },
  });
  assert.equal(hooks.get('before_prompt_build')({ prompt: '' }, { agentId: 'other' }), undefined);
});

test('does not retain prompts for an isolated Kalorik agent', () => {
  const hooks = new Map();
  plugin.register({
    on(name, handler) {
      hooks.set(name, handler);
    },
    logger: { info() {}, warn() {} },
  });
  assert.equal(
    hooks.get('before_prompt_build')(
      { prompt: 'private nutrition command' },
      { agentId: 'kalorik', sessionKey: 'agent:kalorik:app:test' },
    ),
    undefined,
  );
  assert.equal(
    hooks.get('before_message_write')(
      { message: { role: 'assistant', content: [{ type: 'text', text: '{}' }] } },
      { agentId: 'kalorik', sessionKey: 'agent:kalorik:app:test' },
    ),
    undefined,
  );
});
