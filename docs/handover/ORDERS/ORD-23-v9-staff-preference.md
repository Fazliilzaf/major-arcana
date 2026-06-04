# ORD-23 — v9 staff preference (banner + toggle + TTL)

**Status:** IMPLEMENTED (2026-06-04)

## Scope

- Legacy-banner när `data-v9-enabled=off` på `view=customers`
- Inställnings-toggle Ny design (v9) vs Klassisk vy
- 7-dagars TTL på sticky `arcana.v9.enabled='0'`

## Filer

- `public/major-arcana-preview/app/cco-v9-flag.js` — `arcana.v9.disabledAt`, auto-rensning
- `public/major-arcana-preview/app/cco-v9-preference-ui.js` — banner + settings-rad
- `public/major-arcana-preview/cco-v9-customers.css` — `.v9-legacy-banner`, `.v9-pref-settings`

## Acceptans

1. `?v9=off` → banner med "Ny design" / "Behåll klassisk"
2. Settings-checkbox togglar v9 och reloadar
3. Efter 7 dagar med `'0'` → default ON utan manuell rensning
