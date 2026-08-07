# CCO Status - Handover

## Starta här i ny chatt (uppdaterad 2026-08-07)

- Repo: `~/Code/major-arcana` (Mac) / `/home/fazli/major-arcana-legacy` (VPS
  134.209.232.101). INTE iCloud-mappen.
- Kör `git pull` först — `main` ska vara vid commit `dfd8d8b3` eller senare.
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

### 4. ORD-93 mätgrind steg 2 — visuell kontroll ej gjord på ett äkta cid-fall

Alla verifieringar denna session skedde mot Ali Selim-tråden, som har
`bodyHtml: 0` — inget `cid:` alls att markera. Steg 2 i ORD-93:s mätgrind
("öppna ett meddelande före/efter, bekräfta trasig ikon → synlig markering")
är därför inte bekräftat mot ett meddelande som faktiskt HAR en olöst
`cid:`-referens. Litet, snabbt, men ogjort.

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
