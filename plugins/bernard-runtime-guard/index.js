import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

import {
  analyzeToolResult,
  applyToolObservation,
  createRunState,
  describeEmptyToolResult,
  evaluateViolations,
  extractMessageText,
  isGatewayMutationViaExec,
  isCronSession,
  isUnknownProcessPoll,
  pruneStateMaps,
  replaceMessageText,
  revisionInstruction,
  safeReplacement,
  stateFromMessages,
} from './guard-core.mjs';

const PLUGIN_ID = 'bernard-runtime-guard';
const STATE_TTL_MS = 30 * 60 * 1000;
const ROADMAP_SCRIPT = '/path/to/YOUR_WORKSPACE/ops/team-roadmap.py';
const AUTOSAVE_SCRIPT = '/path/to/YOUR_WORKSPACE/ops/agent-daily-autosave.py';
const DOKOMNIECIA_SCRIPT = '/path/to/YOUR_WORKSPACE/ops/team-task-status.py';
const DOKOMNIECIA_DIR = '/path/to/YOUR_WORKSPACE/runtime';
const PLAIN_STYLE_BLOCK = [
  '## Styl odpowiedzi (wymóg YOUR_NAMEa — stały)',
  '- Odpowiadaj prosto i zrozumiale, po ludzku. Analizuj pytanie YOUR_NAMEa względem wstrzykniętych notatek (TEAM-ROADMAP, daily, MEMORY, DECISIONS, PROJECT_STATE) i podawaj tylko to, co istotne.',
  '- Bez surowych tabel, list ścieżek, logów i żargonu, gdy wystarczy krótkie wyjaśnienie po polsku. Konkret tak, techniczny szum nie.',
].join('\n');

const DISCIPLINE_BLOCK = [
  '## Dyscyplina pracy (wymóg YOUR_NAMEa — 8 reguł stałych)',
  '1. Twardy fakt = dowód. Konkretna liczba, ścieżka, data, status, port — podaj źródło (plik/polecenie) albo sprawdź live. Bez zmyślania zmiennego stanu.',
  '2. Decyzja czy działanie. Czytanie, liczenie, analiza, pisanie notatek = wolno sam. Zmiana stanu świata (edycja/kasowanie plików, config, usługi, deploy, publikacja, wydatek) = tylko po świeżym TAK YOUR_NAMEa.',
  '3. Retrospekcja po pracy. Po realnej pracy zapisz jeden zweryfikowany wniosek do memory/DZIŚ.md z datą, godziną i podpisem [BERNARD].',
  '4. Mapa dostępu. Dostępy: ACCESS-MAP.md (mapa wszystkich), BERNARD-ACCESS-INVENTORY.md (inwentarz), .env (wartości runtime). Cytuj ścieżkę, nigdy wartość; nie szukaj po dysku, nie wklejaj sekretów do pamięci ani na czat.',
  '5. Pełny dziennik zmian. Każdą czynność i każdą zmianę zapisujesz do notatki dziennej (memory/DZIŚ.md) z datą, godziną i podpisem [BERNARD]. Znasz każdą zmianę — po pracy potrafisz wymienić, co dokładnie się zmieniło (jaki plik, co i po co).',
  '6. Zero zmian w kodzie bez zgody. Nigdy nie wprowadzasz zmian w kodzie, programowaniu, konfiguracji ani plikach bez wyraźnego polecenia YOUR_NAMEa. Nawet gdy pracujecie nad czymś wspólnie i Ty kodujesz — zmianę, o którą YOUR_NAME nie prosił, zostawiasz nietkniętą. Bez świeżego TAK niczego nie zmieniasz.',
  '7. Weryfikacja przed i po każdej zmianie. Zanim edytujesz plik lub kod, sprawdź aktualny stan na świeżo — git status, git diff, przeczytaj plik. Nie edytuj ze starej wersji i nie nadpisuj zmian, których nie znasz (swoich ani Enzo/Charlie/auto-syncu). Po każdej zmianie zweryfikuj wynik — składnia, test, git diff — i dopiero wtedy przechodź dalej. Pracuj małymi, potwierdzonymi krokami, nie jednym wielkim skokiem.',
  '8. Zero placeholderów zamiast odpowiedzi. Narzędzie read ma dostęp tylko do Twojego katalogu roboczego — ścieżki poza nim (memory/, plugins/, /root/) wracają jako błąd sandboxa. Do takich plików używaj exec (cat/sed/grep), nigdy read. Gdy weryfikacja padła, NIE zwracaj pustego komunikatu-placeholdera (np. "sprawdzam i wracam", "coś mi się nie zgrało") — odpowiadaj od razu z tego, co masz w kontekście. Pusty placeholder nigdy nie jest odpowiedzią.',
].join('\n');

const TTS_VOICE_BLOCK = [
  '## Głos (TTS) — wymóg stały YOUR_NAMEa',
  '- Zawsze odpowiadaj tekstem i dodatkowo głosówką Marka (Microsoft, pl-PL-MarekNeural).',
  '- Tryb TTS: always — głosówka idzie przy każdej odpowiedzi, niezależnie czy YOUR_NAME pisze czy mówi głosem.',
  '- Dłuższe wypowiedzi skracaj do odsłuchu (limit ~1500 znaków), żeby nie czytać esejów.',
].join('\n');

const RECENT_EXCHANGE_PREFIX = '## Ostatnia wymiana (kontekst poprzedniej wiadomości)';

function clip(text, maxLen) {
  const value = String(text ?? '').trim();
  if (value.length <= maxLen) return value;
  const slice = value.slice(0, maxLen);
  const boundary = Math.max(
    slice.lastIndexOf('\n'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  );
  const cut = boundary > Math.floor(maxLen * 0.5) ? boundary + 1 : maxLen;
  return value.slice(0, cut).trim() + ' …';
}

// Wstrzykuje ostatnią wymianę (poprzednia wiadomość YOUR_NAMEa + poprzednia odpowiedź
// Bernarda), żeby krótkie "ok/git/zgoda" zawsze miało do czego się odnieść.
function buildRecentExchangeBlock(messages, currentPrompt) {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  const current = String(currentPrompt ?? '').trim();
  const users = [];
  let lastAssistant = '';
  for (const message of messages) {
    const role = String(message?.role ?? '').toLowerCase();
    const text = extractMessageText(message).trim();
    if (!text) continue;
    if (role === 'user') users.push(text);
    else if (role === 'assistant') lastAssistant = text;
  }
  let prevUser = users.length > 0 ? users[users.length - 1] : '';
  if (current && prevUser === current) {
    prevUser = users.length > 1 ? users[users.length - 2] : '';
  }
  if (!prevUser && !lastAssistant) return undefined;
  const lines = [RECENT_EXCHANGE_PREFIX];
  if (prevUser) lines.push(`- Poprzednio YOUR_NAME napisał: ${clip(prevUser, 1200)}`);
  if (lastAssistant) lines.push(`- Ja poprzednio odpowiedziałem (sedno): ${clip(lastAssistant, 700)}`);
  return lines.join('\n');
}

function warsawDate(offsetDays = 0) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  const base = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, '0');
  const day = String(base.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// „Do domknięcia" — raz na dobę, tylko przy pierwszej wiadomości dnia YOUR_NAMEa.
// Otwarte sprawy (zlecenia + follow-upy) czyta z kanonicznego źródła
// team-task-status.py --compact; obciążenie CPU z /proc/loadavg (bez podprocesu).
// Znacznik dnia w runtime/ gwarantuje ciszę do końca doby.
function buildDokomnieniaBlock(logger) {
  const marker = `${DOKOMNIECIA_DIR}/domkniecia-${warsawDate()}.flag`;
  if (existsSync(marker)) return undefined;
  let active = '';
  try {
    active = execFileSync('python3', [DOKOMNIECIA_SCRIPT, '--compact'], {
      encoding: 'utf8',
      timeout: 4000,
      maxBuffer: 4 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    logger.warn?.(`${PLUGIN_ID}: domkniecia source unavailable error=${error?.code ?? 'unknown'}`);
  }
  let cpuLine = '';
  try {
    const load = Number(String(readFileSync('/proc/loadavg', 'utf8')).trim().split(/\s+/)[0]);
    const cores = cpus().length || 1;
    if (Number.isFinite(load) && load > cores * 1.5) {
      cpuLine = `- ⚠️ Procesor przeciążony (load ${load} przy ${cores} rdzeniach).`;
    }
  } catch (error) {
    /* ignore */
  }
  try {
    writeFileSync(marker, `${new Date().toISOString()}\n`, { mode: 0o600 });
  } catch (error) {
    logger.warn?.(`${PLUGIN_ID}: domkniecia marker write failed error=${error?.code ?? 'unknown'}`);
  }
  const activeText = active ? active.replace(/^AKTYWNE:\s*/i, '') : '';
  const lines = ['## Do domknięcia (raz na dobę — pierwsza wiadomość dnia)'];
  if (activeText && !/^brak$/i.test(activeText)) {
    lines.push(`- Otwarte zobowiązania: ${activeText}`);
  } else {
    lines.push('- Brak aktywnych zleceń i follow-upów do domknięcia.');
  }
  if (cpuLine) lines.push(cpuLine);
  lines.push('- To Twoje jedyne przypomnienie dzisiaj. Wyjdź do YOUR_NAMEa sam z krótkim: „wiszą nam X sprawy — najpilniejsza to Y, proponuję Z".');
  return lines.join('\n');
}

// Fallback dla świeżej sesji (/new): gdy bieżąca historia jest pusta, sięgamy po
// ostatnią zapisaną wymianę YOUR_NAME↔Bernard z notatki dziennej. To ślad rozmowy
// (kontekst), nigdy dowód faktu — fakty i tak potwierdzam u źródła.
function buildRecentExchangeFromDailyNote(logger) {
  const root = '/path/to/YOUR_WORKSPACE/memory';
  for (let back = 0; back < 7; back++) {
    const path = `${root}/${warsawDate(back)}.md`;
    if (!existsSync(path)) continue;
    let content;
    try {
      content = readFileSync(path, 'utf8');
    } catch (error) {
      continue;
    }
    let lastUser = '';
    let lastAssistant = '';
    for (const line of content.split('\n')) {
      if (!line.includes('[auto:bernard] [rozmowa]')) continue;
      const pipeIdx = line.indexOf(' | A: ');
      if (pipeIdx === -1) continue;
      const userPart = line.slice(0, pipeIdx);
      let assistantPart = line.slice(pipeIdx + ' | A: '.length);
      assistantPart = assistantPart.replace(/\s*<!--\s*as:.*?-->\s*$/, '').trim();
      const userIdx = userPart.indexOf(' U: ');
      if (userIdx === -1) continue;
      lastUser = userPart.slice(userIdx + ' U: '.length).trim();
      lastAssistant = assistantPart;
    }
    if (lastUser || lastAssistant) {
      const lines = [RECENT_EXCHANGE_PREFIX];
      if (lastUser) lines.push(`- Poprzednio YOUR_NAME napisał: ${clip(lastUser, 1200)}`);
      if (lastAssistant) lines.push(`- Ja poprzednio odpowiedziałem (sedno): ${clip(lastAssistant, 700)}`);
      lines.push('- (Źródło: notatka dzienna, poprzednia sesja — kontekst, nie dowód faktu)');
      return lines.join('\n');
    }
  }
  return undefined;
}

function roadmapAgent(agentId) {
  const value = String(agentId ?? 'bernard').toLowerCase();
  return ({ bernard: 'Bernard', dexter: 'Dexter', polly: 'Polly' })[value];
}

function loadRoadmapContext(event, ctx, logger) {
  const agent = roadmapAgent(ctx.agentId);
  if (!agent) return undefined;
  try {
    const value = execFileSync('python3', [
      ROADMAP_SCRIPT,
      'context',
      '--agent', agent,
      '--cwd', String(ctx.workspaceDir ?? '/path/to/YOUR_WORKSPACE'),
      '--prompt', String(event.prompt ?? ''),
      '--mode', 'turn',
    ], {
      encoding: 'utf8',
      // Cold Python + concurrent gateway start can exceed 2.5 s. A missing
      // roadmap makes the model compensate with many expensive tool calls,
      // so prefer a bounded local wait over a costly context-free turn.
      timeout: 7000,
      maxBuffer: 16 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return value || undefined;
  } catch (error) {
    logger.warn?.(`${PLUGIN_ID}: roadmap context unavailable agent=${agent} error=${error?.code ?? 'unknown'}`);
    return undefined;
  }
}

function isBernard(agentId, sessionKey) {
  return String(agentId ?? '').toLowerCase() === 'bernard'
    || String(sessionKey ?? '').startsWith('agent:bernard:');
}

function shouldGuard(agentId, sessionKey) {
  return isBernard(agentId, sessionKey) || isCronSession(sessionKey);
}

function stateKey(runId) {
  return runId ? String(runId) : undefined;
}

function copyPayload(payload, text) {
  return {
    ...payload,
    text,
    mediaUrl: undefined,
    mediaUrls: [],
  };
}

function messageContainsToolCall(message) {
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) return true;
  if (!Array.isArray(message?.content)) return false;
  return message.content.some((block) => {
    const type = String(block?.type ?? '').toLowerCase();
    return type === 'toolcall' || type === 'tool_call' || type === 'tool_use';
  });
}



// Lekki strażnik weryfikacji: przy operacji zapisu pliku tylko PRZYPOMINA w logu
// (bez blokowania), żeby zweryfikować stan przed zmianą i wynik po zmianie.
const FILE_WRITE_INDICATORS = [
  /\bsed\s+(?:-i|--in-place)\b/i,
  /\btee\b/i,
  /\b(?:cp|mv|install|touch)\s+/i,
  /\bgit\s+(?:add|commit)\b/i,
  /\b(?:cat|echo|printf)\b[^;&|]*[12]?>/i,
  /(?:^|[\s;&|])[12&]?>>?\s*[^\s;&|]/,
];

function isFileWriteOperation(toolName, params) {
  if (String(toolName ?? '') !== 'exec') return false;
  const command = String(params?.command ?? '');
  if (!command) return false;
  return FILE_WRITE_INDICATORS.some((pattern) => pattern.test(command));
}

function saveConversationTrace({ agentId, sessionKey, runId, prompt, answer, workspaceDir }, logger) {
  const agent = String(agentId ?? '').toLowerCase();
  if (!['bernard', 'dexter', 'polly'].includes(agent) || isCronSession(sessionKey) || !String(answer ?? '').trim()) return;
  const payload = {
    hook_event_name: 'OpenClawReply',
    session_id: String(sessionKey ?? ''),
    turn_id: String(runId ?? ''),
    cwd: String(workspaceDir ?? '/path/to/YOUR_WORKSPACE'),
    user_message: String(prompt ?? ''),
    last_assistant_message: String(answer ?? ''),
  };
  try {
    execFileSync('python3', [
      AUTOSAVE_SCRIPT,
      '--agent', agent.toUpperCase(),
      '--source', 'openclaw',
    ], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 1500,
      maxBuffer: 4 * 1024,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
  } catch (error) {
    logger.warn?.(`${PLUGIN_ID}: shared conversation trace failed agent=${agent} error=${error?.code ?? 'unknown'}`);
  }
}

export default {
  id: PLUGIN_ID,
  name: 'Bernard Runtime Guard',
  description: 'Deterministic runtime guard plus fail-open shared team roadmap context.',
  register(api) {
    const runStates = new Map();
    const sessionStates = new Map();
    const promptStates = new Map();

    const cleanup = () => pruneStateMaps(runStates, sessionStates, Date.now(), STATE_TTL_MS);
    const resolveState = ({ runId, sessionKey }) => {
      cleanup();
      return (runId && runStates.get(String(runId)))
        || (sessionKey && sessionStates.get(String(sessionKey)));
    };

    api.on('before_prompt_build', (event, ctx) => {
      const promptKey = String(ctx.sessionKey ?? ctx.runId ?? '');
      const traceAgent = roadmapAgent(ctx.agentId);
      if (promptKey && traceAgent) {
        if (promptStates.size > 1000) promptStates.clear();
        promptStates.set(promptKey, String(event.prompt ?? ''));
      }
      const prependContext = loadRoadmapContext(event, ctx, api.logger);
      if (!prependContext) return;
      if (isBernard(ctx.agentId, ctx.sessionKey)) {
        const recent = buildRecentExchangeBlock(event.messages, event.prompt)
          || buildRecentExchangeFromDailyNote(api.logger);
        const blocks = [prependContext, PLAIN_STYLE_BLOCK, DISCIPLINE_BLOCK, TTS_VOICE_BLOCK];
        if (!isCronSession(ctx.sessionKey)) {
          const dokomnienia = buildDokomnieniaBlock(api.logger);
          if (dokomnienia) blocks.push(dokomnienia);
        }
        if (recent) blocks.push(recent);
        return { prependContext: blocks.join('\n\n') };
      }
      return { prependContext };
    });

    api.on('before_tool_call', (event, ctx) => {
      if (!isBernard(ctx.agentId, ctx.sessionKey)) return;
      if (isFileWriteOperation(event.toolName, event.params)) {
        api.logger.warn?.(`${PLUGIN_ID}: light-guard file-write tool=${event.toolName} — zweryfikuj stan przed zmianą i wynik po zmianie; nie nadpisuj cudzych zmian.`);
      }
      const state = resolveState({
        runId: event.runId ?? ctx.runId,
        sessionKey: ctx.sessionKey,
      });
      if (isUnknownProcessPoll(event.toolName, event.params, state)) {
        return {
          block: true,
          blockReason: `Nieznany identyfikator procesu. Dozwolone aktywne sesje: ${[...state.pendingProcesses.keys()].join(', ')}.`,
        };
      }
      if (!isGatewayMutationViaExec(event.toolName, event.params)) return;
      api.logger.warn?.(`${PLUGIN_ID}: blocked gateway mutation through exec run=${event.runId ?? ctx.runId ?? 'unknown'}`);
      return {
        block: true,
        blockReason: [
          'Restart/stop/start OpenClaw przez exec jest zablokowany.',
          'Po wyraźnej zgodzie YOUR_NAMEa użyj natywnego narzędzia gateway z action=restart, reason i note.',
          'Początkowe ok=true oznacza tylko zaplanowanie; zakończenie potwierdza dopiero post-restart sentinel lub świeży health probe.',
        ].join(' '),
      };
    });

    api.on('after_tool_call', (event, ctx) => {
      if (!isBernard(ctx.agentId, ctx.sessionKey)) return;
      const runId = stateKey(event.runId ?? ctx.runId);
      const sessionKey = String(ctx.sessionKey ?? '');
      let state = resolveState({ runId, sessionKey });
      if (!state || (runId && state.runId && state.runId !== runId)) {
        state = createRunState({ runId, sessionKey });
      }
      applyToolObservation(state, analyzeToolResult({
        toolName: event.toolName,
        params: event.params,
        result: event.result,
        error: event.error,
      }));
      if (runId) runStates.set(runId, state);
      if (sessionKey) sessionStates.set(sessionKey, state);
    });

    // Pusty wynik narzędzia dostaje jawny opis, ZANIM trafi do transkryptu.
    // Celowo bez `shouldGuard` — cisza narzędzia zatruwa każdego agenta tak samo,
    // a ta zmiana wyłącznie dokłada informację, nigdy nie usuwa treści.
    api.on('tool_result_persist', (event, ctx) => {
      const message = event?.message;
      if (!message) return;
      const toolName = event.toolName ?? ctx?.toolName;
      const replacement = describeEmptyToolResult({
        toolName,
        text: extractMessageText(message),
      });
      if (!replacement) return;
      api.logger.warn?.(`${PLUGIN_ID}: empty tool result made explicit tool=${toolName ?? 'unknown'} session=${ctx?.sessionKey ?? 'unknown'}`);
      return { message: replaceMessageText(message, replacement) };
    });

    api.on('before_agent_finalize', (event, ctx) => {
      const candidateSessionKey = String(event.sessionKey ?? ctx.sessionKey ?? '');
      if (!shouldGuard(ctx.agentId, candidateSessionKey)) return;
      const runId = stateKey(event.runId ?? ctx.runId);
      const sessionKey = candidateSessionKey;
      let state = resolveState({ runId, sessionKey });
      if (!state || state.observations.length === 0) {
        state = stateFromMessages(event.messages, { runId, sessionKey });
      }
      const text = String(event.lastAssistantMessage ?? '');
      const violations = evaluateViolations(state, text, sessionKey);
      if (violations.length === 0) return;
      api.logger.warn?.(`${PLUGIN_ID}: revise run=${runId ?? 'unknown'} violations=${violations.join(',')}`);
      return {
        action: 'revise',
        reason: violations.join(','),
        retry: {
          instruction: revisionInstruction(violations, state, sessionKey),
          idempotencyKey: `${PLUGIN_ID}:${runId ?? sessionKey}:${violations.join('+')}`,
          maxAttempts: 2,
        },
      };
    });

    api.on('before_message_write', (event, ctx) => {
      const sessionKey = String(event.sessionKey ?? ctx.sessionKey ?? '');
      const agentId = event.agentId ?? ctx.agentId;
      const guarded = shouldGuard(agentId, sessionKey);
      if (event.message?.role !== 'assistant') return;
      // Nie zamieniaj komunikatu pośredniego, który niesie wywołanie narzędzia.
      // Finalna odpowiedź ma osobny revise + outbound gate.
      if (messageContainsToolCall(event.message)) return;
      const originalText = extractMessageText(event.message);
      if (!guarded) {
        saveConversationTrace({
          agentId,
          sessionKey,
          runId: event.runId ?? ctx.runId,
          prompt: promptStates.get(sessionKey) ?? '',
          answer: originalText,
          workspaceDir: ctx.workspaceDir,
        }, api.logger);
        promptStates.delete(sessionKey);
        return;
      }
      const state = resolveState({ sessionKey });
      const violations = evaluateViolations(state, originalText, sessionKey);
      const finalText = violations.length === 0 ? originalText : safeReplacement(violations, state, sessionKey);
      saveConversationTrace({
        agentId,
        sessionKey,
        runId: event.runId ?? ctx.runId,
        prompt: promptStates.get(sessionKey) ?? '',
        answer: finalText,
        workspaceDir: ctx.workspaceDir,
      }, api.logger);
      promptStates.delete(sessionKey);
      if (violations.length === 0) return;
      api.logger.warn?.(`${PLUGIN_ID}: rewrote transcript message session=${sessionKey} violations=${violations.join(',')}`);
      return {
        message: replaceMessageText(event.message, finalText),
      };
    });

    api.on('reply_payload_sending', (event, ctx) => {
      const agentId = event.usageState?.agentId;
      const sessionKey = String(event.sessionKey ?? ctx.sessionKey ?? '');
      if (!shouldGuard(agentId, sessionKey)) return;
      const state = resolveState({ runId: event.runId, sessionKey });
      const text = String(event.payload?.text ?? '');
      const violations = evaluateViolations(state, text, sessionKey);
      if (violations.length === 0) return;
      api.logger.warn?.(`${PLUGIN_ID}: rewrote outbound kind=${event.kind} run=${event.runId ?? 'unknown'} violations=${violations.join(',')}`);
      return {
        payload: copyPayload(event.payload, safeReplacement(violations, state, sessionKey)),
        reason: violations.join(','),
      };
    });

    api.logger.info?.(`${PLUGIN_ID}: active`);
  },
};
