# Hair TP — Aisia Capture Protocol

**Brand:** Hair TP Clinic only  
**Källa:** Owner-spec + DS-3 manual (10×/50×/100×/200×, tri-spektral)  
**CCO enforcement:** `checkCaptureProtocolCompleteness()` i `ccoScalpAnalysisStore.js`

---

## Baseline consultation (obligatoriska zoner)

| #   | Zone ID            | Svenskt namn             | Bildtyp   | Magnification | Spectrum   |
| --- | ------------------ | ------------------------ | --------- | ------------- | ---------- |
| 1   | `global_front`     | Globalbild framifrån     | Global    | —             | white      |
| 2   | `global_left`      | Globalbild vänster       | Global    | —             | white      |
| 3   | `global_right`     | Globalbild höger         | Global    | —             | white      |
| 4   | `global_back`      | Globalbild bakifrån      | Global    | —             | white      |
| 5   | `donor_occipital`  | Donor occipital          | Donor     | 10× / global  | white      |
| 6   | `donor_left`       | Donor vänster            | Donor     | 10× / global  | white      |
| 7   | `donor_right`      | Donor höger              | Donor     | 10× / global  | white      |
| 8   | `hairline_frontal` | Hairline/frontal         | Recipient | 10×           | white / PL |
| 9   | `mid_scalp`        | Mid-scalp                | Recipient | 10×           | white      |
| 10  | `crown`            | Crown                    | Recipient | 10×           | white      |
| 11  | `problem_area`     | Patientens problemområde | Recipient | 10×           | white / PL |

## Mikroskopbilder (per relevant zon)

| Magnification | Spectrum                     | Indikator                           |
| ------------- | ---------------------------- | ----------------------------------- |
| 10×           | white / cross_polarized      | Håravfallsområde — antal, tjocklek  |
| 50×           | white (RGB)                  | Hornlager / hårbottenyta            |
| 50×           | cross_polarized              | Känslighet, rodnad, telangiektasier |
| 50×           | uv                           | Talg, porfyriner                    |
| 100×          | white / cross_polarized / uv | Hårbottentyp, inflammation, trauma  |
| 200×          | white / cross_polarized      | Hårsäckstatus, telangiektasier      |

## Follow-up protocol

| Timepoint | `sessionType`  | Jämför mot |
| --------- | -------------- | ---------- |
| Baseline  | `consultation` | —          |
| Dag 14    | `follow_up`    | baseline   |
| Månad 1   | `follow_up`    | baseline   |
| Månad 3   | `follow_up`    | baseline   |
| Månad 6   | `follow_up`    | baseline   |
| Månad 12  | `follow_up`    | baseline   |

## Pre-op readiness gates

För `sessionType=pre_op` krävs:

1. ✅ Baseline session `status=verified`
2. ✅ Donor zoner: occipital + left + right
3. ✅ Recipient zoner: hairline + minst en recipient-mikrobild
4. ✅ Analysis verified av behandlare

## CCO UI feedback

| Saknas              | Meddelande                                      |
| ------------------- | ----------------------------------------------- |
| Ingen baseline      | `Baseline hår-/scalpanalys saknas`              |
| Donor vänster/höger | `Saknas donor vänster/höger i capture protocol` |
| Ej verifierad       | `Analys väntar på behandlarverifiering`         |

---

_source: owner spec 2026-05-30_
