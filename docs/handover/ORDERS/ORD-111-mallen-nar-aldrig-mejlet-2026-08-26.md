# ORD-111 · Mallen når aldrig mejlet

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-110

---

## Vad jag hittade när Fazli ville ändra malltexten

Fazli läste `followup_fue_4m` och `followup_fue_8m`, godkände tonen och
bad om en variabel för behandlingstypen — hårtransplantation,
ögonbrynstransplantation, skäggtransplantation — samt att det ska gå att
**fylla i variabler manuellt**.

Innan jag skrev om texten kontrollerade jag att systemet kan ersätta
variabler. Det kan det inte. Och det är inte hela problemet.

### Mallen används aldrig för att bygga meddelandet

`src/ops/ccoAftercareSchedulerStore.js:331` anropar `performSend`:

```js
const result = await sendStore?.performSend?.({
  kind: 'aftercare',
  payload: {
    jobId, jobKind, templateRef, channel,
    customerId, customerName, customerEmail, customerPhone,
    treatmentKey, encounterId,
  },
  …
});
```

Ingen `subject`. Ingen `html`. Ingen `text`.

`src/ops/ccoSendActionStore.js:350` och `:385`:

```js
const subject = normalizeText(payload.subject) || '(utan ämne)';
…
result = await mailer.sendEmail({
  to,
  subject,
  html: payload.html,      // undefined
  text: payload.text,      // undefined
  attachments: payload.attachments,
});
```

`templateSnapshot` hämtas på rad 354 och sparas på sändposten som
metadata — men det **används aldrig** för att bygga meddelandet.

**Följd om det gick skarpt: ämnesrad "(utan ämne)" och tom brödtext.**
Malltexten ligger bredvid, orörd.

Att ingen märkt det beror på att `CCO_SEND_LIVE` inte är satt, så
`isDryRunDefault()` returnerar true och ingenting skickas.

### Ingen variabelsubstitution finns

`snapshotForSend` (`ccoTemplateRegistry.js:342`) returnerar
`revision.body` ordagrant. Ingen ersättning någonstans i vägen.

De befintliga mallarna använder redan **tjugo** variabler:
`firstName`, `treatment`, `treatmentName`, `serviceName`, `bookingDate`,
`graftsPlanned`, `donorArea`, `cancelLink`, `priceTotal` och fler. Ingen
av dem ersätts.

Det som finns är två halvor som inte möts:

- `src/capabilities/optimizeVariables.js:19` — `extractVariablesFromContent`
  **plockar ut** variabelnamn ur en text. Ersätter inget.
- `src/capabilities/prepareResponseDrafts.js:44` — ersätter exakt två
  namn, hårdkodat: `{{first_name}}` och `{{clinic_name}}`.

**Och de använder olika konvention.** Mallarna i registret är camelCase
(`firstName`), `prepareResponseDrafts` är snake_case (`first_name`).
Ingen av dem matchar den andra.

### Skägg och ögonbryn får inga uppföljningar alls

`config/cco-treatment-document-requirements.json` har tretton
behandlingsnycklar:

```
fue  dhi  prp_hair  microneedling_hair  trichoscopy  botox  filler
bleph  prp_skin  mesotherapy  profhilo  fat_dissolving  orthopedics_prp
```

**Ingen `beard`. Ingen `eyebrow`.** Bokningsmotorn har tjänsterna
(`beard`, `eyebrow`, båda `active=true` i produktion), men eftervården
känner inte till dem. De behandlingarna får alltså inga
uppföljningsjobb, och Fazlis text om skägg- och ögonbrynstransplantation
skulle aldrig gå ut.

---

## Uppgift 1 — rendera mallen till meddelandet

Bygg en renderare och koppla in den i aftercare-vägen så att
`subject`, `html` och `text` faktiskt kommer från mallens revision.

Var den ska ligga är ditt val, men den ska vara **en** funktion som både
aftercare och framtida vägar kan använda. Lägg den inte i
`ccoSendActionStore` — den store:n ska ta emot ett färdigt meddelande,
inte bygga det.

**Hårt krav:** `performSend` ska aldrig skicka skarpt när `subject` eller
kroppen är tom. Idag faller `subject` tillbaka på `'(utan ämne)'` och
kroppen på `undefined`, och det passerar. Gör det till ett fel som
stoppar sändningen och loggar orsaken.

---

## Uppgift 2 — variabelsubstitution, med manuell ifyllning

Fazli har uttryckligen bett om att kunna sätta variabler för hand. Bygg
båda vägarna:

**Automatiskt.** Värden som systemet redan har fyller sig själva.
`treatmentKey` finns i aftercare-payloaden, `customerName` likaså.
Kartlägg vilka av de tjugo variablerna som går att hämta ur befintlig
data och vilka som inte gör det.

**Manuellt.** Den som skickar ska kunna se vilka variabler en mall
innehåller och fylla i dem. `extractVariablesFromContent` i
`optimizeVariables.js:19` gör redan uttagningen — återanvänd den, skriv
den inte igen.

**Ena konventionen.** Registrets mallar är camelCase. `prepareResponseDrafts`
är snake_case. Välj camelCase, eftersom tjugo mallar redan använder den
och två hårdkodade rader inte gör det. Migrera `prepareResponseDrafts`
till samma renderare.

**En variabel utan värde får aldrig gå ut som `{{namn}}` till kund.**
Antingen fylls den, eller så stoppas utskicket och den som skickar får
veta vilken som fattas. Bestäm vilket och skriv varför i koden.

---

## Uppgift 3 — lägg till beard och eyebrow i kadensen

Samma kadens som `fue` och `dhi`: `["4m", "8m", "12m"]`.

Kolla samtidigt om fler tjänster i bokningsmotorn saknar motsvarighet i
kadenskonfigen. Bokningsmotorns katalog och
`cco-treatment-document-requirements.json` är två listor som ska
motsvara varandra och uppenbarligen inte gör det.

Lägg **inte** till mallar för dem än — det är uppgift 4.

---

## Uppgift 4 — mallarna, efter Fazlis beslut

Behandlingstypen kan komma in på två sätt, och systemet har redan valt
det ena åt oss:

Referensen byggs som `followup_${treatmentKey}_${offset}`
(`ccoAftercareSchedulerStore.js:156`). Alltså `followup_fue_8m`,
`followup_dhi_8m`, `followup_beard_8m`. **Behandlingen avgör redan
vilken mall som plockas.**

| Väg                              | Innebär                            | Antal mallar                           |
| -------------------------------- | ---------------------------------- | -------------------------------------- |
| **A · Egen mall per behandling** | Behandlingen skrivs ut i texten    | 4 behandlingar × 3 tillfällen = **12** |
| **B · Delad mall med variabel**  | `{{treatment}}` fylls vid sändning | 3, men kräver uppgift 2                |

Fazli lutar åt variabel. Fråga honom innan du skapar mallarna — och
skapa dem via `POST /api/v1/cco-templates`, aldrig i filen.

Godkänd text för 8 månader, hans formulering med två rättelser
(subjektet saknades, och "brukar" i stället för att slå fast):

> Hej {{firstName}},
>
> Åtta månader sedan din {{treatment}} — vid det här laget brukar
> återväxten ta form. Vi ser fram emot din uppföljning.
>
> Hair TP Clinic

---

## Test som ska finnas när du är klar

Tre, och de ska vara mutationsprövade — ändra tillbaka och visa att de
blir röda:

1. **Ett utskick utan brödtext går inte iväg.** Anropa `performSend`
   utan `html`/`text` och kontrollera att det stoppas, inte skickas som
   tomt.
2. **Malltexten når meddelandet.** Ett aftercare-jobb med en känd mall
   ger ett meddelande vars ämne och kropp kommer från mallens revision.
3. **`{{namn}}` går aldrig ut ofyllt.** En mall med en variabel utan
   värde stoppas eller fylls — enligt vad du bestämde i uppgift 2 — men
   passerar aldrig rå.

---

## Gränser

- Rör inte `CCO_SEND_LIVE`. Den ska förbli osatt tills Fazli säger till.
  Allt arbete här sker i dry-run.
- Skriv inte i `data/` för hand.
- Ändra ingen malltext utan Fazlis godkännande. Texten ovan är godkänd;
  4-månadersvarianten är det inte än.
- Ingen CMO-kod. Inga hemligheter i repo. En gren. Svenska
  commit-meddelanden som förklarar _varför_.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

**Om testsviten.** Din förra rapport sa "6813 tester, exit 0". Jag körde
om den: **7 236 tester, 7 235 gröna, 1 rött, exit 1**. Både antalet och
utfallet var fel — sannolikt en avbruten körning som rapporterades som
klar.

Det röda var inte ditt: `tests/ops/caoPhaseE.test.js` väntar 30 ms på en
asynkron diskskrivning och hinner inte under full svit. Sex isolerade
körningar: sex gröna. Flakigt, inte trasigt.

**Rapportera det verkliga talet nästa gång, även när det är obekvämt.**
Ett felaktigt "allt grönt" är dyrare än ett ärligt "en flakig röd".
