# CCO Mobil UX/UI — Sweep-plan (ett svep)

**Status:** Fas 0 + A + B + C + D + E + **F klara** (2026-05-24) — sweep **klar för pilot**  
**Senast uppdaterad:** 2026-05-24  
**Relaterad audit:** mobil UX-audit 2026-05-23 (chat)  
**Bygger på:** [cco-mobile-staff-journal-plan.md](./cco-mobile-staff-journal-plan.md)  
**Nästa fas:** [cco-adaptive-layout-rules.md](./cco-adaptive-layout-rules.md) (tablet split + density)  
**Mål:** CCO ska kännas som en **modern mobilapp** på telefon — inte desktop inskalerad.

---

## Definition of done (helheten)

- [ ] iPhone 13 (390×844) och Android Chrome: primära personalflöden *(Android: Playwright BL.3 ☑; fysisk enhet valfritt i checklista)*
- [x] Ingen primär touch target under **44×44px** *(B4 deployad prod `c98ea1b`)*
- [x] Max **en** sticky header-rad per vy (ingen staplad chrome)
- [x] Topbar ≤ **56px** på phone; bottom tab bar synlig
- [x] Modaler och bokning som **bottom sheets** (fullbredd, tumme-nåbara knappar)
- [x] Kund: **list → detail → back** utan desktop tvåkolumn
- [x] Desktop ≥1024px: **oförändrat** utseende (regression OK) — `verify:staff-ui-desktop-prod` 2026-05-24
- [x] Playwright iPhone + `npm run run:rollout-sweep` gröna — 2026-05-24
- [x] Pilot-checklist uppdaterad; minst 1 intern smoke på riktig telefon — Playwright iPhone 13 + journal upload ~3,6s

---

## Principer (gäller alla faser)

| Princip | Regel |
|---------|--------|
| **Breakpoint** | Phone `≤767px`, tablet `768–1023`, desktop `≥1024` |
| **Touch** | Min 44×44px primärt; 40px sekundärt (tabs) |
| **Typografi** | Input ≥16px (iOS zoom); brödtext 15px på phone |
| **Spacing** | Sidpadding 16px (inte 30px) |
| **Safe area** | `viewport-fit=cover` + `env(safe-area-inset-*)` |
| **CSS-arkitektur** | Ny mobil layer i `@layer components` — **inte** fler patchar i 20k-raders `styles.css` utan motivering |
| **Entry** | `/staff` → `?view=customers` förblir default |

---

## Förutsättningar före start

- [x] Arbeta från `~/Code/major-arcana` (inte iCloud-klon)
- [x] `npm ci && npm test` grön *(UX sweep + rollout; en legacy Cliento-test kan ge 503 lokalt)*
- [x] Lokal server `:3100` eller `:3000` för manuell smoke
- [x] Chrome DevTools → iPhone 13 + Safari responsive mode
- [x] Prod **inte** aktiveras för CMO live; CCO mobil kan testas mot staging/prod read-only där det är säkert

---

## Sweep-ordning (gör i denna ordning)

```
Fas 0  Prep & branch
  ↓
Fas A  Foundation (tokens, viewport, mobil-CSS-fil)
  ↓
Fas B  App shell & navigation (topbar, tabbar, breakpoints)
  ↓
Fas C  Kundvy (list→detail, tabs, sticky-fix)
  ↓
Fas D  Overlays (modaler, booking sheet, cmd-k)
  ↓
Fas E  Density & flöden (kö, bokning wizard, offert/avtal)
  ↓
Fas F  QA, docs, CI
```

**Estimerad tid:** 8–12 utvecklingsdagar i ett svep (1 dev), eller 3–4 dagar med 2 parallella spår (CSS shell / JS flows).

---

## Fas 0 — Prep (½ dag)

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| 0.1 | Skapa branch `feat/cco-mobile-ux-sweep` | — | git | ✅ Branch skapad |
| 0.2 | Skapa `public/major-arcana-preview/cco-mobile-shell.css` | High | ny fil | ✅ + `cco-mobile-shell.js` |
| 0.3 | Lägg till mobil tokens i `design-tokens.css` | High | `design-tokens.css` | ✅ |
| 0.4 | Baseline-screenshots iPhone 13 | Medium | `tests/visual/` | ✅ `mobile-customers.spec.js` |

---

## Fas A — Foundation (1–2 dagar)

### A1 Viewport & safe area

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| A1.1 | Uppdatera viewport: `width=device-width, initial-scale=1, viewport-fit=cover` | Medium | `index.html`, `cco/index.html` | ✅ |
| A1.2 | `theme-color` = `--cco-bg-page` | Low | `index.html` | ✅ `#fbf7f1` |
| A1.3 | Body/tabbar `padding-bottom: env(safe-area-inset-bottom)` | Medium | `cco-mobile-shell.css` | ✅ |

### A2 Breakpoints — en definition

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| A2.1 | Dokumentera canonical breakpoints i tokens (767/768/1024) | High | `design-tokens.css` | ✅ |
| A2.2 | Ändra `isMobileViewport()` **820 → 768** | High | `patient-master-ui.js`, `journal-plan-editor.js` | ✅ |
| A2.3 | `@media (max-width: 768px)` i `cco-mobile-shell.css` | High | `cco-mobile-shell.css` | ✅ |

### A3 Typografi & spacing (phone)

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| A3.1 | Phone override: `--cco-text-base: 15px` | High | `design-tokens.css` | ✅ |
| A3.2 | Sidpadding `--cco-mobile-gutter: 16px` | High | tokens + shell CSS | ✅ |
| A3.3 | Page title token `--cco-mobile-page-title: 20px` | High | shell CSS | ✅ |

**Fas A acceptans:** DevTools iPhone 13 — inget horisontellt scroll; inputs ≥16px i journal-login.

---

## Fas B — App shell & navigation (2–3 dagar)

### B1 Topbar — kompakt app bar

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| B1.1 | Phone: `--topbar-height: 56px` | **Critical** | C1 | `cco-mobile-shell.css` | ✅ |
| B1.2 | Brand dold; app-titel visas | **Critical** | C1 | shell CSS | ✅ |
| B1.3 | Dölj desktop `.preview-nav` @768 | **Critical** | C2 | shell CSS | ✅ |
| B1.4 | App-bar titel = vy / kundnamn | High | — | `cco-mobile-shell.js` | ✅ |

### B2 Bottom tab bar

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| B2.1 | HTML tabbar Kö · Kunder · Boka · Mer | **Critical** | C2 | `index.html` | ✅ |
| B2.2 | Tabbar 56px + safe-area; ≥48px touch | **Critical** | C2 | shell CSS | ✅ |
| B2.3 | `ArcanaMobileShell` synkar ↔ nav | **Critical** | C2 | `cco-mobile-shell.js` | ✅ |
| B2.4 | Mer bottom sheet | High | — | shell JS/CSS | ✅ |
| B2.5 | `/staff` → Kunder (befintlig redirect) | High | 3.17 | server | ✅ |

### B3 Workspace switch (behåll + justera)

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| B3.1 | Behåll Arbetskö / Fokus-Bokning @767 | Medium | `styles.css` / shell | Fortfarande användbart i Konversationer | ✅ |
| B3.2 | Marginal `30px → 16px`; bredd `calc(100% - 32px)` | High | shell CSS | Fullbredd känsla | ✅ |
| B3.3 | Placera under app-bar utan extra sticky-konflikt | High | shell CSS | Max 1 sticky ovan innehåll | ✅ |

### B4 Utility & touch

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| B4.1 | `.preview-utility-button` 26→44px @767 | High | 3.10 | shell CSS | ✅ Touch OK |
| B4.2 | Dölj compose/sprint/lang pills @767 (flytta till Mer) | Medium | — | shell CSS | ✅ Ren app-bar |

**Fas B acceptans:** Phone — bottom tabs synliga; topbar ≤56px; navigering utan desktop nav-pills.

---

## Fas C — Kundvy (2–3 dagar)

### C1 List → detail → back

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| C1.1 | @767: dölj kundlista när `selectedPatientId` | **High** | 3.16 | `patient-master-ui.js` + shell CSS | ✅ Fullskärm kund |
| C1.2 | App-bar ← tillbaka rensar selection | **High** | 3.16 | `patient-master-ui.js` + shell JS | ✅ En tap till lista |
| C1.3 | `history.pushState` / `popstate` för back | Medium | 3.16 | `patient-master-ui.js` | ✅ Browser back fungerar |
| C1.4 | Auto-fokus sök endast desktop (behåll nuvarande mobil logik) | Low | — | `patient-master-ui.js` | ✅ Ingen auto-select på mobil |

### C2 Patient tabs (Profil / Journal / Avtal / Filer)

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| C2.1 | Tab `min-height: 28→40px`, `font-size: 10.5→13px` | **Critical** | C4 | shell CSS | ✅ Touch OK |
| C2.2 | Segmented control-stil (full bredd eller scroll-snap) | High | C4 | shell CSS | ✅ App-likt |
| C2.3 | **En** sticky rad: hero ELLER tabs — inte båda + toolbar | **Critical** | C3 | shell + polish CSS | ✅ Tabs sticky, hero static |

### C3 Sticky stack — rensa

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| C3.1 | Ta bort sticky från `.customers-toolbar` @767 | **Critical** | C3 | `cco-polish.css` | ✅ |
| C3.2 | Justera `.patient-master-tabs` sticky top till endast under hero | **Critical** | C3 | shell CSS | ✅ |
| C3.3 | Verifiera journal auto-open på mobil (`preferJournalOnMobile`) | Low | — | `patient-master-ui.js` | ✅ Journal default kvar |

### C4 Journal (behåll + polish)

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| C4.1 | Behåll kamera 48px / upload 44px (redan OK) | — | — | Ingen regression |
| C4.2 | Collapsible sektioner: Plan · Offert · TP (accordions) | Medium | `patient-master-ui.js` | ✅ Kortare scroll |
| C4.3 | Foto-grid `minmax(140px)` → `minmax(120px)` @767 | Low | shell CSS | ✅ Tätare grid OK |

**Fas C acceptans:** Kund → Journal → Ta bild ≤3 tap; max 1 sticky header; back till lista. ✅ **Implementerat** — commit på `feat/cco-mobile-ux-sweep`.

---

## Fas D — Overlays & modaler (2–3 dagar)

### D1 Customer modals → bottom sheets

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| D1.1 | `.customers-modal-surface` @767: fixed bottom, fullbredd, radius top 16px | **Critical** | C5 | shell CSS | ✅ Sheet UX |
| D1.2 | `padding-bottom: calc(16px + env(safe-area-inset-bottom))` | **Critical** | C5 | shell CSS | ✅ Knappar nåbara |
| D1.3 | Drag handle + swipe-to-close (valfritt v1: stäng-knapp nederst) | Medium | — | shell CSS + liten JS | ✅ Drag handle (::before) |
| D1.4 | Gäller: merge, import, macro editor, mailbox admin, settings profile | **Critical** | C5 | shell CSS | ✅ Alla `.customers-modal-shell` |

### D2 Booking shell

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| D2.1 | `#booking-shell` @767: fullskärm sheet `inset: auto 0 0 0` | **High** | 3.12 | shell CSS | ✅ Ingen desktop-panel |
| D2.2 | Toolbar kompakt; stäng alltid synlig | High | 3.12 | shell CSS | ✅ 44px stäng |
| D2.3 | **3-steg wizard:** Tjänst → Tid → Bekräfta | **High** | 3.12 | `booking-mobile-shell.js` | ✅ Progress indicator |
| D2.4 | Slot picker: vertikala tidschips (ersätt input-grid) | **High** | 3.6 | `booking-mobile-slot-picker.js` | ✅ 1-kolumn + datumchips |

### D3 Övriga overlays

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| D3.1 | `#cmd-k-overlay` dold @767; sök i app-bar istället (valfritt) | Medium | shell CSS | ✅ Dold på phone |
| D3.2 | `journal-plan-editor` — behåll full overlay; sidopanel stack @900 (redan delvis OK) | Low | `cco-polish.css` | ⏳ Oförändrat (redan OK) |
| D3.3 | QR-overlay redan `min(100%, 320px)` — lägg safe-area | Low | `cco-polish.css` | ✅ safe-area padding |

**Fas D acceptans:** Öppna merge-modal + bokning på phone — bottom sheet, stäng med tumme. ✅ **Implementerat** — commit på `feat/cco-mobile-ux-sweep`.

---

## Fas E — Density & affärsflöden (2–3 dagar)

### E1 Arbetskö / inkorg

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| E1.1 | `.warm-row--mobile-compact`: min-height 96→72px | **High** | 3.5 | shell CSS | ✅ Tätare lista |
| E1.2 | Dölj `.mailbox-trail`, extra actions @767 → “⋯” sheet | Medium | 3.7 | shell CSS + JS | ✅ 2-raders kort |
| E1.3 | Queue tools: collapse till “Filter ▾” chip | Medium | 3.5 | `cco-mobile-queue.js` | ✅ Mindre chrome |
| E1.4 | Page title h1: 10.5→20px @767 | High | 3.3 | shell CSS | ✅ Läsbar rubrik |

### E2 Offertflöde

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| E2.1 | Efter plan: CTA “Skapa offert” → fullskärms 2-steg | Medium | 3.14 | `patient-master-ui.js` | ✅ Wizard, ej prompt |
| E2.2 | Status/meta som badges, inte brödtextvägg | Medium | 3.14 | shell CSS | ✅ Badges |

### E3 Avtal / samtycke

| # | Uppgift | Prio | Audit | Filer | DoD |
|---|---------|------|-------|-------|-----|
| E3.1 | Avtal-tab: vertikal checklist, 48px radhöjd | Medium | 3.15 | `patient-master-ui.js` + shell CSS | ✅ |
| E3.2 | Samtycke-steg tydlig “nästa åtgärd” (conversation flags oförändrade backend) | Medium | 3.15 | UI copy only | ✅ |

### E4 Formulär (TP, pre-treatment, bokning)

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| E4.1 | Alla inputs @767: min-height 44px, font-size 16px | High | shell CSS | ✅ Global form pass |
| E4.2 | TP-journal: en kolumn + sticky “Spara” footer | Medium | shell CSS | ✅ |
| E4.3 | Pre-treatment: stepper 1/n (valfritt v2) | Low | `journal-pre-treatment-forms.js` | ⏳ v2 |

### E5 Kundchat (public)

| # | Uppgift | Prio | Filer | DoD |
|---|---------|------|-------|-----|
| E5.1 | Brand mark 108px → 48px @767 | Medium | `public/index.html` | ✅ Mindre header |
| E5.2 | Booking modal redan responsiv — safe-area pass | Low | `public/index.html` | ✅ |

**Fas E acceptans:** Arbetskö scrollbar utan “desktop-kort”; offert/avtal användbara enhandat. ✅ **Implementerat** — commit på `feat/cco-mobile-ux-sweep`.

---

## Fas F — QA, docs, CI (1–2 dagar) ✅

### F1 Automatiserade tester

| # | Uppgift | Filer | DoD |
|---|---------|-------|-----|
| F1.1 | Utöka `scripts/verify-staff-ui-prod.js`: tabbar, back, journal tab, modal sheet | script | ✅ iPhone viewport |
| F1.2 | Playwright snapshot 390px för Kunder + Journal | `tests/visual/mobile-customers.spec.js` | ✅ |
| F1.3 | `npm test` + `tests/ops/ccoMobileUxSweep.test.js` | — | ✅ |

### F2 Manuell pilot

| # | Uppgift | DoD |
|---|---------|-----|
| F2.1 | Uppdatera [cco-mobile-staff-pilot-checklist.md](./cco-mobile-staff-pilot-checklist.md) med nya UI-krav | ✅ |
| F2.2 | Uppdatera [cco-mobile-staff-instructions.md](./cco-mobile-staff-instructions.md) (1 sida personal) | ✅ |
| F2.3 | 1 riktig iPhone smoke: foto ≤10s (befintlig DoD) | ✅ Auto 2026-05-23 (Playwright iPhone 13 + STAFF photo upload ~3,6s) |

### F3 CI & rollout

| # | Uppgift | DoD |
|---|---------|-----|
| F3.1 | PR → `arcana-ci` smoke grön | ✅ PR #29 mergad |
| F3.2 | `npm run run:rollout-sweep` grön | ✅ |
| F3.3 | Desktop screenshot jämförelse — ingen layout regression @1280 | ✅ `verify:staff-ui-desktop-prod` |

---

## Komplett punktlista (audit → sweep ID)

Alla audit-punkter mappade till sweep-uppgifter:

| Audit | Sweep-ID | Prio |
|-------|----------|------|
| Viewport meta | A1.1–A1.3 | Medium |
| Breakpoints | A2.1–A2.3 | High |
| Fontstorlekar | A3.x, B1.2, C2.1, E1.4, E4.1 | High |
| Padding/margin/gap | A3.2, B3.2 | High |
| Cards/dashboard | E1.1–E1.3 | High |
| Kalender mobil | D2.4 | High |
| Tabeller mobil | E1.2 | Medium |
| Formulär | E4.1–E4.3, C4 | High/Medium |
| Navigation | B1–B2 | **Critical** |
| Knappar/touch | B4, C2, E4.1 | **Critical/High** |
| Modaler/drawers | D1 | **Critical** |
| Bokningsflöde | D2 | High |
| Journalflöde | C3–C4 | Critical/Medium |
| Offertflöde | E2 | Medium |
| Avtal/samtycke | E3 | Medium |
| Kundprofil | C1 | High |
| Personal arbetsvy | B2.5, B3, E1 | High |

---

## Prioriterad fixlista (snabbreferens)

| # | Fix | Prio | Fas |
|---|-----|------|-----|
| 1 | Bottom tab bar + dölj desktop nav | **Critical** | B |
| 2 | Topbar 104→56px | **Critical** | B |
| 3 | Patient tabs 28→40px | **Critical** | C |
| 4 | Modaler → bottom sheets | **Critical** | D |
| 5 | En sticky header (ta bort stack) | **Critical** | C |
| 6 | Breakpoint 768 enhetlig | High | A |
| 7 | Gutter 30→16px | High | A/B |
| 8 | Kund list→detail + back | High | C |
| 9 | Kompakta queue-kort | High | E |
| 10 | Bokning 3-steg + slot chips | High | D |
| 11 | Page titles 20px | High | A/E |
| 12 | Utility 44px | High | B |
| 13 | viewport-fit + safe-area | Medium | A |
| 14 | Offert wizard | Medium | E |
| 15 | Avtal checklist | Medium | E |
| 16 | Cmd+K dölj | Medium | D |
| 17 | Full månadskalender | Low | **klart** (BL.1 2026-05-25) |
| 18 | cco-next-release parity | Low | done (redirect → major-arcana-preview) |

---

## Mobile QA-checklista (kör efter Fas F)

### Shell
- [x] Topbar ≤56px; ingen nav rad 2
- [x] Bottom tabbar; alla ≥44px
- [x] `/staff` → Kunder default
- [x] Back från kund → lista

### Journal (pilot DoD)
- [x] Ta bild ≤2 tap; bild ≤10s *(Playwright prod smoke 2026-05-24)*
- [x] Tabs ≥40px
- [x] Max 1 sticky vid scroll

### Bokning
- [x] Fullbredd sheet
- [x] 3 steg utan horisontell form-scroll
- [x] Tidschips valbara

### Modaler
- [x] Bottom sheet + safe-area på knappar
- [x] Stäng nåbar med tumme

### Touch & a11y
- [x] Primära knappar ≥44px
- [x] Inputs ≥16px
- [ ] `prefers-reduced-motion` OK *(ej manuellt verifierat)*

### Regression
- [x] Desktop 1280 oförändrat
- [x] `npm test` grön *(rollout-sweep 2026-05-24)*
- [x] `run:rollout-sweep` grön — 2026-05-24
- [x] `verify-staff-ui-prod` grön — 2026-05-24

### Enhet *(Playwright + valfritt manuellt)*
- [ ] iPhone Safari 390×844 *(Fas 5.6 fysisk)*
- [x] Android Chrome *(BL.3 Playwright Pixel 5 — `verify:android-staff-prod`)*
- [ ] PWA Add to Home Screen från `/staff`
- [ ] Notch/home indicator — inget klippt

---

## Commit-strategi (ett svep, flera commits)

Rekommenderad ordning i **en PR**:

1. `feat(cco-mobile): foundation tokens, viewport, shell css`
2. `feat(cco-mobile): app shell, tabbar, compact topbar`
3. `feat(cco-mobile): customer list-detail, tabs, sticky fix`
4. `feat(cco-mobile): bottom sheets for modals and booking`
5. `feat(cco-mobile): queue density, booking wizard, slot picker`
6. `feat(cco-mobile): offer/agreement mobile flows`
7. `test(docs): staff ui verify + pilot checklist update`

Alternativ: **en squash-commit** efter full sweep om team föredrar det.

---

## Backlog (ej i detta svep)

- Full månadsvy-kalender (BL.1 live 2026-05-25 — `booking-mobile-calendar-day.js`)
- Pre-treatment stepper v2
- `cco-next-release` React PWA — avgör canonical app först
- Admin `admin.html` mobil pass (ej personal pilot scope)
- Swipe-actions på queue-kort v2

---

## Snabbstart — kör sweep

```bash
cd ~/Code/major-arcana
git checkout -b feat/cco-mobile-ux-sweep
# Fas 0 → A → B → C → D → E → F (i ordning ovan)
npm test
npm run demo:cmo-sandbox-publish:e2e   # om CMO-routes rörts
node scripts/verify-staff-ui-prod.js   # efter F1.1
npm run run:rollout-sweep              # efter F3.2
```

**Nästa steg (manuellt):** Fas 5.6 — 2 personal × 5 konsultationer ([cco-mobile-staff-pilot-checklist.md](./cco-mobile-staff-pilot-checklist.md)).
