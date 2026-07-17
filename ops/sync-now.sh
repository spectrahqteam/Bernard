#!/usr/bin/env bash
# Natychmiastowy, BEZPIECZNY sync workspace → GitHub (2026-07-13 [CLAUDE]).
# flock -n: tylko jedna instancja naraz (kolejne wywołania cicho wychodzą — brak pileup,
# bo git add -A i tak łapie najnowszy stan). Wołany przez hook po odpowiedzi + timer 30s.
exec 9>/run/openclaw-sync.lock
flock -n 9 || exit 0            # ktoś już synchronizuje — najnowszy stan i tak pójdzie
cd /root/.openclaw/workspace || exit 1

# jeden VPS = jedyny pisarz. Git to backup → tania ścieżka: gdy nic się nie zmieniło
# i nie ma zaległych commitów, wyjdź BEZ sieci (timer 30s nie bije po GitHubie na pusto).
git add -A 2>/dev/null
UNPUSHED=$(git log --branches --not --remotes --oneline 2>/dev/null | head -1)
if git diff --cached --quiet 2>/dev/null && [ -z "$UNPUSHED" ]; then
  exit 0
fi

git diff --cached --quiet 2>/dev/null || git commit -q -m "sync $(TZ=Europe/Warsaw date '+%Y-%m-%d %H:%M:%S') [auto]" 2>/dev/null
# push; przy odrzuceniu (ktoś jednak wypchnął) pobierz z rebase i spróbuj raz jeszcze
git push -q origin master 2>/dev/null || {
  git pull --rebase --autostash --no-edit origin master >/dev/null 2>&1
  git push -q origin master 2>/dev/null
}
