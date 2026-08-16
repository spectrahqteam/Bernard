# MEMORY.md — pamięć trwała (przegląd zasad 2026-08-01)

> To jest tło historyczne. Bieżąca polityka operacyjna pochodzi z najnowszego wpisu
> `DECISIONS.md`, stan zmienny ze źródła live, a stan projektu z `PROJECT_STATE.md`.

## 🎯 SpektraHQteam — stan wizji Piotra (100% wdrożone, 2026-07-16 [CHARLIE])
- **5 agentów:** 🧠 Bernard (orkiestrator/producent), 🩷 Polly (marketing, koordynacja i dystrybucja), 🛠️ Dexter (security/walidatory/infra), 💻🎨 Enzo (programista #1 oraz dyrektor kreatywny/główny grafik SpectraStudio: grafiki, filmy, podcasty, audiobook), 🤖 Charlie (programista #2, zastępca/reviewer Enzo: WWW/motion/postprodukcja na delegację).
- **Łańcuch delegacji (naprawiony 21.07):** Piotr → Bernard → Polly/Dexter/Enzo/Charlie. Jedyny standard Bernarda: `zlec <polly|dexter|enzo|charlie> <projekt|-> "<zadanie>" [limit_min]`; JOB_ID + prywatny stan runtime + automatyczny wynik/topik/priv/daily. Inbox nie uruchamia pracy. Enzo/Charlie nadal publikują przez Bernarda.
- **Tanie automatyzacje (26.07):** 4 lekkie zadania agentowe mają jawny Gemini Flash,
  minimal thinking, świeże sesje i mikro-bootstrap; Health oraz MemorySpectra są lokalnymi
  skryptami bez modelu.
  Research zachowuje szeroką weryfikację, lecz otwiera najwyżej 4+4 wyniki; Polly 2+2.
- **Twarda reguła researchu Piotra:** wyłącznie wydarzenia lub materialne zmiany z ostatnich
  24 h; brak timestampu = odrzucić. Krótki raport ma wynikać z szerokiego, wiarygodnego skanu
  i potwierdzenia źródłowego. Agenci czytają rolling research-state, raportują NEW/UPDATE,
  pomijają REPEAT i uczą się poprzez potwierdzone lekcje domenowe.
- **3 grupy TG:** Work = biurka agentów; Memory = raporty cronów; StudioSpectra `-1004313603509` pod opieką Polly: 6 ImageBR (delegacja do Enzo), 7 Video, 8 Podcasty. Dawny Work/2952 jest wyłączonym archiwum.
- **6 automatyzacji:** 01:00 Walidatory (Dexter), 02:00 Health bez modelu, niedziela
  03:00 MemorySpectra, 05:00 Research, 05:30 Kalendarz Polly i 06:40 Media.
- **Modele:** DeepSeek V4 Pro = STAŁY primary (doładowany 16.07, saldo $4.98), Gemini 2.5 Flash = fallback; Charlie = Fable 5 standard (Opus 4.8 fallback); Enzo = gpt-5.6-sol (decyzja 18.07)
- **Most graficzny:** `br-img.sh` (BraciaRatownicy) → `enzo-img.sh` (most) → ChatGPT Plus przez Enzo. Kanon: `brothers/canon/logo.png` (logo W1 — VF→piorun→P-QRS-T jako jedna ciągła linia) + `bible.md`. Pipeline generacji: generuj od zera z referencjami (2 min), NIE edytuj (15 min).
- **GitHub:** 4 repozytoria — SpectraHQteam.git (backup, priv), Bernard.git (pub szablon), BraciaRatownicy.git (priv), x1stats.xyz.git (priv). Wyjątek imienny dla x1stats (decyzja Piotra 18.07). Auto-sync 5-min timer dla wszystkich repo (repo-sync.sh + guard sekretów).
- **Charlie:** pełne uprawnienia GitHub (CLASSIC token spectrahqteam, decyzja Piotra 18.07) — może tworzyć/usuwać repa. Token ma szeroki scope (admin:enterprise/org) — rekomendacja zawężenia odnotowana.
- **Globalny autozapis:** Enzo i Charlie zapisują każdą odpowiedź do wspólnego daily note przez `ops/agent-daily-autosave.py` (22:22 18.07) — eliminuje lukę "brak notatek po bezpośredniej rozmowie".
- **Pamięć hybrydowa:** daily notes + research-state + lokalny FTS-only są dostępne od razu;
  MemorySpectra tygodniowo odświeża indeks bez AI. Od 26.07 start Bernarda w DM ładuje
  lekki pakiet do 20k znaków z krytycznym kontraktem i ostatnimi wpisami zamiast pełnej
  biblioteki; pełne pliki pozostają dostępne on-demand. Wyszukiwanie zwraca maks. 3 trafienia,
  odczyt fragmentu ma limit 4k znaków, a każdy wynik narzędzia Bernarda twardy limit 3k.
  Okno bezpieczeństwa to 64k, historia maks. 20%, a kompresję wykonuje Gemini Flash.
- **Raport dzisiejszej pracy:** Bernard nie skanuje już daily wieloma turami dla pytań
  „co dziś zrobiono w SpectraHQteam”. Jeden bezmodelowy `ops/team-day-brief.py --compact`
  zwraca nazwane prace oraz świeży stan gatewaya, zleceń, cronów i doctora; wcześniejsze,
  naprawione alerty nie są przedstawiane jako aktualne awarie.
- **Kalendarz Polly (decyzja 01.08):** pokazuje wyłącznie wpisy jawnie zapisane przez
  Piotra/zespół w Google Calendar. Nie dodaje cronów, audytów, poczty, alertów ani
  wniosków z rozmów. Stan live sprawdza `ops/kalendarz.py pokaz`, a nowy termin zapisuje
  dopiero na wyraźne polecenie przez `ops/kalendarz.py zapisz`.

## 🏠 VPS (5.181.188.217)
- Koszt cronów miał skoki 0,5–0,7M tokenów na pojedynczy job; 26.07 wyłączono heartbeat,
  ustawiono limit sesji 32k i próg diagnostyczny 250k/24h. Historyczne 24h pozostaną
  czerwone do wygaśnięcia okna, a nowe przebiegi mają być mierzone osobno.
- Porty: 22 (SSH), 80/8080-8084 (NGINX), 4174/4176/7000 (node), 5000 (gunicorn), 5432 (postgres localhost), 631 (cupsd — UFW DENY)
- Kluczowe usługi: openclaw (bez systemd unit), flash-keeper + shielded-relayer (dexlimit-x1), repo-sync.timer (auto-sync GH co 5 min), doctor (czyta z SQLite, 0.7s)
- fail2ban aktywny, UFW deny incoming, SSH brute-force ciągły
- ⚠️ certbot.service FAILED od 09.07 (josepy import error) — może zablokować auto-renew SSL

## 🔑 Mapa dostępu
- Sekrety: `/root/.openclaw/.env` (600) — NIGDY w pamięci/gicie/logach
- Walidatory X1: klucz SSH `/root/.openclaw/private/x1-validators/piotr_x1_console_ssh_key` → `piotr@149.50.101.149` (Bburn) i `piotr@149.50.101.152` (Bernard); root denied
- Klucze on-chain i wallet: `/root/.openclaw/private/x1-validators/` (700)
- Pełna mapa: `/root/.openclaw/private/BERNARD-ACCESS-INVENTORY.md`

## 🛠️ Dexter — Gmail App Password Exposure (2026-07-13)
- **Weryfikacja 15.07 [CLAUDE]:** repo GitHub czyste — wszystkie wystąpienia zredagowane. Rotacja NADAL zalecana ale bez paniki.

## 🛠️ Dexter — Persistent Port 631 (cupsd)
- cupsd słucha na 0.0.0.0:631, UFW DENY skuteczne. Niezarządzalny przez systemctl. Non-critical, do rozwiązania.

## 🛠️ Lekcja: wiele vote accounts na jednym identity (Dexter, 22.07)
- Przy wielu vote accounts na jednym nodePubkey sprawdzaj stan po votePubkey, nie nodePubkey.
- Foundation rotacja epokowa (active→activating) to normalny cykl, nie kara.
- x1.ninja i app.xdex.xyz to JS SPA — niedostępne przez curl, wymagają headless browsera.

## 🛠️ DexLimit-X1 — porty i usługi
- Port 4176 = shielded-relayer (relayer.mjs) — aktywny
- Port 4174 = node (niezidentyfikowana usługa)
- flash-keeper (keeper.mjs) — aktywny, BEZ portu nasłuchu

## ⚠️ Walidatory X1
- **AKTUALIZACJA v3.1.14 — ZROBIONE ✅:** Oba walidatory na v3.1.14 (Charlie zbudował 19.07 wieczorem, Dexter potwierdził 21.07 01:17). Deadline 21.07 spełniony.
- **Stake 25.07 02:54 (epoka 320):** BBURN 862,200 XNT total active stake, BERNARD 860,931 XNT total active stake. Own/operator stake łącznie 8,682.43 XNT. Foundation: oba ~857k XNT active (rotacja zakończona, delegacje znowu aktywne).
- **Snapshot historyczny 25.07:** stare metryki i dawna koordynacja zewnętrzna są wyłącznie tłem, nigdy stanem bieżącym. Aktualny stan daje `x1-validator-monitor.py --no-write --json`; w raporcie live pomijaj wszystko, czego nie ma w bieżącym pakiecie.
- **⚠️ Luki w dokumentacji X1 (audyt Dextera 24.07):** brak procedury aktualizacji Tachyon, brak disaster recovery, brak alertów Telegram, dokumentacja researchowa X1 sprzed miesiąca, klucze na serwerach bez zweryfikowanego backupu. Pełna lista w TROUBLESHOOTING.md.
- **Incydent historyczny 19.07:** oba walidatory były niedostępne około 45 min i wróciły. Nie przenoś historycznej przyczyny na nowe alerty bez świeżego dowodu.
- **XNT:** $0.5045 (app.xdex.xyz 25.07, -15.41% 7 dni — duży spadek). Uwaga: cena z LP — CEX bardziej wiarygodny ($0.14-0.18 MEXC/Bybit).

## 🎬 BraciaRatownicy — pipeline (akt. 21.07)
- **Kanon postaci finalny 21.07:** Igor, Kuba, Tata i Mama oraz portrety wspólne są zaakceptowane; aktywny tor grafik to Enzo + ChatGPT/Codex, `ENZO-GRAFIKI.md` i `QC-KANON.md`.
- **Format książki:** A5 148×210 mm, realne minimum 300 PPI. Wspólny feed IG/FB 4:5 1080×1350; rolki IG/FB/TikTok 9:16 1080×1920; blog 16:9 + OG 1200×630. Źródło: `projects/BraciaRatownicy/knowledge/FORMATY-GRAFIK.md`.
- **Grafiki dla Polly:** zawsze zacznij od `/root/projects/BraciaRatownicy/POLLY-GRAFIKI.md`, potem otwórz `bracia-generator/ilustracje/delivery/POLLY-READY.md`. Tylko wpis `READY` po akceptacji Piotra; nigdy nie szukaj finalnego pliku w `imagebr/`, `canon/` ani galerii.
- **Strategia:** każdy zaakceptowany rozdział może zasilać książkę, feed i rolki, ale warianty proporcji są świadomie przeformatowane. CLEAN master bez marketingowych napisów pozostaje archiwum; Polly tworzy copy i publikuje wyłącznie po jawnej zgodzie Piotra.

## 💰 Projekty Piotra (7, /root/projects/)
dexlimit-x1 (DEX na X1, :4174) · bburn-wallet (portfel ZK, :4175) · x1stats.xyz · X1predict (:8080) · BraciaRatownicy (książka+video+apka) · ChillFun (Zenit) · SpectraHQteam (centrum dowodzenia, :7000)

## Nowe lekcje domenowe (2026-07-25)

- EU 21. pakiet sankcji (23.07): pierwszy full third-country crypto ban — UE może zablokować transakcje z dowolnym dostawcą krypto z kraju trzeciego pomagającego Rosji. Bezprecedensowy precedens jurysdykcyjny.
- Meta usuwając opt-out off-platform zwiększa pulę retargetingową — warto działać szybko, zanim konkurencja nasyci aukcję.
- TikTok i YouTube promują autentyczne treści i wspierają tworzenie wideo AI. To szansa na zwiększenie produkcji treści przy jednoczesnym zachowaniu ich jakości i zgodności z politykami platform.
- YouTube zwiększa agresywność reklam, co może zniechęcić część użytkowników do tradycyjnych formatów, ale jednocześnie zwiększa wartość krótkich, autentycznych treści, takich jak Shorts, które są mniej inwazyjne.
- YouTube Q2 2026: $11B przychodów z reklam (+13% YoY), 32% dorosłych Amerykanów codziennie ogląda finanse na YT — content edukacyjny ma rosnący potencjał monetyzacji.

## 🧠 Dopisane przez MemorySpectrę (27–28.07)

- Rozwój transparentności AI w reklamach Google Ads i rozszerzenia Demand Gen na YouTube wymaga od BraciRatowników tworzenia autentycznych reklam wideo z opcjonalnym oznaczeniem AI, dostosowanych do różnych formatów, co zwiększy zasięg i wiarygodność kampanii.
- Health oraz MemorySpectra działają teraz jako lokalne komendy bez AI, generując raporty z `0` tokenów.
- Google Ads intensywnie inwestuje w automatyzację i AI dla kampanii wideo na YouTube.
- Konfiguracja crona jest prawidłowa.
- Naprawiono właścicieli plików `.dreams`, starego daily i `roxy/roxy-wallets`; FTS nie zgłasza błędu EACCES, spoole mają 0, a daily ma około 5 KiB.
- Komunikat sugerujący zwiększenie `reserveTokensFloor` do 20000 jest mylący, ponieważ efektywny floor już wynosi 20000. Naprawa wymaga odchudzenia bootstrapu i allowlisty narzędzi lub zwiększenia okna modelu, a następnie utworzenia czystej sesji.

- (29.07) [MEMORYSPECTRA] Skrypt ops/research-note.py centralizuje zapisywanie notatek dziennych i wniosków, eliminując błędy ręcznej edycji plików przez Bernarda.

- (29.07) [MEMORYSPECTRA] Bernard z sukcesem zakończył pierwszy cykl nauki, autonomicznie dodając lekcje i oznaczając źródła w pliku bernard-research.md.

- (30.07) [MEMORYSPECTRA] Nikt nie pilnuje statusu projektów Piotra (BraciaRatownicy, DexLimit, X1predict, ChillFun, StudioImage), a istniejące pliki PROJECT_STATE.md nie są czytane przez żadne crony.

- (30.07) [DOKTOR] Gdzie są hasła i klucze: mapa dostępu per agent to /root/.openclaw/private/ACCESS-MAP.md (odświeża ją Doktor o 02:00), klucze walidatorów X1 w /root/.openclaw/private/x1-validators/ (opis w KEYS.md), sejf runtime w /root/.openclaw/.env. Mapa podaje WYŁĄCZNIE ścieżki, nigdy wartości — po zmianie sekretu restart openclaw-vps.

- (30.07) [DOKTOR] Pełna lista plików zespołu (tożsamość agentów, pliki wspólne, narzędzia ops, prompty cronów, układ pamięci, hooki) jest w FILE-INDEX.md i odświeża ją Doktor o 02:00 — nie zgaduj ścieżek i nie przeszukuj drzewa, sprawdź ten plik.

- (30.07) [DOKTOR] Autostake X1: wypłata z vote accounta idzie WYŁĄCZNIE Ledgerem Piotra (3NZ841oaj9fC86HnRhTiwzXbNYM5AvsU7KLx14LmnYS8), środki lądują na identity node'a i z klucza na serwerze tworzy się nowy stake account; staker authority self-stake'ów to identity. Ustalenie live [DEXTER] z 23.07.2026.

- (30.07) [DOKTOR] Etap każdego projektu czytaj z lustra project-status/<projekt>/PROJECT_STATE.md (blok AT A GLANCE: what, live, status, next) — jest odświeżane co 30 sekund, więc nie pytaj Piotra o stan projektu, który jest w lustrze.

- (30.07) [DOKTOR] Co crony zebrały z researchu: memory/research-state/*.md trzyma aktywne wątki i trwałe lekcje Bernarda, Polly i Dextera, a pełne nieucięte raporty daje python3 ops/cron-reports.py --pelne --cron research|media|doktor --dni N.

- (31.07) [MEMORYSPECTRA] Moduły Research i Media korzystają ze wspólnego ; brak danych w wyniku nie jest błędem.

- (01.08) [MEMORYSPECTRA] Doktor wykrył przejściową różnicę bind-mountów i indeksów MEMORY.md; incydent naprawiono tego samego dnia. Nie traktować tego wpisu jako bieżącego alertu — stan potwierdza live Doctor/Spectra Hub.

- (02.08) [MEMORYSPECTRA] Kontekst TEAM-ROADMAP i bootstrap zostały przebudowane, wybierając najnowsze dane strukturalne i stosując hierarchię live → DECISIONS → PROJECT_STATE → MEMORY.

- (02.08) [MEMORYSPECTRA] Bernard działa prawidłowo po naprawach, a zmienny stan potwierdzany jest na żywo, nie tylko z pamięci.

- (03.08) [MEMORYSPECTRA] Wdrożono strategię roadmap-first dla agentów Bernard, Dexter i Polly, obejmującą zarządzanie projektami, następnymi krokami i sekcją 'Gotcha' oraz obsługę cronów.

- (06.08) [MEMORYSPECTRA] W Doktorze zaimplementowano nową kontrolę, która weryfikuje brak nowych lekcji od Dextera przez ponad 7 dni.

- (06.08) [MEMORYSPECTRA] Wdrożono bramkę anty-konfabulacyjną dla Dextera w kontrakcie krytycznym oraz obowiązek lekcji z kontrolą wieku plików w Doktorze.

- (07.08) [MEMORYSPECTRA] Hooka wymaga restartu gatewaya.

- (09.08) [MEMORYSPECTRA] Charlie naprawił i zamroził wszystkie 7 cronów, wdrażając twarde zasady ich działania.

- (10.08) [MEMORYSPECTRA] Zespół przeanalizował publiczny format wideo i zaadaptował go do własnych potrzeb, ustalając strukturę: intro 10-15s, hook, odcinek sceniczny z efektami, lekcja bezpieczeństwa, outro 10-15s.

- (11.08) [MEMORYSPECTRA] Ustalono test Act-Two kontra InfiniteTalk przez gotowy endpoint Runpod; pełny własny pod dopiero po przejściu kanonu. Zapisano aktualne wymaganie 80 GB VRAM dla Wan2.2-S2V i stawki GPU oraz kryterium kosztu zaakceptowanej sekundy.

- (11.08) [MEMORYSPECTRA] Enzo produkuje i QC-uje, Bernard zarządza, Polly dystrybuuje, Piotr zatwierdza kanon/publikację/koszty. Przed kolejnym rozdziałem wdrożyć hash i walidator 100% zgodności tekstu.

- (12.08) [MEMORYSPECTRA] Wdrożono dwufazowy splash: składanie siedmiu części do około 3s, delikatny oddech znaku, pastelowe punkty danych, status oraz końcowy fade do panelu po 7,2s.

- (13.08) [MEMORYSPECTRA] Wdrożono dynamiczny SceneSpec, exact text+WAV bus, LTX-2.5 A2V candidate, immutable single-pass release, szybki TEST gate, pełny FINAL QC, GPU pool/controller i load-balanced RunPod worker z wynikiem 111/111 PASS, nie używając GPU ani nie ponosząc kosztów.

- (13.08) [MEMORYSPECTRA] Grafika Mamy przeszła QC PASS, przygotowano 10-sekundową scenę z polskim MFA, maskami i ruchem, naprawiono circular driver signature i solo dialogue-to-viewer.

- (13.08) [MEMORYSPECTRA] Ustalono, że projekty typu video-only trafiają bezpośrednio do kanału 7 (film), a jawny plan tekst+grafika+podcast+video tworzy spójny pakiet do kanałów 6 (grafika), 8 (podcast/audiobook) i 7 (film). Głosy Typecast/ElevenLabs i biblioteka audio są gotowe.

- (14.08) [MEMORYSPECTRA] Kalorik onboarding i profil celu zostały wdrożone na VPS.

- (14.08) [MEMORYSPECTRA] Kalorik: skaner i pełny produkt zostały wdrożone.

- (14.08) [MEMORYSPECTRA] Kalorik został przebudowany i naprawiony na VPS.

- (15.08) [MEMORYSPECTRA] Wdrożono hybrydowy planer (do v8) z walidacją USDA/OFF, zamkniętym cookbook DSL, serwerowymi kalkulacjami i deterministycznym generowaniem pięciu unikalnych dań, uwzględniającym sloty awaiting-live i blokadę poprzednich kompozycji, co domknęło ryzyko powrotu do tych samych składników i gramatur pod inną techniką.

- (16.08) [MEMORYSPECTRA] Wdrożono v10, które pozwala Bernardowi składać naturalne podzbiory, a serwerowi tworzyć tytuł/charakter i wiązać pełny cookbook. Atelier ma pięć faz, a produkcyjny exact-12 osiągnął 12/12 pokrycie.

## 🗣️ Styl odpowiedzi wobec Piotra (preferencja stała, 2026-08-16)
- Zawsze odpowiadaj prosto i zrozumiale, po ludzku. Techniczne pojęcia, ścieżki, porty i statusy tłumacz na zwykły język.
- Analizuj pytanie Piotra względem wstrzykniętych notatek (TEAM-ROADMAP / daily) i podawaj tylko to, co jest istotne dla jego pytania — bez surowego szumu.
- Unikaj surowych tabel, list ścieżek i logów, gdy wystarczy krótkie wyjaśnienie. Konkret tak, techniczny żargon nie.
