# ORD-18 — Porta Smart Nästa Steg + Capability-matrix till preview-SPA dossier

**Skapad:** 2026-06-04
**Owner-spår:** Cursor (write)
**Claude-spår:** UAT efter Cursor-deploy
**Blockerar:** ORD-17 DEL B.3 (radering av `/kunder.html`)
**Prio:** P1
**Status:** DONE (2026-06-04, commit pending deploy-verify)

---

## Bakgrund

ORD-16 portade v9-mockupens **design** till preview-SPA (10 steg, alla LIVE 2026-06-04, commit `94c32886`). Två logik-moduler från `/kunder.html` är dock **inte** porterade. De är de sista 2 av 10 features i `scripts/inventory-kunder-html-features.js` → kan inte raderas innan dessa portas.

| Modul             | Fil                                    | Bytes  | Public API                      |
| ----------------- | -------------------------------------- | ------ | ------------------------------- |
| Smart Nästa Steg  | `public/cco-kunder-smart-next-step.js` | 11 918 | `global.CcoKunderSmartNextStep` |
| Capability-matrix | `public/cco-kunder-actions.js`         | 10 262 | `global.CcoKunderActions`       |

Båda är IIFE:er som exponerar globalt namespace. Båda används idag från `public/cco-kunder-mobil-real.js` (mobil-shell utanför SPA).

---

## Scope (strikt)

### MÅL

Mounta båda modulerna i preview-SPA's dossier så `/kunder.html` kan avvecklas utan funktionsförlust.

### IN SCOPE

1. **Lägg båda filerna i SPA bundle**
   - Lägg `cco-kunder-smart-next-step.js` + `cco-kunder-actions.js` i `bin/bundle-manifest.json` (sources-array). Placera EFTER befintliga `app/cco-*`-entries men FÖRE `app/patient-master-ui.js` så globalerna är satta innan dossier-rendering läser dem.
   - Verifiera att `npm run build:bundle` genererar ny `app.bundle.<hash>.min.js` med båda inkluderade.

2. **Wira Smart Nästa Steg i SPA-dossier (desktop + mobil)**
   - I `public/major-arcana-preview/app/patient-master-ui.js`: hitta dossier-render-funktionen (v9-dossier-hero / dossier-body).
   - Anropa `CcoKunderSmartNextStep.renderPanel(card, { automation: card.automationSignals || [] })` och inject HTML i ny container med data-attribut `data-v9-smart-next-step`.
   - För mobil-vyn: använd `CcoKunderSmartNextStep.mountMobileWrap(html)` om mobile-paritet behövs i samma SPA-dossier.
   - Krav: `card.automationSignals` måste finnas — backend ger detta via `?includeAutomation=1` query (samma som `/kunder.html` redan använder).

3. **Wira Capability-matrix i SPA-dossier (desktop + mobil)**
   - I samma dossier-render: bygg `actionCtx = { tenant: 'hairtpclinic', role: currentRole, basePaths: {...} }` (kopiera från `cco-kunder-mobil-real.js` rad 499-571 som referens).
   - Anropa:
     ```js
     const dossierBar = CcoKunderActions.buildDossierBar(card, actionCtx);
     const actionsHtml =
       CcoKunderActions.renderMatrixLegend(dossierBar) +
       CcoKunderActions.renderActionsHtml(dossierBar, {
         hostId: 'v9-dossier-actions',
       });
     ```
   - Mounta `actionsHtml` i ny container med `data-v9-capability-actions`.
   - Efter mount: `CcoKunderActions.bindDossierHandlers(actionsHost, { ... })` för klick-handlers.

4. **Verify-script utökning**
   - Lägg till `step11SmartNextCapability()` i `scripts/verify-ord16-progress.js` som testar:
     - `data-v9-smart-next-step` i renderad HTML
     - `data-v9-capability-actions` i renderad HTML
     - `CcoKunderSmartNextStep` + `CcoKunderActions` i bundle (sök i `app.bundle.*.min.js`)
   - Förväntat: 13/13 PASS efter deploy.

5. **Inventory-script update**
   - Uppdatera `scripts/inventory-kunder-html-features.js`: regex för Smart Nästa Steg ska söka `data-v9-smart-next-step|CcoKunderSmartNextStep` i `previewBlob`.
   - Förväntat: `Safe to delete /kunder.html: YES` efter deploy.

### OUT OF SCOPE

- Ändra själva logiken i de 2 filerna (de är read-only i denna ORD)
- Radera `/kunder.html` (det är ORD-17 DEL B.3, separat order)
- 301 redirect (ORD-17 DEL B.2)
- Mobile-shell-paritet utanför SPA (det är `cco-kunder-mobil-real.js`, separat)
- Feature-flag default ON (ORD-17 DEL C, separat)

---

## Acceptance Criteria

- [x] `bin/bundle-manifest.json` innehåller båda filerna i rätt ordning
- [x] `npm run build:bundle` PASS lokalt
- [ ] Prod-bundle (`app.bundle.<hash>.min.js`) innehåller `CcoKunderSmartNextStep` + `CcoKunderActions` (väntar deploy)
- [ ] Öppna prod-dossier (`?view=customers&v9=on` → klicka kund) → Smart Nästa Steg-panel syns
- [ ] Samma dossier visar Capability-matrix actions-bar med korrekta disabled-reasons
- [ ] `node scripts/verify-ord16-progress.js` → 13/13 PASS
- [ ] `node scripts/inventory-kunder-html-features.js` → "Safe to delete /kunder.html: YES"
- [ ] Inga console-errors i Chrome DevTools på prod

---

## Risker + Mitigation

| Risk                                                                                  | Mitigation                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `CcoKunderSmartNextStep` finns inte när dossier renderas (ordning i bundle fel)       | Lägg dem TIDIGT i bundle-manifest, FÖRE `app/patient-master-ui.js`                                                                          |
| `automationSignals`-data saknas i SPA cards                                           | Verifiera att SPA's cards-fetch redan inkluderar automation (om inte: lägg till `?includeAutomation=1`)                                     |
| Capability-matrix kräver `actionCtx` med `tenant + role + basePaths` som SPA inte har | Kopiera ctx-bygget från `cco-kunder-mobil-real.js` 1:1                                                                                      |
| Bundle-storlek växer >50 KB över baseline                                             | Mät efter port — `cco-kunder-smart-next-step.js` (12 KB) + `cco-kunder-actions.js` (10 KB) = ~22 KB rå. Minified ~12 KB extra. Under target |
| Disabled-buttons triggar errors vid klick                                             | Båda modulerna har redan disabled-logik inbyggd; bara verifiera bindDossierHandlers monteras                                                |

---

## Referenser

- Inventory-script: `scripts/inventory-kunder-html-features.js` (rapporterar dessa 2 som saknade)
- ORD-17 plan: `docs/strategy/ORD-17-POST-V9-PORT-CLEANUP-2026-06-04.md` (DEL B.1)
- Mobil-användning som mall: `public/cco-kunder-mobil-real.js` rad 499-571
- Smart Next API-spec: `public/cco-kunder-smart-next-step.js` rad 227-234 (exports)
- Capability API-spec: `public/cco-kunder-actions.js` rad 338-348 (exports)

---

## När Cursor klar — Claude UAT

1. Triggera Render-deploy om auto-deploy hänger: `render deploys create srv-d8b3i3tckfvc73clgeng --confirm`
2. Vänta tills `/api/v1/_diag/version` rapporterar ny commit
3. Kör `node scripts/verify-ord16-progress.js` → måste vara 13/13 PASS
4. Kör `node scripts/inventory-kunder-html-features.js` → måste säga "Safe to delete YES"
5. Visuell UAT via Chrome MCP: öppna `?view=customers&v9=on`, klicka kund, verifiera båda panelerna syns
6. Console-check: inga `Uncaught ReferenceError: CcoKunderSmartNextStep is not defined` etc.

---

_Skapad av Claude · 2026-06-04 · pending Cursor write_
