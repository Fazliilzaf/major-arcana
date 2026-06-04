# First Week · Journal Rollout Plan · 4–10 juni 2026

> Strukturerad plan för första veckans rollout av journalpiloten i Hair TP Clinic. Kontrollerad eskalering. Tydliga stopp-kriterier. Inget som inte är klart får aktiveras.

---

## Princip

**Långsamt och säkert.** Vi börjar med få kända patienter, bygger självförtroende, och eskalerar volymen först när allt fungerar utan friktion. Pilot är inte cutover — det är **kontrollerad start**.

| Dag | Datum | Volym | Fokus |
|---|---|---|---|
| 1 | tor 4 juni | 1–3 kända patienter | Bekräfta att grundflödet fungerar live |
| 2 | fre 5 juni | 4–8 kända patienter | Bygg vana · börja känna sig hemma |
| 3 | lör 6 juni / mån 8 juni | Hela dagens bokningar | Börja använda importerad historik mer aktivt |
| 4 | tis 9 juni | Hela dagens bokningar | Samla feedback · åtgärda P0/P1 |
| 5 | ons 10 juni | Hela dagens bokningar | Bedöm om vi går till vardagsläge |

---

## Dag 1 · 4 juni — 1–3 kända patienter

**Mål:** Verifiera grundflödet i live-läge enligt First 3 Patients Pilot Plan.

**Aktiviteter:**
- Pilot startar efter personalmötet (~kl 10–11)
- Personal kör 3 testpatienter enligt `CCO-FIRST-3-PATIENTS-PILOT-PLAN-2026-06-04.md`
- P1: enkel journal · P2: rättelse-test · P3: historik + review-material-varning
- Fazli observerar Command Center + Render-loggar
- Egzona observerar Ops Workbench

**Kontroller efter dagen:**
- [ ] 3 journaler signerade utan fel
- [ ] 1 rättelse skapad korrekt
- [ ] Inga 5xx i Render
- [ ] Personalen säger "det kändes ok"
- [ ] `npm run cco:presentation-gate` PASS

**Stopp-kriterier:**
- 5xx-fel i journal-API
- Signerad post går att ändra direkt
- Trasig UI-rendering
- Personalen visar tecken på osäkerhet

---

## Dag 2 · 5 juni — 4–8 kända patienter

**Mål:** Bygg vana. Personalen ska börja känna sig självgående.

**Aktiviteter:**
- Fortfarande **kända patienter** — inga nya
- Personalen öppnar `/cco-after-meeting-start.html` vid behov för stöd
- `/cco-journal-safety-helper.html` öppen i sido-flik som checklist
- Eskalering enligt rollkort vid osäkerhet
- Egzona finns för identitetsfrågor

**Kontroller efter dagen:**
- [ ] 4–8 journaler signerade
- [ ] Personalen kan signera utan att fråga Fazli om varje steg
- [ ] Pre-Signering Check används av minst en personal
- [ ] Inga incidenter
- [ ] Gate fortsatt PASS

**Stopp-kriterier:**
- Samma som dag 1
- Eskalering > 3 ggr per personal (för många frågor → otillräcklig träning)

---

## Dag 3 · 6 eller 8 juni — Hela dagens bokningar, börja med historik

**Mål:** Börja använda importerad historik mer aktivt **som referens**.

**Aktiviteter:**
- Personal får använda importerad historik (badges: `imported`, `needs review`) som **referens** när de skriver journal
- Öppna `/cco-review-material-warning.html` vid behov för att påminna sig
- Patient frågar om gamla bilder → säg "vi har dem men granskar fortfarande"
- Patient frågar om importerade journaler → bekräfta muntligt först, skriv ny journal

**Kontroller efter dagen:**
- [ ] Inga "behöver granskning"-material som klinisk sanning
- [ ] Personalen formulerar korrekt ("patienten uppger…" inte "enligt importerad…")
- [ ] Egzona ser inga felaktiga klassificeringar i Ops Workbench
- [ ] Gate fortsatt PASS

**Stopp-kriterier:**
- Personal kopierar review-material direkt till journal
- Diagnos eller dosering baserad på oferifierat material
- Importerat material renderas felaktigt som klinisk sanning

---

## Dag 4 · 9 juni — Feedback + P0/P1-fixar

**Mål:** Samla strukturerad feedback från personalen och åtgärda eventuella P0/P1-issues.

**Aktiviteter:**
- Fazli intervjuar varje personal kort (5 min) — vad funkade, vad var krångligt
- Sammanställ topplista över friktion
- Åtgärda P0/P1 (UI-renderbug, otydlighet, saknad länk)
- Inga server-ändringar utan UAT
- Cursor får bygga vidare på operatörsverktyg om behov uppstår

**Kontroller efter dagen:**
- [ ] Feedback-dokument skapat (intervjuanteckningar)
- [ ] P0/P1-lista prioriterad
- [ ] Eventuella fixar deployade + gate PASS
- [ ] Personal mår fortsatt bra med pilot

**Stopp-kriterier:**
- Personalen rapporterar systematiskt fel
- Friktion gör att personalen undviker CCO

---

## Dag 5 · 10 juni — Bedöm vardagsläge

**Mål:** Avgöra om vi går från "kontrollerad pilot" till "vardagsläge".

**Aktiviteter:**
- Genomgång med Fazli + Egzona av veckan
- Antal signerade journaler · antal rättelser · antal eskaleringar
- Bedöm: är personalen självgående? finns det blockers kvar?
- Beslut: fortsätt pilot · gå till vardagsläge · pausa pilot

**Kontroller:**
- [ ] Total volym över veckan dokumenterad
- [ ] Inga incidenter återstår
- [ ] Personalen rekommenderar fortsatt CCO-användning
- [ ] Gate fortsatt PASS

**Vardagsläge betyder:**
- Personalen använder CCO som default-journalsystem för alla nya besök
- Importerad historik används som referens
- Eskalering sker bara vid äkta osäkerhet
- Daily Readiness uppdateras dagligen

---

## Vad som fortfarande INTE används första veckan

Dessa spår är **explicit pausade** under hela första veckan. De aktiveras tidigast efter pilot-veckan om allt går bra.

| Spår | Status | Aktiveras tidigast |
|---|---|---|
| **Mail som dagligt verktyg** | aktivering pågår | när Cursor verifierar Phase 3-flöde |
| **Photo Review som klinisk bildsanning** | ~885 assets needs review | när review-kön är < 100 + UAT klart |
| **Aisia / kamera/scalp** | bakom feature flag | när owner uttryckligen säger "APPLY AISIA TO CCO" |
| **Fortnox-write** | blockerad — license error | när Fortnox-licens är löst på leverantörens sida |
| **Full cutover** | inte definierat | efter minst 4 veckors stabil pilot |
| **Drive-import-batch 2** | pausad | efter explicit GO från owner |
| **Mailimport (ny batch)** | pausad | efter explicit GO från owner |
| **Extern AI på journaltext** | förbjudet | aldrig (GDPR-policy) |
| **OCR/AI auto-classify** | inte aktivt | inte i scope för pilot |

---

## Eskaleringskedja — första veckan

| Issue-typ | Första kontakt | Sekundär | Tertiär |
|---|---|---|---|
| Identitet · dubbletter | Admin/ops (Egzona) | Fazli | — |
| Tekniskt fel · krasch | Fazli | Cursor (write-spår) | Claude (display) |
| GDPR-fråga · radering | Admin/ops + Fazli | Juridisk | — |
| Patient-incident · fel patient | Fazli direkt | Admin/ops | Juridisk om patient lider skada |
| UI-renderbug | Cursor (operator) eller Claude (pilot) | Fazli prioriterar |
| Performance · 5xx | Fazli + Render dashboard | Cursor backend | — |

---

## Daglig rapportering

Varje dag uppdateras:
- `docs/strategy/CCO-DAILY-READINESS-2026-06-04.md` med dagens status
- Mailbox-counts om Cursor's mail-spår fortsätter
- Photo Review-counts om review pågår
- Journal-volym (signerade · rättelser · eskaleringar)

---

## Slutet av första veckan — go/no-go-beslut

Fredag eller söndag 10–11 juni:

**GO för vardagsläge om:**
- ✅ ≥ 80% av personalen signerar utan eskalering
- ✅ Inga P0/P1-incidenter sista 3 dagarna
- ✅ Gate PASS dagligen
- ✅ Personalen rekommenderar fortsatt användning
- ✅ Photo Review-kön minskar (Cursor jobbar)
- ✅ Mail-counts stabila

**NO-GO om:**
- ❌ Återkommande UI-fel
- ❌ Personalen undviker CCO
- ❌ Incidenter med fel patient
- ❌ Gate FAIL > 1 gång

---

_Hair TP Clinic · 4–10 juni 2026 · Journalpilot · First Week Rollout Plan_
