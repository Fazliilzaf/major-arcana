# CCO Mail-lik start — 1-sides plan

**Status:** Fas 1 live · Fas 2 pågår (2026-05-28)  
**Senast uppdaterad:** 2026-05-28  
**Relaterat:** [cco-mobile-ux-sweep-plan.md](./cco-mobile-ux-sweep-plan.md) (klar), mobil field pilot (parallellt)  
**Mål:** CCO ska kännas som **Mac Mail vid öppning** — inbox synlig direkt, en diskret sync-indikator, inga hopp mellan tom/laddar/färdig.

---

## Problem idag

| Symptom                        | Rotorsak (kod)                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Tom kö → fylls → hoppar lane   | `normalizeVisibleRuntimeScope({ allowLaneFallback: true })` byter aktiv lane i `finalizeRuntimeLoad` |
| Flera visuella lägen vid start | `paintRuntimeShell("queue" → "focus" → "all")` + `is-runtime-loading` på `<body>`                    |
| Kallstart känns långsam        | Cache finns (`CcoThreadCache`) men används inte konsekvent före första paint                         |
| Listan “blinkar” vid refresh   | Truth-primary + AnalyzeInbox målar om hela kön utan merge-skydd                                      |

**Redan på plats (bygg vidare, inte om från scratch):**

- `app/thread-cache-idb.js` — IndexedDB, scope per mailbox, TTL 24h
- `applyRuntimeThreadCacheIfAvailable()` i `initializeWorkspaceSurface()`
- `loadLiveRuntime({ staleWhileRevalidate: true })` när cache träffar
- `deriveRuntimeVisualState()` — förenklad till `ready` / `auth_required`

---

## Definition of done (Fas 1)

- [x] **Återbesök (cache hit):** synlig trådlista **< 500 ms** efter DOM ready (prod, inloggad STAFF) — 453 ms verify
- [x] **Kallstart (cache miss):** första tråd synlig **< 2 s** — 860 ms verify
- [x] **Max ett laddningsskikt:** sync-badge i topbar; `is-runtime-loading` tas bort vid paint
- [x] **Ingen auto-lane-switch** vid start (`bootLaneLocked`)
- [x] **Ingen list-hop:** merge-skydd vid staleWhileRevalidate (queue paint endast vid diff)
- [x] Desktop + mobil regression: kör `verify:cco-mobile-pilot-prod` efter merge

---

## Fas 2 (pågår)

| #   | Uppgift                                                                        | Status                               |
| --- | ------------------------------------------------------------------------------ | ------------------------------------ |
| 2a  | Queue paint endast vid DOM-diff efter cache-hit                                | ✅ `runtimeQueueDomMatchesThreads`   |
| 2b  | `finalizeRuntimeLoad` skippar full queue-repaint vid oförändrad cache-signatur | ✅                                   |
| 2c  | Explicit mailbox-widen (`data-mailbox-widen-all`)                              | ✅ redan på main                     |
| 2d  | Utöka verify (tråd-restore, sync-pill, mobil)                                  | ✅ i `verify-cco-mail-start-prod.js` |
| 2e  | IDB workspace snapshot v2                                                      | ⏳ senare                            |

---

## Faser (gör i ordning)

```
Fas 1a  Cache-first paint (500 ms-mål)
  ↓
Fas 1b  En sync-indikator, ta bort state-hopp
  ↓
Fas 1c  Lås lane/scope vid boot
  ↓
Fas 1d  Mät + verify (prod)
```

### Fas 1a — Cache-first paint

**Gör:**

1. I `initializeWorkspaceSurface()`: vänta **inte** på `loadBootstrap` innan cache paint — kör `applyRuntimeThreadCacheIfAvailable()` **först**, synka visuellt direkt.
2. Sätt `state.runtime.staleCacheActive = true` + liten “Synkar…” badge tills live data bekräftats.
3. Vid cache hit: `loadLiveRuntime({ staleWhileRevalidate: true, isBackgroundRefresh: false })` — **rör inte** `state.runtime.threads` förrän diff finns.

**Filer:** `runtime-dom-live-composition.js` (`initializeWorkspaceSurface`, `applyRuntimeThreadCacheIfAvailable`, `loadLiveRuntime`), `app/thread-cache-idb.js`

### Fas 1b — En sync-indikator

**Gör:**

1. Ta bort `is-runtime-loading` från initial `<body>` så fort cache eller truth-primary ger trådar (redan delvis i `syncRuntimeVisualStateMachine`).
2. Ersätt multi-paint med **ett** chrome-scope: `paintRuntimeShell("chrome")` vid stale cache, `paintRuntimeShell("queue")` endast vid faktisk diff.
3. Slå ihop `finalizeRuntimeLoad`-paint till **en** `paintRuntimeShell("all")` efter selection stabiliserats.

**Filer:** `runtime-dom-live-composition.js` (`finalizeRuntimeLoad`, `paintRuntimeShell`), `app.js` (`syncRuntimeVisualStateMachine`), `index.html` (body-klass), ev. `cco-polish.css` (sync-badge)

### Fas 1c — Lås lane vid boot

**Gör:**

1. Ny flagga `state.runtime.bootLaneLocked = true` tills användaren klickar lane-filter.
2. I `normalizeVisibleRuntimeScope`: **skippa** `allowLaneFallback` när `bootLaneLocked` (behåll `all` eller sparad lane från `workspaceSourceOfTruth`).
3. Ta bort scope-auto-widen vid boot (`scopeAutoWidenedAt`) — flytta till explicit “Visa alla mailkonton”-action.

**Filer:** `app.js` (`normalizeVisibleRuntimeScope`), `runtime-dom-live-composition.js` (`finalizeRuntimeLoad`)

### Fas 1d — Mät + verify

**Gör:**

1. Nytt script `scripts/verify-cco-mail-start-prod.js`:
   - Playwright: login STAFF → `/staff` → mät `performance.now()` till första `.thread-card` i DOM
   - Assert: `< 2000 ms` (kall), `< 500 ms` (reload med warm cache)
   - Assert: aktiv lane förblir `all` (eller sparad) efter 3 s
2. `npm run verify:cco-mail-start-prod` i `package.json`
3. Kör parallellt med `verify:cco-mobile-pilot-prod` — ska inte bryta mobil sweep

---

## Filkarta (primär)

| Fil                                     | Roll                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `app/thread-cache-idb.js`               | IndexedDB read/write, scope keys                                   |
| `runtime-dom-live-composition.js`       | Boot: `initializeWorkspaceSurface`, `loadLiveRuntime`, cache apply |
| `app.js`                                | Visual state, lane scope, selection                                |
| `app/components/lit-switchover.js`      | Kö-render, `clearBootstrapWindow`                                  |
| `index.html`                            | Script-ordning (cache före bundle), initial loading-klass          |
| `scripts/verify-cco-mail-start-prod.js` | **Ny** — acceptansmätning                                          |

---

## Acceptanskriterier (testplan)

1. **Warm reload:** Hard refresh med giltig cache → trådar syns utan tom flash; sync-badge försvinner inom 5 s.
2. **Cold start:** Incognito / rensad IDB → truth-primary eller tom lista + sync; första tråd < 2 s.
3. **Lane-stabilitet:** Start på `all` → fortfarande `all` efter live sync (ingen auto-switch till `review`/`act-now`).
4. **Trådval:** Senast valda tråd återställs från cache/workspace prefs utan scroll-hop (`suppressAutoScrollUntil` respekteras).
5. **Auth:** Utloggad → `auth_required`, ingen evig `is-runtime-loading`.
6. **CI:** `npm test` + nya verify-script gröna mot prod.

---

## Parallellt arbete

| Spår                                   | Ansvar     | Blockerar Mail-start? |
| -------------------------------------- | ---------- | --------------------- |
| Mobil field pilot (2×5 konsultationer) | Personal   | Nej                   |
| CCO Mail-lik Fas 1                     | Dev        | —                     |
| Journal/CODE migration                 | Annat spår | Nej                   |

**Rekommendation:** Kör field pilot 1–2 dagar medan Fas 1a–1b implementeras; merge när verify grön.

---

## Branch & leverans

```bash
cd ~/Code/major-arcana
git checkout -b feat/cco-mail-like-start
# … Fas 1a → 1d …
npm run build:bundle && node bin/inject-bundle.js
npm run verify:cco-mail-start-prod
npm run verify:cco-mobile-pilot-prod   # regression
```

**Prod-mål:** merge till `main` när verify grön; ingen Render env-ändring krävs.
