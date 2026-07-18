# Cliento cross-tenant — read-only besluts- och länkplan P0

**Status:** Granskningsunderlag. Inga datawrites, ingen deduplicering och ingen
kundreseåterstart är tillåten av detta dokument.

## 1. Verifierad population

Read-only-analysen kördes mot samma fulla prod-store som #1082, utan samples,
bookingId eller nottext i output.

| Mått                             |  Antal |
| -------------------------------- | -----: |
| Totala förekomster               | 55 221 |
| BookingId-intersektion           | 17 727 |
| Exakt full payload               |  2 229 |
| Kompletterande noter             | 15 190 |
| Konflikter                       |    308 |
| Kärnkonflikt utan dubbel nottext |     96 |
| Dubbel nottext utan kärnkonflikt |    130 |
| Kärnkonflikt och dubbel nottext  |     82 |
| Intra-tenant bookingId-dubblett  |      0 |

De 308 konflikterna består alltså av 178 poster med minst en avvikelse i
kärnfält och 212 poster där båda tenantversionerna har olika, icke-tom text i
det generiska `notes`-fältet. Grupperna överlappar med 82 poster.

### Kärnfält

| Fält            | Konflikter |
| --------------- | ---------: |
| status          |         60 |
| startsAt        |        102 |
| endsAt          |        129 |
| durationMinutes |         41 |
| serviceId       |          0 |
| serviceLabel    |          7 |

Vanligaste kärnmönster: 78 har `startsAt+endsAt`, 48 endast status, 23
`endsAt+durationMinutes` och 10 hela tids-trippeln. Av starttidskonflikterna är
56 mer än ett dygn isär och 29 mellan 61 minuter och ett dygn. Detta är inte
små avrundningsdifferenser och får inte normaliseras bort.

Statusövergångarna är:

- `cancelled → completed`: 35
- `no_show → completed`: 14
- `upcoming → completed`: 5
- `completed → upcoming`: 4
- `cancelled → upcoming`: 2

### Notfält

I de 15 190 kompletterande fallen ligger allt unikt innehåll på `hair_tp`-
sidan: 14 956 `bookingNotes`, 3 377 `customerMessage`, 5 `treatmentNotes` och
34 `notes`. En bokning kan bidra till flera fält. Detta är informationsdelta,
inte en grund för att välja en tenantpost som radvinnare.

I konfliktpopulationen finns dessutom:

- 212 `notes` där båda sidor har olika icke-tom text;
- 293 vänstersidiga `bookingNotes`;
- 151 vänstersidiga `customerMessage`;
- 24 vänstersidiga `treatmentNotes`;
- 9 vänstersidiga `notes`.

`internalNotes` har inga avvikelser i den jämförda populationen.

## 2. Fält-för-fält beslutskontrakt

Reglerna nedan beskriver ett framtida beslutsförfarande. De aktiverar ingen
merge och skriver inget.

| Fält                                    | Tillåten framtida regel                                                                                                                          | Fail-closed-villkor                                                                                                                | Informationsbevarande                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `bookingId`                             | Behandlas som källidentifierare inom sitt tenant. Samma värde får bilda en granskningsgrupp men är inte ensam patientbevisning.                  | Saknat id eller intra-tenant-dubblett blockerar gruppen.                                                                           | Behåll båda `(tenantId, bookingId)` som separata source refs.                   |
| `status`                                | Välj endast status från en verifierad Cliento-händelse med stabilt event-id och källans `statusChangedAt`/revision.                              | Saknad källrevision, motstridiga terminalstatusar eller endast importtid ⇒ manuell review. Ingen statushierarki får gissa vinnare. | Behåll båda råstatusarna och eventreferenserna i provenance.                    |
| `startsAt`, `endsAt`, `durationMinutes` | Behandlas som ett atomärt schema-tuple. En framtida resolver får välja en komplett, verifierad källrevision; aldrig ett fält från vardera sidan. | Ogiltig duration, tidszonsosäkerhet, >5 min avvikelse eller saknad source-revision blockerar.                                      | Behåll båda tuples, timezone och checksumma.                                    |
| `serviceId`                             | Måste resolvea entydigt mot befintlig canonical service-katalog.                                                                                 | Två olika giltiga ids eller inget entydigt katalogresultat blockerar.                                                              | Behåll source service-id på båda refs.                                          |
| `serviceLabel`                          | Är displaymetadata. Visa canonical `displayName` först efter entydig `serviceId`-resolution.                                                     | Label ensam får aldrig välja behandling; de 7 konflikterna kräver katalog-/reviewbeslut.                                           | Behåll båda source labels som aliases/provenance.                               |
| Alla notfält                            | Varje icke-tomt source-segment bevaras separat med tenant, source field och checksumma.                                                          | Ingen radvinnare, ingen overwrite och ingen semantisk dedupe. Olika icke-tom text i samma fält visas som två segment.              | 15 190 kompletterande poster och alla 212 dubbla `notes` bevaras på båda sidor. |
| `patientId`                             | Får i en framtida fas endast länkas via redan verifierad, stabil patientnyckel med exakt 1:1-resultat.                                           | E-post/telefon/namn/tid ensamt, flera kandidater eller no-match ⇒ `patientId:null`. De 11 472 unika review-booking-id:na förblir okopplade. | Länken lagras i separat ledger; bookingpayload ändras inte.                     |
| `encounterId`                           | Kräv befintlig explicit canonical encounter-referens eller source-native encounter-id som redan mappar 1:1.                                      | Tidsnärhet, behandlingstext eller patientlikhet får inte skapa encounter-länk.                                                     | Separat revokerbar ledgerpost; booking och encounter ändras inte.               |

## 3. Reversibel persistent länkplan

### 3.1 Sidecar-ledger, inte booking-merge

En framtida implementation bör använda ett append-only link-ledger bredvid den
befintliga booking-storen. Den får inte lägga `patientId` eller `encounterId`
direkt på importerade Cliento-rader.

Minsta ledgerpost:

```json
{
  "linkId": "immutable uuid",
  "sourceTenantId": "hair_tp",
  "sourceBookingId": "opaque source id",
  "sourcePayloadChecksum": "sha256",
  "canonicalPatientId": "uuid or null",
  "canonicalEncounterId": "uuid or null",
  "evidenceType": "verified_source_identifier",
  "evidenceRef": "immutable evidence id",
  "state": "proposed|approved|active|revoked|superseded",
  "idempotencyKey": "deterministic key",
  "createdAt": "ISO timestamp",
  "createdBy": "staff/system actor",
  "supersedesLinkId": null,
  "revokedAt": null,
  "revokedBy": null,
  "reasonCode": "reviewed reason"
}
```

`sourceTenantId + sourceBookingId + sourcePayloadChecksum` är compare-and-swap-
grinden. Om payloaden har ändrats sedan review ska aktivering stoppas och posten
återgå till review.

### 3.2 Tillstånd och audit

1. `proposed`: read-only analysresultat; får inte påverka Kalender/Kunder.
2. `approved`: explicit staffbeslut med verifierad evidens; fortfarande ingen
   projection.
3. `active`: kräver separat GO, idempotency-key och append-only audit.
4. `revoked`: projection ignorerar länken omedelbart; source booking är orörd.
5. `superseded`: ny godkänd länk refererar den gamla, som aldrig skrivs över.

Audit ska minst ha `link_requested`, `link_approved`, `link_activated`,
`link_revoked` och `link_superseded`, med actor, tenant, checksumma och reason.

### 3.3 Rollback

Rollback är en ny `revoked`-händelse, inte delete eller återställning av en
muterad bookingrad. Efter revoke ska projectionen falla tillbaka till
`patientId:null`/`encounterId:null`; en checksummakontroll ska bevisa att
Cliento-storen är byte-identisk med läget före länken.

## 4. Föreslagna framtida gates

Ingen gate nedan är godkänd för körning ännu.

1. Schema- och audit-PR för ledger, feature flag av, endast tester.
2. Full dry-run som reproducerar 55 221 / 308 / 15 190 och ger noll writes.
3. Separat review av de 308 konflikterna; inga bulkregler för status eller tid.
4. Separat GO för en liten canary med endast verifierade 1:1-länkar och inga av
   de 11 472 unika tvetydiga booking-id:na.
5. Före/efter: oförändrade bookingchecksummor, 0 ghost/link-only/orphan,
   revoketest PASS och exakt auditkedja.
6. Kundresor får inte återstartas förrän länkcoverage och visuell
   Kalender↔Kunder-paritet är separat godkända.

## 5. Nuvarande stoppregel

`mergeAllowed:false` och `persistentLinkWriteAllowed:false` gäller. Detta
underlag får endast granskas. Varje implementation, canary eller dataändring
kräver ett nytt uttryckligt GO.
