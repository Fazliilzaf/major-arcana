# Cliento — maskerat kandidatmanifest och sidecar-ledger P0

**Status:** strikt read-only granskningsunderlag. Det här paketet skapar inga
ledgerposter, länkar, migreringar eller projektioner.

## Inventering och avgränsning

| Del | Status | Befintlig källa | Detta paket |
| --- | --- | --- | --- |
| Full population utan 50 000-cap | Hel | `src/ops/clientoCrossTenantCoverage.js` | Återanvänds med `limit: 0` |
| Konflikt- och notklassificering | Hel | `scripts/report-cliento-cross-tenant-decision.js` | Reglerna skärps till ett kandidatfilter |
| Fail-closed lista över oklara bokningar | Hel | `buildUnlinkedClientoBookingReview` | Krävs som deduplicerad input, exakt 11 472 unika booking-id:n |
| Maskerat kandidatmanifest | Saknades | — | Ny read-only generator |
| Sidecar-ledgerns tillståndskontrakt | Delvis | `CLIENTO-CROSS-TENANT-LINK-DECISION-PLAN-P0.md` | Preciseras maskinläsbart |

Ingen route, kundmodell, kalendermodell eller skrivande store tillkommer.

## Kandidatregler

En bokning tas med endast när samtliga grindar är sanna:

1. Samma `bookingId` förekommer exakt en gång i `hair_tp` och exakt en gång i
   `hair-tp-clinic`.
2. Normaliserad kärnchecksumma är identisk för status, start, slut, duration,
   `serviceId` och `serviceLabel`.
3. Checksumman är identisk för vart och ett av de fem befintliga notfälten.
   Även ett kompletterande notsegment exkluderar posten; ingen information
   väljs bort.
4. `bookingId` får inte finnas i den kompletta, fail-closed reviewpopulationen
   om 11 472 unika oklara/olänkade booking-id:n.
5. Saknat id, ensidig post, intra-tenant-dubblett, kärnkonflikt eller
   notavvikelse exkluderas.

Generatorn gissar aldrig patient eller encounter. Manifestet innehåller endast
en maskerad bokningsreferens och compare-and-swap-checksummor. `patientId` och
`encounterId` är alltid `null`, och alla write-/approval-/activation-gates är
`false`.

## Körning

```bash
node scripts/report-cliento-link-candidates.js \
  --store /explicit/read-only/path/cliento-bookings.json \
  --unlinked-review /explicit/read-only/path/cliento-unlinked-review.json \
  --expected-total 55221 \
  --expected-unlinked 11472 \
  > /tmp/cliento-link-candidates.masked.json
```

Båda inputfilerna måste anges explicit. Generatorn lämnar exitkod `2` och
emitterar noll kandidater vid populationsdrift, saknade booking-id:n eller en
reviewfil som inte bevisar `zeroWrites`, `readOnly`, `linkAllowed:false` och
`patientId:null`/`encounterId:null` för exakt 11 472 unika booking-id:n.

Källfilernas byteinnehåll ändras inte. Output innehåller ingen nottext, rått
booking-id eller canonical patient-/encounteridentifierare.

Snapshotkörningen 2026-07-18 gav 1 887 kandidater. Alla hade kompletta och unika
parchecksummor, och ingen kandidat överlappade den deduplicerade reviewmängden.
Det fullständiga reconcile-underlaget och snapshotversionerna finns i
`CLIENTO-UNLINKED-RECONCILE-P0-2026-07-18.md`.

## Compare-and-swap

Varje sida får en `sourceSnapshotChecksum` över tenant, booking-id,
normaliserad källidentitet och hela jämförelsepayloaden. Manifestet bär även
separata kärn- och notchecksummor samt en parchecksumma. En framtida, separat
godkänd aktivering måste läsa om båda source-raderna och kräva exakt samma
checksummor. Minsta drift stoppar aktivering och skickar kandidaten till ny
manuell review.

## Sidecar-ledger

Det maskinläsbara kontraktet finns i
`docs/strategy/cliento-link-sidecar-ledger-contract.v1.json`.

Tillståndskedjan är:

`proposed → approved → active → revoked|superseded`

- `proposed` och `approved` påverkar ingen projection.
- `active` är det enda framtida tillstånd som får projicera en länk och kräver
  separat owner-GO, behörighet, idempotency, audit och godkänd CAS.
- `revoked` och `superseded` är terminala append-only events. Ingen befintlig
  ledgerhändelse får uppdateras eller tas bort.
- Revoke återställer projectionen till okopplad utan att mutera booking-,
  patient- eller encounterdata.

## Fortsatt stoppregel

Detta underlag tillåter inte ledger-write, datamigration, patient-/encounter-
koppling, tenant-deduplicering eller kundreseåterstart. Första verkliga paketet
kräver separat owner-granskning av manifestets kohort, ledgerreglerna och ett
explicit begränsat urval.
