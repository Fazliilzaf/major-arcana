# ORD-25 — Port v11 kundkort till live SPA

**Skapad:** 2026-06-05
**Owner-spår:** Cursor (write — frontend refactor i SPA-render-path)
**Claude-spår:** UAT efter deploy
**Prio:** P1 (post-pilot — owner-GO explicit override)
**Status:** PENDING

---

## Bakgrund

Owner låste **kundkort v11** 2026-06-05 efter 6 iterationer (v6→v11). Full design-spec ligger i `docs/handover/MOCKUPS/KUNDKORT-V11-LOCKED-2026-06-05.md`. Mockup-snapshot fanns i visualize-widget `kundkort_v11_stitched_hero_dokument_insikter`.

Detta ORD portar v11-designen till live SPA — refactor av befintlig dossier-render-path i `cco-v9-customers-parity.js` (Cursor äger denna path; `patient-master-ui.js` är Claude-display-track och rörs inte här).

---

## Scope (strikt, fasad leverans)

### Fas A · Design-tokens + system foundation (additivt, säkert)

Lägg CSS-variabler i `public/major-arcana-preview/cco-v9-customers.css` under `[data-v9-enabled="on"]`:

```css
[data-v9-enabled='on'] {
  --v11-ink: #2b251f;
  --v11-ink-soft: rgba(70, 60, 50, 0.6);
  --v11-ink-mute: rgba(70, 60, 50, 0.42);
  --v11-vellum: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.96),
    rgba(247, 241, 236, 0.88)
  );
  --v11-vellum-border: 1px solid rgba(255, 255, 255, 0.7);
  --v11-card-rule: 1px solid rgba(180, 160, 140, 0.18);
  --v11-lila-strong: #7c3aed;
  --v11-lila-text: #3d2576;
  --v11-lila-pill: linear-gradient(
    180deg,
    rgba(244, 237, 253, 0.95),
    rgba(220, 210, 250, 0.7)
  );
  --v11-lila-pill-border: 1px solid rgba(124, 58, 237, 0.28);
  --v11-lila-wash: linear-gradient(
    180deg,
    rgba(244, 237, 253, 0.95),
    rgba(220, 210, 250, 0.55)
  );
  --v11-gron-text: #1f5236;
  --v11-gron-grad: linear-gradient(180deg, #5fae84, #3e8a5e);
  --v11-gron-pill: linear-gradient(
    180deg,
    rgba(220, 238, 228, 0.95),
    rgba(190, 224, 206, 0.7)
  );
  --v11-gron-pill-border: 1px solid rgba(74, 130, 104, 0.32);
  --v11-gron-wash: linear-gradient(
    180deg,
    rgba(220, 238, 228, 0.85),
    rgba(190, 224, 206, 0.55)
  );
  --v11-amber-text: #7a4014;
  --v11-amber-grad: linear-gradient(180deg, #f4cc80, #dc9640);
  --v11-amber-wash: linear-gradient(
    180deg,
    rgba(252, 238, 218, 0.92),
    rgba(247, 228, 196, 0.82)
  );
  --v11-amber-border: 1px solid rgba(200, 130, 30, 0.3);
  --v11-shadow-base:
    0 1px 0 rgba(255, 255, 255, 0.85) inset, 0 2px 6px rgba(56, 40, 28, 0.05),
    0 1px 2px rgba(56, 40, 28, 0.03);
  --v11-shadow-lift:
    0 1px 0 rgba(255, 255, 255, 0.95) inset, 0 10px 28px rgba(56, 40, 28, 0.08),
    0 3px 8px rgba(56, 40, 28, 0.05);
}
```

**Typografi-skala (5 sizes):** `--v11-fs-label: 10px` · `--v11-fs-fine: 11px` · `--v11-fs-body: 13px` · `--v11-fs-section: 16px` · `--v11-fs-hero: 22px`.

**Rytm-tokens:** `--v11-gap-intra: 6px` · `--v11-gap-card: 14px` · `--v11-gap-zone: 18px` (med 14px-hårsträng-margin → 24px total).

**Hairstrand SVG-mixin:** lägg `.v11-hairstrand` utility-class som renderar SVG `cubic-bezier` curve med gold-gradient fade.

Inga visuella förändringar i Fas A — bara tokens tillgängliga.

### Fas B · Hero refresh (bild 2)

I `cco-v9-customers-parity.js` dossier-render-path: refaktorera hero-blocket.

**Komponenter:**

1. **Pappersmonogram-avatar** — 64×64 cirkel, `linear-gradient(180deg,#fdfaf3,#efe6d6)`, paper-grain via radial-overlay, gold-passepartout-ring, monogram i `Georgia italic` + lila-text. Ersätter befintlig gradient-cirkel-avatar.
2. **Identitets-block** — kicker "KUNDDOSSIÉR" (10px lila uppercase) → namn 22px → meta-rad 11px → 3 pills (VIP/PRP-kur/engagement) med lila/grön-pill-tokens.
3. **Medicinsk briefing** — amber-wash card med vänster amber-stripe (3px), 4-kolumns grid (Allergier/Mediciner/Diagnoser/Övrigt), alla värden från ORD-23-backend (om klart) annars fallback till `patient.importantNote`-parse.
4. **Stat-row** — 1.6fr/1fr/1fr grid: HJÄLTE-stat ("0 no-shows · Klockren · Topp 5%") med lila-radial-halo + 2 dämpade sublines (Besök, Intäkt).

Hela hero-card använder `--v11-shadow-lift`.

### Fas C · Dokument-segmentvy (bild 3) — **beroende av ORD-24 backend**

Ersätt befintlig "Dokument & filer"-sektion med 4-grupps segmentvy:

1. **Kontext-rubrik** — "DOSSIÉR · DOKUMENT-SEGMENT" + count-line ("N dokument · X klara · Y väntar · Z kommer")
2. **Filter-rad** — 3 axlar synliga (Vem fyller / Flöde / Vy)
3. **Grupp 1: Offerter** — render från `dossier-bundle.documents.offers[]`, en rad per offert med flow-chip + belopp + status-pill
4. **Grupp 2: Hälso- & samtyckesdokument** — render från `dossier-bundle.documents.consents[]` + `dossier-bundle.documents.healthForms[]`, signed/pending/dashed-planned
5. **Grupp 3: Journaler** — render från `dossier-bundle.journalStatus.expected[]`, signed/pending(amber)/dashed-planned
6. **Grupp 4: Auto-dokument** — render från `dossier-bundle.recentEvents[]` filtrerat på `kind in ['mail_sent', 'sms_sent', 'doc_sent']`, 3-kolumns grid

**Krav på data:** `GET /api/v1/cco-patient-master/patient/dossier-bundle?patientId=X` returnerar full payload per ORD-23/ORD-24-spec. Om ORD-24 INTE klar, ship Fas C med tom-state ("Dokumentsegment laddas — väntar backend ORD-24") och resten av v11 utan denna sektion.

### Fas D · Insikter-strip + sticky + helper (bild 1)

Ersätt befintlig insikter/action-zon:

1. **Insikter-strip** — header "INSIKTER" (10px lila) + "Visa kundresa ›" länk. 3 insikt-kort i grid: state-bärande kort (Nästa steg) får amber-stripe, övriga är vellum-only med färgad icon-tile (lila/grön). Render från `dossier-bundle.smartNextStep[]` + `capabilityMatrix[]` per ORD-18.
2. **Sticky bottom** — flex med 1 hjälte-CTA (gold-fill "Boka nästa PRP", full-width-flex) + 2 assistenter (vellum "Ta bild" + grön-pill "Bekräfta · {count}").
3. **Helper-text under sticky** — 11px ink-soft, vänsterställt, kontextuell ("Signera hälsodeklarationen innan du skapar behandlingsplan." när blocker finns).

---

## OUT OF SCOPE

- **Kundresan-sektion** — v11 har INTE en separat kundresa-sektion (ersatt av "Visa kundresa ›" link i insikter + journeyStep-meta på varje dokumentrad). Den befintliga journey-stepper-sektionen i SPA tas BORT i denna refactor.
- **Bokningar-sektion** — flyttas till separat vy/tab, inte i kundkortet
- **Veckans mönster / analytiska insikter** — utanför v11-scope (kan komma som senare ORD)
- **Backend datamodell** — ligger i ORD-23 (allergi-fält) och ORD-24 (dokument-segment). Detta ORD är endast frontend-port.
- **`patient-master-ui.js`** — Claude-display-track, rörs inte.

---

## Acceptance Criteria

### Per fas

- [ ] **Fas A:** CSS-tokens definierade · `npm test` PASS · ingen visuell regression
- [ ] **Fas B:** Hero matchar v11-mockup pixel-nära (avatar/identitet/briefing/stat-row) · medicinsk briefing visar allergi-fält från backend (eller fallback) · `--shadow-lift` på hero-card
- [ ] **Fas C:** 4 dokument-grupper renderar från `dossier-bundle` · filter-chips fungerar (klick uppdaterar list) · status-pillar och flow-chips matchar token-färger
- [ ] **Fas D:** Insikter-strip visar 3 kort med rätt state-färger · sticky har 1 primary + 2 secondaries · helper-text visas när blocker finns

### Globalt

- [ ] V9 default-ON kvar (feature-flag intakt)
- [ ] Ingen rosa accent någonstans · inga blå stripes · inga bruna checkmarks (per v11-frusna designval)
- [ ] 5 typstorlekar max i hela kundkortet (10/11/13/16/22)
- [ ] Hairstrand mellan zon 1→2 och 2→3 (inte rak hr)
- [ ] `npm test` PASS
- [ ] verify-script 13/13 oförändrat
- [ ] Mobile-render testat på 380px viewport (responsivt eller dedicerad m-version)

---

## Risker + Mitigation

| Risk                                                     | Mitigation                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ORD-24 backend inte klar → Fas C blockerad               | Ship Fas A+B+D först, Fas C med tom-state                                                      |
| Befintlig journey-stepper-sektion ger regression         | Bevara render-funktion men sätt `display:none` med v11-flag, ta bort i ORD-25.2                |
| Sticky-knappar krockar med existerande footer-actions    | Audit `cco-v9-customers-parity.js` `renderActions()` först, refactor istället för dubbel-mount |
| 5-typstorlekar-disciplin bryter befintlig text-rendering | Lägg `--v11-fs-*` på root av v11-card, override via cascade                                    |

---

## När Cursor klar — Claude UAT

1. Öppna prod dossier → klick kund → verifiera v11-layout matchar mockup 1:1
2. Audit color-tokens i devtools: bara lila/grön/amber + parchment används
3. Räkna typstorlekar: max 5 unika `font-size`-värden i v11-card
4. Verifiera hairstrand renderar mellan zoner
5. Test medicinsk briefing med och utan allergi-data (fallback-path)
6. Mobile-test 380px
7. `node scripts/verify-ord16-progress.js` 13/13 PASS

---

## Referens

- **Canonical mockup-spec:** `docs/handover/MOCKUPS/KUNDKORT-V11-LOCKED-2026-06-05.md`
- **Document inventory:** `docs/reference/HAIRTP-DOCUMENT-INVENTORY-2026-06-05.md` (för Grupp 3+4 data-shape)
- **Backend deps:** ORD-23 (allergier) + ORD-24 (dokument-segment, ej skapat än)
- **Befintlig render-path:** `public/major-arcana-preview/app/cco-v9-customers-parity.js`
- **CSS:** `public/major-arcana-preview/cco-v9-customers.css`

---

_Skapad av Claude · 2026-06-05 · Owner GO: "porta v1[1]"_
