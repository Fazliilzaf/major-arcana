---
owner: Arkitektur
status: active
---

# ADR-0004: CAO som Arcana Admin Operator

Status: Accepted (Fas 0–7 implementerad i kod, 2026-05-20)  
Datum: 2026-05-20

## Kontext

CAO är idag en **Template Advisor** med tre capabilities. Masterplan §8.2 kräver admin/mall/standardisering/drafts. Användaren vill utöka CAO till **Arcana Admin Operator** med quality gate, mallbibliotekshälsa och tydliga gränser.

## Beslut

1. **Behåll API-namn `CAO`**; UI visar *Arcana Admin Operator*.
2. Utöka samma agent-bundle med nya capabilities (inte separat agent i fas 1).
3. **Admin quality gate** och **template library health** läggs till i Fas 1.
4. CAO **får inte** auto-aktivera mallar, ändra policy floor eller släppa patientkanal.
5. Alla nya capabilities går genom befintlig gateway-pipeline.
6. Admin-uppgifter lagras i `data/admin-tasks.json` via `adminTasksStore`.

## Riskklassificering (kapacitetsområden)

| Nivå | Exempel | CAO-beteende |
|------|---------|--------------|
| L1 | Rapporter, flaggor, sammanfattningar | Auto i analysis |
| L2 | Mallutkast (draft), checklistförslag | Förslag + owner review |
| L3 | Processändring, eskalering | Förslag + audit |
| L4–L5 | Policy, patientkanal, säkerhet | Endast flagga; manuell gate |

## Konsekvenser

- `composeCaoTemplateAdvisor` utökas med `templateLibraryHealth` och `adminQualityGate`.
- `outputType` förblir `TemplateAdvisor` (bakåtkompatibilitet) tills ADR uppdateras till `AdminOperator`.
- Orchestrator execute-bridge skjuts till Fas 2.

## Referenser

- `docs/strategy/cao-arcana-admin-operator-implementation-plan.md`
- `docs/strategy/arcana-master-plan-punktvis.md` §8.2, §8.7
