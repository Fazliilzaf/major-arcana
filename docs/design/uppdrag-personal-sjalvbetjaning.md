# Uppdrag — personalen loggar in och sköter sin egen tid

Ett sammanhängande uppdrag, inte en lista småsaker. Målet är en hel kedja: från
att sköterskorna inte finns som användare, till att Veronica loggar in på sin
telefon och lägger in att hon tar lunch 12:30 på torsdag.

Allt backend som behövs finns redan. Det här är i huvudsak frontend plus en
validering.

## Varför just det här

Vi byggde `resourceId`-länken och resource-scopet på block-routen i morse. Båda
skyddar personer som inte kan logga in:

```
konton i prod : 18
roller        : 16 OWNER, 2 STAFF
Veronica, Clara, Louise, Wendela: inget konto
```

Samtidigt är sköterskornas 508 konsultationstider live sedan i morse. Kliniken
kan boka dem, men sköterskorna själva har ingen väg in i systemet.

Kedjan är värdelös tills den går hela vägen. Därför bygger vi hela vägen.

## Vad som ska finnas när du är klar

En ägare kan skapa ett konto åt Veronica, koppla det till resursen `veronica`,
och Veronica kan logga in och lägga in sin egen lunch. Ingenting mer, men det
ska fungera på riktigt.

## Del 1 — Personal & roller

Ny panel. Ägaryta.

Endpoints finns och stöder `resourceId` sedan `70e2d657`:

```
GET   /users/staff                 ROLE_OWNER   lista medlemskap
POST  /users/staff                 ROLE_OWNER   email, password, resourceId
PATCH /users/staff/:membershipId   ROLE_OWNER   role, status, resourceId
```

Panelen ska visa varje medlemskap med roll, status och kopplad resurs, och
kunna skapa konto, koppla om resurs, byta roll och avaktivera.

**Resursfältet ska vara en rullista, inte fritext.** Hämta resurserna ur
`/cco-booking-engine/catalog`. I dag accepteras `veronca` tyst, och personen blir
låst utan att någon förstår varför.

**Visa vilka resurser som saknar konto.** Fyra bokningsbara sköterskor utan
inloggning är precis den lucka som gjorde det här uppdraget nödvändigt. Panelen
ska göra den synlig i stället för att kräva en databasfråga.

## Del 2 — validera `resourceId` i backend

Rullistan räcker inte. `PATCH /users/staff/:id` tar emot vilken sträng som helst
och normaliserar bara till gemener.

Validera mot bokningsmotorns resurser och returnera 400 med tydligt fel om
resursen inte finns. En rullista kan kringgås; en validering kan det inte.

## Del 3 — Mitt schema

Ny yta för inloggad personal. Den ska fungera på telefon — det är där en
sköterska står när hon behöver flytta sin lunch.

**Visa** hennes kommande arbetstider. `GET /cco-bookings/slots` tar `resIds`, så
det är ett anrop filtrerat på hennes egen resurs.

**Lägg in lunch eller ledighet.** `POST /cco-bookings/calendar-blocks` är redan
resource-scopad — hon kan bara skriva för sig själv, och 403 kommer från
backend om hon försöker något annat. Frontend behöver inte upprepa den logiken,
bara visa felet begripligt.

**Visa befintliga block.** `GET /cco-bookings/calendar-blocks`.

Två saker att veta om blockmodellen:

- Den är byggd för **återkommande veckoblock** — `weekdays` plus
  `dateFrom`/`dateTo`. En enskild torsdag går att uttrycka, men bara som ett
  block vars intervall råkar täcka just den dagen. Klumpigt, och det är
  medvetet inte löst än.
- Ett block kan bara **stänga** tid, aldrig öppna. Dagbyten hör därför inte
  hemma här — de kräver `scheduleOverrides`, som inte finns. Bygg inte något
  som ser ut som ett dagbyte.

## Utanför uppdraget

- **Öppettider.** `KONSULTATION_OPPET` är en konstant i
  `ccoBookingEngineStore.js`, inte data. Att göra den redigerbar kräver
  lagringsmodell och endpoint först.
- **Behandlingar & priser, Mejl & SMS-mallar, Fakturering.** Inga endpoints att
  koppla mot.
- **`scheduleOverrides` för dagbyten.** Eget uppdrag.
- **Konfliktkontrollen.** Kommer när schemat blir skrivbart. Block stänger bara
  tid, så en lunch kan inte flytta en bekräftad bokning utanför schemat — den
  krockar synligt i stället.
- **`installningar.html` i arkivet.** Använd den som referens för hur en
  inställningsyta kan se ut. Bygg inte på filen. Öppettidsblocket saknar `id`
  och sparar ingenting, och tre granskare har oberoende avrått.

## Så vet vi att det fungerar

Inte "testerna är gröna". Så här:

1. Ägare skapar konto åt Veronica och kopplar resursen `veronica`.
2. Veronica loggar in på sin telefon.
3. Hon ser sina kommande arbetstider — och de matchar rotationen i
   `skoterskeschema-plan.md`.
4. Hon lägger in lunch 12:30–13:15 en torsdag.
5. Den tiden försvinner ur `/cco-booking-engine/availability` för `veronica`,
   och bara för henne.
6. Hon försöker lägga ett block på `clara` — får 403.

Steg 5 är den som räknas. Allt annat kan se rätt ut och ändå inte påverka vad
patienten ser.

## Innan du börjar

Fyra sköterskor har inga konton, och att skapa dem kräver lösenord. Det gör
Fazli, inte du och inte jag. Bygg mot ett testkonto och lämna över när panelen
finns.
