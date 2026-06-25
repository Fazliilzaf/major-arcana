# Final-demo design — spec för alla patientdokument

**Referensfil:** `public/major-arcana-preview/steg3-halsodeklaration-final-demo.html`  
**Alternativ referens:** `steg7-v6-kundkort-final-demo.html`, `steg8-friskforsakran-final.html`

## Obligatoriska element

| Element        | CSS/klass                          | Krav                                         |
| -------------- | ---------------------------------- | -------------------------------------------- |
| Hair TP-logga  | `.header-logo`                     | SVG inline (samma som referens)              |
| Helsida layout | `.page-wrapper`                    | max-width ~600px, centrerad                  |
| Sidhuvud       | `.page-header`                     | Titel + undertitel + badge _X av 9_          |
| Progress       | `.progress-bar` / `.progress-fill` | Bredd = steg/9                               |
| Innehållskort  | `.section-block`                   | Soft card, samma skuggor/tokens som referens |
| Fält           | `.field`, `.checkbox-group`        | Formulärfält enligt Meridiq-typ              |

## Får INTE vara default för dessa dokument

- Kundkort-modal (`cco-step-modal-*`) som enda vy för patient
- `file://`-öppnade overlays utan server (JS laddas inte)
- Nyskriven juridisk text — endast Word/Meridiq/facit-JSON

## Varianter

| Filler            | Badge                  | Signering                        |
| ----------------- | ---------------------- | -------------------------------- |
| Kund              | _3 av 9_ … _9 av 9_    | Patient signerar i botten        |
| Personal          | _8 av 9_ (Op-dag) etc. | Staff + ev. patient (FC)         |
| Info (läs/skicka) | Steg enligt kundresa   | Ingen signering — read-only kort |

## Teknisk målbild (CCO live)

1. **`patient-document-shell.css`** — tokens + komponenter (en fil, **kanonisk färgkälla**)
2. **`patient-document-shell.js`** — renderar header + progress från `registryId` + `journeyStep`
3. **`renderPatientDocument(registryId, contentFromCatalog)`** — fyller `.section-block` från Meridiq/Word-facit
4. Route: `/major-arcana-preview/patient-doc/{registryId}` (dev) → prod patientportal-länk

## Förbjudna färger (CCO live)

Använd **aldrig** mörk mockup-guld i patientdokument:

| Förbjudet                                  | Varför                                              |
| ------------------------------------------ | --------------------------------------------------- |
| `#bd7a18`, `#d89636`, `#dba24a`            | För mörk brons — kommer från gamla kundkort-mockups |
| `linear-gradient(…, #bd7a18)`              | Samma problem                                       |
| Vit text på mörk guld-knapp (Ja/Nej aktiv) | Fel kontrast/känsla för patientformulär             |

**Rätt istället:** `patient-document-shell.css` — ljus sand/peach för valt Ja/Nej, espresso-brun primär CTA.

## Meridiq-ID i patientdokument

**Visa aldrig** Meridiq apiId, mallnummer eller ordet "Meridiq" i patient-synlig HTML (rubrik, brödtext, fotnot).

- Meridiq är **intern facit-källa** i kod/kommentarer/repo — inte i UI.
- `data-meridiq-id` på fält får finnas (dev/CCO-koppling, ej synligt för patient).

## Textkällor vid render

```
SharePoint Word (ordalydelse juridisk)
        ↓ diff
Meridiq catalog (fält + apiId)
        ↓
CCO templateRegistry / bundle JSON
        ↓
HTML shell (design only)
```

Om Word ≠ Meridiq → `NEEDS_LEGAL_REVIEW`, blockera cutover för det dokumentet.
