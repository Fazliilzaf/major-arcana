# Component Library (Pilot 0.1)

## Cards
- **Summary Card**: KPI + label + optional CTA
- **Status Card**: risk/incident emphasis med färgkod
- **States**: default, loading, empty, alert

## Chips
- Filterchips för kategori/status/risk
- **States**: selected, unselected, disabled
- Måste alltid ha text (inte ikon-only)

## Badges
- Template states: `draft`, `active`, `archived`
- Risk levels: `L1..L5`
- Owner decision: `pending`, `approved`, `revision_requested`, `rejected`, `overridden`

## Buttons
- **Primary**: huvudsaklig action
- **Secondary**: alternativ action
- **Text**: låg prioritet
- **Danger**: destruktiv action
- **Rules**: disabled när preconditions saknas; loading-state vid API-call

## Tables
- Används i Reviews, Incidents, Audit, Team
- Kräver sortering, filter och tom-state
- Bulk-select endast för Owner där relevant

## Side Panels
- Risk detail och audit detail
- Ska kunna öppnas utan att användaren tappar kontext i listan

## Modals
- Invite staff, owner override, kritiska bekräftelser
- Obligatorisk motivering vid override/reject av riskhändelser

## Form Components
- Inputs, select, toggle, slider
- Inline validering + feltext
- Hjälptext för policykritiska inställningar

## Notifications
- Toast för `success`, `warning`, `error`
- Kritiska notifieringar kräver aktiv stängning

## Accessibility baseline
- Tydliga labels på alla fält
- Tillräcklig kontrast mellan text/bakgrund
- Fokusmarkering vid tangentbordsnavigation
- Ikon + text på centrala actions

