# Aisia DS-3 Feature Extraction Matrix

**Källa:** `manual.pdf` (DS-3 Medical Hair Mirror, Umer/Aisia)  
**Datum:** 2026-05-30  
**Status:** FAS 0 — read-only extraction, ingen implementation i Aisia  
**CCO-scope:** import, struktur, svensk vy, patientresa — **ersätter inte** Aisia-programmet

---

## 1. Capture modes

| Mode                         | Beskrivning (manual)                                          | Magnification       | CCO `sessionType`                       | Notering                                      |
| ---------------------------- | ------------------------------------------------------------- | ------------------- | --------------------------------------- | --------------------------------------------- |
| Live Preview                 | Snabb detektion, valfri förstoring, foton behöver inte sparas | Valfri (10–200×)    | `consultation`                          | CCO MVP: manuell import, ingen live preview   |
| Image Capture                | Faktisk fotografering för analys                              | Valfri              | `consultation` / `pre_op` / `follow_up` | Primär MVP-ingång                             |
| Alopecia Care — Single Image | Ett område i håravfallszon                                    | 10× (kvantifiering) | `consultation`                          | 10× för hårsäckar, antal, tjocklek            |
| Alopecia Care — Multi Image  | Fyra ytor: top, front, side, back                             | 10×                 | `consultation`                          | Hair TP-protokoll utökar till donor/recipient |
| Scalp Detection / Scalp Care | Mikroskopbilder per spektrum                                  | 50× / 100× / 200×   | `consultation` / `pre_op`               | Tri-spektral analys                           |

## 2. Magnifications

| Faktor   | Manual-användning                                         | Detekterar                                              |
| -------- | --------------------------------------------------------- | ------------------------------------------------------- |
| **10×**  | Håravfallsområde, antal hårsäckar, antal hår, hårtjocklek | Makro håravfall, tillväxt efter behandling              |
| **50×**  | Hornlager (RGB), känslighet (PL), porfyriner (UV)         | Stratum corneum, scalp sensitivity, porphyrin secretion |
| **100×** | Hårbottentyp, inflammation, trauma                        | Scalp skin type, inflammatory scalp, traumatic scalp    |
| **200×** | Hårsäck, telangiektasier                                  | Surface hair follicles, telangiectasis                  |

## 3. Spectrum / light modes

| Spektrum            | Manual-namn                | Teknik                            | Detekterar                                                     |
| ------------------- | -------------------------- | --------------------------------- | -------------------------------------------------------------- |
| **White / RGB**     | White Light                | Multidirektionellt diffust ljus   | Hornlager, hårbottentyp, hårsäckar, olja                       |
| **Cross polarized** | Cross Polarized Light (PL) | Reducerar direkt reflekterat ljus | Mikrovaskulära strukturer, känslighet, rodnad, telangiektasier |
| **UV**              | UV Light (365 nm)          | Fluorescens i epidermis           | Talg/sebum, bakterieporfyriner                                 |

## 4. Analysis categories (Scalp Care)

| Kategori           | Magnification | Spektrum | Underkategorier (case library)                     |
| ------------------ | ------------- | -------- | -------------------------------------------------- |
| Stratum corneum    | 50×           | RGB      | Normal, Dandruff type, Damaged nature              |
| Sensitivity        | 50×           | PL       | Scalp redness, Telangiectasis                      |
| Porphyrins         | 50×           | UV       | Insufficient oil, Damaged scalp oil, Excessive oil |
| Scalp skin type    | 100×          | RGB      | Neutral, Oily, Dry                                 |
| Inflammatory scalp | 100×          | PL       | Red type, Acne type                                |
| Traumatic scalp    | 100×          | UV       | Blood scab, Pustule, Traumatic                     |
| Hair follicle      | 200×          | RGB      | Healthy, Damaged, Slightly damaged                 |
| Telangiectasis     | 200×          | PL       | Telangiectasis, Mild, Severe                       |

## 5. Metrics (Alopecia Care + Scalp quantification)

### Hair / alopecia (10× AI quantification)

| Metric (EN)                       | Aisia-källa            | CCO `metricType`                                            |
| --------------------------------- | ---------------------- | ----------------------------------------------------------- |
| Total hair count                  | Alopecia Care AI       | `total_hair_count`                                          |
| Fine / medium / coarse hair count | Hair thickness buckets | `fine_hair_count`, `medium_hair_count`, `coarse_hair_count` |
| Empty follicle count              | AI labeling            | `empty_follicle_count`                                      |
| Average hair diameter             | AI                     | `average_hair_diameter`                                     |
| Hair follicle count               | 10× detection          | `hair_follicle_count`                                       |
| Miniaturization suspicion         | Derived                | `miniaturization_suspicion`                                 |
| Donor density / quality           | Klinisk tolkning       | `donor_density`, `donor_quality`                            |
| Recipient zone assessment         | Klinisk tolkning       | `recipient_zone_assessment`                                 |

### Scalp (50× quantification — 9 indicators)

| Metric (EN)             | Spektrum | CCO `metricType`          |
| ----------------------- | -------- | ------------------------- |
| Grease / oil level      | RGB + UV | `grease_level`            |
| Sensitivity level       | PL       | `sensitivity_level`       |
| Porphyrin level         | UV       | `porphyrin_level`         |
| Stratum corneum status  | RGB      | `stratum_corneum_status`  |
| Scalp skin type         | RGB 100× | `scalp_skin_type`         |
| Inflammatory scalp      | PL 100×  | `inflammatory_scalp`      |
| Traumatic scalp         | UV 100×  | `traumatic_scalp`         |
| Hair follicle condition | RGB 200× | `hair_follicle_condition` |
| Telangiectasia severity | PL 200×  | `telangiectasia_severity` |

### Clinical planning (CCO-only layer)

| Field                       | CCO `metricType`              | Källa              |
| --------------------------- | ----------------------------- | ------------------ |
| Donor zone                  | `donor_zone`                  | manual / clinician |
| Recipient zone              | `recipient_zone`              | manual / clinician |
| Hair caliber                | `hair_caliber`                | manual             |
| Follicular unit density     | `follicular_unit_density`     | manual             |
| Scalp inflammation          | `scalp_inflammation`          | manual             |
| Donor risk                  | `donor_risk`                  | manual             |
| Recommended graft range     | `recommended_graft_range`     | manual             |
| Follow-up comparison needed | `follow_up_comparison_needed` | manual             |
| Case complexity score       | `case_complexity_score`       | manual             |

## 6. Report / PDF capabilities

| Funktion                                | Manual                                                                 | CCO MVP                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Comprehensive report                    | PDF med spektrum-bilder + examination opinions + treatment suggestions | **Manuell import** → `patient_asset` category `aisia_report`                       |
| Full-screen PDF view                    | Ja                                                                     | CCO download via secure storage                                                    |
| One-click print                         | Ja                                                                     | Ej i CCO MVP                                                                       |
| Report transfer to local device         | Ja                                                                     | Operatör exporterar från Aisia → importerar till CCO                               |
| Treatment/nursing suggestions in report | Ja (Aisia AI)                                                          | **Visas som originaltext** — svensk sammanfattning är CCO-lager, inte auto-diagnos |

## 7. Comparison capabilities

| Typ                              | Manual                                                           | CCO MVP                               |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| Image comparison (before/after)  | Tidsväxling + ritverktyg (brush, line, arrow, rectangle, circle) | `scalp_comparisons` + side-by-side vy |
| Quantitative data comparison     | Skillnad i hår/hårsäck-värden, positiv = ökning                  | `metricChanges` JSON per jämförelse   |
| Scalp care image comparison      | Tidsväxling efter vård                                           | Baseline vs follow-up session         |
| Fixed-point comparative analysis | Toolbar i Alopecia Care                                          | MVP: zon + magnification match        |

## 8. Case library / product management

| Funktion                           | Manual                                                               | CCO                                     |
| ---------------------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| Comparative case library           | Inbyggda referensbilder per indikator (Normal/Dandruff/Damaged etc.) | **Ej i MVP** — Aisia internt            |
| Personalized case upload           | Backend Settings — Case Gallery                                      | **Ej i MVP**                            |
| Product management                 | Backend — rekommenderar produkter/behandlingar                       | **Ej i MVP** — regulatory risk          |
| Intelligent product recommendation | AI-baserad                                                           | **FAS 4 blocked** — kräver legal review |

## 9. Export capabilities (FAS 2 investigation)

| Kanal                             | Manual-indikation                   | FAS 2 action                                        |
| --------------------------------- | ----------------------------------- | --------------------------------------------------- |
| PDF export                        | Comprehensive report → local device | Verifiera exportmapp + filnamn                      |
| Image export                      | Capture sparar i Aisia DB           | Verifiera bildexport / mapp                         |
| CSV / structured metrics          | Ej dokumenterat i manual            | Undersök nätverkstrafik + lokal DB                  |
| USB flash drive (Windows edition) | Hair Mirror APP on USB              | Bridge via exportfolder                             |
| Cloud storage                     | Software advantage #5               | **Ej CCO destination** — import till secure storage |
| API                               | Ej dokumenterat                     | Undersök `aisiausa.umersoft.com:8864` webapp        |
| Local database                    | Trolig (case library, sessions)     | FAS 2 only                                          |

## 10. CCO patient journey mapping

| Resesteg                         | Aisia-roll               | CCO-roll                                       |
| -------------------------------- | ------------------------ | ---------------------------------------------- |
| Baseline consultation            | Acquisition + AI metrics | Import session → verify → treatment plan input |
| Pre-op readiness                 | Donor/recipient imaging  | Protocol completeness gate                     |
| Operation day                    | Optional during photos   | `sessionType=pre_op`, link encounter           |
| Follow-up (D14, M1, M3, M6, M12) | Re-capture + compare     | `scalp_comparisons` vs baseline                |
| Journal                          | —                        | Referens till verified session, ej auto-text   |
| Patient portal                   | —                        | Förenklad svensk sammanfattning, disclaimer    |

---

_source: manual.pdf (DS-3 Medical Hair Mirror product manual)_
