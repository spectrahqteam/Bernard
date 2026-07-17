import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const LOCAL_TIME_ZONE = 'Europe/Warsaw';

function localDay(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function localDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LOCAL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function clip(text: string, max = 220): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractRecentBullets(markdown: string, limit = 12): string[] {
  const bullets = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => `- ${clip(line.slice(2).trim())}`);

  return bullets.slice(-limit);
}

function upsertBootstrapFile(files: any[], file: any): any[] {
  const idx = files.findIndex((entry) => entry?.name === file.name);
  if (idx >= 0) {
    const next = [...files];
    next[idx] = { ...next[idx], ...file };
    return next;
  }
  return [...files, file];
}

async function ensureBootstrapFile(files: any[], workspaceDir: string, name: string): Promise<any[]> {
  const filePath = path.join(workspaceDir, name);
  const content = await readIfExists(filePath);
  if (!content) return files;
  return upsertBootstrapFile(files, { name, path: filePath, content, missing: false });
}

function hookEnabled(cfg: any, name: string): boolean {
  const internalEnabled = cfg?.hooks?.internal?.enabled;
  if (internalEnabled === false) return false;
  return cfg?.hooks?.internal?.entries?.[name]?.enabled === true;
}

const defaultBootstrap = `# BOOTSTRAP.md\n\n## Hard rehydration guard\n- You are not a blank or new assistant. Continue from the workspace state on disk.\n- Project Context can be partial or truncated. Treat it as a hint until a file is fully read or explicitly shown by this guard.\n- Before the first substantive reply, reconcile AGENTS.md, MEMORY.md, OPERATIONS.md, and today's daily memory if present.\n- Never tell Piotr that you remember nothing until you have rehydrated from those files.`;

const requiredFiles = ['SOUL.md', 'AGENTS.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'MEMORY.md', 'OPERATIONS.md', 'TEAM-CONSTITUTION.md', 'SYSTEM-MAP.md'];

const handler = async (event: any) => {
  if (event?.type !== 'agent' || event?.action !== 'bootstrap') return;

  const context = event?.context;
  if (!context || !Array.isArray(context.bootstrapFiles) || !context.workspaceDir) return;

  let files = [...context.bootstrapFiles];
  const workspaceDir = String(context.workspaceDir);

  files = await ensureBootstrapFile(files, workspaceDir, 'MEMORY.md');

  const now = new Date();
  const today = localDay(now);
  const yesterday = localDay(new Date(now.getTime() - 86400000));
  const todayPath = path.join(workspaceDir, 'memory', `${today}.md`);
  const yesterdayPath = path.join(workspaceDir, 'memory', `${yesterday}.md`);
  const bootPath = path.join(workspaceDir, 'BOOTSTRAP.md');

  const bootBase = (await readIfExists(bootPath)) ?? defaultBootstrap;
  const operationsContent = await readIfExists(path.join(workspaceDir, 'OPERATIONS.md'));
  const todayContent = await readIfExists(todayPath);
  const yesterdayContent = today === yesterday ? null : await readIfExists(yesterdayPath);

  const fileStatus = await Promise.all(requiredFiles.map(async (name) => ({
    name,
    present: Boolean(await readIfExists(path.join(workspaceDir, name))),
  })));

  const hookStatus = [
    { name: 'message-memory-notes', enabled: hookEnabled(context.cfg, 'message-memory-notes') },
    { name: 'session-bootstrap-guard', enabled: true },
    { name: 'boot-md', enabled: hookEnabled(context.cfg, 'boot-md') },
  ];

  const continuityBroken = fileStatus.some((item) => !item.present)
    || !todayContent
    || hookStatus.some((item) => !item.enabled);

  const sections: string[] = [bootBase.trim(), '', '## Runtime continuity snapshot'];
  sections.push(`- Continuity status: ${continuityBroken ? 'degraded' : 'healthy'}.`);
  sections.push(`- **GDZIE JESTEŚ (fakt na żywo, nie z pamięci): VPS \`${os.hostname()}\`, IP YOUR_SERVER_IP. To Twój JEDYNY serwer i dom.** Hostinger NIE ISTNIEJE — skasowany 2026-07-12. Nigdy nie instaluj skilli, nie łącz się ani nie odwołuj do Hostingera. „Host" / \`--global\` / \`openclaw ... --global\` = TEN VPS, nie żaden Hostinger. Nie musisz SSH-ować na YOUR_SERVER_IP — już na nim jesteś (to byłoby łączenie się ze sobą).`);
  sections.push(`- **TERAZ jest: ${localDateTime(now)} (${LOCAL_TIME_ZONE}).** To prawdziwa data i godzina — używaj JEJ, nigdy nie zgaduj daty ani dnia tygodnia.`);
  sections.push(`- Każdy wpis do pamięci MUSI zaczynać się od daty i godziny: \`## ${today} HH:MM [TAG]\`. Czas bierz z tego snapshotu albo z komendy \`date\` — nie z pamięci.`);
  sections.push('- Czytając pamięć: pliki `memory/YYYY-MM-DD.md` są datowane nazwą, wpisy godziną — dzięki temu WIESZ kiedy co było. Nie myl przeszłości z teraźniejszością.');
  sections.push('- This session must start from workspace memory, not from blank session state.');
  sections.push('- Required rehydration before first substantive reply: `TEAM-CONSTITUTION.md` (nadrzędne źródło prawdy), `SYSTEM-MAP.md` (mapa całego systemu), `AGENTS.md`, `MEMORY.md`, `OPERATIONS.md`, and today daily memory. `SOUL.md`, `IDENTITY.md`, `USER.md`, and `TOOLS.md` are supporting context.');
  sections.push('- `SYSTEM-MAP.md` musi być AKTUALIZOWANY: gdy zmieniasz strukturę systemu (pliki, config, crony, hooki, projekty) — dopisz zmianę do SYSTEM-MAP i do dziennej notatki.');
  sections.push('- Project Context may be truncated. If a required file is missing/truncated and the answer is substantive, read it before answering.');
  sections.push('- This rule applies after restart and across dashboard, Telegram, WhatsApp, and other surfaces.');
  sections.push('- Never claim to remember nothing until the workspace files have been loaded and reconciled.');
  sections.push('- Never claim "wczytałem/sprawdziłem" without a real file/log/status read or this hook snapshot as evidence.');
  sections.push('- For actionable requests, do not say you will report in the next message if you can do the work now. Execute first and include the result in the same run whenever possible.');
  sections.push('- On Telegram and other chat surfaces, keep multi-step work alive with milestone updates: started, found, installed/tested, done, or blocked. Do not wait for the user to ask what happened.');
  sections.push('- Do not use subagents for critical bootstrap, memory, delegation, code, deploy, secrets, or audits without Piotr approval plus timeout and final status.');
  if (continuityBroken) sections.push('- Continuity is degraded. Be explicit about what is missing instead of pretending continuity is complete.');

  sections.push('', '### Required file status');
  for (const item of fileStatus) sections.push(`- ${item.name}: ${item.present ? 'present' : 'MISSING'}`);

  sections.push('', '### Hook status');
  for (const item of hookStatus) sections.push(`- ${item.name}: ${item.enabled ? 'enabled' : 'DISABLED'}`);

  sections.push('', '### Daily memory status', todayContent ? `- Today available: memory/${today}.md` : `- Today missing: memory/${today}.md`);
  if (yesterdayContent) sections.push(`- Yesterday available: memory/${yesterday}.md`);
  else sections.push(`- Yesterday missing or empty: memory/${yesterday}.md`);

  sections.push('', '### Startup proof checklist');
  sections.push(`- OPERATIONS.md: ${operationsContent ? 'present on disk; read it if not fully visible in Project Context' : 'MISSING'}`);
  sections.push(`- Today daily note: ${todayContent ? 'present on disk; recent bullets included below' : 'missing on disk'}`);
  sections.push('- If asked what was loaded, distinguish: injected Project Context vs file read vs this hook snapshot.');

  if (todayContent) {
    sections.push('', `### Recent daily memory snapshot (${today})`, ...extractRecentBullets(todayContent, 14));
  }
  if (yesterdayContent) {
    sections.push('', `### Recent daily memory snapshot (${yesterday})`, ...extractRecentBullets(yesterdayContent, 8));
  }

  files = upsertBootstrapFile(files, {
    name: 'BOOTSTRAP.md',
    path: bootPath,
    content: sections.join('\n'),
    missing: false,
  });

  context.bootstrapFiles = files;
};

export default handler;
