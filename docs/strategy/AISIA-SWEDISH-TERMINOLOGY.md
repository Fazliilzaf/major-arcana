# Aisia → CCO Swedish Terminology Mapping

**Adapter:** `src/ops/aisiaTerminology.js`  
**Princip:** Original EN sparas i metrics; svensk vy via `translateMetric()` / `translateZone()`

---

## Metrics

| English (Aisia)           | `metricType`                | Svenska (CCO)                     |
| ------------------------- | --------------------------- | --------------------------------- |
| Hair Count                | `total_hair_count`          | Hårantal                          |
| Hair Diameter             | `average_hair_diameter`     | Hårdiameter                       |
| Fine Hair Count           | `fine_hair_count`           | Antal tunna hårstrån              |
| Medium Hair Count         | `medium_hair_count`         | Antal medeltjocka hårstrån        |
| Coarse Hair Count         | `coarse_hair_count`         | Antal grova hårstrån              |
| Empty Hair Count          | `empty_follicle_count`      | Tomma hårsäcksenheter             |
| Hair Follicles            | `hair_follicle_count`       | Hårsäckar                         |
| Damaged Hair Follicles    | `hair_follicle_condition`   | Påverkade/skadade hårsäckar       |
| Grease Level              | `grease_level`              | Talgnivå / oljenivå               |
| Sensitive Level           | `sensitivity_level`         | Känslighetsnivå                   |
| Porphyrin Level           | `porphyrin_level`           | Porfyrinnivå                      |
| Stratum Corneum           | `stratum_corneum_status`    | Hornlager                         |
| Scalp Skin Type           | `scalp_skin_type`           | Hårbottentyp                      |
| Inflammatory Scalp        | `inflammatory_scalp`        | Inflammatorisk hårbotten          |
| Traumatic Scalp           | `traumatic_scalp`           | Skadad/irriterad hårbotten        |
| Telangiectasis            | `telangiectasia_severity`   | Ytliga blodkärl / telangiektasier |
| Dandruff Type             | `dandruff_type`             | Mjälltyp                          |
| Oily Type                 | `oily_scalp`                | Fet hårbotten                     |
| Dry Type                  | `dry_scalp`                 | Torr hårbotten                    |
| Neutral Type              | `neutral_scalp`             | Normal hårbotten                  |
| Donor density             | `donor_density`             | Donortäthet                       |
| Donor quality             | `donor_quality`             | Donorkvalitet                     |
| Recipient zone assessment | `recipient_zone_assessment` | Bedömning mottagaryta             |
| Recommended graft range   | `recommended_graft_range`   | Rekommenderat graft-intervall     |

## Zones

| Zone ID            | Svenska              |
| ------------------ | -------------------- |
| `global_front`     | Globalbild framifrån |
| `global_left`      | Globalbild vänster   |
| `global_right`     | Globalbild höger     |
| `global_back`      | Globalbild bakifrån  |
| `donor_occipital`  | Donor occipital      |
| `donor_left`       | Donor vänster        |
| `donor_right`      | Donor höger          |
| `hairline_frontal` | Hairline / frontal   |
| `mid_scalp`        | Mid-scalp            |
| `crown`            | Crown / vertex       |
| `problem_area`     | Problemområde        |

## Spectrum

| EN              | SV                   |
| --------------- | -------------------- |
| white           | Vitt ljus (RGB)      |
| cross_polarized | Korspolariserat ljus |
| uv              | UV-ljus              |

## Magnification

| Value | SV              |
| ----- | --------------- |
| 10x   | 10× förstoring  |
| 50x   | 50× förstoring  |
| 100x  | 100× förstoring |
| 200x  | 200× förstoring |

## Patientvy disclaimer (fast text)

> Resultatet används som stöd i konsultationen. Slutlig bedömning görs av klinikens personal.

---

_source: owner spec + migration/meridiq patterns for sv-SE_
