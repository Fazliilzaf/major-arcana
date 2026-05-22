# Interaction Spec (Pilot 0.1)

## Search + filters
- Autosök triggas direkt på input i mallbiblioteket.
- Filterchips och dropdowns uppdaterar listan utan full sidrefresh.
- Aktiva filter ska vara synliga och möjliga att rensa snabbt.
- Filter-state persisteras lokalt mellan sessioner.

## Table behavior
- Reviews och Incidents är separata tabeller.
- Reviews visar L3; Incidents visar L4-L5 med SLA-kolumn.
- Radklick öppnar detaljpanel med full riskkontext.
- Bulk actions tillåts för Owner där policy tillåter.

## SLA behavior (Incidents)
- L4 mål: 4h.
- L5 mål: 30m.
- Statusklasser:
  - `ok`: >50% tid kvar
  - `warning`: <=50% tid kvar
  - `critical`: <=25% tid kvar
  - `breached`: SLA passerad

## Modal + confirm rules
- Kritiska actions kräver bekräftelsedialog.
- Override/reject kräver motivering.
- Modaler ska inte stängas av misstag när data kan gå förlorad.

## Notification rules
- Success toast auto-dismiss.
- Error/critical kräver aktiv stängning.
- Varje write-action ska ge tydlig feedback (`saved`, `activated`, `rejected`, `failed`).

## Accessibility + readability
- Ikon kompletteras alltid med text på primära actions.
- Korta textblock och punktlistor i hjälpinformation.
- Kontrast mellan text och bakgrund ska hålla tydlig läsbarhet.
- Fokusmarkeringar ska vara synliga vid tangentbordsnavigation.

## Error handling
- Valideringsfel visas inline nära fältet.
- API-fel visas i statusrad/toast med nästa åtgärd.
- Systemet blockerar aktivering om risk/policy-gate inte uppfylls.

