# ORD-158 · Katalogen som skuggar repot

**Arbetsorder · 2026-09-01**
**Bas:** `main` (`121bbbd9`)
**Föregås av:** `8d1237a1` (flytten till `src/ops/cco-service-catalog.json`, 2026-08-28), ORD-149 (momsraderna)
**Grind:** `CCO_SEND_LIVE` orörd · inga prisändringar i den här ordern
**Prioritet:** P1 — en ändring i repots tjänstekatalog når inte prod, och deployen ser lyckad ut

---

## Vad som händer

`src/ops/ccoTjanstespecifikationStore.js` läser tjänstekatalogen så här:

```js
function resolveServiceCatalogPath() {
  if (fs.existsSync(LIVE_SERVICE_CATALOG_PATH)) {
    // data/cco-service-catalog.json
    return LIVE_SERVICE_CATALOG_PATH; // ← härifrån, för alltid
  }
  if (fs.existsSync(SERVICE_CATALOG_PATH)) {
    // src/ops/cco-service-catalog.json
    fs.copyFileSync(SERVICE_CATALOG_PATH, LIVE_SERVICE_CATALOG_PATH);
    return LIVE_SERVICE_CATALOG_PATH;
  }
  return SERVICE_CATALOG_PATH;
}
```

`data/` är gitignorerad. Första gången appen kör kopieras repots katalog dit.
Därefter är kopian sanningen. **Ingenting uppdaterar den någonsin igen** —
`copyFileSync` förekommer på exakt ett ställe i hela `src/`, och det är i
skapa-grenen ovan.

På Render ligger `data/` på beständig disk (`ARCANA_STATE_ROOT=/var/data`).
Filen finns där nu. Alltså kommer skapa-grenen aldrig att köras igen, och
**nästa ändring i `src/ops/cco-service-catalog.json` når inte prod.** Deployen
går igenom, CI blir grönt, och ingenting händer.

---

## Mätning 2026-09-01

Arbetskopians `data/`-fil är från 2026-08-28, samma dag som `8d1237a1`:

```
data/cco-service-catalog.json    82 tjänster    0 med momssats
src/ops/cco-service-catalog.json 84 tjänster   84 med momssats

saknas i data/:  cco-btx5        Rynkbehandling BTX: 5 områden    5 400 kr
                 cco-filler1ml   Filler 1 ml                      3 600 kr
```

Prod är i dag rätt — kontrollerat, inte antaget:

```
GET https://arcana.hairtpclinic.com/api/v1/cco/service-specs
→ 84 tjänster · 0 utan momssats · båda de nya finns
```

Prods kopia skapades alltså efter ORD-149. Det är tur, inte konstruktion. Nästa
gång katalogen ändras är turen slut.

### Testsviten är inte reproducerbar

Sju tester failar i en arbetskopia som kört appen före ORD-149, och passerar i
en ren utcheckning av samma commit:

```
tests/ops/ccoTjanstespecifikationStore.test.js      "listar 84 tjänster …"  82 !== 84
tests/routes/ccoCommercialOfferFromPlan.test.js     ORD-149 §3, §4, §6, §9, momsfältet
```

Mätt i två rena worktrees mot `origin/main`: 19 tester, 19 gröna. I
arbetskopian: 19 tester, 7 röda. Samma commit.

Det förklarar varför en agent rapporterar grönt och nästa rött om samma kod.
Det är inte oenighet — testet läser en fil som inte ligger i repot.

---

## Vad kommentaren påstår, och vad som faktiskt finns

Raden ovanför funktionen säger:

> `// Klinikens redigerbara kopia — på beständig disk via config.dataDir`

**Den funktionen finns inte.** Mätt:

```
writeFileSync/writeFile mot någon katalogfil i src/     0 träffar
LIVE_SERVICE_CATALOG_PATH nämnd utanför storen         0 träffar
route eller skript som skriver data/cco-service-catalog.json   finns inte
```

`LIVE_SERVICE_CATALOG_PATH` exporteras men används ingenstans. Ingen redigerar
kopian, för det går inte. Den är inte klinikens fil — den är en ögonblicksbild
som appen skrev till sig själv och sedan aldrig rörde igen.

Det spelar roll för hur ordern ska lösas: **det finns ingen redigering att
skydda.** Argumentet mot att skriva över kopian bygger på en funktion som aldrig
byggdes.

---

## Uppgiften

### 1 · Bestäm vad kopian är till för

Två vägar, och de utesluter varandra. Mät inte fram svaret — det är ett
ägarbeslut om produkten.

**A. Ta bort skuggan.** Läs `src/ops/cco-service-catalog.json` direkt. Ta bort
`LIVE_SERVICE_CATALOG_PATH`, kopieringen och `data/`-grenen. Katalogen blir
kod, och en ändring i repot når prod vid nästa deploy som allt annat.

**B. Behåll kopian och gör den till en riktig funktion.** Då krävs tre saker
som inte finns i dag: en skrivväg så personalen kan redigera, en sammanfogning
vid uppstart så nya tjänster och nya fält från repot kommer in utan att skriva
över redigerade priser, och en vy som visar vad som skiljer.

A är dagens verklighet minus en bugg. B är ett nytt bygge. Välj innan något
kodas.

### 2 · Gör testerna oberoende av maskinen

Oavsett väg: testerna ska mäta koden, inte den som kör dem.

Peka dem mot repofilen — antingen genom att sätta `config.dataDir` till en
temporär katalog i testet, eller genom att låta storen ta sökvägen som
parameter. Efter ändringen ska sviten ge samma svar i en arbetskopia som kört
appen sedan juni och i en färsk `git clone`.

**Verifiera med två worktrees**, inte med `git stash`. Stash tar bort otspårade
filer och flyttar då problemet i stället för att mäta det.

### 3 · En kontroll som ser drift

Om väg B väljs behövs den. Om väg A väljs behövs den ändå, tills kopian är
borta ur alla miljöer.

Regeln, om den skrivs: kopian måste bära **varje tjänst** repot har och
**momssats på varje rad**. Priser får skilja sig — dem äger kliniken i väg B.
Täckning och fält får aldrig ligga efter, för det betyder att en repoändring är
död.

`scripts/check-price-divergence.js` läser i dag `src/ops/cco-service-catalog.json`
och skulle alltså missa exakt det här. Den bör läsa båda och säga vilken den
läste.

### 4 · Städa arbetskopian

`data/cco-service-catalog.json` i utvecklingsmiljöer är gammal på minst en
maskin. När väg är vald: dokumentera hur man nollställer den, eller ta bort
den. Annars fortsätter agenter rapportera motstridiga testresultat.

---

## Fällan

**Skriv inte över kopian vid uppstart som första reflex.** Det gör sviten grön
och känns som en lösning. Väljs väg B senare har man då byggt in en tyst
överskrivning av data personalen matat in, och den buggen märks inte förrän
någon frågar var deras prisändring tog vägen.

**Ändra inte testernas siffror från 84 till 82.** Repot har 84 tjänster.
Testet har rätt och miljön fel. Att flytta siffran gör felet permanent och
tyst.

**Rör inte priserna.** Den här ordern handlar om vilken fil som läses, inte om
vad som står i den.

---

## Godkänt när

1. Ägaren har valt A eller B, och valet står nedskrivet i koden — inte bara i
   ett commitmeddelande.
2. Testsviten ger identiskt resultat i arbetskopian och i en ren utcheckning av
   samma commit. Visa båda körningarna.
3. De sju röda testerna är gröna för att miljön är rätt, inte för att
   förväntan sänkts.
4. Ett test som failar om storen börjar föredra en fil utanför repot igen utan
   att någon bestämt det.
5. Om väg B: ett test som visar att en ny tjänst i repot dyker upp i kopian, och
   att ett redigerat pris i kopian överlever.
6. Prod svarar fortfarande med 84 tjänster och momssats på varje rad efter
   ändringen. Kontrollera mot `/api/v1/cco/service-specs`, inte mot en logg.

---

## Vad jag inte avgjort

**Varför prods kopia är aktuell.** Den skapades någon gång efter ORD-149, men
jag vet inte vid vilket tillfälle eller om `/var/data` har återskapats. Det
spelar ingen roll för åtgärden, men om någon vill veta om det kan hända igen
ligger svaret i Renders disk-historik.

**Om fler filer under `data/` har samma mönster.** Jag mätte katalogen, för det
var den som failade. `copyFileSync` finns bara på det ena stället i `src/`, men
`data/` innehåller mer, och inget av det är i git.
