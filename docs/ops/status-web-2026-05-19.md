# hairtpclinic.com — nuläge och nästa leveranser

Datum: 2026-05-19
Syfte: Veckovis status för den publika webben. Föregående: `status-web-2026-05-18.md` (EN-paritet + Performance-foundation + Workstream A klar).
Detta dokument täcker Workstream B (tillgänglighet), Workstream C (smart engagement) samt bundle-analyzer-verifiering.

Masterplan: `docs/strategy/web-hairtpclinic-com-masterplan.md`.

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
| Visuell smoke | Ej körd i denna session — kör efter Vercel preview |

---

## 2. Sprint 2026-05-18 (sen-kväll → 05-19) — vad som levererades

### 2.1 Bundle-analyzer + tree-shake-verify

- `@next/bundle-analyzer` v15 installerad som devDependency.
- `next.config.mjs` wrappad med `withBundleAnalyzer` (aktiveras med `ANALYZE=true`).
- `package.json` fick `"analyze": "ANALYZE=true next build"`.
- **Verifierad besparing**: 34 unika lucide-icons importeras. Hela paketet är 33 MB. I production-bundle är allt lucide-relaterat 9 KB — `optimizePackageImports: ['lucide-react']` fungerar exakt som planerat.

### 2.2 Workstream B — tillgänglighet & img→Image

- **Alt-attribut**: korrigerad audit visar 0 saknade `alt`-attribut (den initiala "22 saknade"-siffran var false-positive från en naïv regex).
- **Native `<img>` → `<Image>`** konverterat på 4 nyckelfiler:
  - `app/om-oss/page.tsx` (founder photo, feature-2.webp)
  - `app/en/about/page.tsx` (samma EN-spegel)
  - `components/Footer.tsx` (IVO-logo)
  - `components/BeforeAfterGallery.tsx` (alla 23 patient-thumbs, viktigast — auto AVIF + lazy-load)
- **Inputs utan label**: 4 förmodade issues vid statisk audit, alla false-positives (varje input har `<label>`-wrapper eller `aria-label`).
- Övriga 14 native `<img>` är SVG-logos (ingen vinst med Image) eller dynamic blob URLs (måste vara native) — dokumenterat i auditen, inget åtgärdsbehov.

### 2.3 Workstream C — smart engagement

**C.1 AI Pre-konsultationschatt:**
- `/api/chat` — Claude Haiku 4.5-baserad route med system-prompt (SV + EN) som täcker klinik-info, behandlingar, fastpriser, vanliga frågor + 6 hårda säkerhetsregler (aldrig diagnostisera, aldrig garantera, hänvisa medicinska frågor till konsultation).
- `components/ChatWidget.tsx` — flytande chat-bubble i botten-höger (bredvid WhatsApp-float). Locale-aware. Mobile-first (fullscreen på <640px, 380×640px-panel på desktop). Auto-greeting vid öppning. Typing-indicator under loading. GA4-events: `chat_opened`, `chat_message_sent`, `chat_error`, `chat_closed`.
- Dölj på `/boka`, `/tack`, `/kontakt` (och EN-equivalents) — där ska användaren fokusera på formuläret.
- Mock-läge utan `ANTHROPIC_API_KEY`. Live så fort key finns i `.env.local`.
- Inkopplad i `app/layout.tsx`.

**C.2 Treatment-matcher quiz:**
- `components/ui/TreatmentMatcher.tsx` — 5-stegs quiz: mål, duration, omfattning, tidigare behandlingar, tidsram → rekommendation (FUE/DHI / PRP / Microneedling+PRP / Konsultation).
- Rekommendations-logik baserad på etablerade kliniska riktlinjer (`recommend()`-funktion).
- Locale-aware (SV + EN-versioner av frågor + alla rekommendations-texter).
- Inkopplad på `/boka` som collapsible "Inte säker? Gör vår 1-minuts quiz"-bubble ovan stepper.
- Inkopplad på `/en/book` med `MATCHER_TO_EN_SERVICE`-mappning (SV-keys → EN-keys).
- När quizen är klar: pre-fyller `service`, hoppar till step 2, smooth-scroll till `#booking-form`.
- GA4-events: `treatment_matcher_answer`, `treatment_matcher_complete`, `treatment_matcher_cta_book`.

**C.3 WhatsApp deep-link med context per sida:**
- `WhatsAppFloat`-refactor: använder `usePathname` för per-sida pre-fill.
- 13 path-matchers med fallback. SV + EN.
- Exempel: `/prp-hud` → "Hej! Jag är intresserad av PRP för hud — kan ni berätta mer?"
- `/en/eyebrow-transplant` → "Hi! I'm interested in an eyebrow transplant — could you tell me more?"
- Stad-sidor (`/stader/*`) → "att resa till er klinik" / "traveling to your clinic"

---

## 3. Definition of Done för denna sprint

3.1. ✓ Bundle-analyzer aktiverad + tree-shake verifierad.
3.2. ✓ Tillgänglighet (alt + img→Image på prioriterade ytor).
3.3. ✓ AI-chatt live (mock-läge utan key, live med key).
3.4. ✓ Treatment-matcher live på både SV och EN.
3.5. ✓ WhatsApp deep-link kontext-aware på alla sidor.
3.6. ✓ 0 TypeScript-fel i ny kod.

---

## 4. Open issues / blockers

4.1. **Build inte verifierad i denna session.** `next build` timeoutar i sandbox-miljön (45s). Fazli behöver köra `npm run build` lokalt på Mac innan första production-deploy. Förväntat resultat: OK + alla sidor genererade.

4.2. **AI-chatt + AI Hair Analyzer i mock-läge** tills `ANTHROPIC_API_KEY` är satt i `.env.local`. Snabb sanity-check: starta `npm run dev`, öppna chatten, fråga "Vad kostar FUE för 2 500 grafter?" — mock returnerar canned response, live returnerar Claude-genererat svar.

4.3. **Resend för PDF-guide-utskick** fortfarande i mock-läge tills `RESEND_API_KEY` är satt + domän-verifierad på resend.com + Resend-import avkommenterad i `/api/lead`.

4.4. **iCloud `.next/types/* 2.ts`-duplikater** kvarstår — Fazli behöver `rm -rf .next` lokalt en gång för att städa.

---

## 5. Nästa tre leveranser (per masterplan Workstream D + verifierings-pass)

5.1. **Workstream D — Bokning & lead-pipeline (1–2 veckor):**
- Cliento/Bokadirekt-integration för live availability på service-sidor.
- CRM-integration (HubSpot/Pipedrive) med automatisk lead-scoring (A/B/C-leads baserat på foton + komplett form + service-typ).
- Resend e-postsekvens (bekräftelse → 24h-påminnelse → "vad händer på konsultationen?" → uppföljning efter).
- Arcana ExecutionGateway-bridge för CCO-mottagning med risk-gating + audit.

5.2. **Pre-deploy smoke + Vercel-preview (1 dag):**
- Lokal `npm run build` på Mac.
- Vercel preview-deploy.
- Visuell smoke på 10 nyckelsidor (start, /boka, /priser, /hartransplantation, /prp-hud, /fore-efter + EN-speglar).
- Lighthouse-poäng dokumenterade.

5.3. **Workstream E — Mätbarhet (löpande):**
- A/B-testramverk (GrowthBook eller Vercel Edge Config).
- Live Google Reviews-pull via Google Places API.

---

## 6. Snabb-uppslag

- Repo (lokal): `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Hairtpclinic webb/next-app/`
- Masterplan: `docs/strategy/web-hairtpclinic-com-masterplan.md`
- Föregående status: `docs/ops/status-web-2026-05-18.md`
- .env-mall: `next-app/.env.example`
- Bundle-rapport: `npm run analyze` → `.next/analyze/client.html` + `nodejs.html`
- AI-chatt endpoint: `next-app/app/api/chat/route.ts`
- Treatment-matcher: `next-app/components/ui/TreatmentMatcher.tsx`
- WhatsApp deep-link: `next-app/components/WhatsAppFloat.tsx`
- Nästa status: `docs/ops/status-web-2026-05-26.md` (planerad)
