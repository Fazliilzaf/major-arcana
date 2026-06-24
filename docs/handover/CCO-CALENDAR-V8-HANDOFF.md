# CCO Kalender v8 — implementations-handoff (för parallell tråd)

> **Klistra in / peka denna tråd hit.** Du implementerar den nya CCO-kalendern. En annan tråd bygger parallellt på V12-kunddossiern — håll er till fil-/branch-gränsen nedan så ni inte krockar.

## 0. FALLGROPAR — läs först (så det inte blir fel)

1. **Eget worktree, inte bara egen branch.** Om båda trådarna kör `npm run build:bundle` i samma `ord25g`-worktree skriver ni över varandras bundle. Skapa eget worktree → egen preview-port.
2. **Detta är en UPPGRADERING, inte en omskrivning.** Live-kalendern fungerar redan (141 bokningar, historik, bokning→kund-koppling, mobilkalender — verifierat 2026-06-24). Behåll all befintlig funktion + boknings-datalagret; lägg v8 ovanpå. **Regrera inget.**
3. **"Magi"-funktionerna får INTE fejkas.** v8 har voice booking, Apple Watch, AI-sparkles, predictive gold-dots, lugnt läge, vibe-väder, conflict-spider-web. Många saknar backend/datakälla idag. Regel: bygg UI:t men koppla mot **riktig data eller empty/unknown-state**. Bygg ingen fejk-AI/fejk-prediktion som bara låtsas. Saknas datakälla → **flagga som data-blockerat** (lyft till owner/Codex).
4. **Mobil också, inte bara desktop** (`booking-mobile-*.js`). v8:s responsiva lägen (iPad bottom-sheet, mobil compact) ska med.
5. **Små PR:er per fas, inte en jätte-PR.** P1 (kärna) → granska/merga → P2 → P3. 17 interaktioner i en PR blir ogranskningsbart.
6. **#17 kunddossier-panel: koordinera ctx med V12-tråden.** Behöver du ändra hur dossiern renderas → be V12-tråden göra det. Rör inte V12-filerna själv.
7. **Skarpa write-flöden (boka/omboka/avboka): verifiera att de ÖPPNAS, fullborda inte mot riktig data utan klartecken.** Inga nya write-handlers utan owner/Codex-godkännande.
8. **Rapportera PLANEN innan bygge.** Visa hur du tänker mappa v8 → befintliga filer + faseindelning, vänta på OK.

## 1. Uppdrag

Implementera **`calendar-mockup-v8.html`** som CCO:s kalender-sektion (`view=calendar`). Den ersätter nuvarande live-kalender (enklare veckogrid).

**Vald design (owner-beslut 2026-06-24, Fazli).** Mockup:
`~/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/major-arcana-pr96/public/calendar-mockup-v8.html` (3608 rader, fullinteraktiv, egen JS).

## 2. Var koden bor / serveras ← EXAKT MOUNT, så det inte blir fel

- **Worktree som servar live-appen:** `/Users/fazlikrasniqi/Code/major-arcana/.claude/worktrees/ord25g` (CCO-staff-appen). Preview körs därifrån.
- **URL / route:** `/staff?...&view=calendar`.
- **Exakt mount-punkt i DOM (verifierad live):**
  `[data-app-view="calendar"]` (`.preview-canvas.is-active`) → `div.preview-workspace` → **`.calendar-shell`**.
  Det är HIT kalendern renderas. **Rendera v8 IN i `.calendar-shell` på calendar-vyn — skapa INTE en separat fristående sida/route.** Behåll `data-app-view="calendar"`-routingen och lazy-load-kontraktet.
- **Live-kalenderns källfiler (i `public/major-arcana-preview/` ROTEN, INTE i `app/`) — det är DESSA du uppgraderar:**
  - `booking-desktop-week.js` (1131 rader) — **desktop-veckogrid** (huvudfilen).
  - `booking-mobile-shell.js` (151) + `booking-mobile-calendar-day.js` (517) + `booking-mobile-slot-picker.js` — **mobil**.
  - `booking-calendar-shared.js` (1089) — **delad logik/data** (bokningar, helpers).
  - `booking-lazy-load.js` (164) — **lazy-loader** för kalendern (behåll kontraktet).
  - `cco-calendar.css` (1211) — **stilar** (lägg v8-tokens/klasser här).
  - View-host/routing sätts i `app.js` + `runtime-overlay-renderers.js` — rör bara om nödvändigt, koordinera då.
- **OBS:** live-kalendern använder EGNA klasser (inte mockupens `.calendar-surface/.calendar-week`). Du för in v8:s markup/klasser i dessa befintliga filer — ersätt render-innehållet, behåll mount + routing + data-lager.
- **Bundle-pipeline:** gitignorerade bundles. Efter JS-ändring: `npm run build:bundle && node ./bin/inject-bundle.js`. CSS laddas separat (ingen rebuild). `index.html` committas EJ (regenereras vid deploy).

## 3. Fil-/branch-gräns (KRITISKT — undvik krock med V12-tråden)

- **Egen branch:** `claude/cco-calendar-v8` (och gärna eget worktree — två trådar som bygger om bundlen i SAMMA worktree skriver över varandra).
- **Du äger:** kalender-sektionen — `booking-desktop-week.js`, `booking-mobile-shell.js`, `booking-mobile-calendar-day.js`, `booking-mobile-slot-picker.js`, `booking-calendar-shared.js`, `booking-lazy-load.js`, `cco-calendar.css` (alla i `public/major-arcana-preview/`-roten).
- **Rör INTE (V12-tråden äger):** `cco-v12-workspace.js/.css`, `cco-v11-rail*.js`, `patient-master-ui.js` kunddossier-render.

## 4. Sömmen: Interaktion 17 — KUNDDOSSIER (v8:s signatur)

Klick på en bokning byter **högerpanelen** till **kundens dossier**. Detta rör V12-data.

- **Gör:** bygg kalender-skalet + panel-ytan + klick→öppna-dossier-flödet.
- **Gör INTE:** bygg om dossier-renderingen. **Återanvänd** den befintliga V12-/V11-dossier-renderingen (`CcoV12Workspace.render(ctx)` / V11-rail). Skicka kundens id/ctx in i den befintliga renderaren.
- Koordinera med V12-tråden om ctx-kontraktet behöver justeras (då tar V12-tråden den ändringen).

## 5. De 17 interaktionerna (förslag på etappordning)

**P1 — kärna (gör först):** grid 06–23 + veckogrid, bokningar (status/källfärg), NU-linje, kapacitetsstaplar, vy-lägen Morgon/Vecka/Dag/Resurs (`setMode`), toolbar (vecka-pill, status-pills, nav/Idag).
**P2 — operativ kraft:** drag-to-reschedule (snap-indicator + esc), bokningsdetalj, **Interaktion 17 kunddossier-panel**, conflict-spider-web (7), predictive gold-dots (6).
**P3 — avancerat/polish:** Morgon-standup story-view (5), no-show-vibrato (8), density-toggle (11), lugnt läge (12), tid-maskin-slider (13), dra-från-mejl→slot (14), avatar-bubblor (15), vibe-väder (16), Apple Watch-widget (9), Voice booking (10).

> Märk varje interaktion mot riktig data. Saknas datakälla (t.ex. predictive/AI/voice/watch) → bygg UI:t men koppla mot empty/unknown-state eller flagga som data-blockerat. **Ingen fejkdata.**

## 6. Datakällor (återanvänd befintligt)

- Bokningar: kalenderns befintliga boknings-datalager (samma som live-kalendern + `CcoKundkortKkx.resolveReferensBookingExtras`, `buildBookingsFromExtras`).
- Kunddossier (för #17): `dossier-bundle`-endpoint via V12-renderaren.
- Personal/resurser: befintlig staff-data.

## 7. Governance (gäller även dig)

- Egen PR per avgränsad del. **Stoppa för Codex-granskning innan merge.**
- Ingen fejkdata; empty/unknown-state vid saknad data.
- Inga nya write-handlers (skarpa bokningsskrivningar) utan owner/Codex-godkännande — verifiera att flöden _öppnas_, fullborda inte skarpa skrivningar utan klartecken.
- Verifiera mot preview (desktop + mobil), posta screenshot/testbevis i PR.

## 8. Verifiering

Preview-MCP mot `view=calendar`. Bekräfta: kalender öppnas, bokningar renderar, vy-lägen växlar, drag fungerar, #17 öppnar rätt kunddossier, 0 console-fel, responsivt (mobil/iPad/webb).

---

_Skapad 2026-06-24 av V12-tråden. Relaterat underlag: `docs/handover/V12-SPEC-*`, `V12-100-TODO.md`._
