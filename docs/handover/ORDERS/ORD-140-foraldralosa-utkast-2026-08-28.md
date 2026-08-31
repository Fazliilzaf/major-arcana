# ORD-140 · Föräldralösa utkast och jobb när vårdepisoden tar slut

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`a5da22d0`)
**Föregås av:** ORD-139 §3b (utkastet skapas dag 0)
**Grind:** ORD-131 — ingenting raderas

---

## Bakgrund

Sedan ORD-139 skapas uppföljningsutkastet dag 0, med `dueAt` i framtiden.
Ett 12-månadersutkast ligger alltså i ett år.

Avbokas behandlingen eller avslutas vårdepisoden händer i dag **ingenting**
med utkastet eller jobbet. Båda blir hängande.

Mätt i repot:

|                     | Läge                                                   |
| ------------------- | ------------------------------------------------------ |
| `cancelJob`         | finns, `ccoAftercareSchedulerStore.js:394`             |
| Anropas från        | **endast** `server.js:5902` — en manuell REST-endpoint |
| `cancelBooking`     | finns, `ccoBookingEngineStore.js:2204`                 |
| Koppling mellan dem | **ingen**                                              |

---

## Läs det här först — annars bygger du något som ser ut att fungera

`ccoJournalStore.js:28`:

```js
const JOURNAL_STATUSES = Object.freeze(['draft', 'signed', 'corrected']);
```

`ccoJournalStore.js:265`:

```js
status: JOURNAL_STATUSES.includes(status) ? status : 'draft',
```

**`cancelled` finns inte i listan.** Sätter du status till `cancelled` i dag
faller den tyst tillbaka till `draft`. Inget fel kastas. Testet blir grönt,
loggen ser rätt ut, och utkastet ligger kvar som om ingenting hänt.

Det är den viktigaste raden i den här ordern.

---

## Uppgiften

### 1 · Den tysta fallbacken ska sluta vara tyst

Oberoende av allt annat i ordern: ett okänt status-värde ska **kasta**, inte
tyst bli `draft`. En anropare som skickar fel status ska få veta det.

Gör det först, i egen commit. Kör hela sviten efteråt — det är fullt möjligt
att något redan skickar in ett värde som i dag tyst rättas. Hittar du sådant:
rapportera det, laga inte i samma commit.

### 2 · Två triggers, inte en

De är inte samma sak:

- **Bokningen avbokas** — `cancelBooking`. Ett tillfälle bortfaller.
- **Vårdepisoden avslutas** — patienten avslutar, byter klinik, avlider.
  Allt framtida bortfaller.

Behandla dem var för sig. En avbokad tid betyder inte att uppföljningen ska
bort — behandlingen kan redan vara gjord.

### 3 · Stäng — radera inte

Grinden från ORD-131 gäller: **ingenting raderas.** Journalföringsplikt,
Patientdatalagen, ≥ 10 år.

**Jobbet:** `cancelJob` med orsak. `JOB_STATUSES` innehåller redan
`cancelled` (rad 20), så där finns ingen fallback-fälla.

Men `cancelJob` kastar 409 om jobbet inte är `queued` (rad 397). Ett redan
skickat jobb ska inte få hela avbokningen att fallera. Hantera det — och
skriv i rapporten hur.

**Utkastet:** här ska du välja, och skriva ned varför:

- **A · Lägg till `cancelled` i `JOURNAL_STATUSES`.** Enklast att läsa. Men
  det utökar journalens tillståndsmodell, och varje ställe som läser
  `status` måste klara det fjärde värdet — bland annat `canSign` på rad 411.
- **B · Låt statusen vara, markera annorlunda** — ett eget fält med orsak och
  länk till händelsen. Rör inte journalens tillstånd.

Jag lutar åt **B**. `draft`, `signed`, `corrected` är journalens juridiska
lägen; "besöket blev inte av" är administrativt och hör inte hemma i samma
uppräkning. Men avgör själv och motivera — säg emot om du ser något jag
missat.

Oavsett val: utkastet ska förbli **synligt men inaktivt**, bära orsak och
peka på den händelse som stängde det.

### 4 · Kopplingen

Avboknings- och avslutsflödet ska anropa stängningen. Det är den saknade
länken — `cancelJob` finns men når bara en manuell endpoint.

Skickar inte iväg något. Stänger bara.

---

## Godkänt när

1. Okänt journal-status kastar. Egen commit, hela sviten körd efteråt.
2. Avbokning stänger utkast **och** jobb. Ett test.
3. Avslutad vårdepisod stänger allt framtida. Ett eget test.
4. Ett redan skickat jobb får inte avbokningen att fallera. Ett test.
5. **Ingenting raderas.** Ett test som räknar poster före och efter och visar
   samma antal.
6. Ett stängt utkast går inte att signera.
7. Mutationstesta: ta bort kopplingen från avbokningsflödet och visa att ett
   test blir rött. Utan det vet vi inte att kopplingen testas.
8. `CCO_SEND_LIVE` orörd.

## Vad jag inte avgjort

**Om en avbokad tid ska stänga uppföljningen.** Är behandlingen gjord ska den
troligen ligga kvar. Är den inte gjord ska den troligen bort. Det beror på om
vårdepisoden fortsätter — och det är en klinisk bedömning, inte en
kodregel. Bygg så att båda utfallen går att välja, och fråga Fazli innan ett
av dem blir förval.

> **AVGJORD 2026-09-01.** Frågan ställdes aldrig när §4 byggdes, och tystnaden
> kostade tre dygn: koden valde ett förval (flagga), testet ett annat (stäng),
> och modulens egen docstring hävdade ett tredje. Två röda tester sedan
> 2026-08-29 var symtomet.
>
> Fazli, på frågan om vad som ska hända med uppföljningstider när en behandling
> avbokas och aldrig blev av:
>
> > **"Låt dem ligga, flagga för personal."**
>
> Skälet: patienten kan boka om nästa vecka, och då gäller uppföljningen
> fortfarande. Den bedömningen ska en människa göra, inte avbokningsrutten.
>
> **Fall B stänger alltså ingenting.** Bara fall A (uppföljningstiden själv
> avbokas) stänger, och bara det enskilda tillfället. B och C flaggar.
> Docstringen i `ccoFollowUpCancellation.js`, kommentaren i
> `ccoBookingEngine.js` och båda §7-testerna speglar nu beslutet.
