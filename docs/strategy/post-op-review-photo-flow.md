---
owner: CCO
status: active
---

# Post-Op Review & Photo Flow — ASK MODE Spec

**Datum:** 2026-05-18
**Författare:** DXM-pass (Cowork-session, info@fazli.se)
**Format:** ASK MODE per AGENTS.md
**Relaterat:** `docs/strategy/web-hairtpclinic-com-masterplan.md` §Workstream D, `docs/architecture/capability-framework-contract-v1.md`, `docs/architecture/execution-gateway-contract.md`

---

## 1. Scope

Bygg en patient-kanal-flow där en patient efter **sista uppföljningsbesöket** (typiskt 6–12 mån post-op) får en personlig länk som låter dem:

1. Ladda upp **efter-bilder** (med samtycke om publicering på hemsidan/Instagram).
2. Få en mjuk CTA att **lämna ett Google-omdöme** (länk till Hair TP Clinics GBP-review-form).

Två faser, två mognadsnivåer:

- **Fas 1 (manuell trigger, augusti–september 2026):** CCO-operatör markerar booking-case som `follow_up_completed` i CCO-vyn → systemet skickar utskick via Microsoft Graph (befintlig send-connector). Allt går genom ExecutionGateway.
- **Fas 2 (auto-trigger, Q4 2026):** CCO Booking-engine markerar status automatiskt baserat på Cliento-bokningstyp (`follow_up_final`) + datum passerat. Samma flow för utskick.

**Inte i scope nu:** SMS (kräver ny provider, inte i nuvarande stack). Inlägg på Instagram av efter-bilderna automatiskt. Public-facing case-galleri på hairtpclinic.com (kommer som separat pass när vi har approved kit av efter-bilder).

---

## 2. Proposed plan

### 2.1. Data-modell — nya fält + statusar

**`data/cco-bookings.json` cases[]:**

- Ny status: `follow_up_completed` (kompletterar `slots_ready` → `confirmed_external` → `completed` → `follow_up_completed`)
- Nytt fält per case: `finalFollowUpCompletedAt: ISO8601 | null`
- Nytt fält per case: `postOpReviewToken: string | null` (URL-safe, 32 chars, krypterad reference till caseId)
- Nytt fält per case: `postOpReviewSentAt: ISO8601 | null`
- Ny `events[]`-typ: `final_followup_marked` + `post_op_review_dispatched` + `post_op_photos_received` + `post_op_review_clicked`

**Ny store:** `data/post-op-reviews.json` (separat fil, samma JSON-pattern som övriga `data/*.json`)

```json
{
  "version": 1,
  "submissions": [
    {
      "submissionId": "uuid",
      "bookingCaseId": "...",
      "tenantId": "hair-tp-clinic",
      "patientName": "...",
      "submittedAt": "ISO8601",
      "consentToPublish": true|false,
      "photos": [
        { "photoId": "uuid", "filename": "after-1.webp", "size": 245678, "uploadedAt": "ISO8601" }
      ],
      "patientNote": "string",
      "reviewClicked": true|false,
      "reviewClickedAt": "ISO8601 | null"
    }
  ]
}
```

Foton lagras NOT i JSON utan i `data/post-op-photos/[submissionId]/[photoId].webp` (filsystem, gitignored). Endast metadata i JSON.

### 2.2. Capability — ny capability `RequestPostOpReview`

Per `capability-framework-contract-v1.md` registreras en ny capability:

```js
{
  name: 'RequestPostOpReview',
  version: '1.0.0',
  allowedRoles: [ROLE_OWNER, ROLE_OPERATOR],
  channels: ['patient'],
  inputSchema: {
    bookingCaseId: string (required),
    actorUserId: string,
    locale: 'sv' | 'en'
  },
  outputSchema: {
    decision: 'allow' | 'review_required' | 'blocked',
    token: string,
    reviewLink: 'https://arcana.hairtpclinic.se/uppfoljning/[token]',
    emailDraft: { subject, html, plain }
  },
  requiresInputRisk: true,    // patient-PII går genom risk-scan
  requiresOutputRisk: true,   // utgående text granskas
  requiresPolicyFloor: true,  // medicinska disclaimers krävs
  persistStrategy: 'artifact', // sparas som persisted booking-event
  auditStrategy: 'always'
}
```

Capability:n genererar token (signed JWT eller crypto.randomBytes), bygger e-postmall, returnerar via gatewayn. Routes anropar ALDRIG `execute()` direkt — bara via `ExecutionGateway`.

### 2.3. Routes

**Nya endpoints:**

| Method | Path | Skyddad | Syfte |
|--------|------|---------|-------|
| `POST` | `/api/v1/cco-bookings/:caseId/mark-follow-up-completed` | CCO-operator | Trigger Fas 1: markera case + skicka utskick via gateway |
| `GET` | `/uppfoljning/:token` | Public (token-only) | Patient-vy: foto-upload + GBP-CTA |
| `POST` | `/api/v1/post-op-review/:token/photos` | Token-only | Multipart photo upload (max 6 foton, 5 MB/st, WebP/JPEG/PNG → server konverterar till WebP) |
| `POST` | `/api/v1/post-op-review/:token/submit` | Token-only | Bekräfta submission + consent-flagga |
| `GET` | `/api/v1/post-op-review/:token/review-clicked` | Token-only | Beacon-pixel/redirect — sätter `reviewClickedAt` när patient klickar på GBP-länken |

**Säkerhet:**
- Token är `crypto.randomBytes(32).toString('base64url')`, lagrad i case + hashad (SHA-256) i `data/post-op-reviews.json` → public-fältet är hashen, klartext-token bara i URL.
- Rate-limit på `/uppfoljning/*`: 30 req/min/IP.
- Foto-upload: max 5 MB/st, 6 st totalt, content-sniffing (inte bara extension). Strip EXIF (location-data är PII).

### 2.4. Utskick — Microsoft Graph

Återanvänd `src/infra/microsoftGraphSendConnector.js` (redan implementerad). Capability:n returnerar `emailDraft`-objektet, gatewayn persisterar utkastet, operatören får godkänna i CCO-vyn (Fas 1) eller engine skickar auto (Fas 2).

**E-postmall (SV):**
```
Subject: Tack för förtroendet, [förnamn] — får vi se hur resultatet blev?

Hej [förnamn],

Det har gått [X] månader sedan din behandling hos oss. Vi hoppas du är nöjd!

Om du har möjlighet vore vi väldigt tacksamma om du kunde:

1. Ladda upp 1–6 efter-bilder via denna privata länk:
   [reviewLink]

2. (Frivilligt) Lämna ett kort omdöme på Google:
   [GBP_URL]

Bilderna används bara om du själv ger samtycke. Du kan när som helst be oss radera dem.

Tack för förtroendet — det betyder mycket för oss och för andra som funderar på samma resa.

Hair TP Clinic
Vasaplatsen 2, Göteborg
[telefon]
```

EN-version finns men anropas bara om `locale === 'en'`.

### 2.5. UI på `/uppfoljning/[token]`

En enkel single-page-vy (Express renderar HTML från template — INTE ny SPA). Layout:

- Hair TP Clinic-logo + hälsning ("Tack [förnamn]")
- Drag-and-drop foto-upload (max 6 foton, preview-thumbnails, remove-knapp)
- Consent-checkbox: "Jag samtycker till att Hair TP Clinic får använda dessa bilder anonymt på hemsidan och Instagram"
- Fritextfält: "Något du vill säga om resultatet? (frivilligt)"
- Submit-knapp → skickar till `/api/v1/post-op-review/:token/submit`
- Efter submit: tack-skärm + GBP-CTA: "Skulle du också vilja lämna ett kort omdöme på Google?" → klick → beacon till `/api/v1/post-op-review/:token/review-clicked` → redirect till GBP_URL

Inget JS-framework. Vanilla form med fetch. Följer Major Arcana token-system (samma färger/typografi som `arcana.hairtpclinic.se`).

### 2.6. Test

Per AGENTS.md validation-rule:
- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit` — nya unit-tester för capability + store
- `npm run smoke:local` — manuell smoke
- Playwright visual-test för `/uppfoljning/[token]`-sidan (kan piggyback på `playwright.config.js`)

---

## 3. Files to change

**Nya filer:**

```
src/capabilities/requestPostOpReview.js                # ny capability
src/ops/postOpReviewStore.js                          # ny store för data/post-op-reviews.json
src/routes/postOpReview.js                            # ny route-modul (public token-endpoints)
src/routes/ccoFollowUpCompletion.js                   # ny route för cco-operator mark-completed
public/uppfoljning/index.html                         # patient-vy template
public/uppfoljning/uppfoljning.css                    # styling
public/uppfoljning/uppfoljning.js                     # foto-upload + submit-logik
data/post-op-reviews.json                             # initial empty store ({ version: 1, submissions: [] })
docs/architecture/post-op-review-contract-v1.md       # låser kontraktet
docs/ops/post-op-review-runbook.md                    # operatörs-runbook (när trigga, vad förvänta)
tests/post-op-review.test.js                          # unit + integration
```

**Filer som ändras (befintliga, MIN modifierande pass):**

```
src/capabilities/registry.js                          # registrera RequestPostOpReview
src/ops/ccoBookingStore.js                            # ny status follow_up_completed + finalFollowUpCompletedAt + postOpReviewToken
server.js                                             # mounta nya routes (~10 rader)
.gitignore                                            # exkludera data/post-op-photos/
.env.example                                          # nya keys: ARCANA_POST_OP_PHOTO_DIR, ARCANA_POST_OP_TOKEN_TTL_DAYS
docs/major-arcana-index.md                            # länka in nya doc-filer
```

**Totalt diff:** ~1 200 rader ny kod, ~80 rader ändringar i befintliga. Inga befintliga features tas bort eller modifieras destruktivt.

---

## 4. Risks

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | **PII-läckage via foto-EXIF** (lat/long, devicemodel) | Server-side EXIF-strip via `sharp` (redan i node_modules). Test: upload foto med EXIF → assert metadata stripped. |
| R2 | **Token-stöld → någon annan laddar upp bilder** | Token är engångs-länk (TTL 90 dagar default), bunden till bookingCaseId. När submission finns, returnera "redan inlämnad". Logga IP + UA till audit. |
| R3 | **Disk-fyllning** (foton lagras lokalt) | Tre lager: (a) per-submission size-cap 30 MB, (b) cron som rensar foton > 365 dagar gamla där `consentToPublish === false`, (c) cloud-backup-kandidat för Fas 3 (S3). |
| R4 | **GDPR — radering på begäran** | `data/post-op-reviews.json` har redan capability-mönstret från `gdprCustomer.js`. Lägg till `RequestPostOpReview`-handler i gdpr-flowen så delete propagerar till filsystemet. |
| R5 | **Patient ger samtycke i frustration** (felaktigt samtycke) | Consent-checkbox är **default OFF**. Submission funkar utan consent — vi får foton men får inte publicera. Klar separation. |
| R6 | **ExecutionGateway-bypass** | CI har redan `lint:no-bypass`. Capability:n MÅSTE registreras i `registry.js` och anropas via `executionService`. Inga `app.post('/uppfoljning'...) → email` shortcuts. |
| R7 | **Fas 2 auto-trigger triggas felaktigt** (för tidigt) | Fas 1 är 100% manuell (operatör klickar). Fas 2-spec skrivs i separat pass när Fas 1 är live + verifierad. Inga auto-triggers nu. |
| R8 | **Microsoft Graph-failure** (Outlook nere) | Capability-output persisteras som `draft` om send fails. Operatören får en retry-knapp i CCO-vyn. Audit-event `post_op_review_send_failed`. |
| R9 | **Patient-channel "låst" enligt canon** | Major Arcana canon säger "Sist patientkanal, när hårdning och risk är klar". Detta är en LITEN, well-scoped patient-touch. Inte chat, inte beslut, inte AI-genererad text — bara strukturerad uppladdning + statisk länk. Bör räknas som risk-OK enligt P0-checklist (validera med Fazli). |

---

## 5. GO / NO_GO

**Rekommendation: GO för Fas 1-spec, NO_GO för Fas 1-implementation tills Fazli har bekräftat:**

1. **Patient-channel canon-tolkning:** Räknas detta som "patientkanal är öppnad"? Eller är det en transactional touch som inte triggar full patient-channel-policy? (Rimligt att räkna det som transactional — patient initierar inte, vi anropar dem efter slutfört uppdrag).
2. **E-postavsändare:** Skickar vi från `info@hairtpclinic.com` via Microsoft Graph? Bekräfta att domänen är konfigurerad i M365-tenanten (capability-framework använder befintlig Graph-connector).
3. **Foto-retention-policy:** 365 dagar för no-consent, obegränsat för consent — eller annan modell?
4. **CCO-UI:** Vi behöver en knapp "Markera sista uppföljning klar" i `/major-arcana-preview/`. Vem ritar den? Jag kan skicka mock men slutdesign ligger i CCO-UI-passet.

**Om alla 4 är godkända → GO för kod-pass. Tidsuppskattning:**

- 1.5 dag: capability + store + routes + tests (backend)
- 0.5 dag: `/uppfoljning/[token]`-templates (frontend, vanilla)
- 0.5 dag: CCO-UI-knapp (om mockad design redan finns) — annars 1 dag för design + impl
- 0.5 dag: smoke + Playwright + dokumentation

**Total: ~3 dagar för Fas 1, ready-for-staging.**

---

## 6. Validation gate (för code-pass när GO ges)

Per AGENTS.md §Validation:

```bash
npm run check:syntax
npm run lint:no-bypass
npm run test:unit                  # inkl. nya post-op-review.test.js
ARCANA_AI_PROVIDER=fallback \
  ARCANA_GRAPH_READ_ENABLED=false \
  ARCANA_GRAPH_SEND_ENABLED=false \
  npm run smoke:local              # offline smoke
npx playwright test --grep uppfoljning   # visual smoke på /uppfoljning/[token]
```

Definition of Done för code-pass:
- Capability registrerad + executable via gateway
- Token-flow E2E-testad (mark-completed → email → click-link → upload → submit → consent-flagga → GBP-redirect)
- 0 lint-warnings, 0 type-errors
- Audit-trail visar alla 4 capability-events (`run.start`, `run.decision`, `run.persist`, `run.complete`)
- Runbook publicerad i `docs/ops/post-op-review-runbook.md`
- Status-update till `docs/ops/status-2026-05-XX.md` (eller egen entry)

---

## 7. Open questions — BEKRÄFTADE 2026-05-18

1. ✅ **Patient-channel canon-tolkning:** Detta är en **transactional touch**, inte patient-channel-öppning. Skälen: operator-initierat (CCO klickar "Markera klar"), ingen AI-genererad patient-text, statisk e-postmall + statisk uppladdningssida, strukturerad consent. ExecutionGateway + audit + risk-gating körs ändå för säkerhets skull. Räknas som transactional under §canon "AI får generera utkast, men inte publicera själv" — operatören publicerar via en click.

2. ✅ **Avsändar-email:** `contact@hairtpclinic.com` (INTE info@) — verifierad i M365-tenanten. Capability:n hårdkodar `from: 'contact@hairtpclinic.com'` om inte tenant-config säger annat.

3. ✅ **Foto-retention-policy:**
   - Med consent (`consentToPublish === true`): **obegränsat** lagrad tid (tills GDPR-radering begärs av patient eller manuellt rensas av operatör).
   - Utan consent (`consentToPublish === false`): **365 dagar** sedan cron rensar fil. Metadata-rad i `data/post-op-reviews.json` markeras `photosDeletedAt`, behålls för audit.
   - GDPR-radering på begäran: omedelbar full radering oavsett consent-flagga.

   **Consent-formulering (juridisk version):**
   > Ja, jag samtycker till att Hair TP Clinic får använda dessa bilder anonymt
   > i marknadsföring (hairtpclinic.com, Instagram, övriga digitala kanaler).
   > Endast bildutsnitt **från ögonbryn och uppåt** publiceras — inga drag
   > som kan identifiera mig som person. Jag kan när som helst återkalla
   > samtycket genom att kontakta contact@hairtpclinic.com.

   **Publishing-constraint (operator workflow):**
   - Bilder lagras i original (clinical record).
   - Innan publik användning MÅSTE operatör beskära till "ögonbryn och uppåt".
   - Beskuren version sparas separat med suffix `-public.webp`.
   - Endast `-public.webp` får exponeras via publika endpoints/feed.
   - Capability `PublishPostOpPhoto` (separat capability) ska gate:a publish-steget med audit-event `post_op_photo_publish` + manuell crop-bekräftelse.

4. ✅ **CCO-UI-knapp:** Fazli vill ha mock-design (PNG) från DXM-pass innan slutdesign. Levereras i `docs/design-specs/post-op-review-mockups/` parallellt med denna spec.

**Status: alla 4 open questions besvarade → GO för code-pass nästa session.**

---

## 8. Mockups

Två PNG-mockups levereras parallellt med denna spec:

- `docs/design-specs/post-op-review-mockups/cco-mark-followup-completed-button.png` — CCO-operatörs-vyn: ny knapp "Markera sista uppföljning klar" i case-detaljpanelen, varianter (default, hover, after-click).
- `docs/design-specs/post-op-review-mockups/patient-uppfoljning-page.png` — patient-vyn `/uppfoljning/[token]`: hero, foto-upload-zon, consent-checkbox, GBP-CTA, tack-skärm.

Slutgiltig design ritas i CCO-UI-passet när Fazli godkänt mockups.
