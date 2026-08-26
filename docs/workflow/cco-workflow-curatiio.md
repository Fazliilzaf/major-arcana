# CCO — Workflow V13 · Curatiio (estetik)

> **Syfte:** samma detaljerade workflow som Hair TP Clinic, men för **Curatiio**-estetiken. Specificerar vad **kunden får**, vad **personalen gör/journalför**, och vilket **CCO-dokument/verktyg** som binder dem — per behandling och per moment.
> **Facit/utgångsläge = Figma "FlowChart | Leo" (nod Flow 26)**, omsatt till CCO.
> **Körfält:** 🟣 Kund · 🌸 **CCO** · 🟢 Personal · 🔵 Ekonomi
> **Datum:** 2026-08-26

---

## 1. Struktur — swimlane × livscykel

| Körfält     | Ansvar                                            |
| ----------- | ------------------------------------------------- |
| 🟣 Kund     | Bokar, godkänner, genomgår behandling, följer upp |
| 🌸 CCO      | System/data: bokning, dokument, journal, bildbank |
| 🟢 Personal | Sjuksköterska / läkare (estetik)                  |
| 🔵 Ekonomi  | Fakturering 20/80                                 |

**Livscykel (kolumner):** `INTEREST → CONSIDERATION → CONVERSION → SERVICE → LOYALTY → ADVOCACY`

---

## 2. Behandlingsvägar (Curatiio)

| #   | Väg                               | Behandlingsförlopp (enligt behandlingsplan / info-dokument) | Journaltyp           |
| --- | --------------------------------- | ----------------------------------------------------------- | -------------------- |
| C1  | **Botox** (botulinumtoxin)        | injektion av botulinumtoxin; resultat följs upp enligt plan | Estetik-journal      |
| C2  | **Fillers**                       | injektion av hyaluronsyra-enhet; följs upp enligt plan      | Estetik-journal      |
| C3  | **Profhilo**                      | injektion (ofta 1–2 sessioner ~4 v mellanrum)               | Estetik-journal      |
| C4  | **Ögonlocksplastik** (bleph)      | kirurgiskt ingrepp; op-dag + återbesök enligt plan          | Estetik-journal (op) |
| C5  | **PRF-hud** (PRF + microneedling) | seriesbehandling enligt plan                                | Estetik-journal      |
| C6  | **Microneedling**                 | seriesbehandling enligt plan                                | Estetik-journal      |
| C7  | **PRP-hud + microneedling**       | PRP + MN enligt plan                                        | Estetik-journal      |
| C8  | **Ortopedi**                      | enligt behandlingsplan                                      | Estetik-journal      |

> **Skillnad mot Hair TP:** inga **PRP 2/4–4/4** eller **mån 4/8/12**-uppföljningar — estetik följs upp **enligt behandlingsplan** per behandling. Vid **kirurgi (ögonlock)** gäller **friskförsäkran på operationsdagen** + uppföljning.

---

## 3. Fas-för-fas (kund / CCO / personal / ekonomi)

### FAS 1 · Upptäckt & intresse · _INTEREST_

- **Kund:** curatiio.com, Instagram, telefon → formulär. **Personal:** ej inblandad.

### FAS 2 · Bokning · _CONSIDERATION → CONVERSION_

- **Kund:** bokar konsultation (online/fysisk), godkänner personuppgiftspolicy + bokningsvillkor & GDPR.
- **CCO:** bokningsmotor + AutoMail-bekräftelse (+ hälsodeklaration + tjänstespec-länk).

### FAS 3 · Konsultation · _CONSIDERATION_

- **Kund:** fyller **hälsodeklaration** (fysiskt på plats, eller **online → länk före besöket**).
- **Personal:** ssk/läkare genomför enligt **konsultationsmall** + **ID-verifiering**; stämmer av hälsodeklaration; avgör behandlingsbarhet + väljer **behandlingsväg**.
- **Info till kund (per väg):** `curatiio-botox/filler/profhilo/ogonlock/prf-hud/prp-hud-mn/ortoped-info`, `steg4-botulinum/hyalase/microneedling-info`.
- **CCO:** `Hälsodeklaration | Reg.` → kundkort, kalender.

### FAS 4 · Offert & behandlingsplan · _CONVERSION_

- **Kund:** får offert, läser (tjänstespec + plan), accepterar → `Offert | Accepterad`.
- **Personal:** tar fram offert per väg, markerar `Offert | Accepterad`, bokar tid → `Behandlingstid | Bokad`.
- **CCO:** offertmodul. Påminnelser x4 = manuellt (ska auto ≤ V13).
- **Offert:** `steg5/7-offert-profilo/prf/microneedling/prp-skin-final-demo.html`.

### FAS 5 · Förberedelse inför behandling · _SERVICE_

- **Kund:** godkänner **estetik-avtal**, **bildsamtycke**, bokningsvillkor.
- **Personal:** pre-OP (ID & friskförsäkran vid **kirurgi**, vitalparametrar, plan).
- **CCO:** dokument `Godkänd` före behandling.
- **Dokument:** `steg6-angerratt-samtycke`, `steg6-betanketid-samtycke`, `steg8-friskforsakran` (kirurgi), `steg8-fore-efter-bildmall`.

### FAS 6 · Behandling · _SERVICE_

- **Personal:** utför per plan (Botox, fillers, profhilo, ögonlock, PRF, MN, PRP-hud-MN, ortopedi); **journal per behandling** + före/efter-bilder.
- **Ordination:** vid injektioner (Botox/läkemedel) skrivs **ordination** av läkare — personal ser, kunden ser den ej.
- **CCO:** journal per besök.

### FAS 7 · Betalning & fakturering · _SERVICE_

- **Kund:** betalar förskott **20 %** → `Förskott betald`, därefter **80 %** → `Slutfaktura | Betald`.
- **Ekonomi:** fakturerar 20/80 → **Faktura 20 % | Mail** + **Faktura 80 % | Mail**.

### FAS 8 · Eftervård & uppföljning · _SERVICE → LOYALTY_

- **Kund:** eftervårdsråd + uppföljningar enligt plan.
- **Personal:** bokar/genomför uppföljning; **journal + före/efter-bilder varje besök**; AutoMail + påminnelse.
- **CCO:** `Journal | enligt behandlingsplan`, `Före & Efter | Bildbank`.

### FAS 9 · Resultat & återkomst · _LOYALTY → ADVOCACY_

- **Kund:** nöjd, återkommer/rekommenderar. **Marknad:** resultatbilder (med **ansikte-samtycke**) → Instagram.

---

## 4. Per behandlingsväg — dokument till kund, personal & journal

| Moment       | Dokument till kund                                     | Personal utför / journalför                                                    | CCO-data               |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------- | --------------------------- | ----- |
| Konsultation | Curatiio-info per väg + hälsodeklaration               | Konsultationsmall, ID-verifiering                                              | Hälsodeklaration       | Reg.                        |
| Offert       | Offert (profilo/prf/microneedling/prp-skin)            | Behandlingsplan (staff)                                                        | Offert                 | Accepterad · Behandlingstid | Bokad |
| Förberedelse | Estetik-avtal, bildsamtycke (ansikte), bokningsvillkor | Pre-OP (ID, plan, före-foto)                                                   | Dok godkända           |
| Behandling   | Behandlingsbekräftelse (AutoMail)                      | **Estetik-journal** per behandling + bilder · **Ordination (läkare, ej kund)** | Journal per behandling |
| Uppföljning  | Enligt plan + eftervårdsråd                            | Estetik-journal, bildbank                                                      | Före & Efter           | Bildbank                    |

---

## 5. Journaltyp per behandling

| Behandling                           | Journaltyp           | Fil                                                                                                         |
| ------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Botox / fillers                      | Estetik-journal      | genereras (`cco-journalbygge-v3`, `cco-journal-qa-v3`, `cco-journal-safety-v3`, `journal-plan-editor-demo`) |
| Profhilo                             | Estetik-journal      | samma                                                                                                       |
| Ögonlocksplastik                     | Estetik-journal (op) | samma + `steg8-journal-tp-final-demo.html` (mall)                                                           |
| PRF-hud / Microneedling / PRP-hud-MN | Estetik-journal      | samma                                                                                                       |
| Ortopedi                             | Estetik-journal      | samma                                                                                                       |

---

## 6. Regler & knytpunkt

1. **Hälsodeklaration** — med **alla** kunder (fysiskt på plats eller online-länk före konsultation). (`steg3-halsodeklaration-curatiio-final-demo.html`)
2. **Friskförsäkran** — **enbart på operationsdagen** vid **kirurgi** (ögonlocksplastik); injektioner följer hälsodeklarationen.
3. **Ordination** — vid injektioner/läkemedel (t.ex. Botox) skrivs **individuell ordination** av **läkare**; personal ser den, **kunden ser den ej**.
4. **Bildsamtycke** — vid estetik är scopet (**ansikte**) — **annorlunda än Hair TP** (hårlinje/krona). ⚠️ Behöver en Curatiio-specifik foto-samtycke.
5. **Journal + bilder varje besök** — varje tillfälle journalförs (journal + före/efter-bilder).
6. **Knytpunkt:** samma CCO-data bärs genom kedjan; ingen dubbel registrering.

---

## 7. Komplett dokumentsats (Curatiio)

| Typ              | Innehåll                                                            | Fil                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Info             | Botox / hyalase / microneedling                                     | `steg4-botulinum-info-sve-final-demo.html` · `steg4-hyalase-info-sve-final-demo.html` · `steg4-microneedling-info-sve-final-demo.html`                                                                                                                                                                |
| Info             | Botox / fillers / profhilo / ögonlock / PRF / PRP-hud+MN / ortopedi | `curatiio-botox-info-final-demo.html` · `curatiio-filler-info-final-demo.html` · `curatiio-profhilo-info-final-demo.html` · `curatiio-ogonlock-info-final-demo.html` · `curatiio-prf-hud-info-final-demo.html` · `curatiio-prp-hud-mn-info-final-demo.html` · `curatiio-ortoped-info-final-demo.html` |
| Offert           | profilo / PRF / microneedling / PRP-skin                            | `steg5/7-offert-profilo-final-demo.html` · `steg5/7-offert-prf-final-demo.html` · `steg5/7-offert-microneedling-final-demo.html` · `steg5/7-offert-prp-skin-final-demo.html`                                                                                                                          |
| Hälsodeklaration | Curatiio                                                            | `steg3-halsodeklaration-curatiio-final-demo.html`                                                                                                                                                                                                                                                     |
| Journal          | Estetik-journal (genereras)                                         | `cco-journalbygge-v3.html` · `cco-journal-qa-v3.html` · `cco-journal-safety-v3.html` · `journal-plan-editor-demo.html`                                                                                                                                                                                |
| Samtycke/bild    | (ansikte)                                                           | ⚠️ **saknas** — behöver Curatiio-foto-samtycke                                                                                                                                                                                                                                                        |

---

## 8. Varumärkes-skillnad (Hair TP vs Curatiio)

| Område       | Hair TP Clinic                               | Curatiio                                                                         |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------------- |
| Behandlingar | PRP-hår, hår-/ögonbryn-/skäggtransplantation | Botox, fillers, profhilo, ögonlock, PRF-hud, microneedling, PRP-hud+MN, ortopedi |
| Uppföljning  | PRP 2–4 + mån 4/8/12                         | Enligt behandlingsplan                                                           |
| Journal      | TP-journal, PRP-journal, uppföljning 4/8/12  | Estetik-journal                                                                  |
| Foto-scope   | hårlinje/krona — **aldrig ansikte**          | ansikte                                                                          |
| Personal     | hårspecialist/klinikchef, läkare             | ssk/läkare                                                                       |

**Gemensamt:** samma flöde, samma CCO-verktyg, samma regler (hälsodeklaration, journal+bilder, bildsamtycke, knytpunkt).

---

## 9. Automatisering — mål V13

| Del                                  | Status                                | Ska bli             |
| ------------------------------------ | ------------------------------------- | ------------------- |
| Kundresa 9 steg                      | ✅ `buildJourneyFromState` / V11-rail | behåll              |
| Bokningsmotor + AutoMail             | ✅ `ccoBookingEngineStore`            | behåll              |
| Offert / accepterad                  | ✅ kommersiell store                  | behåll              |
| Hälsodeklaration                     | ✅                                    | behåll              |
| Journal per besök                    | ✅ Besök · tillfällen                 | behåll              |
| Ekonomi (värde/skuld)                | ✅ V11-rail                           | behåll              |
| **AutoMail-påminnelser ×4**          | ⚠️ manuellt                           | **automatisera**    |
| **Anpassat erbjudande/resultatmail** | ⚠️ manuellt                           | **automatisera**    |
| **Instagram-publicering**            | ⚠️ manuellt                           | delvis auto         |
| **Fakturering 20/80**                | ⚠️ befintlig lösning                  | **flytta in i CCO** |

---

## 7b. Gemensamma & auto-mail (delas med Hair TP)

| Typ                      | Fil                                    |
| ------------------------ | -------------------------------------- |
| Integritetspolicy (GDPR) | `auto-integritet-final-demo.html`      |
| Medicinsk / finans       | `auto-medical-finance-final-demo.html` |
| Botox-info (variant)     | `steg4-botulinum-info-final-demo.html` |
