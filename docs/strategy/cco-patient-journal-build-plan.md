# CCO Patient, Journal & Migration — Byggplan

Status: **PÅGÅR**  
Senast uppdaterad: 2026-05-23

Syfte: Färdiga kundkort med importerad journal/bilder + ny journalföring för personal i Arcana CCO.

**Master-plan (arkiv, juridik, faser):** [ma-document-placement-plan.md](./ma-document-placement-plan.md)

**Workspace:** `~/Code/major-arcana` (GitHub) + `~/Code/MA-Archive/` (källfiler)

---

## Fas 0 — Förberedelse

- [x] 0.1 Migration-mappstruktur + npm-scripts (`migration:scan`, `migration:import`, `migration:test`)
- [x] 0.2 **Zip-nedlading avbruten** — ersatt med Drive API + lokal mirror (se nedan)
- [ ] 0.3 PDL-bedömning uppdaterad (Arcana = journalsystem)
- [ ] 0.4 Render EU-region verifierad
- [ ] 0.5 Pipedrive People+Deals export (nuvarande zip tom)

### Drive-migration utan zip (rekommenderat)

Zip/Takeout via Chrome + iCloud fungerar inte (~100 GB, `.crdownload`, filer försvinner). Använd i stället:

**Alternativ A — Google Drive API (bäst)**  
Ingen lokal nedladdning. Indexerar personnummer + filreferenser direkt från Drive.

1. Skapa service account i Google Cloud (Drive API readonly).
2. Dela journalmappen i Drive med service account-e-postadressen.
3. Sätt env: `ARCANA_GOOGLE_DRIVE_FOLDER_ID`, `ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON`.
4. Kör: `npm run migration:scan-drive-api` → `npm run migration:import`.

**Alternativ B — Google Drive for Desktop (lokal mirror)**  
Synka journalmappen till en mapp **utanför iCloud**, t.ex. `~/Major-Arcana-Migration/drive-mirror/`.

1. Sätt env: `ARCANA_DRIVE_MIRROR_ROOT=~/Major-Arcana-Migration/drive-mirror`.
2. Kör: `npm run migration:scan-folder` → `npm run migration:import`.

**Alternativ C — Fortsätt utan historik (snabbast till live)**  
6 687 Cliento-kunder finns redan. Personal börjar journalföra i Arcana; historik kopplas senare via A eller B.

## Fas 1 — Datamigration & kundmaster

- [x] 1.1 `scanDriveZips.js` (+ `scanDriveFolder.js`, `scanGoogleDriveApi.js`)
- [x] 1.2 `scripts/migration/runMigrationPipeline.js` — **6 687 Cliento-kunder importerade**
- [x] 1.3 Matchlogik Drive personnummer ↔ Cliento (namn-overlap)
- [x] 1.4 `ccoPatientMasterStore.js`
- [x] 1.5 `ccoMigrationIndexStore.js`
- [x] 1.6 `ccoPatientMaster.js` router
- [x] 1.7 `ccoMigration.js` router
- [x] 1.8 Kör `migration:scan` — **46 977 filer indexerade**

## Fas 2 — Kundkort UI

- [x] 2.1 Kundlista: sök, filter, flaggor (API + preview UI)
- [x] 2.2 Kundkort flikar (Profil | Journal | Filer)
- [x] 2.3 Visuell markering importerad vs ny (chips: Kopplad, Importerad journal, flaggor)

## Fas 3 — Journalmodul

- [x] 3.1 `ccoJournalStore.js` — signering, låsning, rättelse
- [x] 3.2 `ccoJournal.js` router — audit på läsning + skrivning
- [x] 3.3 TP-journal 38 fält (schema i store)
- [x] 3.4 Historisk import — PDF från zip (`migration:import-journals` + per-patient import)
- [x] 3.5 Bildmetadata + filvisning från zip (journal-photos/ för nya foton)
- [x] 3.6 `syncPatient360FromJournalCase` i bridge
- [x] 3.7 `journalReadout` i workspace bootstrap

## Fas 4 — Wire patient-resa

- [x] 4.1 Mount `ccoConsultations`
- [x] 4.2 Mount `ccoAftercare` + `ccoOperations`
- [x] 4.3 Mount `ccoPatientSystemStore`

## Fas 5 — Offerter & avtal

- [x] 5.1 Offertmallar (14 Word) som mallbibliotek
- [x] 5.2 Offertmodul + statusflöde
- [x] 5.3 Avtal/e-sign + betänketid-blocker

## Fas 6 — Bookingmotor

- [ ] 6.1 Behandlingskatalog
- [ ] 6.2 Egen engine (Cliento ut)
- [ ] 6.3 Koppling bokning → behandlingstillfälle → journal

## Fas 7 — Påminnelser

- [ ] 7.1 Kundspecifika triggers via scheduler
- [ ] 7.2 Eftervård, formulär, återbesök

## Fas 8 — CCO-agent stöd

- [ ] 8.1 Daglig rapport, saknade formulär/samtycken
- [ ] 8.2 Journalutkast (human approval)

## Fas 9 — Compliance

- [ ] 9.1 Retention 10 år i config
- [ ] 9.2 GDPR export/spärr endpoints
- [ ] 9.3 Uppdatera Art. 30 + PUB

## Blockers innan personal live

- [ ] Migration-index verifierat (pilot 20 kunder)
- [ ] Journal-MVP deployad
- [ ] Minst en personal utbildad
- [ ] **Mobil foto-flöde (kod klar)** — se [cco-mobile-staff-journal-plan.md](./cco-mobile-staff-journal-plan.md) — **deploy Fas 0 + pilot Fas 5.5 krävs**

## Fas 10 — Mobil journal (personal)

Detaljerad plan: [cco-mobile-staff-journal-plan.md](./cco-mobile-staff-journal-plan.md)

- [x] Fas 1–4 + 6.1/6.3 kod (Ta bild, HEIC, mobil-CSS, PWA, deep link, QR, batch)
- [ ] Fas 0 deploy (HTTPS, prod-auth)
- [ ] Fas 5.5–5.6 pilot med personal
- Instruktion: [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md)
