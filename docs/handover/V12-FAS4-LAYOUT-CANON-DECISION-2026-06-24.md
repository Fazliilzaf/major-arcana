# V12 Fas 4 — Layout-canon-beslut · 2026-06-24

**Status:** Beslutsunderlag. Inväntar owner-val innan kod. Detta är det enda kvarvarande gapet mot facit-"100%" — allt innehåll (13 moduler) är klart och verifierat (se [V12-WORKSPACE-FACIT-GAP-2026-06-23.md §0](V12-WORKSPACE-FACIT-GAP-2026-06-23.md)).
**Scope:** V12 kundarbetsyta (Zon 2) — hur den öppnas och hur companion-railen (Zon 1) ser ut. Webb + iPad + mobil.
**Facit:** `V12-WORKSPACE-CONTENT-CANON-2026-06-21.html` (Zon 2, innehåll) + JOURNEY-SPINE-riktningen (layout). Båda i iCloud / Major Arcana 2.0.
**Relaterat:** [V11-RAIL-CANON-DECISION-2026-06-21.md](V11-RAIL-CANON-DECISION-2026-06-21.md) (owner valde **C · Hybrid** för railen), [V12-FACIT-PARITY-BACKLOG-2026-06-23.md](V12-FACIT-PARITY-BACKLOG-2026-06-23.md).

---

## 1. Problemformulering

V12 är **innehållsmässigt klar** men öppnas/ramas in på ett annat sätt än facit:

| Aspekt                 | Live idag                                                                  | Facit / JOURNEY-SPINE                                          |
| ---------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Hur Zon 2 öppnas       | Overlay som fälls upp efter klick på en **sektion** i den lilla V11-railen | Full sida — arbetsytan **är** vyn                              |
| Companion-rail (Zon 1) | Hela V11-railen bredvid/bakom (full bredd, alla sektioner)                 | Minimal **320px jump-rail** (ankare/navigering, inte innehåll) |
| Första kundklicket     | Visar V11-railen; V12 kommer först vid sektionsklick                       | Kund → direkt in i arbetsytan                                  |

Vidare CSS-polish ger regressioner tills **en** layout-canon är vald. Detta är ett beslut bara du kan ta — facit och nuvarande implementation är två konkurrerande sanningar.

---

## 2. Verifierat nuläge (fakta, ej gissning)

- V12 default **ON** på prod (`cco-v12-workspace-flag.js`, opt-out).
- Sektionsordning 1→13 är **exakt match** mot facit; alla 13 moduler finns; rent `.v12-workspace__*`-namespace.
- Overlay-modellen: `.v9-dossier-deep--v12-workspace` blir `position:fixed; inset:0; z-index:12080` när `html[data-v12-workspace="on"]` (cco-v12-workspace.css §överst). Den **ersätter inte** första kundklicket — railen visas först, V12 vid sektionsklick.
- Responsivt: mobil (<768) → V12 äger hela ytan, Zon 1 döljs redan idag. iPad/webb (≥768) → Zon 1-rail bredvid Zon 2. **Mobil är alltså redan nära facit; gapet är störst på webb/iPad.**

> Implikation: mobilbeteendet behöver minst arbete. Beslutet rör i praktiken **webb + iPad**.

---

## 3. Beslutsalternativ

### Alternativ A · Facit är canon (full sida + minimal jump-rail)

Kund-klick → går **direkt** in i V12 full-sida. Zon 1 ersätts av en 320px jump-rail (ankarlänkar till de 13 modulerna), inte en innehållsrail.

- **För:** Ren visuell sanning, matchar JOURNEY-SPINE, enklare mental modell (en vy), bäst på webb/iPad.
- **Emot:** Störst ombyggnad — tar bort rail-sektionsklick-flödet som många handlers hänger på (`data-v9-section-link`, `data-kk-jump`). Kräver ny jump-rail-komponent + omdirigering av kundklick.
- **Risk:** Medel-hög. Rör navigerings-/öppningslogiken, inte modulerna.
- **Est. omfång:** ~5–8 arbetsdagar (flaggad), inkl. responsiv jump-rail + regressionssvep.

### Alternativ B · Behåll overlay + full rail (status quo)

Ingen layout-ändring. Endast kvarvarande detalj-polish (Dokument-gruppering, Insikter grön-kort, palett-ton).

- **För:** Noll layout-risk, allt fungerar, handlers orörda. Snabbast till "klart".
- **Emot:** Avviker från facit på webb/iPad (overlay vs full-sida; full rail vs jump-rail). "100% mot facit" uppnås inte på layout-axeln.
- **Est. omfång:** ~1–2 dagar (bara polish).

### Alternativ C · Hybrid (rekommenderad)

V12 öppnas **full-sida vid första kundklicket** (som facit), men companion-railen behålls som en **kollapsad jump-rail** som expanderar på begäran. Återanvänder befintliga `data-kk-jump`/section-link-handlers som ankare → mindre rivning.

- **För:** Når facit-känslan (full sida + jump-rail) utan att slänga den fungerande navigerings-infran. Konsekvent med rail-canon-beslutet (owner valde redan Hybrid för railen 06-21).
- **Emot:** Något mer CSS-state (kollaps/expand) än A.
- **Risk:** Låg–medel. Bygger på befintliga handlers.
- **Est. omfång:** ~3–5 arbetsdagar (flaggad).

---

## 4. Rekommendation

**Alternativ C · Hybrid.** Det landar facit-layouten (full-sida + jump-rail) till lägst risk genom att återanvända navigerings-handlers vi redan verifierat, och är linjärt konsekvent med Hybrid-valet för V11-railen (06-21). A är "renare" men dyrare och rör öppningslogiken mest; B når inte facit på layout-axeln.

Allt byggs bakom befintlig flagga (`cco-v12-workspace-flag.js`) så det kan rullas ut opt-in först.

---

## 5. Vad du behöver besluta

1. **Layout-modell:** A (full-sida, ren) · **C (hybrid, rekommenderad)** · B (behåll overlay).
2. **Jump-rail vid A/C:** 320px ankarrail enligt facit — eller annan bredd/placering?
3. **Mindre kvarvarande (kan tas oavsett 1–2, kosmetiskt):**
   - Dokument: facit 2-kol-kort vs nuvarande 3 subsektioner (offers/autodocs/files)?
   - Insikter: grön "Möjlighet"-kort-styling åtskild från amber "Gör nu"?
   - Palett-ton Zon 2: bekräfta LOUD amber (`--amber-bg .16`) — **inte** dämpad (dämpning gällde bara Zon 1).

När du valt 1 (+ 2) bygger jag enligt valet, flaggat, med synthetic-render-verifiering per delsteg.

---

_Underlag sammanställt 2026-06-24 från facit-läsning + källkods-verifiering. Endast dokumentation — ingen kodändring._
