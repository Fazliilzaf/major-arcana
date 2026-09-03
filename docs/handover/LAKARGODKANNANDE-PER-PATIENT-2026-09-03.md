# Läkaren godkänner per patient — vad som finns och vad som fattas

**Mätt 2026-09-03.** Ägarens mening, ordagrant:

> "målet är nu att alla kunder som ha deligering inför sin transplantation att det
> underlaget ska läkaren godkänna för varje person som sköterskorna ser och att
> läkaren har godkänt det"

Och flödet, samma dag:

> "när kunden har fått offerten, behandlingsplanet, alleskvitt på alla samtycken,
> avtal och alla underlag, så betalar han 20 procent efter det. Efter det så ska
> läkaren kunna se att kunden ska göra en transplantation. Och då ska det finnas
> möjlighet att den godkänner det. Om det är så att kunden bokar av sin tid, så
> ska det automatiskt den delegeringen försvinna. Annars ska den vara kvar så att
> sköterskorna kan se det."

---

## Kort svar

**Kedjan är byggd. Den har aldrig körts.**

```
cco-audit.jsonl        59 114 rader
  ordination.*              0 händelser   någonsin
  cco.booking_case.*        0 händelser   någonsin

/var/data/cco-booking-cases.json   finns inte → storen bootar med 0 ärenden
```

Ingen läkare har någonsin godkänt ett ordinationsunderlag i produktion, och inget
ärende har någonsin skapats. Det är inte en följd av dagens sökvägsflytt —
revisionsloggen ligger i en egen fil på `/var/data` och går månader tillbaka.

---

## Vad som redan finns, och fungerar

### Läkarens beslut — tre vägar, inte en

| Väg                 | Fil:rad               |
| ------------------- | --------------------- |
| godkänn             | `staffPortal.js:3395` |
| avvisa              | `staffPortal.js:3467` |
| begär komplettering | `staffPortal.js:3522` |

Signatur krävs vid godkännande (minst 2 tecken, `:3402`). Vid avvisning krävs
dessutom en motivering på minst 5 tecken (`:3475`). Allt audit-loggas dubbelt —
en rad från storen, en från routern med signaturen i `detail`.

### Godkännandet sitter på patienten och behandlingen

`ordinationReview` (`ccoBookingCaseStore.js:92–107`) ligger på ett ärende som bär
både `patientId`, `customerId`, `serviceId` och en `treatmentPlan`. Alltså exakt
den kornighet ägaren efterfrågar: **ett godkännande per person och behandling**.

Statusmaskinen är stram. Personalen kan aldrig sätta `approved` — bara begära
läkarbeslut (`:582`) eller markera komplettering klar (`:604`).

### Sköterskan ser det redan — på två ställen

```
Mina kunder      pill per kundrad: "Ordination godkänd · <läkare>"
                 staffPortal.js:2496 → staff-portal.html:3163 / :3604

Dagens arbete    "Läkaren har godkänt" + kommentar, tidpunkt och läkarens namn
                 staffPortal.js:1502–1532 → staff-portal.html:4056
```

Båda har riktiga `fetch()`, inte hårdkodad HTML. Och behörigheten är rätt tänkt:
sköterskan behöver `customers.read`, inte `ordination.view`. Hon **ser** beslutet
utan att kunna **fatta** det.

### Checklistan före behandling finns också

`ccoReadyForTreatmentBuilder.js` räknar åtta punkter per kund — hälsodeklaration,
friskförsäkran, samtycke, avtal, ID-verifiering, betalning, journalanteckning,
eftervård. Och `ccoCommercialEconomics.js:10` räknar depositionen som 20 % av
accepterat pris.

Ägarens mening om offert → underlag → 20 % är alltså redan modellerad.

---

## De tre länkar som fattas

### 1 · Inga ärenden skapas

Det här är det stora, och allt annat hänger på det.

Ingen kodväg i produktion skapar ett booking case från en verklig bokning. De
369 verkliga ärendena ligger i en **annan** store — `cco-booking.json`,
`ccoBookingStore` — med oförenligt schema (`bookingCaseId` mot `id`,
`status: slots_ready` mot `state: qualifying`, noll fältöverlappning). Ingen av
de 369 matchar dessutom transplantationsmönstret.

Det finns alltså ingen äldre data att flytta in. Kedjan måste matas framåt.

### 2 · Ingen tröskel vid 20 %

Ägaren: _"betalar han 20 procent … efter det ska läkaren kunna se att kunden ska
göra en transplantation."_

Byggstenarna finns — checklistan och depositionsberäkningen — men ingenting
lyfter en kund in i läkarens kö när de är klara. Tröskeln är inte byggd.

### 3 · Avbokning släcker inte godkännandet

Ägaren: _"om kunden bokar av sin tid ska den delegeringen automatiskt försvinna."_

Det finns ingen sådan regel. `cancelBooking` (`ccoBookingEngineStore.js:2245`) rör
inte `ordinationReview`. Ett godkännande skulle ligga kvar som giltigt efter att
tiden avbokats — och sköterskan skulle se grön pill för en operation som inte
längre finns.

**Det här är den enda punkten där dagens läge kan visa fel för sköterskan.** De
andra två är tomhet; den här vore osanning.

---

## Två svagheter i det som redan finns

**Underlaget har ingen identitet.** Läkaren signerar mot ett ärende-_id_. Det
finns ingen hash, version eller innehållsreferens till det underlag hon faktiskt
läste. `treatmentPlan` kan ändras efter godkännandet utan att signaturen
invalideras. Eftersom ägarens flöde uttryckligen lägger godkännandet **efter**
att allt är klart, är en ändring efteråt just det fall som borde bryta
signaturen.

**"Kräver ordination" är en gissning.** `isTreatmentRequiringOrdination`
(`staffPortal.js:869–882`) matchar fritext med en regex:

```js
/tp|transplant|hårtransplant|dhi|fue|lokalbedöv/;
```

Den flaggar, den spärrar inte. Och en behandling som heter något annat missas
tyst. Vilka behandlingar som kräver läkargodkännande bör vara en egenskap på
tjänsten, inte ett mönster i en textsträng.

---

## Grinden

`ccoTreatmentBookingGate.js` kräver patientlänk, signerat behandlingsavtal,
operationsdagsfitness, utgången ångerfrist och ID-verifiering. Ordet
`ordination` förekommer **noll gånger** i filen — verifierat mot den deployade
koden.

En transplantation kan alltså bokas och genomföras med `ordinationReview: null`.

Men grinden ska **inte** sättas nu. Att grinda mot en tom store stoppar varenda
bokning omedelbart. Den hör hemma efter att ärenden faktiskt börjar skapas.

---

## Ordningen

```
1  ärenden skapas          vid bokningsbekräftelse — utan detta händer inget
2  tröskeln vid 20 %       klar checklista + deposition betald → läkarens kö
3  avbokning släcker       den enda punkten som annars kan visa fel
4  underlagets identitet   signaturen ska brytas om planen ändras
5  grinden                 sist, när storen har innehåll
```

---

## Vad som inte går att lösa med kod

- **Vad "underlaget" är.** Vilka dokument och fält ingår, och ska en ändring av
  behandlingsplanen efter godkännandet bryta signaturen? Kliniskt beslut.
- **Vilka behandlingar som kräver godkännande.** Regexen är en gissning.
- **Vad sköterskan får göra när godkännande saknas.** Hård spärr har
  verksamhetskonsekvenser, mjuk varning har patientsäkerhetskonsekvenser.
- **Om fritextsignaturen räcker.** Den är inte BankID och inte HSA-ID. Om det
  uppfyller kraven för ordination är en regulatorisk fråga.

---

## Oavgjort

- Om juli- och augustiarkiven av `auth.json` (1,0 GB respektive 654 MB) döljer
  ordinationsspår. September och nuvarande `auth.json` är rena och fullständigt
  skannade, och `cco-audit.jsonl` — dit ordinationshändelser faktiskt skrivs —
  är fullständigt skannad med noll träffar. Risken bedöms som mycket låg men
  inte noll.
- Om någon väg i `ccoBookingEngine.js` (1 600+ rader) skapar booking cases
  indirekt. `enforceTreatmentBookingGate` gör det inte.
