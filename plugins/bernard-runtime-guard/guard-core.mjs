// Wykrywanie fałszywego twierdzenia „wynik narzędzia jest obrazkiem".
//
// Poprzednia wersja wymagała czasownika z zamkniętej listy (wraca|zwraca|jest|są…),
// przez co przepuszczała „exec LĄDUJE jako obrazek" i „output IDZIE jako obrazek"
// — dokładnie te zdania, którymi Bernard zapętlił się 30.07.2026.
// Zamiast gry w kotka i myszkę z czasownikami sprawdzamy BLISKOŚĆ POJĘĆ:
// w jednym zdaniu występuje słowo o obrazie ORAZ słowo o wyniku narzędzia.
const MEDIA_WORD = /\b(?:obraz(?:ek|ka|ki|kiem|kach|kami|em|ów|y)?|image(?:s)?|grafik(?:a|ę|i|ą))\b/iu;
const TOOL_OUTPUT_WORD = /\b(?:output\w*|wynik\w*|rezultat\w*|narz[eę]dzi\w*|exec|read|terminal\w*|konsol\w*|stdout|tool(?:s)?|wyj[śs]ci\w*|linijk\w*|lini[aęi]|odpowied[źzi]\w*|komend\w*|log(?:i|[oó]w|ach)?)\b/iu;

// Zdania o TWORZENIU grafiki są legalne (topik ImageBR, zlecenia dla Enzo/Polly).
// Bez tego wyjątku strażnik blokowałby normalną pracę nad „Braćmi Ratownikami".
// „Wszystko idzie jako obrazki" — zdanie zbiorcze, w którym podmiotem jest całość
// pracy agenta, a nie nazwany wynik narzędzia. Bernard użył go 30.07 o 14:30.
const BLANKET_MEDIA_PATTERN = /\b(?:wszystko|wszystkie|ka[żz]d\w+|nic)\b[^.!?]{0,60}\b(?:idzie|id[ąa]|l[ąa]duj\w*|wraca\w*|zwraca\w*|jest|s[ąa]|renderuj\w*|wychodz\w*|przychodz\w*|wygl[ąa]da\w*)\b[^.!?]{0,40}\b(?:obraz\w*|image\w*)\b/iu;

// Rozmowa O incydencie to nie jest twierdzenie, że incydent trwa. Bez tego wyjątku
// strażnik przepisywałby zdania typu „sprawdzam, czy bug z obrazkami nadal występuje"
// i Bernard nie mógłby zreferować YOUR_NAMEowi własnej sprawy ani przeczytać raportu.
const MEDIA_DISCUSSION_MARKERS = /\b(?:sprawdz\w*|zweryfikuj\w*|weryfikacj\w*|bug z obrazk\w*|rzekom\w*|podobno|halucynacj\w*|konfabulacj\w*|nie istnia[łl]\w*|nie istnieje|fa[łl]szyw\w*|analiz\w*|raport\w*|incydent\w*|twierdzi[łl]\w*)\b/iu;

const MEDIA_WORK_MARKERS = /\b(?:wygeneruj|generuj\w*|generacj\w*|stw[oó]rz|zr[oó]b|narysuj|prompt\w*|koncepcj\w*|referencj\w*|logo|okładk\w*|render(?:uj|ing)\w*\s+postaci|posta[ćci]\w*)\b/iu;

const CORRECTION_MARKERS = /\b(?:b[łl][eę]dn\w*|nieprawd\w*|odrzucon\w*|sprostowan\w*|typ(?:em)?\s+text|tekstow\w*|image\s*:\s*0|blok(?:ów|i)?\s+image\s*:\s*0)\b/iu;
const PENDING_MARKERS = /\b(?:nadal|wci[ąa][żz]|jeszcze)\b.{0,40}\b(?:trwa|dzia[łl]a|running|uruchomion\w*)\b|\b(?:czekam|polluj[eę]|sprawdzam status|nie potwierdzam)\b/iu;
const COMPLETION_PATTERNS = [
  /\b(?:gotowe|zrobione|wykonane|zako[ńn]czone|sko[ńn]czone|completed|finished|done)\b/iu,
  /\b(?:gateway|brama|us[łl]uga|serwis|proces)\b.{0,80}\b(?:po restarcie|zrestartowan\w*|uruchomion\w*|dzia[łl]a|gotow\w*)\b/iu,
  /\b(?:po restarcie|after (?:the )?restart)\b/iu,
  /\brestart\w*\b.{0,80}\b(?:nie pom[óo]g[łl]?|pom[óo]g[łl]?|zako[ńn]cz\w*|wykonan\w*|gotow\w*)\b/iu,
];

const EXEC_GATEWAY_MUTATION_PATTERNS = [
  /\bopenclaw\s+gateway\s+(?:restart|stop|start)\b/iu,
  /\bsystemctl(?:\s+--user)?\s+(?:restart|stop|start)\s+(?:openclaw(?:-vps|-gateway)?)(?:\.service)?\b/iu,
  /\bservice\s+(?:openclaw(?:-vps|-gateway)?)\s+(?:restart|stop|start)\b/iu,
];

const CRON_REFUSAL_PATTERNS = [
  /\bnie jestem w stanie\b/iu,
  /\bnie mog(?:[eę]|[łl]em|[łl]am)\s+(?:przygotowa[ćc]|wykona[ćc]|uko[ńn]czy[ćc]|dostarczy[ćc]|zrealizowa[ćc])/iu,
  /\bnie uda[łl]o\s+(?:mi\s+)?si[eę][\s\S]{0,120}(?:przygotowa|wykona|uko[ńn]czy|dostarczy|zrealizowa|raport|skr[oó]t)/iu,
  /\b(?:cannot|can't|unable to)\s+(?:prepare|complete|execute|deliver|finish)\b/iu,
];

const CRON_IDS = {
  validators: 'YOUR_CRON_ID_VALIDATORS',
  doctor: 'YOUR_CRON_ID_DOCTOR',
  memory: 'YOUR_CRON_ID_MEMORY',
  research: 'YOUR_CRON_ID_RESEARCH',
  planner: 'YOUR_CRON_ID_PLANNER',
  media: 'YOUR_CRON_ID_MEDIA',
};

export function isCronSession(sessionKey) {
  return String(sessionKey ?? '').includes(':cron:');
}

export function claimsCronRefusal(text) {
  return CRON_REFUSAL_PATTERNS.some((pattern) => pattern.test(String(text ?? '')));
}

const CRON_PENDING_REPORT = /(?:command|process|polecenie|proces).{0,80}(?:still running|nadal (?:dzia[łl]a|trwa))|(?:i need to wait|cannot proceed until|musz[eę] (?:poczeka[ćc]|zaczeka[ćc]))/isu;

export function cronReportComplete(sessionKey, text) {
  const key = String(sessionKey ?? '');
  const value = String(text ?? '').trim();
  if (!value || CRON_PENDING_REPORT.test(value)) return false;
  let required = [];
  if (key.includes(CRON_IDS.research)) {
    required = [/^📰/u, /₿ Krypto/u, /🌍 Świat/u, /⚔️ Geopolityka/u, /🤖 AI/u, /📊 Nastrój/u, /Dane .*ostatnich 24/iu];
  } else if (key.includes(CRON_IDS.media)) {
    required = [/^📣/u, /📱 Meta/u, /🎬 Google Ads i YouTube/u, /🎵 TikTok/u, /💡 Trendy i strategia/u, /🎯 Do przetestowania/u, /Dane .*ostatnich 24/iu];
  } else if (key.includes(CRON_IDS.planner)) {
    required = [/^🩷 Dziś na tapecie/u];
  } else if (key.includes(CRON_IDS.memory)) {
    required = [/^🧠 MemorySpectra/u, /Zapamiętane/u, /Otwarte/u, /Jutro/u];
  } else if (key.includes(CRON_IDS.doctor)) {
    required = [/^🖧 Doktor/u, /⚙️ Serwer/u, /🩺 Zdrowie/u, /🧹 Porządek/u, /🤖 Zespół/u];
  } else if (key.includes(CRON_IDS.validators)) {
    required = [/^🖥️ Walidatory X1/u, /Praca:/u, /Błędy:/u, /Alerty:/u, /Zarobek:/u, /Stake:/u, /ostatnich 24/iu, /Wniosek:/u];
  }
  return required.length > 0 && required.every((pattern) => pattern.test(value));
}

function warsawDate() {
  const parts = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    short: `${get('day')}.${get('month')}`,
    full: `${get('day')}.${get('month')}.${get('year')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

export function cronFallback(sessionKey) {
  const key = String(sessionKey ?? '');
  const now = warsawDate();
  if (key.includes(CRON_IDS.research)) {
    return [
      `📰 **Poranny skrót — ${now.full}**`,
      '',
      'Ceny: N/D',
      '',
      '**₿ Krypto**',
      '- Brak potwierdzonych nowych informacji z ostatnich 24 h.',
      '**🌍 Świat**',
      '- Brak potwierdzonych nowych informacji z ostatnich 24 h.',
      '**⚔️ Geopolityka**',
      '- Brak potwierdzonych nowych informacji z ostatnich 24 h.',
      '**🤖 AI**',
      '- Brak potwierdzonych nowych informacji z ostatnich 24 h.',
      '',
      '📊 Nastrój: N/D — raport częściowy, bez zgadywania.',
      `Dane z ostatnich 24h, stan na ${now.full} ${now.time}`,
    ].join('\n');
  }
  if (key.includes(CRON_IDS.media)) {
    return [
      `📣 **Reklama i social — ${now.full}**`,
      '',
      '**📱 Meta (FB + IG)**',
      '- Brak potwierdzonych nowych informacji.',
      '**🎬 Google Ads i YouTube**',
      '- Brak potwierdzonych nowych informacji.',
      '**🎵 TikTok**',
      '- Brak potwierdzonych nowych informacji.',
      '**💡 Trendy i strategia**',
      '- Brak potwierdzonych nowych informacji.',
      '🎯 Do przetestowania: dziś bez rekomendacji — brak potwierdzonej zmiany z ostatnich 24 godzin.',
      `Dane wyłącznie z ostatnich 24 godzin, stan na ${now.full} ${now.time}`,
    ].join('\n');
  }
  if (key.includes(CRON_IDS.planner)) {
    return `🩷 Dziś na tapecie — ${now.short}\n\nCzysto — brak potwierdzonych pozycji do pokazania.`;
  }
  if (key.includes(CRON_IDS.memory)) {
    return `🧠 MemorySpectra — ${now.full}\n- Zapamiętane: nic nowego.\n- Otwarte: brak potwierdzonych danych.\n- Jutro: ponowić zwykły cykl pamięci.`;
  }
  if (key.includes(CRON_IDS.doctor)) {
    return `🖧 Doktor — ${now.short}\n\n⚙️ Serwer — N/D.\n🩺 Zdrowie — N/D.\n🧹 Porządek — N/D.\n🤖 Zespół — N/D.\n\n⚠️ Do zrobienia\n• Powtórzyć pomiar w następnym cyklu.`;
  }
  if (key.includes(CRON_IDS.validators)) {
    return [
      `🖥️ Walidatory X1 — ${now.full} ${now.time}`,
      '',
      'Praca: N/D.',
      'Błędy: N/D.',
      'Alerty: 🚨 ALERT — brak kompletu danych; ponowić odczyt bez zmian live.',
      'Zarobek: N/D.',
      'Stake: N/D.',
      'Grupa X1 (24 h): dane niedostępne.',
      'Wniosek: raport częściowy, bez zgadywania.',
    ].join('\n');
  }
  return 'Raport automatyczny ukończony częściowo. Brakujące pola oznaczono jako N/D; nie zgaduję danych.';
}

function splitClaims(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\r?\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function claimsTextToolOutputIsImage(text) {
  return splitClaims(text).some((claim) => {
    if (CORRECTION_MARKERS.test(claim)) return false;
    if (MEDIA_WORK_MARKERS.test(claim)) return false;
    if (MEDIA_DISCUSSION_MARKERS.test(claim)) return false;
    if (MEDIA_WORD.test(claim) && TOOL_OUTPUT_WORD.test(claim)) return true;
    // Zdania zbiorcze bez rzeczownika o wyniku: „Wszystko idzie jako obrazki."
    return BLANKET_MEDIA_PATTERN.test(claim);
  });
}

/** Czy w tym przebiegu narzędzia faktycznie zwróciły choć jeden blok obrazu. */
export function stateHasImageToolResults(state) {
  if (!state) return false;
  return state.observations.reduce((sum, item) => sum + (item.imageBlockCount ?? 0), 0) > 0;
}

export function claimsPendingProcessCompleted(text) {
  const value = String(text ?? '');
  if (PENDING_MARKERS.test(value) && !COMPLETION_PATTERNS.some((pattern) => pattern.test(value))) {
    return false;
  }
  if (/\b(?:nie|brak)\s+(?:potwierdzenia|pewno[śs]ci)\b/iu.test(value)) return false;
  return COMPLETION_PATTERNS.some((pattern) => pattern.test(value));
}

export function isGatewayMutationViaExec(toolName, params) {
  if (String(toolName ?? '').toLowerCase() !== 'exec') return false;
  const record = asRecord(params) ?? {};
  const command = [record.command, record.cmd]
    .filter((value) => typeof value === 'string')
    .join('\n');
  return EXEC_GATEWAY_MUTATION_PATTERNS.some((pattern) => pattern.test(command));
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function contentBlocks(result) {
  if (typeof result === 'string') return [{ type: 'text', text: result }];
  if (Array.isArray(result)) return result;
  const record = asRecord(result);
  if (!record) return [];
  if (typeof record.content === 'string') return [{ type: 'text', text: record.content }];
  return Array.isArray(record.content) ? record.content : [];
}

function blockType(block) {
  if (typeof block === 'string') return 'text';
  const record = asRecord(block);
  if (!record) return 'unknown';
  if (typeof record.type === 'string') return record.type.toLowerCase();
  if ('image_url' in record || 'imageUrl' in record) return 'image';
  return 'unknown';
}

function resultDetails(result) {
  const record = asRecord(result);
  return asRecord(record?.details) ?? record;
}

function firstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim();
}

function firstExitCode(...values) {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return undefined;
}

export function analyzeToolResult({ toolName, params, result, error }) {
  const blocks = contentBlocks(result);
  const types = blocks.map(blockType);
  const details = resultDetails(result);
  const paramRecord = asRecord(params) ?? {};
  const status = firstString(details?.status, paramRecord.status)?.toLowerCase();
  const sessionId = firstString(
    details?.sessionId,
    details?.session_id,
    paramRecord.sessionId,
    paramRecord.session_id,
    paramRecord.id,
  );
  const text = blocks
    .map((block) => typeof block === 'string' ? block : String(asRecord(block)?.text ?? ''))
    .filter(Boolean)
    .join('\n');
  const textSaysRunning = /\bCommand still running\b|\bProcess still running\b/iu.test(text);
  const textSaysTerminal = /\bProcess exited with (?:code|signal)\b|\bProcess failed\b/iu.test(text);
  const textExitMatch = text.match(/\bProcess exited with code\s+(-?\d+)\b/iu);
  const exitCode = firstExitCode(details?.exitCode, details?.exit_code, textExitMatch?.[1]);

  return {
    toolName: String(toolName ?? ''),
    blockCount: blocks.length,
    textBlockCount: types.filter((type) => type === 'text').length,
    imageBlockCount: types.filter((type) => type === 'image').length,
    nonTextBlockCount: types.filter((type) => type !== 'text').length,
    status: status ?? (textSaysRunning ? 'running' : textSaysTerminal ? 'completed' : undefined),
    sessionId,
    exitCode,
    error: error ? String(error) : undefined,
  };
}

export function createRunState({ runId, sessionKey, now = Date.now() } = {}) {
  return {
    runId: runId ? String(runId) : undefined,
    sessionKey: sessionKey ? String(sessionKey) : undefined,
    observations: [],
    pendingProcesses: new Map(),
    failedProcesses: new Map(),
    createdAt: now,
    updatedAt: now,
  };
}

export function applyToolObservation(state, observation, now = Date.now()) {
  state.observations.push(observation);
  if (state.observations.length > 64) state.observations.shift();
  state.updatedAt = now;

  const toolName = String(observation.toolName ?? '').toLowerCase();
  const status = String(observation.status ?? '').toLowerCase();
  const sessionId = observation.sessionId;

  if (status === 'running' && sessionId) {
    state.pendingProcesses.set(sessionId, {
      toolName,
      since: now,
    });
    state.failedProcesses.delete(sessionId);
  } else if (toolName === 'process' && sessionId && (status === 'completed' || status === 'failed')) {
    if (observation.exitCode === 0 && !observation.error && status !== 'failed') {
      state.pendingProcesses.delete(sessionId);
      state.failedProcesses.delete(sessionId);
    } else {
      state.pendingProcesses.delete(sessionId);
      state.failedProcesses.set(sessionId, {
        exitCode: observation.exitCode,
        error: observation.error,
        since: now,
      });
    }
  }
  return state;
}

export function stateHasOnlyTextToolResults(state) {
  const textBlocks = state.observations.reduce((sum, item) => sum + item.textBlockCount, 0);
  const imageBlocks = state.observations.reduce((sum, item) => sum + (item.imageBlockCount ?? 0), 0);
  return textBlocks > 0 && imageBlocks === 0;
}

export function isUnknownProcessPoll(toolName, params, state) {
  if (String(toolName ?? '').toLowerCase() !== 'process' || !state) return false;
  const record = asRecord(params) ?? {};
  const action = String(record.action ?? '').toLowerCase();
  if (!['poll', 'log', 'write', 'kill'].includes(action)) return false;
  const sessionId = firstString(record.sessionId, record.session_id, record.id);
  return Boolean(sessionId && state.pendingProcesses.size > 0 && !state.pendingProcesses.has(sessionId));
}

export function evaluateViolations(state, text, sessionKey = '') {
  const violations = [];
  const effectiveSessionKey = String(sessionKey || state?.sessionKey || '');
  if (isCronSession(effectiveSessionKey) && claimsCronRefusal(text)) {
    violations.push('cron_refusal');
  }
  if (
    isCronSession(effectiveSessionKey)
    && !claimsCronRefusal(text)
    && !cronReportComplete(effectiveSessionKey, text)
  ) {
    violations.push('cron_incomplete');
  }
  // Domyślnie zakładamy, że twierdzenie „wynik narzędzia to obrazek" jest FAŁSZYWE.
  // Wcześniej wymagaliśmy dowodu w postaci stanu przebiegu (`state`), więc gdy stanu
  // brakowało — a tak było 30.07 — reguła w ogóle nie działała. Teraz odwrotnie:
  // twierdzenie przechodzi tylko wtedy, gdy mamy POZYTYWNY dowód na bloki obrazu.
  if (claimsTextToolOutputIsImage(text) && !stateHasImageToolResults(state)) {
    violations.push('text_output_claimed_as_image');
  }
  if (!state) return violations;
  if (state.pendingProcesses.size > 0 && claimsPendingProcessCompleted(text)) {
    violations.push('running_process_claimed_complete');
  }
  if (state.failedProcesses.size > 0 && claimsPendingProcessCompleted(text)) {
    violations.push('failed_process_claimed_complete');
  }
  return violations;
}

export function revisionInstruction(violations, state, sessionKey = '') {
  const parts = [
    'Popraw odpowiedź na podstawie strukturalnych wyników narzędzi, które są źródłem prawdy.',
  ];
  if (violations.includes('text_output_claimed_as_image')) {
    parts.push('Wszystkie bloki wyników narzędzi w tym przebiegu mają type=text; nie wolno twierdzić, że są obrazkami ani że tekstu nie da się odczytać. Odczytaj widoczny tekst i podaj rzeczywisty wynik lub błąd.');
  }
  if (violations.includes('running_process_claimed_complete')) {
    const ids = [...state.pendingProcesses.keys()].join(', ');
    parts.push(`Proces nadal ma status running (${ids}). Użyj process action=poll dla wskazanej sesji aż wynik będzie terminalny; dopiero wtedy wolno potwierdzić zakończenie. Status completed wymaga exitCode=0.`);
  }
  if (violations.includes('failed_process_claimed_complete')) {
    const details = [...state.failedProcesses.entries()]
      .map(([id, item]) => `${id}: exitCode=${item.exitCode ?? 'N/D'}`)
      .join(', ');
    parts.push(`Proces zakończył się błędem (${details}). Nie wolno ogłaszać sukcesu; podaj rzeczywisty błąd i następny bezpieczny krok.`);
  }
  if (violations.includes('cron_refusal')) {
    parts.push('Cron nie może kończyć się odmową. Oddaj raport w wymaganym układzie; zachowaj potwierdzone dane, a każde brakujące pole oznacz „brak potwierdzonych danych” lub „N/D”. Nie przepraszaj i nie opisuj prób.');
  }
  if (violations.includes('cron_refusal')) {
    parts.push('Nie powtarzaj odmowy. Zakończ wiadomość kompletnym raportem częściowym.');
  } else if (violations.includes('cron_incomplete')) {
    if (state?.pendingProcesses?.size > 0) {
      const ids = [...state.pendingProcesses.keys()].join(', ');
      parts.push(`Finał crona jest niepełny, a proces nadal działa (${ids}). Użyj process action=poll dla tego identyfikatora, odbierz wynik terminalny i dopiero wtedy przygotuj cały wymagany raport.`);
    } else {
      parts.push('Finał crona nie ma wymaganego układu. Nie dodawaj wstępu, separatora, komentarza ani informacji o swojej pracy. Jeśli nie masz terminalnych danych, zwróć DOKŁADNIE poniższy bezpieczny raport częściowy:');
      parts.push(cronFallback(sessionKey || state?.sessionKey));
    }
    parts.push('Zakończ wiadomość wyłącznie pełnym raportem częściowym lub pełnym raportem z danych.');
  } else {
    parts.push('Nie powtarzaj zakwestionowanej diagnozy. Jeśli nie możesz dokończyć, podaj dokładny, potwierdzony blocker.');
  }
  return parts.join(' ');
}

export function safeReplacement(violations, state, sessionKey = '') {
  if (violations.includes('cron_refusal') || violations.includes('cron_incomplete')) {
    return cronFallback(sessionKey || state?.sessionKey);
  }
  // Decyzja YOUR_NAMEa (16.08): YOUR_NAME dostaje krótką, ludzką wiadomość — ale z
  // konkretnymi faktami naruszenia (reguła 8: zero placeholderów). Szczegóły
  // naruszenia zostają w logu (api.logger), a model w ścieżce revise dostaje
  // pełną instrukcję przez revisionInstruction.
  const parts = [];
  if (violations.includes('text_output_claimed_as_image')) {
    parts.push('Wynik narzędzia w tym przebiegu ma postać tekstu — podaję fakty z tego tekstu, nie obrazek.');
  }
  if (violations.includes('running_process_claimed_complete')) {
    const ids = [...(state?.pendingProcesses?.keys() ?? [])].join(', ');
    parts.push(`Proces ${ids || 'w tle'} nadal ma status running — czekam na wynik terminalny (exitCode), zanim potwierdzę zakończenie.`);
  }
  if (violations.includes('failed_process_claimed_complete')) {
    const details = [...(state?.failedProcesses?.entries() ?? [])]
      .map(([id, item]) => `${id}: exitCode=${item.exitCode ?? 'N/D'}`)
      .join(', ');
    parts.push(`Proces zakończył się błędem (${details || 'N/D'}) — nie ogłaszam sukcesu.`);
  }
  if (parts.length === 0) {
    parts.push('Wykryto niezgodność w odpowiedzi — poprawiam na podstawie wyników narzędzi.');
  }
  return parts.join(' ');
}

/**
 * Zamienia niemy, pusty wynik narzędzia w jawny komunikat o braku danych.
 *
 * Powód (analiza 2026-07-31): Bernard dostał `(no output recorded)` po tym, jak
 * `openclaw status` (trwający 28–59 s) został ubity timeoutem 10 s. Pusty wynik
 * nie niesie ŻADNEJ informacji, więc model wypełnił lukę najbliższą narracją
 * z kontekstu — i tak narodził się nieistniejący „bug z obrazkami".
 *
 * Zasada: w tym systemie cisza narzędzia jest groźniejsza niż jego błąd.
 * Błąd model przeczyta i zaraportuje; pustkę — wypełni zmyśleniem.
 *
 * Zwraca tekst zastępczy albo null, gdy wynik zawiera realną treść.
 */
export function describeEmptyToolResult({ toolName, text }) {
  const value = String(text ?? '').trim();
  const name = String(toolName ?? '').trim() || 'narzędzie';

  const signal = value.match(/Process exited with signal\s+(\w+)/iu)?.[1];
  const exitCode = value.match(/Process exited with code\s+(-?\d+)/iu)?.[1];

  // Czy po odjęciu samych metakomunikatów zostaje jakakolwiek treść?
  const payload = value
    .replace(/Process exited with (?:code|signal)[^\n]*/giu, '')
    .replace(/\(no (?:new )?output(?: recorded)?\)/giu, '')
    .replace(/Process (?:failed|still running)[^\n]*/giu, '')
    .trim();
  if (payload.length > 0) return null;

  // „Command still running" to sensowna informacja o stanie — nie dotykamy jej.
  if (/\b(?:Command|Process) still running\b/iu.test(value)) return null;

  const lines = [`BRAK OUTPUTU — narzędzie \`${name}\` nie zwróciło żadnej treści.`];

  if (signal) {
    lines.push(`Proces został przerwany sygnałem ${signal.toUpperCase()} — najczęściej oznacza to timeout ustawiony za krótko względem czasu pracy komendy, a NIE błąd komendy.`);
    lines.push('Komenda mogła zdążyć wykonać pracę; jej wynik przepadł razem z ubitym procesem.');
  } else if (exitCode !== undefined) {
    lines.push(`Proces zakończył się kodem ${exitCode}, nie wypisując nic na wyjście.`);
  } else {
    lines.push('Proces zakończył się bez żadnego wyjścia.');
  }

  lines.push('To jest POTWIERDZONY BRAK DANYCH. Nie jest to obrazek, nie jest to błąd renderowania i nie jest to awaria gatewaya.');
  lines.push('Nie zgaduj, co ta komenda mogła zwrócić, i nie wyciągaj z tego żadnej diagnozy. Powtórz ją z wyraźnie dłuższym timeoutem albo zgłoś konkretny blocker.');

  return lines.join('\n');
}

export function extractMessageText(message) {
  const record = asRecord(message);
  if (!record) return '';
  if (typeof record.content === 'string') return record.content;
  if (!Array.isArray(record.content)) return '';
  return record.content
    .map((block) => typeof block === 'string' ? block : String(asRecord(block)?.text ?? ''))
    .filter(Boolean)
    .join('\n');
}

export function replaceMessageText(message, replacement) {
  const record = asRecord(message);
  if (!record) return message;
  if (typeof record.content === 'string') return { ...record, content: replacement };
  if (!Array.isArray(record.content)) return { ...record, content: [{ type: 'text', text: replacement }] };

  let replaced = false;
  const content = record.content.map((block) => {
    const item = asRecord(block);
    if (!item || item.type !== 'text') return block;
    if (replaced) return { ...item, text: '' };
    replaced = true;
    return { ...item, text: replacement };
  });
  if (!replaced) content.unshift({ type: 'text', text: replacement });
  return { ...record, content };
}

export function stateFromMessages(messages, meta = {}) {
  if (!Array.isArray(messages)) return createRunState(meta);
  let start = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (asRecord(messages[index])?.role === 'user') {
      start = index + 1;
      break;
    }
  }
  const state = createRunState(meta);
  for (const message of messages.slice(start)) {
    const record = asRecord(message);
    if (record?.role !== 'toolResult') continue;
    applyToolObservation(state, analyzeToolResult({
      toolName: record.toolName,
      params: {},
      result: {
        content: record.content,
        details: record.details,
      },
      error: record.isError ? 'tool result error' : undefined,
    }));
  }
  return state;
}

export function pruneStateMaps(runStates, sessionStates, now = Date.now(), ttlMs = 30 * 60 * 1000) {
  for (const [key, state] of runStates) {
    if (now - state.updatedAt > ttlMs) runStates.delete(key);
  }
  for (const [key, state] of sessionStates) {
    if (now - state.updatedAt > ttlMs) sessionStates.delete(key);
  }
}
