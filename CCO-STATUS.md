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

## Öppna uppgifter — ingen tilldelad, ingen tidsplan

Allt nedan är genuint olöst. Inget är brådskande, men inget ska heller antas
vara någon annans problem bara för att det inte är i den här listan.

### 1. `encounterMapper.js` — sessionNumber räknar fel för minst en patient

Upptäckt via backfill-dry-run mot **riktig prod-data** 2026-08-07 (Render
SSH nu uppsatt och fungerande, `srv-d8b3i3tckfvc73clgeng`). Fyra foton, en
patient, en dag, kategori `photo_during` — fick "FUE Operation 23/25/26/30".
`sessionNumber` (`encounterMapper.js:284`) ska räkna distinkta
operationstillfällen, inte foton. Grupperingslogiken hade inte deduplicerat
korrekt för den patienten.

**Redan skyddat** (`#1327`, mergad): `--commit` i
`scripts/backfill-asset-display-names.js` skriver aldrig
`namingStatus: needs_review_for_naming` längre — se `stats.skippedNeedsReview`
och `needsReviewSamples` i rapporten. Inget destruktivt kan hända medan detta
väntar.

**Ej utrett:** varför `encMap` för den patienten innehöll 30+ möten i stället
för ett fåtal. Data-import-fel eller grupperingsnyckel-bugg — okänt tills
någon gräver.

### 2. ORD-99 — varför är `bodyText` bara 159/255 tecken för `info@`?

Roten till den avkapade texten är hittad och fixad på klientsidan (`#1319`,
`#1322`, `#1323` — se `docs/ops/fynd-bodypreview-avkapning-2026-08-06.md`,
sektion "SLUTGILTIGT 2026-08-07"). Men **varför den lagrade textkroppen
själv är kort** för `info@`-meddelanden är obekräftat. `/messages` berikar
redan via `mailIngestionStore` — ger även den vägen kort text pekar det mot
ett dataspår vid `info@`:s import, inte ett kodfel. Kräver att någon utreder
importhistoriken för den brevlådan, inte klientkod.

### 3. Backfill — full dry-run mot prod, ingen körd än

`#1324`/`#1327` är mergade och säkra att köra. Ingen har kört
`node scripts/backfill-asset-display-names.js --dry-run` **utan `--limit`**
mot riktig prod-data för att se totalomfånget av `needsReviewSamples`. Görs
via Render SSH (se nedan) — medvetet avvaktat 2026-08-07, ingen brådska.

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

**Rätt nästa steg, om/när Fazli vill gå vidare:** kör
`scripts/report-cliento-link-candidates.js` (läs-endast, `zeroWrites:
true`) mot prod via Render SSH för att se hur många bokningar som är
säkra att länka ihop mellan de två tenant-namnrymderna, och låt dess
egna `gate`-status (`review_required`/`blocked_data_invariant`) styra om
något mer görs. Ingen egen kod behöver skrivas — verktyget finns redan.

**`#1342`/`#1343` (global bookingId-dedup + saneringsskript) förblir
korrekta och oberörda** — de skyddar mot en genuint annan, verklig risk
(samma bookingId inom EN tenant med varierande identitetsfält mellan
importer), och rör aldrig cross-tenant-jämförelsen. Inte påverkade av
reverten.

### 7. 10 991 bokningar finns bara i CCO, inte i senaste Cliento-exporten

Från samma Fas 0-mätning. Trolig men obekräftad hypotes: äldre bokningar
från före exportens startdatum (augusti 2021), eller bokningar som tagits
bort i Cliento men finns kvar hos oss historiskt. Kräver antingen en äldre
Cliento-export för jämförelse, eller en datumfördelning av de 10 991 för
att se om de klustrar före augusti 2021 (stödjer hypotesen) eller är
spridda (stödjer inte).

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
- **CCO 9-stegs kundresa** — klar. Steg 2 och 9 kartlagda. Enda kvarvarande
  fråga är operativ, inte teknisk: går bokningsbekräftelsen (steg 2) ut från
  Cliento med Meridiq-länken?
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
- **ORD-101** — cross-tenant-reconcile för `hair_tp`/`hair-tp-clinic` är
  redan byggt och kört en gång (18 juli 2026, tre veckor före denna
  session): 1 887 säkra länkkandidater hittade, noll skrivningar, medvetet
  pausat i väntan på Fazlis "separata owner-granskning". Se
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
