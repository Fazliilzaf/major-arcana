# CCO patientdokument — live-implementering (final-demo-design)

**Skapad:** 2026-06-04  
**Mål:** Alla Hair TP-dokument i kundresan ska visas i **samma design som** `steg3-halsodeklaration-final-demo.html` (Hair TP-logga, helsida, _X av 9_, kort — **inte** kundkort-modal som default).

## Tre källor — aldrig hitta på text

| Prioritet | Källa                               | Vad                                                       | Regel                                        |
| --------- | ----------------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| 1         | **Microsoft SharePoint** (Word/PDF) | Juristgranskade original, kvalitetssäkrade mallar         | Facit för **ordalydelse** vid design/PDF     |
| 2         | **Meridiq-export**                  | `questionary-catalog.json`, `consent-catalog.json`        | Facit för **fält, frågor, apiId** i CCO live |
| 3         | **CCO runtime**                     | `data/cco-templates.json` (SharePoint-import), journal-JS | Det som redan kör i prod/dev                 |

**Förbjudet:** parafrasera, förkorta eller utelämna juridisk text utan ny advokat/Meridiq-version.

## Fysisk arbetsmapp (iCloud)

```
~/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/CCO-patientdokument-live/
├── 00-design-referens/          # final-demo HTML (steg 3/7/8)
├── 01-word-original-lokalt/     # symlinks till .docx som finns på disk
├── 02-sharepoint-index/         # pekare till SharePoint-sökvägar (full lista i repo)
├── 03-meridiq-facit/            # symlinks till migration/meridiq/*.json
└── 04-cco-live/                 # symlinks till journal/pre-treatment/bundle i repo
```

Synka mappen:

```bash
npm run sync:patient-documents-live-folder
```

## Repo-dokumentation

| Fil                                                                                                  | Innehåll                                                  |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **[BOOKOFF-CHECKLIST.md](./BOOKOFF-CHECKLIST.md)**                                                   | **Avprickningslista** — alla 36 typer, kolumner U/T/D/L/V |
| [IMPLEMENTATION-CHECKLIST.md](./IMPLEMENTATION-CHECKLIST.md)                                         | Detaljer per dokument — MS/MQ/CCO, källor, faser          |
| [DESIGN-SPEC.md](./DESIGN-SPEC.md)                                                                   | Layoutregler (header-logo, page-wrapper, progress)        |
| [../strategy/SHAREPOINT-TEMPLATE-INVENTORY.md](../strategy/SHAREPOINT-TEMPLATE-INVENTORY.md)         | 62 SharePoint-filer kartlagda via Microsoft Graph         |
| [../strategy/CCO-STEG789-CONTENT-SOURCE-MATRIX.md](../strategy/CCO-STEG789-CONTENT-SOURCE-MATRIX.md) | Meridiq-lås steg 7/8/9                                    |
| [../strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md](../strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md) | 36 typer · kundresa 9 steg                                |

## SharePoint-rotkälla (Microsoft)

- **Site:** `hairtpclinic1.sharepoint.com/sites/Ledning`
- **Mapp:** `Shared Documents/General/1. Kunddokument - KVALITETSSÄKRA/`
- **Import till CCO:** `docs/strategy/SHAREPOINT-IMPORT-REPORT-2026-05-30.md` → `data/cco-templates.json` (lokal, ej GitHub)

## Designreferens idag (3 filer)

| Steg | Fil                                      | iCloud | Repo | Claude-cache |
| ---- | ---------------------------------------- | ------ | ---- | ------------ |
| 3    | `steg3-halsodeklaration-final-demo.html` | ✅     | ✅   | —            |
| 7    | `steg7-v6-kundkort-final-demo.html`      | ✅     | ✅   | —            |
| 8    | `steg8-friskforsakran-final.html`        | ✅     | ✅   | —            |

Övriga **33** typer: se [BOOKOFF-CHECKLIST.md](./BOOKOFF-CHECKLIST.md).

## Nästa steg (implementation)

1. Godkänn checklistan per dokument (legal + owner).
2. Kopiera steg 7/8 till repo + iCloud `00-design-referens/`.
3. Extrahera **Word → strukturerad HTML** per dokument (ingen fri text).
4. Bygg **en gemensam CSS/JS shell** (`patient-document-shell`) — inte 40 kopior.
5. Koppla shell till CCO live routes (ersätt modal-only för patient-facing docs).
6. Legal diff: Word vs Meridiq vs demo — flagga `VERSION_CONFLICT`.
