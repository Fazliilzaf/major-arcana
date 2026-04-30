# ADR-0001: Capabilities-pattern för all server-side affärslogik

- Status: accepted
- Datum: 2026-01-15 (retroaktivt dokumenterad 2026-04-30)
- Beslutsfattare: CCO-arkitektur
- Berörda: src/capabilities/, src/routes/capabilities.js, executionService.js

## Kontext

CCO behöver ett enhetligt mönster för server-side operationer som:

- har strikta input/output-scheman (för att fånga regressioner tidigt),
- skriver audit-trail per körning,
- körs genom risk-gates (input/output risk + policy floor),
- kan ha rollbaserad behörighet (OWNER/STAFF),
- är versionerade så de kan utvecklas utan att bryta klienter,
- kan komponeras i agent-bundles (COO, CAO, CCO).

Initialt levde affärslogik direkt i route-handlers vilket gjorde audit, schema-validering, risk-gates och versionering inkonsistent.

## Alternativ

1. **Capabilities-klasser med statisk metadata + execute(context)** — den valda lösningen.
2. **Plain functions med decorators** — mindre Java-aktig men förlorar typ-relaterad introspektion.
3. **Behåll route-handlers som är** — snabbast men inget enhetligt audit/risk-flöde.

## Beslut

Capabilities som ES-klasser som extender `BaseCapability` med:

- `static name`, `static version`
- `static allowedRoles`, `static allowedChannels`
- `static requiresInputRisk`, `static requiresOutputRisk`, `static requiresPolicyFloor`
- `static persistStrategy` (`'analysis'` | `'none'`)
- `static auditStrategy` (`'always'`)
- `static inputSchema`, `static outputSchema` (JSON Schema)
- `async execute(context)` med tenantId, actor, channel, input, systemStateSnapshot, + injicerade stores

Routern itererar genom executor som validerar schema, kör risk-gates, persist+audit, sedan capability.execute().

## Konsekvenser

- **Positiva**: Enhetlig audit-trail, schema-validering före körning, rollkoll på registry-nivå, lätt att lägga till nya capabilities utan ad-hoc plumbing.
- **Negativa**: Mer boilerplate per ny capability. Utvecklare måste förstå mönstret.
- **Risker**: Statisk klass-metadata kan glömmas; mitigated av `assertCapabilityClass()`-validering vid registrering.

## Uppföljning

- Mätvärde: 100 % av nya server-side endpoints med audit-behov går genom capabilities (enligt code-review).
- Utvärdera om TypeScript-migration för dessa klasser är lönsam i slutet av 2026.
