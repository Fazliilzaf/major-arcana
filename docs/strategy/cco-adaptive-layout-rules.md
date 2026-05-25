# CCO Adaptive App Layout Rules

**Status:** Spec låst · Implementation pågår i faser  
**Senast uppdaterad:** 2026-05-25  
**Scope:** Arcana + CCO **på webben** (`/staff`, `/major-arcana-preview`, valfritt `/admin`)  
**Relaterat:** [cco-mobile-ux-sweep-plan.md](./cco-mobile-ux-sweep-plan.md) (mobil #1–16 klart) · `public/major-arcana-preview/design-tokens.css`

---

## Scope (vad som ingår / inte ingår)

| Yta | Ingår? |
|-----|--------|
| `/staff` → `major-arcana-preview` | **Ja — primärt mål** |
| `arcana.hairtpclinic.se` CCO i webbläsare (mobil, iPad, desktop) | **Ja** |
| `/admin` (Arcana admin) | Valfritt — samma breakpoints, egen shell |
| Legacy `/cco` | **Nej** — orört enligt AGENTS.md |
| `hairtpclinic.com` (marknadssida) | **Nej** — separat stack |
| Patientkanaler (`/uppfoljning`, patient-chat) | **Nej** — om inte explicit utvidgat |

CCO ska kännas som en **modern app i webbläsaren** — inte som inzoomad desktop.

Outlook-liknande tänk:

- **Mobil** = fokuserat enkolumnsflöde per uppgift
- **iPad/tablet** = split view / två paneler där det hjälper
- **Desktop** = full workspace med sidonav, rutnät och expanderade paneler

Målet är **inte** att krympa desktop-UI. Målet är konsekvent visuell densitet, logiskt flöde och proportionell spacing per skärmstorlek.

---

## Core principle

Varje CCO-vy ska svara på:

1. Vad är användarens **aktuella uppgift**?
2. Vad är **nästa bästa åtgärd**?
3. Vilken information är **nödvändig just nu**?
4. Vad ska ** döljas, fällas ihop eller flyttas** på mindre skärmar?

---

## Preservation (Major Arcana)

**Compact ≠ collapsed whitespace.**

- Mobil/tablet får **färre samtidiga paneler** och **annan density** — inte plattare skuggor, mindre radius eller generisk typografi.
- Använd samma token-familj (`design-tokens.css`) med **density-lager** (mobile / tablet / desktop).
- Desktop Major Arcana: inter-panel gap **24px**, panel padding **24px**, page outer padding **32px** — se AGENTS.md Major Arcana Tokens.
- Mobil: sidpadding **16px** (`--cco-mobile-gutter`), max **en** sticky header-rad.

---

## Required breakpoints

Mobile-first. Canonical tokens i `design-tokens.css`:

| Läge | Bredd | CSS |
|------|-------|-----|
| Mobile | 320–767px | `max-width: 767px` |
| Tablet/iPad | 768–1023px | `768px – 1023px` |
| Desktop | 1024px+ | `min-width: 1024px` |
| Large desktop | 1440px+ | `min-width: 1440px` (valfritt finjustering) |

**Regel:** Desktop-layout får **aldrig** läcka in i mobil (inga desktop-tabeller, multi-kolumn utan `@media`).

---

## Visual density

Använd tokens — inga slumpmässiga one-off-värden.

| Token-grupp | Mobile | Tablet | Desktop |
|-------------|--------|--------|---------|
| Page gutter | `--cco-mobile-gutter` (16px) | `--cco-tablet-gutter` (20px) | `--cco-space-8` (32px) |
| Panel gap | `--cco-mobile-space-lg` | `--cco-tablet-panel-gap` (20px) | 24px (Major Arcana) |
| Brödtext | 15px (inputs ≥16px) | `--cco-text-md` | `--cco-text-base` / skala |
| Touch target | min 44×44px | min 44×44px | mus/hover OK |

- **Mobil:** kompakt men läsbar
- **Tablet:** luftig utan att kännas överdimensionerad
- **Desktop:** kraftfull utan att kännas trängd

---

## Mobile layout (≤767px)

- En kolumn
- Inga överlappande kort
- Ingen horisontell scroll (primärt innehåll)
- Inga desktop-tabeller
- Inga oversized dashboard-sektioner
- Bottom navigation (`cco-mobile-shell.js`)
- Sticky primära åtgärder
- Bottom sheets för detaljer
- Steg-för-steg för långa formulär
- Kompakta kort istället för breda paneler
- Kalender: dag-/listvy + månad (BL.1)
- Status-chips ska wrappa snyggt
- Å, Ä, Ö får **inte** klippas
- Hela sidan ska gå att scrolla till botten (`100dvh`, safe-area)

---

## Tablet/iPad layout (768–1023px)

- Split views **där det förbättrar tydlighet**
- Kalender + bokningsdetalj sida vid sida
- Kundlista + kundprofil sida vid sida
- Journallista + journaldetalj sida vid sida
- Undvik “mobilkort utdraget över hela skärmen”
- Undvik full desktop-komplexitet för tidigt
- Två kolumner **endast** när det minskar antal steg

---

## Desktop layout (≥1024px)

- Sidonavigation (mail-klient-struktur)
- Expanderade dashboards och arbetsytor
- Tabeller där lämpligt
- Multi-kolumn
- Full kalender (vecka/resurs) — **desktop-only backlog**
- Mer kontext, **samma designsystem**

---

## Components (målbild)

Reusable ytor ska stödja responsiva varianter. Implementation i preview = CSS-moduler + JS, inte nödvändigtvis separata React-komponenter.

| Komponent | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| AppShell | tabbar + sheets | split shell | sidebar + workspace |
| PageHeader | kompakt, 1 rad sticky | medium | full |
| Card / MobileCardList | lista-kort | 2-col valfritt | panel/card |
| DataTable | → kort/lista | kompakt tabell eller split | tabell |
| Calendar | dag/lista/månad | dag + sidopanel | vecka/resurs |
| BottomSheet | primär | sällan | modal/drawer |
| FormStep | steg + sticky CTA | steg eller en sida | full form |
| StickyActionBar | bottom | bottom eller inline | inline/toolbar |
| CustomerTimeline | fullbredd flik | split med detalj | panel i workspace |

---

## Calendar rules

| Läge | Default | Detalj |
|------|---------|--------|
| Mobile | dag/lista/månad | bottom sheet · event-kort med stripe + ikoner |
| Tablet | dag + sidopanel | tvåpanel bokning |
| Desktop | vecka/dag/resurs | segment-toolbar + filter-chips + detaljpanel |

### Hair TP kalender-design (kod)

- **Tokens:** `--cco-cal-*` i `cco-calendar.css` (taupe `#CABAAE`, espresso `#513D34`, canvas `#FAF6F3`)
- **Typografi:** Jost (UI) + Cormorant Garamond (rubriker) — samma familj som publik profil
- **Event-kort:** vänster accent-stripe per typ (online/fysisk/väntar/bekräftad) + ikoner (video, SMS, formulär, plats, klocka)
- **Verktyg:** segment (Vecka/Dag/Resurs) och resurs-chips “ploppar” via elevation — espresso aktiv, bubble inaktiv
- **Delade helpers:** `booking-calendar-shared.js` · desktop `booking-desktop-week.js` · mobil `booking-mobile-calendar-day.js`
- **Inte:** violet schedule-accent (ersatt med Hair TP taupe i `cco-polish.css`)

---

## Forms

Långa formulär (journal, avtal, offert) på mobil:

1. Grundinfo  
2. Behandling  
3. Samtycke / formulärkrav  
4. Granska / signera / spara  

- Autosave där data är kritisk  
- Framsteg synligt  
- Sticky Spara/Fortsätt på mobil  

---

## Tables

| Desktop | Tablet | Mobile |
|---------|--------|--------|
| Tabell | Kompakt tabell eller split | Kort/listobjekt |

**Aldrig** bred tabell tvingad på mobil (t.ex. CCO Care, påminnelser, saknade formulär).

---

## Scroll and overflow

Innan UI-uppgift markeras klar:

- [ ] Ingen `overflow: hidden` som blockerar innehåll
- [ ] Ingen fix höjd som klipper innehåll
- [ ] Ingen `100vh`-bugg på mobil — använd `min-height` + `100dvh`
- [ ] Användaren når sista elementet på iPhone/Android
- [ ] Safe-area respekterad (`env(safe-area-inset-*)`)

---

## QA requirement

För **varje** UI-ändring: beskriv beteende vid:

| Viewport | Typisk enhet |
|----------|--------------|
| 320px | smal Android |
| 390px | iPhone |
| 768px | iPad portrait |
| 1024px | iPad landscape / liten laptop |
| 1440px | desktop |

Markera **inte** klart utan mobile + tablet + desktop beskrivna (eller Playwright/verify PASS).

Verify:

```bash
npm run verify:cco-mobile-pilot-prod    # iPhone viewport
npm run verify:staff-ui-prod            # desktop regression
```

---

## Implementation roadmap (faser)

| Fas | Innehåll | Status |
|-----|----------|--------|
| **0** | Spec + tokens + Cursor rule | ☑ 2026-05-25 |
| **1** | Tablet split: kunder, kalender, journal | ☑ 2026-05-25 |
| **2** | Tabell → kort (CCO Care, listor) | ☑ 2026-05-25 (tablet + mobil) |
| **3** | FormStep långa formulär mobil + tablet | ☑ 2026-05-25 (TP, pre-treatment, PRP, uppföljning, ögonlock, avtal; ≤1023px) |
| **4** | Playwright 5-viewport gate | ☑ `verify:adaptive-layout-prod` |
| **5** | Desktop kalender (Hair TP design) | ☑ 2026-05-25 (`cco-calendar.css`, `booking-calendar-shared.js`, `booking-desktop-week.js`) |

Se [MASTER-TODO.md](./MASTER-TODO.md) backlog **BL.5**.

---

## CSS-arkitektur

- Breakpoints och density: `design-tokens.css`
- Mobil shell: `cco-mobile-shell.css` (`@layer components`)
- **Undvik** nya patchar i 20k-raders `styles.css` utan motivering
- Entry: `/staff` → `?view=customers` förblir default

---

## Referenser

- Mobil sweep (klar): [cco-mobile-ux-sweep-plan.md](./cco-mobile-ux-sweep-plan.md)
- Agent-regel: `.cursor/rules/cco-adaptive-layout.mdc`
- Tokens: `public/major-arcana-preview/design-tokens.css`
