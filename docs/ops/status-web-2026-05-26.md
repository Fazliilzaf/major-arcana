# hairtpclinic.com + Arcana CCO — status 2026-05-26

> **Historisk snapshot.** Aktuell prod: `arcana` (Frankfurt) · https://arcana.hairtpclinic.com. Oregon-tjänsten raderad 2026-06-06.

Datum: 2026-05-26 (planerad publicering; skissat 2026-05-19 efter sista
rundan av leveranser)
Föregående: `status-web-2026-05-19.md` (runda I bridge + Fas A/B/C; runda
II + III + IV täcks här)

Masterplan: `docs/strategy/web-hairtpclinic-com-masterplan.md`
Bridge-kontrakt: `docs/strategy/web-to-arcana-bridge.md`

---

## 1. Snabbverifiering

```bash
# Arcana live service (DNS-mål för arcana.hairtpclinic.se)
curl -sS https://arcana.hairtpclinic.se/api/public/status
curl -sS https://arcana.hairtpclinic.se/api/v1/_diag/env

# Webb bridge (returnerar cco_engine + mocked:false när Arcana är upp)
curl -sS "https://hairtpclinic.com/api/availability?fromDate=2026-05-26&toDate=2026-06-01"

# Pre-commit regression-guard
bash bin/pre-commit-cco.sh  # ska visa step 4/4 PASS

# Arcana booking-engine
curl -sS "https://arcana.hairtpclinic.se/api/public/booking-engine/catalog?host=hairtpclinic.com"
```

### Resultat 2026-05-19 sen-natt

| Steg                                             | Utfall                                           |
| ------------------------------------------------ | ------------------------------------------------ |
| `curl /api/public/status` (live)                 | 200 — service uppe, uptime varierar pga OOM-loop |
| `curl /api/public/booking-engine/catalog`        | 200 — 9 services, riktigt Hair TP-team           |
| `curl /api/availability` proxy                   | `provider: cco_engine, mocked: false, 18 slots`  |
| `curl POST /api/lead { ... arcana:{slot} }`      | `{ok:true, arcana:{caseId, reservationId}}`      |
| E2E disk-verifiering (Render shell)              | 17 web-cases, leadContext:true på samtliga       |
| Patient-UI `/uppfoljning/:token` med foto-upload | Live, photoCount:1 efter test                    |

---

## 2. Sprint 2026-05-19 sen-natt — runda II + III + IV

Detta är den stora leveransen sedan föregående status. Sammanlagt 14 nya
tasks från runda II (3) + runda III (4) + runda IV (4) + cleanup (3).

### 2.1 Runda II — Webb→CCO bridge live + regression-guard

**Task #100** — `/api/lead` vidarekopplar till Arcana CCO när slot finns:

- `next-app/app/api/lead/route.ts` fick `forwardToArcana()`-helper som
  POSTar till `/api/public/booking-engine/reservations` med
  `{contact, slot, consent, locale}`.
- 10s timeout, try/catch — om Arcana är nere bryts inte lead-flowet.
- Response inkluderar `arcana: { caseId, reservationId } | null`.

**Task #103** — Tyst regression hittad + fixad:

- Cursor-commit `d82d515` ("Fas 27E asset pipeline") hade skrivit över
  server.js från gammal snapshot och raderat
  `createPublicBookingEngineRouter` + `createPostOpReviewRouter`-mountingen.
- Båda återställdes via commits `3e87551` + `0d3bd47`.
- Verifierat: catalog/availability/reservations alla 200, `/uppfoljning/:token`
  renderar correct.

**Task #104** — Regression-guard:

- `bin/pre-commit-cco.sh` step [4/4] failar nu commit om mounts saknas.
- Pre-commit hook redan symlinkad `.git/hooks/pre-commit → bin/pre-commit-cco.sh`.
- Verifierat: tar bort `createPublicBookingEngineRouter` → step 4 failar.

### 2.2 Runda III — Photo-upload + Cron + HEIC + CCO thumbnails

**Task #106** — Cron för `pruneNoConsentPhotos`:

- `src/ops/scheduler.js` fick `runPostOpPhotoPrune`-funktion + job-entry
  (24h-interval default).
- Anropar `postOpReviewStore.pruneNoConsentPhotos({ttlDays:365})` + raderar
  disk-filer.
- GDPR-skyldighet: foton från patient utan publicerings-consent raderas
  automatiskt 12 mån efter submit.

**Task #107** — HEIC/HEIF photo-support:

- `public/uppfoljning/index.html` laddar `heic2any@0.0.4` från CDN async.
- File-picker accepterar `.heic/.heif`.
- JS konverterar HEIC → JPEG i browsern innan upload.
- "Konverterar iPhone-bild…" placeholder i chip-listan medan libheif jobbar.

**Task #108** — Thumbnails i CCO Booking Request-kort:

- `src/routes/postOpReview.js`: 2 nya auth-protected endpoints:
  - `GET /api/v1/cco-bookings/:caseId/post-op-photos` (metadata-array)
  - `GET /api/v1/cco-bookings/:caseId/post-op-photos/:photoId` (stream)
- Tenant-scoped + photoId-validering.
- `public/major-arcana-preview/app.js` har `renderPostOpThumbnails(thread)`
  som fetchar + renderar 96×96-grid i ny section.

**Task #102** (klart i runda III, redovisas igen) — multer + piexifjs photo-upload:

- POST `/api/v1/post-op-review/:token/photos` (multer.array, memoryStorage).
- JPEG → `piexif.remove()` strippar EXIF, PNG passar igenom.
- Storage: `<config.postOpPhotosDir>/<submissionId>/<photoId>.{jpg,png}` mode 0600.

### 2.3 Runda IV — M365 Graph send + lead-context + service cleanup

**Task #109** — M365 Graph auto-send för post-op review:

- `postOpReview.js` tar `graphSendConnector`; om `patientEmail` finns i
  body skickas emailDraft via Graph sendMail istället för copy-paste.
- Idempotent: kollar `submission.sentAt`, anropar `markSent()` efter lyckad send.
- Faller tillbaka till copy-paste-flow vid 4 case (no graph, no email,
  operator skipped, submission existed).
- CCO frontend skickar `patientEmail` från thread; feedback-bannret skiljer
  📤 (auto) vs 📋 (copy-paste).

**Task #110** — Web-lead context i CCO Booking-vyn:

- Webb-side: `forwardToArcana` skickar `leadContext` med 10 fält
  (service, healthYes, healthNotes, timeWindow, country, city, languagePref,
  photos, marketingConsent, submittedAt).
- Arcana: sanitiserar med whitelist + size-limits, sparar i
  `web_public_reservation`-eventets metadata.
- CCO: ny `🌐 Web-formulär`-section i booking-surface med dl-grid; SV-labels
  för service/timeWindow; hälsodeklaration-ja markerade med warning-färg.

**Task #111** — Disk-persistence fantom-bug:

- POST /api/lead returnerade success med caseId men disk-check visade inga
  nya cases.
- Rotorsak: **två Render-services** (arcana-3pji = live, arcana-cco-mmcd =
  dashboard-default). Vi tittade på fel disk hela tiden.
- Sparat som memory `project_arcana_two_render_services.md`.
- Fix: konfirmerade att live-disk (`/var/data/arcana/cco-bookings.json` på
  arcana-3pji) har **115 cases, 17 web-cases, leadContext:true** på alla.

**Task #112** — Suspended arcana-cco-mmcd duplicate-service:

- Custom Domains-fliken bekräftade inga production-domains attached.
- Suspend via dashboard ("sudo suspend web service arcana-cco" confirmation).
- Sparar ~$25/mån.
- Resume-knapp finns kvar — kan reaktiveras vid behov.

### 2.4 Runda V — OOM-fix + cleanup

**Task #114** — Major-arcana OOM SIGABRT 134-loop:

- Återkommande "Exited with status 134" i events-loggen.
- Diagnos: bootstrap laddar för många mailbox-messages i ETT svep.
- Fix: satte `ARCANA_BOOTSTRAP_MAILBOX_LOOKBACK_DAYS=7` (från 90 default)
  via Render env vars → minskar startup-RAM ~13×.
- Deploy triggas automatiskt på env-var save.

**Task #115** — Cleanup test-submission:

- Raderade submission `8e09aacd-…` (E2E thumbnail-test) från
  `/var/data/arcana/post-op-reviews.json` + tillhörande foto-dir.

---

## 3. Definition of Done

3.1. ✓ Webb→Arcana CCO bridge: lead-payload med slot skapar reservation.
3.2. ✓ Tyst regression hittad + fixad (Fas 27E-blunder).
3.3. ✓ Regression-guard i pre-commit catchar `createPublicBookingEngineRouter` +
`createPostOpReviewRouter` borttagning.
3.4. ✓ GDPR-cron raderar foton utan consent 12 mån efter submit.
3.5. ✓ HEIC/HEIF accepteras via heic2any-konvertering i browser.
3.6. ✓ Operator-thumbnails i CCO Booking Request-kort.
3.7. ✓ M365 Graph auto-send för post-op email (med copy-paste fallback).
3.8. ✓ Web-lead context renderas i CCO `🌐 Web-formulär`-section.
3.9. ✓ Två Render-services dokumenterade; mmcd suspended.
3.10. ✓ Bootstrap-OOM mitigerad via 7-dagars lookback.

---

## 4. Open issues / blockers

4.1. **Major-arcana OOM mitigation behöver verifieras.** Status 134-loopen
har varit aktiv hela dagen. Lookback från 90 → 7 dagar borde fixa, men kräver
flera timmars stabil drift för att bekräfta. Om OOM kvarstår: bumpa till Pro+
plan (8GB), eller dela bootstrap i chunks.

4.2. **E2E visuell verifiering av CCO-thumbnails inte gjord.** Photo-upload
verifierat på disk (photoCount:1) men render i Booking Request-kortet inte
visuellt verifierat pga OOM-instabilitet. Kod-walkthrough ok.

4.3. **Sjuksköterskor inte bookable än.** Per Fazli "håll teamet åt sidan".
Beslut om PRP-scope (självständigt vs assistans) krävs innan vi lägger till
dem som resources.

4.4. **Cron `pruneNoConsentPhotos` aldrig manuellt triggrad.** Kommer fire
första gången 24h efter deploy. Verifiering: kolla
`scheduler.jobs.post_op_photo_prune` via `/api/v1/scheduler/status` (om
operatör-auth tillgänglig).

4.5. **arcana-cco-mmcd Resume-status.** Suspended men inte deleted — kan
återaktivera. Bestäm om 2 veckor om vi ska delete eller behålla som backup.

---

## 5. Commit-trace runda II + III + IV (2026-05-19)

Webb-repo (`Fazliilzaf/hairtpclinic-web`):

- `8f656fd` feat(lead): forward web bookings to Arcana CCO when slot picked
- `f2a3b0e` feat(lead): forward rik leadContext till Arcana CCO

Arcana-repo (`Fazliilzaf/major-arcana`):

- `3e87551` fix(server): restore publicBookingEngine mounting
- `0d3bd47` fix(server): restore postOpReview mount + add regression-guard
- `4111dfe` feat(post-op-review): photo-upload Fas 1.B (multer + piexifjs)
- `b68b65f` feat(cco-shell): "Markera uppföljning klar"-knapp i booking-workspace
- `0aa982a` feat(post-op): cron + HEIC + CCO thumbnails (runda III)
- `0a1bf6c` feat(post-op,cco): M365 Graph auto-send + web-lead context (runda IV)

Total: 6 arcana-commits + 2 webb-commits = 8 commits, ~1400 insertions netto.

---

## 6. Snabb-uppslag

- Webb-repo (lokal): `hairtpclinic-web (extern Next.js-repo, Vercel) — `
- Live: `https://hairtpclinic.com` + `https://www.hairtpclinic.com`
- Arcana booking-engine: `https://arcana.hairtpclinic.se/api/public/booking-engine/{catalog,availability,reservations}`
- Arcana post-op review: `https://arcana.hairtpclinic.se/api/v1/post-op-review/:token/{lookup,submit,photos,review-clicked}`
- Arcana operator thumbnail: `https://arcana.hairtpclinic.se/api/v1/cco-bookings/:caseId/post-op-photos`
- Webside availability proxy: `https://hairtpclinic.com/api/availability?fromDate=&toDate=`
- Bridge-doc: `docs/strategy/web-to-arcana-bridge.md`
- Föregående status: `docs/ops/status-web-2026-05-19.md`
- Service inventory: live = `arcana-3pji.onrender.com` (srv-d6b11o0boq4c73chm7f0,
  custom domain `ma.hairtpclinic.se` + DNS för `arcana.hairtpclinic.se`).
  Suspended: `arcana-cco-mmcd.onrender.com` (srv-d7k8df7avr4c73d3v2eg).

---

## 7. Veckans fokus (2026-05-26 → 2026-06-02)

7.1. **Verifiera OOM-fix håller** — minst 3 dagar stabilt utan status 134.
7.2. **Visuell E2E thumbnail-render** — Fazli loggar in operatör + testar
på riktig PRP-tråd.
7.3. **Veronica/Clara/Wendela/Louise bookable** — beslut om scope (PRP
självständigt vs assistans) + lägg in som resources i
ccoBookingEngineStore.
7.4. **Photo-thumbnail E2E med riktig HEIC** — iPhone-användare laddar
upp via patient-UI, verifierar att heic2any-konvertering går igenom.
7.5. **Cron `pruneNoConsentPhotos` triggred minst en gång** — verifiera
audit-log + att disk-foton faktiskt raderas.

---

## 8. Render-services inventory (2026-05-19 läge)

| Service      | URL                          | Plan     | Status                 | Roll                                                    |
| ------------ | ---------------------------- | -------- | ---------------------- | ------------------------------------------------------- |
| major-arcana | arcana-3pji.onrender.com     | Pro      | ACTIVE (OOM-mitigated) | DNS-mål för arcana.hairtpclinic.se + ma.hairtpclinic.se |
| arcana-cco   | arcana-cco-mmcd.onrender.com | Standard | SUSPENDED 2026-05-19   | Duplicate, ingen custom domain                          |

Båda autodeployar från `Fazliilzaf/major-arcana` main. Suspendning av mmcd
påverkar inte produktion.
