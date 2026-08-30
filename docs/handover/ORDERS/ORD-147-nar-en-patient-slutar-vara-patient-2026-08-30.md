# ORD-147 · När en patient slutar vara patient

**Arbetsorder · 2026-08-30**
**Bas:** `main` (`df49292f`)
**Föregås av:** ORD-140 (stängningsmekanismen), ORD-139 (kadensen), ORD-131 (ingenting raderas)

---

## Först: ordet fanns inte

ORD-140 §3 sa "avslutad vårdepisod stänger allt framtida". Agenten frågade
vad som utlöser det. Jag letade i repot:

```
"vårdepisod"            → bara i ORD-135, 139, 140. Mina egna ordrar.
"avliden" / "deceased"  → noll träffar i hela repot.
"patientöverföring"     → noll som regel.
```

**Termen var min.** Jag införde ett begrepp utan att något i systemet bar
det, och lämnade sedan agenten att gissa vad det betydde. Det här är
ordern som ger det innehåll.

Fazli, 2026-08-30: alla tre orsakerna gäller. Vi börjar med **avliden**.

---

## Läs det här först — mekanismen finns redan

ORD-140 byggde alternativ B. Bygg den inte igen.

```
ccoJournalStore.js:297   closedAt
ccoJournalStore.js:298   closedReason
ccoJournalStore.js:299   closedByUserId
ccoJournalStore.js:300   closedByEventId
```

```
ccoFollowUpCancellation.js:21    decideFollowUpAction
ccoFollowUpCancellation.js:48    resolveBookingCancellation
ccoAftercareSchedulerStore.js:20 JOB_STATUSES … 'cancelled'
```

Utkast stängs utan att röra journalens juridiska status. Jobb avbokas med
orsak. Allt det fungerar.

**Det som saknas är utlösaren.** Modulen har exakt en anropare:

```
src/routes/ccoBookingEngine.js   ← avbokning av en tid
```

Avbokad tid stänger. Avslutad vård gör det inte, för ingenting kan säga
att vården är avslutad.

---

## Uppgiften

### 1 · Ett livscykelläge på patienten

Patienten har i dag `status` (`ccoPatientMasterStore.js:189`) som läses in
från extern källa (`safe.Status`), och `matchStatus: 'merged'` för
sammanslagningar. Ingetdera är det här.

Lägg ett **eget** fält för vårdrelationens läge. Det ska bära:

- vilken orsak som stängde (se punkt 2)
- när
- vem som satte det
- fritext för anteckning

Blanda inte ihop det med `status` från importen. Skriv i rapporten vilket
namn du valde och varför det inte kan förväxlas.

### 2 · Tre orsaker, olika beteende

De är inte utbytbara. Beteendet skiljer sig, och det är hela poängen.

| Orsak | Framtida åtgärder | Utskick | Går att ångra |
| ----- | ----------------- | ------- | ------------- |
| **Avliden** | stängs | **blockeras helt** | nej, inte av personal |
| **Bytt vårdgivare** | stängs | blockeras | ja |
| **Admin-stängning** | stängs | blockeras | ja |

**Bygg avliden först och ensam.** Den har den allvarligaste konsekvensen
om den saknas. De två andra i egna commits efteråt.

### 3 · Utskicksblockeringen är orderns viktigaste rad

Ett SMS eller mejl till en avliden patient är det värsta systemet kan
göra. Värre än en tom sektion, värre än en tappad bokning.

Blockeringen ska sitta vid **sändgränsen**, inte i gränssnittet. En yta
som råkar sluta visa knappen är ingen spärr — nästa schemalagda jobb går
ändå iväg.

Hitta var jobben faktiskt skickas och lägg spärren där. Skriv i rapporten
vilken rad du valde och varför den är den sista gemensamma punkten.

`CCO_SEND_LIVE` är fortsatt `false` och rörs inte. Spärren ska ändå
byggas — den ska hålla den dagen grinden öppnas, inte upptäckas då.

### 4 · Använd stängningen som finns

När en orsak sätts: anropa den befintliga vägen för varje framtida jobb
och utkast. Ny kod ska bara vara utlösaren och orsaken — inte en andra
implementation av stängning.

`resolveBookingCancellation` är byggd för ett tillfälle. Vård som avslutas
gäller allt framtida. Avgör om du breddar den eller lägger en ny ingång
bredvid, och motivera valet.

### 5 · Ingenting raderas

Grinden från ORD-131 gäller oförändrat. Journalföringsplikt,
Patientdatalagen, ≥ 10 år.

`docs/legal/pdl-mdr-assessment.md:39` och
`docs/strategy/CONSENT-AGREEMENT-AFTERCARE-FLOW.md:291` säger samma sak:
journaldata vilar på vårdgivarens rättsliga skyldighet, inte på samtycke.
En avslutad vårdrelation ändrar ingenting i det.

---

## Godkänt när

1. Livscykelfältet finns, skilt från `status` och `matchStatus`. Ett test
   som visar att de inte skriver över varandra.
2. **Avliden blockerar utskick vid sändgränsen.** Ett test som köar ett
   jobb, markerar patienten avliden, kör sändaren och visar att ingenting
   går iväg.
3. Mutationstesta punkt 2: ta bort spärren och visa att testet blir rött.
   Det här är den enda punkten där ett grönt test utan mutationstest inte
   duger.
4. Framtida jobb och utkast stängs via ORD-140:s väg. Sök och visa att
   ingen andra stängningsimplementation tillkommit.
5. **Ingenting raderas.** Ett test som räknar poster före och efter.
6. Bytt vårdgivare och admin-stängning går att ångra. Avliden gör det
   inte. Ett test per fall.
7. Avliden i egen commit, före de andra två.
8. `CCO_SEND_LIVE` orörd.

---

## Vad jag inte avgjort

**Hur systemet får veta att någon avlidit.** Manuell markering av
personal, eller från folkbokföringen? Det är en fråga om
personuppgiftsbehandling och integration, inte om kod. Bygg den manuella
vägen nu och lämna en tydlig ingång för en framtida automatisk källa.

**Vem som får sätta avliden.** Den går inte att ångra av personal, vilket
gör den till en behörighetsfråga. Fråga Fazli innan du väljer roll.

**Vad som händer med en pågående offert.** En osignerad offert till en
avliden patient ska rimligen inte ligga kvar och löpa ut av sig själv.
Men det gränsar till ORD-146:s reservationsfråga, som fortfarande väntar
på svar. Rör den inte här.
