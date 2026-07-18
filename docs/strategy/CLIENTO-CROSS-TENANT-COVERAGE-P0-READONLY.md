# Cliento cross-tenant coverage P0 — read-only

## Scope

Rapporten jämför de två befintliga tenant-bucketerna `hair_tp` och
`hair-tp-clinic` i samma `clientoBookingStore`. Den ändrar inte tenantnamn,
deduplicerar inte poster och föreslår inga patient- eller encounter-länkar.

## Inventering

| Del | Status | Befintlig källa | Gap som täcks här |
| --- | --- | --- | --- |
| Canonical booking-store | Hel | `src/ops/clientoBookingStore.js` | Ingen ändring |
| Obegränsad store-läsning | Hel | `listAllBookings({ limit: 0 })` | Används explicit |
| Tenant-buckets | Hel | `${tenantId}::${customer identity}` | Jämförs utan alias/dedupe |
| Fältjämförelse | Saknades | — | Normaliserad SHA-256 + avvikelse per fält |
| Full populationsgrind | Saknades | — | Defaultkrav 55 221 före beslutsunderlag |
| Okopplad review-population | Delvis | Befintlig review-kö | 11 283 hålls fail-closed och okopplade |

## Körning

Kör mot en explicit, read-only snapshot eller store-fil:

```bash
node scripts/report-cliento-cross-tenant-coverage.js \
  --store /explicit/path/to/cliento-bookings.json \
  --expected-total 55221 \
  --expected-unlinked 11283 > /tmp/cliento-cross-tenant-coverage.json
```

Scriptet använder `limit: 0`. Det returnerar exitkod `2` om den lästa
populationen inte exakt motsvarar den förväntade totalen eller om någon post
saknar `bookingId`. Saknad store ger exitkod `1`; en tom fallback får därför
inte maskera ett läsfel.

## Jämförelsekontrakt

Varje post normaliseras deterministiskt och får tre SHA-256-checksummor:

- full payload;
- kärnfält: status, start/slut, duration och behandling;
- samtliga befintliga notfält: `bookingNotes`, `customerMessage`,
  `internalNotes`, `treatmentNotes` och `notes`.

Tider normaliseras till ISO-instanter. Status och behandlingsnycklar trimmas,
gemeneras och får normaliserade mellanrum. Nottext trimmas och får normaliserade
radslut, men ändras inte semantiskt.

Klassificering per `bookingId`:

- `exact_match`: samma fulla checksumma;
- `complementary_notes`: samma kärnchecksumma och notskillnader där högst ena
  sidan har innehåll i respektive fält;
- `conflict`: kärnfält skiljer, båda sidor har olika innehåll i samma notfält,
  eller ett tenant har flera poster med samma `bookingId`;
- `one_sided_left` / `one_sided_right`: `bookingId` finns bara i ett tenant.

Rapporten räknar avvikelser separat för status, varje tids-/behandlingsfält och
varje notfält. Exempel maskerar `bookingId` med en kort SHA-256-referens och
innehåller aldrig nottext eller identitetsdata.

## Säkerhetsgrind

Rapporten har alltid:

- `readOnly: true` och `zeroWrites: true`;
- `deduplicated: false`;
- noll patientId-/encounterId-skrivningar och noll länkförslag;
- samples med `patientId: null`, `encounterId: null` och `linkAllowed: false`;
- `persistentLinkPlanAllowed: false` och `mergePlanAllowed: false`.

De 11 283 tvetydiga/olänkade posterna får inte auto-kopplas. En framtida
persistent länk- eller tenant-mergeplan kräver ett separat, explicit beslut
efter godkänd populations- och konfliktgranskning.
