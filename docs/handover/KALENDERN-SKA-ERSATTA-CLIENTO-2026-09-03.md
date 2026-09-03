# Kalendersegmentet ska ersätta Cliento — vad som krävs

**Mätt 2026-09-03.** Ägaren: _"målet är att det segmentet ska ersätta Cliento som
vi har idag."_ Ingen tidigare mätning har utgått från det.

Allt nedan är mätt mot koden och mot prod. Ingenting är antaget.

---

## Kort svar

Motorn är **arkitektoniskt mer färdig än den ser ut** och **driftmässigt på noll**.

```
Cliento           39 686 bokningar · 19 140 kunder · 2021 → 2027
                   2 326 senaste 90 dagarna  ≈ 26 per öppetdag
                     388 framtida icke-avbokade

Egna motorn            5 icke-test-bokningar, varav 1 i framtiden
                       3 av ~40 tjänsttyper bokningsbara
                       3 av ~13 behandlare
                     220 reservationer — 92 % testdata från maj
```

Det är inte en halvfärdig motor. Det är en färdig motor med tomt schema, tom
katalog och ingen koppling till verkligheten den ska ersätta.

---

## Vad motorn redan kan

Transaktionslogiken är genomtänkt på ett sätt man inte skriver av misstag:

- idempotens med fingerprint (`ccoBookingEngineStore.js:2180`)
- serialiserad mutationskö med helstate-rollback (`:2193`)
- kirurgisk rollback vid ombokning som bara rör egna rader (`:2347`)
- intervallbaserad kollisionskontroll, inte bara slot-id (`:1564`, `:1577`)
- rumsallokering med rumskollisionsskydd (`:1480`, `:1534`)
- tidszonskorrekt tillgänglighet i klinikens väggklocka (`:1621`)
- rullande fyra-veckorsschema för sköterskorna (`:1039`)
- avbokningspolicy med depositionsregel, ombokning, hålltid som utgår

Operatörens API är komplett (`ccoBookingEngine.js:1081–1615`) med audit och
behandlingsavtalsgrind. Kalender-UI:t skapar, bokar om och avbokar mot motorn.

---

## De tre hindren, i ordning

### 1 · Dubbelbokning — och varför mjuk parallelldrift inte går

`isSlotTaken` (`ccoBookingEngineStore.js:1577`) läser bara motorns egna
reservationer, bokningar och kalenderblock. Den känner inte till **en enda** av
de 388 framtida Cliento-bokningarna.

Och det går inte att lösa genom att synka: **Cliento-API:t kan bara läsa.**
`clientoApi.js:325–370` exponerar `getSettings`, `getRefData`, `getSlots`,
`getReviews`, `getCustomers` — enbart GET. Det finns ingen skriv-endpoint. CCO
har aldrig kunnat lägga in en bokning i Cliento.

**Konsekvens:** man kan inte köra båda systemen parallellt och låta dem hållas
i synk. Det måste bli en **cutover på ett datum**. Och den cutovern måste först
föra in de 388 framtida bokningarna i motorn — som bokningar eller blockeringar.

Det är det enskilt viktigaste beslutet i hela övergången.

### 2 · Schemat och katalogen är tomma, och personalen kan inte fylla dem

```
67 tillgänglighetsregler   men bara för TRE tjänster:
                             consultation-physical (29)
                             consultation-online (3)
                             followup-transplant (2)

12 av 15 publika tjänster  noll tider — fue, dhi, beard, eyebrow, prp-hair,
                           prp-skin, microneedling och alla fem Curatiio-tjänster
```

Slås publik bokning på i dag ser kunden tjänster utan en enda ledig tid.

Värre: **öppettiderna är konstanter i källkoden**, inte data.
`KONSULTATION_OPPET` (`ccoBookingEngineStore.js:230`) och sköterskornas fyra
skift (`:277–282`). Sköterskeschemat byggs av
`buildNurseCyclicConsultationRules` (`:109–155`). Ingen i personalen kan ändra
öppettider, semester eller schema utan att någon ändrar kod och deployar.

Nio behandlare som finns i Cliento-historiken saknas helt som resurser i motorn:
Hind Alsharifi (1 192 bokningar), Natsuko Martinsson (1 121), Sabina Nordvall
(630), Matilda Sellergren (529), Mikaela Richter-Hill (246), Danyal Golgo (202),
Jessicka Bakhtiari (196), Emir Kapetanovic (8), Anna Klang (1).

Och fyra transplantationstjänster står på **0 kr** trots att koden anger
39 900 / 49 900 / 29 900 / 24 900 (`:378–418`). Katalog-mergen skriver över.

**Det här är inte i första hand ett programmeringsproblem.** Det är en katalog-
och schemauppgift som personalen måste kunna göra själv — och verktyget för det
finns inte.

### 3 · Patientkommunikationen

En klinik med 26 besök om dagen och **1 413 historiska no-shows** kan inte gå
live utan påminnelser.

```
bekräftelsemail        finns  (ccoCommercialMailDispatch.js:339–368)
påminnelseflödet       läser bookingEngineStore — som har 1 framtida bokning
gamla påminnelsen      deprecated och karantänsatt (bookingReminderScheduler.js:3–27)
avboka/omboka-länk     routrarna monterade, ingen mall genererar länken någonsin
SMS                    saknas
telefonnummer          sparas inte ens på bokningen
```

Cliento har `customerPhone` på 28 450 bokningar. Motorns bokningspost har inget
telefonfält alls.

---

## Fält som finns i Cliento och saknas i motorn

| Fält                                  | Antal i Cliento | I motorn                             |
| ------------------------------------- | --------------- | ------------------------------------ |
| `customerPhone`                       | 28 450          | saknas helt                          |
| `status: no_show`                     | 1 413           | saknas — bara confirmed/cancelled    |
| `priceSek` per bokning                | 16 369          | pris finns bara på tjänstenivå       |
| `customerMessage`                     | 4 187           | saknas                               |
| behandlings- och interna anteckningar | 104 +           | saknas                               |
| `clientoCustomerId`                   | 1 388 hinkar    | saknas                               |
| blockerad tid (`isReservation`)       | 9 219           | `calendarBlocks` finns, 1 rad i prod |

Plus: buffert mellan besök finns inte (`bufferMinutes` saknas), och det finns
ingen väntelista.

---

## Rättelse till masterplanens fas 0

Jag skrev att `cco-booking-cases.json` är storen bakom nio tomma vyer, och att
ärenden skapas av `ccoBookings.js:1025`. **Det andra stämmer inte.**

Det finns **två** parallella ärendemodeller:

```
cco-booking-cases.json    kliniskt ärende: new → qualifying → proposed →
                          confirmed → scheduled → in_progress → handoff →
                          completed. Bär behandlingsplan, ordinationsbeslut med
                          signatur, överlämningschecklista.
                          server.js:241 pekar på repo-katalogen → TOM i prod,
                          försvinner vid varje deploy.

cco-booking.json          kommersiellt/triage: needs_triage → slots_ready →
                          offered → waiting_customer → confirmed_external …
                          Ligger på /var/data. 369 ärenden i prod.
                          DET ÄR DEN ccoBookings.js:1025 skriver till.
```

Fas 0 är alltså fortfarande rätt — sökvägen ska till `stateRoot` — men den
väcker den **kliniska** ärendemodellen, inte den kommersiella. Och den fylls av
personalportalen och patientportalen, inte av bokningsflödet.

---

## Vad det betyder för ordningen

Cliento-ersättningen är ett **eget program**, inte en fas i personalportalens
plan. Den har sin egen kritiska väg:

```
1  cutover-beslut          ett datum, för parallelldrift går inte
2  katalog och schema      som redigerbar data, inte konstanter
                           + de nio saknade behandlarna
                           + tider för de 12 tjänsterna
                           + de fyra nollprisen
3  de 388 framtida         in i motorn som bokningar eller blockeringar
4  telefon + no-show       på bokningsposten
5  påminnelser             mot en motor som faktiskt har bokningar
6  avboka/omboka-länk      generera token i bekräftelsen
7  publik bokning på       flaggan sist, när 1–6 är klara
```

Steg 2 är det tyngsta och det minst tekniska. Det kräver att någon i kliniken
sätter sig med katalogen.

---

## Oavgjort

- **Om Cliento-mail-ingesten fångar nya bokningar.** Koden är inkopplad
  (`server.js:12030`) men prod har noll poster med `source: cliento_web_mail`.
  Kan bero på att inga mail kommit, att avsändarmatchningen missar, eller att
  mail-synken inte kört.
- **Om bokningsbekräftelser når patienter i skarp drift.** `CCO_SEND_LIVE=false`,
  RESEND ej konfigurerad. De enda bokningshändelserna i prod är från maj och
  märkta "mock".
- **Varför fue/dhi/beard/eyebrow står på 0 kr.** Katalog-mergen skriver över
  defaults; merge-logiken lästes inte tillräckligt djupt.
- **Om de 5 icke-test-bokningarna är riktiga patienter.** Adresserna är
  `@gmail.com` och `@icloud.com` men de maskerades och följdes inte upp.
- **Hur hemsidan väljer provider** när flaggan slås på — `arcana-client.ts`
  ligger i en annan kodbas.
