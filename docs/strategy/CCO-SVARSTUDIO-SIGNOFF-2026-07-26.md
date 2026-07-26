# Svarstudio — sign-off inför cutover (V2 ↔ admin#cco)

**Datum:** 2026-07-26
**Baserad på:** `main` @ `0b44a498`
**Metod:** Read-only kod-trace av båda UI:na och backend-grindarna. Ingen live-körning (miljöns egress-policy blockerar prod).
**Bakgrund:** Paritetsauditen (`CCO-CONVERSATIONS-PARITY-AUDIT-2026-07-24.md`) markerade Svarstudio 🟡 som den "enda äkta divergensen".

> **Korrigering till auditen:** V2 hade **inte** en parallell studio som primär väg.
> `openStudio` routade redan till admin#cco:s panel via `CCOBottomActions.run('svarstudio')`
> med preset-kontext. Inline-studion var en **dokumenterad fallback** som bara användes
> om launchern ännu inte hunnit laddas, uttryckligen märkt *"tas bort när
> launcher-inkopplingen är verifierad live"*. Auditens 🟡 överdrev alltså divergensen.
> Den här ändringen gör det som redan var planerat: tar bort fallbacken.

> **Verdikt: GO — fallbacken är BORTTAGEN, divergensen därmed stängd.**
>
> Backend var redan gemensam och korrekt grindad, och V2 öppnade redan admins panel.
> Kvar fanns en inline-fallback som kunde rendera en egen studio när launchern inte
> laddats — med en **egen, svagare send-grind** (Del C). Den är nu borttagen:
> launcher-vägen är den enda, och utan launcher failar den högt i stället för att
> tyst falla tillbaka på en parallell yta.
>
> **Effekt:** ~535 rader fallback-UI borta ur skalet, plus V2:s egna
> `studioGenerate/Transition/Send` och sex döda ctx-fält. UI-gapet i Del C
> försvinner (admins grind gäller alltid), och bilagor stöds nu eftersom admins
> panel alltid används.

---

## Del A — Samma gateway, samma kedja

Båda UI:na träffar **exakt samma routes** (`src/routes/ccoCommDraft.js`):

| Steg | Endpoint | V2 | Admin |
|---|---|---|---|
| Skapa | `POST /cco-comm/drafts` | `studioSave` (utan draftId) | `saveDraftV2` |
| Spara | `PATCH /cco-comm/drafts/:draftId` | `studioSave` (med draftId) | `saveDraftV2` |
| Övergång | `POST /cco-comm/drafts/:draftId/transition` | `studioTransition` | `transitionDraftV2` |
| Skicka | `POST /cco-comm/drafts/:draftId/send` | `studioSend` | `sendDraftV2Now` |
| Generera | `POST /cco-comm/drafts/generate-reply` | `studioGenerate` | *(egen AI-väg)* |

**Send-kedjan är identisk i båda:**

```
spara → transition(needs_approval) → transition(approved) → POST …/send
```

- V2: `studioSend()` → `studioEnsureSaved()` → `needs_approval` → `approved` → `send`
  (`cco-conversations-v2-shell.js` ~2522–2560)
- Admin: `sendDraftV2Now()` → `saveDraftV2('needs_approval')` → `transitionDraftV2('approved')` → `send`
  (`konversationer-bottom-actions.js` ~1184–1215)

Samma body-form till `/send` i båda: `{ to, senderMailbox }`.

---

## Del B — Backend är auktoritativ och gemensam

### `/send` — den ENDA vägen som kan skicka på riktigt
Sju grindar, alla måste passera (`ccoCommDraft.js` ~698–790):

1. `requireAuth` + `attachRole` + **`requirePermission('mail.live_send')`** — owner-only
2. **`ARCANA_GRAPH_SEND_ENABLED`** på (annars 403 `send_disabled`)
3. Send-adapter wire:ad (annars 503 `no_adapter`) — *utan adapter skickas inget ens med flaggan på*
4. `draft.status === 'approved'` (annars 409)
5. Giltig mottagaradress
6. Giltig avsändarbrevlåda **på `ARCANA_GRAPH_SEND_ALLOWLIST`** (annars 403)
7. Bilagor stöds av adaptern (annars 422 — blockeras *före* send så utkastet aldrig går ut ofullständigt)

Varje försök audit-loggas med **maskerad** mottagare och avsändare.

### `/transition → sent` är hårt blockerad
Även för owner: routen returnerar 403 `Live-utskick är avstängt (owner-mandat: ingen auto-send i denna build)`. Det finns alltså **ingen** väg runt `/send`.

### Segregation of duties
`transitionStatus(..., allowSelfApprove: roleHasPermission(role,'mail.live_send'))` — en författare får **inte** godkänna sitt eget utkast om hen inte är owner (`ccoCommDraftStore.js`).

### State-machine (`STATUS_TRANSITIONS`)
```
draft           → needs_approval | cancelled
needs_approval  → approved | draft | cancelled
approved        → queued | cancelled
queued          → sent | failed | cancelled
sent, cancelled → (terminala)
```
`approved → sent` finns **inte** som direkt övergång; `/send` gör `queued → sent` internt. Båda UI:na respekterar kedjan.

### Klient-satt roll ger ingen behörighet
Admin skickar `x-cco-role`/`x-cco-tenant`; V2 gör det inte. Det spelar ingen roll: `getRoleFromRequest` honorerar `X-CCO-Role` **endast utanför produktion** (`ccoRbac.js`). I prod kommer rollen från verifierad auth. **Ingen skillnad i faktisk behörighet mellan UI:na.**

**→ V2 kan inte kringgå någon grind som admin respekterar. Ingen säkerhetsdivergens.**

---

## Del C — Fyndet som ledde till åtgärden: UI-grindarna skilde sig

> **Åtgärdat.** Avsnittet beskriver läget *före* borttagningen. Eftersom V2 nu
> öppnar admins panel gäller admins grind — de två raderna nedan är inte längre
> två olika grindar utan en.

Ingen av UI-grindarna speglar backendens faktiska krav (`owner` **och** `sendEnabled` **och** adapter …):

| | Grind i UI | Vad det är |
|---|---|---|
| **V2** | `studioOwnerSendAvailable = state.prefs.sendEnabled` (`app.js:40665`) | Serverflaggan `ARCANA_GRAPH_SEND_ENABLED` — **inte** roll¹ |
| **Admin** | `ROLE === 'owner'` (`konversationer-bottom-actions.js:1229`) | Klientens roll — **inte** flaggan |

¹ `state.prefs.sendEnabled` mappar via `PREFS_KEY_PATHS` till `['runtime','sendEnabled']`, som fylls från capabilities (`runtime-dom-live-composition.js:1597`) med `graph.sendEnabled` = `ARCANA_GRAPH_SEND_ENABLED`. Trots namnet `studioOwnerSendAvailable` innehåller den alltså **ingen rollkontroll**.

**Konsekvens (båda failar stängt):**
- **V2:** icke-owner ser en aktiv Skicka-knapp när flaggan är på → klick → **403 `mail.live_send`**.
- **Admin:** owner ser Skicka när flaggan är av → klick → **403 `send_disabled`**.

Inget läcker, men båda ytorna erbjuder en knapp som ibland är dömd att misslyckas. V2:s är dessutom **fel-namngiven** (`…OwnerSend…` utan owner-check).

**Rekommendation (efter cutover, ej blockerande):** grinda båda på `owner && sendEnabled`, och byt namn på V2:s flagga så den beskriver vad den faktiskt är.

---

## Del D — Åtgärden

| Före | Efter |
|---|---|
| Launcher-väg **+** inline-fallback (~535 rader) | Endast launcher-vägen; utan launcher failar den högt |
| V2: egna `studioGenerate/Transition/Send` i app.js | Borttagna; ligger i admins panel |
| V2: sex studio-ctx-fält | Borttagna (döda) |
| Tre ingångar (knapp, snabbsvar, kommandopalett) | Alla tre delegerar via `openSvarstudioPanel` |
| Ingen bilage-hantering i V2 | Admins panel hanterar bilagor |

Kvar i V2: snabbsvarets **"Spara utkast"** (`studioSave`) — en tunn skrivning mot
samma gateway, inte en parallell studio.

Tester låser fast det: studio-knappen delegerar till `handlers.action('studio')`,
ingen `[data-v2-studio]` renderas, och `openStudio`/`renderStudio`/
`studioSend`/`studioTransition`/`studioGenerate` finns inte kvar.

## Del E — Verdikt

**GO för cutover.** Svarstudio är inte längre en divergens — den är samma panel som admin:

- ✅ V2 öppnar admin#cco:s svarstudio-panel via den delade launchern, som de tolv övriga panelerna
- ✅ Samma endpoints, samma draft-state-machine, samma send-kedja (nu i samma UI)
- ✅ Send är owner-only i backend, flagg-grindat, adapter-grindat, approved-grindat, allowlist-grindat och audit-loggat
- ✅ `/transition → sent` hårt blockerad — ingen väg runt `/send`
- ✅ Segregation of duties bevarad
- ✅ Klient-satt roll ger ingen behörighet i prod
- ✅ Det tidigare UI-gapet (olika send-grindar) är borta — admins grind gäller
- ✅ Bilagor stöds nu i V2, via admins panel

**Inga 🔴, inga 🟡 kvar.** Svarstudio blockerar inte att `/admin#cco`:s huvudflik pekas på V2.

---

## Öppna punkter (för Codex + live)

- [ ] **Live:** öppna Svarstudio från V2 och bekräfta att admin#cco:s panel öppnas med rätt trådkontext (via `CCOLiveConversationContext`).
- [ ] **Live:** owner + `ARCANA_GRAPH_SEND_ENABLED=true` → skicka ett riktigt utkast från panelen öppnad i V2, bekräfta `sent` + audit-post. (Kan inte köras härifrån — egress blockerad.)
- [ ] Snabbsvarets "Spara utkast" (`studioSave`) är kvar i V2 — bekräfta att det är avsett att behållas som inline-funktion.
- [ ] Kvarvarande harmonisering (utanför Svarstudio): admins send-knapp grindar på `ROLE === 'owner'` utan flaggkontroll, så en owner kan fortfarande klicka Skicka när flaggan är av och få 403. Failar stängt; egen liten fix.
