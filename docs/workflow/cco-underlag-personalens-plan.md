# Underlagen genom kundresan — hur planen bör läggas

**Till Fazli · 2026-08-27**
**Källa:** `src/ops/hairtp-document-types.catalog.json` och koden runt den. Läst, inte antaget.

---

## Kortsvaret: planen finns redan, den är bara inte synlig

Ni har **39 dokumenttyper** i katalogen, och varje typ vet redan fyra saker
som en plan behöver:

| Fält | Vad det svarar på |
| --- | --- |
| `filler` | vem fyller i — patient, personal eller systemet |
| `journeyStep` | var i resan det hör hemma |
| `uiCard` | vilket kort i kundvyn det ska synas på |
| `requiredFor` | vad som blockeras om det saknas |

Fördelningen:

- **17 patienten** fyller i
- **13 personalen** fyller i
- **9 systemet** genererar självt

`ccoPatientDocumentAggregator.js:201` går redan igenom hela katalogen per
patient. Grunden finns. Det som saknas är inte en ny lista — det är att
personalens tretton syns **på rätt kort vid rätt tillfälle**.

**Bygg alltså inte en checklista vid sidan av.** En andra lista blir en
andra sanning, och den kommer att glida.

---

## Personalens tretton, i resans ordning

| Steg | Dokument | Vad | Kort |
| --- | --- | --- | --- |
| **4** | ID-verifiering | process — pass/körkort/leg | Hälsa |
| **4** | Konsultationsmall | skriv | Hälsa |
| **5** | Behandlingsplan / offert | skapa | Behandling |
| **5** | Ordinationsmall · hårtransplantation | skriv | Behandling |
| **8** | Journal · TP-behandling | skriv | Operation |
| **8** | Journal · PRP/PRF/Microneedling | skriv | Operation |
| **8** | Före/efter-bildmallar | skriv | Operation |
| **8** | Ordination (recept) | skriv | Behandling |
| **efter 8** | Journal · TP efterbehandling (PRP) | skriv | Uppföljning |
| **efter 8** | Journal · uppföljning 4 mån | skriv | Uppföljning |
| **efter 8** | Journal · uppföljning **6 mån** | skriv | Uppföljning |
| **efter 8** | Journal · resultatuppföljning 12 mån | skriv | Uppföljning |
| löpande | Anteckningar på patientkortet | skriv | Anteckningar |

Tyngdpunkten är tydlig: **fyra dokument på operationsdagen** och **fyra i
eftervården**. Det är där personalen behöver mest hjälp av systemet, och
det är där en missad rad kostar mest.

---

## Ett fel som måste bort innan planen läggs

Katalogen säger `journal_tp_follow_6` · "Uppföljning **6 mån**", med
`requiredFor: ['6_man_check']`.

Kadensen i koden säger **4/8/12**. Fem ställen är eniga om det —
`ccoJournalSchemas.js:33` skriver ut att det är ditt beslut från
2026-08-26, och `ccoFollowupDraftPlanner.js:31` och `scheduler.js:4618`
säger samma sak.

**Följden:** vid åttamånaderskontrollen ber systemet om ett
sexmånadersdokument. Personalen får fel mall i handen, och kravet
`6_man_check` kan aldrig uppfyllas av ett besök som sker vid åtta
månader.

Det är en rad i katalogen — `follow_6` → `follow_8`, `6_man_check` →
`8_man_check`, namnet till "Uppföljning 8 mån". Men den ska rättas
**först**, annars bygger vi planen ovanpå en motsägelse.

---

## Tre principer för upplägget

**1 · Katalogen är enda källan.**
Ny dokumenttyp = ny rad i katalogen. Aldrig hårdkodad i en vy. Då följer
den automatiskt med till kundkortet, signalerna och portalen.

**2 · Varje kort visar bara det som är personalens — nu.**
Inte alla 39. Inte ens alla 13. Ett steg 4-besök ska visa
konsultationsmall och ID-verifiering, ingenting annat. `journeyStep` och
`uiCard` finns redan i datan; det är bara att låta dem styra.

**3 · Ett dokument är klart när det finns bevis, inte när någon kryssat.**
Samma regel som stegen i kundresan. Signerad journal, sparad mall,
uppladdad fil. Ett manuellt kryss är en gissning som ser ut som ett
faktum — och det är precis den sortens fel vi grävt bort i CCO hela
veckan.

---

## Faser, i den ordning de gör nästa möjlig

**Fas 1 · Rätta kadensen i katalogen.** En rad. Utan den är allt annat
byggt på en motsägelse.

**Fas 2 · Personalens dokument som arbete i kundkortet.** På varje kort
(`halsa`, `behandling`, `operation`, `uppfoljning`): vilka av personalens
dokument som hör till just det steget, och vilka som saknas. Datan finns
i aggregatorn — det är en vy, inte ny logik.

**Fas 3 · En knapp som öppnar rätt mall.** `cco-template-fill.html` finns
och är länkad. Kopplingen som saknas är från dokumentraden i kundkortet
till rätt ifyllnadsmall, med patienten redan påfylld.

**Fas 4 · Operationsdagen som egen yta.** Fyra dokument, samma dag, under
tidspress. Det är det enda tillfälle i resan som förtjänar en egen vy i
stället för fyra rader på ett kort.

**Fas 5 · Eftervården automatiskt.** Jobben schemaläggs redan vid
signerad behandlingsjournal. Nästa steg är att jobbet skapar
journalutkastet, så att uppföljningen börjar som ett utkast att fylla i
i stället för ett tomt blad.

---

## Ägarskapet — Fazlis beslut 2026-08-27

> Dokumentet hänger på **tjänsten**. Den som **utför tjänsten** fyller i.
> Och det ska gå att **välja någon annan** när det behövs.

Det är rätt regel, och den är bättre än en fast roll per dokument: en
klinik där samma journal skrivs av olika personer olika dagar behöver
följa verkligheten, inte ett organisationsschema.

Regeln kräver tre kopplingar. **En finns, två saknas.**

### 1 · Tjänst → dokument · saknas

Katalogen har bara `flowApplies` — grova vägar som `['tp']` och
`['prp']`. Det räcker för att skilja transplantation från PRP, men inte
för att säga *"den här ordinationsmallen hör till den här tjänsten"*.

Bokningen bär redan `serviceId` (samma fält som varumärkesfiltret läser).
Kopplingen som behövs är ett `serviceIds`-fält på katalograden, så en
tjänst kan dra med sig exakt sina underlag.

**Konsekvens av att inte ha den:** systemet kan visa "PRP-journal" för
alla PRP-tjänster, men inte skilja PRP hår från PRP hud när underlagen
skiljer sig.

### 2 · Utföraren som förvald ifyllare · finns i datan, används inte

`ccoBookingEngineStore.js:1155-1156` bär redan `practitionerId` och
`practitionerLabel` på bokningen. Utföraren är alltså känd innan besöket.

Ingenting kopplar den till dokumentet i dag. Katalogens `filler` är
strängen `staff` — inte vem.

**Det som behövs:** när ett dokument blir aktuellt för ett besök ärver
det bokningens `practitionerId` som förvald ifyllare. Ingen ny datainmatning
— fältet finns redan ifyllt.

### 3 · Möjlighet att välja någon annan · saknas helt

Dokumentinstansen har `actor` — men det sätts **efteråt**, som ett kvitto
på vem som gjorde det. Det finns inget `assignedTo`, alltså inget fält som
säger vem som *ska* göra det.

Skillnaden är hela poängen: `actor` är historik, `assignedTo` är arbete.
Utan det senare kan systemet inte visa en behandlare "det här är ditt i
dag", och kan inte heller flytta ett dokument till någon annan.

**Det som behövs:** `assignedTo` på instansen, förvalt från utföraren,
överskrivbart av personalen, med `actor` kvar som kvitto när det väl är
gjort.

### Ordningen — omvänd efter Fazlis förtydligande

> "Det finns underlag för alla tjänster."

Då är `serviceIds` inte en förfining. Det är **nyckeln**, och den ska
först.

Siffrorna: **55 tjänster** i Cliento-katalogen — 39 Hair TP och 16
Curatiio — mot **39 dokumenttyper**, varav 13 är personalens. Det är
alltså ingen ett-till-ett-lista. En typ som "Journal · PRP/PRF" tjänar
flera tjänster, och en tjänst kan kräva flera typer.

`flowApplies: ['tp']` klumpar ihop alla 39 Hair TP-tjänster i en hink.
Det duger för att skilja transplantation från PRP, men inte för att svara
på frågan personalen faktiskt har: *"vad ska jag fylla i för den här
bokningen?"*

**Ny ordning:**

1. **`serviceIds` per katalograd** — kopplingen tjänst → underlag.
2. **`assignedTo` på instansen** — utföraren som förval, med möjlighet
   att byta.

Utan (1) vet systemet inte *vilka* dokument som gäller. Utan (2) vet det
inte *vems* de är. Men (1) styr vad som ens dyker upp, och därför först.

### Första uppgiften är inte kod

Kopplingen 55 tjänster × 13 dokument är **klinisk kunskap**, inte
kodarbete. Ingen utvecklare kan avgöra om "Stygnborttagning" kräver en
journal och vilken. Koden kan bara bära svaret.

Därför ligger `docs/workflow/underlag-per-tjanst-ARBETSBLAD.csv`
bredvid det här dokumentet: 55 rader, en per tjänst, med en kolumn per
dokument personalen fyller i. Kryssa i vad som gäller, så blir det
`serviceIds` i katalogen.

Det är en timmes arbete för någon som kan klinikerna, och det är den
timmen hela planen står på.

---

## Vad jag fortfarande inte kan svara på

**Om Curatiio har egna varianter** av personalens tretton. Katalogen har
`clinics`, men jag har inte gått igenom Curatiios uppsättning mot deras
faktiska rutiner.

**Om någon annan än utföraren ska kunna signera.** Regeln säger att
utföraren fyller i. Om en journal måste kontrasigneras av läkare är det
en fjärde koppling, och den är medicinskt reglerad — inte något jag
avgör.
