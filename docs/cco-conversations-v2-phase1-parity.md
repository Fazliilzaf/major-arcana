# CCO Konversationer v2 - fas 1: kontraktsparitet

## Syfte och gräns

Detta är ett draft-underlag for att låta Konversationer v2 återanvända den
befintliga CCO-runtime som redan driver legacy-vyn. Fas 1 ändrar inte
`public/konversationer.html`, admin-subnav, feature-flagga eller produktionsroute.
Den skapar ingen endpoint, store, mock- eller demo-fallback.

## Befintligt kontrakt som delas

| Del | Legacy | V2 fas 1 |
| --- | --- | --- |
| Worklist | `GET /api/v1/cco/runtime/worklist/consumer` | Samma consumer genom `loadLiveRuntime()` och `fetchTruthPrimaryWorklistConsumer()` |
| Autentisering | `ARCANA_ADMIN_TOKEN` som `Authorization: Bearer ...` | Samma token genom `apiRequest()` och `waitForRuntimeAuthToken()` |
| Tenant/roll/mailbox-scope | Serverns `requireAuth`, `requireRole(OWNER, STAFF)` och runtime-mailbox-allowlist | V2 begar inte egen data; den far redan scopad runtime-state |
| Uppdatering | Fetch-SSE och polling i legacy | Samma runtime-poll `scheduleRuntimeLiveRefresh()` som uppdaterar state och renderar om v2 |
| Konversationsnyckel | Runtime-tradens canonical `id` | Samma `id`, med befintliga `conversationKey`/`conversationId` som defensiv fallback |

V2 renderar endast nar `state.runtime.live === true` och auth inte ar kravd.
Det betyder att test-/previewdata aldrig kan bli en alternativ inkorg nar
Bearer-token saknas eller den riktiga worklisten inte har lastats.

## Bevis i tester

- `tests/capabilities/ccoRuntimeWorklistShadow.test.js` verifierar Bearer,
  tenant-scopad cache, rollskydd och mailbox-scope mot samma consumer-route.
- `tests/ops/ccoConversationsV2Shell.smoke.test.js` verifierar att v2 renderar
  samma exakta scoped conversation keys, inklusive fallback-nyckeln, och visar
  ett arligt auth-lage utan tradfallback.

## Kvarvarande funktionella paritetsgap

Fas 1 ar medvetet inte en cutover. Innan v2 kan ersatta legacy i `admin#cco`
behover separat arbete verifiera och implementera:

1. Direkt mount i admin-embeddet utan att dubble-rendera legacy.
2. Full trayd- och MIME-fidelity, inklusive bilagepopup och historiska fallbackar.
3. Full action-paritet for anteckning, bokning, senare, klar och ateroppna.
4. Svarstudio och utskicksparitet bakom redan etablerade owner-/sandargrindar.
5. Visuell och interaktiv signoff i Chrome och Safari mot inloggad produktion.

Ingen av dessa punkter ar aktiverad eller andrad av fas 1.
