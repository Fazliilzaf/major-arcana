# Arcana Capability Base Class Contract (V1)

Detta dokument låser den enda tillåtna strukturen för capabilities i Arcana.

## 1. Syfte
- Standardisera alla AI-förmågor.
- Förhindra direkt store-access.
- Säkerställa gateway-only execution.
- Styra risk/policy per capability.
- Göra capabilities testbara.
- Göra agenter till capability-bundles (inte exekveringsenheter).

## 2. BaseCapability (obligatoriskt)
Alla capabilities ska ärva från `BaseCapability`.

```js
class BaseCapability {
  static name = 'CapabilityName';
  static version = '1.0.0';
  static allowedRoles = [];
  static allowedChannels = [];
  static requiresInputRisk = true;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;
  static persistStrategy = 'none'; // none | analysis | draft | artifact
  static inputSchema = {};
  static outputSchema = {};
  async execute(context) { throw new Error('Not implemented'); }
}
```

## 3. Hårda regler
1. No direct store access från `src/capabilities/*`.
2. Capabilities får endast köras via gateway.
3. Fail-closed enforcement hanteras av gateway-pipeline.
4. Capability får inte fatta policybeslut eller persistera själv.

## 4. Persist strategy (fas 1)
Tillåtet i fas 1:
- `none`
- `analysis`

Ej tillåtet i fas 1:
- `draft`
- `artifact`

## 5. Context (injiceras av gateway)
Capability får endast använda:

```js
{
  tenantId,
  actor,
  channel,
  correlationId,
  requestId,
  input,
  systemStateSnapshot
}
```

## 6. Output contract
Capability måste returnera:

```js
{
  data: {},
  metadata: {},
  warnings: []
}
```

## 7. Audit contract
Gateway ansvarar alltid för:
- `capability.run.start`
- `capability.run.decision`
- `capability.run.persist`
- `capability.run.complete`

Capability får inte skriva audit direkt.

## 8. Agent-definition
Agenter definieras endast som bundles:

```json
{
  "name": "COO",
  "capabilities": ["GenerateTaskPlan", "SummarizeIncidents"]
}
```

Ingen agent-specifik exekveringslogik i agentdefinitionen.

## 9. Första capability (V1)
`GenerateTaskPlan`:
- roles: `OWNER`, `STAFF`
- channel: `admin`
- riskflaggor: input=false, output=true, policy=true
- persist: `analysis`

## 10. Testkrav
Per capability:
- minst 1 unit test
- minst 1 gateway integration test
- minst 1 risk enforcement test (om risk/policy aktiva)
- minst 1 persist behavior test (om persistStrategy != none)

## 11. Scope lock
Under capability-fasen:
- ingen ändring i patientkanal
- ingen ändring i gateway-core
- ingen ändring i risk-engine-core
- ingen ändring i policy-floor-core

Endast capabilities ovanpå existerande enforcement.
