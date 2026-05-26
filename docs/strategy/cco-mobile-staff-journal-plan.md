# CCO Mobil journal & foto — Byggplan (personal)

Status: **LIVE (prod)** — pilot Fas 5.5–5.6 pågår  
Senast uppdaterad: 2026-05-22  
Relaterad: [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md)

## Mål

Personal ska kunna använda CCO **på telefon som en app**: öppna kund → Journal → **Ta bild** → bilden hamnar **direkt i kundkortet** (behandlingsplan), utan Drive-import eller manuella steg.

## Definition of done (helheten)

- [x] Personal tar foto på iPhone/Android → bilden syns på kundkortet inom 10 sekunder
- [x] Fungerar på HTTPS i produktion/staging (inte bara localhost)
- [x] Minst 2 personal har testat i verklig konsultation utan utvecklarstöd
- [x] Instruktion (1 sida) finns och följs

## Teknisk utgångspunkt (redan byggt)

| Del                  | Status          | Fil / API                                              |
| -------------------- | --------------- | ------------------------------------------------------ |
| Foto-uppladdning     | Finns           | `POST /api/v1/cco-journal/photo`                       |
| Lagring              | Finns           | `journalPhotosDir` + `ccoJournalPhotoStore`            |
| Koppling till kund   | Finns           | `addConsultationPhotoAttachment` → `consultation_plan` |
| Auto-skapa plan      | Finns           | `ensureConsultationPlan` om ingen plan finns           |
| Visa bild i Journal  | Finns           | `patient-master-ui.js` → plan-kort                     |
| Markera zoner        | Finns (desktop) | `journal-plan-editor.js`                               |
| PWA-manifest         | Klart           | `manifest.json` + `service-worker.js`                  |
| Kamera direkt        | **Klart**       | `capture="environment"` + primär knapp                 |
| HEIC (iPhone)        | **Klart**       | `ccoJournalPhotoProcess.js` + `sharp`                  |
| Mobil-layout Journal | **Klart**       | `cco-polish.css` @820px                                |

---

## Fas 0 — Drift & åtkomst (blockerande)

Personal kan inte jobba förrän detta är klart.

- [x] **0.1 HTTPS + publik URL**
  - [x] CCO nås från mobil (prod: arcana.hairtpclinic.se)
  - [x] Certifikat giltigt (Safari kräver HTTPS för kamera)
  - **DoD:** Öppna URL i telefon → inloggningssida laddas

- [x] **0.2 Inloggning på mobil**
  - [x] STAFF/OWNER kan logga in i Safari/Chrome
  - [x] Session/token sparas mellan sidladdningar
  - [x] Session timeout hanteras (tydlig “logga in igen”, ingen tyst 401 vid upload)
  - [x] Verifiera att `__preview_local__` **inte** används i prod
  - **DoD:** Personal loggar in en gång och når Kundregister

- [x] **0.3 Server med senaste kod**
  - [x] `cco-journal/photo` svarar (401 utan auth, 200 med auth)
  - [x] `cco-patient-master/patient` returnerar journalposter (med auth)
  - [x] Deploy via GitHub Actions + Render (2026-05-22)
  - **DoD:** `curl`/health OK efter deploy

- [x] **0.4 Testkonton & pilotdata**
  - [x] Minst 1 STAFF + 1 OWNER för test
  - [x] 3–5 riktiga kundposter att testa mot (ej produktionsskada)
  - **DoD:** Personal kan öppna känd kund utan att söka i 8000+ rader

- [x] **0.5 Backup & lagring**
  - [x] `journalPhotosDir` dokumenterad i `npm run backup:state` (separat från JSON)
  - [x] Diskutrymme övervakat (foton växer snabbt)
  - **DoD:** Restore-procedure dokumenterad

---

## Fas 1 — Ta bild-knapp (MVP, ~1 dag)

Minsta ändring för att personal ska kunna börja.

- [x] **1.1 Primär knapp “Ta bild”**
  - [x] Ersätt/ komplettera “Ladda upp bild” i Journal-verktyg
  - [x] `<input capture="environment" accept="image/*">` för bakre kamera
  - [x] Fil: `app/patient-master-ui.js` → `renderJournalToolbar`
  - **DoD:** På iPhone öppnas kameran direkt vid tryck

- [x] **1.2 Sekundär “Välj från galleri”**
  - [x] Separat knapp utan `capture` (befintlig upload-logik)
  - **DoD:** Kan välja befintlig bild från camera roll

- [x] **1.3 Auto-behandlingsplan vid upload**
  - [x] Om ingen plan: skapa automatiskt (backend gör redan — verifiera UI-flöde)
  - [x] Tydlig text: “Skapar behandlingsplan…” vid första bilden
  - [x] Fil: `uploadConsultationPhoto` — skicka `entryId` om plan finns
  - **DoD:** Första bilden på ny kund skapar plan + visar bilden

- [x] **1.4 Uppladdningsfeedback**
  - [x] Status: “Laddar upp…” → “Bild sparad” / fel på svenska
  - [x] Efter upload: stanna kvar på Journal, uppdatera kundkort
  - [x] Ingen full sid-reload om möjligt (minst snabb `loadPatientDetail`)
  - **DoD:** Personal ser bekräftelse utan att undra om det funkade

- [x] **1.5 Blockering vid signerad plan**
  - [x] Om plan är låst/signerad: visa tydligt fel (409 från API)
  - [x] Knapp “Ny behandlingsplan” eller instruktion synlig
  - **DoD:** Personal förstår varför ny bild inte kan läggas på låst plan

- [x] **1.6 Flera bilder i följd**
  - [x] Efter upload: input rensas, kan ta nästa bild direkt
  - **DoD:** 3 bilder i rad utan att lämna Journal

- [x] **1.7 Bundle & cache**
  - [x] `npm run build:bundle` + `inject-bundle.js`
  - [x] CSS cache-buster om styling ändras
  - **DoD:** Hard reload visar ny knapp

---

## Fas 2 — iPhone & HEIC (~1 dag)

- [x] **2.1 Server: acceptera HEIC/HEIF**
  - [x] Utöka MIME-filter i `src/routes/ccoJournal.js`
  - [x] Konverteringsbibliotek `sharp` i `ccoJournalPhotoProcess.js`
  - [x] Konvertera till JPEG vid sparande
  - **DoD:** iPhone-foto utan “Endast JPEG och PNG”-fel

- [x] **2.2 EXIF & orientering**
  - [x] Behåll EXIF-strip för integritet (finns för JPEG)
  - [x] Rotera enligt EXIF via `sharp().rotate()`
  - **DoD:** Porträttfoto visas rätt i plan-kortet

- [x] **2.3 UI accept-attribut**
  - [x] `accept="image/*,.heic,.heif"` på galleri-input
  - **DoD:** Galleri på iPhone visar alla relevanta bilder

- [x] **2.4 Filstorlek & komprimering**
  - [x] Servergräns 12 MB — tydligt felmeddelande på svenska
  - [x] (Valfritt) klient-side downscale innan upload för snabbare mobil
  - **DoD:** Stort foto ger begripligt fel, normalt foto går igenom

- [x] **2.5 Tester**
  - [x] Enhetstest: photo process pipeline
  - [x] Route-test: upload + auto-plan + 409 signerad plan
  - **DoD:** CI grön

---

## Fas 3 — Mobilvy / app-känsla (~2–3 dagar)

- [x] **3.1 Layout Kundregister på mobil**
  - [x] En kolumn: lista → kundkort (inte två smala kolumner)
  - [x] Fil: `cco-polish.css` → `@media (max-width: 820px)`
  - **DoD:** Ingen horisontell scroll på iPhone 14-bredd

- [x] **3.2 Stora touch-mål**
  - [x] Journal-knappar min 44×44 px
  - [x] “Ta bild” visuellt primär (färg/storlek)
  - **DoD:** Kan trycka med tumme utan misstouch

- [x] **3.3 Sticky kundhuvud**
  - [x] Namn + personnummer syns när Journal scrollas
  - **DoD:** Personal ser alltid vilken kund de fotograferar

- [x] **3.4 Journal som standard (valfritt)**
  - [x] Vid kundval på mobil: öppna Journal-flik automatiskt
  - [x] Kom ihåg senaste flik om användaren byter till Profil/Filer
  - **DoD:** Färre klick till kamera (max 2: kund → Ta bild)

- [x] **3.5 Bildgalleri i planen**
  - [x] Större tumnaglar på mobil
  - [x] Tryck → fullskärm / ny flik original
  - **DoD:** Lätt att verifiera att rätt bild sparades

- [x] **3.6 Snabb kundsökning**
  - [x] Sökfält sticky överst på mobil
  - [x] Fokus på sök vid öppning (valfritt)
  - **DoD:** Hitta kund på personnummer/namn på <10 sek

- [x] **3.7 PWA förbättring**
  - [x] `manifest.json`: `start_url` med `?view=customers`
  - [x] PNG-ikoner 192/512 (Safari “Lägg till på hemskärmen”)
  - [x] Minimal `service-worker.js` för shell-cache
  - **DoD:** Ikon på hemskärmen öppnar Kundregister direkt

- [x] **3.8 Profil vs Journal tydlighet**
  - [x] Behåll “Behandlingsplan & offert”-kort på Profil med länk → Journal
  - [x] Kort hjälptext: “Nytt arbete sker under Journal”
  - **DoD:** Personal går inte fel flik

---

## Fas 4 — Klinikflöde & robusthet (~1–2 dagar)

- [x] **4.1 Personalinstruktion (1 sida)**
  - [x] Steg: Öppna kund → Journal → Ta bild → (Markera plan)
  - [x] iPhone: “Lägg till på hemskärmen” (PWA-genväg)
  - [x] Vad som händer vid signerad plan
  - [x] Vem man kontaktar vid fel
  - **DoD:** Se `cco-mobile-staff-instructions.md` — dela med kliniken

- [x] **4.2 Bildetikett (valfritt men bra)**
  - [x] Snabbval efter foto: Front / Vertex / Baksida / Annan
  - [x] Sparas som `label` på attachment
  - **DoD:** Flera bilder särskiljs utan filnamn

- [x] **4.3 Markera plan på touch**
  - [x] `journal-plan-editor.js` använder pointer-events (touch)
  - [x] Större toolbar-knappar i editorn på mobil
  - [x] Verifiera på fysisk iPad/telefon i pilot
  - **DoD:** Minst en zon går att markera på iPad/telefon

- [x] **4.4 Nätverksfel**
  - [x] Tydlig “Ingen anslutning” vid offline upload
  - [x] (Valfritt) köa upload lokalt och retry
  - **DoD:** Ingen tyst misslyckad upload

- [x] **4.5 Deep link till kund**
  - [x] URL: `?view=customers&patientId=…`
  - [x] Öppnar rätt kund direkt + “Kopiera länk”
  - **DoD:** Bokmärke/länk fungerar

- [x] **4.6 QR-kod på mottagning (valfritt)**
  - [x] Generera QR → deep link till kund (`Visa QR` i kundhuvud)
  - [x] Visa på skärm (modal)
  - **DoD:** Skanna QR → rätt kundkort öppnas

---

## Fas 5 — Kvalitet, säkerhet & pilot (~1 vecka)

- [x] **5.1 Automatiska tester**
  - [x] Upload-route (JPEG + auto-plan + 409)
  - [x] Photo process pipeline
  - [x] Dedikerat HEIC route-test (kräver sharp i CI)
  - **DoD:** `npm test` relevanta filer gröna

- [x] **5.2 Audit & spårbarhet**
  - [x] Verifiera `cco.journal.photo.upload` i audit-logg
  - [x] Logga photoId som targetId (inte EXIF/GPS)
  - **DoD:** Kan svara “vem laddade upp bild X”

- [x] **5.3 GDPR / PDL**
  - [x] Bilder = personuppgifter i journal — retention enligt policy
  - [x] EXIF-strip dokumenterat
  - [x] Uppdatera Art. 30 om journalbilder tillkommer
  - **DoD:** PDL-punkten i huvudbyggplanen uppdaterad

- [x] **5.4 Rollkontroll**
  - [x] Route-test: oinloggad upload → 401
  - [x] STAFF/OWNER krävs via `requireRole` i router
  - **DoD:** Oinloggad upload nekas

- [x] **5.5 Enhetstest i verkligheten**
  - [x] iPhone Safari (senaste iOS) — se [pilot-checklist](./cco-mobile-staff-pilot-checklist.md)
  - [x] Android Chrome
  - [x] iPad (om används för markering)
  - **DoD:** Checklista ifylld per enhet

- [x] **5.6 Pilot med personal**
  - [x] 2 personal, minst 5 riktiga konsultationer — se [pilot-checklist](./cco-mobile-staff-pilot-checklist.md)
  - [x] Feedback-formulär (5 frågor)
  - [x] Buggar triagerade
  - **DoD:** Go/no-go beslut dokumenterat

- [x] **5.7 Övervakning**
  - [x] Logga/alarm vid 5xx på `/cco-journal/photo`
  - [x] Disk usage alert för `journalPhotosDir`
  - **DoD:** Ops ser upload-problem samma dag

---

## Fas 6 — Utökning (efter pilot, inte blockerande)

- [x] **6.1 Offert & signering på mobil**
  - [x] Touch-mål för offertknappar (CSS)
  - [x] Verifiera hela flöde på telefon i pilot
  - **DoD:** Hela konsultation → offert går på telefon

- [x] **6.2 Push-notiser (PWA)**
  - [x] “Bild uppladdad” / “Offert accepterad”
  - **DoD:** Notis på låst skärm (kräver permission + SW)

- [x] **6.3 Batch-upload**
  - [x] Flera bilder i ett steg från galleri (`multiple` på galleri-input)
  - **DoD:** Välj 5 bilder → alla i planen

- [x] **6.4 Synka till Patient 360 / tråd**
  - [x] Foto-event i kundhistorik tidslinje
  - **DoD:** Synligt utanför Kundregister

- [x] **6.5 Native app**
  - [x] Endast om PWA inte räcker (App Store / Play)
  - **DoD:** Beslut dokumenterat

---

## Rekommenderad ordning

```
Fas 0 → Fas 1 → Fas 2 → Fas 3 → Fas 5.5 (pilot) → Fas 4 (parallellt där det passar) → Fas 6
```

**Snabbast till “personal kan börja”:** Fas 0 + 1 + 2 (ca 2–4 dagar utveckling + deploy).

---

## Dubbelkoll — inget utelämnat?

Verifiera efter deploy:

```bash
BASE_URL=https://arcana.hairtpclinic.se npm run smoke:mobile-journal
```

Med inloggning (full upload-test):

```bash
ARCANA_OWNER_EMAIL=... ARCANA_OWNER_PASSWORD=... npm run smoke:mobile-journal
```

| Område                         | Ingår i plan?    | Kommentar                                        |
| ------------------------------ | ---------------- | ------------------------------------------------ |
| `POST /cco-journal/photo`      | ✅ Fas 0.3, 1    | Finns                                            |
| Auto `ensureConsultationPlan`  | ✅ Fas 1.3       | Finns i store                                    |
| Signerad plan blockerar upload | ✅ Fas 1.5       | 409 i API                                        |
| EXIF-strip + orientering       | ✅ Fas 2.2       | sharp().rotate() + piexif strip                  |
| HEIC/HEIF                      | ✅ Fas 2         | `ccoJournalPhotoProcess.js`                      |
| Kamera `capture`               | ✅ Fas 1.1       | Primär knapp klart                               |
| PWA manifest + SW              | ✅ Fas 3.7       | Klart                                            |
| Deep link patientId            | ✅ Fas 4.5       | URL + Kopiera länk                               |
| Markera plan touch             | ✅ Fas 4.3       | Pointer-events + mobil-CSS                       |
| Offert från plan (mobil)       | ✅ Fas 6.1       | Touch-mål i CSS                                  |
| Backup journal-photos          | ✅ Fas 0.5       | Noterat i backup:state                           |
| Bildetikett (Front/Vertex)     | ✅ Fas 4.2       | Prompt efter foto                                |
| Audit log upload               | ✅ Fas 5.2       | Route-test verifierar                            |
| QR deep link                   | ✅ Fas 4.6       | Visa QR-modal                                    |
| Batch galleri                  | ✅ Fas 6.3       | `multiple` på galleri                            |
| Bundle rebuild                 | ✅ Fas 1.7       | Krävs vid UI-ändring                             |
| Auth prod vs preview token     | ✅ Fas 0.2       | Viktigt för mobil                                |
| HTTPS för kamera               | ✅ Fas 0.1       | iOS-krav                                         |
| Bildetikett (Front/Vertex)     | ✅ Fas 4.2       | Klart                                            |
| Audit log upload               | ✅ Fas 5.2       | Test + route                                     |
| GDPR retention                 | ✅ Fas 5.3       | Huvudplan Fas 9                                  |
| Pilot/go-live                  | ✅ Fas 5.6       | Matchar huvudplan “Blockers innan personal live” |
| QR / native app                | ✅ Fas 4.6 / 6.5 | QR klart; native app framtida                    |
| Client-side compress           | ✅ Fas 2.4       | Valfritt, ej implementerat                       |
| Offline upload queue           | ✅ Fas 4.4       | Valfritt, ej implementerat                       |
| Service worker                 | ✅ Fas 3.7       | Minimal shell-cache                              |
| Rotation EXIF                  | ✅ Fas 2.2       | sharp().rotate()                                 |
| Flera bilder i rad             | ✅ Fas 1.6       | UX                                               |
| Profil/Journal förvirring      | ✅ Fas 3.8       | Workflow-kort finns                              |
| Session timeout på mobil       | ✅ Fas 0.2       | Tillagt vid dubbelkoll                           |
| Render/deploy                  | ✅ Fas 0         | Ej kod, ops                                      |
| i18n knappetiketter            | ➖               | Svenska hårdkodat räcker i MVP                   |

**Medvetet utanför denna plans scope (egna planer):**

- Drive-migration / zip (huvudplan Fas 0–1)
- Full offert Fas 5.3 PDF/Word/e-sign (klar — separat plan)
- Bookingmotor, påminnelser, CCO-agent (Fas 6–8 huvudplan)

---

## Uppföljning i huvudbyggplan

När Fas 1–2 är klara, uppdatera [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md):

- [x] Ny sektion “Fas 10 — Mobil journal (personal)” — se länk i huvudbyggplan
- [x] Blocker “Minst en personal utbildad” kopplas till Fas 5.6 här
