# ORD-58b · UAT-fynd efter ORD-58 fas 1-deploy (2026-07-12 kväll)

Status: **fix klar lokalt — väntar deploy** · Byggare: CURSOR · Prioritet: hög (CP-hero visar 1/5 live i stället för 4/5)

## Åtgärder (ORD-58b)

| Fynd            | Rotorsak                                                         | Fix                                                          |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Intäkt/AOV null | Fortnox OAuth under `hair_tp`, monitor använder `hair-tp-clinic` | `cfoFortnoxTenantResolve.js` — alias-upplösning              |
| Latens >8s      | Full `buildFinanceDashboard` + live paginering per request       | `slice: 'invoices'` i monitor + 10 min period-cache i lister |

## Prod-UAT-fynd (Claude, efter merge #824 + env-deploy)

1. **Intäkt/AOV är null i live-svaret.** Gatewayn svarar (source=live) men revenueSek.current=null →
   antingen är `fortnox.connected` false i buildern för hairtp-tenanten (verifiera OAuth-state i
   cfoFortnoxStore i prod) eller så ger fallbacken (ccoCommercialStore) inget. EKONOMI-segmentet
   visar Fortnox-data i klinik-UI:t, så OAuth BÖR vara ansluten — hitta varför buildern inte ser det.
2. **Latens: /monitor/clinic-performance överskrider ibland CEO:ns 8000 ms-timeout.**
   Trolig orsak: buildFinanceDashboard gör LIVE Fortnox-anrop (paginering, upp till 50 sidor) på
   VARJE request. Åtgärd: cachea perioder (TTL ~10 min) eller läs ur befintlig cfoFortnoxStore-cache
   i stället för att anropa Fortnox synkront i request-vägen.
3. **INTE en bugg:** no-show=null är korrekt källtäckningslogik (juli-bokningen kommer från källa
   utan no-show-stöd). Rör ej.

## Acceptance

- CP-svaret < 3 s varmt, aldrig > 8 s.
- revenueSek + avgOrderValueSek {current, previous} med riktiga Fortnox-tal för hairtp.
- Hero: 4 mätvärden live (bokningar, no-show när källtäckning finns, intäkt, AOV).

## Verify

```bash
npm run verify:ord58-clinic-performance-prod
```

### Prod före ORD-58b-deploy (2026-07-12)

| Check                    | Resultat                                |
| ------------------------ | --------------------------------------- |
| readyz                   | PASS                                    |
| clinic-performance 200   | PASS                                    |
| Latens                   | 6079 ms (≤8s, men >3s varm målsättning) |
| revenueSek.current       | **FAIL null**                           |
| avgOrderValueSek.current | **FAIL null**                           |

Förväntat efter deploy: revenue/AOV numeriska när Fortnox OAuth finns under `hair_tp`.

## Forbidden

Samma som ORD-58: inga gissade siffror; journal-routes orörda; frys-undantaget gäller endast denna kedja.
