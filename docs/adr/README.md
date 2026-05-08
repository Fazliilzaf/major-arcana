# Architecture Decision Records (ADRs)

Detta är "varför"-dokumentationen för CCO. Kod säger "hur"; ADRs säger "varför vi valde det här över alternativen".

## Index

| ADR | Titel | Status |
| --- | --- | --- |
| [0001](./0001-capabilities-pattern.md) | Capabilities-pattern för server-side affärslogik | accepted |
| [0002](./0002-multi-tenant-strategy.md) | Multi-tenant via tenantId + tenantConfigStore | accepted |
| [0003](./0003-vanilla-runtime-modules.md) | Vanilla JS runtime-moduler (ej React/Vue) | accepted |

## Skapa en ny ADR

1. Kopiera `0000-template.md` till `NNNN-kort-titel.md` (öka `NNNN` med 1).
2. Fyll i Kontext, Alternativ, Beslut, Konsekvenser.
3. PR med `docs(adr): NNNN — <titel>`.
4. När mergad, lägg till raden i tabellen ovan.

## Status-värden

- **proposed** — Förslag, ej beslutat ännu.
- **accepted** — Beslutat och i bruk.
- **superseded by ADR-XXXX** — Avlöst av nyare ADR. Behåll filen för historik.
- **deprecated** — Inte längre i bruk, men ej ersatt.
