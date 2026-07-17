#!/usr/bin/env bash
# Strażnik spójności wspólnych plików (2026-07-13 [CLAUDE]).
# 1) Pilnuje, by AGENTS.md i USER.md u każdego agenta były symlinkiem do JEDNEGO źródła
#    (shared/). Gdyby ktoś nadpisał je zwykłym plikiem — samo-naprawa + wpis do dziennika.
# 2) Raz dziennie skanuje ŻYWE docsy pod znane stare wzorce (nie historię) i flaguje.
WS=/root/.openclaw/workspace
cd "$WS" || exit 0
DAY=$(TZ=Europe/Warsaw date '+%Y-%m-%d'); NOTE="$WS/memory/$DAY.md"
TS=$(TZ=Europe/Warsaw date '+%Y-%m-%d %H:%M')
log(){ [ -f "$NOTE" ] || echo "# $DAY" > "$NOTE"; echo "$1" >> "$NOTE"; }

# 1) samo-naprawa symlinków identycznych plików
declare -A SRC=( [AGENTS.md]=../shared/AGENTS-CORE.md [USER.md]=../shared/USER-CORE.md )
for a in bernard dexter polly; do
  for f in AGENTS.md USER.md; do
    want="${SRC[$f]}"; p="$a/$f"
    if [ "$(readlink "$p" 2>/dev/null)" != "$want" ]; then
      # jeśli to zwykły plik z treścią i różni się od źródła — zachowaj kopię zanim podmienisz
      [ -f "$p" ] && ! [ -L "$p" ] && cp -f "$p" "$WS/shared/DRIFT-$a-$f.bak" 2>/dev/null
      ln -sf "$want" "$p"
      log "## $TS [GUARD] — naprawiono symlink $p → $want (był rozjazd; kopia w shared/DRIFT-$a-$f.bak jeśli miał treść)"
    fi
  done
done

# 1b) kontrola TREŚCI rdzenia (write-through-symlink może cicho uszkodzić źródło)
[ -s "$WS/shared/AGENTS-CORE.md" ] && grep -q 'TEAM-CORE' "$WS/shared/AGENTS-CORE.md" || \
  log "## $TS [GUARD] — ⚠️ ALERT: shared/AGENTS-CORE.md USZKODZONY (brak markera TEAM-CORE)! Odtwórz z gita: git show <ostatni-dobry>:bernard/AGENTS.md"
[ -s "$WS/shared/USER-CORE.md" ] && grep -q 'USER.md — the owner' "$WS/shared/USER-CORE.md" || \
  log "## $TS [GUARD] — ⚠️ ALERT: shared/USER-CORE.md USZKODZONY! Odtwórz z gita."

# 2) dzienny skan stale (raz na dzień — marker w /run)
MARK="/run/openclaw-stale-scan-$DAY"
if [ ! -f "$MARK" ]; then
  : > "$MARK"
  HITS=$(grep -rliE 'CoinDEXEmotion|openai/gpt-4\.1|RoxyBot|port 3000' \
        TEAM-CONSTITUTION.md SYSTEM-MAP.md TEAM-PROTOCOL.md CRON-ARCHITECTURE.md \
        VPS.md README.md shared/ bernard/*.md dexter/*.md polly/*.md 2>/dev/null | grep -v DRIFT)
  [ -n "$HITS" ] && log "## $TS [GUARD] — UWAGA: stare wzorce w żywych plikach: $(echo $HITS | tr '\n' ' '). Do przejrzenia/aktualizacji."
fi
