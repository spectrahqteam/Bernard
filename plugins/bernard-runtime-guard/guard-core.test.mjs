import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeToolResult,
  applyToolObservation,
  claimsCronRefusal,
  claimsTextToolOutputIsImage,
  describeEmptyToolResult,
  cronFallback,
  cronReportComplete,
  createRunState,
  evaluateViolations,
  isGatewayMutationViaExec,
  isCronSession,
  isUnknownProcessPoll,
  pruneStateMaps,
  safeReplacement,
  stateFromMessages,
  stateHasOnlyTextToolResults,
} from './guard-core.mjs';

function observe(state, options) {
  return applyToolObservation(state, analyzeToolResult(options));
}

test('blocks a false image claim after a text-only tool result', () => {
  const state = createRunState({ runId: 'r1', sessionKey: 'agent:bernard:main' });
  observe(state, {
    toolName: 'exec',
    params: {},
    result: {
      content: [{ type: 'text', text: 'TOOL_TEXT_OK' }],
      details: { status: 'completed', exitCode: 0 },
    },
  });
  assert.equal(stateHasOnlyTextToolResults(state), true);
  assert.deepEqual(
    evaluateViolations(state, 'Każdy output narzędzi wraca jako obrazek.'),
    ['text_output_claimed_as_image'],
  );
});

test('passes a real image or mixed tool result', () => {
  for (const content of [
    [{ type: 'image', data: 'abc' }],
    [{ type: 'text', text: 'caption' }, { type: 'image', data: 'abc' }],
  ]) {
    const state = createRunState();
    observe(state, { toolName: 'read', params: {}, result: { content } });
    assert.deepEqual(evaluateViolations(state, 'Wynik narzędzia jest obrazkiem.'), []);
  }
});

test('passes an image mention when there was no tool result', () => {
  assert.deepEqual(
    evaluateViolations(createRunState(), 'Ten obrazek wygląda dobrze.'),
    [],
  );
});

test('does not flag a truthful correction', () => {
  assert.equal(
    claimsTextToolOutputIsImage('Wyniki narzędzi są tekstowe; diagnoza o obrazkach była błędna.'),
    false,
  );
});

test('blocks a premature completion claim while exec is running', () => {
  const state = createRunState({ runId: 'r2' });
  observe(state, {
    toolName: 'exec',
    params: {},
    result: {
      content: [{
        type: 'text',
        text: 'Command still running (session grand-glade, pid 123). Use process for follow-up.',
      }],
      details: { status: 'running', sessionId: 'grand-glade' },
    },
  });
  assert.deepEqual(
    evaluateViolations(state, 'Gateway po restarcie — ale nadal nie widzę tekstu.'),
    ['running_process_claimed_complete'],
  );
});

test('terminal process poll clears pending state', () => {
  const state = createRunState({ runId: 'r3' });
  observe(state, {
    toolName: 'exec',
    params: {},
    result: {
      content: [{ type: 'text', text: 'Command still running (session pine).' }],
      details: { status: 'running', sessionId: 'pine' },
    },
  });
  observe(state, {
    toolName: 'process',
    params: { action: 'poll', sessionId: 'pine' },
    result: {
      content: [{ type: 'text', text: 'Process exited with code 0.' }],
      details: { status: 'completed', sessionId: 'pine', exitCode: 0 },
    },
  });
  assert.equal(state.pendingProcesses.size, 0);
  assert.deepEqual(evaluateViolations(state, 'Restart zakończony.'), []);
});

test('non-zero process exit is not accepted as completion', () => {
  const state = createRunState({ runId: 'r4' });
  observe(state, {
    toolName: 'exec',
    params: {},
    result: { content: [{ type: 'text', text: 'Command still running' }], details: { status: 'running', sessionId: 'bad' } },
  });
  observe(state, {
    toolName: 'process',
    params: { action: 'poll', sessionId: 'bad' },
    result: { content: [{ type: 'text', text: 'Process exited with code 1.' }], details: { status: 'completed', sessionId: 'bad', exitCode: 1 } },
  });
  assert.equal(state.pendingProcesses.size, 0);
  assert.equal(state.failedProcesses.size, 1);
  assert.deepEqual(evaluateViolations(state, 'Gotowe.'), ['failed_process_claimed_complete']);
});

test('fallback reports only known facts and never pretends to retry', () => {
  const state = createRunState({ sessionKey: 'agent:bernard:main' });
  state.pendingProcesses.set('live-job', { toolName: 'exec' });
  const text = safeReplacement(
    ['text_output_claimed_as_image', 'running_process_claimed_complete'],
    state,
  );
  assert.match(text, /postać tekstu/u);
  assert.match(text, /live-job/u);
  assert.doesNotMatch(text, /sprawdzam|ponownie|muszę odczytać/iu);
});

test('unknown blocks do not hide text evidence and fake process ids are blocked', () => {
  const state = createRunState();
  observe(state, {
    toolName: 'exec',
    params: {},
    result: { content: [{ type: 'text', text: 'ok' }, { data: 'opaque' }] },
  });
  assert.equal(stateHasOnlyTextToolResults(state), true);
  assert.deepEqual(evaluateViolations(state, 'Output wraca jako obrazek.'), ['text_output_claimed_as_image']);

  observe(state, {
    toolName: 'exec',
    params: {},
    result: { content: [{ type: 'text', text: 'Command still running' }], details: { status: 'running', sessionId: 'real-id' } },
  });
  assert.equal(isUnknownProcessPoll('process', { action: 'poll', sessionId: 'fake-id' }, state), true);
  assert.equal(isUnknownProcessPoll('process', { action: 'poll', sessionId: 'real-id' }, state), false);
});

test('reconstructs text-only state from current-turn messages', () => {
  const state = stateFromMessages([
    { role: 'toolResult', toolName: 'old', content: [{ type: 'image', data: 'old' }] },
    { role: 'user', content: [{ type: 'text', text: 'new turn' }] },
    {
      role: 'toolResult',
      toolName: 'exec',
      content: [{ type: 'text', text: 'ok' }],
      details: { status: 'completed', exitCode: 0 },
    },
  ]);
  assert.equal(stateHasOnlyTextToolResults(state), true);
});

test('state maps are isolated and expire by TTL', () => {
  const old = createRunState({ runId: 'old', sessionKey: 'agent:bernard:old', now: 0 });
  const fresh = createRunState({ runId: 'fresh', sessionKey: 'agent:bernard:fresh', now: 9_500 });
  const runs = new Map([['old', old], ['fresh', fresh]]);
  const sessions = new Map([['old', old], ['fresh', fresh]]);
  pruneStateMaps(runs, sessions, 10_000, 1_000);
  assert.deepEqual([...runs.keys()], ['fresh']);
  assert.deepEqual([...sessions.keys()], ['fresh']);
});

test('blocks OpenClaw gateway mutations through exec but allows read-only status', () => {
  assert.equal(
    isGatewayMutationViaExec('exec', { command: 'systemctl restart openclaw-vps.service' }),
    true,
  );
  assert.equal(
    isGatewayMutationViaExec('exec', { command: 'openclaw gateway restart' }),
    true,
  );
  assert.equal(
    isGatewayMutationViaExec('exec', { command: 'openclaw gateway status --json' }),
    false,
  );
  assert.equal(
    isGatewayMutationViaExec('read', { command: 'systemctl restart openclaw-vps.service' }),
    false,
  );
});

test('cron refusal is revised even without tool observations', () => {
  const sessionKey = 'agent:bernard:cron:YOUR_CRON_ID_RESEARCH';
  assert.equal(isCronSession(sessionKey), true);
  assert.equal(claimsCronRefusal('Wybacz, ale nie jestem w stanie przygotować raportu.'), true);
  assert.equal(claimsCronRefusal('Mimo prób nie udało mi się ukończyć raportu.'), true);
  assert.equal(claimsCronRefusal('Nie mogłem dostarczyć porannego skrótu.'), true);
  assert.deepEqual(
    evaluateViolations(undefined, 'Nie jestem w stanie przygotować porannego skrótu.', sessionKey),
    ['cron_refusal'],
  );
});

test('cron partial report is accepted and refusal fallback keeps required shape', () => {
  const sessionKey = 'agent:bernard:cron:YOUR_CRON_ID_RESEARCH';
  const partial = cronFallback(sessionKey);
  assert.deepEqual(evaluateViolations(undefined, partial, sessionKey), []);
  const fallback = cronFallback(sessionKey);
  assert.match(fallback, /Poranny skrót/u);
  assert.match(fallback, /₿ Krypto/u);
  assert.match(fallback, /🤖 AI/u);
  assert.doesNotMatch(fallback, /nie jestem w stanie/iu);

  const mediaFallback = cronFallback(
    'agent:polly:cron:YOUR_CRON_ID_MEDIA',
  );
  assert.match(mediaFallback, /Reklama i social/u);
  assert.equal(cronReportComplete(
    'agent:polly:cron:YOUR_CRON_ID_MEDIA',
    mediaFallback,
  ), true);
  assert.doesNotMatch(mediaFallback, /nic ciekawego|brak potwierdzonej świeżej zmiany/iu);
});

test('cron waiting message is incomplete and replaced with a full report', () => {
  const sessionKey = 'agent:bernard:cron:YOUR_CRON_ID_RESEARCH';
  const waiting = 'The research-input command is still running. I need to wait for its output.';
  assert.equal(cronReportComplete(sessionKey, waiting), false);
  assert.deepEqual(evaluateViolations(undefined, waiting, sessionKey), ['cron_incomplete']);
  assert.equal(cronReportComplete(sessionKey, safeReplacement(['cron_incomplete'], undefined, sessionKey)), true);
});

// --- Regresje z incydentu 2026-07-30 (analiza: reports/2026-07-31-analiza-bernard-obrazki.md) ---

test('łapie sformułowania, które przeszły przez starą listę czasowników', () => {
  const zdania = [
    'każdy mój `exec` ląduje jako obrazek, a ja nie widzę własnych wyników',
    'Nawet jedna linijka idzie jako obrazek.',
    'wieloliniowy output z `exec` regularnie renderuje się jako obrazek zamiast tekstu',
    'Nawet read zwraca obrazek.',
    'Wszystko idzie jako obrazki.',
    'every tool output shows up as an image instead of text',
  ];
  for (const zdanie of zdania) {
    assert.equal(claimsTextToolOutputIsImage(zdanie), true, `nie wykryto: ${zdanie}`);
  }
});

test('nie blokuje normalnej pracy nad grafiką (topik ImageBR)', () => {
  const legalne = [
    'Wygeneruj obrazek postaci wg referencji family.png i zapisz wynik w projekcie.',
    'Koncepcja okładki: obrazek z dwoma braćmi, narzędzie image_generation po stronie Enzo.',
    'Prompt na logo gotowy — grafika idzie do akceptacji YOUR_NAMEa.',
  ];
  for (const zdanie of legalne) {
    assert.equal(claimsTextToolOutputIsImage(zdanie), false, `fałszywy alarm: ${zdanie}`);
  }
});

test('fałszywe twierdzenie o obrazku jest łapane także BEZ stanu przebiegu', () => {
  // Sedno regresji: 30.07 stan nie był dostępny, więc reguła w ogóle nie działała.
  const violations = evaluateViolations(undefined, 'każdy exec ląduje jako obrazek', 'agent:bernard:main');
  assert.deepEqual(violations, ['text_output_claimed_as_image']);
});

test('twierdzenie o obrazku przechodzi, gdy narzędzie NAPRAWDĘ zwróciło obraz', () => {
  const state = createRunState({ runId: 'r-img', sessionKey: 'agent:bernard:main' });
  observe(state, {
    toolName: 'image_generation',
    params: {},
    result: { content: [{ type: 'image', image_url: 'x' }] },
  });
  assert.deepEqual(evaluateViolations(state, 'wynik narzędzia to obrazek', 'agent:bernard:main'), []);
});

test('pusty wynik po SIGTERM dostaje jawny opis braku danych', () => {
  const opis = describeEmptyToolResult({
    toolName: 'exec',
    text: '(no output recorded)\n\nProcess exited with signal SIGTERM.',
  });
  assert.ok(opis, 'oczekiwano tekstu zastępczego');
  assert.match(opis, /BRAK OUTPUTU/u);
  assert.match(opis, /SIGTERM/u);
  assert.match(opis, /timeout/iu);
  assert.match(opis, /Nie zgaduj/u);
});

test('wynik z realną treścią pozostaje nietknięty', () => {
  assert.equal(describeEmptyToolResult({ toolName: 'exec', text: 'test single line' }), null);
  assert.equal(
    describeEmptyToolResult({ toolName: 'exec', text: 'root 1402863 openclaw\nProcess exited with code 0' }),
    null,
  );
});

test('trwający proces nie jest mylony z pustym wynikiem', () => {
  const tekst = 'Command still running (session delta-otter, pid 1609480). Use process for follow-up.';
  assert.equal(describeEmptyToolResult({ toolName: 'exec', text: tekst }), null);
});

test('pozwala rozmawiać O incydencie zamiast go twierdzić', () => {
  const meta = [
    'Zaczynam od sprawdzenia czy bug z obrazkami nadal występuje.',
    'Sprawdzam bug z obrazkami — czy gateway poprawnie renderuje output.',
    'Bug z obrazkami — to był bug w renderowaniu gatewaya OpenClaw.',
    'Moje twierdzenia o obrazkach były halucynacją; wyniki miały typ text.',
    'Raport z 31.07 mówi, że output jako obrazek nie istniał.',
  ];
  for (const zdanie of meta) {
    assert.equal(claimsTextToolOutputIsImage(zdanie), false, `fałszywy alarm: ${zdanie}`);
  }
});
