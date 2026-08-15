# CCO Status - Handover

## Starta här i ny chatt (uppdaterad 2026-08-08)

- Repo: `~/Code/major-arcana` (Mac) / `/home/fazli/major-arcana-legacy` (VPS
  134.209.232.101). INTE iCloud-mappen.
- Kör `git pull` först — `main` ska vara vid commit `43121f9e` eller senare.
- Kör Sonnet 5 som standard. Opus bara för hårda arkitekturbeslut. Minnesfiler
  är per maskin, synkas INTE automatiskt — se `[[cco-model-val-sonnet-standard]]`.
- **Läs alltid ORDERS/-statusrader mot koden, aldrig som sanning.** Tre av tre
  ordrar märkta "GO väntar Fazli" visade sig 2026-08-06 vara redan byggda.
  Kör inventory-steget (`AGENTS.md:21-29`) innan något börjas.
- **Push aldrig direkt till `main`, inte ens docs.** `main` deployar till prod.
  Gren + PR alltid, och rebasa/skapa om grenen om den lever över flera timmar
  — se `[[cco-rebasea-langlivade-grenar-fore-push]]`.
- **Delad arbetskopia.** VPS:en delas med Cloud Code. Kolla
  `git branch --show-current` + `git status` omedelbart före varje commit,
  inte bara vid grenens skapande — se `[[cco-delad-arbetskopia-verifiera-branch-fore-commit]]`.
- **Merga aldrig en PR själv.** Stanna vid PR för granskning.
- **Encounter-link: AVFÖRD** efter Fazlis beslut. Merga ingenting där — se
  `docs/ops/encounter-link-findings-2026-08-06.md` (läs den, INTE
  `encounter-link-disambiguation-2026-08-06.md`, vars merge-hypotes är
  motbevisad och farlig).

---

## Status 2026-08-15 — CCO namngivning klar

CCO-arbetet kring patient-assets displaynamn och sessionsnumrering är
produktionsklart.

- **Review-kö för namngivning är tom**: `needs_review_for_naming` rapporterar 0
  assets efter genomförd backfill och manuella korrigeringar.
- **PR #1381–#1392 är mergade** och deployade. De täcker encounter-medveten
  sessionsnumrering, skydd för kurerade namn mot `--force`, alias-kollisions-
  skydd, foto-granskning under operation, reply-sanering, bottom-actions
  demo-fallbacks, notes XSS-sanering, messages pagination och mail-templates
  sanering.
- **Mergade grenar är städade** från repo:t.
- **UI-spotcheck** gjordes på 3 patientkort. En felaktighet hittades
  (Samuel Sälls, 7 foton med fel datum) och korrigerades till rätt
  `documentDate` 2025-02-18. Övriga kort matchade förväntat.
- **Inga skrivningar gjordes mot prod utan verifierad backup först**.

### Fas 4 — Granskningsyta och UI (verifierad 2026-08-15)

- **Gransknings-UI finns byggt och är monterat**:
  `src/routes/ccoNamingReview.js` exponerar
  `GET /api/v1/cco/naming-review/queue`,
  `GET /api/v1/cco/naming-review/patients/:patientId/assets` och
  `POST /api/v1/cco/naming-review/assets/:assetId/resolve`. Router monterad i
  `server.js:8879-8891`.
- **`needs_review_for_naming` kopplad till UI-synlighet**:
  `src/ops/ccoAssetNaming/patientCardSections.js:94-104` routar assets med
  `namingStatus === 'needs_review_for_naming'` till sektionen `needs_review`.
- **Feature-flaggor för foto-granskning inventerade**:
  `ENABLE_PHOTO_REVIEW_WRITE=false` per default i `src/config.js:1320`. På
  prod-hosts (`arcana.hairtpclinic.com` m.fl.) krävs även
  `ENABLE_PHOTO_REVIEW_CANARY_ON_PROD=true` för att skrivning ska aktiveras.
  Det är en medveten säkerhetsgrind, inte en ofullständighet.

Eftersom review-kön är tom visas inga granskningsposter just nu, men hela
ytan finns på plats.

### Fas 5 — Kvalitet och dokumentation (åtgärdad 2026-08-15)

- **Tester tillagda:**
  - `tests/ops/ccoAssetNaming/assetDisplayLabel.test.js` — 9 tester.
  - `tests/ops/ccoAssetNaming/photoReviewNaming.test.js` — 19 tester.
  - `tests/ops/ccoAssetNaming/patientCardSections.test.js` fanns redan med 6
    tester.
- **`CCO-STATUS.md` uppdaterad** för att spegla aktuellt läge.
- **Duplicerade nycklar städade** i `patchAssetNamingMetadata`
  (`src/ops/ccoPatientAssetStore.js:1370-1409`): `imageType`,
  `sessionNumber`, `encounterType` och `approvedCategory` fanns listade två
  gånger vardera; dubletterna är borttagna.
- **Dokumentation av de två encounter-systemen** finns i
  `docs/handover/CCO-NAMNGIVNING-OBEROENDE-GENOMGANG-2026-08-14.md`
  (skillnaden mellan `encounterMapper.js`/`buildEncounterRegistry` och
  `encounterNameResolver.js`/`countTreatmentSession()`).

CCO namngivning betraktas därmed som färdigställd. Eventuella nya
namngivningsproblem ska hanteras som vanliga inkommande ärenden, inte som
pågående CCO-projekt.

---

## Öppna uppgifter — ingen tilldelad, ingen tidsplan

Allt nedan är genuint olöst. Inget är brådskande, men inget ska heller antas
vara någon annans problem bara för att det inte är i den här listan.

### 1. Backfill sessionNumber — KLAR 2026-08-15

**Åtgärdad och verifierad i prod.** Båda rotorsakerna (alias-kollision och
intra-patient datumfallback) är åtgärdade, backfill har körts skarpt i
kontrollerade steg, och review-kön är tom. Se statusavsnittet ovan för
sammanfattning. Historiken nedan bevaras som referens.

Upptäckt via backfill-dry-run mot **riktig prod-data** 2026-08-07 (Render
SSH, `srv-d8b3i3tckfvc73clgeng`). Fyra foton, en patient, en dag, kategori
`photo_during` — fick "FUE Operation 23/25/26/30".

**Riktningskorrigering 2026-08-13:** `sessionNumber` beräknas INTE av
`encounterMapper.js`s `buildEncounterRegistry` (den används bara av
encounter-länk-reparationsverktyget, `ccoEncounterLinkRepair.js` — ingen
live-route anropar den för patientkortet). Den faktiska mekanismen är
`countTreatmentSession()` (`src/ops/ccoAssetNaming/encounterNameResolver.js`),
anropad från `scripts/backfill-asset-display-names.js`s `groupByPatientId()`
— exakt det skript buggen upptäcktes i.

Fyra läs-endast diagnostikskript byggda och körda mot prod (PR #1364–#1371,
`report-encounter-registry-date-fallback.js`,
`report-encounter-session-numbers.js`,
`report-backfill-sibling-collision.js`) bekräftade **två separata, oberoende
rotorsaker**, båda i `groupByPatientId()`:

1. **Kors-patient alias-kollision — 519 grupper.** `asset.patientId` är ofta
   ett alias (t.ex. från äldre Drive-importer), inte en kanonisk
   patient-master-ID (91 222 av 126 642 assets i hela storen, ORD-85-
   identitetsupplösning krävs — se `resolveCanonicalPatientsForAssets`,
   `ccoPatientAssetIdentity.js`). Om flera OLIKA riktiga patienters dokument
   delar samma rå alias-`patientId`, blandas deras dokument ihop i EN
   syskon-grupp och `sessionNumber` räknas över flera patienters
   behandlingar som om det vore en enda persons. Störst magnitud.
2. **Intra-patient datumfallback-fragmentering.** Exakt kod-kommentarens
   ursprungliga beskrivning ("samma patient, samma dag"). När `documentDate`
   saknas faller `countTreatmentSession()` tillbaka på `importedAt`
   (import-tidpunkt, inte behandlingsdatum) för sorteringen. Verifierad mot
   prod: patienter med `fallbackShare: 1.0` (100 % av dokumenten saknar
   `documentDate`) och `sessionNumber` upp till 16. Mindre skala än
   kollisionen men reell — bekräftades först efter att en tidigare,
   sessionsnummer-sorterad topplista (utan oberoende fallback-rankning)
   dolde den; självrättat i samma utredning.

**Redan skyddat** (`#1327`, mergad): `--commit` i
`scripts/backfill-asset-display-names.js` skriver aldrig
`namingStatus: needs_review_for_naming` längre — se `stats.skippedNeedsReview`
och `needsReviewSamples` i rapporten. Inget destruktivt kan hända medan
en eventuell fix väntar.

**Utfört:** alias-upplösningen infördes i beräkningen, fallback-datering
hanterades via manuella korrigeringar och säker `--commit`, och
`countTreatmentSession()` räknar nu korrekt. `--commit` mot riktig
patientdata körde i kontrollerade batchar med backup och verifiering.
Åtgärderna ovan är slutförda.

**Efterverifiering 2026-08-15:**
- `report-naming-review-queue.js`: `needs_review_for_naming` = **0**.
- `report-backfill-sibling-collision.js`: **591** råa patientId-grupper
  innehåller fortfarande alias-kollisioner (flera kanoniska patienter delar
  samma råa `patientId`). Största gruppen: `cliento_117a24b7b1c8d8af4c985bf1`
  med 600 assets fördelade på 26 kanoniska patienter.
- Riktad spot-check bekräftade att backfill-skriptet **inte** grupperar på
  råt patientId. I den största gruppen matchade endast **3 av 600**
  assets det buggiga rå-grupperade sessionsnumret — resten använder
  kanonisk upplösning eller annan korrekt beräkning.
- Slutsats: alias-kollisionerna är en kvarstående rådata-egenskap, men de
  påverkar inte längre displaynamn eller sessionsnummer.

### 2. ORD-99 — varför är `bodyText` bara 159/255 tecken för `info@`?

Roten till den avkapade texten är hittad och fixad på klientsidan (`#1319`,
`#1322`, `#1323` — se `docs/ops/fynd-bodypreview-avkapning-2026-08-06.md`,
sektion "SLUTGILTIGT 2026-08-07").

**Fortsatt utredning 2026-08-15:** texten har aldrig varit längre. Den är
kort redan i källan, inte trunkerad efteråt.

- `info@hairtpclinic.com` har 467 meddelanden i truth-sharden. 369
  sidofiler för brödtext finns, men **alla är tomma (`{}`)** — ingen
  lagrad `bodyText` eller `bodyHtml` alls.
- De äldsta `pre-body-migration.bak`-kopiorna (17 MB, 2026-07-29) visar
  samma sak: inline `bodyText`/`bodyHtml` är tomma för de meddelanden som
  fanns då. Kropparna saknades redan innan ORD-89-migreringen flyttade ut
  dem till sidofiler.
- `mailIngestionStore` (`/var/data/cco-mail-ingestion.json`) innehåller
  **noll** `info@hairtpclinic.com`-poster. Brevlådan har alltså inte
  passerat CCO:s mail-ingestionspipeline, som annars kan bära rikare kropp.
- Jämförelse med `contact@hairtpclinic.com` (10 864 meddelanden, där
  ~96 % har både `bodyText` och `bodyHtml`) och `kons@hairtpclinic.com`
  (nästan alla har kroppar) visar att mekanismen fungerar generellt.
  Problemet är specifikt för `info@hairtpclinic.com`.
- Samma mönster gäller ytterligare tre brevlådor:
  `info@fazli.se` (658 meddelanden), `halso@hairtpclinic.com` (137) och
  `marknad@hairtpclinic.com` (262). Även där är sidofilerna tomma.
  Notera att `info@fazli.se` finns i `mailIngestionStore` (644 poster) med
  rik kropp i rådatan, men truth-sharden är ändå tom — så källan till
  truth-sharden för de här brevlådorna är inte ingestion utan något annat
  (sannolikt direkt Graph-sync) som inte hämtade kroppen.

**Rotorsak bekräftad 2026-08-15:** Microsoft Graph returnerar idag full
`body` för `info@hairtpclinic.com`, `halso@hairtpclinic.com` och
`marknad@hairtpclinic.com` (kontrollerat live mot Graph API). Problemet
var inte en behörighetsgräns, utan att den ursprungliga synkningen för
dessa brevlådor uppenbarligen inte begärde eller sparade kroppen —
inline `bodyText`/`bodyHtml` har varit tomma ända sedan importen.
`info@fazli.se` ger fortfarande 404 i Graph (inte en giltig användare i
tenanten), så den brevlådan kan inte fyllas på samma sätt.

**Åter-backfill körd 2026-08-15:** Ett nytt backfill-pass för
`info@hairtpclinic.com` (`/tmp/backfill-mailbox-bodies.js` via Render SSH)
hämtade kropparna och uppdaterade meddelandena i truth-sharden. Ett
stickprov visar nu inline `bodyHtml` (~16 kB) och `bodyText` (~1,4 kB)
i sharden — kropparna finns där.

**Body-migrering körd 2026-08-15:** `migrateMailboxBodies()` körde
framgångsrikt för `info@hairtpclinic.com` på prod (via
`/tmp/body-migration-info.js` resp. `-apply.js` på Render SSH).

- Torrkörning (`apply: false`): `written=420`,
  `expectedDecodedChars=754752`, `verifiedDecodedChars=754752` —
  sidofilerna skrevs och verifierades.
- Skarp körning (`apply: true`): sharden krympte från 1 721 707 byte
  till 929 152 byte, `stoppedBecause` är tom, och sharden innehåller
  nu **0 meddelanden med inline `bodyText`/`bodyHtml`**.
- Efter migreringen har `info@hairtpclinic.com` 420 sidofiler med
  brödtext (av 481 meddelanden). 57 av dessa bär verkligt innehåll
  (`avgText=1109`, `avgHtml=12132`), resterande är meddelanden som
  aldrig hade någon rik kropp.

ORD-99 betraktas som åtgärdad för `info@hairtpclinic.com`.

### 3. Backfill — full dry-run mot prod — KLAR 2026-08-15

`#1324`/`#1327` är mergade. Full `--dry-run` har körts mot prod-data, och
sedan `--commit` i kontrollerade batchar med backup och verifiering.
`needs_review_for_naming` är **0** efter genomförd backfill.
CCO-namngivningen betraktas som färdigställd. Historiken bevaras som
referens.

### 4. ORD-93 mätgrind steg 2 — KLAR 2026-08-08, löst på kodnivå

`src/ops/ccoCidImageRewrite.js` har aldrig en tyst passage: ett olöst
`cid:` ersätts alltid, antingen med en riktig URL eller en synlig
platshållare (`data-cid-missing="true"`, trasig-bild-SVG, `title="Bilden
kunde inte visas — bilagemetadata saknas i truth-lagret"`). 10/10
enhetstester (`tests/ops/ccoCidImageRewrite.test.js`) bekräftar
beteendet, inklusive den specifika "inget URL hittat"-vägen. Mätgrindens
syfte (bekräfta att en trasig bild blir synlig, inte tyst) är uppfyllt
på kodnivå. Om en visuell klick-igenom-bekräftelse ändå önskas: sök
renderad DOM/HTML efter `data-cid-missing="true"` — attributet finns
bara på genuint olösta cid-bilder.

### 5. `ARCANA_PUBLIC_WEB_BOOKING_ENABLED` — KLAR 2026-08-08

Manuellt verifierat i Render Dashboard → service `arcana` → Environment:
värdet är redan **explicit `"false"`**, inte tomt som tidigare antaget.
`render.yaml` uppdaterad i samma veva (`#1347`) så att en framtida
Blueprint-synk inte kan skriva över det — den gamla ORD-74-kommentaren
som instruerade att TA BORT variabeln (så kodens `true`-default skulle
gälla) är borttagen, den bröt mot `.cursor/rules/website-booking-policy.mdc`.

### 6. CCO:s egen `clientoBookingStore` — INTE dubbletter, TVÅ TENANT-ID FÖR SAMMA KLINIK

**Ursprunglig felaktig diagnos (2026-08-07):** 55 221 bokningsposter, bara
37 494 "unika" `bookingId` — tolkat som 17 727 dubbletter.

**Rättad 2026-08-08, verifierat via `dry-run` mot prod:** det var mitt
eget metodfel i gårdagens engångsdiagnostik — jag grupperade på
`bookingId` **utan tenantId**. `#1342`s globala dedup (scopad korrekt på
`tenantId::bookingId` från start) körd som `--dry-run` mot prod fann
**noll** riktiga dubbletter. Verklig orsak: `clientoBookingStore`
innehåller data under **två olika tenant-ID:n för samma klinik**:
`hair-tp-clinic` (27 811 poster, systemets `ARCANA_BOOTSTRAP_TENANT_ID`
i `src/config.js:26`) och `hair_tp` (27 410 poster, används i
kalender-UI:t: `global.__ccoCalTenantId || 'hair_tp'`). Samma boknings-ID
återanvänds oberoende i de två namnrymderna, vilket såg ut som
dubbletter när de räknades ihop utan tenant-scoping.

**Detta är ett KÄNT, systemomfattande mönster** — `ccoPatientAssetIdentity.js:82`
och `ccoDriveImportReviewReadService.js:91` kollar redan flera
tenant-ID-varianter (`'hair-tp-clinic', 'hair_tp', 'hairtpclinic'`)
defensivt vid läsning. `clientoBookingStore` gör INTE det än — varje
fråga mot en specifik tenant (t.ex. kalender-UI:t som frågar `hair_tp`)
ser i praktiken bara hälften av bokningarna.

**RÄTTAT IGEN 2026-08-08 — mitt föreslagna "nästa steg" ovan var FEL och
har dragits tillbaka (PR stängd utan merge).** Jag byggde en generell
läs-tolerans (samma mönster som `ccoPatientAssetIdentity.js`) som slår
ihop `hair_tp`/`hair-tp-clinic` transparent vid varje fråga. Det bröt
sönder befintlig, redan existerande säkerhetsinfrastruktur jag inte
kände till:

- **`src/ops/clientoCrossTenantCoverage.js` + `scripts/report-cliento-cross-tenant-coverage.js`**
  och **`src/ops/clientoLinkCandidateManifest.js` + `scripts/report-cliento-link-candidates.js`**
  (daterade **31 juli**, alltså byggda långt före dagens session) — ett
  redan färdigt, noggrant konstruerat system som avsiktligt jämför
  `hair_tp` och `hair-tp-clinic` som **två strikt separata populationer**
  via `store.listAllBookings({ tenantId: leftTenant })` respektive
  `rightTenant`. Checksummor, maskerad rapportering, `review_required`-
  och `blocked_data_invariant`-grindar, noll skrivningar — en medveten,
  säker rekonciliationsprocess.
- Min läs-tolerans gjorde att `listAllBookings({tenantId:'hair_tp'})`
  plötsligt returnerade BÅDA tenants poster, vilket fick de här
  skriptens vänster/höger-jämförelse att se dubbelt (4 poster i stället
  för 2 i ett CI-test) — `Unit tests + coverage gate` och `smoke`
  failade i PR:en.
- **Lärdom:** sök alltid efter befintlig hantering av ett specifikt
  problem (inte bara det generella mönstret) innan en fix byggs. Det
  fanns redan rätt verktyg — jag borde ha hittat det innan jag byggde
  ett eget.

**Utfört 2026-08-15:**
`scripts/report-cliento-link-candidates.js` körd läs-endast mot prod.
Resultat:

| Mått | Värde |
|---|---|
| Total förekomster | 53 316 |
| `hair_tp` (left) | 25 505 |
| `hair-tp-clinic` (right) | 27 811 |
| Unika `bookingId` (union) | 37 494 |
| Unlinked review | 11 196 |
| **Säkra länkningskandidater** | **0** |
| Gate-status | `review_candidates_only` |

**Uteslutningsorsaker:**

| Orsak | Antal |
|---|---|
| Finns bara i en tenant (`oneSided`) | 21 672 |
| Anteckningsfält matchar inte (`noteSegmentMismatch`) | 14 820 |
| I unlinked review | 829 |
| Kärn-checksumma matchar inte (`coreChecksumMismatch`) | 173 |

**Slutsats:** de två tenant-namnrymderna har divergerat för mycket för
att någon automatisk länkning ska vara säker. **Inget vidare åtgärdsteg**
krävs — de bör fortsättningsvis behandlas som strikt separata
populationer, vilket befintlig kod och säkerhetsinfrastruktur redan
gör. Punkt 6 betraktas därmed som utredd och avslutad.

**`#1342`/`#1343` (global bookingId-dedup + saneringsskript) förblir
korrekta och oberörda** — de skyddar mot en genuint annan, verklig risk
(samma bookingId inom EN tenant med varierande identitetsfält mellan
importer), och rör aldrig cross-tenant-jämförelsen. Inte påverkade av
reverten.

### 7. 10 991 bokningar finns bara i CCO — hypotesen om radering MOTBEVISAD, exportfilen ofullständig

Datumfördelning körd 2026-08-08 (läs-endast, Render SSH):

| År   |     Antal |
| ---- | --------: |
| 2021 |       182 |
| 2022 |       388 |
| 2023 |       312 |
| 2024 |     2 475 |
| 2025 | **4 577** |
| 2026 |     3 038 |
| 2027 |        19 |

Om de vore äldre bokningar från före exportens startdatum (augusti 2021)
hade de klustrat i 2021 eller tidigare. I stället klustrar de i
**2024–2026**, mitt i exportens täckta period, med några ända i 2027
(framtida bokningar). **Hypotesen "äldre än exporten" är motbevisad.**

**"CCO-egna bokningar"-hypotesen MOTBEVISAD 2026-08-13.** Körde
`scripts/report-cco-only-bookings-source-distribution.js` (#1362) mot
prod-storen och den faktiska senaste Cliento-exporten (via Render SSH,
läs-endast). Facit matchar tidigare mätning byte-exakt (28 656
totalrader/26 887 unika i exporten, 10 991 bara i CCO, samma
årsfördelning som ovan) — bekräftar rätt delmängd.

Källfördelningen är entydig: **10 990 av 10 991 (99,99 %) har
`source: "cliento_csv"`** — exakt samma ursprung som resten av
bokningarna, importerade via samma pipeline. Bara 1 post har
`cliento_uat` (ett testfrö, försumbart). **De är alltså INTE CCO-egna
bokningar från ett annat system.**

**Hypotesen "raderade i Cliento efter import" MOTBEVISAD 2026-08-15.**
Den senaste Cliento-exporten (`Dataexport 1 augusti 2021 - 31 augusti
2026.csv`) och den äldre exporten (`cliento-bookings-2019-2026.csv`)
lokaliserades på användarens Mac/iCloud och överfördes till Render.
Jämförelse mot CCO-storen:

| Mängd | Antal |
|---|---|
| Senaste export, unika `bookingId` | 26 887 |
| Äldre export, unika `bookingId` | 25 454 |
| CCO store (union båda tenants) | 37 494 |
| CCO-only (inte i senaste exporten) | **10 991** |
| CCO-only, också i äldre exporten | 151 |
| CCO-only, i **ingen** av de två exporterarna | **10 840** |

**Stickprovskontroll direkt i live Cliento:** 10 slumpmässiga ID ur den
faktiska CCO-only-mängden söktes upp manuellt i Cliento-gränssnittet.
**Alla 10 av 10 hittades i Cliento**, med datum/tid som matchade CCO.
Detta motbevisar att bokningarna skulle ha tagits bort i Cliento.

**Slutsats:** skillnaden ligger i **exportfilen**, inte i Clientos
underliggande data. Den/de Cliento-exporter som använts för jämförelse
är antingen ofullständiga eller skapade med ett aktivt filter (t.ex.
status, resurs, tjänsttyp, bokningskälla) som exkluderar drygt 10 000
bokningar. CCO-importerna har uppenbarligen använt en mer komplett
källa (troligen filen `bookings.csv` med 28 974 rader som noterades i
import-historiken men som inte återfinns i arkiven). Detta påverkar
ingen aktiv funktion — CCO har rätt data — men förklarar varför
rekoncilieringen mot exportfiler aldrig blir 1:1. Punkt 7 betraktas
som utredd och avslutad.

### 8. Patientanteckningarnas omfattning — KLAR 2026-08-08

Manuellt verifierat i Cliento → Rapporter → Exportera bokningar →
Förhandsgranska, med `Attribut` som kolumn (augusti 2026, 100 bokningar
stickprov): **fältet är tomt, `{}`, i varje rad.** Det förklarar
`internalNotes: 0` fullt ut — det fanns inget att mappa, ingen
importer-bugg. Inget att migrera därifrån.

**Bonus-fynd, relevant för hela Cliento-migreringen (ORD-100):**
`Bokningsanteckning` är en valbar kolumn i samma export — per-bokning-
anteckningar går alltså att exportera själv. Det är bara kundkortens
fria anteckningar som INTE finns i självbetjänings-exporten (kräver
Cliento support). Kund-exporten (`Kundexport_nya`) ger bara namn,
telefon, e-post, skapad-datum — ingen anteckningstext.

---

## Render SSH — nu uppsatt och fungerande

`~/.ssh/id_render` finns på **Mac:en** (inte VPS:en — nyckel skapad där av
misstag 2026-08-07 och borttagen igen; Render-SSH-nycklar hör aldrig hemma
på CI-runnern). Publik nyckel registrerad i Render → Account Settings → SSH
Public Keys, namngiven "CCO".

```bash
ssh -i ~/.ssh/id_render srv-d8b3i3tckfvc73clgeng@ssh.frankfurt.render.com
cd ~/project/src   # appens arbetskatalog, dit du hamnar direkt
```

Detta öppnar upp för att köra vilket filbaserat skript som helst
(`scripts/backfill-*`, m.fl.) direkt mot riktig prod-data utan att flytta
den. Skriv-skript ska ändå alltid köras `--dry-run` först.

**2026-08-07, andra gången:** anslutningen slutade fungera under dagen.
Orsak: Render hade en **föräldralös** nyckelpost kvar (fingeravtryck
`SHA256:hr4jFE4P159...`) från den ursprungliga VPS-misstagsnyckeln som
redan raderats lokalt — den kan aldrig fungera igen. Den faktiska
`id_render`-nyckeln (`SHA256:4kQpbfBY...`) hade aldrig blivit tillagd i
Render. Löst genom att lägga till den _utan_ att röra den gamla posten.
Om SSH nekar med "Permission denied (publickey)" trots att lokal fil ser
rätt ut: kör `ssh-keygen -lf ~/.ssh/id_render.pub` och jämför fingeravtryck
mot vad som faktiskt är sparat i Render Dashboard — gissa aldrig.

**Kommandotips:** klistra aldrig flerradiga `cat > fil << 'EOF' ... EOF`-
block i en interaktiv SSH-session — paste-buffring korrumperar det ofta.
Använd i stället `node -e "..."` som EN sammanhängande rad, och kör
`set +H` först om raden innehåller `!` (bash tolkar det annars som
historik-expansion, ger `event not found`).

**`scp` fungerar INTE mot Render** (2026-08-08, bekräftat) — anslutningen
stängs direkt av Renders SSH-proxy. Använd i stället icke-interaktiv
körning med SSH:ns inbyggda stdin/stdout-vidarebefordran, t.ex.
`cat lokal-fil.txt | ssh -i ~/.ssh/id_render srv-...@ssh.frankfurt.render.com "cd ~/project/src && node -e '...'"`
— fungerar för att både skicka och hämta data utan filöverföring. Kör
alltid `ssh -i ~/.ssh/id_render srv-...@ssh.frankfurt.render.com "pwd"`
i ett **nytt** terminalfönster (inte inuti en redan öppen interaktiv
session — nästlad SSH letar efter nyckeln på fel sökväg och stör allt)
för att verifiera att icke-interaktiv körning funkar innan något större.

---

## Stängt och verifierat (kort — detaljer i respektive fil/PR)

- **ORD-86** — helt stängd. Bas-URL bekräftad utläst från prod
  (`PUBLIC_BASE_URL`, `ARCANA_PUBLIC_BASE_URL`, `resolved.publicBaseUrl`
  pekar alla på `.com`). Två separata variabelnamn finns, olika företräde —
  se `docs/handover/ORDERS/ORD-86-legacy-se-fallbacks.md`.
- **ORD-87** — levererad i sin helhet, verifierad mot koden.
- **ORD-93 uppgift 1** — levererad. Uppgift 2 besvarad: blandat utfall, 20 %
  återställbart via cid-normalisering, 80 % genuint borta. Mätgrind steg 3
  (deepScan över nio brevlådor) kört och dokumenterat — se
  `docs/handover/ORDERS/ORD-93-cid-bilder-utan-bilagemetadata.md`.
- **ORD-99** — rotorsak bevisad, klientfix mergad (`#1319`, `#1322`, `#1323`).
  Se öppna punkt 2 ovan för vad som återstår.
- **`#1324`/`#1327`** — backfill-skript mergat och skyddat mot att skriva
  lågkonfidenta gissningar.
- **CCO 9-stegs kundresa** — klar. Steg 2 och 9 kartlagda. Steg 2 besvarat
  av Fazli 2026-08-13: alla kunder hanteras via Cliento, inte Meridiq.
  Bokningsbekräftelsen går från Cliento tills CCO:s egen kalender är
  färdig (snart) — sedan tar den över. Bekräftelsemejlet skickas idag
  från `contact@hairtpclinic.com` via Microsoft.
- **Encounter-link** — avförd efter beslut, se ovan.
- **Valideringsnivån är 0 fel.** `AGENTS.md:342`s "61 pre-existing failures"
  är daterad 19 juli, föråldrad. `test:unit` gav 6547 pass / 0 fail senast
  körd (2026-08-07). Gå aldrig in i en validering med "61 är normalt" som
  utgångspunkt.
- **Produktionskrascherna** (77 526 assets, 259 MB omskriven JSON per
  skrivning) — fixade i två steg: kompakt JSON (`#1302`), sharding + debounce
  (`#1304`, 64 shards).
- **Sju döda grenpekare** (från gårdagens PR-arbete, redan innehåll i `main`
  via squash-merge) städade bort 2026-08-07 — jämför aldrig en gammal gren
  mot `main` med `git diff --stat` som sanning; kolla om innehållet redan
  finns istället.
- **ORD-100** (`#1331`, `#1332`, `#1337`, `#1336`→`#1338`→`#1339`) —
  kalender/bokningsmodulens status kartlagd och delvis åtgärdad:
  backend byggt/testat, personal-UI avsiktligt read-only, två döda
  endpoint-anrop och en föräldralös kodväg borttagna (`#1337`, 55/55
  tester gröna). Fas 0 (datamigreringens omfattning) mättes om **tre**
  gånger innan rätt metod hittades — de två första felaktiga försöken
  (`wc -l`-metodfel, sedan en ofullständig totalsummejämförelse) står
  dokumenterade som historik i `ORD-100-cco-kalender-cliento-migrering.md`,
  inte gömda. **Slutgiltigt facit: 384 bokningar saknas genuint i CCO**,
  inte 66 561. Se öppna punkt 7 ovan för vad som återstår (punkt 4, 5, 8
  stängda 2026-08-08).
- **ORD-101** — tenant-stavnings-dedupen (`hair_tp`/`hair-tp-clinic`) är
  körd skarpt, verifierad och stängd (2026-08-12/13): 1 905 dubbletter
  borttagna, kanonisk tenant `hair-tp-clinic` oförändrad i antal, noll
  bokningsförlust bekräftat individuellt. Boknings→patient-länkningen
  (`canonicalPatientId`) är en SEPARAT, medvetet blockerad operation —
  kräver att det klargörs om Cliento-källan (CSV/API) bär det råa
  numeriska kund-ID:t innan den kan byggas; se
  `docs/handover/ORDERS/ORD-101-cliento-cross-tenant-reconcile.md`.

---

## Snabblänkar (verifierade via DNS + live-hämtning)

- **Produktion:** https://arcana.hairtpclinic.com/admin — Render, tjänst
  `arcana` (`srv-d8b3i3tckfvc73clgeng`), Frankfurt.
- Repo: https://github.com/Fazliilzaf/major-arcana
- Marknadssajt (separat yta): https://hairtpclinic.com — Vercel.
- VPS `134.209.232.101` — CI-runner. Serverar INTE arcana. Inga Render-SSH-
  nycklar där.
- **`fazliilzaf.github.io/major-arcana/` är UTGÅNGEN** — serverar ett helt
  annat projekt. Följ den aldrig.

---

## ARKIV — tidigare session (CSS-arbete, `major-arcana-preview`)

> UTGÅNGEN KONTEXT. Rör en äldre session och GitHub Pages-previewn, INTE
> CCO-arbetet eller produktionen. Behållen som historik.

CSS-fix för historik-kort pushad till `main` (`693af1c`): bred
`!important`-regel i `styles.css` ersatt med riktade regler för
`.thread-subject-primary` / `.thread-story`. Två öppna problem i previewn
(ej prod) noterades men åtgärdades aldrig: tomma kö-kort i vänsterkolumnen,
tecken-för-tecken-radbrytning i fokusytans mailbody. Låg prioritet, ingen
vet om det fortfarande gäller.
