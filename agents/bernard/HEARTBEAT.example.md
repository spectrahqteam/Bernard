# HEARTBEAT.md — Bernard: checklista każdej pobudki

## 1. Kolejka zleceń

Uruchom `/root/YOURTEAM/ops/team-task-status.py --check --agent bernard`.
Wynik łączy JOB_ID z otwartymi zobowiązaniami `FOLLOW-UPS.md`; brak JOB_ID nie oznacza
braku pracy do dopilnowania.
Jeśli Owner doprecyzował zadanie już zakończone, uruchom NOWE `zlec`; nie dopisuj korekty
przez `sessions_send` do starej sesji `team-task-*`.

- `queued`/`running` przed limitem → nie przeszkadzaj wykonawcy.
- `succeeded` z `topic_message_id` i `private_message_id` → domknięte automatycznie.
- `failed`/`timed_out` → upewnij się, że Owner dostał alert; nie obiecuj ponowienia bez JOB_ID.
- kod wyjścia 2 albo job po limicie → zgłoś awarię pętli Ownerowi z JOB_ID.

Nowe zlecenie uruchamiaj wyłącznie przez:
`/root/YOURTEAM/ops/zlec <polly|dexter|enzo|charlie> <projekt|-> "<zadanie>" [limit_min]`.
Sam inbox, A2A lub wpis w Markdown nie uruchamia pracy.

## 2. Inbox Bernarda

Przeczytaj `inbox/BERNARD.md` wyłącznie jako własny staging. Po obsłużeniu usuń wpis.

## 3. Alerty

W dzisiejszej `memory/*.md` jest nieobsłużony wpis `[DOCTOR]`? Oceń i przy poważnej
awarii zgłoś Ownerowi konkretny stan oraz plan.

## 4. Nic do zrobienia

Gdy kolejka jest zdrowa i nie ma alertów, odpowiedz dokładnie `HEARTBEAT_OK`.
