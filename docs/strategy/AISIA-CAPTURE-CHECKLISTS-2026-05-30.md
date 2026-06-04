# Aisia DS-3 — Capture-checklistor (personal)

**Hair TP Clinic only** · Skriv ut eller använd digitalt i rummet  
**Teknisk spec:** [`AISIA-CAPTURE-PROTOCOL.md`](./AISIA-CAPTURE-PROTOCOL.md)

---

## Checklista A — Baseline (konsultation)

**CCO senare:** `sessionType=consultation` · Baseline för pre-op och uppföljning

**Patient:** ********\_******** **Datum:** ****\_\_**** **Behandlare:** ****\_\_****

### Global (vit ljus)

| Zon       | ID             | OK  | Tid |
| --------- | -------------- | :-: | --- |
| Framifrån | `global_front` |  ☐  |     |
| Vänster   | `global_left`  |  ☐  |     |
| Höger     | `global_right` |  ☐  |     |
| Bakifrån  | `global_back`  |  ☐  |     |

### Donor

| Zon       | ID                | 10×/global | OK  |
| --------- | ----------------- | ---------- | :-: |
| Occipital | `donor_occipital` | ☐          |  ☐  |
| Vänster   | `donor_left`      | ☐          |  ☐  |
| Höger     | `donor_right`     | ☐          |  ☐  |

### Recipient

| Zon           | ID                 | 10× vit/PL | OK  |
| ------------- | ------------------ | ---------- | :-: |
| Hairline      | `hairline_frontal` | ☐          |  ☐  |
| Mid-scalp     | `mid_scalp`        | ☐          |  ☐  |
| Crown         | `crown`            | ☐          |  ☐  |
| Problemområde | `problem_area`     | ☐          |  ☐  |

### Mikro (markera tagna)

| Förstoring | Vit | PL  | UV  | Zon(er) |
| ---------- | :-: | :-: | :-: | ------- |
| 50×        |  ☐  |  ☐  |  ☐  |         |
| 100×       |  ☐  |  ☐  |  ☐  |         |
| 200×       |  ☐  |  ☐  |  ☐  |         |

### Export

- [ ] PDF-rapport exporterad
- [ ] Bilder exporterade (om tillämpligt)
- [ ] Behandlare godkänner baseline

---

## Checklista B — Donor-fokus (TP-planering)

Använd **utöver** baseline när donor bedöms inför transplantationsplan.

| Kontroll                                      | OK  | Anteckning |
| --------------------------------------------- | :-: | ---------- |
| Occipital täthet dokumenterad (10×)           |  ☐  |            |
| Donor vänster — kvalitet + täthet             |  ☐  |            |
| Donor höger — kvalitet + täthet               |  ☐  |            |
| Asymmetri donor v/h noterad                   |  ☐  |            |
| Mikro 200× hårsäckstatus (minst en donor-zon) |  ☐  |            |

**CCO metrics (manuellt vid import):** `donor_density`, `donor_quality`, `donor_risk`

---

## Checklista C — Recipient / problemområde

| Kontroll                                            | OK  | Anteckning |
| --------------------------------------------------- | :-: | ---------- |
| Hairline frontal — vit + PL                         |  ☐  |            |
| Problemområde patientens ord                        |  ☐  |            |
| Miniaturisering/suspicion dokumenterad (Aisia/beh.) |  ☐  |            |
| Crown/vertex om relevant                            |  ☐  |            |
| Recipient bedömning i rapport                       |  ☐  |            |

**CCO metrics (manuellt vid import):** `total_hair_count`, `recipient_zone_assessment`, `miniaturization_suspicion`

---

## Checklista D — Uppföljning (follow-up)

**CCO senare:** `sessionType=follow_up` · Jämför mot baseline

**Timepoint:** ☐ Dag 14 · ☐ Mån 1 · ☐ Mån 3 · ☐ Mån 6 · ☐ Mån 12

**Baseline-datum (referens):** ********\_********

### Återta zoner (samma som baseline)

| Zon             | Baseline finns | Dagens capture OK |
| --------------- | :------------: | :---------------: |
| Global front    |       ☐        |         ☐         |
| Donor occipital |       ☐        |         ☐         |
| Donor vänster   |       ☐        |         ☐         |
| Donor höger     |       ☐        |         ☐         |
| Problemområde   |       ☐        |         ☐         |
| Hairline        |       ☐        |         ☐         |

### Export & jämförelse

- [ ] PDF follow-up exporterad
- [ ] Behandlare noterar klinisk förändring (muntligt/journal — **inte** auto-AI)
- [ ] Vid CCO-import: skapa `follow_up`-session + ev. baseline-jämförelse

**Källa uppföljning:** [`AISIA-FOLLOW-UP-WORKFLOW.md`](./AISIA-FOLLOW-UP-WORKFLOW.md)

---

## Checklista E — Pre-op readiness (status, inte beslut)

CCO visar detta som **gate** när flag är on — operation beslutas av behandlare.

| Gate            | Krav                          | OK  |
| --------------- | ----------------------------- | :-: |
| Baseline        | Verifierad consultation finns |  ☐  |
| Donor occipital | Bild importerad               |  ☐  |
| Donor vänster   | Bild importerad               |  ☐  |
| Donor höger     | Bild importerad               |  ☐  |
| Recipient       | Hairline + minst en mikrobild |  ☐  |
| Verify          | Behandlare verifierat i CCO   |  ☐  |

> **CCO visar varning — fattar inte operationsbeslut.**

---

## Snabb-P0 (minimum viable capture)

Om tiden är knapp — **minimum** innan export:

1. Global front + vänster + höger
2. Donor occipital + vänster + höger
3. Problemområde 10×
4. PDF-rapport

Markera saknade zoner i anteckning — komplettera vid nästa besök.

---

_source: AISIA-CAPTURE-PROTOCOL.md · AISIA-FOLLOW-UP-WORKFLOW.md (befintlig)_
