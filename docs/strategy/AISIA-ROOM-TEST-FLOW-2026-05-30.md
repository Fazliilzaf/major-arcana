# Aisia DS-3 — Testflöde i behandlingsrummet

**Scope:** Fysisk rutin i rummet · **Aisia only** (CCO import kommer senare)  
**CCO:** Flag off — inga CCO-steg under Fas A  
**Källa:** `AISIA-CAPTURE-PROTOCOL.md`, DS-3 manual (feature matrix)

---

## Syfte

Verifiera att personal kan köra en **komplett Aisia-session** i rummet: setup → capture → analys → export — **utan** CCO och **utan** prod-aktivering.

---

## Roller

| Roll              | Ansvar i rummet                                    |
| ----------------- | -------------------------------------------------- |
| **Kamerabehörig** | DS-3, kamera, zoner, export                        |
| **Behandlare**    | Klinisk bedömning, godkänner att materialet räcker |
| **Pilotledare**   | Checklista, avvikelser, ingen fil utanför klinik   |

---

## Förberedelse (T−10 min)

- [ ] DS-3 igång, kamera kopplad
- [ ] Kalibrering enligt klinik-SOP (notera datum i loggbok)
- [ ] Patient rätt i Aisia (dubbelkolla namn + besöksdatum)
- [ ] Sessionstyp vald:
  - [ ] Baseline → `consultation` i CCO senare
  - [ ] Uppföljning → `follow_up`
  - [ ] Pre-op → endast om planerat
- [ ] Patient informerad om bildtagning
- [ ] Exportmapp tom/ren för dagens session (lokal klinikdisk)
- [ ] **Ej:** skicka filer till extern AI, GitHub, privat mobil

---

## Flöde i rummet (T0 → T+45 min typisk baseline)

### Steg 1 — Globalöversikt (vit ljus)

Patient positioneras. Ta globalbilder:

- [ ] Framifrån (`global_front`)
- [ ] Vänster (`global_left`)
- [ ] Höger (`global_right`)
- [ ] Bakifrån (`global_back`)

**Tips:** Samma avstånd och belysning mellan vinklar.

---

### Steg 2 — Donor

- [ ] Occipital (`donor_occipital`) — 10× eller global
- [ ] Donor vänster (`donor_left`)
- [ ] Donor höger (`donor_right`)

**Hair TP:** Donor-kvalitet är kritisk vid TP-planering — missa inte vänster/höger separat.

---

### Steg 3 — Recipient / problemområde

- [ ] Hairline frontal (`hairline_frontal`) — vit / PL
- [ ] Mid-scalp (`mid_scalp`)
- [ ] Crown (`crown`)
- [ ] Problemområde (`problem_area`) — patientens huvudsakliga concern

---

### Steg 4 — Mikroskop (10× → 200×, tri-spektral)

Per relevant zon, enligt behandlares bedömning:

| Förstoring | Ljus          | Ta när                     |
| ---------- | ------------- | -------------------------- |
| 10×        | vit / PL      | Håravfall, antal, tjocklek |
| 50×        | vit           | Hornlager                  |
| 50×        | PL            | Känslighet, rodnad         |
| 50×        | UV            | Talg, porfyriner           |
| 100×       | vit / PL / UV | Hårbottentyp, inflammation |
| 200×       | vit / PL      | Hårsäckstatus              |

- [ ] Minst en recipient-zon med 50×+ dokumenterad
- [ ] Minst en donor-zon med 10×+ dokumenterad

---

### Steg 5 — Analys i DS-3

- [ ] Kör Aisia-analys till slut (ingen avbryt halvvägs)
- [ ] Granska rapportutkast i DS-3 med behandlare
- [ ] Notera om någon zon behöver kompletteras **innan** export

---

### Steg 6 — Export (slutar Fas A)

- [ ] Exportera **PDF-rapport** (Aisia standardexport)
- [ ] Exportera **bilder** om DS-3 erbjuder separat export
- [ ] Öppna PDF — läsbar, rätt patient/datum
- [ ] **Redigera inte** PDF efter export
- [ ] Spara enligt klinik-SOP (lokal mapp, **inte** GitHub)

**Filnamn (exempel):** `aisia-{initialer}-{YYYYMMDD}-baseline.pdf` — följ klinikens namnregler.

---

## Avslut i rummet

| Kontroll                                                    | OK  |
| ----------------------------------------------------------- | :-: |
| Alla P0-zoner tagna (se capture-checklistor)                |  ☐  |
| PDF exporterad                                              |  ☐  |
| Behandlare godkänner att materialet räcker för konsultation |  ☐  |
| Filer stannar på klinikens system                           |  ☐  |
| CCO-import **inte** gjord (flag off)                        |  ☐  |

**Sign-off rumstest:**

|               | Namn | Datum |
| ------------- | ---- | ----- |
| Kamerabehörig |      |       |
| Behandlare    |      |       |

---

## Avvikelser (logga, fixa inte i CCO än)

| Problem                    | Åtgärd                             |
| -------------------------- | ---------------------------------- |
| Saknad donor vänster/höger | Komplettera capture innan export   |
| Oskarp mikrobild           | Ta om vid samma zon                |
| Fel patient i Aisia        | Avbryt, starta om session          |
| Export misslyckas          | IT/klinik-SOP — **inte** FAS 2 API |

---

## Nästa steg (efter owner GO)

| Beslut                   | Handling                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **`APPLY AISIA TO CCO`** | Följ [`AISIA-MVP-PILOT-RUNBOOK`](./AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md) + [`AISIA-APPLY-TO-CCO-QA`](./AISIA-APPLY-TO-CCO-QA-2026-05-30.md) |
| Fortsatt rumstest only   | Upprepa Fas A                                                                                                                                |

---

_source: AISIA-CAPTURE-PROTOCOL.md (befintlig) · new — rumstestflöde_
