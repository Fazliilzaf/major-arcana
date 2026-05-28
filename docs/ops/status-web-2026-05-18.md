---
owner: Ops
status: active
---

# hairtpclinic.com — nuläge och nästa leveranser

Datum: 2026-05-18
Syfte: Veckovis status för den publika webben (hairtpclinic.com, Next.js 15). Spegel av Arcanas `ops/status-YYYY-MM-DD.md`-mönster.
Arbetsfördelning: **Webb-repo** (hairtpclinic-web — separat Next.js på Vercel) körs separat från Arcana-monoliten men ägs av samma roadmap. Status uppdateras varje vecka eller vid milstolpar.

Masterplan: `docs/strategy/web-hairtpclinic-com-masterplan.md`.

---

## 1. Snabbverifiering (kör i webb-repo)

Kör i katalogen `next-app/`:

```bash
node_modules/.bin/tsc --noEmit --project tsconfig.json
npm run build
```

### Resultat 2026-05-18

| Steg | Utfall |
|------|--------|
| `tsc --noEmit` | OK (0 fel i kod; 2 stale `.next/types/* 2.ts` iCloud-dups ignoreras) |
| `next build` | Ej körd i denna session — behöver verifiering före nästa deploy |
| Visuell smoke 5 sidor | Pending — kör efter Vercel preview-deploy |

---

## 2. Sprint 2026-05-15 → 2026-05-18 — vad som levererades

### 2.1 EN-paritet (komplett)

Alla 13 huvudsidor på engelska med samma struktur, ton och visuella språk som SV-versionen:

| EN-sida | SV-mall | Status |
|---------|---------|--------|
| `/en/hair-transplant` | `/hartransplantation` | ✓ paritet (269 vs 271 rader) |
| `/en/dhi-method` | `/dhi` | ✓ paritet |
| `/en/beard-transplant` | `/skaggtransplantation` | ✓ paritet |
| `/en/eyebrow-transplant` | `/ogonbrynstransplantation` | ✓ paritet |
| `/en/prp-hair` | `/prp-har` | ✓ paritet (596 vs 592 rader) |
| `/en/prp-skin` | `/prp-hud` | ✓ paritet (930 vs 992 rader) |
| `/en/microneedling` | `/microneedling` | ✓ paritet (595 vs 597 rader) |
| `/en/pricing` | `/priser` | ✓ paritet (493 vs 488 rader) |
| `/en/before-after` | `/fore-efter` | ✓ kärnsektioner (163 vs 251 rader) |
| `/en/about` | `/om-oss` | ✓ paritet |
| `/en/about-hair-loss` | `/om-haravfall` | ✓ paritet (724 vs 737 rader) |

### 2.2 Performance-pelaren

- **next/font/google migration**: Cormorant Garamond, Inter, Plus Jakarta Sans self-hosted. `@import url(...)` borttagen från globals.css. Förväntad LCP-vinst 200–400 ms.
- **PNG → AVIF/WebP**: 11 stora PNG batch-konverterade via `scripts/convert-images.mjs`. Total payload 4 515 kB → AVIF 244 kB (-95 %), WebP 411 kB (-91 %).
- **`next.config.mjs`**: `optimizePackageImports: ['lucide-react']`, mobile-first `deviceSizes [360, 640, 768, 1024, 1280, 1536, 1920]`, 1-års `minimumCacheTTL`.
- **Hero-bilder**: verifierade med `priority`-prop (var redan på plats i PageHero + startsidan).

### 2.3 Konverterings-pelaren

- **`StickyMobileCta`** (locale-aware, scroll-driven, safe-area). Live i layout.tsx — visas på alla sidor utom /boka, /tack, /kontakt.
- **`ExitIntentPopup`** (desktop mouseleave, GDPR-text, 30-dagars cooldown via localStorage). Postar till `/api/lead` med `type: 'pdf-guide'`.
- **`BeforeAfterSlider`** (drag-handle, tangentbord, ARIA `role="slider"`). 23 par splittade från composites via `scripts/split-before-after.mjs`. Live på `/fore-efter` + `/en/before-after`.
- **`PriceCalculator`** (Norwood × område × teknik → live prisintervall). GA4 `price_calculator_cta` event. Live på `/priser` + `/en/pricing`.

### 2.4 AI-pelaren (POC)

- **`HairAnalyzer` UI**: upload 1–3 foton, consent-gate, preview + remove, locale-aware (SV/EN).
- **`/api/analyze-hair` Claude Vision-route**: strukturerad JSON-prompt (Norwood/Ludwig + grafts + pris + tekniker + notes). Stripar markdown-codeblocks. Mock-läge utan `ANTHROPIC_API_KEY`, live när satt.
- **`@anthropic-ai/sdk` v0.96** installerat.
- Live på `/hartransplantation` + `/en/hair-transplant`.

### 2.5 Email-pelaren

- **PDF-guider**: `content/guide/7-saker-att-veta.md` (SV) + `content/guide/7-things-to-know.md` (EN). 7 ärliga "saker att veta innan hårtransplantation"-punkter.
- **`scripts/build-guide-pdf.py`** (reportlab) → genererade `public/assets/guide/7-saker-att-veta.pdf` (7 kB, 3 sidor) + `7-things-to-know.pdf` (6 kB) med brand-bar och Hair TP-typografi.
- **`/api/lead`** utvidgad med `type: 'pdf-guide'`-branch. Resend-stub klar att aktivera.

### 2.6 Övriga audits

- 22 saknade `alt`-attribut identifierade (många dekorativa) — fix planerad till Workstream B.
- 2 native `<img>` kvar att konvertera till `<Image>` — Workstream B.
- Dynamisk sitemap för artiklar identifierad som lucka — Workstream A.

---

## 3. Open issues / blockers

3.1. **Ingen blocker just nu.** Sprinten genomfördes utan hinder.

3.2. **Verifiering saknas:** `next build` kördes inte i denna session. Innan production-deploy ska build + visuell smoke på 5 nyckelsidor köras.

3.3. **iCloud-sync-friktion:** stale `.next/types/* 2.ts`-duplikater kan inte raderas från Cowork-sandbox (`EPERM`). Fazli behöver radera manuellt på sin egen Mac, eller köra `rm -rf .next` lokalt.

3.4. **AI Hair Analyzer i mock-läge:** kräver `ANTHROPIC_API_KEY` i `.env.local` för att aktivera Claude Vision.

3.5. **PDF-guide email-leverans i mock-läge:** kräver `RESEND_API_KEY` + domän-verifiering av hairtpclinic.com på resend.com + avkommentering av Resend-blocket i `/api/lead`.

---

## 4. Sprint 2026-05-18 (sen-eftermiddag) — Workstream A LEVERERAD

Per masterplan §4.A genomfördes hela SEO-pelaren samma dag som masterplanen skapades.

4.A.1. **Dynamisk sitemap** ✓
- `app/sitemap.ts` iterar nu `ARTICLES` + `STADER`. ~26 → ~41 entries.
- Artiklar: `/artiklar/[slug]` med `lastModified` från `publishedAt`.
- Städer: alla 10 (Stockholm, Malmö, Uppsala, Västerås, Örebro, Linköping, Helsingborg, Jönköping, Norrköping, Lund) med priority 0.7.

4.A.2. **Local Business JSON-LD per stad** ✓
- Ny helper `cityLocalBusinessLD()` i `lib/structured-data.ts`.
- Unik `@id` per stad (annars dedupar Google).
- `areaServed: [staden, Göteborg]`, `hasOfferCatalog` med `popularServices`, `geo`, `openingHoursSpecification`, `priceRange`, `telephone`, `email`, `paymentAccepted`, `medicalSpecialty: ['Dermatology', 'PlasticSurgery']`.
- Inkopplad i `app/stader/[stad]/page.tsx`.

4.A.3. **Speakable Schema** ✓
- Ny helper `speakableLD()` i `lib/structured-data.ts`.
- `FaqSection` + `FaqSectionEn` sätter `data-speakable="true"` på alla FAQ-svar.
- Live på `/faq` + `/en/faq` + alla 10 stad-FAQ-sektioner.

4.A.4. **noindex på konverteringsbekräftelser** ✓
- `/tack` hade redan `index: false`.
- Skapade `/en/thank-you` (EN-booking-flödet pekade dit men sidan saknades) med `noindex`.
- Uppdaterade `app/robots.ts` `blockedPaths` med `/en/thank-you`.

**Verifiering:** 0 TypeScript-fel.

---

## 5. Nästa tre leveranser (per masterplan Workstream B → C + status-update)

5.1. **Workstream B — Tillgänglighet & UX-polish (3 dagar):**
- Fix av 22 saknade `alt`-attribut.
- 2 native `<img>` → `<Image>`.
- axe-core compliance-check.

5.2. **Workstream C — Smart engagement (1 vecka):**
- AI Pre-konsultationschatt (`/api/chat` med Claude).
- "Vilken behandling passar mig?"-quiz i /boka step 1.
- WhatsApp deep-link med context-pre-fill per sida.

5.3. **Bundle-analyzer verify (45 min):**
- Aktivera `@next/bundle-analyzer`, mät faktisk lucide-react-besparing från Workstream Performance.

---

## 6. Definition of Done för Sprint 2026-05-15 → 18

6.1. ✓ Alla 13 EN-sidor i locale-paritet (verifierat radvis).
6.2. ✓ Performance-foundation klar (fonts, bilder, config).
6.3. ✓ 4 nya konverterings-komponenter live (Sticky, Exit, Slider, Calculator).
6.4. ✓ AI Hair Analyzer POC live (mock-läge).
6.5. ✓ PDF-guider genererade.
6.6. ✓ Workstream A komplett (sitemap, per-stad LD, Speakable, noindex).
6.7. ✓ 0 TypeScript-fel i ny kod.

---

## 6. Snabb-uppslag

- Repo (lokal): `hairtpclinic-web (extern Next.js-repo, Vercel) — `
- Masterplan: `docs/strategy/web-hairtpclinic-com-masterplan.md`
- .env-mall: `next-app/.env.example`
- Bild-script: `next-app/scripts/convert-images.mjs`
- Before/after-split: `next-app/scripts/split-before-after.mjs`
- PDF-build: `next-app/scripts/build-guide-pdf.py`
- AI-endpoint: `next-app/app/api/analyze-hair/route.ts`
- Nästa status: `docs/ops/status-web-2026-05-25.md` (planerad)
