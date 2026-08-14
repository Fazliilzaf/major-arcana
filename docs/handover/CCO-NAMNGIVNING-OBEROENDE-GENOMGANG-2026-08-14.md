# CCO-namngivning — oberoende genomgång och slutförandeplan

**Datum:** 2026-08-14
**Utfört av:** fristående granskning, ingen tidigare plan eller agents slutsats
lagd till grund. All kod, alla tester och all git-historik nedan är själv läst
och verifierad i det här passet — inte återgiven från tidigare sessionsminne.
**Omfattning:** ingen skrivning mot prod-patientdata. Ren läsning av kod,
tester, git-historik. Prod-siffror som citeras är relayat av en annan agent
(Coworker, körande i Render Web Shell) — jag saknar egen prod-åtkomst, se
avsnittet "Vad jag INTE kunnat verifiera själv".

---

## Metod och avgränsning

Jag har läst, i sin helhet, källkoden i:

- `src/ops/ccoAssetNaming/` (alla 9 filer: `index.js`, `encounterNameResolver.js`,
  `imageDisplayNameBuilder.js`, `assetDisplayNameBuilder.js`, `documentClassifier.js`,
  `patientCardSections.js`, `assetDisplayLabel.js`, `photoReviewNaming.js`,
  `encounterMapper.js`)
- `scripts/backfill-asset-display-names.js`, `scripts/report-naming-review-queue.js`
- Relevanta delar av `src/ops/ccoPatientAssetStore.js` (persistenslager, sharding,
  `patchAssetNamingMetadata`s fält-allowlist)
- Konsumenter i `server.js`, `src/ops/ccoUnifiedTimelineBuilder.js`,
  `src/routes/ccoPhotoReviewWrite.js`, `src/config.js` (feature-flaggor)
- All testtäckning i `tests/ops/ccoAssetNaming*.test.js`,
  `tests/scripts/backfillAssetDisplayNamesArgs.test.js`,
  `tests/scripts/reportNamingReviewQueue.test.js`
- Git-historiken (`git log`) för hela namngivningsspåret, från `#763` (2026,
  encounter-länk-granskning) fram till `#1380` (senaste mergade fix)

Jag har **inte** litat på `CCO-STATUS.md` som sanning — den är, verifierat,
**inaktuell**: dess avsnitt om sessionNumber-buggen är skrivet innan #1374–#1380
mergades och säger fortfarande "ingen fix skriven eller körd", vilket inte
längre stämmer. Det är i sig ett fynd, se punkt 6 nedan.

---

## Nuläge: vad fungerar (verifierat i kod + tester)

1. **Kärnberäkningen är korrekt och testad.** `countTreatmentSession()`
   (`encounterNameResolver.js`) grupperar syskon-assets på verkligt tillfälle
   (`encounterId` när det finns, annars riktigt `documentDate` som proxy, med
   skydd mot att gissa vid tvetydiga dagar) innan den räknar sessionsnummer.
   18 tester i `ccoAssetNamingEncounterNameResolver.test.js` täcker huvudfallet
   och tre Bugbot-fångade kantfall (delvis länkning, review-flagga vid
   odaterad grupp, en enstaka odaterad syskon-asset som inte får dra hela
   gruppens sortering fel).
2. **Skrivskyddet håller.** `isAutoSafeNamingPatch()` +
   `namingStatus: needs_review_for_naming` (`ccoAssetNaming/index.js`)
   förhindrar att en osäker gissning (låg `namingConfidence` ELLER ett
   sessionNumber byggt på `importedAt`-fallback) någonsin skrivs som fakta vid
   `--commit`. Detta är konsekvent testat i tre olika lager (resolver, index,
   backfill-skript).
3. **Kurerade namn är nu skyddade mot `--force`.** `needsBackfill()`
   respekterar `manual`, `manual_resolved` och `approved` oavsett `--force`
   (#1380, egen fix denna session, testad).
4. **Alias-kollisionsskyddet är robust.** `resolveAliasKeyFn` +
   `assertPatientsResolved()` kastar högljutt vid tom patient-lista i stället
   för att tyst degradera till den kollisionsbenägna rå-grupperingen — fail-
   closed-designen är genomgående i hela skriptet (`--patients-store`/`--tenant`
   krävs explicit, ingen tyst default).
5. **`photoReviewNaming.js` (manuell fotogranskning) återanvänder samma
   resolver.** `buildPhotoReviewNamingPatch()` anropar `resolveEncounterNaming()`
   — samma kod som precis fixats. Ingen separat, parallell
   sessionsnummer-implementation att hålla i synk.
6. **Sharding i persistenslagret är korrekt förstådd och redan hanterad.**
   `ccoPatientAssetStore.js` migrerar en gång till `<fil>.shards/shard-NN.json`
   - `meta.json`; efter migrering läses monolitfilen aldrig igen. Detta var
     avgörande för att förstå en tidigare (nu upplöst) förvirring om en
     `--commit`-återställning under sessionen.

## Nuläge: vad är trasigt, ofullständigt eller oklart

**A. Det finns ingen fungerande granskningsväg för `needs_review_for_naming`
utanför foton — och även fotovägen är sannolikt avstängd i prod.**

Detta är det allvarligaste strukturella fyndet, och det är helt oberoende
verifierat i kod, inte ett antagande:

- `resolvePatientCardSection()` (`patientCardSections.js`, rad 94–96) sätter
  bara en **inert signal-sträng** (`'naming_needs_review'`) när
  `namingStatus === 'needs_review_for_naming'` — det påverkar **inte** vilken
  sektion/flik asseten hamnar i. Assetet visas alltså precis som vanligt, utan
  någon markering en människa skulle se.
- `uiStatus` kan bli `'needs_review_for_naming'` (via `mapUiStatus()`) och
  **skrivs faktiskt till storen** (fältet finns i `patchAssetNamingMetadata`s
  allowlist) — men det värdet konsumeras aldrig av något jag kan hitta i
  `server.js` eller UI-lagret. De enda `uiStatus`-värden `server.js` faktiskt
  grenar på (rad ~6446–6458) är `'needs_classification'` och
  `'imported_metadata_only'` — inte det värde namngivnings-pipelinen
  producerar.
- `sessionNumberIsUnreliable` (den transparensflagga jag själv skrev i #1374,
  avsedd att skilja "lågkonfident namn" från "fallback-daterat
  sessionNumber" i rapportering) finns **inte** i `patchAssetNamingMetadata`s
  fält-allowlist. Den beräknas och returneras av `buildAssetNamingMetadata()`
  men försvinner tyst vid skrivning — ingen per-asset-post av _varför_ något
  hölls tillbaka överlever till disk. Varje granskningsverktyg måste
  räkna om det från grunden (vilket `report-naming-review-queue.js`
  råkar göra rätt, men det är skört — nästa skript som läser lagrade fält
  direkt skulle inte se orsaken).
- Det **finns** en riktig manuell granskningsväg för foton
  (`photoReviewNaming.js` + `src/routes/ccoPhotoReviewWrite.js`,
  stage/bodyArea-godkännande som sätter `namingStatus: 'manual_resolved'`).
  Men den är feature-flaggad bakom `config.enablePhotoReviewWrite`, och
  **`src/config.js` rad 1319–1336 blockerar den explicit på den exakta
  produktions-hostnamnen `arcana.hairtpclinic.com`** om inte BÅDA
  `ENABLE_PHOTO_REVIEW_WRITE` och `ENABLE_PHOTO_REVIEW_CANARY_ON_PROD` är
  satta till true. Jag har inte kunnat verifiera de faktiska miljövariabel-
  värdena i prod (ingen prod-åtkomst), men default-designen är "av på riktig
  prod". Även om den vore på: pilotens defaultgräns är `maxPatients: 5`
  (`PHOTO_REVIEW_PILOT_MAX_PATIENTS`) — inte skalad för en verklig backlog.
- Journaler, formulär och "övrigt" (enligt tidigare rapporterad fördelning:
  1 876 formulär, 2 088 övrigt av 4 671 i kön — **denna siffra är relayad, se
  avgränsning nedan**) har **ingen** motsvarande granskningsväg alls. Bara
  foton har `resolveReviewStage`/`buildPhotoReviewNamingPatch`.

**Slutsats A:** mekanismen som håller tillbaka osäkra namn fungerar exakt som
den ska (skriver aldrig fel som fakta). Men det finns i praktiken **ingen
levande väg för en människa att faktiskt lösa den kön** utanför en
begränsad, sannolikt avstängd fotopilot. Kön är inte "väntande på granskning"
— den är strukturellt oåtkomlig med dagens UI.

**B. Testtäckningsluckor på moduler som styr vad patienten/personalen
faktiskt SER.**

- `patientCardSections.js` (`resolvePatientCardSection`) — **noll testfiler**
  i hela repot. Detta är funktionen som avgör vilken flik/sektion ett asset
  hamnar i på patientkortet. Ingen regression skulle fångas om
  sektionslogiken går sönder.
- `assetDisplayLabel.js` — **noll testfiler**. Detta är den faktiska
  render-tidsfunktionen `server.js` och `ccoUnifiedTimelineBuilder.js`
  anropar för att bestämma vilken text som visas — skild från
  `buildAssetNamingMetadata`s beräknade `displayName`, med egen
  "ser tekniskt ut"-heuristik (`looksTechnicalName`, annat regex-mönster än
  `looksTechnical` i backfill-skriptet — två separata implementationer av
  samma idé, inte verifierat att de är konsekventa med varandra).
- `photoReviewNaming.js`s tre kärnfunktioner som faktiskt SKRIVER
  (`buildPhotoReviewNamingPatch`, `buildPhotoReviewRejectPatch`,
  `buildPhotoReviewReassignPatch`) har **noll direkt testtäckning**. Enda
  träffen i testsviten är en enda test av en liten displayName-hjälpfunktion,
  i en fil vars namn (`ccoAssetNamingTimeline.test.js`) inte ens antyder att
  den rör fotogranskning.

**C. `documentDate` och `namingSignals` beräknas men skrivs aldrig.**

`buildAssetNamingMetadata()` returnerar ett normaliserat `documentDate`
(`parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt)`) och
`namingSignals` (klassificeringssignaler) — men **ingetdera finns i
`patchAssetNamingMetadata`s fält-allowlist** i `ccoPatientAssetStore.js`.
Jag kan inte avgöra om detta är medvetet (documentDate anses för känsligt
för namngivnings-pipelinen att röra) eller ett förbiseende. **Flaggar som
öppen fråga, inte som bekräftad bugg** — jag har inte hittat någon
kommentar som förklarar varför.

**D. Två parallella "encounter"-system i kodbasen, olika ålder och syfte.**

`encounterMapper.js` (574 rader, `buildEncounterRegistry`/
`matchAssetToEncounter`, git-historik från #763–#837, ~ett år äldre än
namngivnings-pipelinen) används **bara** av `ccoEncounterLinkRepair.js`
(monterad i `ccoPatientMaster.js`-routen — ett manuellt reparationsverktyg).
Den har ingen koppling till `countTreatmentSession()`/sessionsnumret som
faktiskt visas på korten. Det här är inte trasigt i sig, men det är en
verklig risk för framtida förvirring (två system som båda heter/rör
"encounter", olika sanningar) — värt att antingen dokumentera tydligt eller
slå ihop på sikt.

**E. `CCO-STATUS.md` är inaktuell för hela detta spår.**

Avsnitt 1 ("Backfill sessionNumber") beskriver fortfarande läget FÖRE
#1374–#1380 och säger explicit "ingen fix skriven eller körd". Det stämmer
inte längre. Vem som helst som läser den filen för att förstå nuläget får
fel bild.

---

## Vad jag INTE kunnat verifiera själv (kräver prod-åtkomst jag saknar)

Jag har ingen SSH/Render-web-shell-åtkomst. Följande siffror är **relayade**
av Coworker under den här sessionen och är **inte** oberoende omräknade av
mig — jag har bara verifierat att koden som _skulle_ producera dem gör det
korrekt, inte att siffrorna själva stämmer mot faktisk live-data just nu:

- Aktuell kö-storlek (senast rapporterat: 4 671, fördelat på
  low_confidence/fallback/both/other)
- Att 77 448 assets har ett persisterat displayName, varav ~37 769 påstods
  vara "fastnaglade" på ett fel (för lågt) sessionsnummer från en äldre,
  buggig körning
- Att en `--force`-analys skulle rätta 36 606 av dessa och hålla 1 163 för
  granskning
- Att 166 assets har kurerad status, varav 19 skulle ändras av `--force`
- Att prod-koden faktiskt kör commit `0d621235`/`5060089e`

Jag rekommenderar att någon med prod-åtkomst kör en färsk, oberoende
`report-naming-review-queue.js` **och** en enkel `git log --oneline -1` på
Render-instansen **just nu**, inte litar på siffror som är några timmar
gamla i en lång sessions historik — särskilt givet att den här sessionen
redan en gång visade att en till synes bekräftad siffra (kö-storlek efter
"restore") byggde på fel antagande om vilken fil som faktiskt lästes
(monolit vs. shards).

Jag har heller inte kunnat verifiera de faktiska värdena på
`ENABLE_PHOTO_REVIEW_WRITE` / `ENABLE_PHOTO_REVIEW_CANARY_ON_PROD` i prod —
bara att kodens default-design blockerar dem där.

---

## Prioriterad lista: vad som återstår för att CCO-namngivningen ska vara

komplett och produktionsklar

**1. (Störst effekt, minst risk) Bygg en faktisk granskningsyta för
`needs_review_for_naming` — eller besluta medvetet att inte göra det.**

I dag finns en korrekt, väl testad _hållback_-mekanism men ingen _lösnings_-
mekanism för något annat än foton (och den är sannolikt avstängd i prod).
Detta är den egentliga blockeraren för att kalla namngivningen "komplett" —
inte beräkningslogiken, som redan är korrekt. Antingen: (a) en enkel
lista/tabell-vy (kan återanvända `report-naming-review-queue.js`s
gruppering rakt av, som redan skiljer "troligen bulk-fixbart" från
"kräver mänsklig bedömning") + en skriv-endpoint som sätter
`namingStatus: 'manual_resolved'` generellt (inte bara för foton), eller
(b) ett medvetet beslut att kön permanent lämnas som "aldrig helt namngiven,
och det är okej" — men då bör det beslutet stå skrivet någonstans, inte bara
underförstått.

**2. Koppla `needs_review_for_naming` till faktisk UI-synlighet.**

Minst: låt `resolvePatientCardSection()` faktiskt ROUTA dessa till
`needs_review`-sektionen (som redan finns, redan har en flik-id `'review'`)
i stället för att bara logga en inert signal. Detta är en liten, låg-risk
kodändring men den är en förutsättning för punkt 1 — utan den syns kön
ingenstans i UI:t oavsett vilken skrivväg som byggs.

**3. Verkställ `--commit --force`-korrigeringen av de historiskt
felnumrerade namnen (om siffrorna från punkt "Vad jag inte kunnat
verifiera" håller vid en färsk kontroll).**

Det här är den faktiska "sista milen" av bug #3-arbetet — koden är klar och
skyddad (#1380), men själva skrivningen mot patientdata är ännu inte gjord.
Kräver, i den ordning som redan etablerats i sessionen: färsk backup, färsk
`--force`-dry-run (inte återanvänd gammal output), användarens egen
`--commit --force`-körning, spotcheck. Jag rör inte detta steg.

**4. Testa `patientCardSections.js` och `assetDisplayLabel.js`.**

Noll täckning idag på två moduler som direkt avgör vad som visas var. Detta
är rent tekniska skulder, ingen produktdesignfråga — bör göras oavsett vad
som beslutas om punkt 1–2, eftersom det skyddar mot framtida regressioner i
navigering/sektionering.

**5. Testa `photoReviewNaming.js`s tre skrivande funktioner direkt.**

Samma motivering som punkt 4, men för den enda skrivvägen (om än
canary-gated) som faktiskt existerar mot riktig granskning idag.

**6. Uppdatera `CCO-STATUS.md`.**

Ren dokumentationsskuld, men den aktiva risken är att nästa person (mänsklig
eller agent) läser den och drar fel slutsats om att inget är fixat. Låg
insats, hög läsbarhetsvinst.

**7. Utred om `documentDate`/`namingSignals`-tappet (punkt C ovan) är
avsiktligt.**

Låg prioritet om det är avsiktligt, men bör bekräftas snarare än förbli en
tyst kunskapslucka — särskilt eftersom en framtida "riktig documentDate-
backfill" (nämnd som idé i `report-naming-review-queue.js`s kommentarer för
de ~47 "bulk-fixbara" patienterna) skulle förutsätta att det fältet faktiskt
går att skriva.

**8. Dokumentera (eller slå ihop) de två encounter-systemen.**

Lägre prioritet, ingen aktiv bugg, men en verklig underhållsrisk om någon i
framtiden av misstag bygger vidare på `encounterMapper.js` och tror att det
är samma sanning som patientkortets sessionsnummer.

---

## Risker och öppna frågor, samlat

- **Störst risk:** att "namngivningen är klar" tolkas som sant för att
  beräkningslogiken är korrekt, medan den faktiska produktupplevelsen (kan
  en människa hitta och åtgärda ett osäkert namn?) inte är det. Punkt 1–2
  ovan är där den risken sitter.
- **Beroende:** punkt 1 kräver ett produktbeslut (bygga granskningsyta för
  alla kategorier, eller inte) som inte är en ren teknisk fråga — jag kan
  inte fatta det åt er.
- **Öppen fråga:** är `ENABLE_PHOTO_REVIEW_WRITE`/
  `ENABLE_PHOTO_REVIEW_CANARY_ON_PROD` faktiskt satta i Render-miljön? Om ja
  är fotogranskningsvägen redan delvis i drift och bör inventeras (hur många
  har granskats hittills, av vem) innan man bygger något nytt för foton.
- **Öppen fråga:** var kommer de "kurerade" `manual_resolved`/`approved`-
  namnen (166 st, relayad siffra) ifrån om fotopiloten är avstängd i prod? Om
  den är avstängd måste de ha satts via ett annat, oidentifierat spår (direkt
  databasredigering? en tidigare pilot-period när flaggan var på?) — värt att
  fråga innan man antar att fotopiloten är den enda källan till kurerad data.
- **Ej verifierat av mig:** samtliga konkreta prod-siffror i det här
  dokumentet (kö-storlek, antal felnumrerade, antal kurerade) — se avsnittet
  ovan. Behandla dem som "senast rapporterat", inte "bekräftat nu".
