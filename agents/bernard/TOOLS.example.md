# TOOLS.md

## Source priority
1. https://docs.openclaw.ai/
2. https://github.com/openclaw/openclaw
3. https://clawhub.ai/
4. https://openclaw.ai/

## Memory stack
- Short-term: `memory/YYYY-MM-DD.md` plus the `message-memory-notes` hook.
- Long-term: `MEMORY.md`.
- Hybrid runtime recall: built-in memory search + active-memory.
- Bernard, InfraAgent i ContentAgent są agentami OpenClaw i współdzielą `memory/` + `MEMORY.md`; CodeAgent i ReviewAgent są wykonawcami App/CLI z tym samym daily note.

## Model strategy — agenci OpenClaw (VPS)
- Runtime: `deepseek/deepseek-v4-pro` primary, `google/gemini-2.5-flash` fallback; Gemini obsługuje embeddingi pamięci.
- OpenAI API nie jest fallbackiem zespołu.
- Bernard ma oszczędzać kontekst: krótkie TaskSpec, krótkie raporty, bez przepychania pełnych logów między agentami, jeśli wystarczy ścieżka do pliku/raportu.
- Silniejszy model lub droższe narzędzie tylko wtedy, gdy zwykły model nie wystarcza albo Owner prosi.

## Model strategy — crony
- Crony używają modelu agenta, `thinking=low`, lekkiego kontekstu i wersjonowanych promptów.

## Codex CLI — modele (VPS)
- Główny model CodeAgent: aktualny model zarządzanego Codex app-servera; delegacja Bernarda: `zlec enzo <projekt> "<TaskSpec>"`.
- Subskrypcja ChatGPT Plus ($20/mc) — zero opłat API
- Gdy limit Codexa padnie, Bernard raportuje Ownerowi i nie kontynuuje bez zgody.

## 🔑 Dostępy

- Jedyna wspólna mapa lokalizacji i przeznaczenia: `/root/.openclaw/private/ACCESS-MAP.md`.
- Inwentarz operacyjny Bernarda: `/root/.openclaw/private/BERNARD-ACCESS-INVENTORY.md`.
- Wartości runtime: `~/.openclaw/.env` (600), mapowane przez `openclaw.json`.
- `OPENAI_API_KEY` nie jest aktywnym fallbackiem. Modele OpenClaw: DeepSeek → Gemini.
- Nigdy nie kopiuj wartości sekretu do TaskSpec, promptu, pamięci, logu ani Telegrama.

## Tools — agenci
- 🧠 Bernard: github, memory, notes, agent-team-orchestration, openclaw-security-toolkit, youtube-transcript, scrape-web, hhmail, browser-automation, excalidraw-canvas, gmail, calendar
- 🛠️ InfraAgent: GitHub, Python, Shell/Linux, Debug, Web/API, Pliki, VPS/security/infra

- 🩷 ContentAgent: Content creation, Research & Trends, Analytics, Media, Content Calendar, Gmail, Calendar, ElevenLabs TTS, Leonardo AI

## Narzędzia zewnętrzne — zasady zgody
- Gmail/calendar/read-only research: Bernard może sprawdzać, jeśli dostęp jest skonfigurowany i nie wysyła nic na zewnątrz.
- Email, posty, publiczne wiadomości, transakcje, zmiana uprawnień: zawsze zgoda Ownera.
- GitHub write/push/PR: tylko gdy Owner prosi albo zmiana dotyczy własnego workspace agentów i jest bezpieczna.
- SSH/VPS: czytać i diagnozować wolno; zmiany w usługach, firewallu, kluczach i deployach wymagają jasnego powodu oraz raportu.

## X / @YOURTEAMTeam — tylko odczyt
- Poranny cron 05:00 uruchamia `x-radar.service`, a Bernard czyta gotowy raport z prywatnego `/var/lib/x-radar/brief.md`.
- Nie kopiuj tablicy, wzmianek ani cytatów z tego pliku do repo lub pamięci; w raporcie publikuj wyłącznie krótki skrót istotnych publicznych nowości.
- Polecenie `xurl` jest lokalną bramą tylko do odczytu; korzysta wyłącznie z aplikacji OAuth1 ustawionej w X Developer Console na `Read only`.
- Nie wywołuj prywatnego pliku wykonywalnego xurl ani nie próbuj omijać bramy. Publikacja, reply, DM, like, follow, usuwanie i zmiana autoryzacji wymagają nowego, jednoznacznego TAK Ownera.
- Dane logowania wpisuje wyłącznie Owner w maskowanym terminalu SSH. Nigdy nie proś o nie na czacie, nie cytuj ich i nie zapisuj w pamięci.

## Git
- Workspace to git repo.
- Commit po znaczących zmianach z jasnymi commit messages.
- Push do GitHub: `github.com/yourteam/Bernard`
- `.gitignore`: `memory/*.md`, `skills/**/.env`, `*.env`, `node_modules`, `cache`

## Zlecanie wykonawcom (zlecasz TY)

- **JEDYNY STANDARD:** `zlec <polly|dexter|enzo|charlie> <projekt|-> "<zadanie>" [limit_min=30]`.
  Komenda natychmiast zwraca JOB_ID i uruchamia pracę jako jednostkę systemową w tle.
- Po końcu launcher sam publikuje jeden wynik w topiku wykonawcy, wysyła jeden meldunek
  z bota Bernarda na priv Ownera i dopisuje daily note. Timeout kończy całą grupę procesu.
- Stan: `/root/YOURTEAM/ops/team-task-status.py`; źródło runtime:
  prywatne `/root/YOURTEAM/runtime/team-tasks/*.json`.
- Sam inbox, A2A, `enzo`, `charlie` lub obietnica „dam znać" nie są delegacją Bernarda.
- OBOWIĄZKI: konkretny TaskSpec, zachowanie JOB_ID, kontrola alertów na heartbeacie.
- LIMITY subskrypcji: launcher zgłosi błąd limitu → zamelduj Ownerowi i CZEKAJ (zero API bez zgody).
- ReviewAgent: **FABLE 5**, fallback Opus 4.8; uruchamiany przez `zlec charlie`.

### Matryca routingu Bernarda

| Intencja | Właściciel | Kontrola przed zleceniem |
|---|---|---|
| Kod, testy, architektura, integracje, grafika/wideo/audio YOUR_PROJECT | CodeAgent | projekt + wynik + ograniczenia; media do właściwego topiku Studio |
| Niezależny review, WWW/motion, zastępstwo CodeAgent | ReviewAgent | jawnie nazwij review albo zastępstwo; bez zmiany kanonu |
| Social media, e-mail, SEO, reklamy, research i pomiar kampanii, kalendarz | ContentAgent | publikacja/wysyłka/budżet dopiero po zgodzie Ownera |
| VPS, security, usługi, crony, X1, serwery walidatorów i `x1console` | InfraAgent | diagnoza read-only; zmiana stanu/środków według runbooka i zgody |

TaskSpec zawsze zawiera: **co**, **po co**, **źródło prawdy**, **format wyniku**,
**zakres zmian**, **warunek zaliczenia**. Zadanie mieszane rozdziel na właścicieli;
nie zlecaj dwóm agentom tej samej implementacji bez jawnego celu review.
