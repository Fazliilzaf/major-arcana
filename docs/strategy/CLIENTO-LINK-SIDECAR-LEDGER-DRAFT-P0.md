# Cliento sidecar-ledger – gated draft P0

**Status:** lokal/testad implementation. Ingen route, servermontering, prod-store,
projection eller kundreseintegration finns i denna fas.

## Inventering och byggt gap

| Del                          | Före denna PR       | Denna PR                                                      |
| ---------------------------- | ------------------- | ------------------------------------------------------------- |
| Read-only kandidatgenerator  | Hel                 | Återanvänds oförändrad                                        |
| Maskinläsbart ledgerkontrakt | Hel                 | Återanvänds oförändrat                                        |
| Append-only sidecar-store    | Saknades            | JSONL-eventkedja med hashintegritet                           |
| Tillståndsmaskin             | Endast specificerad | `proposed → approved → active → revoked/superseded`           |
| CAS                          | Endast specificerad | Source checksums + `previousEventId` kontrolleras före append |
| Rollback                     | Endast specificerad | `revoked`/`superseded` tar bort active projection utan delete |
| Första proposed-pack         | Saknades            | Tre maskerade read-only previewposter                         |

Ingen befintlig booking-, patient-, encounter-, kalender- eller kundmodell har
ändrats eller duplicerats.

## Ledgerkärna

`src/ops/clientoLinkSidecarLedger.js` är en isolerad factory som kräver explicit
`filePath`. Den är fail-closed som default:

- `ledgerWriteAllowed:false`
- `activationAllowed:false`

Ingen fil skapas när skrivgrinden är stängd. Modulen är inte importerad av någon
route eller runtime-bootstrap.

Varje lyckad lokal/testmutation appenderar en ny JSONL-rad. Tidigare event
uppdateras eller tas aldrig bort. Eventet innehåller global föregående hash,
föregående event-id inom länken, request-checksumma och eventhash. Omstart
verifierar hela hashkedjan, tillståndsövergångar, sourceRefs, canonical-ID:n,
idempotency och CAS-bevis innan store-instansen öppnas.

### Övergångsgrindar

- `proposed`: kräver SYSTEM/OWNER, två exakta tenant-sourceRefs, evidens,
  idempotency-key och reason code. Canonical-ID:n är alltid `null`.
- `approved`: kräver explicit OWNER/STAFF-review, entydigt canonical patient- och
  encounter-id samt oförändrad source-CAS.
- `active`: kräver separat `activationAllowed:true`, OWNER och
  `cliento.links.write`. En sourceRef kan inte ha två aktiva projections.
- `revoked`/`superseded`: kräver explicit OWNER/STAFF-review och ny CAS. De är
  terminala och lämnar historiken intakt, men projectionen försvinner.

Samma idempotency-key med exakt samma request replayar samma event. Samma nyckel
med annan request blockerar. Samtidiga mutationer serialiseras.

## Maskerat första proposed-pack

`CLIENTO-LINK-FIRST-PROPOSED-PACK-2026-07-18.masked.json` innehåller de tre första
deterministiskt sorterade posterna från det verifierade kandidatmanifestet om
1 887 poster. Underlaget är samma snapshot som reconcile-rapporten:

- bokningar: version 1, `updatedAt=2026-07-17T14:32:42.658Z`, 55 221 förekomster
- patienter: version 1, `updatedAt=2026-07-18T13:21:19.250Z`
- fail-closed reviewchecksumma:
  `cf7cd6415f7cfbfa77207cca58ae0c554d5a1065480b1e33c521f27fcecbadf3`

Packstorleken är 3. Alla booking- och proposalreferenser är maskerade. Patient-
och encounter-id är `null`. Source-, kärn-, not- och parchecksummor finns för
senare CAS-review, men inga råa bookingId:n eller identitetsfält finns i filen.

Before/after verifierade:

- booking- och patientsnapshot byte-identiska
- ledger events 0 → 0
- booking writes 0
- patientId writes 0
- encounterId writes 0
- activation writes 0
- source mutations 0

## Kommandon

Ett redan maskerat kandidatmanifest kan förhandsgranskas utan ledgerfil:

```bash
node scripts/prepare-cliento-link-proposed-pack.js \
  --manifest /explicit/read-only/path/cliento-link-candidates.masked.json \
  --limit 3
```

Scriptet skriver endast maskerad JSON till stdout och verifierar inputfilens
checksumma före/efter.

## Fortsatt stoppregel

Den här draften tillåter inte prod-write, ledgeraktivering, bookingmerge,
patient-/encounter-koppling, projection, migration eller kundreseåterstart.
Nästa fas kräver separat uttryckligt owner-GO för exakt pack, explicit persistent
store-path, runtime-wiring, behörighetskontrakt och full före/efterkontroll.
