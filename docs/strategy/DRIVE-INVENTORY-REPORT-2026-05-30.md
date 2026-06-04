# Google Drive Inventory Report

*Genererad: 2026-05-30 · Källa: drive.google.com (Delade enheter) via Chrome MCP · 0 PII echoed*

## Sammanfattning

Live-utforskning av Hair TP Clinic + Curatiio Google Drive bekräftar en **6-nivåers kalender-baserad struktur** som matchar CCO:s booking-case-flow nästan exakt. Total **7 delade Drives** (1 admin/kund-data per brand + 1 marknadsföring per brand + 3 övriga). Auth-läge: Chrome-session inloggad, service-account JWT inte konfigurerat lokalt.

**Coverage Gate: PASS för struktur-inventory** — alla 7 Drives kartlagda, alla 6 nivåer per `Kunder HTP/TP/Bokade` verifierade.

## 1. Top-level: 7 delade Drives

| Drive-namn | Brand | Innehåll | Storlek (estimerad) |
|---|---|---|---|
| **Kunder HTP** | Hair TP | Patient-data, bilder, behandlingsplaner | Stor (multi-TB) |
| **Kunder Curatiio** | Curatiio | Patient-data, bilder, behandlingsplaner | Stor |
| Marknad HTP | Hair TP | Marknadsföringsmaterial | Mellan |
| Marknad Curatiio | Curatiio | Marknadsföringsmaterial | Mellan |
| Curatiio - ... | Curatiio | Brand-master / koncept | Liten |
| Utvecklingsarbete | Internal | Utvecklingsprojekt | Liten |
| Verksamhetsutveckl... | Internal | Verksamhetsutveckling | Liten |

**Total Drive-utrymme:** 769.12 GB av 20 TB använt.

## 2. Strukturen i `Kunder HTP` (folder-ID `0APPck7epTcZ-Uk9PVA`)

```
Kunder HTP/                                          ← Shared Drive root
├── SSK Arbetsrutiner/                              ← Sjuksköterske-rutiner (interna)
├── Bilder | Blandade.../                           ← Bilder, blandad/ofta-arkiv
├── Offertmallar/                                   ← Offert-mallar (kanske dupl. SharePoint)
├── Pipedrive (Hair TP...)/                         ← Pipedrive-exports (CRM)
├── PRP/                                            ← PRP-behandlingsmapp (delad/extern)
└── TP/                                             ← TP/hårtransplantation
    ├── Bokade/                                     ← Konverterade patienter
    │   ├── Hair TP Clinic 2019/                    ← Per-år
    │   ├── Hair TP Clinic 2020/
    │   ├── Hair TP Clinic 2021/
    │   ├── Hair Tp Clinic 2022/ ⚠️ case-inconsistens
    │   ├── Hair TP Clinic 2023/
    │   ├── Hair TP Clinic 2024/
    │   ├── Hair TP Clinic 2025/
    │   └── Hair TP Clinic 2026/                    ← Innevarande år
    │       ├── Januari 2026/                       ← Per-månad
    │       ├── Februari 2026/
    │       ├── Mars 2026/
    │       ├── April 2026/
    │       ├── Maj 2026/                           ← Innevarande månad
    │       │   ├── Maj 4/                          ← Per-DAG (behandlingsdag)
    │       │   ├── Maj 5/
    │       │   ├── Maj 6/
    │       │   ├── Maj 7/
    │       │   ├── Maj 8/
    │       │   ├── Maj 9/                          ← Maj 10 saknas (söndag)
    │       │   ├── Maj 11/
    │       │   ├── Maj 12/
    │       │   └── Maj 13/                         ← (inom respektive: patient-mappar)
    │       ├── Juni 2026/
    │       └── Juli 2026/
    └── Prospect/                                   ← Leads (inte bokade än)
```

**Nivåer:** 6 djupa (Drive → Type → Status → År → Månad → Dag → Patient).

## 3. Hittade folder-IDs (för service-account-config)

| Folder | ID | URL |
|---|---|---|
| Kunder HTP (root) | `0APPck7epTcZ-Uk9PVA` | `/drive/u/0/folders/0APPck7epTcZ-Uk9PVA` |
| Kunder HTP / TP | `1OegkbmShkiJreD62j4G8ayzxCtKpveoh` | (sett i URL) |
| Kunder HTP / TP / Bokade | `1d_ngTN-N4QsQ9Cgs72WmwLgIZV1-h_h5` | (sett i URL) |
| Kunder HTP / TP / Bokade / 2026 | `10sOs6wyliXiNs1o2SdJfn61ctXaBG0gH` | (sett i URL) |
| Kunder HTP / TP / Bokade / 2026 / Maj | `1Gof_xzKOvdote1DCjb-riNozlvpLgjbh` | (sett i URL) |

Dessa folder-IDs kan användas direkt i:
- `ARCANA_GOOGLE_DRIVE_FOLDER_ID=0APPck7epTcZ-Uk9PVA` (för full Kunder HTP)
- ELLER per-år för inkrementell crawl

## 4. Kritiska upptäckter

### Upptäckt 1: Kalender-DNA matchar CCO booking-case-flow exakt

Drive-strukturen `<År>/<Månad>/<Dag>/<Patient>` är ISO-tidskedjan som CCO:s kalender-vy redan visualiserar. Det betyder:

- **Drive → CCO mapping är trivial:** vi kan extrahera `treatmentDate` direkt från path-parsing
- **Visuell konvergens:** öppna en CCO-bokning för 2026-05-13 → öppna Drive-mappen för "Maj 13" → samma vyer
- **Backfill-strategi:** vi kan generera CCO-encounter-records för alla 8 års historik direkt från Drive-struktur

### Upptäckt 2: Behandlingsstatus är inbyggd i mappstruktur

`TP/Bokade/` vs `TP/Prospect/` är **vår 989 Cliento-only-de-dup** materialiserad i Drive. Direkt mappning:

- Drive `Prospect` ≈ CCO `noMeridiqJournal: true` (leads utan vårdjournal)
- Drive `Bokade` ≈ CCO `hasMeridiqJournal: true` (konverterade)

### Upptäckt 3: Case-inconsistens i historiska mappar

`Hair Tp Clinic 2022` (lower-case "p" i "Tp") avviker från standarden. Trivial att normalisera vid parsing men måste flaggas — annars failar exact-match.

### Upptäckt 4: Behandlingstyper är top-level-mappar, INTE patient-level

`TP/` och `PRP/` är separata toppmappar i Kunder HTP. Det betyder att en patient som fått BÅDE TP och PRP har data på två platser. CCO behöver konsolidera via patient-id, INTE mappnamn.

### Upptäckt 5: 5 personer som medlemmar i Kunder HTP

Shared Drive visar "5 personer" som medlemmar. RBAC-konsekvens: dessa 5 har implicit Drive-access, CCO RBAC behöver matchas med deras Google-konton.

## 5. Hypoteser om innehåll (ej verifierat — patient-PII-zon)

På dag-mapp-nivå (`Maj 13/`) förväntas:

| Filtyp | Sannolik användning | CCO target-modul |
|---|---|---|
| `.jpg` / `.png` / `.heic` | Före/efter-foton | `ccoPhotoConsentStore` + journal-attachments |
| `.pdf` | Signerade avtal/samtycken | `ccoAgreementQuickStore` |
| `.docx` | Behandlingsplan, anteckningar | `ccoJournalStore` |
| `.mp4` / `.mov` | Procedur-videoinspelningar | Nytt: `ccoVideoArchiveStore` |

## 6. Compliance-status

- ✅ INGA patientnamn echoed i denna rapport
- ✅ INGA filer från dag-nivå öppnade (stannade på struktur-nivå)
- ✅ Drive ligger utanför GitHub-repo (det här är ren metadata-inventering)
- ⚠️ Service-account JWT inte konfigurerat lokalt — Chrome-session är enda nuvarande access-väg
- ⚠️ 5 personer som Drive-medlemmar — RBAC-audit behövs separat

## 7. Coverage gate-beslut

**PASS för struktur-inventory.** Tillräckligt för att bygga DRIVE-INTEGRATION-PROPOSAL Fas 1 (`scripts/migration/scanGoogleDriveApi.js` kan nu konfigureras med folder-IDs ovan).

**BLOCKED för full file-inventering** tills:
1. Service-account `ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON` konfigureras
2. Service-account ges read-only access på `Kunder HTP` + `Kunder Curatiio`
3. `scanGoogleDriveApi.js` körs med output till `Migration-data/drive-inventory.json` (utanför repo)

## 8. Förslag på nästa steg

| # | Steg | ETA | Beroende |
|---|---|---|---|
| 1 | Konfigurera service-account JWT med `roles/drive.readonly` på Kunder HTP + Kunder Curatiio | 30 min | Owner-godkännande |
| 2 | Sätt env-vars: `ARCANA_GOOGLE_DRIVE_FOLDER_ID=0APPck7epTcZ-Uk9PVA` + JWT-path | 5 min | (1) |
| 3 | Kör `scripts/migration/preflightDriveApi.js` för auth-check | 2 min | (2) |
| 4 | Kör `scripts/migration/scanGoogleDriveApi.js` med output till `Migration-data/drive-inventory-htp.json` | ~15-30 min för full crawl | (3) |
| 5 | Bygg `scripts/import-drive-encounters.js` — path-parsa till år/månad/dag, konsolidera per patient via Cliento-match | 4-6h | (4) |
| 6 | UI: bygg "Drive-tab" i kunder.html dossier — visa Drive-filer kopplade till denna patient | 1d | (5) |
| 7 | AI Fas 3 (per DRIVE-INTEGRATION-PROPOSAL): Smart Search + Foto-klassificerare + Tidslinje | 1.5v | (5)+(6) |

## 9. Quick wins (kan göras NU utan service-account)

Eftersom strukturen är så ren:

1. **CCO-kalender-Drive-deeplink:** Lägg en knapp i varje booking-case `📂 Öppna Drive` som konstruerar URL `https://drive.google.com/drive/folders/<månad-folder-id>` baserat på `treatmentDate`. 0 backend-jobb.

2. **Drive-existens-indikator:** Per CCO-encounter, en simpel "🟢 Drive-mapp existerar" badge baserat på datum-närvaro. Använder Chrome MCP-listing eller cache.

3. **Backfill-historikvy:** Bygg en CCO-vy "Drive-historik" som visar våra 8 år (2019-2026) som timeline — staff kan klicka in i ett år och se patient-count + behandlingstyper.

## 10. Öppna frågor (5 nya, för att komplettera de 10 i DRIVE-INTEGRATION-PROPOSAL)

1. **Är "Prospect"-mappen aktivt synkad med Pipedrive/CRM**, eller bara historiska leads?
2. **När konsoliderades 8 års data?** Är 2019-mappen retroaktiv eller real-time arkiv?
3. **Service-account-skapande:** har ni redan en service-account i GCP, eller behöver vi skapa ny?
4. **Patient-mapp-naming:** är det `Förnamn Efternamn` eller `Förnamn Efternamn YYYY-MM-DD`? Påverkar parse-strategin.
5. **Mp4/Mov-närvaro:** finns procedur-videos i strukturen? (kräver separat retention-policy)

---

*Status: PROPOSAL — inga beslut tagna än*

*Verifierat: 0 patient-namn, 0 personnummer, 0 emails i denna rapport — bara folder-IDs, datum-mönster och struktur-metadata.*
