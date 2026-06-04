# Aisia Scalp Analysis — UI Placement in CCO

**Flik:** `Hår-/scalpanalys` (`data-patient-tab="scalpanalys"`)  
**Modul:** `public/cco-scalp-analysis.js` + `public/cco-scalp-analysis.css`

---

## Patientkort — Personalvy

### Flikstruktur

| Sektion                      | Innehåll                                           |
| ---------------------------- | -------------------------------------------------- |
| **Sessionöversikt**          | Lista sessions per datum, status-chip, sessionType |
| **Baseline**                 | Första verified consultation-session               |
| **Donorområde**              | Bilder + metrics för donor\_\* zoner               |
| **Recipientområde**          | hairline, mid_scalp, crown, problem_area           |
| **Konsultationsbilder**      | sessionType=consultation                           |
| **Operationsbilder**         | sessionType=pre_op                                 |
| **Uppföljningsbilder**       | sessionType=follow_up                              |
| **Aisia-rapporter**          | PDF-länkar (secure download)                       |
| **Mätvärden**                | Tabell EN → SV med verifieringsstatus              |
| **Före/efter-jämförelse**    | Baseline vs vald follow-up                         |
| **Behandlarens verifiering** | Verify-knapp + kommentar                           |

### Actions

- Importera Aisia PDF
- Importera bilder (multi-file)
- Lägg till mätvärde manuellt
- Verifiera session
- Skapa jämförelse

## Patientkort — Patientvy (portal-ready)

- Enkel svensk sammanfattning per verified session
- Inga engelska tekniska termer
- Inga automatiska diagnoser
- Fast disclaimer (se terminology doc)

## Tidslinje

Events med ikon 🔬:

- `scalp_analysis_imported`
- `scalp_image_added`
- `scalp_metrics_added`
- `scalp_analysis_verified`
- `scalp_comparison_created`

## Konsultation

Read-only checklista från `GET .../protocol-status`:

- ☐ Baseline komplett
- ☐ Donor vänster/höger
- ☐ Analysis verified

## Pre-op readiness

Flaggor från protocol-status:

- `baselineImagingRequired`
- `donorRecipientImagesRequired`
- `analysisVerifiedRequired`

## Mobile

- En kolumn
- Bottom sheet för sessiondetalj
- Kompakta status-chips (inga klippta Å/Ä/Ö)

---

_source: owner spec + cco-mobile-app-shell.mdc_
