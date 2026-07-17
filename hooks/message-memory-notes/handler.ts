import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Po zapisie notatki: natychmiastowy, nieblokujący push na GitHub (flock w skrypcie
// serializuje, więc wiele wiadomości nie robi pileup). [CLAUDE 2026-07-13]
function triggerSync(): void {
  try {
    const child = spawn('/root/.openclaw/sync-now.sh', [], {
      detached: true, stdio: 'ignore',
    });
    child.unref();
  } catch { /* sync to backup, nie blokuj odpowiedzi */ }
}

const filename = fileURLToPath(import.meta.url);
const hookDir = path.dirname(filename);
// Managed hook (~/.openclaw/hooks) obsługuje CAŁY zespół — pisze do JEDNEJ wspólnej
// pamięci zespołu, nie względem lokalizacji hooka. [CLAUDE 2026-07-12]
const TEAM_WORKSPACE = '/root/.openclaw/workspace';
const workspaceDir = TEAM_WORKSPACE;
const memoryDir = path.join(workspaceDir, 'memory');
const sortedMemoryDir = path.join(memoryDir, 'sorted');
const processChangelogFile = path.join(workspaceDir, 'PROCESS-CHANGELOG.md');
const LOCAL_TIME_ZONE = 'Europe/Warsaw';

function asDate(value: unknown): Date {
  const d = value ? new Date(String(value)) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function dateKey(value: unknown): string {
  const d = asDate(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function timeKey(value: unknown): string {
  const d = asDate(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LOCAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function clip(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function redactSensitive(text: string): string {
  return text
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{24,}\b/g, '[REDACTED_TELEGRAM_TOKEN]')
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED_LONG_TOKEN]')
    .replace(/\b[a-z]{4}\s[a-z]{4}\s[a-z]{4}\s[a-z]{4}\b/g, '[REDACTED_APP_PASSWORD]')
    .replace(/(?<=password[:=\s])\S+/gi, '[REDACTED_PASSWORD]')
    .replace(/(?<=has[łl]o[:=\s])\S+/gi, '[REDACTED_PASSWORD]')
    .replace(/(?<=token[:=\s])\S+/gi, '[REDACTED_TOKEN]')
    .replace(/(?<=secret[:=\s])\S+/gi, '[REDACTED_SECRET]')
    .replace(/(?<=klucz[:=\s])\S+/gi, '[REDACTED_KEY]');
}

function classifyTags(text: string): string[] {
  const tags: string[] = [];
  const hasDecision = /\b(decyzja|ustalamy|zatwierdzam|zaakceptowane|wybieram|nie rób|czekaj|najpierw zapytaj)\b/i.test(text);
  const hasCodex = /\b(codex|agent max|max|\/codex|job)\b/i.test(text);
  const hasDelegation = /\b(delegacja|delegate|taskspec|handoff)\b/i.test(text);
  const hasSubagent = /\b(subagent|podagent|agent-to-agent)\b/i.test(text);
  const hasRealBlocker = /\b(błąd|problem|fail(?:ed)?|timeout|nie działa|blocked|blokada|limit)\b/i.test(text)
    && !/\bdone\/failed\/timeout\/rejected\b/i.test(text)
    && !/\bdone\|failed\|timeout\|rejected\b/i.test(text);
  const hasMemory = /\b(pamięć|notatki|zapamiętaj|wczytaj pamięć|daily notes|rollup|memory\.md|memory-architecture)\b/i.test(text);
  const hasOps = /\b(ssh|vps|deploy|gateway|openclaw|restart|chmod|permissions?)\b/i.test(text);
  const hasProcessChange = /\b(patch|commit|push|restart|gateway|guard|hook|contract|kontrakt|workflow|wdroż|wdr[oó]ż|załatane|zaktualizowane|zmienione|node --check)\b/i.test(text);

  if (hasDecision) {
    tags.push('decision');
  }
  if (hasCodex || /\b(done|failed|timeout|rejected)\b/i.test(text)) {
    tags.push('codex');
  }
  if (hasDelegation || hasSubagent) {
    tags.push('delegation');
  }
  if (hasRealBlocker) {
    tags.push('blocker');
  }
  if (hasMemory) {
    tags.push('memory');
  }
  if (hasOps) {
    tags.push('ops');
  }
  if (hasProcessChange) {
    tags.push('process');
  }

  if (!tags.length) return ['chat'];

  const unique = Array.from(new Set(tags));
  if (unique.includes('process')) {
    return ['process', ...unique.filter((tag) => tag !== 'process')].slice(0, 3);
  }

  return unique.slice(0, 3);
}

function classifyNote(text: string): string {
  const tags = classifyTags(text).filter((tag) => tag !== 'chat');
  return tags.length ? ` [${tags.join(',')}]` : '';
}

function stripMarkdownNoise(text: string): string {
  return text
    .replace(/^\[\[[^\]]+\]\]\s*/g, '')
    .replace(/^MEDIA:\S+$/gm, '')
    .trim();
}

function stripRuntimeNoise(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let skipJsonBlock = false;
  let skipInternalBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.includes('<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>')) {
      skipInternalBlock = true;
      continue;
    }
    if (skipInternalBlock) {
      if (line.includes('<<<END_OPENCLAW_INTERNAL_CONTEXT>>>')) skipInternalBlock = false;
      continue;
    }

    if (line.startsWith('Conversation info (untrusted metadata):') || line.startsWith('Sender (untrusted metadata):')) {
      skipJsonBlock = true;
      continue;
    }
    if (skipJsonBlock) {
      if (line.startsWith('```')) skipJsonBlock = false;
      continue;
    }

    if (!line) continue;
    if (line === 'NO_REPLY' || line === 'HEARTBEAT_OK') continue;
    if (line.startsWith('[Inter-session message]')) continue;
    if (line.startsWith('System:')) continue;
    if (line.startsWith('Stats: runtime ')) continue;
    if (line.startsWith('Action:')) continue;

    kept.push(rawLine);
  }

  return kept.join('\n');
}

// Which agent the owner talked to — etykieta agenta w każdym wpisie (bez niej nikt nie wie,
// (label identifies which agent/owner the message belongs to)
function agentLabel(event: any): string {
  const c = event?.context ?? {};
  const acc = String(
    c.accountId ?? event?.accountId ?? c.account ?? c.origin?.accountId ?? c.agentId ?? event?.agentId ?? ''
  ).toLowerCase();
  const map: Record<string, string> = { default: 'Bernard', bernard: 'Bernard', dexter: 'Dexter', polly: 'Polly' };
  return map[acc] ?? (acc ? acc : 'team');
}

function detectDirection(event: any): 'U' | 'A' | null {
  const type = String(event?.type ?? '');
  const action = String(event?.action ?? '');
  const full = `${type}:${action}`;
  if (full === 'message:received' || type === 'message:received') return 'U';
  if (full === 'message:sent' || type === 'message:sent') return 'A';
  return null;
}

function extractContent(event: any, direction: 'U' | 'A'): string {
  if (direction === 'U') {
    return String(
      event?.context?.bodyForAgent ??
      event?.context?.content ??
      event?.content ??
      ''
    );
  }
  return String(
    event?.context?.content ??
    event?.content ??
    ''
  );
}

async function ensureDayFile(filePath: string, day: string): Promise<void> {
  try {
    await readFile(filePath, 'utf8');
  } catch {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `# ${day}\n\n`, 'utf8');
  }
}

async function isDuplicateNote(filePath: string, line: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf8');
    const lastNonEmpty = content
      .split(/\r?\n/)
      .map((item) => item.trimEnd())
      .filter(Boolean)
      .slice(-1)[0];
    return lastNonEmpty === line.trimEnd();
  } catch {
    return false;
  }
}

async function appendNote(timestamp: unknown, direction: 'U' | 'A', content: string, agent: string): Promise<void> {
  const day = dateKey(timestamp);
  const filePath = path.join(memoryDir, `${day}.md`);
  await ensureDayFile(filePath, day);
  const tags = classifyTags(content);
  const visibleTags = tags.filter((tag) => tag !== 'chat');
  const tag = visibleTags.length ? ` [${visibleTags.join(',')}]` : '';
  const line = `- ${timeKey(timestamp)} [${agent}]${tag} ${direction}: ${content}\n`;
  const duplicateDaily = await isDuplicateNote(filePath, line);
  if (!duplicateDaily) {
    await appendFile(filePath, line, 'utf8');
  }

  const sortedDayDir = path.join(sortedMemoryDir, day);
  await mkdir(sortedDayDir, { recursive: true });
  for (const item of tags) {
    const tagFile = path.join(sortedDayDir, `${item}.md`);
    await ensureDayFile(tagFile, `${day} / ${item}`);
    if (await isDuplicateNote(tagFile, line)) continue;
    await appendFile(tagFile, line, 'utf8');
  }

  if (direction === 'A' && tags.includes('process')) {
    await ensureDayFile(processChangelogFile, 'PROCESS-CHANGELOG.md');
    const processLine = `- ${dateKey(timestamp)} ${timeKey(timestamp)}: ${content}\n`;
    if (!(await isDuplicateNote(processChangelogFile, processLine))) {
      await appendFile(processChangelogFile, processLine, 'utf8');
    }
  }
}

const handler = async (event: any) => {
  const direction = detectDirection(event);
  if (!direction) return;

  const raw = extractContent(event, direction);
  const cleaned = clip(redactSensitive(stripMarkdownNoise(normalize(stripRuntimeNoise(raw)))));
  if (!cleaned) return;

  await appendNote(event?.timestamp, direction, cleaned, agentLabel(event));
  triggerSync();
};

export default handler;
