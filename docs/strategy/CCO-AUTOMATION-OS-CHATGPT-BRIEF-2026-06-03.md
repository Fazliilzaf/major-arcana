# CCO Automation OS — ChatGPT strategi (2026-06-03)

> **Kundresa:** [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](./CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md) · Registry v2: [`CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md`](./CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md). Avsnitt om T-48 friskförsäkran / separat samtycke = **historiskt**, ej build-order.

**Källa:** ChatGPT (oförändrad strategi och briefs).  
**Gemensam (master):** [`CCO-AUTOMATION-OS-ARCHITECTURE-2026-06-03.md`](./CCO-AUTOMATION-OS-ARCHITECTURE-2026-06-03.md)  
**Teknisk svar:** [`CCO-AUTOMATION-OS-CURSOR-TECHNICAL-2026-06-03.md`](./CCO-AUTOMATION-OS-CURSOR-TECHNICAL-2026-06-03.md)  
**UX:** [`CCO-SMART-FUNCTIONS-CHATGPT-UX-BRIEF-2026-06-03.md`](./CCO-SMART-FUNCTIONS-CHATGPT-UX-BRIEF-2026-06-03.md) · [gemensam UX-plan](./CCO-SMART-FUNCTIONS-PRODUCT-PLAN-2026-06-03.md)

---

## Mål

CCO ska inte bara vara ett journalsystem. CCO ska vara ett **automatiserat operationssystem för kliniken**.

Allt som går att förbereda, flagga, föreslå, sortera, påminna, sammanställa och kontrollera ska göras automatiskt — men kritiska vård-/journal-/avtalsbeslut ska fortfarande ha mänskligt godkännande.

### Viktig regel

AI får hjälpa med struktur, förslag, prioritering och sammanfattning — men inte köra externa AI-flöden på journaltext/patientdata utan explicit GO. CCO-scope säger också att journalinnehåll inte ska till extern AI/tredjelands-AI.

---

## Den stora planen: CCO Automation OS

Vi bygger automation i lager, inte som lösa AI-gimmicks.

1. Data foundation
2. Journey engine
3. Next-best-action
4. Worklists
5. Communication automation
6. Clinical safety automation
7. Booking/calendar automation
8. Agreement/consent automation
9. Photo/Drive review automation
10. Finance/CF automation
11. AI copilots — bara där det är säkert

---

## Vad som ska automatiseras först — P0

Det här är inte “nice to have”. Det här gör CCO användbart varje dag.

| Modul          | Automation                                                                      | Mänsklig kontroll            |
| -------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| Kunder         | Räkna segment, flagga saknade journaler/formulär/avtal/encounter, visa nextStep | Personal väljer åtgärd       |
| Journal        | Förifyll mall, checka identitet, varna om review-material används               | Personal signerar            |
| Bokning        | Koppla bokning → kund → encounter → journalstatus                               | Personal bekräftar avvikelse |
| Formulär       | Påminna om hälsodeklaration/friskförsäkran                                      | Patient signerar             |
| Avtal/samtycke | Kontrollera legal gate, avtal, betänketid, saknade samtycken                    | Owner/legal godkänner mallar |
| Review-köer    | Sortera osäkra importer, bilder, mail, encounter                                | Operatör godkänner           |
| Timeline       | Bygga kronologisk kundresa automatiskt                                          | Read-only/audit              |
| Audit          | Logga allt känsligt automatiskt                                                 | Owner/revisor läser          |

---

## CCO “smart functions” (10 moduler)

### 1. Journey Orchestrator

En motor som räknar ut kundens läge från riktig data:

```
lead → bokad konsultation → formulär saknas/klart → konsultation klar
→ offert skickad/accepterad → avtal/samtycke saknas/klart
→ behandling bokningsbar → behandling klar → uppföljning
```

Den ska inte lita på en manuell status, utan räkna från fakta:

`booking + encounter + journal + forms + assets + agreements + payments + communication`

### 2. Next Best Action

På varje kundrad i `/major-arcana-preview/?view=customers`:

- Saknar hälsodeklaration
- Saknar friskförsäkran
- Saknar journal
- Saknar encounter
- Avtal saknas
- Bildreview väntar
- Redo för besök
- Boka uppföljning
- Behöver betalningskontroll

**Viktigt:** först regelbaserat, inte AI. AI kan senare hjälpa med formuleringar, men själva beslutet ska vara deterministiskt.

### 3. Worklist Engine

Istället för att personal letar:

- Dagens patienter
- Saknar journal
- Saknar formulär
- Saknar avtal
- Saknar encounter
- Bilder att granska
- Mail att avgöra
- Import-kundmatchning
- Betalning att följa upp

Det här kan bli en riktig “arbetskö” i CCO.

### 4. Smart Communication

När CCO vet vad som saknas ska den föreslå kommunikation:

- Skicka hälsodeklaration
- Skicka friskförsäkran
- Påminn inför besök
- Skicka avtal
- Skicka eftervård
- Skicka uppföljning

**Första fasen:** human approval — CCO föreslår → personal godkänner → skickas.

### 5. Agreement + Consent Automation

Stor blocker i kundresan. Vi behöver:

- legal_review gate
- avtalsmall per behandling
- samtycke per behandling
- foto-publiceringssamtycke
- digital signering
- betänketid/ångerrätt
- klar-för-behandling gate

**Mål:** Ingen behandling bokas om avtal/samtycke/legal gate saknas.

### 6. Clinical Safety Automation

Inte AI-diagnos. Säkerhetsautomatisering:

- identitetscheck före signering
- varning om review-material
- spärr vid osäker kundmatch
- rättelse som ny post
- journal lock
- audit på läsning/skrivning
- saknade fält i journal

### 7. Calendar + Booking Intelligence

När Kunder och Kalender sitter ihop:

- vem kommer idag
- vem saknar formulär
- vem saknar encounter
- vem har behandling utan avtal
- vem är redo
- vem bör inte komma än

Senare: smart slots, min-notice, behandlare/resurs, återbesök, risk för no-show.

### 8. Photo Review Automation

Inte autoapprove. Men automatisera:

- gruppera bilder per patient
- föreslå bildfas
- föreslå bodyArea
- flagga dubbletter
- flagga okänd encounter
- visa före/efter-kandidat
- prioritera kö

Godkännande ska vara mänskligt.

### 9. Mail Automation

Mail ska bli smart, men inte kaos:

- unified customer thread
- mailbox badge
- true unanswered
- needs action
- SLA
- handled/snoozed
- Svarstudio-context
- Smart anteckning-context

AI får gärna hjälpa med svarsförslag senare, men först måste worklist och truth vara stabilt.

### 10. CF Automation

Chief of Finance kan automatisera:

- kvitto → expense
- leverantör → kategori/moms
- återkommande kostnader
- månadsstängning
- revisorpaket
- Fortnox-sync när blockern är löst

AI/OCR senare, men bara med separat GO.

---

## Byggordning (ChatGPT)

### Fas 1 — Real CCO foundation

1. Kunder 100%
2. Kalender/kunder kopplad
3. Kundkort/dossier komplett
4. Journey readout
5. Next-best-action

### Fas 2 — Operational queues

1. Photo Review queue
2. Import Review queue
3. Mail Review queue
4. Encounter Review queue
5. Missing Forms/Agreements queue

### Fas 3 — Automation engine

1. CCO Automation Rules Store
2. Trigger/event system
3. Rule conditions
4. Human approval queue
5. Audit
6. Feature flags

### Fas 4 — Smart communication

1. Template suggestions
2. Form reminder
3. Agreement reminder
4. Follow-up reminders
5. Svarstudio integration

### Fas 5 — AI copilot, försiktigt

1. AI på metadata, inte journaltext
2. AI på redacted/non-sensitive data
3. AI som förslag, aldrig auto-action
4. Human approval
5. Ingen extern AI på journaldata utan GO

---

## Brief till Cursor (ChatGPT original)

> Cursor, ny strategisk fas: CCO Automation OS.  
> Målet är att automatisera så mycket som möjligt i riktiga CCO, men utan nya demo-lager.  
> **Bygg inte direkt.** Gör först en teknisk automation-arkitektur.  
> Skapa: `docs/strategy/CCO-AUTOMATION-OS-ARCHITECTURE-2026-06-03.md`, `data/reports/cco-automation-os-inventory.json`  
> Utgå från: riktiga `/major-arcana-preview/?view=customers`, `/major-arcana-preview/?view=customers`, customers-shell, booking engine, journal-feed, forms, agreements, assets, review queues, mail truth/worklist, CF stores, CCO-SYSTEM-SCOPE.md, filter/smart-funktioner, mockups, kalender.  
> Rapporten ska svara: (1) vilka automationer finns, (2) vilka saknas per domän, (3) Automation Rules Engine-arkitektur, (4) automation catalog, (5) AI policy, (6) P0/P1/P2, (7) exakt första build-step.  
> Regler: ingen ny demo, ingen support-sida, ingen extern AI på journaldata, ingen autoapproval, ingen massapproval, ingen ny import, inga writes i första analysen.

**Cursors svar:** se [`CCO-AUTOMATION-OS-CURSOR-TECHNICAL-2026-06-03.md`](./CCO-AUTOMATION-OS-CURSOR-TECHNICAL-2026-06-03.md).

---

## Brief till Claude (ChatGPT original — UX)

> Claude, planera CCO Automation OS — produkt/UX, bygg inte UI.  
> Skapa produktplan som svarar på: smarta funktioner personal märker, UI-placering, What/Why/Next, risknivåer, human approval, AI ja/nej, roadmap P0/P1/P2, första UI-step.  
> Regler: bygg inte, ingen ny sida, ingen extern AI, ingen journaldata till AI, bara plan.

**Dokument:** [`CCO-SMART-FUNCTIONS-CHATGPT-UX-BRIEF-2026-06-03.md`](./CCO-SMART-FUNCTIONS-CHATGPT-UX-BRIEF-2026-06-03.md).

---

## ChatGPT:s rekommenderade första build

**CCO Automation Registry + Dry-run Runner**

Den gör inget farligt. Den räknar bara:

- customer missing form
- customer missing journal
- customer missing agreement
- customer has photo review
- customer ready for visit
- customer booking missing encounter

Och visar det i Kunder som **What / Why / Next**.

**Exempel:**

| WHAT            | WHY                                                            | NEXT                                   |
| --------------- | -------------------------------------------------------------- | -------------------------------------- |
| Saknar formulär | Ingen signerad hälsodeklaration finns i cco-forms/halso-import | Skicka formulär / öppna formulärstatus |

Säkert, kraftfullt, gör CCO smart direkt.

---

## Viktig princip (ChatGPT)

|                            |                                      |
| -------------------------- | ------------------------------------ |
| Automation                 | ja                                   |
| AI                         | ja, men kontrollerat                 |
| External AI på journaldata | nej utan explicit GO                 |
| Autoapproval               | nej                                  |
| Massapproval               | nej                                  |
| Human approval             | vård / legal / kundmerge / mail-send |

Det här byggs som ett **Automation OS**, inte som lösa “AI-knappar”.

---

_Endast ChatGPT-strategi. Uppdatera denna fil när ChatGPT reviserar; uppdatera Cursor-filen när kodbasen ändras._
