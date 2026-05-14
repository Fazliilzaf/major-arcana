# CCO Legacy Sunset Criteria

Senast uppdaterad: 2026-05-13

## Syfte

Definierar kriterier för att ta bort legacy fallback-kedjor i CCO mail-pipeline.
Foundation Phase 1-6 är klar och huvudkedja. Legacy finns kvar som kontrollerad fallback.

## Nuvarande status

Regression guard (2026-04-09): 8/8 fall öppnade via Mail foundation, 0/8 via Legacy fallback.

## Sunset-kriterier per subsystem

### 1. Worklist merge (`mergeTruthPrimaryWorklistData`)
**Krav för sunset:** Truth-primary worklist levererar alla trådar för alla konfigurerade mailboxar utan gap.
**Mätning:** `truthPrimaryCount / (truthPrimaryCount + legacyCount)` = 100%
**Plats:** `app.js` rad ~11118-11247

### 2. Focus read state (`getRuntimeFocusReadState`)
**Krav för sunset:** `foundationDriven: true` och `fallbackDriven: false` för alla fokuserade trådar.
**Mätning:** Regression guard — 0 fall med `Legacy fallback` provenance.
**Plats:** `app.js` rad ~13390-13485

### 3. Studio truth state
**Krav för sunset:** Svarstudio alltid styrd av truth-primary, aldrig legacy chain.
**Mätning:** `truthDriven: true` för alla studio-sessioner.
**Plats:** `app.js` rad ~13488-13570

### 4. Shadow review/parity (`buildShadowReviewContext`)
**Krav för sunset:** Shadow review inte längre behövs — truth-primary och foundation matchar eller överträffar legacy.
**Mätning:** Shadow diff report visar 0 regressioner under 30 dagar.
**Plats:** `capabilities.js` rad ~7170-7203

### 5. Synthetic conversation keys (`buildFallbackConversationKey`)
**Krav för sunset:** Alla meddelanden har auktoritativa `conversationId` / `mailboxConversationId`.
**Mätning:** 0 meddelanden i truth store med synthetic keys.
**Plats:** `ccoMailboxTruthReadAdapter.js` rad ~129-138

### 6. Graph runtime history (`graph_runtime_fallback`)
**Krav för sunset:** All history serveras från store, aldrig direkt från Graph.
**Mätning:** 0 requests med `sourceStore: 'graph_runtime_fallback'`.
**Plats:** `capabilities.js` rad ~5018-5022

## Rekommenderad sunset-ordning

1. **Focus read state** (lågt risiko — foundation redan huvudkedja)
2. **Studio truth state** (lågt risiko — truth-primary styr i practice)
3. **Shadow review** (medelrisiko — kräver 30-dagars stabilitetsfönster)
4. **Worklist merge** (högt risiko — kräver full truth-primary coverage)
5. **Synthetic keys** (högt risiko — data-beroende)
6. **Graph runtime history** (sist — behövs som safety net)

## Beslutsregel

Sunset en subsystem när:
1. Mätningen visar 100% foundation/truth-primary under 30+ dagar
2. Regression guard visar 0 legacy-fallback-fall
3. OWNER har godkänt sunset via audit-event

Sunset reverseras via feature flag, inte kodändring.
