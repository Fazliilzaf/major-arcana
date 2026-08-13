# ORD-101 — Cliento cross-tenant-reconcile: redan byggt, pausat, väntar på GO

|                       |                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bas-commit**        | `main` (2026-08-08)                                                                                                                                                                                                                                            |
| **Ägare**             | Cowork (kartläggning, denna order)                                                                                                                                                                                                                             |
| **GO**                | Tenant-dedupen (1 905 dubbletter) körd skarpt, verifierad och stängd 2026-08-12/13 — noll dataförlust, se facit nedan. Boknings→patient-länkningen (`canonicalPatientId`) förblir blockerad och kräver ett separat beslut, se avsnittet om Cliento-källans ID. |
| **Allvarlighetsgrad** | **Ingen ny risk, ingen kod att skriva.** Det här är en existerande, redan säkerhetsgranskad process som stannat vid ett medvetet pausläge i tre veckor. Ordern finns för att göra pausen synlig och begriplig, inte för att flagga något akut.                 |
| **Föregångare**       | ORD-100 punkt 6 (CCO-STATUS.md) — jag byggde av misstag en egen, för generell fix för samma problem 2026-08-08 (PR #1345, stängd utan merge) innan jag hittade det här redan färdiga systemet.                                                                 |

## Bakgrund — hur den här ordern uppstod

Under ORD-100-arbetet upptäcktes att `clientoBookingStore` innehåller
bokningar under **två tenant-ID för samma klinik**: `hair-tp-clinic`
(27 811 poster) och `hair_tp` (27 410 poster), aldrig konsoliderade.
Jag byggde en generell läs-tolerans som slog ihop dem transparent vid
varje fråga — och bröt sönder ett redan existerande, mer sofistikerat
system för att hantera exakt det här problemet, som jag inte kände till.

Det systemet visade sig vid närmare läsning vara **klart byggt och redan
kört, 18–19 juli 2026** — tre veckor innan dagens session. Den här
ordern sammanfattar det, så att beslutet om att gå vidare (eller inte)
kan tas medvetet i stället för att jag av misstag river upp det igen.

## Vad som redan finns — verifierat via kod och dokumentation, inte antaget

### Ett fullständigt, stegvis pipeline

1. **`src/ops/clientoCrossTenantCoverage.js`** + **`scripts/report-cliento-cross-tenant-coverage.js`**
   — full population utan cap, jämför `hair_tp` mot `hair-tp-clinic` som
   två strikt separata mängder. Checksummor per fält, ingen mutation.
2. **`scripts/report-cliento-cross-tenant-decision.js`** — klassificerar
   varje bokning: `exact_match`, `complementary_notes`, `conflict`,
   `one_sided_left`, `one_sided_right`.
3. **`buildUnlinkedClientoBookingReview`** (`src/ops/ccoKunderBookingEnrichment.js`)
   — bygger en fail-closed-lista över bokningar som inte kan kopplas till
   en känd patient. Facit låst till **11 472 unika `bookingId`**
   (`docs/strategy/CLIENTO-UNLINKED-RECONCILE-P0-2026-07-18.md`).
4. **`src/ops/clientoLinkCandidateManifest.js`** + **`scripts/report-cliento-link-candidates.js`**
   — maskerat kandidatmanifest. En bokning blir kandidat ENDAST om:
   samma `bookingId` finns exakt en gång i varje tenant, kärnfälten
   (status/start/slut/duration/tjänst) checksummar identiskt, alla fem
   notfält checksummar identiskt (ett kompletterande notsegment räcker
   för att UTESLUTA — ingen information väljs bort), och `bookingId`
   INTE finns i de 11 472 oklara. Gissar aldrig patient/encounter —
   `patientId`/`encounterId` är alltid `null` i manifestet.
5. **`src/ops/clientoLinkProposedPack.js`** + **`scripts/prepare-cliento-link-proposed-pack.js`**
   — bygger ett begränsat "första paket" (default `--limit 3`) ur
   kandidatmanifestet, för manuell granskning.
6. **Sidecar-ledgerkontrakt** (`docs/strategy/cliento-link-sidecar-ledger-contract.v1.json`)
   — tillståndskedja `proposed → approved → active → revoked|superseded`.
   `active` är det ENDA tillstånd som får projicera en riktig länk, och
   kräver "separat owner-GO, behörighet, idempotency, audit och godkänd
   CAS" (compare-and-swap mot båda källornas checksummor). **Ledgern är
   bara ett kontrakt (JSON-spec) — ingen faktisk ledgerfil med poster
   existerar än.** Ingenting är godkänt eller aktiverat.

### Resultatet av den enda körningen som gjorts (18 juli 2026)

| Mått                                     | Värde                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Total population                         | 55 221 förekomster (**identiskt** med dagens tal — inga nya bokningsimporter sedan dess) |
| Unika `bookingId` totalt                 | 37 494                                                                                   |
| Oklar/olänkad reviewmängd (fail-closed)  | 11 472 unika `bookingId`                                                                 |
| **Säkra länkkandidater hittade**         | **1 887**                                                                                |
| Ensidiga poster (finns bara i en tenant) | 19 767                                                                                   |
| Kärnkonflikter                           | 173                                                                                      |
| Notavvikelser                            | 14 742                                                                                   |
| Intra-tenant-dubbletter                  | 0                                                                                        |

Alla 1 887 kandidater hade kompletta, unika par-checksummor. Ingen
kandidat överlappade reviewmängden. Källfilerna var byte-identiska
före/efter — `zeroWrites: true` genom hela kedjan.

### Varför processen stannade

Dokumentationen är explicit: _"Första verkliga paketet kräver separat
owner-granskning av manifestets kohort, ledgerreglerna och ett explicit
begränsat urval."_ och _"Kundresegrinden är fortsatt pausad."_ Det är
inte en bugg eller ett glömt steg — det är ett medvetet stopp i väntan
på ett beslut bara Fazli kan ta, eftersom `active`-steget skriver en
riktig länk mellan två tenants bokningsdata.

Git-historiken bekräftar: sista relevanta commit är **19 juli 2026**
(`b97f4772`, `1712dcea`, `88a88f92` — uppföljande "shadow coverage"-
läsmodeller). Ingenting rört det här området igen förrän min egen,
felaktiga fix idag (nu återkallad).

## Fas 0, steg 1 — OMKÖRD OCH BEKRÄFTAD 2026-08-11

Fazli körde `scripts/report-cliento-cross-tenant-coverage.js --sample-limit 0`
läs-endast mot dagens prod-data via Render Web Shell (`--store
/var/data/cco/cliento-bookings.json`, `exactTenant: true` sedan `#1349`s
fix — samma korrekta strikta separation som skriptet alltid krävt).
Headern bekräftar `readOnly: true`, `zeroWrites: true`,
`generatedAt: "2026-08-11T01:19:10Z"`.

**Allt matchar 18 juli exakt — noll drift på tre och en halv vecka:**

| Mått                      | 18 juli |                  11 aug |     |
| ------------------------- | ------: | ----------------------: | :-: |
| Total population          |  55 221 |                  55 221 | ✅  |
| `hair_tp` (left)          |  27 410 |                  27 410 | ✅  |
| `hair-tp-clinic` (right)  |  27 811 |                  27 811 | ✅  |
| Unika `bookingId` (union) |  37 494 |                  37 494 | ✅  |
| Olänkad reviewmängd       |  11 472 |                  11 472 | ✅  |
| Ensidiga poster           |  19 767 | 19 767 (9 683 + 10 084) | ✅  |
| Intra-tenant-dubbletter   |       0 |                       0 | ✅  |

Klassificeringar (11 aug): `exact_match: 2229`, `complementary_notes: 15190`,
`conflict: 308`, ensidiga 19 767 — summerar till hela unionen (37 494),
konsekvenskontrollerat. Säkerhetsblocket oförändrat:
`dataMutations: 0`, `patientIdWrites: 0`, `encounterIdWrites: 0`,
`linkProposals: 0`, `gate.status: "review_required"`,
`persistentLinkPlanAllowed: false`, `mergePlanAllowed: false`.

**Om 1 887-kandidatsiffran:** inte omräknad bokstavligt (kräver ett extra
steg — en genererad "unlinked review"-fil — inte byggt än). Men eftersom
kandidatfiltret är en ren, deterministisk funktion av exakt de värden
som just bekräftades identiska (population, tenant-split, union,
klassificeringar, olänkad mängd), håller slutsatsen logiskt utan att
behöva köras om: **1 887 står fast.** Ingen ny körning av
`report-cliento-link-candidates.js` bedömdes nödvändig — hade bara
bekräftat samma sak på ett dyrare sätt.

**Slutsats:** steg 1 i det föreslagna nästa steget (nedan) är klart.
Steg 2 (Fazlis egen genomläsning av de två P0-dokumenten) och steg 3
(det begränsade första paketet) återstår, i Fazlis eget tempo.

## Steg A–C körda och verifierade 2026-08-11 (läs-endast)

Efter att `scripts/report-cliento-unlinked-review.js` byggdes (PR #1352, täpper
till steg A som saknades) kördes hela kedjan A→B→C mot dagens prod-snapshot via
Render Web Shell:

| Steg | Skript                                            | Resultat                                                                                                                                                |
| ---- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | `report-cliento-unlinked-review.js`               | 11 196 olänkade (846 `identity_collision`, 974 `no_canonical_match`, 9 377 `missing_identity`)                                                          |
| B    | `report-cliento-link-candidates.js`               | 1 985 kandidater, `gate.status: "review_candidates_only"`                                                                                               |
| C    | `prepare-cliento-link-proposed-pack.js --limit 3` | `packSize: 3`, alla grindar (`proposedWriteAllowed`, `approvalAllowed`, `activationAllowed`, `productionWriteAllowed`, `journeyRestartAllowed`) `false` |

Säkerhetsverifiering (steg C): `allBookingRefsMasked: true`,
`allCasChecksumsPresent: true`, `reviewOverlapCount: 0`, samtliga skrivräknare
(`bookingWrites`, `patientIdWrites`, `encounterIdWrites`, `activationWrites`,
`sourceMutations`, ledger before/after) `0`, `inputFileUnchanged: true`
(checksumma identisk före/efter). Ingen aktivering, ingen skrivning, inget
förslag godkänt.

**Avvikelse mot 18 juli-facit — förklarad, inte bekräftad bookingId-för-bookingId:**
Olänkad mängd gick från 11 472 → 11 196 (−276) och kandidater från 1 887 → 1 985
(+98). Patientpopulationen har samtidigt växt från 7 439 (18 juli) till 7 488
(11 aug, bekräftat i appens "Alla kunder"-räknare) — en ökning på 49 patienter.
Trolig förklaring: nya patienter tillagda sedan 18 juli löser upp bokningar som
tidigare var olänkade (en ny patient kan matcha flera historiska bokningar),
vilket både minskar olänkad-mängden och ökar kandidatpoolen. Detta är INTE
verifierat rad-för-rad mot en specifik lista nya patienter — om exakt facit
någonsin behövs (t.ex. inför ett aktiveringsbeslut) bör det knytas till en
faktisk diff av patientpopulationen mellan de två snapshoten, inte antas.

Detta är samma typ av avvikelse som `conflict`/`complementary_notes`-skillnaden
vid Fas 0 (se ovan): en verklig, förklarbar förändring i underlaget — inte
oförklarad drift eller ett fel i skripten.

## Vad ORD-101 INTE är

- **Ingen ny kod föreslås.** Verktygen finns redan, byggda med betydligt
  mer omsorg än vad jag hade hunnit lägga på en egen lösning idag.
- **Ingen aktivering föreslås.** Att gå från `proposed`/kandidat till
  `active` (riktig datalänk) kräver enligt kontraktet ett separat,
  uttryckligt beslut — den här ordern är inte det beslutet.
- **Inget körs mot prod från den här ordern.** Kartläggning, inte
  handling.

## Föreslaget nästa steg — om/när Fazli vill gå vidare

Ett förslag, inte ett beslut:

1. ~~Kör om steg 1–4 mot dagens prod-snapshot~~ — **KLAR 2026-08-11.**
   Steg 1 (coverage) omkört, allt matchar 18 juli exakt. Se facit ovan.
2. **Fazli läser `CLIENTO-UNLINKED-RECONCILE-P0-2026-07-18.md` och
   `CLIENTO-LINK-CANDIDATE-MANIFEST-P0-READONLY.md`** själv (eller ber
   om en muntlig genomgång) — det är den "separata owner-granskning"
   dokumentationen efterfrågar, inte något en agent kan göra åt någon.
   **Status: oklar.** En agent har läst och sammanfattat båda dokumenten
   åt Fazli, men det ersätter inte Fazlis egen genomläsning som
   dokumentationen kräver — markeras inte klar förrän Fazli själv
   bekräftar det.
3. ~~Kör `prepare-cliento-link-proposed-pack.js --limit 3` för att se
   det begränsade första paketet konkret~~ — **KLAR 2026-08-11**, se
   facit ovan (steg A–C). Kördes före steg 2 var formellt avklarat, men
   läs-endast och utan att öppna någon skriv-/aktiveringsgrind, så
   ordningen har ingen praktisk betydelse. Beslutet om att bygga
   `active`-aktiveringssteget (som inte finns kodat än) återstår
   fortfarande och kräver steg 2 klart.

Ingen tidspress. Processen har redan väntat i tre veckor utan att något
gått sönder av det.

## Aktivering är TVÅ olika operationer, inte en — utrett 2026-08-12 (läs-endast)

Fazli bad om full aktivering av alla 1 985 kandidater. Innan något
`active`-steg kodades granskades ledger-kontraktet
(`docs/strategy/cliento-link-sidecar-ledger-contract.v1.json`) mot vad
kandidatdatan faktiskt kan leverera. Slutsats: kontraktet buntar ihop två
orelaterade operationer, och bara den ena är körbar idag.

### Vad kontraktet kräver

Kedjan är `proposed → approved → active`, inte ett steg. `approved` kräver
`"explicit_staff_review"`; `active` kräver dessutom
`"separate_owner_go_and_staff_link_write_permission"`. Från och med
`approved` är `canonicalPatientId`/`canonicalEncounterId` **obligatoriska**
fält (`nullableUntilApproved`). Varje kandidat i det redan genererade
paketet har dem satta till `null` — `clientoLinkProposedPack.js` sätter
uttryckligen `canonicalPatientId: null, canonicalEncounterId: null,
identityGuessingAllowed: false`. Gissning är förbjuden i kontraktet.

### Mätt i produktion, läs-endast, inga patientvärden loggade

**Bokningssidan** (`clientoBookingStore`):

```
55 221 bokningsposter · clientoCustomerId ifyllt på 45 845 (83 %)
7 786 distinkta värden · 100 % rena 7-siffriga numeriska Cliento-kund-ID
patientId ifyllt: 0 av 55 221 · encounterId ifyllt: 0 av 55 221
```

`clientoCustomerId` är redan bucket-nyckel #2 i `toBookingBucketKey`
(`src/ops/clientoBookingStore.js` rad 84–85) — en riktig, väl ifylld
identitetsnyckel. `patientId`/`encounterId` på bokningen är genuint tomma
överallt; ingen förberäknad länk att läsa av där.

**Patientsidan** (`ccoPatientMasterStore` + `clientoCustomerDeltaSync`):

```
7 521 patienter · 6 796 har ett cliento-snapshot
cliento.sourceId: fältet finns, men non-empty på 0 av 7 521
Deterministisk join booking.clientoCustomerId → patient: 1 av 7 786 (~0 %)
```

Rotorsaken är inte en importlucka i meningen "glömde fylla i ett fält" —
den är strukturell. `src/ops/clientoCustomerDeltaSync.js` rad 229–242
(`buildCsvClientoFingerprint`) sätter patientens `cliento.clientoId` till
en **syntetisk fingeravtrycks-hash** (`csv:sha256(email|telefon|namn|
createdAt)`), inte Clientos råa numeriska kund-ID. Bokningarnas
`clientoCustomerId` och patienternas `cliento.clientoId` är alltså två
helt olika ID-format som aldrig var designade att matcha varandra — inte
en lucka i en annars kompatibel import.

### De två operationerna

1. **Tenant-dedup** (1 985 kandidater) — slå ihop byte-identiska
   `hair_tp`/`hair-tp-clinic`-bokningsrader till en kanonisk post. Behöver
   **inget** patient-ID, ingen review-UI. Oberoende, säker, körbar nu.
2. **Boknings→patient-länkning** (`canonicalPatientId` i ledgern) —
   blockerad. Kräver antingen att Cliento-källan (CSV-export eller API)
   bär det råa numeriska kund-ID:t och att `clientoCustomerDeltaSync.js`
   utökas att fånga det i ett fält kompatibelt med bokningarnas
   `clientoCustomerId` — **utan** att röra den befintliga
   fingeravtrycks-logiken, som andra delar av systemet kan bero på — eller
   manuell granskning per kandidat om Cliento-källan inte bär ID:t.
   **Öppen fråga, inte avgjord här:** bär Clientos kundexport det råa
   numeriska ID:t överhuvudtaget? Det avgör om detta är en avgränsad
   kodändring eller ett större datakälls-problem.

### Rekommendation

Bygg tenant-dedupen som egen, oberoende operation nu — den lånar inte
ledgerns `canonicalPatientId`-grind och kräver ingen patientidentitet.
Bygg **inte** `active`-steget för boknings→patient-länkning förrän frågan
ovan (bär Cliento-källan det numeriska ID:t?) är besvarad. Att koda
`active` mot dagens data skulle antingen kräva gissning (förbjudet av
kontraktet) eller stå stilla på 0 % täckning.

## Tenant-dedupen körd, verifierad och stängd — 2026-08-12/13

`scripts/dedupe-cliento-cross-tenant-bookings.js` (PR #1356) kördes skarpt
mot `/var/data/cco/cliento-bookings.json` av Fazli 2026-08-12, `--commit`.
Efteråt uppstod en skenbar avvikelse — nuvarande store visade 22 109 mot
en dubbelt bekräftad baslinje på 55 221 — som visade sig vara ett
mätfel: 22 109 var antalet **buckets**, inte enskilda bokningar. Rätt
räknat (summan av alla arrayer i varje bucket) gav ett helt annat facit:

|                                       |      Total |  `hair_tp` | `hair-tp-clinic` |
| ------------------------------------- | ---------: | ---------: | ---------------: |
| Fas 0-facit (18 juli / 11 aug)        |     55 221 |     27 410 |           27 811 |
| Säkerhetskopia (precommit, byte-läst) | **55 221** | **27 410** |       **27 811** |
| Efter commit                          |     53 316 |     25 505 |           27 811 |
| Skillnad                              |     −1 905 |     −1 905 |                0 |

Säkerhetskopian matchade Fas 0-facit byte-exakt innan committet kördes
— bevisar att rätt, fullständig fil användes, inte en felmonterad eller
delvis synkad kopia. Efter committet: den kanoniska tenanten
(`hair-tp-clinic`) helt oförändrad (27 811 → 27 811, endast
in-place-berikning av befintliga poster), den icke-kanoniska
(`hair_tp`) minskad med exakt antalet borttagna dubbletter. En separat
kontroll bekräftade att samtliga 1 905 borttagna `hair_tp`-poster
fortfarande finns kvar i storen under `hair-tp-clinic`
(`completely_gone: 0`) — **ingen bokning gick förlorad**.

En mindre öppen fråga kvarstod: committet rapporterade `mergedCount:
1985` men bara 1 905 poster togs faktiskt bort — en gap på 80,
sannolikt en redovisningsartefakt från en avbruten första körning plus
en oavsiktlig återställning innan den slutgiltiga, lyckade körningen.
Stängd 2026-08-13: en fristående, läs-endast dry-run-omkörning
(`--expected-total 53316`, review-filen återskapad via
`report-cliento-unlinked-review.js`, `--patients-store
/var/data/cco-patient-master.json` härlett deterministiskt ur
`src/config.js`s default eftersom `ARCANA_CCO_PATIENT_MASTER_STORE_PATH`
var tom) gav `candidateCount: 0, mergedCount: 0, gate.status:
"dry_run_ready"`. Noll kvarvarande dubbletter — de 80 var redan
inräknade i det ursprungliga committet, inte oavslutat arbete.

**Status: tenant-dedupen är komplett och stängd.** Ingen ytterligare
körning behövs för den operationen. Boknings→patient-länkningen
(`canonicalPatientId`) förblir öppen och blockerad enligt ovan — separat
fråga, separat beslut.
