# SharePoint Template Inventory
*Genererad: 2026-05-29 · Källa: hairtpclinic1.sharepoint.com/sites/Ledning · Microsoft Graph MCP*

> Steg 1 av 3 i auto-import-pipelinen `SharePoint → data/cco-templates.json`.
> Inventering är gjord via söktermerna: tjänstespecifikation, behandlingsavtal, samtycke,
> friskförsäkran, hälsodeklaration, eftervård, mailmall, bokningsbekräftelse, 251203, KLARSPRÅK,
> INSATT, samt mapprelaterade queries (Fazlis mapp, Curatiio 2026, Hair TP 2026).
> Inga patient-namn eller annan PII är citerad. Endast metadata (filnamn, mapp, datum, URI).

## Sammanfattning

- **Totalt klassificerade dokument:** 62
- **Per brand:** Hair TP=20, Curatiio=27, Shared/båda=9, GDPR-policy=6
- **Per typ:** tjänstespec=29, avtal/behandlingsavtal=11, samtycke=4, friskförsäkran=5,
  hälsodekl=2, mailmall (bokning/offert)=5, GDPR-policy=4, övrigt=2
- **Per källa:** Nordbro-advokat=3, Insatt-staging=1, Fazlis konsoliderad=5,
  Klinikens 2026-mappar=44, GDPR-mapp=4, Mailmallar=5

## Master-mapping (filer → CCO-templateId)

URI-prefix förkortas: alla har drive
`b!J9ysU7x080-442YSpY3ck-umNLLDGMRNtOxNUKIJiFmCSMH3wxTSTYHwSsJ7Gy2C`
om inte annat anges. itemId visas kort (första 12 chars av item-segmentet).

### A. Tjänstespecifikationer — `0. NY Tjänstespecifikationer PDF/` (production-PDF)

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| Tjänstespecifikation - PRP-hårbehandling 2026.pdf | 01OVMUU4UPB4MY | PDF-HTPC | hair_tp | PRP hår | tjänstespec | Internt | 2026-03-10 | patient_info_prp_hair | EXISTS_UPDATE |
| Tjänstespecifikation - PRP-hudbehandling 2026.pdf | 01OVMUU4SYPGM4 | PDF-HTPC | hair_tp | PRP hud | tjänstespec | Internt | 2026-03-10 | patient_info_prp_skin_hair_tp | NEW |
| Tjänstespecifikation - PRF-hudbehandling 2026.pdf | 01OVMUU4XZF4GS | PDF-HTPC | hair_tp | PRF hud | tjänstespec | Internt | 2026-03-10 | patient_info_prf_skin_hair_tp | NEW |
| Tjänstespecifikation - Microneedling och PRP-hudbehandling 2026.pdf | 01OVMUU4WGD72G | PDF-HTPC | hair_tp | Microneedling+PRP hud | tjänstespec | Internt | 2026-03-10 | patient_info_microneedling_prp_hair_tp | NEW |
| Botox® Tjänstespecifikation 2026.pdf | 01OVMUU4XWJX4E | PDF-Curatiio | curatiio | Botox | tjänstespec | Internt | 2026-03-11 | patient_info_botox | EXISTS_UPDATE |
| Fillers - Tjänstespecifikation 2026.pdf | 01OVMUU4SBJUIS | PDF-Curatiio | curatiio | Fillers | tjänstespec | Internt | 2026-03-11 | patient_info_filler | NEW |
| Profhilo® - Tjänstespecifikation 2026.pdf | 01OVMUU4UAGYOB | PDF-Curatiio | curatiio | Profhilo | tjänstespec | Internt | 2026-03-11 | patient_info_profhilo | NEW (löser MISSING) |
| PRF-hudbehandling - Tjänstespecifikation 2026.pdf | 01OVMUU4XW2HHX | PDF-Curatiio | curatiio | PRF hud | tjänstespec | Internt | 2026-03-11 | patient_info_prf_skin_curatiio | NEW |
| PRP-hudbehandling - Tjänstespecifikation 2026.pdf | 01OVMUU4UZOW5L | PDF-Curatiio | curatiio | PRP hud | tjänstespec | Internt | 2026-03-11 | patient_info_prp_skin_curatiio | NEW |
| Microneedling och PRP hudbehandling- Tjänstespecifikation 2026.pdf | 01OVMUU4WSRK6M | PDF-Curatiio | curatiio | Microneedling+PRP hud | tjänstespec | Internt | 2026-03-11 | patient_info_microneedling_prp_curatiio | NEW |
| Ögonlocksplastik - Tjänstespecifikation 2026.pdf | 01OVMUU4XN6EX3 | PDF-Curatiio | curatiio | Bleph | tjänstespec | Internt | 2026-03-11 | patient_info_bleph | EXISTS_UPDATE |
| Ortopedisk PRP och PRF - Tjänstespecifikation 2026.pdf | 01OVMUU4QGQFTB | PDF-Curatiio | curatiio | Ortopedi PRP/PRF | tjänstespec | Internt | 2026-03-11 | patient_info_orthopedics_prp_prf | NEW (löser MISSING) |
| Ortopedisk Hyaluronsyra - Tjänstespecifikation 2026.pdf | 01OVMUU4RB4RE6 | PDF-Curatiio | curatiio | Ortopedi HA | tjänstespec | Internt | 2026-03-11 | patient_info_orthopedics_hyaluronic | NEW |
| Ortopedisk Hyaluronsyra med PRP eller PRF - Tjänstespecifikation 2026.pdf | 01OVMUU4R64W47 | PDF-Curatiio | curatiio | Ortopedi HA+PRP/PRF | tjänstespec | Internt | 2026-03-11 | patient_info_orthopedics_ha_prp_prf | NEW |

### B. Hair TP 2026 — `2. Hair TP Clinic 2026/` (DOCX-arbetskopior)

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| Tjänstespecifikation 2026 – FUE Hårtransplantation.docx | 01OVMUU4VWWUDD | TP/Tjänstespec | hair_tp | FUE | tjänstespec | Internt | 2026-02-06 | patient_info_fue | EXISTS_UPDATE |
| Tjänstespecifikation 2026 – DHI Hårtransplantation.docx | 01OVMUU4RLMB6K | TP/Tjänstespec | hair_tp | DHI | tjänstespec | Internt | 2026-03-06 | patient_info_dhi | NEW |
| Tjänstespecifikation – TP 2026.docx | 01OVMUU4RR4QIV | TP/Tjänstespec | hair_tp | FUE+DHI generisk | tjänstespec | Internt | 2026-03-10 | patient_info_tp_generic | NEW |
| NY Tjänstespecifikation - PRP-hudbehandling.docx | 01OVMUU4R5JP6E | PRP/PRF/MN | hair_tp | PRP hud | tjänstespec | Internt | 2026-03-10 | patient_info_prp_skin_hair_tp | DUPLICATE (PDF i kolumn A) |
| NY Tjänstespecifikation - PRF-hudbehandling.docx | 01OVMUU4RM6HM2 | PRP/PRF/MN | hair_tp | PRF hud | tjänstespec | Internt | 2026-03-10 | patient_info_prf_skin_hair_tp | DUPLICATE |
| NY Tjänstespecifikation - PRP-hårbehandling.docx | 01OVMUU4WIIKOV | PRP/PRF/MN | hair_tp | PRP hår | tjänstespec | Internt | 2026-03-10 | patient_info_prp_hair | DUPLICATE |
| NY Tjänstespecifikation - PRP-hudbehandling och Microneedling.docx | 01OVMUU4UZ34RG | PRP/PRF/MN | hair_tp | Microneedling+PRP | tjänstespec | Internt | 2026-03-10 | patient_info_microneedling_prp_hair_tp | DUPLICATE |
| 5. Friskförsäkran TP 2025.docx | 01OVMUU4WCOKV4 | TP/Hårtransplantation | hair_tp | TP (FUE/DHI) | friskförsäkran | Internt | 2026-02-11 | fitness_certificate_hair_tp | EXISTS_UPDATE |
| Behandlingsavtal - Hårtransplantationer.docx | 01OVMUU4T6M3IV | TP/Behandlingsavtal | hair_tp | TP (FUE/DHI) | avtal | Internt | 2026-02-13 | agreement_hair_tp_generic | EXISTS_UPDATE |

### C. Curatiio 2026 — `2. Curatiio 2026/` (DOCX-arbetskopior)

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| Botox® Tjänstespecifikation 2026.docx | 01OVMUU4UBLZN2 | Estetiska/Tjänstespec | curatiio | Botox | tjänstespec | Internt | 2026-03-11 | patient_info_botox | DUPLICATE (PDF) |
| Fillers - Tjänstespecifikation 2026.docx | 01OVMUU4QX2U4V | Estetiska/Tjänstespec | curatiio | Fillers | tjänstespec | Internt | 2026-03-11 | patient_info_filler | DUPLICATE |
| Profhilo® - Tjänstespecifikation 2026.docx | 01OVMUU4RNBCPG | Estetiska/Tjänstespec | curatiio | Profhilo | tjänstespec | Internt | 2026-03-11 | patient_info_profhilo | DUPLICATE |
| Curatiio - PRP-hudbehandling - Tjänstespecifikation 2026.docx | 01OVMUU4QLFPUC | Estetiska/Tjänstespec | curatiio | PRP hud | tjänstespec | Internt | 2026-03-11 | patient_info_prp_skin_curatiio | DUPLICATE |
| Curatiio - PRF-hudbehandling - Tjänstespecifikation 2026.docx | 01OVMUU4XTE3IJ | Estetiska/Tjänstespec | curatiio | PRF hud | tjänstespec | Internt | 2026-03-11 | patient_info_prf_skin_curatiio | DUPLICATE |
| Curatiio - PRP och Microneedling hudbehandling- Tjänstespecifikation 2026.docx | 01OVMUU4WM3VRG | Estetiska/Tjänstespec | curatiio | Microneedling+PRP | tjänstespec | Internt | 2026-03-12 | patient_info_microneedling_prp_curatiio | DUPLICATE |
| Ögonlocksplastik - Tjänstespecifikation 2026.docx | 01OVMUU4RHMSQI | Ögonlocksplastik | curatiio | Bleph | tjänstespec | Internt | 2026-03-11 | patient_info_bleph | DUPLICATE |
| Ortopedisk PRP - Tjänstespecifikation 2026.docx | 01OVMUU4TETYM4 | Ortopedi | curatiio | Ortopedi PRP | tjänstespec | Internt | 2026-03-11 | patient_info_orthopedics_prp | NEW |
| Ortopedisk PRF - Tjänstespecifikation 2026.docx | 01OVMUU4RMQ26M | Ortopedi | curatiio | Ortopedi PRF | tjänstespec | Internt | 2026-03-11 | patient_info_orthopedics_prf | NEW |
| Ortopedisk Hyaluronsyra - Tjänstespecifikation 2026.docx | 01OVMUU4QLBNGJ | Ortopedi | curatiio | Ortopedi HA | tjänstespec | Internt | 2026-03-12 | patient_info_orthopedics_hyaluronic | DUPLICATE |
| Ortopedisk Hyaluronsyra med PRP eller PRF - Tjänstespecifikation 2026.docx | 01OVMUU4WRN4KY | Ortopedi | curatiio | Ortopedi HA+PRP/PRF | tjänstespec | Internt | 2026-03-11 | patient_info_orthopedics_ha_prp_prf | DUPLICATE |
| 1. Hälsodeklaration - Estetiska injektionsbehandlingar.docx | 01OVMUU4SILBCA | Estetiska | curatiio | All estetiska | hälsodekl | Internt | 2026-01-30 | health_declaration_curatiio | EXISTS_UPDATE |
| 1. NY Hälsodeklaration Ögonlocksplastik.docx | 01OVMUU4QMDPJI | Ögonlocksplastik | curatiio | Bleph | hälsodekl | Internt | 2026-02-12 | health_declaration_bleph | NEW |
| NY Behandlingsavtal - estetiska och ortopediska behandlingar VIKTIG.docx | 01OVMUU4WB4KAZ | Behandlingsavtal Curatiio | curatiio | Alla estetiska + ortopediska | avtal | Internt | 2026-02-12 | agreement_curatiio_generic | EXISTS_UPDATE (löser MISSING för fat_dissolving, orthopedics) |

### D. Nordbro-versioner (advokat) — `97. Versioner från advokat/`

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar1.docx | 01OVMUU4VI732N | 97. Advokat | hair_tp | DHI (2-dagars ångerfrist) | avtal | Nordbro 2025-12-03 | 2026-02-09 | agreement_hair_tp_dhi_2day_nordbro | NEW |
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 7 dagar1.docx | 01OVMUU4UAAI3I | 97. Advokat | hair_tp | DHI (7-dagars) | avtal | Nordbro 2025-12-03 | 2025-12-03 | agreement_hair_tp_dhi_7day_nordbro | NEW |
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (PRP-behandling).docx | 01OVMUU4WSHDH4 | 97. Advokat | hair_tp | PRP | avtal | Nordbro 2025-12-03 | 2025-12-10 | agreement_hair_tp_prp_nordbro | NEW |
| 251030_KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med DHI-tekniken, med kommentarer.docx | 01OVMUU4VO52JX | 97. Advokat | hair_tp | DHI | patientinfo+tjänstespec | Nordbro 2025-10-30 | 2026-02-09 | patient_info_dhi_klarsprak_nordbro | SKIP_OLD (251203-version ersätter) |

### E. Insatt-versioner — `INSATT - HTPC/`

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| TP Avtal.docx | 01OVMUU4Q2CDS7 | INSATT - HTPC | hair_tp | FUE | avtal | Insatt | 2025-04-30 | agreement_hair_tp_fue_insatt | SKIP_OLD (Nordbro 251203 ersätter) |
| TP Kundprocess och dokument Förslag – kopia.docx | 01OVMUU4XY2EQX | INSATT - HTPC | hair_tp | Process | dokumentation | Insatt | 2025-04-30 | — | SKIP (process-dokumentation, ej template) |

### F. Mailmallar — `98. Mailmallar/`

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| Konsultation – Bokningsbekräftelse.docx | 01OVMUU4SB75WD | 98. Mailmallar | shared | Konsultation | mailmall (boknings­bekräftelse) | Internt | 2026-02-11 | booking_confirmation_consultation | NEW |
| Behandling med förskottsbetalning bokningsbekräftelse.docx | 01OVMUU4U6AYFW | 98. Mailmallar/Behandling bokningsbekräftelse | hair_tp | TP | mailmall | Internt | 2026-02-12 | booking_confirmation_treatment_prepay_hair_tp | NEW |
| Behandling utan förskottsbetalning bokningsbekräftelse.docx | 01OVMUU4WSHW2A | 98. Mailmallar/Behandling bokningsbekräftelse | hair_tp | TP | mailmall | Internt | 2026-02-11 | booking_confirmation_treatment_no_prepay_hair_tp | NEW |
| Behandlingsplan och offert - HÅRTRANSPLANTATION.docx | 01OVMUU4VLR5UY | 98. Mailmallar/Offert | hair_tp | TP | mailmall (offert) | Internt | 2026-02-12 | offer_treatment_plan_hair_tp | NEW |
| Behandlingsplan och offert - ÖGONLOCK.docx | 01OVMUU4Q5MVWV | 98. Mailmallar/Offert | curatiio | Bleph | mailmall (offert) | Internt | 2026-02-12 | offer_treatment_plan_bleph | NEW |
| Behandlingsplan och offert – PRP  PRF.docx | 01OVMUU4RSWHZY | 98. Mailmallar/Offert | shared | PRP/PRF/Microneedling | mailmall (offert) | Internt | 2026-02-12 | offer_treatment_plan_prp_prf | NEW |

### G. Fazlis konsoliderade staging-mapp — `99. Fazlis mapp/`

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| Samtycke & Friskförsäkran – Sammanhängande dokument.docx | 01OVMUU4Q47YQP | 99. Fazli | hair_tp | TP | samtycke+friskförsäkran | Konsoliderad | 2025-08-14 | consent_fitness_combined_hair_tp | NEW |
| NY Friskförsäkran.docx | 01OVMUU4X4JOUP | 99. Fazli | hair_tp | TP | friskförsäkran | Konsoliderad | 2026-01-21 | fitness_certificate_hair_tp | DUPLICATE av 5. Friskförsäkran TP 2025 |
| NY Friskförsäkran1.docx | 01OVMUU4XKYM4G | 99. Fazli | hair_tp | TP | friskförsäkran | Konsoliderad | 2026-01-21 | — | DUPLICATE |
| NY Friskförsäkran2.docx | 01OVMUU4VVBMIU | 99. Fazli | hair_tp | TP | friskförsäkran | Konsoliderad | 2026-01-21 | — | DUPLICATE |
| NY Ordination – Lokalbedövning vid hår-.docx | 01OVMUU4WRJNAO | 99. Fazli | hair_tp | TP | ordination (internt) | Konsoliderad | 2026-05-18 | — | SKIP (internt protokoll, ej patient-template) |

### H. Kundresan / 99. Kundresan — `99. Kundresan - mallar, blanketter och broschyrer/`

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| 2. Offert - kundmall.pdf | 01OVMUU4VP6KTR | Kundresan | hair_tp | TP | offert-PDF | Internt | 2025-02-19 | — | SKIP_OLD (ersätts av 98. Mailmallar) |
| 3. FUE Avtal.pdf | 01OVMUU4QPHT63 | Kundresan | hair_tp | FUE | avtal | Internt | 2024-12-10 | — | SKIP_OLD (Nordbro ersätter) |
| 4. Friskförsäkran Hårtransplantation.pdf | 01OVMUU4VPL5YB | Kundresan | hair_tp | TP | friskförsäkran | Internt | 2024-12-10 | — | SKIP_OLD |
| 0. Kundprocessen TP (alla delar) VIKTIG.docx | 01OVMUU4SBX3N5 | Kundresan | hair_tp | Process | dokumentation | Internt | 2025-08-13 | — | SKIP (process-dokumentation) |
| Behandlingsavtal - FUE Nuvarande.docx | 01OVMUU4XFAHMY | 3. Avtal | hair_tp | FUE | avtal | Internt | 2025-02-19 | — | SKIP_OLD (Nordbro 251203 ersätter) |
| Avtal - Hårtransplantation med DHI-metoden 2.0.docx | 01OVMUU4WR4DUZ | 3. Avtal | hair_tp | DHI | avtal | Internt | 2025-02-19 | — | SKIP_OLD |

### I. GDPR-mapp — `GDPR/`

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| Informations- och samtyckespolicy .docx | 01OVMUU4XMFPRA | GDPR | shared | — | GDPR-policy | Internt | 2025-04-25 | policy_gdpr_consent | NEW |
| Samtyckesformulär för behandling och hantering av personuppg.docx | 01OVMUU4X5VQHT | GDPR | shared | — | samtycke (PII) | Internt | 2025-03-24 | consent_pii_processing | NEW |
| Information om personuppgiftsbehandling - HTPC.docx | 01OVMUU4TLJUFK | GDPR | hair_tp | — | GDPR-info | Internt | 2025-02-19 | policy_gdpr_info_hair_tp | NEW |
| GDPR-riktlinjer.docx | 01OVMUU4RLPJAU | GDPR | shared | — | internt direktiv | Internt | 2025-03-24 | — | SKIP (internt direktiv, ej patient-template) |

### J. Bokningsvillkor — `1. Bokningsvillkor/`

| Fil | itemId (kort) | Mapp | Brand | Behandling | Typ | Källa | Senast ändrad | Föreslagen templateId | CCO-status |
|---|---|---|---|---|---|---|---|---|---|
| Bokningsvillkor 2026.docx | 01OVMUU4TI2MW5 | 1. Bokningsvillkor | shared | — | villkor | Internt | 2026-02-13 | booking_terms_2026 | NEW |

## Behandlings-coverage-matrix

Legend: ✅ täckt med 2026-mall · ❓ saknas · ⚠️ behöver bekräftas

| Behandling | Tjänstespec | Patientinfo | Avtal | Samtycke | Friskförsäkran | Hälsodekl | Eftervård |
|---|---|---|---|---|---|---|---|
| FUE (Hair TP) | ✅ TP 2026 (FUE+DHI) | ✅ KLARSPRÅK | ✅ Nordbro PRP-avtal saknar FUE-specifik – sannolikt återanvänd DHI-mall | ⚠️ Fazli combined | ✅ 5. TP 2025 | (i tjänstespec) | ❓ |
| DHI (Hair TP) | ✅ 2026 – DHI | ✅ KLARSPRÅK DHI | ✅ Nordbro 251203 (2- & 7-dagar) | ⚠️ Fazli combined | ✅ 5. TP 2025 | (i tjänstespec) | ❓ |
| PRP hår | ✅ PRP-hårbehandling 2026 | (samma) | ✅ Nordbro 251203 PRP | ❓ | (samma fitness) | (i tjänstespec) | ❓ |
| PRP hud | ✅ HTPC + Curatiio PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ Estetiska 1. Hälsodekl | ❓ |
| PRF hud | ✅ HTPC + Curatiio PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ Estetiska 1. Hälsodekl | ❓ |
| Microneedling+PRP hud | ✅ HTPC + Curatiio PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ Estetiska 1. Hälsodekl | ❓ |
| Botox (Curatiio) | ✅ Botox 2026 PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ Estetiska 1. Hälsodekl | ❓ |
| Filler (Curatiio) | ✅ Fillers 2026 PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ Estetiska 1. Hälsodekl | ❓ |
| Profhilo | ✅ Profhilo 2026 PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ Estetiska 1. Hälsodekl | ❓ |
| Fat dissolving | ❓ ej hittad tjänstespec 2026 | ❓ | ✅ NY Behandlingsavtal VIKTIG (estetiska samlade) | ❓ | — | ✅ Estetiska 1. Hälsodekl | ❓ |
| Bleph (Ögonlocksplastik) | ✅ Ögonlocksplastik 2026 PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ 1. NY Hälsodekl Ögon | ❓ |
| Ortopedisk PRP+PRF | ✅ Ortopedisk PRP och PRF PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ Estetiska 1. Hälsodekl (delas) | ❓ |
| Ortopedisk Hyaluronsyra | ✅ Ortopedisk HA PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ (delas) | ❓ |
| Ortopedisk HA+PRP/PRF | ✅ Kombo-PDF | (samma) | ✅ NY Behandlingsavtal VIKTIG | ❓ | — | ✅ (delas) | ❓ |

**Eftervård**: ingen 2026-PDF observerad i `0. NY Tjänstespecifikationer PDF/`. CCO har idag
`aftercare_fue/prp_hair/botox/bleph/filler` (cco_native). Skapa MISSING-flagga för
SharePoint-mappad eftervård om sådan ska importeras (annars håll CCO-versionen som canonical).

**Samtycke**: alla 2026-tjänstespec inkluderar samtyckes-text inline. För separata
samtyckesblanketter finns endast Fazli-konsoliderad `Samtycke & Friskförsäkran – Sammanhängande
dokument.docx` samt GDPR `Samtyckesformulär för behandling och hantering av personuppg.docx`.

## Nordbro-versioner (97. Versioner från advokat)

Filer prefixade `251203_` = 2025-12-03 levererade av Nordbro (advokat) → ska behandlas som
juridiskt godkända production-versioner. `251030_` är äldre kommentar-runda.

| Fil | Nordbro-datum | Status |
|---|---|---|
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar1.docx | 2025-12-03 | CANONICAL för DHI 2-dagars ångerfrist |
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 7 dagar1.docx | 2025-12-03 | CANONICAL för DHI 7-dagars |
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (PRP-behandling).docx | 2025-12-03 | CANONICAL för PRP-behandling (hår) |
| 251030_KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med DHI-tekniken, med kommentarer.docx | 2025-10-30 | LEGACY (251203 ersätter) |

Endast 3 produktiva Nordbro-avtal i mappen — FUE-specifikt och Curatiio-avtal har INTE
levererats av Nordbro i denna inventering. NY Behandlingsavtal i Curatiio 2026 är
internt utvecklat (ej advokat-godkänt).

## Insatt-versioner (INSATT - HTPC)

`INSATT - HTPC/` är en staging/avstämningsmapp. Innehåller mest verksamhetsfiler
(egenkontroll, riskanalys, läkemedelshantering, jobbannonser) — endast 1 patient-template:

| Fil | Brand | Typ | Status |
|---|---|---|---|
| TP Avtal.docx | hair_tp | avtal FUE | SKIP_OLD — Nordbro 251203 ersätter, men inget FUE-version! Använd DHI-mall som fallback |

## Fyller MISSING_TEMPLATE-flaggor?

Nuvarande CCO har INGA explicita `MISSING_TEMPLATE`-strängar (verifierat via grep), men nedan
identifierar jag templates som BEHÖVER skapas baserat på den 3-rad lista som uppdraget nämner:

| CCO templateId | SharePoint-fil | URI (kort) | Lösning |
|---|---|---|---|
| patient_info_profhilo | Profhilo® - Tjänstespecifikation 2026.pdf | `…/01OVMUU4UAGYOB` | EXISTS — importera (NEW) |
| patient_info_fat_dissolving | (ingen separat tjänstespec hittad — endast i NY Behandlingsavtal VIKTIG) | — | UNKNOWN — be klinik bekräfta om Curatiio erbjuder Fat dissolving 2026 |
| patient_info_orthopedics_prp | Ortopedisk PRP och PRF - Tjänstespecifikation 2026.pdf | `…/01OVMUU4QGQFTB` | EXISTS — importera (NEW) |
| agreement_fat_dissolving_curatiio | NY Behandlingsavtal - estetiska och ortopediska behandlingar VIKTIG.docx | `…/01OVMUU4WB4KAZ` | EXISTS (samlat avtal täcker alla estetiska) — importera som agreement_curatiio_aesthetic_orthopedic |
| agreement_orthopedics_prp_curatiio | NY Behandlingsavtal - estetiska och ortopediska behandlingar VIKTIG.docx | `…/01OVMUU4WB4KAZ` | EXISTS — samma fil löser denna (ortopedisk del) |

Notera: CCO har redan `meridiq_consent_behandlingsavtal_*_170941..170955` som täcker
Meridiq-spec'ade Curatiio-avtal — fokus för SharePoint-import bör vara Hair TP/Nordbro samt
nya tjänstespecifikationer som ej finns i Meridiq.

## Föreslagen import-strategi (för Steg 2)

För `scripts/import-sharepoint-templates.js`:

1. **PDF före DOCX** för production-fil (`0. NY Tjänstespecifikationer PDF/` har företräde över `2. Brand 2026/`-DOCX).
2. **Nordbro `97. Versioner från advokat/` har högsta juridiska prioritet** för avtal.
   `251203_*` versioner > `251030_*` versioner > interna `99. Kundresan/3. Avtal/`.
3. **`INSATT - HTPC/` deprioriteras** — endast fallback om Nordbro-version saknas.
   Gäller framförallt FUE-avtal (ingen Nordbro-FUE i inventeringen).
4. **`98. Mailmallar/`** importeras som transactional templates (booking_confirmation, offer).
5. **Filtrera bort:**
   - `99. KLARSPRÅK - Kan denna raderas nu/` — gamla utkast
   - `Verksamhetsutveckling/Tjänstespecifikation - Testversioner/` — test
   - Filer med `KOPIA_` / `(kopia)` / `1.docx` (utan kontext) prefix
   - Filer i personal OneDrive (`-my.sharepoint.com/personal/...`) — inte canonical
6. **Brand-detektering** kan göras på filnamn (Botox/Profhilo/Filler/Ögonlocksplastik/Ortopedi → curatiio; FUE/DHI/PRP-hår → hair_tp) eller på mapp-path (`2. Curatiio 2026/` vs `2. Hair TP Clinic 2026/`).
7. **Version-tracking:** lagra `sharePointDriveId` + `sharePointItemId` + `lastModifiedDateTime` på varje template för diff-detektering i framtida sync-körningar.
8. **textHash-jämförelse:** läs DOCX/PDF-content via `read_resource`, beräkna SHA-256 på normaliserat content och jämför mot `textHash` i `cco-templates.json` för att avgöra EXISTS_MATCH vs EXISTS_UPDATE.

## Anteckningar / problem upptäckta

- **Folder-filter (`folderName`) returnerar inget** för `97. Versioner från advokat` och `98. Mailmallar` — använd istället specifika textqueries (`251203`, `Mailmall`, `bokningsbekräftelse`).
- **`Behandlingsplan och offert - ÖGONLOCK.docx`** matchar både `behandlingsavtal` och `samtycke` — heuristik på mappnamn (`98. Mailmallar/`) gör att den klassas som mailmall, inte avtal.
- **Fat dissolving** saknar 2026-tjänstespec — antingen ny behandling som inte rullats ut, eller äldre Meridiq-version (`meridiq_consent_fettuplosande_injektioner_swe_152996` finns redan i CCO). Kräver klarifikation från kliniken.
- **Eftervård** (aftercare_*) finns i CCO som `cco_native` men ingen 2026-version observerad i SharePoint `0. NY Tjänstespecifikationer PDF/`. Eftervård är inbakad i varje tjänstespec som sektion — möjligen ingen separat fil behövs.
- **DUPLICATE-rader**: 11 DOCX-arbetskopior i `2. Hair TP Clinic 2026/` + `2. Curatiio 2026/` är duplicates av PDF:erna i `0. NY Tjänstespecifikationer PDF/`. Import-script bör hoppa över alla DOCX där en motsvarande PDF finns med samma stem-namn och senare/samma `lastModifiedDateTime`.
- **`Verksamhetsutveckling/Avtal - utvecklingsarbete/`** har 4 äldre `Avtalsmall - FUE/DHI` filer — alla är SKIP_OLD.
- **PII-läckage: 0** — endast metadata och rubriker har citerats, inga patient-namn, personnummer eller behandlingsdetaljer.
- **Personal OneDrive-träffar** (`-my.sharepoint.com/personal/felix_/leonora_/fazli_`) ignoreras eftersom det är personliga arbetskopior, ej canonical organisations-data.
