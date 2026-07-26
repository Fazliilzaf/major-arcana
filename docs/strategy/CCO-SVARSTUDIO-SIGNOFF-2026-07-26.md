# Svarstudio — sign-off inför cutover (V2 ↔ admin#cco)

**Datum:** 2026-07-26
**Baserad på:** `main` @ `0b44a498`
**Metod:** Read-only kod-trace av båda UI:na och backend-grindarna. Ingen live-körning (miljöns egress-policy blockerar prod).
**Bakgrund:** Paritetsauditen (`CCO-CONVERSATIONS-PARITY-AUDIT-2026-07-24.md`) markerade Svarstudio 🟡 — den **enda äkta divergensen**, eftersom V2 har en egen inline-studio medan admin kör panel i iframe. Den här sign-offen avgör om divergensen är säker.

> **Verdikt: GO.** Draft-state-machine och send-gateway är identiska. Backend är enda auktoritativa grinden och den är gemensam. Ett UI-gap finns (se Del C) — det failar stängt åt båda hållen och blockerar inte cutover, men bör åtgärdas.

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

## Del C — Fyndet: UI-grindarna skiljer sig (🟡, ej blockerande)

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

## Del D — Verdikt

**GO för cutover.** Svarstudio-divergensen är ett **UI-lager ovanpå en gemensam, korrekt grindad backend**:

- ✅ Samma endpoints, samma draft-state-machine, samma send-kedja
- ✅ Send är owner-only i backend, flagg-grindat, adapter-grindat, approved-grindat, allowlist-grindat och audit-loggat
- ✅ `/transition → sent` hårt blockerad — ingen väg runt `/send`
- ✅ Segregation of duties bevarad i båda
- ✅ Klient-satt roll ger ingen behörighet i prod
- 🟡 UI-grindarna skiljer sig och matchar inte backendens krav — failar stängt, åtgärdas efter cutover

**Inga 🔴.** Svarstudio blockerar inte att `/admin#cco`:s huvudflik pekas på V2.

---

## Öppna punkter (för Codex + live)

- [ ] **Live:** owner + `ARCANA_GRAPH_SEND_ENABLED=true` → skicka ett riktigt utkast från V2 och bekräfta `sent` + audit-post. (Kan inte köras härifrån — egress blockerad.)
- [ ] **Live:** icke-owner i V2 med flaggan på → bekräfta att knappen visas men 403:ar (dokumenterat UI-gap, inte en läcka).
- [ ] Efter cutover: harmonisera UI-grinden till `owner && sendEnabled` i båda ytorna + namnbyte i V2.
- [ ] Bilage-vägen: V2:s studio exponerar inga bilagor — bekräfta att det är avsett (admin-panelen hanterar dem).
