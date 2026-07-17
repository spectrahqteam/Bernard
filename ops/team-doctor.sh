#!/usr/bin/env bash
# TEAM DOCTOR — deterministyczny self-check zespołu (2026-07-13 [CLAUDE]).
# Łapie CICHE awarie (hook nie ładuje się, rdzeń AGENTS uszkodzony, bind-mount padł,
# sync stoi, dysk/RAM krytyczne). Przy porażce → GŁOŚNY alert do dziennika (Bernard
# czyta, leci na GitHub). Nie zależy od modelu — czysty shell. Timer co 3h.
WS=/root/.openclaw/workspace
cd "$WS" 2>/dev/null || exit 1
DAY=$(TZ=Europe/Warsaw date '+%Y-%m-%d'); TS=$(TZ=Europe/Warsaw date '+%Y-%m-%d %H:%M')
NOTE="$WS/memory/$DAY.md"
FAIL=""
add(){ FAIL="$FAIL\n  - ❌ $1"; }

# 1) gateway żyje
systemctl is-active --quiet openclaw-vps || add "gateway openclaw-vps NIE działa"
# 2) bind-mounty pamięci (ma być 6)
M=$(mount | grep -c "$WS"); [ "$M" -ge 6 ] || add "bind-mounty pamięci: $M/6 (pamięć wspólna może być rozspójniona)"
# 3) rdzeń wspólnych plików nieuszkodzony
grep -q 'SPECTRA-CORE' shared/AGENTS-CORE.md 2>/dev/null || add "shared/AGENTS-CORE.md USZKODZONY (brak markera)"
grep -q 'USER.md' shared/USER-CORE.md 2>/dev/null || add "shared/USER-CORE.md USZKODZONY"
# 4) symlinki identycznych plików całe u całej trójki
for a in bernard dexter polly; do
  [ "$(readlink $a/AGENTS.md 2>/dev/null)" = "../shared/AGENTS-CORE.md" ] || add "$a/AGENTS.md nie jest symlinkiem do źródła"
done
# 5) hooki załadowane (7 handlerów w logu z ostatniej godziny)
journalctl -u openclaw-vps --since '65 min ago' --no-pager 2>/dev/null | grep -q 'loaded 7 internal hook' \
  || journalctl -u openclaw-vps --since 'today' --no-pager 2>/dev/null | grep -q 'loaded 7 internal hook' \
  || add "hooki: nie potwierdzono 7 handlerów (bootstrap-guard/message-notes mogą nie działać)"
# 6) sync: brak zaległych niewypchniętych commitów starszych niż ~1h
git -C "$WS" fetch -q origin 2>/dev/null
UNPUSHED=$(git -C "$WS" log origin/master..master --oneline 2>/dev/null | wc -l)
[ "$UNPUSHED" -le 2 ] || add "sync stoi: $UNPUSHED commitów niewypchniętych na GitHub"
# 7) timer sync aktywny
systemctl is-active --quiet openclaw-sync.timer || add "openclaw-sync.timer NIE działa (brak auto-backupu)"
# 8) dysk < 90%, RAM > 300MB
D=$(df / | awk 'NR==2{print $5}' | tr -d '%'); [ "$D" -lt 90 ] || add "dysk $D% (krytycznie mało)"
R=$(free -m | awk 'NR==2{print $7}'); [ "$R" -gt 300 ] || add "RAM wolne ${R}MB (ryzyko OOM)"
# 9) crony zespołu istnieją (5 bernard + polly + dexter)
C=$(timeout 20 openclaw cron list 2>/dev/null | grep -cE 'Memory|Retrospek|Health|Walidator|Research')
[ "$C" -ge 5 ] || add "crony zespołu: tylko $C (część mogła zniknąć)"

if [ -n "$FAIL" ]; then
  [ -f "$NOTE" ] || echo "# $DAY" > "$NOTE"
  echo -e "\n## $TS [DOCTOR] — ⚠️ ALERT: self-check zespołu wykrył problemy:$FAIL\n  Napraw pilnie. Szczegóły: SYSTEM-MAP.md / TROUBLESHOOTING.md." >> "$NOTE"
  /root/.openclaw/sync-now.sh 2>/dev/null
  exit 2
fi
# wszystko OK — cichy marker raz dziennie (bez zaśmiecania)
MARK="/run/team-doctor-ok-$DAY"
if [ ! -f "$MARK" ]; then : > "$MARK"; echo "team-doctor: all green $TS" >> /root/.openclaw/logs/team-doctor.log 2>/dev/null; fi
exit 0
