# Arcana Capability Framework Contract (V1)

Detta dokument låser Capability-lagret ovanpå `ExecutionGateway`.

> Basstrukturen för varje capability är låst i `docs/architecture/capability-base-class-contract-v1.md`.

## Syfte
- Modulära AI-förmågor med explicit kontrakt.
- Alla capability-körningar är testbara, auditerade och gateway-enforced.
- Ingen prompt-spagetti eller capability-logik direkt i routes.

## Definition
En capability är en explicit systemförmåga som producerar strukturerat resultat via gatewayn.

## Kodplacering
- Capability-moduler: `src/capabilities/*.js`
- Registry: `src/capabilities/registry.js`
- Execution service: `src/capabilities/executionService.js`

## Capability Contract
Varje capability måste exportera:

```js
{
  name: string,
  version: string,
  allowedRoles: Role[],
  channels: Channel[],
  inputSchema: JSONSchema,
  outputSchema: JSONSchema,
  requiresInputRisk: boolean,
  requiresOutputRisk: boolean,
  requiresPolicyFloor: boolean,
  persistStrategy: "none" | "draft" | "artifact" | "analysis",
  auditStrategy: "always",
  execute(context): Promise<Result>
}
```

## Execution Rules
1. Capability får endast exekveras via `ExecutionGateway`.
2. Routes får inte anropa capability `execute` direkt.
3. Gateway-context innehåller alltid `tenant_id`, `actor`, `correlation_id`, `idempotency_key`.
4. Risk + policy körs enligt capability-flaggor.
5. Persist sker endast efter gateway-beslut.

## Persist Strategy
- `none`: ingen persist
- `draft`: persist i draft-store
- `artifact`: persist som systemartefakt
- `analysis`: persist i analysis-store

Blocked resultat får inte skrivas till normal store.

## Audit Rule
Varje capability-run ska skapa:
- `capability.run.start`
- `capability.run.decision`
- `capability.run.persist`
- `capability.run.complete`

Utöver gatewayns `gateway.run.*`.

## Agent Definition
Agenter definieras som capability-bundles, inte exekveringslogik.

## No Bypass
- Capabilities får inte importera store-moduler direkt.
- Persist hanteras i capability execution service via gatewayns `persist`-steg.
- CI guard: `npm run lint:no-bypass`.

## Testkrav
Per capability:
- minst 1 unit test
- minst 1 gateway integration test
- risk/policy-test (om flaggat)
- persist-test (om tillämpligt)

## Första implementation (V1)
- `GenerateTaskPlan`
  - Channel: `admin`
  - Roles: `OWNER`, `STAFF`
  - Persist strategy: `analysis`
