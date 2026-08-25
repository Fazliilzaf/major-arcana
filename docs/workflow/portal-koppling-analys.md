# Portalanalys — Kundportal + Staffportal → CCO-koppling

> **Datum:** 2026-08-25 · **Mål:** hela kundresan + personalresan hänger ihop i CCO (kunder · konversationer · kalender + portalerna)
> **Analyserade filer:**
>
> - Staff: `Desktop/Arcana/encounter-typed-fallback/public/staff-portal.html` ("CCO · Personalportal")
> - Kund: `Code/major-arcana-cmo-weekly-report/public/major-arcana-preview/cco-patient-offer-portal-v3.html` ("Din plan · Hair TP Clinic")

---

## 1. STAFF-PORTALEN ("CCO · Personalportal") — vad personalen ser/gör

### Vyerna

| Vy                        | Innehåll                                                    |
| ------------------------- | ----------------------------------------------------------- |
| **Daglig arbetskö**       | Kö av ärenden för dagen — sökbar ("Sök kund, datum, pris…") |
| **Delegerad kundinbox**   | Inbox delegerad till personal                               |
| **Delegerad bildinkorg**  | Bildgranskning väntar → "Granska bilder"                    |
| **Mina uppgifter**        | Personalens egna uppgifter                                  |
| **Väntande ordinationer** | Ordinationer att hantera ("Enligt allmän ordination")       |
| **Kliniköversikt**        | Överblick kliniken                                          |
| **Handbok & dokument**    | Dokumentunderlag + bildunderlag                             |

### Vad personalen fyller i / gör

- **Hälsodeklaration kontrollerad och signerad** ✅
- **Friskförsäkran kontrollerad och signerad** ✅
- **Checklistor / checkpunkter** (QMS-checklistor — "Checklista klar/kvar", "Checkpunkt klar")
- **Bildgranskning** (approve/reject)
- **Anteckningar/kommentarer** (data-field: comment, note)
- **Signering** (data-field: signature)
- **Hårsäckar / graft** (graft-antal för TP)
- **Notiser** (t.ex. "postop dag 7" — påminnelser)
- **Live-badges:** konversationer, uppföljningar, notiser, ägaruppföljningar, offerter, prioriteringar, granskningskö, uppgifter

---

## 2. KUNDPORTALEN ("Din plan · Hair TP Clinic" — offer portal v3) — vad kunden ser/gör

### Sektionerna

| Sektion                         | Innehåll                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Läs igenom din offert**       | Offert + totalkostnad: Förskottsbetalning (erlagd) + Resterande på operationsdagen + Totalt paketpris          |
| **Min trygga resa**             | Kundresan visualiserad (steg → "Visa steg →") — dagar till operation                                           |
| **Inför operationsdagen**       | Pre-op-information                                                                                             |
| **Eftervård och uppföljning**   | Eftervård + "4 · Uppföljning"                                                                                  |
| **Godkänn din behandlingsplan** | Behandlingsplan med zoner (plan-evidence: zoner, metrics, chips) + **BankID-knapp** (btn-bankid — e-signering) |
| **Din CCO-tråd**                | Konversation med kliniken                                                                                      |
| **Betänketid**                  | Nedräkning (betatid-expire) + "Påminn mig 3 dagar innan betänketiden löper ut"                                 |
| **Vanliga frågor**              | FAQ                                                                                                            |
| **Din portal är säkrad**        | Säkerhetsgaranti                                                                                               |
| Övrigt                          | Anonym patientberättelse (Norwood III · DHI)                                                                   |

### Vad kunden fyller i / gör

- Godkänner **offert + behandlingsplan** (med BankID-signering)
- Ser **betänketid** och kan få påminnelse
- Ser **betalningsstatus** (förskott erlagd + resterande)
- Följer **resan** (steg för steg) och **eftervård/uppföljning**
- Chattar via **CCO-tråden**

---

## 3. Koppling till CCO-kundresan (9 faser)

| Fas             | Kunden (portal)                        | Personalen (staffportal + CCO)                            | System (CCO)               |
| --------------- | -------------------------------------- | --------------------------------------------------------- | -------------------------- |
| 1 Upptäckt      | —                                      | Marknad                                                   | Webb/Instagram             |
| 2 Bokning       | (bokar via webb)                       | Arbetskö                                                  | Kalender, bokningsmotor    |
| 3 Konsultation  | Hälsodeklaration                       | **Hälsodeklaration kontrollerad + signerad**              | Kundkort                   |
| 4 Offert & plan | **Läs offert · Godkänn plan (BankID)** | Skapar offert/plan                                        | Offerter, commercial store |
| 5 Förberedelse  | Betänketid, Friskförsäkran             | **Friskförsäkran kontrollerad + signerad**, checklistor   | Dokument                   |
| 6 Behandling    | Inför operationsdagen                  | **Ordination, graft-antal, bildgranskning, checkpunkter** | Journal, kalender          |
| 7 Betalning     | **Förskott erlagd + resterande**       | Ekonomi                                                   | Ekonomi-modul              |
| 8 Eftervård     | **Eftervård + uppföljning (4/6/12)**   | Notiser ("postop dag 7"), uppföljningskö                  | Besök, journaler           |
| 9 Resultat      | CCO-tråd, FAQ                          | Live-badges (uppföljningar)                               | —                          |

---

## 4. Kopplingsplan (så hänger allt ihop)

### A. Gemensam datakärna (redan i CCO)

- **Patientmaster** (kunder) — samma patient i alla ytor
- **Bokningsmotor** (kalender) — tider som kund + personal ser
- **Konversationer** — kundens CCO-tråd = personalens inbox (delegerad)
- **Kundresan (9 steg)** — en källa: `buildJourneyFromState`

### B. Steg för att koppla portalerna

1. **Kundportalen hämtar kundresan från CCO** (inte egen kopia) — samma steg-status som V11-railen
2. **BankID-signeringen** (kundportal) → skriver signaturstatus tillbaka till CCO (dokument: friskförsäkran, behandlingsplan)
3. **Staffportalens checkpunkter/signering** → skriver samma status som kunden ser ("kontrollerad och signerad")
4. **Ordinationer/graft** → koppla till behandlingsplanen kunden godkänner
5. **Betalningsstatus** → delas mellan kundportal (förskott/resterande) och CCO-ekonomi
6. **Notiser/påminnelser** (postop dag 7, betänketid) → samma händelsekälla

### C. Placering i repot

- Kundportalen flyttas in i `major-arcana` (nu ligger den i en **annan fork**: `major-arcana-cmo-weekly-report` — se AGENTS.md working-copy-regel)
- Staffportalen flyttas in i `major-arcana` (nu i `Desktop/Arcana/encounter-typed-fallback`)

---

## 5. Risker/noteringar

- **Två repo-kopior** (major-arcana-cmo-weekly-report, Desktop/Arcana) → måste samlas i huvudrepon
- **Dubbla kundresor** om portalerna inte läser CCO:s journey — en källa krävs
- **Signering** (BankID) måste skriva till samma dokumentstatus som personalen granskar
