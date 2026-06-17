# ORD-25 — Port v11 kundkort till live SPA (+ Aktivt besök)

**Skapad:** 2026-06-05 · **Uppdaterad:** 2026-06-17 (A–D closeout)  
**Prio:** P1  
**Status:** **Fas A–D CLOSED (prod GO)** · **Fas E** → eget spår [`ORD-25E-AKTIVT-BESOK-V2.md`](ORD-25E-AKTIVT-BESOK-V2.md)

---

## Closeout — Fas A–D (2026-06-17)

| Fas                     | Status          | Prod commit                        |
| ----------------------- | --------------- | ---------------------------------- |
| **0 Audit**             | **CLOSED**      | facit i denna fil                  |
| **A Tokens**            | **CLOSED**      | `047d8a88`                         |
| **B Hero**              | **CLOSED**      | `047d8a88` + hero CSS `a18b54e7`   |
| **C Dokument**          | **CLOSED**      | `047d8a88`                         |
| **D Insikter + sticky** | **CLOSED**      | `047d8a88`                         |
| **Cutover**             | **CLOSED**      | `047d8a88` — v11 default när v9 på |
| **E Aktivt besök**      | **NOT STARTED** | väntar datamodell — se ORD-25E     |

**Prod UAT (Codex):** PASS — patient utan dagens besök · tre v11-zoner · ingen journey/bokningar ovanför dokument · 380px · rollback `__ARCANA_V11_KUNDKORT=false` → referens/v10.

**Verify:** `node scripts/verify-v11-paritet.js` — 49/50 PASS (rosa-accent kvarstår, ej cutover-blocker).

**Rollback:** `window.__ARCANA_V11_KUNDKORT = false` → referens/v10 facit.

---

## Fas 0 audit — facit (2026-06-17, Codex)

**GO:** Cursor cutover **Fas A–D** (v11 Hero → Dokument → Insikter + sticky).  
**NO-GO:** **Fas E** (Aktivt besök) tills dagsmodell + encounter-state finns.

### Live vs kod idag

| Sektion                                      | referens/v10 live | parity v11            | Åtgärd                 |
| -------------------------------------------- | ----------------- | --------------------- | ---------------------- |
| Hero + stat + briefing                       | default ja        | byggd                 | cutover                |
| Dokument 4 grupper                           | delvis            | byggd                 | cutover + bundle       |
| Insikter + sticky                            | ja                | byggd                 | cutover                |
| Journey / bokningar / veckomönster / context | —                 | **felplacerad i v11** | **ta bort ur default** |
| Aktivt besök (Fas E)                         | saknas            | saknas                | senare ORD             |

**Tidigare blockerare (löst i cutover):** `usesV11DossierCutover()` var `false` → referens/v10 default. Nu v11 default när v9 på.

**Tidigare fel i v11-path (löst):** `renderV11ContextPanels` före dokument — borttaget ur default-zoner.

### dossier-bundle (prod stickprov)

Grupper stabila: `offers`, `healthForms`, `consents`, `journalStatus.expected`, `autoDokument` — **PASS för Fas C**.

Verifiering: `node scripts/verify-ord24-prod.js` (inget npm-alias än).

### Fas E datagap (varför NO-GO)

- Ingen `bookings.today[]` i dossier-bundle
- Encounter-store: `reserved | confirmed | cancelled` — saknar `checked_in | in_progress | completed_today`
- `watch-checkin` returnerar timestamp, matar inte tillbaka persistent “pågår idag”-zon
- Finns: `upcomingBookings`, `todayVisit`, `encounterId`, `missingEncounterForBooking` — **otillräckligt för mockup Fas E**

**Nästa efter A–D cutover:** eget segment **Aktivt besök / Nytt besök** + journalstart — kräver ORD-23a/encounter-spår innan UI.

---

## Sammanslagen produktvision (facit 2026-06-17)

**Live kundkort = v11 dossier (alltid) + Aktivt besök (när kunden är här idag).**

| Källa                  | Bidrag                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| v11 locked mockup      | Bas: Hero → Dokument → Insikter + sticky                                                  |
| Operations (Cloud)     | Konditionell **Aktivt besök**-zon mellan hero och stat-row                                |
| Port-disciplin (Codex) | Audit facit, fasad leverans, primär arbetsyta i live SPA — **inte** porta allt i ett svep |

**Kanonisk facit-yta:** `KUNDKORT-V11-LOCKED-2026-06-05.md` + Fas E (Aktivt besök) nedan.  
**Inte facit:** referens-only layout som default (`cco-kundkort-referens.js` / v10 facit när `usesV11DossierCutover()` är false).

### Komposition (live SPA)

```
Utan aktivt besök idag:
  [ Zon 1 Hero ] ─hairstrand─ [ Zon 2 Dokument ] ─hairstrand─ [ Zon 3 Insikter + sticky ]

Med aktivt besök idag (Fas E):
  [ Zon 1 Hero ] ─hairstrand─ [ Aktivt besök ] ─hairstrand─ [ stat-row om ej i hero ]
  ─hairstrand─ [ Zon 2 Dokument ] ─hairstrand─ [ Zon 3 Insikter + sticky ]
```

**ORD-26 slide-over** (15 sektioner) förblir **komplement** — inte primär dossier-layout.

**Backend som inte sväljer ORD-25:** ORD-23a (allergier, journal grid, besök), ORD-24 (dokument-segment payload), ORD-41 (besöksgruppering + assets). Journal **per besök** (encounter) — princip i Fas E + 23a, inte lös text i kortet.

---

## Bakgrund

Owner låste **kundkort v11** 2026-06-05 (v6→v11). Detta ORD portar designen till **live staff SPA** — idag routas detaljvy fortfarande via referens/v10 facit trots att v11-renderers finns i `cco-v9-customers-parity.js`.

**Render-path (Cursor):** `public/major-arcana-preview/app/cco-v9-customers-parity.js` + `cco-v9-customers.css`  
**Routing/cutover (minimal):** `patient-master-ui.js` — endast `usesV11DossierCutover()`, bundle-fetch, flaggor  
**Inte ORD-25:** journal-editor, `patient-master-ui.js` övrig display-logik

---

## Cursor vs Codex — uppgiftsfördelning

| #             | Uppgift                                                                             | Ägare                                               | Leverabel                                     |
| ------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| **0**         | Audit: live vs referens vs v11-kod, 1 stickprovspatient, gap-lista                  | **Codex**                                           | Kort rapport i PR-kommentar / handover-append |
| **0b**        | Validera `dossier-bundle` payload vs dokument-inventory (1–2 patienter)             | **Codex**                                           | PASS/FAIL per grupp (offers/HD/journal/auto)  |
| **A**         | CSS v11-tokens + hairstrand utility                                                 | **Cursor**                                          | PR, `npm test`                                |
| **B**         | Hero + medicinsk briefing + stat-row                                                | **Cursor**                                          | PR                                            |
| **C**         | Dokument-segment (4 grupper + filter)                                               | **Cursor**                                          | PR; tom-state om payload saknas               |
| **D**         | Insikter + sticky + helper vid blocker                                              | **Cursor**                                          | PR                                            |
| **E**         | Aktivt besök-zon (3 states, konditionell)                                           | **Cursor**                                          | PR **efter** A–D cutover                      |
| **Cutover**   | `usesV11DossierCutover()` true; rensa journey/bokningar/veckomönster ur v11-default | **Cursor**                                          | PR                                            |
| **Verify**    | Utöka/nytt v11-zone verify + befintliga sticks                                      | **Cursor**                                          | Script i `scripts/`                           |
| **UAT prod**  | 3 patienter: utan besök / med besök / med HD-blocker · 380px                        | **Codex**                                           | PASS/FAIL + screenshots                       |
| **Deploy**    | Push, Render live, `_diag/version`                                                  | **Codex**                                           | Commit på prod                                |
| **23a slice** | Structured allergies i briefing (ersätt `importantNote`-parse)                      | **Codex** om backend · **Cursor** om endast UI-wire | Efter Fas B                                   |

**Regel:** Cursor skriver inte prod batch/encounter utan owner GO. Codex rör inte `cco-v9-customers-parity.js` render utom cutover-rad i `patient-master-ui.js` om överenskommet.

---

## Scope (strikt, fasad leverans)

### Fas 0 · Audit + facit-lås (Codex, före cutover)

1. Bekräfta **facit** = v11 locked + Fas E (inte referens-default).
2. Tabell: sektion → finns i live / referens / parity.js v11 / saknas.
3. En stickprovspatient: `dossier-bundle` + `card` + `bookings.today[]` + encounter-state.
4. Output: gap-lista som styr A–E (max 1 sida, inga PII i handover).

**Exit:** Owner/Cursor GO på facit innan cutover-PR.

### Fas A · Design-tokens + system foundation (additivt, säkert)

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

### Fas E · Aktivt besök (konditionell operations-zon) — **efter A–D cutover**

**Placering:** mellan Hero och stat-row (eller direkt under hero om stat-row ingår i hero), separerad med hairstrand.

**Render-villkor:** visa endast om `bookings.today[]` har bokning med status  
`checked_in | in_progress | completed_today` (exakt fältnamn valideras i Fas 0).  
**Inget aktivt besök → zonen kollapsar helt** (v11 default oförändrat).

**Innehåll (pågår-state, referens-mockup 2026-06-17):**

1. **Kicker** — pulsande amber-dot + `AKTIVT BESÖK · PÅGÅR` + tidsstämpel (check-in)
2. **Visit-kontext** — rubrik (behandling/session), detalj (område · planerad tid), behandlare + rum
3. **Pre-flight** (3-kol): HD signerad · allergier granskade · FC krävs idag (amber + Öppna)
4. **Encounter-timeline** — incheckad → pågår → ~klart (horisontell tråd)
5. **Journal-actions** — gold primary `Starta journal · {protokoll}` + Ta bild · Anteckning · Avsluta

**3 states:**

| State              | UI                                 | Primär CTA       |
| ------------------ | ---------------------------------- | ---------------- |
| Väntar incheckning | Ingen puls; pre-flight kvar        | Checka in        |
| Pågår              | Amber-puls + aktiv timeline        | Starta journal   |
| Avslutat idag      | Grön kicker `Besök avslutat {tid}` | Boka uppföljning |

**Datakällor (validera i Fas 0):**

- `dossier-bundle.bookings.today[]` — dagens bokning
- Encounter/check-in store — tider + state (kan kräva ORD-23a/41)
- Pre-flight: `dossier-bundle.documents` (HD/FC) + `card.allergies` (ORD-23)
- `Starta journal` → `journalType` från flow + journeyStep (koppling i 23a)

**Roll vs Zon 3 sticky:** Fas E = **besöksbundet** (idag). Sticky = **kundrelation generellt**. Undvik dubbla "Ta bild" utan tydlig hierarki — besök-CTA vinner när Fas E är synlig.

**OUT OF SCOPE Fas E:** permanent bokningslista; tidigare besök grupperat (ORD-41); full encounter-backend om Fas 0 visar gap.

---

## OUT OF SCOPE (ORD-25 — inte i första cutover)

- **Permanent kundresa-sektion** — endast länk "Visa kundresa ›" i insikter + journeyStep på dokumentrader
- **Permanent bokningslista** — kalender / Fas E när aktivt besök
- **Veckans mönster / analytiska insikter** — senare ORD
- **Tidigare besök grupperat per datum** — ORD-41 + ORD-23a (journal per encounter)
- **Full backend datamodell** — ORD-23a, ORD-24, ORD-41 (ORD-25 wire:ar bara befintliga payloads)
- **Referens-default som prod facit** — cutover ska använda v11, inte `renderV10ReferensDossierHtml`
- **Journal-editor i `patient-master-ui.js`** — utom bundle-fetch / cutover-flaggor

**Bort i v11-default-path (ska inte renderas före dokument):** `renderV11CustomerJourney`, `renderV11WeeklyPatterns`, `renderV11UpcomingBookings`, `renderV11ContextPanels` — dölj eller ta bort från `renderV11DossierZonesHtml` vid cutover.

---

## Acceptance Criteria

### Fas 0 (Codex)

- [ ] Facit dokumenterat: v11 + Fas E, inte referens-default
- [ ] Gap-lista: live / referens / v11-kod per sektion
- [ ] `dossier-bundle` validerad på ≥1 stickprovspatient (4 dokumentgrupper)

### Per fas (Cursor)

- [x] **Fas A:** CSS-tokens definierade · `npm test` PASS · ingen visuell regression
- [x] **Fas B:** Hero matchar v11-mockup · briefing (allergies eller fallback) · `--shadow-lift` · prod `a18b54e7`
- [x] **Fas C:** 4 dokument-grupper från `dossier-bundle` · filter-chips · tom-state om payload saknas
- [x] **Fas D:** 3 insikt-kort · sticky 1+2 · helper vid blocker
- [x] **Cutover:** `usesV11DossierCutover()` true i prod path · inga out-of-scope zoner i default
- [ ] **Fas E:** → [`ORD-25E-AKTIVT-BESOK-V2.md`](ORD-25E-AKTIVT-BESOK-V2.md) (ej påbörjad)

### Globalt

- [ ] V9 default-ON kvar (feature-flag intakt)
- [ ] Inga rosa/blå stripes/bruna checkmarks (v11-frusna val)
- [ ] 5 typstorlekar max (10/11/13/16/22)
- [ ] Hairstrand mellan zoner
- [ ] `npm test` PASS
- [ ] v11 verify script PASS (ny eller utökad)
- [ ] Mobile 380px (Codex UAT)

### Prod UAT (Codex, efter deploy)

- [x] Patient **utan** besök idag → ingen Fas E, v11 tre zoner (Abdelkader Bensahla, prod)
- [ ] Patient **med** besök idag → Fas E + pre-flight + journal-CTA (ORD-25E)
- [ ] Patient med HD-blocker → amber pre-flight + helper i sticky (ORD-25E)
- [x] `node scripts/verify-v11-paritet.js` — 49/50 PASS

---

## Risker + Mitigation

| Risk                                                     | Mitigation                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ORD-24 backend inte klar → Fas C blockerad               | Ship Fas A+B+D först, Fas C med tom-state                                                      |
| Befintlig journey-stepper-sektion ger regression         | Bevara render-funktion men sätt `display:none` med v11-flag, ta bort i ORD-25.2                |
| Sticky-knappar krockar med existerande footer-actions    | Audit `cco-v9-customers-parity.js` `renderActions()` först, refactor istället för dubbel-mount |
| 5-typstorlekar-disciplin bryter befintlig text-rendering | Lägg `--v11-fs-*` på root av v11-card, override via cascade                                    |

---

## När Cursor klar — Codex UAT

Se **Acceptance → Prod UAT** ovan. Codex äger deploy + manuell staff-UAT; Cursor äger verify-scripts.

---

## Byggordning (sammanslagen)

```
Fas 0 audit (Codex) → GO
  → Fas A tokens (Cursor)
  → Rensa out-of-scope zoner i v11-path (Cursor)
  → Fas B hero (Cursor)
  → Fas C dokument (Cursor)
  → Fas D insikter (Cursor)
  → Cutover PR (Cursor)
  → Codex deploy + UAT utan besök
  → Fas E Aktivt besök (Cursor)
  → Codex UAT med besök idag
  → ORD-23a/41 backend-gap (separata ORD, inte blockera cutover)
```

---

## Referens

- **Canonical mockup-spec:** `docs/handover/MOCKUPS/KUNDKORT-V11-LOCKED-2026-06-05.md`
- **Aktivt besök mockup:** `docs/handover/MOCKUPS/AKTIVT-BESOK-LOCKED-2026-06-17.md`
- **Fas E brief:** `ORD-25E-AKTIVT-BESOK-V2.md`
- **Document inventory:** `docs/reference/HAIRTP-DOCUMENT-INVENTORY-2026-06-05.md`
- **Backend deps:** ORD-23a (allergier, journal/besök) · ORD-24 (dokument-segment) · ORD-41 (besöksgruppering)
- **Render-path:** `public/major-arcana-preview/app/cco-v9-customers-parity.js`
- **Cutover/routing:** `public/major-arcana-preview/app/patient-master-ui.js` (`usesV11DossierCutover`)
- **CSS:** `public/major-arcana-preview/cco-v9-customers.css`
- **Slide-over (klar):** `ORD-26` — `cco-kundkort-slide-over.js`

---

_Uppdaterad 2026-06-17 · Fas A–D closed prod `a18b54e7` · Fas E utbruten till ORD-25E_
