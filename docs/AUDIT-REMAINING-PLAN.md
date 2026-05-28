---
owner: CCO
status: active
---

# Audit-actionplan — kvarvarande tekniska planer

Detta dokument innehåller **konkreta implementations-planer** för de två
audit-actions som inte levererades i 2026-05-12-sessionen pga storleksskäl
(>3 timmar / vecka-jobb). Båda har full backend-touch och kräver dedikerad
implementation-tid.

---

## Action: Lazy-load conversation-detail

**Audit-rapport:** Effekt 7 / Medel svårighet / 3 timmar
**Mål:** Time-to-first-action på ny tråd från 8-12s → ~3-4s.

### Problem-diagnos

Idag laddar `app.js` i `loadLiveRuntime()` ALLA conversation-details för
ALLA trådar i listan vid varje mailbox-change. För 76+ trådar = 76+
parallella fetcher mot `/api/cco/conversations/<id>`. Cloudflare CDN
kan inte cacha eftersom auth-token måste validera per request.

Symptom som operatörer upplever:
- Listan visas snabbt (cards bara behöver metadata)
- Men när första tråden öppnas är `state.runtime.conversationByThreadId[id]`
  fortfarande pending → focus-panel visar "Laddar konversation..." 4-8s
- Total time-to-first-action = render(8s) + click(0.2s) + open(0s) + fetch(4-8s)

### Implementation

**Steg 1: Identifiera bulk-fetcher.**
```bash
grep -n "loadLiveRuntime\|fetchConversationsBatch\|loadConversationDetail" \
  public/major-arcana-preview/app.js | head -20
```
Hitta funktionen som loopar `threads.forEach((t) => fetch(...))`.

**Steg 2: Byt till lazy-fetch.**
- Vid `loadLiveRuntime`: hämta BARA metadata (subject, sender, preview).
  Inga `conversation`-detail-fetcher.
- Lägg till `state.runtime.conversationByThreadId` = `{}` (tom).
- I `openThread(id)` (eller motsvarande click-handler):
  - Om `state.runtime.conversationByThreadId[id]` redan finns: visa direkt
  - Annars: fetch + cache + render

**Steg 3: Prefetch primary thread bara.**
- Vid initial load: identifiera `state.runtime.selectedThreadId` (eller
  första tråden i listan)
- Prefetch ENBART den konversationen i bakgrunden
- Övriga väntar tills user klickar

**Steg 4: Cache med TTL.**
```js
const CONV_CACHE_TTL = 5 * 60 * 1000; // 5 min
function getConversation(id) {
  const cached = state.runtime.conversationByThreadId[id];
  if (cached && Date.now() - cached.fetchedAt < CONV_CACHE_TTL) return cached.data;
  return null;
}
```

### Tester

- E2E: ladda CCO, klicka första tråd, mät tid till `.focus-conversation-body`
  innehåll. Mål: < 2s från click.
- Network tab: bekräfta att första load skickar 1 batch-request för
  metadata + 0-1 conversation-fetch (bara primary thread).

### Risk

- Risk för regression om `state.runtime.conversationByThreadId` används på
  fler ställen utan null-check. Sök `conversationByThreadId\[` i app.js
  och säkerställ guarded reads.
- Visual regression: focus-pane kan visa "Laddar..."-text 0.5-1s vid första
  klick. Acceptabel UX-tradeoff för 5-8s vinst på initial load.

---

## Action: Server-side merge-logik för cross-customer-thread-grupp

**Audit-rapport:** Effekt 9 / Hög svårighet / 1 vecka
**Mål:** Flytta nuvarande client-side `customer-cluster.js`-logik till
data-lagret så merge är source-of-truth och cross-device-konsistent.

### Problem-diagnos

Vår client-side `customer-cluster.js` (steg 3 i thread-merge-feature)
identifierar samma kund per `.warm-sender`-text eller email-prefix på
client. Det fungerar visuellt men:
- Olika operatörer kan se olika groupings om DOM-state skiljer sig
- Server vet inte att trådar är grupperade → analytics/rapporter visar
  fel "antal kunder med flera trådar"
- Vid SSR eller export blir gruppering inkonsistent
- Sub-trådar måste laddas separat (ingen serveroptimering)

### Implementation

**Steg 1: Datamodell-utökning** (1 dag)

Lägg till på `thread`-objekt server-side:
```json
{
  "id": "thread-abc",
  "customerClusterId": "cluster-xyz",      // NY
  "customerClusterSize": 3,                // NY (antal trådar i kluster)
  "customerClusterPrimary": true,          // NY (är denna primary?)
  "customerClusterIdentityKey": "email:anna@example.com:ip:8.8.8.8"  // NY
}
```

Identity-key-derivering server-side:
- Primär: `customerEmail` (normaliserad lowercase)
- Sekundär: `customerName` (om email saknas)
- Tertiär: fingerprint av reply-headers (`In-Reply-To`, `References`)

**Steg 2: Server-endpoint för cluster-meta** (2 dagar)

```
GET /api/cco/threads/<id>/cluster
→ { "clusterId": "...", "members": [{"id": "...", "subject": "...", "lastActivity": "..."}, ...] }
```

Eller embedded i `getThreads()`-batch-response så ingen extra fetch.

**Steg 3: Migrate client-side cluster.js** (1 dag)

`app/customer-cluster.js` läser nu från `card.dataset.customerClusterSize`
istället för att räkna i DOM. Server-flagged primary = visa kort, sub =
göm. Klick på badge → fetch `/cluster/<id>/members` (eller använd embedded).

**Steg 4: Backfill för befintliga trådar** (1 dag)

Script: `scripts/backfill-customer-clusters.js`
- Loop över alla threads
- Beräkna identity-key
- Group by key
- Set `customerClusterId` + size + primary flag

**Steg 5: Test + rollout** (1 dag)

- Unit-tests för identity-derivering
- Backfill på dev-data först
- Stegvis rollout: 10% → 50% → 100% via feature-flag

### Risk

- **Hög:** server-data-modell-ändring kräver migration. Rollback kräver
  att backfill kan reverteras.
- **Medel:** identity-derivering är fuzzy (samma person kan ha 2 emails).
  False-positive merges kan förvirra operatörer.
- **Låg:** UI är redan byggt (vi har customer-cluster.js + CSS) — bara
  data-källa ändras.

### Rekommenderad approach

Starta med **client-side enrichment**: existerande
`customer-cluster.js` skriver `customerClusterId` tillbaka till
backend via PATCH när den identifierar grupp. Server lagrar men ändrar
inte primärt beteende. Efter 1-2 veckors data: använd det som source-
of-truth.

---

## Sammanfattning

| Action | Tid | Risk | Levereras |
|---|---|---|---|
| Lazy-load conversation-detail | 3 tim | Medel | Performance-fix |
| Server-side cluster-merge | 1 vecka | Hög | Konsistens + analytics-kvalitet |

Båda är planerade men inte schemalagda. Skapa Asana/Linear-tickets om
prioritet höjs.

---

_Genererat av audit-action-leverans 2026-05-12._
