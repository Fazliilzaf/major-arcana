# Cliento okopplad population – read-only reconcile 2026-07-18

## Slutsats

Det tidigare talet **11 283** var inte resultatet av en sparad eller reproducerbar
bookingId-mängd. Det skickades in som `expectedUnlinkedReviewCount` till
cross-tenant-rapporten, som enbart återgav värdet. Det fanns inget test som
kontrollerade värdet mot review-rader och inget maskerat basmanifest att jämföra
med.

Den första reproducerbara fullpopulationskörningen ger **11 472 unika bookingId:n**.
Differensen 189 är därför ett tidigare räkne-/kontraktsfel, inte 189 identifierbara
nya eller ompartitionerade poster. Eftersom den gamla mängden aldrig existerade som
manifest går det inte att säkert namnge en 189-posters differensmängd.

## Snapshot och population

Körningen var strikt read-only mot samma låsta snapshot före och efter analysen.

| Underlag | Version | `updatedAt` | Population |
| --- | ---: | --- | ---: |
| `cliento-bookings.json` | 1 | 2026-07-17T14:32:42.658Z | 55 221 bokningsförekomster |
| `cco-patient-master.json` | 1 | 2026-07-18T13:21:19.250Z | 7 439 patienter |

Reviewutfall per tenant:

| Tenant | Förekomster | `missing_identity` | `identity_collision` | `no_canonical_match` |
| --- | ---: | ---: | ---: | ---: |
| `hair_tp` | 10 428 | 9 377 | 447 | 604 |
| `hair-tp-clinic` | 1 969 | 0 | 1 121 | 848 |

Unionen innehåller 12 397 tenantförekomster och 11 472 unika bookingId:n. Exakt
925 bookingId:n förekommer i båda tenants. Samtliga 925 har samma identitetsklass
på båda sidor: 447 `identity_collision` och 478 `no_canonical_match`. Antalet
överlapp med olika kategori är 0.

Den unika unionen per identitetsklass är därmed:

- `missing_identity`: 9 377
- `identity_collision`: 1 121
- `no_canonical_match`: 974

Senaste patienttillägget i snapshoten simulerades bort i minnet. Reviewmängden var
fortfarande 11 472, utan tillagda eller borttagna bookingId:n. Det finns därmed
inget stöd för att differensen beror på ny patientdata.

## Dokumenterat facit och grind

Facit definieras nu som den deduplicerade unionen av bookingId:n från
`buildUnlinkedClientoBookingReview` för `hair_tp` och `hair-tp-clinic`, med exakt
en fail-closed reviewrad per bookingId. Populationen är 11 472 för snapshoten ovan.

Den maskerade mängdchecksumman är
`cf7cd6415f7cfbfa77207cca58ae0c554d5a1065480b1e33c521f27fcecbadf3`, beräknad
som `sha256(sorted-masked-booking-refs-v1)`. Råa bookingId:n och identitetsvärden
ingår inte i rapporten.

Kandidatmanifestet blockerar nu om reviewantalet avviker, om ett bookingId saknas,
om samma bookingId förekommer mer än en gång, om någon canonical länk redan finns
eller om fail-closed-flaggorna saknas. Cross-tenant-rapporten märker ett inmatat
förväntat reviewantal som **ej verifierat** i stället för att presentera det som ett
observerat resultat.

## Återkört kandidatmanifest

Efter att facit och unikhetsgrinden hade korrigerats återkördes generatorn mot
samma snapshot. Populationen var fortsatt 55 221 förekomster och 37 494 unika
bookingId:n. Resultatet var 1 887 strikt read-only kandidater. Övriga poster
klassificerades som 19 767 ensidiga, 173 kärnkonflikter, 14 742 notavvikelser och
925 poster i den fail-closed reviewmängden. Inga intra-tenant-dubbletter fanns i
denna körning.

Alla 1 887 kandidater hade komplett vänster-/höger-/parchecksumma och 1 887 unika
parchecksummor. Reviewmängdens checksumma var identisk med reconcile-körningen,
inga kandidater överlappade reviewmängden och inputfilerna var byte-identiska före
och efter. Manifeststatus var `review_candidates_only`; samtliga skriv-, approval-,
activation- och mergegrindar förblev avstängda.

## Säkerhetsläge

Ingen deduplicering, migration, projection, patientId-/encounterId-koppling eller
annan datawrite har utförts. De 11 472 unika reviewposterna förblir
`patientId:null`, `encounterId:null` och `linkAllowed:false`. Kundresegrinden är
fortsatt pausad.
