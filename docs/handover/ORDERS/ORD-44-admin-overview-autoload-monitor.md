# ORD-44 · Admin-översikt: auto-ladda monitor-KPI:er + Promise.allSettled

**Prioritet:** P1
**Assignee:** Cursor (write) · Claude (UAT i ägar-session)
**Status:** pending
**Skapad:** 2026-06-15
**Frys:** major-arcana under pilot-frys — bygg på branch, INGEN prod-deploy/merge utan Fazli-GO.

## Bakgrund (diagnos verifierad 2026-06-15, read-only i ägar-session)

`/admin#overview` visar "Väntar på monitor-data" på korten **Beredskap**, **Pilotrapport** och "Kunde inte ladda executive feed" — trots att allt fungerar:

- Alla monitor-endpoints svarar 200 med `ARCANA_ADMIN_TOKEN` (header-auth, ej cookie):
  `/api/v1/monitor/status`, `/monitor/readiness` (score 75.28, 8 blockerande), `/monitor/readiness/history?limit=30`, `/monitor/observability?areaLimit=12`.
- Inget är trasigt i backend. Två frontend-svagheter i `public/admin.js`:

1. **Översiktens monitor-KPI:er auto-laddar inte.** De fylls först när man öppnar **Drift**-fliken och trycker "Uppdatera monitor". `loadMonitorStatus()` körs alltså inte vid admin-init/overview-render.
2. **`loadMonitorStatus()` använder `Promise.all`** (rad ~8666) över fyra anrop. Om ETT delanrop fallerar (t.ex. transient under en deploy) → `catch` renderar ALLA KPI:er som `null` → hela monitor-/beredskapsvyn blankas.

## Scope (endast `public/admin.js`, ev. `public/admin.html` för init-hook)

1. **Auto-ladda vid overview/admin-init:** kör `loadMonitorStatus()` (eller en lätt readiness-hämtning) när admin är inloggad och översikten renderas, så Beredskap/Pilotrapport/Executive feed fylls utan manuellt knapptryck. Debounce/cache så det inte spammar vid flikbyte.
2. **Gör batchen tålig:** byt `Promise.all` → `Promise.allSettled` i `loadMonitorStatus()`. Rendera de delar som lyckas; visa fel per kort i stället för att blanka allt. Behåll befintlig `renderReadinessKpi/PilotReportKpi/...`-logik.
3. **Executive feed:** säkerställ att översiktens executive-feed-kort använder rätt befintlig endpoint och inte blankas av samma batch-problem.

## Förbjudet

- Rör INTE journal/feed/forms-routes eller server.js.
- Ändra INTE auth/token-mekanismen (`ARCANA_ADMIN_TOKEN`).
- Ingen ny endpoint, ingen palett-/layout-ändring, ingen ny CSS-stil utöver nödvändigt.
- Ingen write mot patientdata. Ingen prod-deploy/merge utan Fazli-GO (frys).

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Manuell UAT (Claude, ägar-session):
  - Öppna `/admin#overview` utan att klicka något → Beredskap visar score + band + blockeringar, Pilotrapport fylls, Executive feed laddar.
  - Simulera 1 fallerande monitor-delanrop → övriga kort renderar ändå (ingen blank vy).

## Report (krävs vid done)

Commit-hash + ändrade filer + bevis: (a) översikten auto-fyller beredskap/pilot/executive utan klick, (b) allSettled — ett mockat delfel blankar inte vyn, (c) Claude UAT-resultat i ägar-session. Branch endast — vänta Fazli-GO för merge/deploy.
