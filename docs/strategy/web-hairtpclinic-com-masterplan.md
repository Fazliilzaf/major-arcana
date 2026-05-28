---
owner: CMO
status: active
---

# Hair TP Clinic Webb (hairtpclinic.com) — Punktvis Masterplan

Skapad: 2026-05-18
Syfte: Binda ihop den publika klinikwebben (hairtpclinic.com, Next.js 15 App Router) med Major Arcana-strukturen så att webb-arbetet kan drivas från samma command center som Arcana-core, CCO och övriga workstreams.
Källor: `docs/strategy/arcana-master-plan-punktvis.md` (mall för punktvis-format), `docs/major-arcana-index.md` (läsordning), aktuell webb-audit 2026-05-18.
Repo: separat — `hairtpclinic-web (extern Next.js-repo, Vercel) — `. Deploy: Vercel (hairtpclinic.com).

---

## 0. Kompass (en mening)

0.1. "Hemsidan är klinikens publika ansikte — den ska konvertera intresserade till bokade konsultationer på en medicinskt trovärdig grund, utan att kompromissa med patientsäkerhet eller varumärke."

0.2. Sly-målet bakom kompassen: "Varje besökare ska kunna gå från första klick till bindande fastpris-bokning med så lite friktion som möjligt — och om de inte ska boka ännu, ska de ha fångats som lead för senare uppföljning."

---

## 1. Plats i Arcana-ekosystemet

1.1. **Tre samverkande ytor:**
- 1.1.1. `hairtpclinic.com` — publik webb (denna masterplan). Konvertering, SEO, content.
- 1.1.2. `arcana.hairtpclinic.se` — intern Arcana-plattform. Drift, CCO, agenter, mail-triage.
- 1.1.3. `cliento.com/hairtpclinic` — extern bokningsmotor (idag). Framtida: Arcana-egen booking.

1.2. **Datariktning idag:** webb → /api/lead (Next.js route) → mail till klinik. Ingen direkt Arcana-koppling ännu.

1.3. **Datariktning mål:** webb → /api/lead → Arcana ExecutionGateway → CCO-inbox med risk-gating, audit och draft-svar.

1.4. **Domäner är fredade:** `arcana.hairtpclinic.se` rörs aldrig från detta repo. Webb-deploy går via Vercel och påverkar inte Render-instansen.

---

## 2. Icke-förhandlingsbara designval

2.1. **Locale-paritet (sv-SE / en):**
- 2.1.1. Varje SV-sida har en EN-spegel. Hreflang-tags i layout + sitemap.
- 2.1.2. Inga blandade locale-strängar — `HeaderEn`/`PageHeroEn` etc. som thin wrappers över locale-aware kärnkomponenter.
- 2.1.3. Knappar och CTA pekar konsekvent på rätt locale-route (`/boka` vs `/en/book`).

2.2. **Patientsäkerhet och medicinsk trovärdighet:**
- 2.2.1. Ingen påstådd diagnos, garanti eller AI-utan-disclaimer.
- 2.2.2. Lagstadgad 7 dagars betänketid syns på relevanta sidor.
- 2.2.3. IVO-anmält + Folksam-försäkring exponeras tydligt i footer + om-oss.
- 2.2.4. AI Hair Analyzer (POC) — patienten samtycker explicit innan upload; resultatet märks som estimat, ej diagnos.

2.3. **Konvertering före estetik (men inte istället):**
- 2.3.1. Varje sida har minst en synlig CTA above the fold + en sticky-mobile-bar för långa scrolls.
- 2.3.2. Booking-formuläret minimerar steg innan kontaktdata samlas in.
- 2.3.3. Trust-signaler (1 500+ behandlingar, 4.9★, sedan 2014) på alla landing pages.

2.4. **Prestanda som SEO-grund:**
- 2.4.1. Self-hosted fonts (next/font) — aldrig render-blocking @import.
- 2.4.2. AVIF/WebP-format för alla stora bilder.
- 2.4.3. Above-the-fold-bilder har explicit `priority`-prop.
- 2.4.4. Mobile-first deviceSizes i next.config.

2.5. **GDPR och spårbarhet:**
- 2.5.1. Cookie-consent gate framför GA4 + Microsoft Clarity.
- 2.5.2. Allt lead-arbete loggas i `/api/lead` (framtid: Arcana audit-log).

---

## 3. Pilot 1 — vad som levererats (sprint 2026-05-15 → 2026-05-18)

3.1. **EN-paritet (full):** Alla 13 huvudsidor på engelska med samma struktur, ton och visuella språk som SV-versionen.
- 3.1.1. hair-transplant, dhi-method, beard-transplant, eyebrow-transplant
- 3.1.2. prp-hair, prp-skin, microneedling
- 3.1.3. pricing, before-after, about, about-hair-loss

3.2. **Performance-pelaren:**
- 3.2.1. next/font/google migration — Cormorant Garamond, Inter, Plus Jakarta Sans self-hosted med `display: swap`.
- 3.2.2. PNG-batch → AVIF (-95 %) + WebP (-91 %). 4.5 MB → 244 kB AVIF totalt.
- 3.2.3. `next.config.mjs` förbättringar: `optimizePackageImports: ['lucide-react']`, mobile-first deviceSizes, 1-års cache.
- 3.2.4. Hero-bilder verifierade med `priority`-prop.

3.3. **Konverterings-pelaren:**
- 3.3.1. `StickyMobileCta` — locale-aware bottom-bar med Ring/Boka/WhatsApp, scroll-driven, safe-area för iPhone.
- 3.3.2. `ExitIntentPopup` — desktop mouseleave-trigger, GDPR-text, max 1×/30 dagar via localStorage.
- 3.3.3. `BeforeAfterSlider` — drag-handle med tangentbord, ARIA `role="slider"`. 23 par splittade via `scripts/split-before-after.mjs`. Live på `/fore-efter` + `/en/before-after`.
- 3.3.4. `PriceCalculator` — Norwood × område × teknik → instant prisintervall. GA4 event `price_calculator_cta`. Live på `/priser` + `/en/pricing`.

3.4. **AI-pelaren (POC):**
- 3.4.1. `HairAnalyzer` UI — upload 1–3 foton, consent-gate, preview/remove.
- 3.4.2. `/api/analyze-hair` Claude Vision-route — strukturerad JSON-prompt (Norwood/Ludwig + grafts + pris + tekniker + notes). Locale-aware (sv/en).
- 3.4.3. Auto mock → live så fort `ANTHROPIC_API_KEY` finns. `@anthropic-ai/sdk` v0.96 installerat.
- 3.4.4. Live på `/hartransplantation` + `/en/hair-transplant`.

3.5. **Email-pelaren:**
- 3.5.1. PDF-guider på SV + EN ("7 saker att veta innan din hårtransplantation") — content/guide/*.md.
- 3.5.2. `scripts/build-guide-pdf.py` — reportlab-baserad generator (3 sidor, brand-bar, A4).
- 3.5.3. `/api/lead` utvidgad med `type: 'pdf-guide'`-branch + Resend-stub.

3.6. **Verifierat:** 0 TypeScript-fel utöver stale iCloud-duplikater i `.next/types/`.

---

## 4. Phase 2 — låst prioriteringsordning

Phase 2 körs sekventiellt. Varje workstream har egen Definition of Done. Inga parallella sprintar för samma pelare.

### Workstream A — SEO & strukturerad data (1 vecka)

- 4.A.1. **Dynamisk sitemap för artiklar** — iterera `lib/articles.ts` så varje slug listas i sitemap. Samma för `/stader/[stad]`.
- 4.A.2. **Local Business JSON-LD per stad** — `/stader/[stad]/page.tsx` får eget `@type: LocalBusiness` med justerad `areaServed` + `geo`.
- 4.A.3. **Speakable Schema på FAQ-sidor** — för voice-search (Siri/Alexa). 8-rads `@type: SpeakableSpecification` per FAQ.
- 4.A.4. **Schema-utvidgningar** — `VideoObject` (testimonial-videor när de finns), `HowTo` (`/eftervard`), `Article` (artiklar), `MedicalCondition` (`/om-haravfall`).
- 4.A.5. **`noindex` på `/tack`** + andra konverterings-confirmation-sidor (dubbel garanti utöver robots.txt-disallow).

**DoD:** Search Console rapporterar nya JSON-LD-typer som valid. Lighthouse SEO ≥98 på alla huvudsidor.

### Workstream B — Tillgänglighet & UX-polish (3 dagar) — ✓ LEVERERAD 2026-05-19

- 4.B.1. ✓ "22 saknade alt-attribut" var false-positive i ursprungs-audit (naïv regex). Korrekt JSX-parser visar 0 saknade.
- 4.B.2. ✓ 4 native `<img>` → `<Image>` (om-oss founder, en/about founder, Footer IVO-logo, BeforeAfterGallery 23 thumbs). Övriga är SVG-logos eller dynamic blob URLs där `<Image>` inte ger vinst.
- 4.B.3. ✓ Statisk WCAG-audit: 0 verkliga input-issues (alla har label/aria-label). Browser-baserad axe-core-run rekommenderas vid Vercel preview.
- 4.B.4. ✓ Sticky-mobile-CTA har `paddingBottom: env(safe-area-inset-bottom)` + `visibility:hidden` toggle (axe-core-säker).

**DoD:** 0 input-violations vid statisk audit. Browser-test med axe-core körs vid första preview-deploy.

### Workstream C — Smart engagement (1 vecka) — ✓ LEVERERAD 2026-05-19

- 4.C.1. ✓ **AI Pre-konsultationschatt** — `/api/chat` med Claude Haiku 4.5 + system-prompt (SV+EN) med 6 säkerhetsregler. `ChatWidget`-komponent locale-aware, mobile-first, dölj på konverteringssidor.
- 4.C.2. ✓ **Quiz: "Vilken behandling passar mig?"** — `TreatmentMatcher` 5-stegs, locale-aware, rekommendations-logik från kliniska riktlinjer. Inkopplad som collapsible pre-step på både `/boka` och `/en/book` med URL-param-pre-fill (`?service=X`).
- 4.C.3. ✓ **WhatsApp deep-link med kontext** — `WhatsAppFloat` med `usePathname` + 13 path-matchers. Per-sida pre-fill SV+EN.

**DoD:** Chatbot kör live när `ANTHROPIC_API_KEY` är satt. Quiz tillgänglig på båda locale. WhatsApp pre-fyller meddelandet baserat på besökarens sida.

### Workstream D — Bokning & lead-pipeline (1–2 veckor)

- 4.D.1. **Live availability + en-klick-bokning** — visa nästa lediga konsultationstid direkt på service-sida. Cliento eller Bokadirekt-integration.
- 4.D.2. **CRM-integration + lead scoring** — HubSpot/Pipedrive. A-lead (foton + komplett form) / B-lead / C-lead.
- 4.D.3. **E-postsekvens efter booking** — bekräftelse → påminnelse 24h innan → "Vad händer på konsultationen?" → uppföljning. Resend-baserad.
- 4.D.4. **Bridge till Arcana** — `/api/lead` POST'ar parallellt till Arcana ExecutionGateway (ny endpoint) för CCO-mottagning med risk-gating + audit.

**DoD:** no-show rate < 15 %. Lead-scoring synlig i CRM. Arcana CCO-inbox tar emot webb-leads med audit-trail.

### Workstream E — Mätbarhet (löpande)

- 4.E.1. ✓ **Aktivera bundle-analyzer** — `@next/bundle-analyzer` aktiverad 2026-05-19. `npm run analyze`-script. Verifierad: lucide-react 33 MB → 9 KB i bundle (-99,97 %).
- 4.E.2. **A/B-testramverk** — GrowthBook eller Vercel Edge Config för datadriven CTA/pris/hero-optimering.
- 4.E.3. **Live Google Reviews-pull** — Google Places API var 24h. Auto-uppdaterad schema markup.

**DoD:** A/B-test körs på minst 2 CTAs samtidigt. Reviews uppdateras automatiskt.

### Workstream F — Långsiktigt (Phase 3-kandidater)

- 4.F.1. **PWA + push-notiser** — service worker. Uppföljnings-påminnelser ("6 månader sen, dags för nästa PRP").
- 4.F.2. **AI summarizer per artikel** — Claude-genererad bullet-summary för busy patienter.
- 4.F.3. **WordPress-mall för patientinformation** (om vi behåller WP-delen — se `docs/wordpress/hairtpclinic-patientinformation-wordpress.md`).

---

## 5. Definition of Done — globalt

5.1. **TypeScript:** 0 fel utanför stale `.next/types/`-duplikater.
5.2. **Lighthouse Performance:** ≥85 mobil, ≥95 desktop på alla huvudsidor.
5.3. **Locale-paritet:** ingen ny SV-feature merges utan att EN-spegeln är committed samtidigt.
5.4. **A11y:** axe-core 0 violations.
5.5. **SEO:** alla nya sidor har metadata + JSON-LD + sitemap-entry.
5.6. **Analytics:** GA4 events för alla konverteringspunkter + Clarity-recording-friendly.

---

## 6. Go/No-Go-kriterier för deploy

6.1. **Måste-grön före production-deploy:**
- 6.1.1. `tsc --noEmit` rent.
- 6.1.2. Build lyckas (`next build`).
- 6.1.3. Visuell smoke på 5 nyckelsidor.
- 6.1.4. Locale-paritet (om SV ändrats, EN ändrad eller dokumenterat varför inte).

6.2. **Måste-stoppa om:**
- 6.2.1. Markus-placeholder (eller annan påhittad person) hittas — IVO-risk.
- 6.2.2. Klinikens kontaktuppgifter (telefon/adress) avviker från `lib/contact.ts`.
- 6.2.3. Cookie-consent-bannern inte renderas.

6.3. **Får-merge med varning:**
- 6.3.1. Lighthouse-poäng tappat <5 punkter.
- 6.3.2. Bundle-storlek ökat <10 %.

---

## 7. Kopplingspunkter till Arcana (framtid)

7.1. **Webb-lead → Arcana CCO** — `/api/lead` skickar parallellt till Arcana ExecutionGateway (planerad endpoint). Patient hamnar i CCO-inbox med risk-classification.

7.2. **Arcana booking → webb-bekräftelse** — om Arcana får egen booking-motor (ersätter Cliento), webben pollar slot-availability via Arcana-API.

7.3. **Arcana audit-log → webb-events** — webb-events (formulär-submit, AI-analys, exit-intent) loggas till samma audit-trail som Arcana för regulatorisk spårbarhet.

7.4. **Tenant-isolation:** webben pratar BARA med `hair-tp-clinic`-tenanten i Arcana. Om Arcana white-labelas till andra kliniker behöver varje få egen webb-deploy.

---

## 8. Domain-respekt (gränser mot existing system)

8.1. `arcana.hairtpclinic.se` ändras aldrig från detta webb-repo. Säkrare separation av deploy + permissions.

8.2. `arcana-staging.onrender.com` är Arcanas staging — webben har egen staging på Vercel preview.

8.3. WordPress-versionen av hairtpclinic.se (legacy) ersätts av Next.js. Migration-plan i separat dokument vid avveckling.

---

## 9. Snabb-uppslag

- Repo (lokal): `hairtpclinic-web (extern Next.js-repo, Vercel) — `
- Live (planerad): `https://hairtpclinic.com` + `https://www.hairtpclinic.com`
- Status-cadens: `docs/ops/status-web-YYYY-MM-DD.md` (veckovis)
- Senaste status: `docs/ops/status-web-2026-05-18.md`
- Webbens egna .env-exempel: `next-app/.env.example`
- AI Hair Analyzer endpoint: `next-app/app/api/analyze-hair/route.ts` (mock-läge utan `ANTHROPIC_API_KEY`, live när satt)
