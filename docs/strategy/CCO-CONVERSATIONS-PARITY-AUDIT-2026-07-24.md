# CCO /admin#cco → V2 — Konversations-paritetsaudit

**Datum:** 2026-07-24
**Baserad på:** `main` @ `53c9bf77` (efter Codex #1205/#1206/#1209 + Claude #1190–1196)
**Metod:** Read-only kod-trace. Inga körningar mot prod (miljöns egress-policy blockerar `arcana.hairtpclinic.com`, 403) — **live-verifiering återstår**.
**Ägare av V2-runtime framåt:** Claude (ensam, för att undvika parallell-kollisioner). Codex checkar denna audit.

> Syfte: avgöra om `/admin#cco`:s huvudflik "Konversationer" kan peka på V2 (cutover), och vad som måste stängas innan legacy tas bort.

---

## Kärnfynd

V2 **reimplementerar inte** operatörspanelerna. Den laddar den godkända launchern i library-läge
(`window.__CCO_BOTTOM_ACTIONS_LIBRARY__ = true`) och anropar `window.CCOBottomActions.run(<key>)` =
`runCcoAction` (`konversationer-bottom-actions.js`, dispatch ~3781–3799, exponering ~3929–3932).
Varje "Mer"-panel och P1-ytorna (anteckning/bokning/kalender) öppnar **exakt admin#cco:s panel**;
V2 bidrar bara med trådkontext. Statusåtgärderna (Klar/Senare/Återöppna) träffar **samma** backend-route
som admin. Om launchern inte är laddad failar panel-vägen **högt** (felfeedback), aldrig tyst stub
(`app.js` ~40554–40559). "Aktiveras snart"-stubben från äldre inventeringar är **borttagen** i main.

---

## Del A — Per-action-paritet

| Action | V2-väg | Admin-väg | Samma mål? | Skydd | Verdikt |
|---|---|---|---|---|---|
| **Klar** (`handled`) | `runV2PersistentConversationAction('handled')` → `POST /api/v1/cco/runtime/conversation/{key}/action` (app.js ~40173–40207) | `runCcoAction('klar')` → `runConversationAction('handled')` → samma route (bottom-actions ~2872) | ✅ identisk endpoint + body | Explicit skrivning; backend `requirePermission('mail.write')` (ccoConversation.js ~2454); customerId-grind | 🟢 |
| **Återöppna** (`reopen`) | `runV2PersistentConversationAction('reopen')` → samma route | `runCcoAction('reopen')` → samma route | ✅ identisk | Explicit; `mail.write`; customerId-grind | 🟢 |
| **Senare** (`reply_later`) | native direkt-anrop → samma `…/action`-route; ÄVEN `senarekopanel`-nyckel → admin Senare-panel (app.js ~40032) | `runCcoAction('senare')` → `openSenarePanel` (`cco-senare-v3.html`), skrivning först vid in-panel Bekräfta | ⚠️ samma endpoint, **annan UX**: admin har snooze-tid-bekräftelse, V2:s native är ett-klicks reply_later | Explicit; `mail.write` | 🟡 bekräfta avsedd interaktion |
| **Svarstudio** | native inline-studio → `/api/v1/cco-comm/drafts/*` (generate/save/transition/send), send owner-låst i backend + UI (app.js ~40344 "endast presentation och avsändarval") | `runCcoAction('svarstudio')` → `openSvarstudio` iframe-panel | ⚠️ **samma draft/send-gateway men parallellt V2-UI** (enda äkta divergensen) | Send aldrig från klient-autopath; owner-blockerad backend; explicit save/transition | 🟡 sign-off draft-state-machine + send-lås mot admin-panelen |
| **Anteckning** (`smart-anteckning`) | `run('smart-anteckning')` → `cco-smart-anteckning-v3.html` | `openSmartAnteckning` samma panel | ✅ samma panel | Read-only iframe; ingen skrivning vid öppning | 🟢 |
| **Bokning** (`bokningsyta`) | `run('bokningsyta')` → `cco-ny-bokning.html` | `openBokningsyta` samma panel | ✅ samma panel | Ingen auto-låst patient; ingen skrivning vid öppning | 🟢 |
| **Kalender** | `run('kalender')` → `/kalender.html` | `openKalender` samma panel | ✅ samma panel | Read-only; kontext via postMessage | 🟢 |
| **Dossier** (`patienthub`) | vid bekräftad exakt patientmatch → `openV2CustomerDossier` (live-kort via `patientId`); annars `run('patienthub')` admin-panel (app.js ~40414–40432) | `runCcoAction('patienthub')` → `openPatientHub` (`cco-patient-hub-v3.html`) | ✅ samma panel på no-match-fallback | **Patientmatch-grind**: deep-link bara vid `matched` + exakt e-postkälla + ingen konflikt (app.js ~40048–40074) | 🟢 |
| **Notiser** | `run('notiser')` | `openNotiser` (`cco-notiser-v3.html`) | ✅ samma panel | Read-only | 🟢 |
| **Signering** (`signaturer`) | `run('signaturer')` | `openSignaturer`, customerId-scopad | ✅ samma panel | Read-only; ingen live-send | 🟢 |
| **Nytt mail** (`nyttmail`) | `run('nyttmail')` | `openComposeNewMail` | ✅ samma compose-yta | Compose only; send via draft/send-gateway | 🟢 |
| **No-show** (`noshow`) | `run('noshow')` | `openNoShow` (`cco-no-show-ai-v3.html`) | ✅ samma panel | Read-only | 🟢 |
| **Portal** (`portalmetrics`) | `run('portalmetrics')` | `openPortalMetrics` | ✅ samma panel | Read-only | 🟢 |
| **Skickat** (`skickat`) | `run('skickat')` | `openSkickat` (`cco-skickat-v3.html`) | ✅ samma panel | Read-only | 🟢 |
| **Makron** (`makron`) | `run('makron')` | `openMakron` (`cco-makron-v3.html`) | ✅ samma panel | Read-only; infogar i svar | 🟢 |

**13 av 15 = 🟢. 2 = 🟡 (Svarstudio, Senare).**

---

## Del B — De 7 osynliga reglerna

1. **Läser bara valda brevlådor, i små grupper (≤2/anrop)** — 🟢 för transporten: `worklistMailboxChunks` delar urvalet i ≤2-chunks, hämtas **sekventiellt** med avbryt-vid-urvalsbyte (`runtime-dom-live-composition.js` ~346, 422); backend hård-cap 2 → HTTP 422 (`capabilities.js:117, 9872`). **⚠️ MEN default-scopet ändrades:** current main sätter `defaultScope = availableIds` (**alla 8**), inte en brevlåda (app.js ~15027). Kommentaren säger att "skalet begränsar DOM-renderingen stegvis" — **men jag hittar inget robust list-batchning/virtualiserings-mekanism** i render-vägen. Alla 8 hängde UI:t tidigare (operatörsrapport). → **TOP-RISK, se Del C.**
2. **Listan mailbox-scopad, men öppning slår ihop hela kundhistoriken** — 🟢 hydrerings-scope = `thread.historyMailboxOptions` (unionar, snävar inte); korsbrevlåde-historik-sök + merge (runtime ~2077, 2564). *Caveat:* beror på att backend fyller `historyMailboxOptions`.
3. **Senaste mail styr sortering/presentation utan att tappa äldre/skickat** — 🟢 rader keyade på `conversationId`, merge dedupar men behåller alla; full tråd (äldre+skickat) via `/runtime/history` med full lookback. 🟡 exakt sort-nyckel (senaste-timestamp) ej oberoende verifierad.
4. **Bilagor/inline/signaturer via autentiserad asset-väg** — 🟢 `resolveMailAssetUrl` avvisar allt utom `/api/v1/cco/runtime/mail-asset/content`, kräver admin-Bearer (app.js ~40388); backend `requireAuth + requireRole(OWNER,STAFF)` + mailbox-scoping (capabilities.js ~10748).
5. **Snabba klick avbryter föregående trådöppning** — 🟢 `liveThreadHydrationSequence`-vakt efter varje async (runtime ~2498, 2540); chunk-loop bryter på `!isCurrentRequest()` (~435).
6. **Alla skrivningar explicita — öppning skapar aldrig utkast/sync/status** — 🟢 öppning = GET `/runtime/history` only; statusskrivningar bara via `…/action` (`mail.write`).
7. **Manuell sync = separat RBAC-skyddad admin-handling** — 🟢 bara vid explicit klick på `[data-runtime-sync-mail]` → POST `/runtime/sync`, backend `requirePermission('mailbox.admin')` + single-flight (ccoConversation.js ~2932).

**6 av 7 = 🟢. Regel 1 = 🟡 (default-scope + overifierad incremental render).**

---

## Del C — Cutover-verdikt

**GO, villkorat.** V2 kan bli konversationsytan: 13/15 actions och 6/7 skyddsregler är bevisade i kod,
eftersom V2 återanvänder admin#cco:s faktiska paneler och backend-routes. Render-vägen failar säkert:
ett V2-render-fel flippar `data-conversations-v2="off"` och återställer legacy (app.js ~40615).
Flaggan är default-OFF och view-scopad → cutover kan flippas och rullas tillbaka utan att röra legacy-kod.

**Måste stängas innan legacy RADERAS:**
1. **TOP-RISK — default alla-8 + overifierad incremental render (Regel 1).** Current main defaultar till alla 8
   brevlådor. Alla-8 hängde UI:t i operatörstest; Codex incremental-render-approach är **inte live-verifierad**
   och motsvarar inget tydligt list-batchning jag kan hitta i koden. **Kräver ett live-test: hänger current
   build på laddning eller inte?** Om ja → behövs riktig virtualisering eller scopad default.
2. **Svarstudio-sign-off** — enda parallella UI:t; verifiera draft-state-machine (generate→save→transition→send)
   + send-lås mot admin-panelen.
3. **Senare-interaktion** — direkt `reply_later` vs snooze-bekräftelse-panel; bekräfta avsedd modell.

Inga 🔴-gap (inga stubbar, inga saknade paneler, inga divergerande skriv-endpoints).

---

## Öppna verifieringspunkter (för Codex + live)

- [ ] **Live:** hänger current build (`53c9bf77`, default alla-8) på laddning? (Regel 1 top-risk)
- [ ] Svarstudio draft-lifecycle + send-lås = admin-paritet?
- [ ] Senare: en-klick vs snooze-panel — avsett?
- [ ] Regel 3: sort-komparator på senaste-message-timestamp?
- [ ] Regel 2: fyller backend `historyMailboxOptions` för alla kundens adresser?
