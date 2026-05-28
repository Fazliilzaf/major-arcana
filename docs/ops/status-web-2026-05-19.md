---
owner: Ops
status: active
---

# hairtpclinic.com — nuläge och nästa leveranser

Datum: 2026-05-19
Syfte: Veckovis status för den publika webben. Föregående: `status-web-2026-05-18.md` (EN-paritet + Performance-foundation + Workstream A klar).
Detta dokument täcker leveransen 2026-05-18 sen-kväll → 2026-05-19: Workstream B (tillgänglighet), Workstream C (smart engagement), bundle-analyzer, AI-aktivering och Workstream D **Fas A + B + C** (web↔CCO booking-bridge live, Cliento-vägen pensionerad).

Masterplan: `docs/strategy/web-hairtpclinic-com-masterplan.md`.
Bridge-kontrakt: `docs/strategy/web-to-arcana-bridge.md`.

---

## 1. Snabbverifiering (kör i webb-repo)

Kör i katalogen `next-app/`:

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json
npm run analyze   # ANALYZE=true next build — bundle-rapport i .next/analyze/
```

### Resultat 2026-05-19

| Steg | Utfall |
|------|--------|
| `tsc --noEmit` | OK (0 fel i kod) |
| `npm run analyze` | Klart — bundle-analyzer aktiverad |
| Tree-shake-verify lucide-react | 33 MB raw → 9 KB i bundle (-99,97 %) |
| Visuell smoke | Klar — `/boka` step 3 verifierad i Chrome efter Fas A-deploy |
| Live E2E booking POC | Klar — reservation skapad i CCO via Fas C |

---

## 2. Sprint 2026-05-18 (sen-kväll → 05-19) — vad som levererades

### 2.1 Bundle-analyzer + tree-shake-verify

- `@next/bundle-analyzer` v15 installerad som devDependency.
- `next.config.mjs` wrappad med `withBundleAnalyzer` (aktiveras med `ANALYZE=true`).
- `package.json` fick `"analyze": "ANALYZE=true next build"`.
- **Verifierad besparing**: 34 unika lucide-icons importeras. Hela paketet är 33 MB. I production-bundle är allt lucide-relaterat 9 KB.

### 2.2 Workstream B — tillgänglighet & img→Image

- 0 saknade `alt`-attribut (false-positive i ursprungs-audit).
- 4 native `<img>` → `<Image>` på prioriterade ytor.
- 0 input-violations vid statisk WCAG-audit.

### 2.3 Workstream C — smart engagement

**C.1 AI Pre-konsultationschatt** (live på production med `ANTHROPIC_API_KEY`):
- `/api/chat` Claude Haiku 4.5, locale-aware (SV+EN), 6 säkerhetsregler + HÅRDA FAKTA-citering (öppettider, telefon, adress, e-post, 197 omdömen).
- `ChatWidget` med markdown-rendering (bold/italic/code/länkar).
- Mock-läge auto-fallback utan key.

**C.2 Treatment-matcher quiz**:
- 5-stegs på `/boka` + `/en/book`, locale-aware, pre-fyller booking-form via URL-params.

**C.3 WhatsApp deep-link**:
- 13 path-matchers med per-sida context, SV+EN.

### 2.4 Workstream D — Bokning & lead-pipeline (BRIDGE LIVE)

Detta är den stora leveransen sedan masterplanen sist uppdaterades. Bridge-doc i `docs/strategy/web-to-arcana-bridge.md` låser hela kontraktet.

**Fas A — Webben läser slots:**
- `next-app/lib/arcana-client.ts` — typed klient med provider-switch (`cliento` ↔ `booking-engine`), mock-fallback, 8s timeout.
- `next-app/app/api/availability/route.ts` — server-side proxy med origin-check + rate-limit (30/min/IP).
- `next-app/components/ui/SlotPicker.tsx` — locale-aware grid (max 7 dagar × 8 slots), demo-banner när mock-mode, hoppa-över-knapp.
- Inkopplad i `/boka` step 3 + `/en/book` (locale=en). Vald slot inkluderas i lead-payload som `arcana.{slotId,slotStart,slotEnd,resourceId,serviceId}`.
- Hardcoded `serviceId="consultation"` — första bokningen är alltid kostnadsfri konsultation, oavsett vilken behandling patienten är intresserad av.

**Fas B — CCO booking-engine exponerad publikt:**
- `src/routes/publicBookingEngine.js` — speglar `publicClinic.js` men hämtar från `ccoBookingEngineStore`. Endpoints: `GET /api/public/booking-engine/catalog` + `GET /api/public/booking-engine/availability`.
- `ccoBookingEngineStore` seedat med riktigt Hair TP-team:
  - Resources: **Fazli Krasniqi**, **Egzona Krasniqi**, **Dr. Arya Emami** (medicinskt ansvarig, ögonplastikkirurg).
  - Services: consultation, fue, dhi, beard, eyebrow, prp-hair, prp-skin, microneedling, followup — matchar fastpris-listan på .com.
  - 14 availability-rules respekterar klinik-öppettider (Mån-Fre 08-20, Lör 10-18, Arya:s ögonbryn-scope, FUE/DHI-veckodagsfördelning).
- Vercel env-vars satta: `ARCANA_BASE_URL`, `ARCANA_PROVIDER=booking-engine`, `ARCANA_BRAND_HOST=hairtpclinic.com`.

**Fas C — Publik reservation-endpoint:**
- `POST /api/public/booking-engine/reservations` accepterar patient-payload, synthesizar `conversationId = sha256(email+slotId)`, reserverar 72h i `ccoBookingEngineStore`, mirror:ar till `ccoBookingStore` som `needs_triage`-case med audit-event `web_public_reservation`.
- Validering: GDPR-consent (krävs), e-postformat, telefon 6-15 siffror, namn 2-80 tecken, slot.{slotId,startsAt,resourceId,serviceId}.
- Returnerar reservationId, expiresAt, caseId, operatorEtaMinutes (60).

**E2E POC verifierad 2026-05-19:**
- ✓ Hämta slot → reservera → 200 OK med reservationId
- ✓ Dubbelbokning samma slot → 409 `slot_unavailable`
- ✓ Reserverad slot försvinner från availability för nästa besökare
- ✓ Webb-UI på hairtpclinic.com visar `provider: cco_engine, mocked: false, 110 slots` (efter path-fix `/api/v1/public/* → /api/public/*`)

**Cliento-status:** webben pollar inte längre Cliento. Cliento-koden finns kvar i Arcana för operatörens manuella verifierings-flöde (Level 1.5 per `cco-booking-prod-readiness-checklist.md`) men kan stängas av när vi vill.

---

## 3. Definition of Done för denna sprint

3.1. ✓ Bundle-analyzer aktiverad + tree-shake verifierad.
3.2. ✓ Tillgänglighet (alt + img→Image på prioriterade ytor).
3.3. ✓ AI-chatt live med korrekta fasta fakta.
3.4. ✓ Treatment-matcher live på både SV och EN.
3.5. ✓ WhatsApp deep-link kontext-aware på alla sidor.
3.6. ✓ 0 TypeScript-fel i ny kod.
3.7. ✓ Web↔Arcana booking-bridge Fas A + B + C live.
3.8. ✓ Riktigt Hair TP-team i booking-engine + på Team-sida.
3.9. ✓ E2E booking-flow verifierad via curl-test.

---

## 4. Open issues / blockers

4.1. **Sjuksköterskor (Veronica/Clara/Wendela/Louise) inte bookable än.** Per Fazli "håll teamet åt sidan". Avvaktar beslut om scope (PRP självständigt vs assistans) innan vi lägger till dem som resources.

4.2. **`RESEND_API_KEY` inte satt på Render → confirmation-mail i mock-mode.** Koden är klar (`src/infra/resendMailer.js` + `src/templates/bookingReservationEmail.js`) och wirad in i `POST /reservations`. När key sätts: går automatiskt från `mode:'mock'` till `mode:'live'`. Audit-event `reservation_confirmation_sent` fires redan idag i båda modes.

4.3. **Post-op review photo-upload saknas.** Token + store + capability + 4 routes + patient-UI är live. Foto-upload kräver multer + sharp för EXIF-strip — npm install hängde sig i iCloud-foldern (10+ min utan resultat). Mellanlösning i UI: patienten mejlar foton till contact@hairtpclinic.com. Lösning för nästa pass: installera multer + lättviktigt piexifjs (pure JS, ~50KB) istället för sharp.

4.4. **CCO operator-UI för trigger-knapp saknas.** Routes är klara — operatör kan POSTa till `/api/v1/cco-bookings/:caseId/mark-follow-up-completed` via curl idag. En knapp i CCO-shellen (`public/major-arcana-preview/app.js`, 41 635 rader) kräver dedicated UX-pass.

4.5. **Inget CAPTCHA/honeypot på POST /reservations.** Rate-limit per IP räcker tills vi ser abuse-mönster.

---

## 5. Leveranser sen-kväll 2026-05-19 (post-bridge-rundan)

5.1. ✓ **Resend-integration för reservation-bekräftelse** — wirad in i `POST /reservations`. SV+EN templates med Stockholm-tid. Mock-mode utan key, live när `RESEND_API_KEY` sätts i Render. Audit-event `reservation_confirmation_sent` / `reservation_confirmation_failed`.

5.2. ✓ **Arcana post-op review Fas 1 (backend + patient-UI):**
- `src/ops/postOpReviewStore.js` (372 rader) — full CRUD + token-helpers + GDPR-radering + cron-prune.
- `src/capabilities/requestPostOpReview.js` (312 rader) — locale-aware mail-templates, registrerad i `registry.js`.
- `src/routes/postOpReview.js` (298 rader) — 4 endpoints: `mark-follow-up-completed`, `/:token/lookup`, `/:token/submit`, `/:token/review-clicked`, `GET /uppfoljning/:token`.
- `public/uppfoljning/index.html` (276 rader) — patient-UI med 4 states (loading/invalid/form/success), Newsreader+Inter, GDPR-grade consent-checkbox med "ögonbryn-och-uppåt"-formulering.
- Live på `https://arcana.hairtpclinic.se/uppfoljning/:token` (HTTP 200 verifierat).

5.3. **Sparas till nästa pass:**
- Photo-upload med multer + EXIF-strip (npm install hängde sig i iCloud).
- CCO operator-UI för trigger-knapp (41k-rad vanilla JS shell, kräver UX-pass).
- M365 Graph send-integration (Fas 1 är manuell copy-paste från operator).
- Pre-fill operator-notes från web-leads i CCO-vyn (1 dag).
- Just nu skickas det med i lead-payload men CCO-vyn renderar det inte tydligt.

---

## 6. Snabb-uppslag

- Webb-repo (lokal): `hairtpclinic-web (extern Next.js-repo, Vercel) — `
- Live: `https://hairtpclinic.com` + `https://www.hairtpclinic.com`
- Arcana booking-engine: `https://arcana.hairtpclinic.se/api/public/booking-engine/{catalog,availability,reservations}`
- Webside availability proxy: `https://hairtpclinic.com/api/availability?fromDate=&toDate=`
- Bridge-doc: `docs/strategy/web-to-arcana-bridge.md`
- Föregående status: `docs/ops/status-web-2026-05-18.md`
- Nästa status: `docs/ops/status-web-2026-05-26.md` (planerad)

---

## 7. Leveranser sen-natt 2026-05-19 (runda II — webb→CCO closure)

Detta är leveranserna efter den första post-bridge-rundan (sektion 5),
fokuserade på att stänga sista gapet i webb→Arcana-flödet plus skydd
mot framtida regression.

### 7.1. Webb /api/lead → Arcana CCO bridge (Task #100)

- `next-app/app/api/lead/route.ts` fick en `forwardToArcana()`-helper
  som POSTar till `/api/public/booking-engine/reservations` när
  lead-payloaden innehåller `data.arcana.{slotId, slotStart, slotEnd,
  serviceId, resourceId}`.
- Best-effort: 10s timeout, try/catch, lead-flowet bryts inte om
  Arcana är nere — email-notifikationen till klinik körs ändå.
- Response från `/api/lead` returnerar nu:
  `{ ok: true, arcana: { caseId, reservationId } | null }`.
- **E2E verifierat** mot prod: lead med slot → CCO case `web-34f197b6424b`
  + reservation `9f3b80da-ebe0…` skapade på en request. Dubbelbokning
  på samma slot returnerar `arcana: null` (Arcana svarade `slot_unavailable`,
  lead-flowet fortsatte).

### 7.2. Tyst regression hittad + fixad (Task #103)

Cursor-commit `d82d515` ("Fas 27E: server-side asset pipeline") hade
pushat server.js från en gammal snapshot och raderat:

- `require('./src/routes/publicBookingEngine')` + `app.use('/api', createPublicBookingEngineRouter(...))`
- `require('./src/routes/postOpReview')` + `app.use(createPostOpReviewRouter(...))`

Resultat på Render: alla `/api/public/booking-engine/*` returnerade 404,
hairtpclinic.com `/api/availability`-proxy föll tillbaka till Cliento
mock-mode (mocked: true, provider: cliento). Patient-UI på
`/uppfoljning/:token` returnerade 404 också.

Återställd via commits `3e87551` + `0d3bd47`. Verifierat post-deploy:

- `/api/public/booking-engine/catalog?host=hairtpclinic.com` → 200, 9 services
- `/api/public/booking-engine/availability` → 200, 78 slots från CCO-engine
- `/api/availability` proxy: `provider: cco_engine, mocked: false, 76 slots`
- `/uppfoljning/INVALID-TOKEN` → 200 (patient-UI renderar "invalid"-state)
- `/api/v1/post-op-review/INVALID/lookup` → 404 `invalid_or_expired_token`

### 7.3. Regression-guard mot framtida server.js-överskrivning (Task #104)

`bin/pre-commit-cco.sh` fick ett nytt step `[4/4]` som failar commit
om någon av dessa mountings saknar minst 2 förekomster i server.js
(require + app.use):

- `createPublicBookingEngineRouter`
- `createPostOpReviewRouter`

Pre-commit hooken är redan symlinkad (`.git/hooks/pre-commit →
bin/pre-commit-cco.sh`) så guarden är aktiv direkt. Verifierat genom
att tillfälligt sed-radera importen — guarden fail:ar som förväntat.

### 7.4. Photo-upload Fas 1.B (Task #102)

Patient kan nu ladda upp 1-6 efter-bilder direkt på
`/uppfoljning/:token` istället för att mejla dem.

Backend (`src/routes/postOpReview.js`):

- `POST /api/v1/post-op-review/:token/photos` (multer.array, memoryStorage)
- JPEG → `piexif.remove(binaryString)` strippar ALL EXIF (Make, Model,
  DateTimeOriginal, GPS) före disk-skrivning. PNG passar igenom.
- Limits: max 6 filer × 8 MB per submission (totalt över alla requests).
- Storage: `<config.postOpPhotosDir>/<submissionId>/<photoId>.{jpg,png}`
  med mode 0600. Default `/var/data/post-op-photos` på Render
  (via `config.js` med `ARCANA_POST_OP_PHOTOS_DIR` override).
- Audit-event `post_op_photo_uploaded` på CCO-caset.

Frontend (`public/uppfoljning/index.html`):

- File-picker med chip-lista (filnamn + size + ta-bort)
- Klient-validering MIME (JPEG/PNG) + size före upload
- Submit-flow: upload photos FÖRST → submit consent+note
- SV+EN locale-strängar för alla nya texter

Varför piexifjs istället för sharp: sharp har stora native binaries
och `npm install sharp` hängde sig i iCloud-foldern (10+ min utan
resultat). piexifjs är pure JS (~50KB) och strippar EXIF deterministiskt.
Vi behöver inte resize/convert — den biten skjuts till Fas 2.

EXIF-strip verifierat lokalt med syntetisk JPEG:
461 byte med Make=Apple + GPS koordinater → 285 byte (-38%), Make
stripped, GPS stripped.

### 7.5. CCO operator-UI Markera-knapp (Task #101)

`public/major-arcana-preview/app.js` fick:

- **Ny knapp** i Steg 4-lane "Fortsätt med förslaget":
  `<button data-booking-action="mark_followup_done">Markera uppföljning klar</button>`
- **Ny handler** i `handleBookingAction`-switchen som POSTar till
  `/api/v1/cco-bookings/:caseId/mark-follow-up-completed` med
  `customerName` + `locale` från aktiv tråd.
- **Auto-copy till urklipp**: emailDraft (om finns) kopieras till
  urklipp så operatören kan klistra in i Outlook med ⌘V. Review-länken
  visas i feedback-banneret.
- **Audit-event** `final_followup_marked` skrivs till booking-caset.

Operatören slipper därmed curl-kommandot — flow är nu: välj tråd →
klicka knappen → ⌘V i Outlook → skicka. M365 Graph send-integration
för auto-send kvarstår som Fas 2.

### 7.6. Open issues / nästa pass

- M365 Graph send-integration (auto-send istället för manuell copy-paste).
- HEIC/HEIF-photo-support (kräver sharp eller heic2any på server).
- Cron för `pruneNoConsentPhotos` — koden finns i store:n men ingen
  scheduler triggar den. GDPR kräver radering 12 mån efter submit
  utan consent.
- Image-thumbnails i CCO operator-vyn (idag visar caset bara
  filnamn + size, inte preview).
- Pre-fill operator-notes från web-leads i CCO-vyn (lead-payload
  innehåller fältet men CCO-vyn renderar det inte tydligt).

### 7.7. Commit-trace för runda II

- `8f656fd` — feat(lead): forward web bookings to Arcana CCO when slot picked
- `3e87551` — fix(server): restore publicBookingEngine mounting
- `0d3bd47` — fix(server): restore postOpReview mount + add regression-guard
- `4111dfe` — feat(post-op-review): photo-upload Fas 1.B (multer + piexifjs)
- (CCO operator-knapp commit följer efter denna doc-update)
