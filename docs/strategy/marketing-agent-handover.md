# Marketing agent handover

Denna fil förklarar hur marknadsagenten (CMO-copilot) är uppbyggd i Arcana och hur nya agenter ska interagera med den.

## Vad som finns

| Komponent               | Sökväg                                     | Syfte                                                                            |
| ----------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| GSC-adapter             | `src/ops/cmoGscAdapter.js`                 | Hämtar klick/visningar/position från Google Search Console Search Analytics API. |
| Connector-adapters      | `src/ops/cmoMarketingConnectorAdapters.js` | Resolves `live` vs `fixture` och kör rätt adapter per kanal.                     |
| Connectors-config       | `src/ops/cmoMarketingConnectors.js`        | Definierar `DEFAULT_CHANNELS`, `CHANNEL_FIXTURES` och status/rapporteringslogik. |
| Veckorapport-store      | `src/ops/marketingWeeklyReportsStore.js`   | JSON-baserad store med list/get/upsert/patch/delete/replaceKpi.                  |
| Veckorapport-kompositör | `src/ops/cmoWeeklyReportComposer.js`       | Samlar kanaldata och bygger rapportutkast.                                       |
| API-routes              | `src/routes/marketingWorkspace.js`         | Endpoints under `/api/v1/marketing/...`.                                         |
| UI-panel                | `public/admin/cmo-weekly-reports.js`       | Flik i admin för att lista, generera och redigera veckorapporter.                |
| Server-bootstrap        | `server.js`                                | Skapar `marketingWeeklyReportsStore` och registrerar routern.                    |
| App-config              | `src/config.js`                            | Env-variabler för connectors, weekly reports path, etc.                          |

## Veckorapport-API

Alla endpoints kräver autentisering och rollen `owner` eller `staff`.

| Method | Path                                            | Beskrivning                                                 |
| ------ | ----------------------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/v1/marketing/weekly-reports`              | Lista rapporter. Query: `brand`, `week`, `status`, `limit`. |
| GET    | `/api/v1/marketing/weekly-reports/:id`          | Hämta en rapport.                                           |
| POST   | `/api/v1/marketing/weekly-reports`              | Skapa eller ersätta en rapport.                             |
| PATCH  | `/api/v1/marketing/weekly-reports/:id`          | Uppdatera fält (t.ex. `sections`, `status`).                |
| POST   | `/api/v1/marketing/weekly-reports/:id/generate` | Generera utkast från connectors.                            |
| DELETE | `/api/v1/marketing/weekly-reports/:id`          | Ta bort rapport (endast owner).                             |

Rapportmodell:

```json
{
  "id": "uuid",
  "tenantId": "hair-tp-clinic",
  "brand": "hairtpclinic",
  "week": "2026-W32",
  "periodStart": "2026-08-03",
  "periodEnd": "2026-08-09",
  "status": "draft",
  "createdBy": "agent",
  "summary": "...",
  "sections": {
    "kpi": {
      "gsc": {},
      "google_ads": {},
      "meta": {},
      "linkedin": {},
      "mail": {},
      "web": {}
    },
    "done": [],
    "planned": [],
    "draftsPending": [],
    "blockers": []
  }
}
```

## Connectors

`/api/v1/marketing/connectors/status` visar hälsan för varje kanal.

För närvarande är GSC satt till `fixture`-läge som standard i Render-runtime (`src/config.js`):

```
ARCANA_MARKETING_GSC_ENABLED=false
ARCANA_MARKETING_GSC_MODE=fixture
ARCANA_MARKETING_GSC_LIVE_FETCH=false
```

För att slå på live GSC:

```bash
ARCANA_MARKETING_GSC_ENABLED=true
ARCANA_MARKETING_GSC_MODE=live
ARCANA_MARKETING_GSC_LIVE_FETCH=true
ARCANA_MARKETING_GSC_ACCESS_TOKEN=<oauth-access-token>
ARCANA_MARKETING_GSC_SITE_URL=https://hairtpclinic.com
```

GSC-adapteren använder `https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` och aggregerar `clicks`, `impressions` och viktad `position` över det valda fönstret (default `7d`).

## Miljövariabler

Se `.env.example` eller befintlig env-mall. Viktiga variabler:

- `ARCANA_MARKETING_CONNECTORS_ENABLED` — master-switch för connectors.
- `ARCANA_MARKETING_CONNECTORS_MODE` — `live` eller `fixture`.
- `ARCANA_MARKETING_GSC_*` — GSC-credentials och on/off.
- `ARCANA_MARKETING_WEEKLY_REPORTS_PATH` — sökväg till JSON-store (default under `ARCANA_STATE_ROOT`).

## Testning

Kör nya tester med:

```bash
npm test -- tests/ops/cmoGscAdapter.test.js tests/ops/marketingWeeklyReportsStore.test.js tests/ops/cmoWeeklyReportComposer.test.js
```

Route-tester läggs i `tests/routes/marketingWorkspace.test.js` (eller motsvarande test-suite).

## Regler för agenter

1. **Använd API:t.** Skapa inte lokala Markdown-filer som enda sanning. Veckorapporter ska alltid sparas i Arcana så Fazli ser dem.
2. **Rapportera osäker data.** Om en connector saknar credentials, skriv `insufficient_data` och notera blockeraren — hitta inte på KPI:er.
3. **Godkännande.** Ingen publicering eller budgetspend utan Fazlis godkännande.
4. **Compliance.** Patientnära innehåll granskas mot claims-whitelist.
5. **Brancha.** Kodändringar sker via PR mot `Fazliilzaf/major-arcana` `main`, aldrig direkt i produktion.
