# TOOLS.md

## Source priority
1. https://docs.openclaw.ai/
2. https://github.com/openclaw/openclaw

## Memory stack
- Short-term: `memory/YYYY-MM-DD.md` + hook `message-memory-notes`.
- Long-term: `MEMORY.md`.
- Runtime recall: built-in memory search.

## Model strategy
- Runtime: `YOUR_MODEL` primary, `YOUR_FALLBACK_MODEL` fallback.
- Oszczędzaj kontekst: krótkie raporty, ścieżki do plików zamiast pełnych logów.
- Silniejszy model / droższe narzędzie tylko gdy Owner prosi lub zwykły nie wystarcza.

## 🔑 Dostępy
- Mapa lokalizacji i przeznaczenia: `YOUR_ACCESS_MAP_FILE`.
- Wartości runtime: `YOUR_ENV_FILE` (600).
- Nigdy nie kopiuj wartości sekretu do promptu, pamięci, logu ani czatu.

## Git
- Workspace to git repo.
- Commit po znaczących zmianach z jasnymi commit messages.
- `.gitignore`: `memory/*.md`, `*.env`, `node_modules`, `cache`.

## Narzędzia zewnętrzne — zasady zgody
- Read-only (research, kalendarz, poczta) wolno sprawdzać, jeśli dostęp jest skonfigurowany.
- Email, posty, publiczne wiadomości, transakcje, zmiana uprawnień: zawsze zgoda Ownera.
- Git push/PR: tylko gdy Owner prosi albo zmiana dotyczy własnego workspace i jest bezpieczna.
- Serwer: czytać i diagnozować wolno; zmiany wymagają jasnego powodu oraz raportu.
