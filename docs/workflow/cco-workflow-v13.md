# CCO — Workflow V13 · Hela kundresan (Hair TP Clinic + Curatiio)

> **Syfte:** en detaljerad, automatiserbar workflow i CCO för hela företaget. Varje steg visar **vad kunden gör/får**, **vad personalen gör/använder**, **vad CCO-systemet registrerar**, och vilket **dokument + journaltyp** som hör till respektive behandling.
> **Källa:** Figma "FlowChart | Leo" (nod **Flow 26**) som strukturmodell + CCO-implementering (kundresans 9 steg `buildJourneyFromState`) + de **förberedda dokumenten** i `public/major-arcana-preview/`.
> **Körfält (ansvariga):** 🟣 Kund · 🌸 **CCO** (fd "Meridiq") · 🟢 Personal · 🔵 Ekonomi
> **Datum:** 2026-08-25

---

## 1. Struktur — swimlanes × livscykel

Workflowen är en **swimlane**: fyra körfält (Kund / CCO / Personal / Ekonomi) som korsas av **livscykel-steg** längst upp.

| Livscykel     | Kundresa-fas                                            |
| ------------- | ------------------------------------------------------- |
| INTEREST      | Upptäckt & intresse                                     |
| CONSIDERATION | Konsultation (fysisk/online) + val av behandlingsväg    |
| CONVERSION    | Offert & behandlingsplan + bokning                      |
| SERVICE       | Förberedelse → Behandling → Betalning                   |
| LOYALTY       | Eftervård, PRP-uppföljningar, månatliga uppföljningar   |
| ADVOCACY      | Resultat, före/efter-bilder, rekommendation & återkomst |

**Regel:** alla dokument är förberedda i repo och pekas ut nedan. Målet är att CCO automatiserar hela kedjan så att ingen data skrivs in två gånger och alla mail/påminnelser går av sig själva.

---

## 2. Behandlingsvägar (efter konsultation)

En kund går först på **konsultation** (fysisk **eller** online) och väljer sedan **en** behandlingsväg:

| #   | Väg                          | Behandlingsförlopp                                                             |
| --- | ---------------------------- | ------------------------------------------------------------------------------ |
| A   | PRP **hår**                  | 3–4 behandlingar, ~4 veckor mellanrum + uppföljning ~2 mån efter sista         |
| B   | PRP **hud**                  | 3–4 behandlingar, ~4 veckor mellanrum + uppföljning ~2 mån efter sista         |
| C   | **Hårtransplantation**       | Op-dag (+ PRP 1/4 på plats) → PRP 2/4, 3/4, 4/4 → uppföljningar mån 4 / 8 / 12 |
| D   | **Ögonbrynstransplantation** | samma som C (PRP 1/4 på plats, +3 PRP, uppföljning 4/8/12)                     |
| E   | **Skäggtransplantation**     | samma som C (PRP 1/4 på plats, +3 PRP, uppföljning 4/8/12)                     |
| F   | Curatiio estetik             | Botox, fillers, profhilo, ögonlock m.fl. — enligt behandlingsplan              |

> **Transplantation (C/D/E):** op-dagen inkluderar **en PRP på plats** (= PRP 1/4). Därefter **tre extra PRP-uppföljningsbehandlingar** (2/4, 3/4, 4/4) och sedan **tre uppföljningar vid mån 4, 8 och 12** — **mån 12 är slutresultatet**.
> **PRP (A/B):** **3–4 behandlingar** med **~4 veckors mellanrum**, sedan **en uppföljning ~2 månader** efter sista behandlingen.

---

## 3. Fas-för-fas (steg 1–9)

### FAS 1 — Upptäckt & intresse · _INTEREST_

- **Kund:** kommer in via webben (hairtpclinic.com / curatiio.com), Instagram eller telefon.
- **Personal:** ej inblandad — kanalerna sköts av marknad (WordPress, Instagram).
- **CCO:** webbformulär → in som potentiell kund.

### FAS 2 — Bokning · _CONSIDERATION → CONVERSION_

- **Kund:** bokar konsultation — **online** eller **fysisk**; godkänner personuppgiftspolicy, bokningsvillkor & GDPR.
- **CCO:** bokningsmotor reserverar → `Bokning slutförd`; **AutoMail-bokningsbekräftelse** skickas (innehåller hälsodeklaration + tjänstespec).
- **Dokument:** `steg2-auto-bokningsbekraftelse-final-demo.html`

### FAS 3 — Konsultation · _CONSIDERATION_

- **Kund:** fyller **hälsodeklaration**. Antingen **fysiskt på plats**, eller **online** — då skickas en **länk före konsultationen**.
- **Personal:** genomför konsultation (fysisk/online) enligt **konsultationsmall**, gör **ID-verifiering**, stämmer av hälsodeklarationen och avgör behandlingsbarhet + val av behandlingsväg.
- **CCO:** `Hälsodeklaration | Reg.` → kundkort, kalender.
- **Dokument (kund):** `steg3-halsodeklaration-final-demo.html`, `steg3-halsodeklaration-curatiio-final-demo.html`, `steg3-health-questionnaire-eng-final-demo.html`
- **Dokument (personal):** `steg4-konsultationsmall-final-demo.html`, `steg4-id-verifiering-final-demo.html`
- **Info (kund), beroende på väg:** `steg4-prp-hair-info-sve-final-demo.html`, `steg4-prp-hair-info-eng-final-demo.html`, `steg4-botulinum-info-final-demo.html`, `steg4-hyalase-info-sve-final-demo.html`, `steg4-microneedling-info-sve-final-demo.html`

### FAS 4 — Offert & behandlingsplan · _CONVERSION_

- **Kund:** får offert, läser (inkl. tjänstespec + ev. ritningar), accepterar → `Offert | Accepterad`.
- **Personal:** tar fram offert per varumärke/väg, markerar `Offert | Accepterad`, bokar behandlingstid → `Behandlingstid | Bokad`.
- **CCO:** offenktmodul (kommersiell store). Påminnelser (x4) är i dag **manuella**.
- **Dokument:** `steg5-offert-tp-final-demo.html`, `steg5-info-offert-tp-final-demo.html`, `steg5-behandlingsplan-staff-final-demo.html`, `steg5-offert-prp-skin-final-demo.html`, `steg5-offert-profilo-final-demo.html`, `steg5-offert-prf-final-demo.html`, `steg5-offert-microneedling-final-demo.html`

### FAS 5 — Förberedelse inför behandling · _SERVICE_

- **Kund:** godkänner/skriver avtal, avstår ångerrätt (2 v.), bildhantering, bokningsvillkor; fyller **friskförsäkran**.
- **Personal:** gör **pre-OP** (ID & friskförsäkran, vitalparametrar, bekräfta behandlingsplan, rakning/ritning/pre-OP-foto).
- **CCO:** alla dokument måste gå till `Godkänd` innan behandling.
- **Dokument:** `steg6-angerratt-samtycke-final-demo.html`, `steg6-betanketid-samtycke-final-demo.html`, `steg6-auto-betanketid-final-demo.html`, `steg8-friskforsakran-final.html`

### FAS 6 — Behandling · _SERVICE_

#### 6a. PRP hår / PRP hud (A/B)

- **Personal:** utför PRP enligt plan; dokumenterar varje tillfälle.
- **Journaltyp:** **PRP-journal (multi)** — separat journal per behandling (1/4 … 4/4, eller 1/3–3/3).
- **Dokument:** `steg8-journal-prp-multi-final-demo.html`, `steg8-fore-efter-bildmall-final-demo.html`, `steg8-ordination-recept-final-demo.html`

#### 6b. Hår/ögonbryn/skäggtransplantation (C/D/E)

- **Personal:** OP enligt plan. Ordning: medicinsk instruktion → lokalbedövning 1 & 2 → extraktion → kanaler → implantation → **PRP 1/4** → post-OP-foto.
- **Ordination:** **individuell ordination** skrivs av **läkare** — sjuksköterskor ser den, kunden **ser den ej**.
- **Journaltyp:** **TP-journal** (operation) + **TP-post-PRP-journal**.
- **Dokument:** `steg8-journal-tp-final-demo.html`, `steg8-journal-tp-post-prp-final-demo.html`, `steg8-ordination-tp-final-demo.html`, `steg8-ordination-recept-final-demo.html`

#### 6c. Curatiio estetik (F)

- **Personal:** utför enligt plan (Botox, fillers, profhilo, ögonlock).
- **Journaltyp:** **Estetik-journal** per behandling.
- **Dokument:** `steg5-offert-profilo-final-demo.html` o.dyl., `steg8-journal-tp-final-demo.html` (mall) / motsvarande.

### FAS 7 — Betalning & fakturering · _SERVICE_

- **Kund:** betalar förskott **20 %**, därefter slutbetalning **80 %**; får mail med fakturauppgifter.
- **Ekonomi:** fakturerar 20 % → 80 % (`Förskott betald` → `Slutfaktura | Betald`).
- **Dokument:** `steg7-offert-tp-final-demo.html`, `steg7-v6-kundkort-final-demo.html`

### FAS 8 — Eftervård & uppföljning · _SERVICE → LOYALTY_

- **Kund:** följer eftervårdsråd + kommer på uppföljningar.
- **Personal:** bokar och genomför uppföljningar; journalför + före/efter-bilder varje tillfälle; AutoMail + påminnelse.

**Per väg:**
| Väg | Uppföljningar | Journaltyp |
| --- | --- | --- |
| PRP hår/hud | ~2 mån efter sista behandling | PRP-journal |
| Hårtransplantation | PRP 2/4 → 3/4 → 4/4 | TP-post-PRP-journal |
| Hårtransplantation | mån 4 / 8 / 12 (12 = slutresultat) | TP-uppföljningsjournal (4/8/12) |
| Ögonbryn/skägg | samma som hårtransplantation | samma som hårtransplantation |
| Curatiio estetik | enligt behandlingsplan | Estetik-journal |

- **Dokument:** `steg8-journal-tp-follow-4-final-demo.html`, `steg8-journal-tp-follow-6-final-demo.html`, `steg8-journal-tp-follow-12-final-demo.html`, `steg8-fore-efter-bildmall-final-demo.html`

### FAS 9 — Resultat, rekommendation & återkomst · _LOYALTY → ADVOCACY_

- **Kund:** nöjd, återkommer eller rekommenderar.
- **Personal/marknad:** publicerar resultatbilder (med samtycke) → Instagram → Awareness.
- **Dokument:** `steg9-foto-samtycke-final-demo.html`

---

## 4. Dokument till **kunden** (vad kunden får & godkänner)

| Steg         | Dokument (kund)                                                                                    | Fil                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Bokning      | Bokningsbekräftelse, hälsodeklaration + tjänstespec-länk                                           | `steg2-auto-bokningsbekraftelse-final-demo.html`                                       |
| Konsultation | Hälsodeklaration, tjänstespec-information (per väg), ID-verifiering                                | `steg3-*`, `steg4-prp-hair-info-sve/eng`, `steg4-botulinum/hyalase/microneedling-info` |
| Offert       | Offert + behandlingsplan + tjänstespec + ritningar                                                 | `steg5-offert-*`, `steg5-info-offert-tp-final-demo.html`                               |
| Förberedelse | Behandlingsavtal, avstå ångerrätt 2 v., bildhantering, bokningsvillkor, betänketid, friskförsäkran | `steg6-*`, `steg8-friskforsakran-final.html`                                           |
| Behandling   | Behandlingsbekräftelse (AutoMail), samtycke bildhantering                                          | `steg5-behandlingsplan-staff-final-demo.html`                                          |
| Betalning    | Faktura 20 % / 80 %                                                                                | `steg7-offert-*`                                                                       |
| Uppföljning  | Påminnelse (24 h), eftervårdsråd                                                                   | AutoMail                                                                               |
| Resultat     | Foto-samtycke, resultatbilder                                                                      | `steg9-foto-samtycke-final-demo.html`                                                  |

## 5. Dokument **personalen** använder (dokumenterar/internt)

| Steg                         | Dokument/verktyg (personal)                                                          | Fil                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Konsultation                 | Konsultationsmall, ID-verifiering, kundkort                                          | `steg4-konsultationsmall-final-demo.html`, `steg4-id-verifiering-final-demo.html`, `steg7-v6-kundkort-final-demo.html`                                                                                         |
| Offert                       | Behandlingsplan (staff), offert                                                      | `steg5-behandlingsplan-staff-final-demo.html`                                                                                                                                                                  |
| Förberedelse                 | Pre-OP-kontroll, friskförsäkran                                                      | `steg8-friskforsakran-final.html`                                                                                                                                                                              |
| Behandling (transplantation) | **Ordination (läkare — EJ kund)**, TP-journal, post-PRP-journal, före/efter-bildmall | `steg8-ordination-tp-final-demo.html`, `steg8-ordination-recept-final-demo.html`, `steg8-journal-tp-final-demo.html`, `steg8-journal-tp-post-prp-final-demo.html`, `steg8-fore-efter-bildmall-final-demo.html` |
| Behandling (PRP)             | PRP-journal (multi), ordination                                                      | `steg8-journal-prp-multi-final-demo.html`, `steg8-ordination-recept-final-demo.html`                                                                                                                           |
| Uppföljning                  | TP-uppföljningsjournal (4/8/12), PRP-journal, bildbank                               | `steg8-journal-tp-follow-4/6/12-final-demo.html`                                                                                                                                                               |
| Journal-bygge                | Journalplan-editor, QA/safety                                                        | `journal-plan-editor-demo.html`, `cco-journal-qa-v3.html`, `cco-journal-safety-v3.html`, `cco-journalbygge-v3.html`                                                                                            |

---

## 6. Journaltyp per behandling

| Behandling                     | Journaltyp                          | Berörda filer                                                                   |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------- |
| PRP hår                        | PRP-journal (multi, per behandling) | `steg8-journal-prp-multi-final-demo.html`                                       |
| PRP hud                        | PRP-journal (multi)                 | `steg8-journal-prp-multi-final-demo.html`                                       |
| Hårtransplantation             | TP-journal + TP-post-PRP-journal    | `steg8-journal-tp-final-demo.html`, `steg8-journal-tp-post-prp-final-demo.html` |
| Hårtransplantation-uppföljning | TP-uppföljningsjournal (4/8/12)     | `steg8-journal-tp-follow-4/6/12-final-demo.html`                                |
| Ögonbryn/skäggtransplantation  | TP-journal (+ uppföljning 4/8/12)   | samma som hårtransplantation                                                    |
| Curatiio estetik               | Estetik-journal per behandling      | `steg5-offert-*`, `steg8-journal-tp-final-demo.html` (mall)                     |

---

## 7. Varumärkes-skillnader

| Område       | Hair TP Clinic                                      | Curatiio                                 |
| ------------ | --------------------------------------------------- | ---------------------------------------- |
| Behandlingar | PRP-hår, hår/ögonbryn/skäggtransplantation          | Botox, fillers, profhilo, ögonlock m.fl. |
| Avtal        | TP Behandlingsavtal, ångerrätt 2 v.                 | Estetik-avtal, bildsamtycke              |
| Journaler    | TP-journal, PRP-journal, uppföljningsjournal 4/8/12 | Estetik-journal                          |
| Konsultation | Hårspecialist/klinikchef, läkare                    | Sjuksköterska/läkare                     |
| Uppföljning  | PRP 2–4 + mån 4/8/12                                | Enligt behandlingsplan                   |

**Gemensamt:** samma flöde, samma CCO-verktyg, samma regler (hälsodeklaration, friskförsäkran på op-dag, ordination ej till kund, journal + bilder varje besök).

---

## 8. Regler & knytpunkt (viktigt)

1. **Hälsodeklaration** — fylls med **alla** kunder. Antingen **fysiskt när de är på plats**, eller **online** (länk skickad **före** konsultationen).
2. **Friskförsäkran** — fylls **enbart samma dag** som kunden kommer på **operationsdagen**, oavsett operation.
3. **Ordination** — **individuell**, skrivs av **läkaren** till **alla patienter som ska genomgå en transplantation**. Sjuksköterskor ser den; **kunden ser den inte.**
4. **Journal + bilder** — varje tillfälle kunden är här **journalförs** (journal + före/efter-bilder).
5. **Knytpunkt:** samma CCO-data bärs genom hela kedjan — kunden lämnar den, personalen använder den, systemet sparar den. Ingen dubbel registrering.

---

## 9. Automatisering — målet för V13

| Del                                    | Status                                | Ska bli                         |
| -------------------------------------- | ------------------------------------- | ------------------------------- |
| Kundresa 9 steg                        | ✅ `buildJourneyFromState` / V11-rail | Behåll                          |
| Bokningsmotor + AutoMail               | ✅ ccoBookingEngineStore              | Behåll                          |
| Offert / accepterad                    | ✅ kommersiell store                  | Behåll                          |
| Hälsodeklaration + friskförsäkran      | ✅ (kundresan steg 2/8)               | Behåll                          |
| Dokument (avtal, samtycken)            | ✅ ok/avstå-ångerrätt                 | Behåll                          |
| Journaler per besök                    | ✅ Besök · tillfällen                 | Behåll                          |
| Ekonomi (värde/skuld)                  | ✅ V11-rail                           | Behåll                          |
| **AutoMail-påminnelser ×4**            | ⚠️ Manuellt                           | **Automatisera**                |
| **Anpassat erbjudande / resultatmail** | ⚠️ Manuellt                           | **Automatisera**                |
| **Instagram-publicering**              | ⚠️ Manuellt                           | Delvis auto (samtycke → utkast) |
| **Fakturering 20/80**                  | ⚠️ Befintlig lösning                  | **Flytta in i CCO**             |

**Nästa steg:** automatisera de streckade stegen och koppla dokumenten ovan till respektive fas så att hela kedjan körs i CCO utan dubbel registrering.
