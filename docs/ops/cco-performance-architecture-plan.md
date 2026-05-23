# CCO prestanda-arkitektur (Fas P)

## Mål

Dropdown och klick ska kännas **direkta** när mejllistan syns. Filter/AnalyzeInbox får fortsätta i bakgrunden.

## Problem (rotorsak)

1. **Dubbel JS** — `app.bundle.min.js` + samma moduler som `app.js` laddades två gånger
2. **Full omritning** — varje klick kör `renderRuntimeConversationShell()` som ritar om kö + fokus + intel + studio (~113 kort)
3. **AnalyzeInbox blockerar upplevelsen** — bakgrundsanrop triggade ändå full render
4. **Dubbel bootstrap** — `selectRuntimeThread` + `loadBootstrap` + dubbel render i `finalizeRuntimeLoad`

## Fem åtgärder

| #   | Åtgärd                                            | Status        | Effekt                                      |
| --- | ------------------------------------------------- | ------------- | ------------------------------------------- |
| P1  | En JS-bundle (manifest → index utan dubletter)    | Implementerad | ~40–50% snabbare parse/start                |
| P2  | Scopad render (`queue` / `focus` / `all`)         | Implementerad | Klick träffar färre DOM-noder               |
| P3  | `scheduleRuntimeConversationShell` (rAF coalesce) | Implementerad | Flera state-mutationer → en render          |
| P4  | AnalyzeInbox → `queue`-scope i bakgrund           | Implementerad | UI klickbar medan filter fylls i            |
| P5  | Trådval/mailbox → lätt render                     | Implementerad | Dropdown/klick svarar direkt                |
| P6  | Lit kö incremental + virtual scroll (>150)        | Implementerad | Ingen innerHTML-rebuild; DOM-pool + spacers |

## Scopes

- **`all`** — full render (kallstart, auth-byte)
- **`queue`** — arbetslista, lane-filter, mailbox-meny, historik-lista
- **`focus`** — fokusyta, kundintel, studio (ej hela kön)
- **`queue+focus`** — sammanslaget vid behov

## Verifiering

1. Hard reload `/admin#cco`
2. Mejllista syns → dropdown ska öppnas direkt (<200 ms)
3. Klick på tråd → fokus uppdateras utan att hela listan flimrar
4. Efter ~30–60 s får rader filter-chips (AnalyzeInbox bakgrund)
5. DevTools: `window.__getRenderStats()` — `runtimeShellSkipped` / `lastDurationMs`

## Deploy

```bash
npm run build:bundle
node bin/inject-bundle.js
git add public/major-arcana-preview/ docs/ops/cco-performance-architecture-plan.md bin/bundle-manifest.json
git commit -m "Perf: CCO scoped render, single bundle, background AnalyzeInbox"
```

## P6 — Lit kö (implementerad 2026-05-22)

- **Incremental:** `lit-switchover.js` håller `Map<threadId, arcana-thread-card>`, uppdaterar props/cluster-attribut och reorderar med `insertBefore` — ingen `listContainer.innerHTML = ''` vid normal render.
- **Virtual scroll:** vid `ordered.length > 150` monteras bara visible slice + overscan (~4 rader) i `[data-lit-virtual-mount]`; top/bottom-spacers (~88px/rad) bevarar scroll-höjd i `.queue-history-list`.
- **Signatur:** full ordnad lista (id, selected, cluster, nyckelprops) — scroll-only uppdateringar bypassar signatur via `{ fromScroll: true }`.

## Fas P2 — Light bootstrap + lazy body (deploy `ab6c60e`)

| #   | Åtgärd                                                                 | Var                                                         | Effekt                                                       |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| P2a | Light bootstrap (`scope=light`) vid trådval                             | `resolveBootstrapScope` → `loadBootstrap({ quiet: true })`  | Skippar Patient360-sync, portal-overview och aftercare-kö    |
| P2b | Lazy history: `includeBodyHtml=0` vid trådval                         | `fetchRuntimeThreadHistoryPayload` (default `false`)        | Mindre payload vid klick; metadata/preview räcker för fokus  |
| P2c | Full body vid studion                                                    | `ensureSelectedRuntimeThreadHistoryBody` + `includeBodyHtml: true` | bodyHtml/signatur laddas först när svarsstudion öppnas       |
| P2d | Uppskjutna aux-shell-renders                                           | ~~`requestIdleCallback`~~ → borttagen (P4a); lazy via `setAppView` | Aux-vyer mountas först vid besök |
| P2e | Bootstrap-cache + metrics                                              | `BOOTSTRAP_CACHE_TTL_MS` (45 s), `bootstrapCacheHits`       | Upprepade trådval inom TTL undviker nätverksbootstrap        |

### Verifiering (Fas P2)

1. Hard reload `/admin#cco`, logga in, vänta tills mejllistan syns.
2. DevTools → Network: vid trådval ska `bootstrap?scope=light` synas (debouncad ~300 ms efter klick).
3. Vid trådval: `runtime/history?...&includeBodyHtml=0` — **inte** `includeBodyHtml=1`.
4. Öppna svarsstudion → `includeBodyHtml=1` (eller dedikerad body-fetch via `ensureSelectedRuntimeThreadHistoryBody`).
5. Byt tråd två gånger inom 45 s → andra anropet ska träffa cache (`bootstrapCacheHits` ökar).
6. DevTools: `window.__getRenderStats()` — kontrollera `bootstrapLastScope: "light"`, `bootstrapNetworkLoads`, `bootstrapLastDurationMs`.

## Fas P3 — content-visibility + render stats (deploy `ab6c60e`)

| #   | Åtgärd                                      | Var                                                                 | Effekt                                                              |
| --- | ------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P3a | `content-visibility: auto` på dolda vyer    | `styles.css` — `.preview-shell[hidden]`, `[data-shell-view][hidden]` m.fl. | Webbläsaren skippar layout/paint för dolda shell-vyer               |
| P3b | `contain-intrinsic-size` placeholder       | samma regler (`auto 720px`)                                         | Stabil scroll-yta när dolda paneler blir synliga                    |
| P3c | Bootstrap-fält i render stats               | `window.__getRenderStats()`                                         | Synlighet för cache-träffar, scope och nätverksbootstrap-latens     |

### Verifiering (Fas P3)

1. DevTools → Elements: dold `[data-shell-view]` ska ha `content-visibility: auto` (computed).
2. Växla shell-vy (t.ex. automation/customers) — inget layout-hopp i conversations-ytan.
3. DevTools Console:

   ```js
   window.__getRenderStats()
   // Förväntat: bootstrapCacheHits, bootstrapLastScope, bootstrapLastDurationMs, bootstrapNetworkLoads
   // plus befintliga runtimeShellSkipped / lastDurationMs
   ```

4. Performance-profil: färre style/recalc vid initial load jämfört med fas före P3 (dolda vyer ska inte målas).

## Fas P4 — Lazy aux-mount + history pagination (2026-05-23)

| #   | Åtgärd | Var | Effekt |
| --- | ------ | --- | ------ |
| P4a | Ta bort startup `requestIdleCallback` för aux-shell | `app.js` init | automation/integrations/macros/settings renderas inte före första `setAppView`-besök |
| P4b | Lazy aux via `setAppView` | `setAppView` (customers, analytics, automation, …) | Första besök per vy laddar data + render; inget idle-förrender vid kallstart |
| P4c | History pagination spike | `toCcoRuntimeHistoryQuery` + handler | Valfria `limit`/`offset`; trådfråga med `limit` returnerar senaste N meddelanden |
| P4d | Klient skickar `limit` vid trådval | `fetchRuntimeThreadHistoryPayload` (default 80, ej vid `includeBodyHtml=1`) | Mindre initial historik-payload vid trådval |

### Verifiering (Fas P4)

1. Hard reload `/admin#cco` — inga nätverksanrop till automation/integrations/macros/settings före navigering.
2. Första besök på Automation/Integrationer/Makron/Inställningar triggar render + ev. live-laddning.
3. DevTools → Network vid trådval: `runtime/history?...&includeBodyHtml=0&limit=80`.
4. Öppna svarsstudion → `includeBodyHtml=1` utan `limit` (full body).
5. API-test: `tests/capabilities/ccoRuntimeHistory.test.js` (limit-pagination).

## Nästa fas (ej i detta pass)

- Ta bort iCloud-dubletter (`analyzeInbox 2.js` m.fl.)
- Backfill/virtual-tuning om radhöjd varierar kraftigt (cluster expand)
