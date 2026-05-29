# Drive Service Account Setup

*Skapad: 2026-05-30 · Owner-actions för att aktivera full Drive-integration (Fas 2)*

## Syfte

Konfigurera en Google Cloud service-account med `roles/drive.readonly` på Hair TP Clinic + Curatiio Drives. Detta låser upp:

- `scripts/migration/scanGoogleDriveApi.js` (full file-crawl)
- `src/lib/googleDriveClient.js` (server-side photo-listing per kund)
- AI Fas 3-features (Smart Search, Foto-klassificerare, Tidslinje)

Quick wins (deeplink + badge + historikvy) fungerar **utan** detta — bara den fulla auto-importen kräver det.

## Steg-för-steg (estimat: 20-30 min)

### Steg 1 — Skapa GCP-projekt (om saknas)

Gå till [console.cloud.google.com](https://console.cloud.google.com) och kontrollera om "Hair TP Clinic" eller "Curatiio" har ett befintligt projekt. Annars:

1. Klicka projekt-dropdown (toppen)
2. "Nytt projekt"
3. Namn: `hair-tp-clinic-cco` (eller liknande)
4. Organisation: din Google Workspace-org om applicabelt
5. Skapa

### Steg 2 — Aktivera Google Drive API

I projektet du valde:

1. Sök "Google Drive API" i sökrutan
2. Klicka "Aktivera"
3. Vänta ~30 sek tills den är på

### Steg 3 — Skapa Service Account

1. Gå till **IAM & Admin → Service Accounts**
2. Klicka "+ Create Service Account"
3. **Name:** `cco-drive-reader`
4. **ID:** `cco-drive-reader` (auto-genereras)
5. **Description:** "Read-only access till Kunder HTP + Curatiio för CCO-integration. Skapad 2026-05-30."
6. Klicka "Create and Continue"
7. **Roles:** lämna tomt (vi sätter roles på Drive-nivå, inte projekt-nivå)
8. Klicka "Continue" → "Done"

### Steg 4 — Generera JSON-key

1. Klicka på den nya `cco-drive-reader`-service-accounten
2. Tabb "**Keys**"
3. "**Add Key → Create new key**"
4. Type: **JSON**
5. Klicka "Create" — en `.json`-fil laddas ner

**SÄKERHET:**
- Filen heter typiskt `hair-tp-clinic-cco-abc123.json`
- Den får INTE läggas i GitHub
- Spara den i `~/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/secrets/cco-drive-reader.json`
- Skapa `secrets/`-mappen i Migration-data om den saknas

### Steg 5 — Hitta service-accountens e-mail

Den ser ut som: `cco-drive-reader@<projekt-id>.iam.gserviceaccount.com`

Kopiera den — du behöver den i nästa steg.

### Steg 6 — Ge SA read-access på Drives

För **VARJE** av dessa två Shared Drives separat:

#### A) Kunder HTP

1. Öppna [drive.google.com](https://drive.google.com)
2. Klicka "Delade enheter" i sidopanelen
3. Högerklicka på **Kunder HTP** → "Hantera medlemmar"
4. I dialogrutan: klistra in service-account-emailen
5. Sätt access-level: **"Tittare"** (Viewer — read-only)
6. **Avmarkera** "Meddela personer" (det är en SA, ingen ska få mejl)
7. Klicka "Skicka" / "Klar"

#### B) Kunder Curatiio

Upprepa samma flöde för "Kunder Curatiio" Drive.

**OBS:** Använd ALDRIG "Redigerare" eller "Hanterare" — vi vill aldrig att SA ska kunna ändra eller radera. Strikt read-only.

### Steg 7 — Konfigurera env-vars lokalt

Lägg till i din `.env` (eller där du sätter env-vars):

```bash
# Drive integration (lagt till 2026-05-30)
ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON="/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/secrets/cco-drive-reader.json"
ARCANA_GOOGLE_DRIVE_FOLDER_ID="0APPck7epTcZ-Uk9PVA"

# Per-brand-overrides
ARCANA_GOOGLE_DRIVE_FOLDER_ID_HAIR_TP="0APPck7epTcZ-Uk9PVA"
ARCANA_GOOGLE_DRIVE_FOLDER_ID_CURATIIO="<hämtas från drive.google.com via klick på Kunder Curatiio → URL>"
```

För Curatiio-folder-ID: öppna "Kunder Curatiio" i Drive, kolla URL → `/drive/u/0/folders/<ID-HÄR>`.

### Steg 8 — Verifiera auth

I terminal:

```bash
cd /Users/fazlikrasniqi/Library/Mobile\ Documents/com~apple~CloudDocs/Major\ Arcana\ 2.0/major-arcana-pr96
node scripts/migration/preflightDriveApi.js
```

Förväntad output:

```
✅ Service account authenticated as cco-drive-reader@...
✅ Drive folder 0APPck7epTcZ-Uk9PVA accessible
   Total mappar på toppen: 6
   - SSK Arbetsrutiner
   - Bilder | Blandade...
   - Offertmallar
   - Pipedrive (Hair TP...)
   - PRP
   - TP
```

Om du ser fel: verifiera att SA-emailen är medlem i Drive (Steg 6) och att Drive API är aktiverat (Steg 2).

### Steg 9 — Säg till mig att det är klart

När preflight ger ✅ kan jag köra:

```bash
node scripts/migration/scanGoogleDriveApi.js \
  --output ~/Library/Mobile\ Documents/com~apple~CloudDocs/Major\ Arcana\ 2.0/Migration-data/drive-inventory-htp.json
```

Det är full-crawl: alla 8 års mappar, alla filer, alla metadata. Estimat ~15-30 min för hela Kunder HTP. Sedan AI Fas 3 kan börja.

## Compliance

- ✅ SA är **read-only** (Tittare i Drive, inga IAM-roller)
- ✅ JSON-key i `Migration-data/secrets/` (iCloud, utanför GitHub)
- ✅ Lägg `Migration-data/secrets/` i `.gitignore` (görs när first secret committas)
- ✅ Audit-trail: alla SA-anrop loggas i `Migration-data/drive-audit-log/` (skapas av scan-scriptet)
- ⚠️ SA-emailen kommer synas i Drive-aktivitetslog — det är OK, det är vår SA, inte en patient

## Säkerhets-checklista innan du börjar

- [ ] Du har Owner-role i Google Cloud projektet
- [ ] Du är Manager (eller högre) på `Kunder HTP` Shared Drive
- [ ] Du är Manager (eller högre) på `Kunder Curatiio` Shared Drive
- [ ] Du har access till `Migration-data/`-iCloud-mappen
- [ ] Du har 30 min att inte bli avbruten (key-skapande kräver flera steg)

## Frågor som dyker upp

**Q: Kan SA få access till EN specifik undermapp, inte hela Drive?**
A: Tekniskt ja, men då måste du dela varje undermapp separat. För Kunder HTP med 8 års data är det opraktiskt. Drive-API:n kan fortfarande respektera path-filter i scriptet om du vill begränsa scope.

**Q: Vad händer om jag roterar JSON-key:n?**
A: Generera ny key (Steg 4), uppdatera env-var (Steg 7), gamla key blir orphaned. Inget i CCO går sönder så länge nya key fungerar. Bra-praxis att rotera årligen.

**Q: Kan jag radera SA:n om vi byter strategi?**
A: Ja, IAM → Service Accounts → Delete. Drive-medlemskap rensas automatiskt.

**Q: Hur ser jag vilka anrop SA gör?**
A: Drive Activity log (drive.google.com → klicka på i:et högst upp) OCH Google Cloud Audit logs (om aktiverade).

---

*När du klarar Steg 8 (preflight ✅), säg "drive auth klar" så kör jag Steg 9 + AI Fas 3.*
