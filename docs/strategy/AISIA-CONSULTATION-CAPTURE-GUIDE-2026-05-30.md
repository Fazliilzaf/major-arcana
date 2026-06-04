# Aisia i konsultation — Capture-guide

**Besökstyp:** Ny konsultation / baseline scalp-analys  
**Aisia:** DS-3 lokalt · **CCO:** import senare (`consultation`-session)  
**Checklista:** [A — Baseline](./AISIA-CAPTURE-CHECKLISTS-2026-05-30.md#checklista-a--baseline-konsultation)

---

## Syfte i konsultationen

Scalp-analys ger **strukturerat underlag** för:

- Bedömning av håravfall / hårbotten
- Donor- och recipient-planering (Hair TP / transplantationskandidater)
- Baseline för framtida uppföljning
- Pre-op dokumentation (när aktuellt)

**Inte syfte:** automatisk diagnos eller behandlingsbeslut utan behandlare.

---

## Placering i konsultationsflödet

```
Ankomst → ID → Samtal (anamnes) → [AISIA CAPTURE] → Gemensam genomgång av rapport
         → Behandlares kliniska plan → Journal i CCO (som vanligt)
         → (Senare APPLY) CCO-import av PDF/bilder
```

**Rekommendation:** Planera capture **efter** kort anamnes så problemområde är tydligt, **före** behandlingsrekommendation.

---

## Steg 1 — Förbered (behandlare + kamerabehörig)

- [ ] Patientens **problemområde** identifierat (mottagaryta / crown / hairline)
- [ ] Patient informerad om bildtagning
- [ ] Rätt patient vald i Aisia DS-3
- [ ] Session = ny baseline / konsultation

---

## Steg 2 — Globalbilder (patienten står/sitter)

**Syfte:** Översikt för jämförelse över tid.

| Ordning | Zon            | Tips                                          |
| ------- | -------------- | --------------------------------------------- |
| 1       | Framifrån      | Neutral belysning, hår kammat enligt standard |
| 2       | Vänster profil | Samma avstånd som front                       |
| 3       | Höger profil   |                                               |
| 4       | Bakifrån       | Donor-översikt                                |

**Ljus:** Vit (RGB) global.

---

## Steg 3 — Donor (Hair TP-kritisk)

| Zon       | Varför                    |
| --------- | ------------------------- |
| Occipital | Total donor-täthet        |
| Vänster   | Asymmetri, lokal kvalitet |
| Höger     | Asymmetri, lokal kvalitet |

**Förstoring:** 10× minimum; 50×/200× vid TP-planering.

**Behandlare:** Notera muntligt om donor räcker — CCO lagrar metrics senare (`donor_density`, `donor_quality`).

---

## Steg 4 — Recipient / problemområde

Prioritera **patientens egna concern** under `problem_area`, plus:

- Hairline (frontal) — vit **och** korspolariserat vid behov
- Mid-scalp / crown om relevant för mönster

**Tri-spektral vid indikation:**

| Ljus | Titta efter              |
| ---- | ------------------------ |
| Vit  | Antal, diameter, mönster |
| PL   | Rodnad, känslighet, kärl |
| UV   | Talg, porfyriner         |

**Förstoring:** 10× översikt → 50×/100×/200× enligt [`AISIA-CAPTURE-PROTOCOL.md`](./AISIA-CAPTURE-PROTOCOL.md).

---

## Steg 5 — Analys och gemensam genomgång

1. Slutför Aisia-analys i DS-3.
2. Behandlare + kamerabehörig går igenom rapport **innan** patient lämnar rummet (om tidsplan tillåter).
3. Behandlare formulerar **muntlig** sammanfattning till patient.
4. Notera om kompletterande zoner behövs.

**CCO patientvy (senare):** förenklad svenska — ersätter inte detta samtal.

---

## Steg 6 — Export

- [ ] PDF-rapport exporterad
- [ ] Ev. bildexport per zon
- [ ] PDF **orörd** efter export
- [ ] Filer i klinikens exportmapp

**Nyckelmätvärden att notera för senare CCO-import** (från PDF):

| metricType                  | Svenska i CCO         |
| --------------------------- | --------------------- |
| `total_hair_count`          | Hårantal              |
| `donor_density`             | Donortäthet           |
| `grease_level`              | Talgnivå              |
| `recipient_zone_assessment` | Bedömning mottagaryta |

Full lista: [`AISIA-SWEDISH-TERMINOLOGY.md`](./AISIA-SWEDISH-TERMINOLOGY.md)

---

## Steg 7 — Journal (CCO, som vanligt)

- Behandlaren dokumenterar **egen** kliniska bedömning i TP-journal.
- Aisia = stöd — **ingen** auto-införd journaltext från modulen i pilot.
- Referera till att scalp-analys genomförts + var PDF lagras (klinik-SOP).

---

## Steg 8 — CCO (efter `APPLY AISIA TO CCO`)

1. Skapa session `consultation`
2. Importera PDF + bilder
3. Mata in metrics från steg 6
4. Behandlare **Verifiera**
5. Pre-op callout visar baseline-status

Runbook: [`AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md`](./AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md)

---

## Vanliga misstag (undvik)

| Misstag                            | Konsekvens                   |
| ---------------------------------- | ---------------------------- |
| Hoppa donor vänster/höger          | Pre-op gate röd i CCO        |
| Export före komplett analys        | Ofullständig baseline        |
| Redigera PDF                       | CCO originalbytes krav bryts |
| Lita på Aisia-text utan behandlare | Compliance — verify krävs    |

---

_source: AISIA-CAPTURE-PROTOCOL (befintlig) · new — konsultationsguide_
