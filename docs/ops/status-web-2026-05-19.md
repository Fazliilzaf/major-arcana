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

4.2. **Resend e-postbekräftelse efter reservation är stub.** `POST /reservations` loggar `[public-reservation] web booking by X for slot Y` men skickar inget email. Aktiveras när `RESEND_API_KEY` finns i Render-env + Resend-template skapad.

4.3. **Post-op review & photo flow är design-only.** Spec finns i `docs/strategy/post-op-review-photo-flow.md` — kod är inte implementerad. Behöver kod-pass på 3 dagar för Fas 1 (manual trigger).

4.4. **Inget CAPTCHA/honeypot på POST /reservations.** Rate-limit per IP räcker tills vi ser abuse-mönster.

---

## 5. Nästa tre leveranser

5.1. **Resend-integration för reservation-bekräftelse (2 timmar):**
- Lägg till `from contact@hairtpclinic.com` + locale-aware template ("Vi har reserverat din tid…").
- Trigga från `POST /reservations` när reservation lyckats.
- Audit-event `reservation_confirmation_sent` på CCO-case.

5.2. **Arcana post-op review Fas 1 (3 dagar):**
- `src/capabilities/requestPostOpReview.js` + `src/ops/postOpReviewStore.js` + `src/routes/postOpReview.js`.
- Patient-template på `arcana.hairtpclinic.se/uppfoljning/[token]`.
- M365 Graph send via befintlig connector. Operatör godkänner draft i CCO-vyn.

5.3. **Pre-fill operator-notes från web-leads (1 dag):**
- När operator öppnar en `web_public_reservation`-case ska CCO visa "Patient valde Hårtransplantation som intresseområde" + foton uppladdade via /boka step 4.
- Just nu skickas det med i lead-payload men CCO-vyn renderar det inte tydligt.

---

## 6. Snabb-uppslag

- Webb-repo (lokal): `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Hairtpclinic webb/next-app/`
- Live: `https://hairtpclinic.com` + `https://www.hairtpclinic.com`
- Arcana booking-engine: `https://arcana.hairtpclinic.se/api/public/booking-engine/{catalog,availability,reservations}`
- Webside availability proxy: `https://hairtpclinic.com/api/availability?fromDate=&toDate=`
- Bridge-doc: `docs/strategy/web-to-arcana-bridge.md`
- Föregående status: `docs/ops/status-web-2026-05-18.md`
- Nästa status: `docs/ops/status-web-2026-05-26.md` (planerad)
