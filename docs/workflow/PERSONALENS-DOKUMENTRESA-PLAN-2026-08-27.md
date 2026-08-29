# Personalens dokumentresa in i CCO — hur jag tycker att vi ska automatisera den

**Till Fazli · 2026-08-27**
**Efter ORD-126.** Allt nedan är mätt i repot i dag, inte hämtat ur en
rapport. Där jag inte vet står det att jag inte vet.

---

## Var vi står

ORD-126 gjorde det den skulle. Jag kontrollerade själv:

|                      | Läge                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| Katalogen            | **45 rader** (var 39)                                                             |
| Sex nya estetikrader | finns, och bär `clinics: ['hairtp','curatiio']`                                   |
| Når de Curatiio?     | **Ja** — `ccoDocumentTypeRegistry.js:66` läser `clinics` (plural) före `clinic`   |
| PRF-hud              | täckt av `journal_prp_multi` + `offert_prf` — min tidigare invändning är besvarad |
| Tester               | **18/18 gröna** på readiness, aggregator och registry                             |
| Fältdokumentet       | `ESTETIK-JOURNAL-FALT-ORD-126.md`, 10 KB                                          |

Slutsatsen i fältdokumentet är värd att stanna vid: de fyra
"generatorerna" producerar inga fält. Fälten bor i de åtta journalerna,
och varje behandling har sin egen mall. Det betyder att vägen framåt är
**per tjänst**, inte per generator.

---

## Principen allt vilar på

**Katalogen är enda källan.** Ny dokumenttyp = ny rad. Aldrig hårdkodad i
en vy. Då följer den automatiskt med till kundkortet, signalerna och
portalen. ORD-126 gjorde precis det, och det är därför de åtta
journalerna nu betyder något för systemet i stället för att vara åtta
lösa HTML-filer.

**Ett dokument är klart när det finns bevis — inte när någon kryssat.**
Signerad journal, sparad mall, uppladdad fil. Ett manuellt kryss är en
gissning som ser ut som ett faktum.

**Systemet föreslår, människan skickar.** Varje signal bär
`dryRun: true`, `CCO_SEND_LIVE` är `false`, och mallgrinden är
fail-closed. Ingenting nedan ändrar på det.

---

## De fyra stegen, i den ordning de gör nästa möjlig

### Steg 1 · Rätt dokument dyker upp av sig självt

**Det som saknas:** `serviceIds` per katalograd. Jag sökte i dag —
**noll förekomster** i katalogen.

I dag finns bara `flowApplies`, grova vägar som `['tp']` och `['botox']`.
Det räcker för att skilja transplantation från botox, men inte för att
svara på frågan personalen faktiskt har: _"vad ska jag fylla i för den
här bokningen?"_

Bokningen bär redan `serviceId` — samma fält som varumärkesfiltret läser.
Kopplingen som behövs är att katalograden kan peka tillbaka.

**Varför den ska först:** utan den vet systemet inte _vilka_ dokument som
gäller. Allt annat bygger ovanpå.

**Första uppgiften är inte kod.** Kopplingen 55 tjänster × personalens
dokument är klinisk kunskap. Ingen utvecklare kan avgöra om
"Stygnborttagning" kräver en journal och vilken. Arbetsbladet
`underlag-per-tjanst-ARBETSBLAD.csv` ligger och väntar på den timmen.

### Steg 2 · Rätt person äger det

**Din regel från 26 augusti:** dokumentet hänger på tjänsten, den som
utför fyller i, och det ska gå att välja någon annan.

Två av tre delar saknas:

- `practitionerId` finns redan på bokningen
  (`ccoBookingEngineStore.js:1155`). Utföraren är alltså känd före
  besöket — men ingenting kopplar den till dokumentet.
- `assignedTo` finns inte på dokumentinstansen. Det enda som finns är
  `actor`, och det sätts **efteråt**. `actor` är historik, `assignedTo`
  är arbete. Utan det senare kan systemet inte säga "det här är ditt i
  dag", och kan inte heller flytta något till en kollega.

(`assignedTo` finns i `src/qms/qmsStore.js`, men det är ett annat
delsystem — inte dokumentinstanserna.)

### Steg 3 · Operationsdagen som egen yta

Fyra dokument, samma dag, under tidspress. Det är det enda tillfället i
resan som förtjänar en egen vy i stället för fyra rader på ett kort.

Med ORD-126 gäller det nu Curatiio också: bleph har `op_dag` och
friskförsäkran, precis som transplantation.

### Steg 4 · Eftervården börjar som utkast, inte som tomt blad

Jobben schemaläggs redan vid signerad behandlingsjournal. Nästa steg är
att jobbet **skapar journalutkastet**, så att uppföljningen börjar som
något att fylla i.

Det är också det första stället där något kan lämna huset — så det ska
byggas sist, när grindarna ovanför är på plats.

---

## Vad som aldrig ska automatiseras

Lika viktigt som listan ovan:

- **Godkännande av en mall.** `pending` är rätt förval. Kod som sätter
  godkänt är en bugg, oavsett hur bekvämt det vore.
- **Läkarens ordination.** Din regel: den ska godkännas individuellt före
  varje operation, i båda klinikerna. Se ORD-128 — begreppet finns inte i
  koden i dag.
- **Beslutet att ett dokument är klart.** Bevis, inte kryss.
- **Utskick.** Så länge `CCO_SEND_LIVE` är `false` visar systemet, det
  skickar inte.

---

## Vad som blockerar just nu

| Order                                           | Läge i dag                           | Blockerar                            |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------ |
| **ORD-127** · `6_man_check` → `8_man_check`     | **1 träff kvar** i katalogen         | Steg 4 — eftervården ber om fel mall |
| **ORD-128** · läkarens ordination som grind     | inget läkargodkännande finns i koden | Steg 3 — operationsdagen             |
| **ORD-129** · ögonlocksplastik = `minorSurgery` | `TREATMENT_TYPE_VARIANT_HINTS` orörd | Steg 3 — risk att steg 8 hoppas över |
| **Arbetsbladet**                                | ifyllt: nej                          | Steg 1 — och därmed allt             |

ORD-129 är värd en rad extra: katalogen är rätt nu tack vare ORD-126, men
klassificeringen i `cco-kundkort-kkx.js` är det inte. Lägger någon in
Curatiios behandlingar i hint-listan försvinner operationsdagen — och
friskförsäkran — för en patient som ska skäras i.

---

## Ordningen jag rekommenderar

1. **Arbetsbladet.** Din timme. Utan den står allt annat stilla.
2. **ORD-127** — en rad, och den är en motsägelse så länge den står kvar.
3. **`serviceIds` i katalogen**, matat ur arbetsbladet.
4. **`assignedTo` + utföraren som förval.**
5. **ORD-129**, innan Curatiios behandlingar klassificeras.
6. **ORD-128** — grinden. Störst, och medicinskt reglerad: ta den med den
   som är medicinskt ansvarig innan den slås på.
7. **Operationsdagsvyn**, sedan **eftervårdsutkasten**.

## Om din fråga: tjänstekatalogen och priserna nu?

**Ja, men gör `serviceIds` först — inte priserna.** Det är kopplingen
tjänst → dokument som låser upp hela kedjan. Prissättningen är en egen
sak och behövs inte för att personalen ska få rätt underlag i handen.

Och när priserna väl kommer in: **journalen ska länka till tjänsten, inte
kopiera priset.** Ett pris som klistras in i en journal är rätt den dagen
det skrivs och fel därefter — och en journal redigerar man inte i
efterhand.
