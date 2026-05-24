# PDL / MDR Bedömning — Arcana Executive OS

Version: 1.0
Datum: 2026-05-14
Status: UTKAST — ska granskas av juridisk rådgivare med hälso- och sjukvårdskompetens.

---

## Syfte

Bedömer Arcanas förhållande till Patientdatalagen (PDL, 2008:355) och EU Medical Device Regulation (MDR, 2017/745). Identifierar risker, gränsdragningar och åtgärder.

---

## 1. Patientdatalagen (PDL) — Bedömning

### 1.1 Omfattning

PDL gäller för vårdgivare som för patientjournal. Arcana är **inte** ett journalsystem, men hanterar data som kan vara patientrelaterad.

### 1.2 Arcanas roll

| Funktion                         | PDL-relevant?       | Bedömning                                                                                                                           |
| -------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Template Engine (mallar)         | ⚠️ Indirekt         | Mallar kan innehålla patientinformation (namn, behandling). Inte journal i PDL-mening, men personuppgiftsbehandling.                |
| Patientchatt                     | ⚠️ Ja, om hälsodata | Hälsodeklaration i bokningsflöde = känsliga personuppgifter (Art. 9 GDPR). Inte journalföring om data inte förs in i journal.       |
| CCO mail-hantering               | ⚠️ Indirekt         | Mail kan innehålla hälsorelaterad information. Arcana lagrar, men journalför inte.                                                  |
| CCO journalbilder (konsultation) | ⚠️ Ja               | Fotografier från konsultation lagras i `/var/data/arcana/journal-photos` som behandlingsunderlag — personuppgifter, ofta hälsodata. |
| Risk-evaluation                  | ❌ Nej              | Bedömer mallinnehåll, inte patienthälsa.                                                                                            |
| AI-genererade utkast             | ⚠️ Indirekt         | Utkast kan nämna behandlingar. AI ger aldrig medicinsk rådgivning (policy floor).                                                   |

### 1.3 Gränsdragning: Arcana vs Journalsystem

| Kriterium      | Journalsystem (PDL)             | Arcana                              |
| -------------- | ------------------------------- | ----------------------------------- |
| Syfte          | Dokumentera vård                | Kommunikation + administration      |
| Innehåll       | Diagnos, behandling, åtgärd     | Mallar, bokningsinfo, mail          |
| Åtkomst        | Behörighetsstyrning per patient | Tenant-/roll-baserad                |
| Lagringskrav   | 10 år (PDL 3 kap. 17§)          | Retention policy (variabel per typ) |
| Spärr/loggning | Ja (PDL 4 kap.)                 | Audit-logg (ej PDL-specifik)        |

### 1.4 Risk: Glidning mot PDL-omfattning

Arcana riskerar att glida in i PDL-sfären om:

- Patientchatten lagrar hälsodeklarationer som kliniken använder som beslutsunderlag
- Mail-historik innehåller medicinsk korrespondens som utgör del av vårdrelation
- AI-utkast tolkas som medicinsk rådgivning

### 1.5 Åtgärder för PDL-säkerhet

| #   | Åtgärd                                                                                                                                                                                                            | Prioritet | Status                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ |
| 1   | **Tydlig gränsdragning i DPA:** Arcana är kommunikationsverktyg, inte journalsystem                                                                                                                               | Hög       | ✅ DPA-mall finns                                      |
| 2   | **Policy floor förbjuder diagnoser:** `evaluatePolicyFloorText` blockerar diagnosspråk                                                                                                                            | Hög       | ✅ Implementerat                                       |
| 3   | **Hälsodeklarationsdata separeras:** om bokningsflöde lagrar hälsodata ska den krypteras och tidsbegränsas                                                                                                        | Hög       | ⚠️ Retention finns, kryptering vid vila via Render     |
| 4   | **Åtkomstsloggning:** all access till patientrelaterad data loggas i audit                                                                                                                                        | Hög       | ✅ Audit per request                                   |
| 5   | **Informera kliniken:** DPA ska tydligt ange att kliniken ansvarar för journalföring i eget system                                                                                                                | Hög       | ✅ DPA §2                                              |
| 6   | **Ingen automatisk journalföring:** Arcana ska aldrig automatiskt skapa journalpost i externt journalsystem                                                                                                       | Kritisk   | ✅ Inget externt journal-API                           |
| 7   | **Journalbilder — registerföring (Art. 30):** dokumentera lagring av konsultationsfoton, syfte, lagringstid, åtkomst (STAFF/OWNER), backup (`npm run backup:journal-photos`) och radering vid avslutad behandling | Hög       | ⚠️ Teknik klar, registerpost ska signeras              |
| 8   | **Patientchatt-disclaimer:** varje chatt-session ska visa att detta inte är medicinsk rådgivning                                                                                                                  | Hög       | ⚠️ Policy floor finns, explicit disclaimer i UI behövs |

---

## 2. Medical Device Regulation (MDR) — Bedömning

### 2.1 Är Arcana en medicinteknisk produkt?

MDR (2017/745) Artikel 2(1) definierar en medicinteknisk produkt som:

> "...avsett av tillverkaren att användas [...] för att: (a) diagnostisera, förebygga, övervaka, förutsäga, prognostisera, behandla eller lindra sjukdom..."

### 2.2 MDR-klassificeringsbedömning

| Fråga                                                      | Svar                                                                          | Konsekvens       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| Ger Arcana medicinsk diagnos?                              | **Nej** — policy floor förbjuder explicit                                     | Inte MDR-klassad |
| Ger Arcana behandlingsrekommendationer?                    | **Nej** — AI genererar utkast, OWNER godkänner, policy floor blockerar        | Inte MDR-klassad |
| Används AI-output som beslutsunderlag för kliniska beslut? | **Nej** — Arcana är administrativt stöd, inte clinical decision support (CDS) | Inte MDR-klassad |
| Hanterar Arcana patientdata för diagnostik?                | **Nej** — hanterar kommunikation och mallar                                   | Inte MDR-klassad |
| Förutsäger Arcana sjukdomsförlopp?                         | **Nej**                                                                       | Inte MDR-klassad |

### 2.3 Gränsdragning: MDR vs Administrativt verktyg

**Arcana är ett administrativt verktyg** med AI-stöd för kommunikation — inte ett kliniskt beslutsstöd (CDS). Så länge följande villkor upprätthålls faller Arcana **utanför** MDR:s tillämpningsområde:

1. **AI genererar aldrig kliniska rekommendationer** — alla utkast är administrativa
2. **Policy floor blockerar:** diagnoser, behandlingsrekommendationer, prognoser
3. **OWNER godkänner allt** — AI publicerar aldrig själv
4. **Risk-evaluation bedömer mallkvalitet** — inte patienthälsa
5. **Patientchatten ger information** — inte medicinsk rådgivning

### 2.4 Risk: Glidning mot MDR-klassificering

Arcana riskerar att klassificeras som medicinteknisk produkt om:

- AI börjar ge behandlingsspecifika rekommendationer baserat på patientdata
- Risk-evaluation används för klinisk triagering
- Patientchatten ger individuella hälsoråd baserade på hälsodeklaration
- Kliniken marknadsför Arcana som "AI-läkare" eller liknande

### 2.5 MDR-riskklasser (om Arcana vore klassad)

| Klass     | Tillämpning                                    | Arcana-risk                                  |
| --------- | ---------------------------------------------- | -------------------------------------------- |
| Klass I   | Administrativa verktyg                         | Ej tillämplig (utanför MDR)                  |
| Klass IIa | Software as Medical Device (SaMD) med låg risk | Potentiell om CDS-funktioner läggs till      |
| Klass IIb | SaMD med medelhög risk                         | Om AI fattar kliniska beslut                 |
| Klass III | SaMD med hög risk                              | Om AI styr behandling utan mänsklig kontroll |

---

## 3. Kombinerad PDL/MDR Riskmatris

| Risk                                            | Sannolikhet | Konsekvens | Mitigation                                 |
| ----------------------------------------------- | ----------- | ---------- | ------------------------------------------ |
| Hälsodeklaration i chatt tolkas som journalpost | Medel       | Hög        | Tydlig DPA-avgränsning + disclaimer i UI   |
| AI-utkast tolkas som medicinsk rådgivning       | Låg         | Hög        | Policy floor + OWNER-gate + disclaimer     |
| Kliniken marknadsför Arcana som CDS             | Låg         | Mycket hög | Avtalsmässig begränsning i DPA + AUP       |
| Patientchatt ger individuella hälsoråd          | Låg         | Hög        | Kill-switch + human handoff + policy floor |
| Mail-historik blir del av journalföring         | Medel       | Medel      | Arcana lagrar, kliniken journalför separat |
| Regulatorisk granskning (IMY/IVO/LV)            | Låg         | Hög        | Dokumentation + audit trail + DPA          |

---

## 4. Åtgärdsplan

### Fas 1 — Dokumentation (nu)

| #   | Åtgärd                                    | Status                                 |
| --- | ----------------------------------------- | -------------------------------------- |
| 1   | PDL/MDR-gränsdragning i DPA               | ✅ DPA §2 anger administrativt verktyg |
| 2   | Policy floor-blockering av kliniskt språk | ✅ Implementerat                       |
| 3   | Patient safety runbook                    | ✅ Finns                               |
| 4   | Denna bedömning som intern dokumentation  | ✅ Detta dokument                      |

### Fas 2 — Tekniska kontroller (0-30 dagar)

| #   | Åtgärd                                                 | Status                                           |
| --- | ------------------------------------------------------ | ------------------------------------------------ |
| 5   | Explicit disclaimer i patientchatt-UI                  | ⚠️ Behöver UI-implementation                     |
| 6   | Hälsodeklarationsdata: explicit retention + purge      | ⚠️ Retention policy finns, specifik purge behövs |
| 7   | MDR-guard i policy floor: blockera CDS-liknande output | ⚠️ Delvis via existerande policy floor           |

### Fas 3 — Juridisk verifiering (30-90 dagar)

| #   | Åtgärd                                             | Status                          |
| --- | -------------------------------------------------- | ------------------------------- |
| 8   | Juridisk granskning av PDL-avgränsning             | ✅ Signerat externt (2026-05-24) |
| 9   | MDR-klassificeringsbedömning av extern expert      | ❌ Krävs vid expansion till CDS |
| 10  | Kontakt med Läkemedelsverket om SaMD-gränsdragning | ❌ Vid behov                    |

---

## 5. Slutsats

**PDL:** Arcana faller primärt utanför PDL:s tillämpningsområde som ett administrativt kommunikationsverktyg. Risken för glidning existerar och hanteras genom DPA-avgränsning, policy floor, och tydlig rollfördelning (Arcana = biträde, kliniken = ansvarig + journalförare).

**MDR:** Arcana klassificeras **inte** som en medicinteknisk produkt så länge AI-output förblir administrativt (mallar, kommunikation) och inte kliniskt (diagnos, behandling, prognos). Policy floor, OWNER-gate och kill-switch utgör de primära skyddsbarriärerna.

**Rekommendation:** Behåll nuvarande avgränsning. Om kliniska funktioner övervägs i framtiden (t.ex. AI-triagering, CDS-integration), genomför formell MDR-klassificering med extern SaMD-expert innan implementation.

---

## 6. EU/EES datalagring och driftregion (C5)

### 6.1 Produktionsmiljö

| Komponent | Leverantör | Region | Data |
| --------- | ---------- | ------ | ---- |
| Arcana API + state | Render.com | **Frankfurt (eu-central)** | Patient master, journal metadata, migration-index, auth |
| Journalbilder (konsultation) | Render persistent disk | **Frankfurt** | `/var/data/arcana/journal-photos` |
| Transactionell mail | Microsoft Graph / Resend | EU/EES (Graph tenant) | Bokningsbekräftelser |
| Webb (hairtpclinic.com) | Vercel | Edge (ingen journal persist) | Lead-formulär → Arcana API |

**Verifiering:** Render Dashboard → Service → Region = Frankfurt (verifierad 2026-05-24). Backup: `npm run backup:state` + `npm run backup:journal-photos`.

### 6.2 Källor utanför Arcana runtime

| Källa | Plats | Arcana-koppling |
| ----- | ----- | ---------------- |
| Google Drive (journalarkiv) | Google Cloud (EU-policy enligt klinikens Workspace) | Read-only API → `migration-index.json` (referenser, ej full filkopia) |
| SharePoint (mallar) | Microsoft 365 | Ersatt av GitHub source of truth + `docs/migration/sharepoint-manifest.json` |
| Cliento CSV | `MA-Archive/cliento/` | Engångsimport → patient master |

### 6.3 Personuppgiftsbiträde och underleverantörer

- **Render** — hosting (DPA via Render)
- **Microsoft** — Graph mail, M365 (DPA via tenant)
- **Google** — Drive read-only för migration (service account, ingen write-back)
- **Vercel** — statisk webb + `/api/lead` proxy (ingen journaldata persist)

### 6.4 Transfer impact assessment (förenklad)

Webb-leads och bokningar skickas från Vercel (global edge) till Arcana Frankfurt — personuppgifter i transit (TLS 1.2+). Journalhistorik indexeras från Drive utan att ladda ner zip till operatörs dator; filreferenser (`driveFileId`, `webViewLink`) lagras i Arcana.

**Status C5:** Dokumenterad 2026-05-20. Render EU Frankfurt verifierad i Dashboard 2026-05-24. Juridiska underlag (PDL/DPA m.m.) godkända av advokater enligt svensk lag 2026-05-24.

---

## Relaterade dokument

- `docs/legal/gdpr-dpa-template.md` — DPA-mall
- `docs/legal/data-retention-policy.md` — Retention policy
- `docs/ops/runbooks/patient-safety-incident-runbook.md` — Patient safety runbook
- `docs/legal/iso27001-soc2-readiness.md` — ISO/SOC2 readiness
- `src/policy/floor.js` — Policy floor implementation
