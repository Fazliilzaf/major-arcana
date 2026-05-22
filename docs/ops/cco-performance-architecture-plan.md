# CCO prestanda-arkitektur (Fas P)

## Mål

Dropdown och klick ska kännas **direkta** när mejllistan syns. Filter/AnalyzeInbox får fortsätta i bakgrunden.

## Problem (rotorsak)

1. **Dubbel JS** — `app.bundle.min.js` + samma moduler som `app.js` laddades två gånger
2. **Full omritning** — varje klick kör `renderRuntimeConversationShell()` som ritar om kö + fokus + intel + studio (~113 kort)
3. **AnalyzeInbox blockerar upplevelsen** — bakgrundsanrop triggade ändå full render
4. **Dubbel bootstrap** — `selectRuntimeThread` + `loadBootstrap` + dubbel render i `finalizeRuntimeLoad`

## Fem åtgärder

| # | Åtgärd | Status | Effekt |
|---|--------|--------|--------|
| P1 | En JS-bundle (manifest → index utan dubletter) | Implementerad | ~40–50% snabbare parse/start |
| P2 | Scopad render (`queue` / `focus` / `all`) | Implementerad | Klick träffar färre DOM-noder |
| P3 | `scheduleRuntimeConversationShell` (rAF coalesce) | Implementerad | Flera state-mutationer → en render |
| P4 | AnalyzeInbox → `queue`-scope i bakgrund | Implementerad | UI klickbar medan filter fylls i |
| P5 | Trådval/mailbox → lätt render | Implementerad | Dropdown/klick svarar direkt |

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

## Nästa fas (ej i detta pass)

- Lit thread-card incremental update (ersätt innerHTML per kort)
- Virtualiserad kö vid >150 rader
- Ta bort iCloud-dubletter (`analyzeInbox 2.js` m.fl.)
