# Staff Role Cards · Journalpilot dag 1 · 4 juni 2026

> Rollkort för personal, admin/ops, Fazli och eventuell observatör. Skriv ut · ha på arbetsstationen · eskalera enligt korten.

---

## 🧑‍⚕️ Personal (behandlare / sköterska / reception)

**Roll:** Du möter patienten och skriver journal.

### Får göra
- Verifiera identitet (namn + telefon + Cliento-id)
- Öppna kundkort på kända patienter
- Skapa journalanteckning (välj mall, skriv, spara som draft)
- Signera/låsa journalpost efter Pre-Signering Check (5 punkter)
- Skapa rättelse som ny post (länkas till originalet)
- Läsa importerad historik som referens
- Ta nya bilder i CCO när det behövs

### Får INTE göra
- Skapa ny kund vid osäker identitet — eskalera istället
- Använda extern AI (ChatGPT/Claude/Copilot) på journaltext
- Ändra signerade poster direkt — bara via rättelse
- Lita på "Behöver granskning"-material som klinisk sanning
- Använda migrerade före/efter-bilder kliniskt (Photo Review pågår)
- Använda mail-worklist / unified inbox som dagligt verktyg

### När eskalera
- Identitet stämmer inte → admin/ops
- Misstänker dubblett-kund → admin/ops
- Patient frågar GDPR-export → admin/ops
- Tekniskt fel / trasig sida → Fazli direkt
- Skrivit på fel patient → **STOPPA. SPARA INTE.** Fazli direkt

### Vilka länkar används
- `/cco-personal-start.html` — huvudfönster
- `/cco-after-meeting-start.html` — 8-stegs konkret startguide
- `/cco-pre-signering-check.html` — 5-stegs säkerhetscheck i sido-flik
- `/cco-review-material-warning.html` — vad är INTE klinisk sanning
- `/journal-pilot-guide.html` — komplett guide
- `/cco-journalpilot-faq.html` — 9 svar
- `/cco-staff-training-mode.html` — 5-stegs självträning vid lugn stund

---

## 👩‍💼 Operator / admin (Egzona / receptionspersonal)

**Roll:** Du hanterar identitet, bokning och frågor från personal.

### Får göra
- Ta emot eskaleringar från personal (identitet/dubbletter)
- Verifiera och merga kundkort vid behov
- Hantera GDPR-frågor från patienter (export, radering)
- Övervaka Ops Workbench för blocker-köer (mail/photo/Drive)
- Klassificera importerat material i review-kön
- Boka och flytta möten

### Får INTE göra
- Skapa nya journalposter (det är personalens roll)
- Använda extern AI på patientdata
- Approva mail-kandidater utan deterministiska fält
- Aktivera Aisia / Fortnox-write / nya integrationer

### När eskalera
- Tekniskt fel som blockerar flera personal → Fazli direkt
- GDPR-radering: dokumenterad förfrågan → Fazli + juridisk hantering
- Misstänkt incident (data-läcka, fel-routing) → Fazli direkt

### Vilka länkar används
- `/cco-personal-start.html` — överblick
- `/cco-ops-workbench.html` — blocker-köer (mail/photo/historik)
- `/personal-demo.html` — live-status under pilot
- `/cco-journalpilot-go-live.html` — roller och scenarios
- `/kunder.html` — kundlistan för merge/admin
- Ops-status JSON: `/cco-presentation-ops-status.json`

---

## 🎯 Fazli / owner

**Roll:** Du ansvarar för systemet och löser tekniska problem.

### Får göra
- Vara tillgänglig dag 1 för P0/P1-problem
- Övervaka Command Center + Render-loggar för fel
- Eskalera till Cursor/Claude för fix när nödvändigt
- Besluta om pilot stoppas eller fortsätter
- Aktivera nästa fas (mail-dagligt, Photo Review, Aisia) när redo
- Köra `npm run cco:4june-morning-check` + `npm run cco:presentation-gate`

### Får INTE göra
- Aktivera nya spår (Aisia, Fortnox-write, mail-dagligt) under pilot
- Justera journalroutes utan UAT
- Trigga deploys utan att verifiera gate post-deploy

### När eskalera (delegera)
- UI-renderbug → Cursor (write-spår) eller Claude (display)
- Backend-route-fel → Cursor + skärmdump + commit-SHA
- Compliance/GDPR-fråga → juridisk + admin/ops
- Patient-incident → admin/ops + dokumentera

### Vilka länkar används
- `/personal-demo.html` — live GO/WAIT/P0
- `/cco-morning-checklist.html` — T-10 → T-0 routine
- `/cco-presenter-mode.html` — 14-stegs flow + timer (under meeting)
- `/cco-personal-start.html` — vad personalen ser
- Render dashboard: srv-d8b3i3tckfvc73clgeng
- GitHub: compliance/pipedrive-pii-purge branch

---

## 📋 Revisor / observatör (om tillämpligt)

**Roll:** Extern part som följer pilotens compliance-aspekter.

### Får göra
- Läsa Daily Readiness Report
- Ta del av audit-spår och journalstruktur
- Återkoppla till Fazli vid feedback eller observationer
- Granska statistik och presentations-material

### Får INTE göra
- Röra patientdata direkt
- Läsa eller ändra individuella journalposter
- Skapa eller signera poster
- Påverka pilot-flödet under pågående arbetsdag

### När eskalera
- Compliance-fråga → Fazli + juridisk
- Avvikelser i flödet → Fazli (dokumentera observation)

### Vilka länkar används
- `docs/strategy/CCO-DAILY-READINESS-2026-06-04.md` — daglig status
- `docs/strategy/CCO-PERSONAL-PRESENTATION-READINESS-2026-06-04.md` — pilot-status
- `docs/strategy/CCO-END-TO-END-UAT-2026-05-31.md` — UAT-resultat
- `docs/strategy/CCO-FIRST-3-PATIENTS-PILOT-PLAN-2026-06-04.md` — pilot-plan

---

## Eskaleringsmatris (snabbreferens)

| Problem | Eskalera till | Hur |
|---|---|---|
| Osäker identitet | Admin/ops (Egzona) | Säg "en sekund" till patient → fråga admin |
| Misstänkt dubblett | Admin/ops | Radera inte själv |
| Skrivit på fel patient | Fazli direkt | STOPPA. SPARA INTE. Stäng kortet. |
| Tekniskt fel (sida hänger / trasig) | Fazli | Skärmdump + URL + tidpunkt |
| GDPR-export-förfrågan | Admin/ops | "Jag vidarebefordrar till admin" |
| Patient frågar om gamla bilder | Säg själv | "Vi har dem men granskar fortfarande" |
| Patient frågar om Fortnox-faktura | Säg själv | "Pausad integration — manuell tills vidare" |

---

_Hair TP Clinic · 4 juni 2026 · Journalpilot dag 1_
