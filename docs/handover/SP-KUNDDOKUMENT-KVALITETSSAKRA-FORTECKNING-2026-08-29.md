# Förteckning — SharePoint: `1. Kunddokument - KVALITETSSÄKRA`

> **ORD-142** · 2026-08-29 · **LÄSLÄGE** — inget har flyttats, döpts om eller laddats upp. GetAccept orört. Signerade patientdokument skippade. Inga personnummer återgivna.

---

## 1. Sökvägsmapping — hur `sharepoint://` pekar i verkligheten

`sharepoint://hairtpclinic1/Ledning/General/...` **är inte** rotwebbplatsen "Hair TP Clinic Intra" och **är inte** en mapp i rotwebbplatsens Documents-bibliotek. Den pekar på en **egen SharePoint-webbplats**:

| Del i refen | Verklig plats |
|---|---|
| `hairtpclinic1` | tenant/hostname `hairtpclinic1.sharepoint.com` |
| `Ledning` | webbplats **"Ledning"** → `https://hairtpclinic1.sharepoint.com/sites/Ledning` (site-id `…53acdc27-74bc-4ff3-b8e3-6612a58ddc93…`) |
| `General` | mapp "General" i webbplatsens standardbibliotek **"Documents" (Shared Documents)** |
| `1. Kunddokument - KVALITETSSÄKRA` | mapp (med riktigt **Ä**, även om refen skriver "KVALITETSSAKRA" utan diakrit) |
| `97. Versioner fran advokat` | mapp (riktigt namn **"97. Versioner från advokat"**) |

Webbplatsen "Ledning" har **två** bibliotek: **"Documents" (Shared Documents)** — standard, innehåller `General/` — och **"Verksamhetsutveckling"**. Relevanta eftervårdsdokument ligger utspridda på **båda** (se §3 Luckor).

---

## 2. Förteckning — en rad per dokument

Bas-sökväg för raderna nedan (relativ under `General/`):
`1. Kunddokument - KVALITETSSÄKRA/`

Typ-kolumnen svarar på ORD-142:s fråga "är detta ett förberedelse/eftervård-underlag": **båda / förberedelse / eftervård**, annars **nej — <dokumenttyp>**.

### 2.1 Förberedelse- & eftervårdsunderlag (inom scopet)

| Filnamn | Sökväg | Typ | Behandling | Klinik | Senast ändrad | Format |
|---|---|---|---|---|---|---|
| Förberedelse och Eftervård TP - Nuvarande.docx | `99. Kundresan - mallar, blanketter och broschyrer/2. Förberedelse & Eftervård/Textversion - Risker, förberedelser och eftervård/` | båda | Hårtransplantation (TP) | hairtp | 2025-02-19 | docx (text) |
| TP Förberedelser och eftervård tidslinje.docx | `…/2. Förberedelse & Eftervård/Textversion - Risker, förberedelser och eftervård/` | båda | Hårtransplantation (TP) | hairtp | 2025-02-19 | docx |
| TP Förberedelser, eftervård milstolpar.docx | `…/2. Förberedelse & Eftervård/Textversion - Risker, förberedelser och eftervård/` | båda | Hårtransplantation (TP) | hairtp | 2025-02-19 | docx |
| Risker och biverkningar - Leo stil.docx | `…/2. Förberedelse & Eftervård/Textversion - Risker, förberedelser och eftervård/` | nej — risk/biverkningar | Hårtransplantation (TP) | hairtp | 2025-02-19 | docx |
| 2. TP Risker och biverkningar - Hair TP Clinic.pdf | `…/2. Förberedelse & Eftervård/PDFversion - Risker, förberedelser och eftervård/` | nej — risk/biverkningar | Hårtransplantation (TP) | hairtp | 2024-12-16 | PDF |
| 1. Förberedelser & Eftervård vid hårtransplantation - Hair TP Clinic.pptx | `…/2. Förberedelse & Eftervård/` | båda | Hårtransplantation (TP) | hairtp | 2025-02-19 | pptx |
| F&E TEST.pptx | `…/2. Förberedelse & Eftervård/` | båda (test) | Hårtransplantation (TP) | hairtp | 2025-02-07 | pptx |
| Tjänstespecifikation, Risker och biverkningar TP FUE - Hair TP Clinic.pptx | `…/2. Förberedelse & Eftervård/` | nej — risk/biverkningar | Hårtransplantation (FUE) | hairtp | 2025-02-19 | pptx |
| 3. Förberedelser vid hårtransplantation.docx | `…/Dokument för kundresan - ska flyttas/` | förberedelse | Hårtransplantation (FUE) | hairtp | 2024-10-18 | docx |
| 4. Eftersguide vid hårtransplantation.docx | `…/Dokument för kundresan - ska flyttas/` | eftervård | Hårtransplantation (FUE) | hairtp | 2024-10-16 | docx |
| 4. Test Eftervård.docx | `…/Dokument för kundresan - ska flyttas/` | eftervård (test) | Hårtransplantation | hairtp | 2024-12-13 | docx |
| 2. Risker och biverkningar.docx | `…/Dokument för kundresan - ska flyttas/` | nej — risk/biverkningar | Hårtransplantation (FUE) | hairtp | 2024-10-16 | docx |
| 2. Förberedelser & Eftervård.docx | `…/Kundresan/` | båda | Hårtransplantation | hairtp | 2025-02-19 | docx (mall) |

**Slutsats 2.1:** Alla förberedelse-/eftervårdsunderlag *inom scopet* gäller **enbart hårtransplantation, enbart Hair TP Clinic**, och ligger i den gamla "99. Kundresan"-mappen (daterad 2024–2025). Ingen ren, aktuell patient-PDF. Inget för Curatiio.

### 2.2 `97. Versioner från advokat/` (versionsdubbletter — se §4)

| Filnamn | Sökväg | Typ | Behandling | Klinik | Senast ändrad | Format |
|---|---|---|---|---|---|---|
| 251030_KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med DHI-tekniken, med kommentarer.docx | `97. Versioner från advokat/` | nej — tjänstespec/patientinfo | Hårtransplantation (DHI) | hairtp | 2026-02-09 | docx |
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar1.docx | `97. Versioner från advokat/` | nej — avtal | Hårtransplantation (DHI, 2 dagar) | hairtp | 2026-02-09 | docx |
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 7 dagar1.docx | `97. Versioner från advokat/` | nej — avtal | Hårtransplantation (DHI, 7 dagar) | hairtp | 2025-12-10 | docx |
| 251203_Behandlingsavtal Hair TP Clinic gbg AB (PRP-behandling).docx | `97. Versioner från advokat/` | nej — avtal | PRP-behandling | hairtp | 2025-12-10 | docx |
| BOKNINGSVILLKOR – HAIR TP CLINIC (2-7 DAGARS BETÄNKETID).docx | `97. Versioner från advokat/` | nej — bokningsvillkor | generell | hairtp | 2025-12-11 | docx |

### 2.3 `0. NY Tjänstespecifikationer PDF/` (ny PDF-svit — ej F&E, men de "NY" tjänstespec:arna)

**`PDF Tjänstespecifikationer - Curatiio/`** (10 st, alla format PDF):

| Filnamn | Behandling | Klinik | Senast ändrad |
|---|---|---|---|
| Botox® Tjänstespecifikation 2026.pdf | Botox | curatiio | 2026-03-11 |
| Fillers - Tjänstespecifikation 2026.pdf | Fillers | curatiio | 2026-03-11 |
| Microneedling och PRP hudbehandling- Tjänstespecifikation 2026.pdf | Microneedling + PRP hud | curatiio | 2026-03-11 |
| Ögonlocksplastik - Tjänstespecifikation 2026.pdf | Ögonlocksplastik | curatiio | 2026-03-11 |
| Ortopedisk Hyaluronsyra - Tjänstespecifikation 2026.pdf | Ortopedi (hyaluronsyra) | curatiio | 2026-03-11 |
| Ortopedisk Hyaluronsyra med PRP eller PRF - Tjänstespecifikation 2026.pdf | Ortopedi (HA+PRP/PRF) | curatiio | 2026-03-11 |
| Ortopedisk PRP och PRF - Tjänstespecifikation 2026.pdf | Ortopedi (PRP/PRF) | curatiio | 2026-03-11 |
| PRF-hudbehandling - Tjänstespecifikation 2026.pdf | PRF hud | curatiio | 2026-03-11 |
| PRP-hudbehandling - Tjänstespecifikation 2026.pdf | PRP hud | curatiio | 2026-03-11 |
| Profhilo® - Tjänstespecifikation 2026.pdf | Profhilo | curatiio | 2026-03-11 |

**`PDF Tjänstespecifikationer - HTPC/`** (5 st, alla format PDF):

| Filnamn | Behandling | Klinik | Senast ändrad |
|---|---|---|---|
| Tjänstespecifikation - Microneedling och PRP-hudbehandling 2026.pdf | Microneedling + PRP hud | hairtp | 2026-03-11 |
| Tjänstespecifikation - PRF-hudbehandling 2026.pdf | PRF hud | hairtp | 2026-03-10 |
| Tjänstespecifikation - PRP-hårbehandling 2026.pdf | PRP hår | hairtp | 2026-03-10 |
| Tjänstespecifikation - PRP-hudbehandling 2026.pdf | PRP hud | hairtp | 2026-03-10 |
| Tjänstespecifikation – TP 2026.pdf | Hårtransplantation | hairtp | 2026-03-10 |

> Dessa är **tjänstespecifikationer** (risker/metod/ansvar), inte förberedelse-/eftervårdsguider. De täcker Curatiios hela injektionssortiment — men bara som tjänstespec.

### 2.4 Övriga kunddokument (avtal, hälsodeklaration, tjänstespec, ordination, journal, offert, friskförsäkran, mailmall, PM)

**`1. Bokningsvillkor/`**
| Filnamn | Senast ändrad | Format |
|---|---|---|
| BOKNINGSVILLKOR – HAIR TP CLINIC OCH CURATIIO (2-7 DAGARS BETÄNKETID) – kopiera.docx | 2026-02-12 | docx |
| Bokningsvillkor 2026.docx | 2026-02-13 | docx |

**`2. Curatiio 2026/`**
| Filnamn | Sökväg (rel) | Typ | Behandling | Senast ändrad | Format |
|---|---|---|---|---|---|
| NY Behandlingsavtal - estetiska och ortopediska behandlingar VIKTIG.docx | `Behandlingsavtal Curatiio/` | nej — avtal | estetisk+ortopedisk | 2026-02-12 | docx |
| NY Behandlingsavtal Ögonlocksplastik, 7 dagar.docx | `Behandlingsavtal Curatiio/` | nej — avtal | ögonlocksplastik | 2026-02-12 | docx |
| 1. Hälsodeklaration - Estetiska injektionsbehandlingar.docx | `Estetiska injektionsbehandlingar/` | nej — hälsodeklaration | estetiska injektioner | 2026-02-04 | docx |
| Botox® Tjänstespecifikation 2026.docx | `Estetiska injektionsbehandlingar/Tjänstespecifikationer - Estetiska injektionsbehandlingar 2026/` | nej — tjänstespec | Botox | 2026-03-11 | docx |
| Curatiio - PRF-hudbehandling - Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Estetiska… 2026/` | nej — tjänstespec | PRF hud | 2026-03-11 | docx |
| Curatiio - PRP och Microneedling hudbehandling- Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Estetiska… 2026/` | nej — tjänstespec | PRP+Microneedling | 2026-03-12 | docx |
| Curatiio - PRP-hudbehandling - Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Estetiska… 2026/` | nej — tjänstespec | PRP hud | 2026-03-11 | docx |
| Fillers - Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Estetiska… 2026/` | nej — tjänstespec | Fillers | 2026-03-11 | docx |
| Profhilo® - Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Estetiska… 2026/` | nej — tjänstespec | Profhilo | 2026-03-11 | docx |
| 1. NY Hälsodeklaration Ögonlocksplastik.docx | `Ögonlocksplastik/` | nej — hälsodeklaration | ögonlocksplastik | 2026-02-12 | docx |
| Ögonlocksplastik - Tjänstespecifikation 2026.docx | `Ögonlocksplastik/` | nej — tjänstespec | ögonlocksplastik | 2026-03-11 | docx |
| Nuvarande - Information vid ögonlocksplastik (Dermatochalasis).pdf | `Ögonlocksplastik/Nuvarande material - kika även här/` | båda | ögonlocksplastik | 2025-08-13 | PDF |
| Nuvarande Hälsodeklaration - Ögonlocksplastik.docx | `Ögonlocksplastik/Nuvarande material - kika även här/` | nej — hälsodeklaration | ögonlocksplastik | 2026-01-30 | docx |
| Nuvarande Journal - Ögonlocksplastik.docx | `Ögonlocksplastik/Nuvarande material - kika även här/` | nej — journal | ögonlocksplastik | 2026-01-30 | docx |
| 1. Hälsodeklaration - Ortopedisk PRP, PRF, Hyaluronsyra.docx | `Ortopediska injektionsbehandlingar/` | nej — hälsodeklaration | ortopedi | 2026-01-27 | docx |
| Ortopedisk Hyaluronsyra - Tjänstespecifikation 2026.docx | `Ortopediska injektionsbehandlingar/Tjänstespecifikationer - Ortopedi/` | nej — tjänstespec | ortopedi (HA) | 2026-03-12 | docx |
| Ortopedisk Hyaluronsyra med PRP eller PRF - Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Ortopedi/` | nej — tjänstespec | ortopedi (HA+PRP/PRF) | 2026-03-11 | docx |
| Ortopedisk PRF - Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Ortopedi/` | nej — tjänstespec | ortopedi (PRF) | 2026-03-11 | docx |
| Ortopedisk PRP - Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Ortopedi/` | nej — tjänstespec | ortopedi (PRP) | 2026-03-11 | docx |
| Ortopedisk PRP och PRF - Tjänstespecifikation 2026.docx | `…/Tjänstespecifikationer - Ortopedi/` | nej — tjänstespec | ortopedi (PRP+PRF) | 2026-03-11 | docx |

**`2. Hair TP Clinic 2026/`**
| Filnamn | Sökväg (rel) | Typ | Behandling | Senast ändrad | Format |
|---|---|---|---|---|---|
| Behandlingsavtal - Hårtransplantationer.docx | `Behandlingsavtal Hair TP Clinic/` | nej — avtal | hårtransplantation | 2026-02-13 | docx |
| Behandlingsavtal - PRP, PRF och microneedling.docx | `Behandlingsavtal Hair TP Clinic/` | nej — avtal | PRP/PRF/microneedling | 2026-02-13 | docx |
| 1. Hälsodeklaration TP, PRP, Microneedling PRF.docx | `Hårtransplantation/` | nej — hälsodeklaration | TP/PRP/microneedling | 2026-01-30 | docx |
| 3. NY Indviduell Ordination - UTAN TABELLER.docx | `Hårtransplantation/` | nej — ordination | TP | 2026-02-11 | docx |
| 3. NY Ordination – individuell för varje patient.docx | `Hårtransplantation/` | nej — ordination | TP | 2026-02-11 | docx |
| 5. Friskförsäkran TP 2025.docx | `Hårtransplantation/` | nej — friskförsäkran | TP | 2026-02-11 | docx |
| 5. Friskförsäkran TP 2026 - ändrad av LK.docx | `Hårtransplantation/` | nej — friskförsäkran | TP | 2026-02-11 | docx |
| 6. Journalföring TP - Alla formulär.docx | `Hårtransplantation/` | nej — journal | TP | 2025-08-14 | docx |
| 6. TP  Journal – Behandling FÖRSLAG.docx | `Hårtransplantation/` | nej — journal | TP | 2026-02-11 | docx |
| Tjänstespecifikation – TP 2026.docx | `Hårtransplantation/Tjänstespecifikation TP 2026/` | nej — tjänstespec | TP | 2026-03-10 | docx |
| Tjänstespecifikation 2026 – DHI Hårtransplantation.docx | `Hårtransplantation/Tjänstespecifikation TP 2026/` | nej — tjänstespec | DHI | 2026-03-06 | docx |
| Tjänstespecifikation 2026 – FUE Hårtransplantation.docx | `Hårtransplantation/Tjänstespecifikation TP 2026/` | nej — tjänstespec | FUE | 2026-02-06 | docx |
| KOPIA_Patientinformation & Tjänstespecifikation – TP – kopia_02.docx | `Hårtransplantation/Tjänstespecifikation TP 2026/` | nej — tjänstespec (KOPIA) | TP | 2026-03-07 | docx |
| KOPIA_Patientinformation & Tjänstespecifikation – TP – kopia123.docx | `Hårtransplantation/Tjänstespecifikation TP 2026/` | nej — tjänstespec (KOPIA) | TP | 2026-03-07 | docx |
| KOPIA_Patientinformation & Tjänstespecifikation – TP – kopiera.docx | `Hårtransplantation/Tjänstespecifikation TP 2026/` | nej — tjänstespec (KOPIA) | TP | 2026-03-07 | docx |
| Läkemedels-PM – Översikt och index.docx | `Hårtransplantation/PM 2026/` | nej — PM läkemedel | TP | 2026-01-23 | docx |
| PM – Adrenalin (epinefrin).docx | `Hårtransplantation/PM 2026/Lokalbedövning och tilläggsmedel/` | nej — PM läkemedel | TP | 2026-01-23 | docx |
| PM – Carbocain® (mepivakain).docx | `…/Lokalbedövning och tilläggsmedel/` | nej — PM läkemedel | TP | 2026-01-23 | docx |
| PM - Marcain® (bupivakain).docx | `…/Lokalbedövning och tilläggsmedel/` | nej — PM läkemedel | TP | 2026-01-23 | docx |
| PM – Tribonat® (trometamol).docx | `…/Lokalbedövning och tilläggsmedel/` | nej — PM läkemedel | TP | 2026-01-23 | docx |
| PM – Betapred® (betametason).docx | `Hårtransplantation/PM 2026/Postoperativa läkemedel/` | nej — PM läkemedel | TP | 2026-01-23 | docx |
| PM – Dalacin® (klindamycin).docx | `…/Postoperativa läkemedel/` | nej — PM läkemedel | TP | 2026-01-23 | docx |
| PM – Paracetamol.docx | `…/Postoperativa läkemedel/` | nej — PM läkemedel | TP | 2026-01-23 | docx |
| Journalföring - PRP (saknas för PRF och Microneedling).docx | `PRP, PRF och Microneedling/` | nej — journal | PRP | 2026-02-11 | docx |
| NY Behandlingsavtal - PRP hud och hår Microneedling-hud PRF.docx | `PRP, PRF och Microneedling/` | nej — avtal | PRP/PRF/microneedling | 2026-02-10 | docx |
| NY Tjänstespecifikation - PRF-hudbehandling.docx | `PRP, PRF och Microneedling/Tjänstespecifikationer PRP, PRF och Microneedling/` | nej — tjänstespec | PRF hud | 2026-03-10 | docx |
| NY Tjänstespecifikation - PRP-hårbehandling.docx | `…/Tjänstespecifikationer PRP, PRF och Microneedling/` | nej — tjänstespec | PRP hår | 2026-03-10 | docx |
| NY Tjänstespecifikation - PRP-hudbehandling och Microneedling.docx | `…/Tjänstespecifikationer PRP, PRF och Microneedling/` | nej — tjänstespec | PRP hud+microneedling | 2026-03-10 | docx |
| NY Tjänstespecifikation - PRP-hudbehandling.docx | `…/Tjänstespecifikationer PRP, PRF och Microneedling/` | nej — tjänstespec | PRP hud | 2026-03-10 | docx |

**`98. Mailmallar/`**
| Filnamn | Sökväg (rel) | Senast ändrad | Format |
|---|---|---|---|
| Konsultation – Bokningsbekräftelse.docx | `98. Mailmallar/` | 2026-02-11 | docx |
| Behandling med förskottsbetalning bokningsbekräftelse.docx | `Behandling bokningsbekräftelse/` | 2026-02-12 | docx |
| Behandling utan förskottsbetalning bokningsbekräftelse.docx | `Behandling bokningsbekräftelse/` | 2026-02-11 | docx |
| Behandlingsplan och offert - HÅRTRANSPLANTATION.docx | `Individuell behandlingsplan och Offert mall/` | 2026-02-12 | docx |
| Behandlingsplan och offert - ÖGONLOCK.docx | `Individuell behandlingsplan och Offert mall/` | 2026-02-12 | docx |
| Behandlingsplan och offert – PRP PRF.docx | `Individuell behandlingsplan och Offert mall/` | 2026-02-12 | docx |

**`99. Fazlis mapp/`** (personlig blandad mapp — äldre arbetskopior)
| Filnamn | Senast ändrad | Format |
|---|---|---|
| DELEGERING.docx | 2025-08-13 | docx |
| Hälsodekleration.docx | 2025-08-13 | docx |
| Läkemedelsordination 2025.docx | 2025-08-28 | docx |
| NY Friskförsäkran.docx | 2026-01-21 | docx |
| NY Friskförsäkran1.docx | 2026-01-21 | docx |
| NY Friskförsäkran2.docx | 2026-01-21 | docx |
| NY Ordination – Lokalbedövning vid hår-.docx | 2026-05-18 | docx |
| Patientinformation & Tjänstespecifikation – Hårtransplantati.docx | 2025-09-02 | docx |
| Samtycke & Friskförsäkran – Sammanhängande dokument.docx | 2025-08-14 | docx |
| Tjänstespecifikation – FUE - hårtransplantation  Hair TP Clinic.docx | 2025-08-19 | docx |

**`99. KLARSPRÅK - Kan denna raderas nu/`**
| Filnamn | Behandling | Senast ändrad | Format |
|---|---|---|---|
| KLARSPRÅK Patientinformation - Microneedling PRP för hud.docx | microneedling+PRP hud | 2025-09-26 | docx |
| KLARSPRÅK Patientinformation - PRP för hår.docx | PRP hår | 2025-12-16 | docx |
| KLARSPRÅK Patientinformation - PRP för hud.docx | PRP hud | 2025-09-26 | docx |
| KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med DHI-tekniken.docx | DHI | 2025-10-09 | docx |
| KLARSPRÅK Patientinformation & Tjänstespecifikation – Hårtransplantation med FUE-tekniken.docx | FUE | 2025-09-29 | docx |
| KLARSPRÅK Patientinformation Ögonlock.docx | ögonlocksplastik | 2026-01-23 | docx |

**`99. Kundresan - mallar, blanketter och broschyrer/`** (äldre 2024–2025-material)
| Filnamn | Sökväg (rel) | Typ | Behandling | Senast ändrad | Format |
|---|---|---|---|---|---|
| Hälsodeklaration - Websidan.docx | `1. Hälsodeklaration 2.0/` | nej — hälsodeklaration | generell | 2025-04-22 | docx |
| Offert - Nuvarande.docx | `2. Offert/` | nej — offert | generell | 2025-02-19 | docx |
| Tjänstespecifikation – PRF-behandling.docx | `2. Tjänstespecifikation/` | nej — tjänstespec | PRF | 2025-08-19 | docx |
| Tjänstespecifikation – PRP-behandling f.docx | `2. Tjänstespecifikation/` | nej — tjänstespec | PRP | 2025-08-19 | docx |
| Tjänstespecifikation - PRF-behandling för hud 2.0.docx | `2. Tjänstespecifikation/` | nej — tjänstespec | PRF hud | 2025-01-20 | docx |
| Tjänstespecifikation - PRP-behandling för hår 2.0.docx | `2. Tjänstespecifikation/` | nej — tjänstespec | PRP hår | 2025-01-20 | docx |
| Tjänstespecifikation - PRP-behandling för huden 2.0.docx | `2. Tjänstespecifikation/` | nej — tjänstespec | PRP hud | 2025-01-20 | docx |
| Tjänstespecifikation - PRP-injektioner kombinerat med Microneedling 2.0.docx | `2. Tjänstespecifikation/` | nej — tjänstespec | PRP+microneedling | 2025-01-20 | docx |
| Tjänstespecifikation TP - DHI-teknik 2.0.docx | `2. Tjänstespecifikation/` | nej — tjänstespec | DHI | 2025-01-30 | docx |
| Tjänstespecifikation TP - FUE-teknik 2.0.docx | `2. Tjänstespecifikation/` | nej — tjänstespec | FUE | 2025-08-19 | docx |
| Avtal - DHI-metoden test Clinic minds.docx | `3. Avtal/` | nej — avtal | DHI | 2025-02-19 | docx |
| Avtal - Hårtransplantation med DHI-metoden 2.0.docx | `3. Avtal/` | nej — avtal | DHI | 2025-02-19 | docx |
| Avtal - Hårtransplantation med FUE-teknik 2.0.docx | `3. Avtal/` | nej — avtal | FUE | 2025-02-19 | docx |
| Avtal - tjänstespecifikation och ansvarsbegränsning (test).docx | `3. Avtal/` | nej — avtal | generell | 2025-02-19 | docx |
| Avtal - TP FUE-metoden Hair TP Clinic.docx | `3. Avtal/` | nej — avtal | FUE | 2024-12-02 | docx |
| Avtal för Hårtransplantation med FUE-metoden.docx | `3. Avtal/` | nej — avtal | FUE | 2024-11-20 | docx |
| Behandlingsavtal - DHI Nuvarande.docx | `3. Avtal/` | nej — avtal | DHI | 2025-02-19 | docx |
| Behandlingsavtal - FUE Nuvarande.docx | `3. Avtal/` | nej — avtal | FUE | 2025-02-19 | docx |
| Bokningsvillkor - HTPC.docx | `3. Avtal/` | nej — bokningsvillkor | generell | 2025-02-19 | docx |
| Bokningsvillkor.docx | `3. Avtal/` | nej — bokningsvillkor | generell | 2025-02-19 | docx |
| Läkemedelsordination 2.0.docx | `4. Ordinationsmall/` | nej — ordination | TP | 2025-04-29 | docx |
| Presentation.pptx | `4. Ordinationsmall/` | nej — presentation | generell | 2024-12-16 | pptx |
| Friskförsäkran 2025.docx | `5. Friskförsäkran/` | nej — friskförsäkran | TP | 2025-04-22 | docx |
| Journalföring - PRP.docx | `6. Journalföring/` | nej — journal | PRP | 2025-04-22 | docx |
| Journalföring - TP.docx | `6. Journalföring/` | nej — journal | TP | 2025-04-22 | docx |
| 1. Beskrivning av FUE-metoden och grafts.docx | `Dokument för kundresan - ska flyttas/` | nej — patientinfo | FUE | 2024-10-16 | docx |
| 2. Risker och biverkningar.docx | `Dokument för kundresan - ska flyttas/` | nej — risk/biverkningar | FUE | 2024-10-16 | docx |
| 3. Förberedelser vid hårtransplantation.docx | `Dokument för kundresan - ska flyttas/` | förberedelse | FUE | 2024-10-18 | docx |
| 4. Eftersguide vid hårtransplantation.docx | `Dokument för kundresan - ska flyttas/` | eftervård | FUE | 2024-10-16 | docx |
| 4. Test Eftervård.docx | `Dokument för kundresan - ska flyttas/` | eftervård (test) | FUE | 2024-12-13 | docx |

---

## 3. Luckor (GAPS)

**A. Inom `1. Kunddokument - KVALITETSSÄKRA/` saknas:**

1. **All eftervård/förberedelse för Curatiio utom ögonlocksplastik** — botox, fillers, profhilo, ortopediska injektioner (PRP/PRF/hyaluronsyra), PRP hud, microneedling, PRF hud. Curatiio har **bara** hälsodeklaration + tjänstespecifikation (2026), **ingen** förberedelse- eller eftervårdsguide — **utom ögonlocksplastik**, vars för-/eftervårdsdokument är `Nuvarande - Information vid ögonlocksplastik (Dermatochalasis).pdf` (rad 111, tidigare felklassad som "nej — patientinfo"; Fazli bekräftade 2026-08-30).
2. **All förberedelse utöver hårtransplantation** — inget "förberedelse"-underlag för PRP/PRF/microneedling/ortopedi/injektioner.
3. **Ingen ren, aktuell patient-PDF för förberedelse/eftervård** — det som finns är äldre docx/pptx (2024–2025) för enbart hårtransplantation, samt PDF:en `2. TP Risker och biverkningar` (risk, inte eftervård).
4. **Inget i `0. NY Tjänstespecifikationer PDF`** är förberedelse/eftervård — det är tjänstespecifikationer (metod/risk/ansvar).

**B. Eftervårdsinnehåll som ligger UTANFÖR scopet (strukturellt gap — utspritt):**

| Filnamn | Verklig plats | Anmärkning |
|---|---|---|
| Eftervård HTP.docx.pdf | `sites/Ekonomi/Kvitton  Fakturor/` **och** `sites/Ekonomi/Delade dokument/General/Redovisningsunderlag/1. Kvitton/` | **Misfilad i Ekonomi** (kvitton!). Samma fil på två ställen. |
| Postoperativ vårdinstruktion för patienter efter hårtransplantation.docx | `sites/Ledning/Verksamhetsutveckling/Kvalitetsdokument och manualer/` | eftervård TP |
| Eftervårdsguide för hårtransplantation.docx | `sites/Ledning/Verksamhetsutveckling/Kvalitetsdokument och manualer/` | eftervård TP |
| Perioperativ vårdplan (mall) för hårtransplantation.docx | `sites/Ledning/Verksamhetsutveckling/Kvalitetsdokument och manualer/` | perioperativ mall |
| Eftervård vid Hårtransplantation - HTPC.pptx | `sites/Ledning/Verksamhetsutveckling/Styrdokument och Företagspresentationer/` | eftervård TP |
| Kopia av Eftervård HTP.docx | `sites/Ledning/Verksamhetsutveckling/Webbsida/Hårtransplantation - Hair TP Clinic/` | webbtext-version |
| Eftervård - testa ny.docx | `sites/Ledning/Verksamhetsutveckling/Webbsida/Hårtransplantation - Hair TP Clinic/` | webbtext-version |

> **Nyckelinsikt:** det enda kompletta "Eftervård"-dokumentet för hårtransplantation (som PDF) ligger **felplacerat i Ekonomi-mappen** och **saknas i kunddokument-mappen**. Curatiio-eftervård finns **ingenstans**.

---

## 4. Versionsdubbletter (ej vald kanon — Fazli väljer)

**`97. Versioner från advokat/`** (den mapp ORD-142 pekade ut) innehåller 5 advokatversioner som alla har nyare motsvarigheter på andra ställen:

| Advokatversion | Datum | Nyare motsvarighet (finns i scopet) |
|---|---|---|
| 251203_Behandlingsavtal … (DHI-metoden), 2 dagar1.docx | 2026-02-09 | `2. Hair TP Clinic 2026/Behandlingsavtal Hair TP Clinic/Behandlingsavtal - Hårtransplantationer.docx` (2026-02-13) |
| 251203_Behandlingsavtal … (DHI-metoden), 7 dagar1.docx | 2025-12-10 | (samma behandlingsavtal, 7-dagarsvariant) |
| 251203_Behandlingsavtal … (PRP-behandling).docx | 2025-12-10 | `…/Behandlingsavtal - PRP, PRF och microneedling.docx` (2026-02-13) |
| BOKNINGSVILLKOR – HAIR TP CLINIC (2-7 DAGARS BETÄNKETID).docx | 2025-12-11 | `1. Bokningsvillkor/Bokningsvillkor 2026.docx` (2026-02-13) |
| 251030_KLARSPRÅK … DHI-tekniken, med kommentarer.docx | 2026-02-09 | `99. KLARSPRÅK…/KLARSPRÅK Patientinformation & Tjänstespecifikation – …DHI-tekniken.docx` (2025-10-09) + `Tjänstespecifikation 2026 – DHI…docx` |

**Övriga dubblett-kluster (utanför advokat-mappen):**
- **Bokningsvillkor**: 2 kopior i `1. Bokningsvillkor/` + 2 i `99. Kundresan…/3. Avtal/` (`Bokningsvillkor - HTPC.docx` och `Bokningsvillkor.docx` — identisk storlek 82 254 B).
- **FUE/DHI-avtal**: 7 avtalsvarianter i `99. Kundresan…/3. Avtal/` (2.0 / "Nuvarande" / "test" / äldre 2024).
- **PRP tjänstespec**: "2.0"-serien (2024–2025) i `99. Kundresan…/2. Tjänstespecifikation/` vs "NY"-serien (2026) i `2. Hair TP Clinic 2026/PRP, PRF och Microneedling/` vs "Curatiio"-serien (2026) i `2. Curatiio 2026/`.
- **TP tjänstespec KOPIA**: 3 `KOPIA_Patientinformation… – TP – kopia*.docx` i `2. Hair TP Clinic 2026/Hårtransplantation/Tjänstespecifikation TP 2026/` (2026-03-07, av "Måns").
- **Eftervård HTP.docx.pdf**: samma fil på **två** Ekonomi-platser.
- **Friskförsäkran**: `NY Friskförsäkran.docx`, `…1.docx`, `…2.docx` i `99. Fazlis mapp/` + `5. Friskförsäkran TP 2025/2026` i `2. Hair TP Clinic 2026/`.

Ingen av dessa har valts som kanon — det är Fazlis beslut.

---

## 5. Signerade patientdokument (skippade, ej öppnade)

Mappen `99. Kundresan - mallar, blanketter och broschyrer/Kundresan/` innehåller **ifyllda patientexempel** (PDF) vid sidan av mallarna — dessa är **skippade** enligt ORD-142:s "öppna inga patientdokument":

- `1. Direktbokning videokons HD – Fazli Krasniqi.pdf`
- `1. Hälsodeklaration – Fazli Krasniqi.pdf`
- `3. TP Medicinsk Journal – Fazli Krasniqi.pdf`
- `4. Journal PRP – Fazli Krasniqi.pdf`
- `4. Journal TP - Fazli Krasniqi 1733829341-0767.pdf`
- `5. Journal Efterbehandling – Fazli Krasniqi.pdf`
- `3. FUE Avtal.pdf` *(innehåller en ifylld persons identitet — ej återgiven)*
- `4. Friskförsäkran Hårtransplantation.pdf` *(ifylld)*

Resterande filer i `Kundresan/` är **mallar** (ej patientdata): `0. GDPR & Integritetspolicy - Informerat samtycke.docx`, `2. Förberedelser & Eftervård.docx`, `2. Offert - kundmall.pdf`, `2. Tjänstespecifikation.docx`, `3. Faktura - Förskottsbetalning 5 dagar.docx`, `3. Faktura - Totalkostnad 5 dagar.docx`.

Ingen personnummer har återgivits i denna förteckning.

---

## 6. Bekräftelse — inget ändrat

- **Inget flyttat, döpt om eller uppladdat.** Endast `listDriveItems`/`searchSharePoint` (läs) har använts.
- **GetAccept** har inte rörts.
- **Inga signerade patientdokument** har öppnats.
- **Inga personnummer** har kopierats in.

*Kartläggningen ovan beskriver webbplatsens tillstånd per 2026-08-29.*
