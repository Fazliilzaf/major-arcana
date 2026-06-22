# V11 Rail — Slutpass / Cutover-granskning (2026-06-22)

Read-only audit av V11 Rail efter att alla canon-sektioner (REWRITE · MERGE ·
KEEP · LATER) byggts och mergats till `main` (t.o.m. PR #141, commit `e889f27`).

**Mål:** beslutsunderlag för cutover (flippa default ON). **Inget sektionsbygge.
Ingen cutover utan separat Codex-godkännande.**

---

## 1. render()-ordning — komplett ✅

`CcoV11Rail.render(ctx)` renderar i exakt canon-ordning:

```
D → A → V → B → C → E → F → G → H → I → J → K → L → M → N → O → P → Q → R → S
```

- 20 sektioner närvarande, verifierat via render-harness (20/20).
- `BLOCK: 20`.
- Villkorad rendering: V visas endast vid synligt aktivt besök; B/H/I/J/K/L/M/N/O/P/Q/R
  har explicita empty-states; S renderas endast när rail-innehåll finns ovanför.

## 2. Adapter ↔ renderer-paritet ✅

- 20 `build*`-adaptrar exporteras i `CcoV11RailAdapters` (+ `v11RailEmpty`-helper).
- 20 `render*`-funktioner i `CcoV11Rail`.
- Inga saknade/överblivna sektioner. (`buildHistoryBookings` förekommer endast i
  en JSDoc-kommentar, inte som export.)

## 3. Inga nya handlers ✅

- **0** `addEventListener` i `cco-v11-rail.js` / `cco-v11-rail-adapters.js`.
- **1** inline `onerror` (M Photos thumbnail-fallback) — presentationellt, tillåtet
  av app-CSP (`script-src 'unsafe-inline'`), ingen workflow-handler.
- Alla interaktiva element återanvänder BEFINTLIGA, godkända data-attribut:
  - `data-v11-active-visit-action` (V) · `data-kk-jump` / `data-kk-med-form` (E/F)
  - `data-kk-sig` / `-sig-label` / `-patient-id` (G)
  - `data-v9-section-link` (H/I/J) · `data-v9-quick="confirm"` (H) / `"reply"` (P)
  - `data-kk-ord48-open-calendar` / `-cal-footer` / `data-kk-patient-id` (S)
  - `data-v11-doc-row` / `-registry` / `-previewable` / `-filler` / `-status` (K/L)
  - `data-photo` (M lightbox) · native-länk (M/N) · `data-v11-rail-edit-profile` (A)

## 4. Feature-flagga — default OFF, opt-in ✅

`cco-v11-rail-flag.js` (laddas i index.html rad 8, före bundle):

- `?v11rail=on` → `localStorage arcana.v11rail.enabled = '1'` (sticky ON)
- `?v11rail=off` → `'0'` (sticky OFF)
- inget query → `enabled = (localStorage === '1')` → **default OFF (opt-in)**
- sätter `document.documentElement[data-v11-rail] = 'on'|'off'`.
- Isolerad från `cco-v9-flag.js`; ändrar inte v9/v10-flaggor.

## 5. Mount-switch — additiv, guardad ✅

`patient-master-ui.js` `renderV9MockupDetailShell`:

```js
if (usesV11Rail()) {            // data-v11-rail === 'on'
  return renderV11RailDetailShell(...);
}
// default OFF → all legacy-path nedan körs HELT oförändrad
```

- Enda legacy-kontaktpunkten (canon §5). Tidig return; ingen legacy-kod ändrad.

## 6. Legacy oförändrad utan flagga ✅

- Logiklagren orörda av V11-arbetet (senaste commits pre-Fas3):
  `cco-v9-customers-parity.js`, `cco-kundkort-kkx.js`, `cco-kundkort-referens.js`,
  `cco-kunder-smart-next-step.js`.
- `patient-master-ui.js` rördes senast av Block 4 (mount-switch + shell, additivt).
- V11-railen läser dessa lager read-only (sortSignals, resolveReferensBookingExtras,
  resolveV11DocumentPayload, buildEconomyFields, buildCanonicalJourneyLive).

## 7. Laddning / bundling ✅

- `index.html`: flagga (rad 8) + `cco-v11-rail.css` (rad 147) + `app.bundle.*.min.js`.
- `bin/bundle-manifest.json`: `app/cco-v11-rail-adapters.js` + `app/cco-v11-rail.js`.
- Legacy logiklager laddas individuellt (referens/parity/kkx/smart-next-step) →
  finns vid runtime för railens read-only-återanvändning.
- Bundlen byggs vid deploy från manifestet (gitignorad artefakt).

## 8. Helhetsscreenshots 390/820/1440

- Ny fixture `tests/visual/fixtures/v11-rail-full.html` + `scripts/shot-v11-rail-full.mjs`
  - `gen-v11-rail-full-preview.mjs` matar data för VARJE sektion → hela railen i ett svep.
- Workflow `v11-rail-screenshots` laddar upp `v11-rail-full-screenshots` (390/820/1440).
- Browserlös `docs/handover/MOCKUPS/v11-rail-full/viewport-preview.html` committad.

---

## Gap / blockers inför cutover

**Inga funktionella blockers funna.** Noteringar att besluta om före default ON:

1. **KEEP-deep-links är "graceful" i ren rail-only** — `data-v9-section-link`,
   `data-v9-quick`, `data-kk-jump`, `data-v11-doc-*` är dossier-/document-scoped
   handlers som i full rail-only-läge inte har sin Zon 2-värd. De är harmlösa
   no-ops tills Zon 2/legacy-detaljvyn samexisterar. **Cutover-beslut:** avgör om
   Zon 2-värdarna ska wire:as i rail-läge, eller om deep-links får förbli graceful
   i v1. (Dokument-delegerade handlers — ord48 Boka nästa, kk-sig G — fungerar
   redan fullt ut.)
2. **Pre-existing CI** (npm audit, smoke 15-min timeout, unit/coverage hang) är
   identiska med main sedan PR #121 — inte V11-orsakade, men bör grönas separat
   som CI-hygien (oberoende av cutover).
3. **Bundle cache-bust** — `index.html` bundle-hash uppdateras av deploy-pipen;
   säkerställ att cutover-deployen bygger om bundlen så senaste adapter/renderer
   ingår.

## Rekommendation

V11 Rail är funktionellt komplett, paritetssäkrad och isolerad bakom default-OFF-flagga.
Tekniskt redo för cutover-beslut. Föreslår: Codex granskar helhetsscreenshots +
denna audit, beslut om punkt 1 (deep-link-wiring i rail-läge), därefter separat
cutover-PR som enbart flippar default.
