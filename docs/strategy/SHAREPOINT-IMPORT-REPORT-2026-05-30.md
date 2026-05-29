# SharePoint Import Report - 2026-05-30

*Steg 2 av 3 i SharePoint -> CCO templateRegistry-pipelinen. Genererad av `sharepoint_import_step2`.*

## Sammanfattning

- **Templates uppdaterade:** 4
- **Templates skapade (nya):** 5
- **Hoppade over:** 2
- **Total content-bytes extraherad:** 69,722
- **PII-scan-resultat:** CLEAN (0 findings)

## Sakerhetsverifikation

- Regex for personnummer-monster (`\b\d{6}[-\s]?\d{4}\b`, `\b\d{12}\b`, `\b\d{8}[-\s]\d{4}\b`) korades mot all extraherad text.
- Org.nr `559034-2688` (Hair TP Clinic AB) och klinik-telefoner whitelistas.
- 0 patient-personnummer hittade i den extraherade mall-texten.
- Mall-content lagras endast lokalt i `data/cco-templates.json` (`.gitignore`-d, ej commit till publik GitHub).
- Inga mall-citat i denna rapport - endast storlek + SHA-256 hash-prefix (12 chars).

## Uppdaterade templates

| templateId | brand | gammal version | ny version | content (bytes) | hash (12) | kalla |
|---|---|---|---|---|---|---|
| `agreement_curatiio_generic` | curatiio | 4.0.0 | 4.1.0 | 7,037 (var 173) | `be326e282675` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/2. Curatiio 2026/Behandlingsavtal Curatiio/NY Behandlingsavtal - estetiska och ortopediska behandlingar VIKTIG.docx) |
| `meridiq_consent_behandlingsavtal_prp_hud_170944` | hair_tp | 1.1.0 | 1.2.0 | 5,432 (var 25) | `be3175e5bbe1` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/97. Versioner fran advokat/251203_Behandlingsavtal Hair TP Clinic gbg AB (PRP-behandling).docx) |
| `agreement_hair_tp_generic` | hair_tp | 4.0.0 | 4.1.0 | 6,592 (var 196) | `585b0bc32521` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/97. Versioner fran advokat/251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar1.docx) |
| `fitness_certificate_hair_tp` | hair_tp | 2.2.0 | 2.3.0 | 2,542 (var 3,517) | `39b1dbe2bd92` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/2. Hair TP Clinic 2026/Hartransplantation/5. Friskforsakran TP 2025.docx) |

## Skapade templates (nya)

| templateId | brand | type | version | content (bytes) | hash (12) | kalla |
|---|---|---|---|---|---|---|
| `patient_info_profhilo` | curatiio | patient_information | 1.0.0 | 11,625 | `b8486e51e02d` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/0. NY Tjanstespecifikationer PDF/PDF Tjanstespecifikationer - Curatiio/Profhilo - Tjanstespecifikation 2026.pdf) |
| `patient_info_orthopedics_prp` | curatiio | patient_information | 1.0.0 | 13,602 | `d1d76c88681f` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/0. NY Tjanstespecifikationer PDF/PDF Tjanstespecifikationer - Curatiio/Ortopedisk PRP och PRF - Tjanstespecifikation 2026.pdf) |
| `agreement_orthopedics_prp_curatiio` | curatiio | agreement | 1.0.0 | 7,037 | `be326e282675` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/2. Curatiio 2026/Behandlingsavtal Curatiio/NY Behandlingsavtal - estetiska och ortopediska behandlingar VIKTIG.docx) |
| `agreement_hair_tp_dhi_2day_nordbro` | hair_tp | agreement | 1.0.0 | 6,592 | `585b0bc32521` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/97. Versioner fran advokat/251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar1.docx) |
| `agreement_hair_tp_dhi_7day_nordbro` | hair_tp | agreement | 1.0.0 | 6,592 | `747b74e3e36c` | [SharePoint](https://hairtpclinic1.sharepoint.com/sites/Ledning/Shared Documents/General/1. Kunddokument - KVALITETSSAKRA/97. Versioner fran advokat/251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 7 dagar1.docx) |

## Hoppade over

| templateId/fil | anledning |
|---|---|
| `agreement_fat_dissolving_curatiio` | NY Behandlingsavtal VIKTIG.docx returnerade endast ortopedi-sektionen vid Graph read_resource. Fat-dissolving-sektion kraver DOCX-parsing (Steg 3). |
| `consent_fitness_combined_hair_tp` | Samtycke & Friskforsakran Sammanhangande dokument.docx (Fazlis mapp) - SKIP per inventory (intern konsoliderad mall, ej production). |

## Audit-detaljer

- **Drive:** `b!J9ysU7x080-442YSpY3ck-umNLLDGMRNtOxNUKIJiFmCSMH3wxTSTYHwSsJ7Gy2C` (hairtpclinic1.sharepoint.com/sites/Ledning)
- **Antal nya entries i `revisions[]`:** 4
- Varje revision-entry innehaller: gamla `subject`/`body`/`textHash`/`legalReviewStatus` + `archivedAt` + `replacedByVersion` + `replaceReason="sharepoint_import_2026-05-30"`.
- Atomisk write: tmp-fil + `os.replace()` -> garanterat ingen partial write.
- Ingen patient-PII extraherad. Org.nr 559034-2688 forekommer i avtalstext (icke-PII).

## Anteckningar for Steg 3

### Inte importerade i denna run

- **`agreement_fat_dissolving_curatiio`** - `NY Behandlingsavtal - estetiska och ortopediska behandlingar VIKTIG.docx` (itemId `01OVMUU4WB4KAZWBKZ2NDYFYVU7LRLRTBK`) returnerade endast den ortopediska PRP/PRF-sektionen via Graph read_resource. Filen ar troligen multi-sektion (estetiska + ortopediska behandlingar) men API:t returnerar bara forsta sektionen. Importerad istallet som `agreement_orthopedics_prp_prf_curatiio` (ortopedi-sektion verifierad). Fat-dissolving-sektionen kraver manuell ekstration via download_url eller DOCX-parsing.

- **`meridiq_consent_behandlingsavtal_*_dhi_*`** - finns ej i CCO som DHI-specifik consent idag. De 251203 DHI-filerna importerades som tva nya templates: `agreement_hair_tp_dhi_2day_nordbro` (2-dagars angerfrist-variant) och `agreement_hair_tp_dhi_7day_nordbro` (7-dagars variant). Detta foljer inventory-rekommendationen for Nordbro-canonical-versions.

- **Samtycke & Friskforsakran Sammanhangande dokument.docx** (Fazlis mapp) - SKIP per inventory (intern konsoliderad mall, ej production).

### Rekommenderat for Steg 3

1. Reanvand `NY Behandlingsavtal VIKTIG.docx` via raw download_url + DOCX-parser for att extrahera samtliga behandlingssektioner (Botox, Filler, Profhilo, Fat dissolving, Bleph).
2. Importera resterande tjanstespecifikationer (Botox, Filler, Bleph PDFs samt Hair TP DOCX) for fullstandig 2026-tackning.
3. Konfigurera CI-watcher fdr SharePoint `lastModifiedDateTime` -> auto-pull vid version-bump i kallfil.
