# Aisia MVP — Pilot-runbook för klinikpersonal

**Status:** FAS 1 godkänd som MVP-pilot  
**Gäller:** Hair TP Clinic — Aisia DS-3 + CCO  
**Ej i scope:** FAS 2 (exportfolder/API), FAS 3 (kamera/USB/SDK), FAS 4 (egen klinisk AI)

**Relaterat:** [`AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md`](./AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md) · [`AISIA-CAPTURE-PROTOCOL.md`](./AISIA-CAPTURE-PROTOCOL.md)

---

## Syfte

Denna runbook beskriver hur personal **manuellt** flyttar Aisia-resultat in i CCO efter att analysen körts i **Aisia DS-3-programmet på plats**. CCO strukturerar, lagrar, visar och låter behandlare verifiera — CCO ersätter **inte** Aisia och tar **inte** bilder direkt i denna fas.

---

## Förutsättningar

| Krav                                              | Kontroll                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Patient finns i CCO (Cliento-import)              | Sök patient i CCO                                                             |
| Aisia DS-3 körs lokalt på kliniken                | Kamera/program enligt befintlig rutin                                         |
| Inloggad CCO-roll med rätt behörighet             | `scalp.read` alla relevanta; `scalp.write` + `scalp.verify` för import/verify |
| Ingen patientdata i GitHub/e-post till utveckling | Endast import via CCO UI                                                      |

**Teknisk verify (IT/owner):** `npm run verify:aisia-cco-integration`

---

## PILOT-READY-checklista (10 steg)

### 1. Starta en Aisia-session (på plats i DS-3)

**Var:** Aisia DS-3 på klinikdatorn — **inte** i CCO.

1. Starta Aisia DS-3 enligt klinikens befintliga rutin (kamera ansluten, kalibrerad).
2. Välj/identifiera patient i Aisia enligt **Aisia-programmets** patienthantering.
3. Välj sessionstyp som matchar besöket:
   - **Baseline / konsultation** → används som baseline i CCO (`consultation`)
   - **Uppföljning** → `follow_up` (t.ex. dag 14, månad 1/3/6/12)
   - **Pre-op / post-op** → endast om det ingår i behandlingsflödet
4. Följ capture-protokollet (10×–200×, tri-spektral där relevant):
   - Globalbilder (front/vänster/höger/bak)
   - Donor (occipital, vänster, höger)
   - Recipient/problemområde + mikrobilder
   - Se full lista: [`AISIA-CAPTURE-PROTOCOL.md`](./AISIA-CAPTURE-PROTOCOL.md)
5. Slutför analysen i Aisia tills rapport/mätvärden finns i DS-3.

> **CCO gör inget här.** Aisia är källan för bildtagning och primär analys.

---

### 2. Exportera rapport/PDF från Aisia

**Var:** Aisia DS-3.

1. När sessionen är klar, använd Aisia DS-3:s **export/rapport/PDF-funktion** (enligt manual och klinik-SOP).
2. Spara PDF lokalt på en plats personal kan nå vid import (t.ex. klinikens exportmapp eller nedladdningar).
3. **Kontrollera filen:** öppna PDF — den ska vara läsbar och tillhöra rätt patient/besök.
4. **Lämna originalfilen orörd** — CCO lagrar en kopia oförändrad i secure storage; redigera inte PDF före import.

> **Ej tillåtet i pilot:** automatisk export via `aisiausa.umersoft.com:8864` eller exportfolder-watcher (FAS 2).

---

### 3. Importera PDF i CCO

**Var:** CCO → patientkort → flik **Hår-/scalpanalys** (mobil: **Scalpanalys**).

1. Öppna rätt **patientkort** i CCO.
2. Gå till fliken **Hår-/scalpanalys**.
3. Klicka **Skapa session** (om ingen passande session finns) — välj typ som matchar Aisia-besöket (konsultation/uppföljning).
4. På session-kortet: **Importera PDF**.
5. Välj Aisia-PDF från steg 2.
6. Vänta tills importen lyckats (session status → `imported`).
7. Bekräfta att PDF lagrats i CCO (asset-kategori `aisia_report`) — **ingen Drive-länk** ska visas som slutdestination.

**Vad händer i bakgrunden:** fil → CCO secure storage (SHA-256) → patient asset → timeline-event `scalp_analysis_imported`.

---

### 4. Importera bilder i CCO

**Var:** samma flik, samma session (eller ny session vid uppföljning).

1. På samma session: **Importera bilder**.
2. Välj export/bilder från Aisia-sessionen (PNG/JPEG enligt export från DS-3).
3. Importera i omgångar per zon om det underlättar (donor vänster/höger, problemområde, etc.).
4. Kontrollera protokollvarningar på session-kortet (t.ex. _Saknas donor höger_).

**Kategorier (automatiska):**

| Sessionstyp          | Bildkategori i CCO |
| -------------------- | ------------------ |
| `consultation`       | `photo_before`     |
| `follow_up`          | `photo_after`      |
| `pre_op` / `post_op` | `photo_during`     |

**Timeline:** `scalp_image_added` per import.

---

### 5. Lägg in mätvärden

**Var:** flik Hår-/scalpanalys → klicka på session → **Vald session — mätvärden**.

1. Välj sessionen i listan.
2. Under _Lägg till mätvärde (manuellt)_:
   - **metricType:** t.ex. `total_hair_count`, `donor_density`, `grease_level` (engelska nycklar från Aisia)
   - **Värde:** siffra/text från Aisia-rapporten
3. Klicka **Spara mätvärde**.
4. Upprepa för övriga relevanta mätvärden från Aisia-rapporten.

**Visning:** etiketter översätts till svenska i CCO (t.ex. _Hårantal_, _Donortäthet_).

**Timeline:** `scalp_metrics_added`.

> **Pilot:** ingen automatisk OCR/extraktion från PDF — mätvärden matas in manuellt om de inte redan följer med via annat flöde.

---

### 6. Behandlare verifierar

**Var:** samma session-kort → **Verifiera**.

1. Behandlare (konsult/operator/owner) granskar:
   - importerad PDF
   - bilder
   - manuellt inlagda mätvärden
   - protokollstatus (saknade zoner)
2. Klicka **Verifiera**.
3. Ange valfri **verifieringskommentar** i dialogen.
4. Session status → **verified**.

**Timeline:** `scalp_analysis_verified`.

**Viktigt:** ingen diagnos eller behandlingsbeslut sker automatiskt — verifiering betyder att **behandlare tagit ställning** till att materialet är korrekt och användbart i konsultation.

---

### 7. Använd patientvyn

**Var:** längst ned på fliken Hår-/scalpanalys → **Patientvy (förenklad svenska)**.

**Syfte:** enkel svenska sammanfattning för att visa/discutera med patient — **inte** full klinisk rapport.

1. Visas endast för **verifierade** sessioner.
2. Läs disclaimer: _Resultatet används som stöd i konsultationen. Slutlig bedömning görs av klinikens personal._
3. Använd som stöd i samtal — **ersätter inte** behandlarens muntliga bedömning.
4. **Original-PDF** (Aisia-rapport) finns kvar oförändrad i CCO — visa vid behov via fil/journalflöde, inte som ersatt juridisk/klinisk primary source utan behandlares tolkning.

**Personalvy vs patientvy:**

| Vy                                  | Innehåll                                     |
| ----------------------------------- | -------------------------------------------- |
| Personal (session + metrics-tabell) | Full metric-lista, protokoll, import, verify |
| Patientvy                           | Förenklad svenska + disclaimer               |

---

### 8. Tidslinje-events

**Var:** patientkort → flik **Tidslinje** (eller journal-timeline enligt CCO-layout).

Efter korrekt flöde ska följande event-typer synas (kronologiskt):

| Event                      | Betydelse                       |
| -------------------------- | ------------------------------- |
| `scalp_analysis_imported`  | Session skapad / PDF kopplad    |
| `scalp_image_added`        | Scalp-bild importerad           |
| `scalp_metrics_added`      | Mätvärden tillagda              |
| `scalp_analysis_verified`  | Behandlare verifierat           |
| `scalp_comparison_created` | Baseline vs uppföljning jämförd |

**Om event saknas:** gå tillbaka till steg 3–6 — importera/verifiera innan du förlitar dig på tidslinjen i pre-op-beslut.

---

### 9. Pre-op readiness — baseline och scalp-status

**Var:** patientkort → **Profil** eller **Journal** → kortet _Aisia / hårscalpanalys_.

CCO visar **status/gates** — inte automatisk go/no-go för operation:

| Indikator                         | Betydelse                                                     |
| --------------------------------- | ------------------------------------------------------------- |
| Baseline hår-/scalpanalys ✓       | Verifierad `consultation`-session finns                       |
| Donor vänster / höger ✓           | Bilder importerade för respektive zon                         |
| Analys verifierad av behandlare ✓ | Session `verified`                                            |
| Gate-rader (röd/varning)          | t.ex. _Pre-op: baseline imaging saknas_, _Saknas donor höger_ |

**Åtgärd vid röd status:**

1. Klicka **Öppna Hår-/scalpanalys →**
2. Importera saknade bilder / slutför verify
3. Uppdatera sidan eller byt flik — callout laddas om via `protocol-status`

**Beslut om operation** fattas alltid av behandlare enligt klinikens medicinska rutin — CCO visar endast om **underlaget** är komplett enligt capture-protokoll.

---

### 10. Vad personalen INTE får göra (pilot)

| Förbjudet / ej tillgängligt                                 | Varför                                                |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| **Automatisk diagnos** utifrån CCO/Aisia-data               | CCO ger stöd, inte diagnos                            |
| **Extern AI** på patientbilder eller journal                | Compliance — inga AI-anrop på PHI                     |
| **Direkt kamera/USB/SDK-import till CCO**                   | FAS 3 — använd Aisia DS-3 lokalt                      |
| **Automatisk export från Aisia-server/API**                 | FAS 2 — ej aktiverad                                  |
| **Ersätta Aisia-programmet** med CCO                        | CCO importerar resultat, tar inte bilder              |
| **Patientbilder/PDF i GitHub, Slack, e-post till dev**      | Patientdata får inte läcka ur CCO                     |
| **Drive-länk som slutlösning**                              | Filer ska ligga i CCO secure storage                  |
| **Lita på metric-jämförelse som behandlingsrekommendation** | Delta är information — behandlare avgör               |
| **Visa patientvy utan disclaimer/behandlare**               | Patientvy kräver verifierad session + klinisk kontext |

---

## Uppföljning (baseline-jämförelse)

När både **verifierad baseline** (`consultation`) och **uppföljning** (`follow_up`) finns:

1. Öppna flik Hår-/scalpanalys.
2. Sektion _Uppföljning — jämför mot baseline_ → **Skapa baseline-jämförelse**.
3. Granska metric-delta (t.ex. hårantal ±).
4. Dokumentera klinisk slutsats i journal — **inte** i automatisk rekommendationsmotor.

**Timeline:** `scalp_comparison_created`.

**P1-begränsning:** bildjämförelse side-by-side i UI är inte komplett — metric-jämförelse räcker i pilot.

---

## Roller (RBAC)

| Roll     | Läsa scalp | Importera | Verifiera |
| -------- | ---------- | --------- | --------- |
| owner    | ✓          | ✓         | ✓         |
| operator | ✓          | ✓         | ✓         |
| konsult  | ✓          | ✓         | ✓         |
| personal | ✓          | ✗         | ✗         |
| revisor  | ✗          | ✗         | ✗         |

---

## Felsökning (pilot)

| Problem                           | Åtgärd                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| Fliken syns inte                  | Ladda om patientkort; kontrollera att du är på Hair TP-patient |
| Import misslyckas                 | Kontrollera filformat (PDF / image/\*); fil < 50 MB            |
| Verify-knapp saknas               | Session redan verified, eller roll saknar `scalp.verify`       |
| Baseline visar ✓ men donor saknas | Importera fler zoner; läs protokollvarningar på session        |
| Ingen patientvy                   | Session måste vara **verified**                                |
| Tidslinje tom                     | Kontrollera att samma patientId används; genomför steg 3–6     |

**Eskalering till IT/owner:** bifoga patientId (inte personnummer i extern kanal), session-datum, skärmdump av fel — **inte** rå PDF/bild.

---

## Snabbreferens — flöde

```
Aisia DS-3 (klinik)          CCO (patientkort)
──────────────────          ─────────────────
1. Ta bilder/analys    →    3. Importera PDF
2. Exportera PDF/bild  →    4. Importera bilder
                            5. Mata in mätvärden
                            6. Behandlare verifierar
                            7. Patientvy / tidslinje
                            9. Pre-op callout
```

---

## Godkännande

| Beslut                           | Datum                             |
| -------------------------------- | --------------------------------- |
| FAS 1 MVP pilot GO               | 2026-05-30                        |
| Integration verification godkänd | 2026-05-30                        |
| FAS 2/3/4                        | **Pausad** — kräver nytt owner-GO |

---

_Skapad: 2026-05-30 · Källa: AISIA-CAPTURE-PROTOCOL, AISIA-CCO-INTEGRATION-VERIFICATION, DS-3 manual (feature matrix)_
