# ORD-101 — Cliento cross-tenant-reconcile: redan byggt, pausat, väntar på GO

|                       |                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bas-commit**        | `main` (2026-08-08)                                                                                                                                                                                                                            |
| **Ägare**             | Cowork (kartläggning, denna order)                                                                                                                                                                                                             |
| **GO**                | väntar Fazli                                                                                                                                                                                                                                   |
| **Allvarlighetsgrad** | **Ingen ny risk, ingen kod att skriva.** Det här är en existerande, redan säkerhetsgranskad process som stannat vid ett medvetet pausläge i tre veckor. Ordern finns för att göra pausen synlig och begriplig, inte för att flagga något akut. |
| **Föregångare**       | ORD-100 punkt 6 (CCO-STATUS.md) — jag byggde av misstag en egen, för generell fix för samma problem 2026-08-08 (PR #1345, stängd utan merge) innan jag hittade det här redan färdiga systemet.                                                 |

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

1. **Kör om steg 1–4 mot dagens prod-snapshot** (läs-endast, `zeroWrites`)
   för att bekräfta att 1 887-siffran fortfarande stämmer — populationen
   verkar oförändrad (55 221 då och nu) så resultatet bör vara identiskt,
   men outdaterad bekräftelse är inte bekräftelse.
2. **Fazli läser `CLIENTO-UNLINKED-RECONCILE-P0-2026-07-18.md` och
   `CLIENTO-LINK-CANDIDATE-MANIFEST-P0-READONLY.md`** själv (eller ber
   om en muntlig genomgång) — det är den "separata owner-granskning"
   dokumentationen efterfrågar, inte något en agent kan göra åt någon.
3. **Om godkänt:** kör `prepare-cliento-link-proposed-pack.js --limit 3`
   för att se det begränsade första paketet konkret, innan ett beslut
   tas om att bygga `active`-aktiveringssteget (som inte finns kodat än).

Ingen tidspress. Processen har redan väntat i tre veckor utan att något
gått sönder av det.
