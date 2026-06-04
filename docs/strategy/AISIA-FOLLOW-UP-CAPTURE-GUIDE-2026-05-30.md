# Aisia i uppföljning — Capture-guide

**Besökstyp:** Uppföljning efter baseline (PRP / TP / medicinsk uppföljning)  
**Aisia:** DS-3 lokalt · **CCO senare:** `follow_up`-session + jämförelse mot baseline  
**Checklista:** [D — Follow-up](./AISIA-CAPTURE-CHECKLISTS-2026-05-30.md#checklista-d--uppföljning-follow-up)

**Teknisk referens:** [`AISIA-FOLLOW-UP-WORKFLOW.md`](./AISIA-FOLLOW-UP-WORKFLOW.md)

---

## Syfte

- Dokumentera **förändring** sedan baseline
- Jämföra samma zoner under samma förutsättningar
- Ge underlag för behandlares bedömning — **inte** automatisk behandlingsjustering

---

## Timepoints (Hair TP standard)

| Timepoint | Typisk timing | Capture-prioritet         |
| --------- | ------------- | ------------------------- |
| Dag 14    | 2 veckor post | Läkning, tidig recipient  |
| Månad 1   | ~4 veckor     | Tidig tillväxt / shedding |
| Månad 3   | ~12 veckor    | Strukturerad uppföljning  |
| Månad 6   | ~6 månader    | Mittenuppföljning         |
| Månad 12  | ~1 år         | Lång uppföljning          |

Markera timepoint i Aisia och i pilotlogg.

---

## Förberedelse

- [ ] **Baseline finns** — PDF + datum känt (klinikens arkiv eller CCO efter APPLY)
- [ ] Baseline-zoner identifierade (minst samma set som ska jämföras)
- [ ] Patient informerad — samma rutin som baseline
- [ ] Ny `follow_up`-session i Aisia (inte skriv över baseline)

---

## Capture — återta samma zoner

**Minimum jämförelsebar uppföljning:**

| Zon                     | Baseline tagen? | Ta igen idag |
| ----------------------- | :-------------: | :----------: |
| Global front            |        ☐        |      ☐       |
| Problemområde           |        ☐        |      ☐       |
| Donor occipital (om TP) |        ☐        |      ☐       |
| Donor vänster           |        ☐        |      ☐       |
| Donor höger             |        ☐        |      ☐       |
| Hairline                |        ☐        |      ☐       |

**Matcha baseline så långt möjligt:**

- Samma förstoring på samma zon
- Samma ljus (vit / PL / UV) per zon
- Samma kamning/position — dokumentera avvikelse i logg

---

## Mikro vid uppföljning

| Situation      | Rekommendation                            |
| -------------- | ----------------------------------------- |
| TP månad 1–3   | Problemområde + hairline 10×/50×          |
| PRP serie      | Problemområde + talg/känslighet 50× PL/UV |
| Donor-kontroll | Donor v/h 10×                             |

---

## Analys och klinisk bedömning

1. Slutför Aisia-analys.
2. Behandlare jämför **muntligt/visualt** mot baseline (Aisia jämförelse i DS-3 om tillgängligt).
3. Dokumentera **behandlarens** slutsats i journal — t.ex. förbättring/oförändrat/behov av extra uppföljning.
4. **Ingen** auto-text om "rekommenderad behandling" från CCO.

---

## Export

- [ ] Follow-up PDF exporterad (separat fil från baseline)
- [ ] Bilder exporterade om tillämpligt
- [ ] Filnamn inkluderar timepoint (t.ex. `followup-m3-...`)

---

## CCO (efter `APPLY AISIA TO CCO`)

| Steg | Action                                        |
| ---- | --------------------------------------------- |
| 1    | Skapa session `follow_up`                     |
| 2    | Importera PDF + bilder (`photo_after`)        |
| 3    | Metrics från follow-up PDF                    |
| 4    | Behandlare verify                             |
| 5    | **Skapa baseline-jämförelse** (metric-delta)  |
| 6    | Behandlare skriver klinisk slutsats i journal |

**CCO jämförelse:** visar delta (t.ex. hårantal ±) — **inte** behandlingsrekommendation.

**Timeline:** `scalp_comparison_created`

---

## Avvikelser

| Signal                | Hantering                                         |
| --------------------- | ------------------------------------------------- |
| Baseline saknas       | Gör baseline först — uppföljning blir ny baseline |
| Annan zon än baseline | Notera i logg; jämförelse begränsad               |
| Metric delta stor     | Behandlare bedömer — ev. extra besök              |
| `needs_review` i CCO  | Manuell granskning — ingen auto-merge             |

---

## Uppföljning vs ny konsultation

|                 | Ny konsultation | Uppföljning             |
| --------------- | --------------- | ----------------------- |
| Aisia session   | Baseline        | Follow-up               |
| CCO sessionType | `consultation`  | `follow_up`             |
| Bildkategori    | `photo_before`  | `photo_after`           |
| Jämförelse      | —               | Mot verifierad baseline |
| Pre-op gate     | Sätter baseline | Kräver baseline redan   |

---

_source: AISIA-FOLLOW-UP-WORKFLOW (befintlig) · new — uppföljningsguide_
