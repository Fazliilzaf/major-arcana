# ORD-87 — 41,5 Mkr vunna affärer finns per kund men aggregeras aldrig

| | |
|---|---|
| **Bas-commit** | `ab401504` (origin/main, 2026-07-28) |
| **Ägare** | Cowork |
| **GO** | väntar Fazli |
| **Föregångare** | Pipedrive prod-länkning 2026-06-10 (3 413 länkade, 3 664 matchade), UI-integration PR #112 |
| **Ordernummer** | ORD-87. Se numreringsnoten i ORD-86 — ORD-80 och ORD-84 saknar orderfiler. |

## Bas och observation

**Kodmiljö:** worktree på `ab401504`.
**Datakälla:** `scripts/audit-kunder-ltv-sources-prod.js` mot prod, ägar-API.

| Påstående | Fönster | Stabilt? | Belägg |
|---|---|---|---|
| 41 489 801 kr vunna affärer, 726 kunder | ett svep över hela registret | ja | audit-skriptets summering |
| Registret har 7 451 aktiva identiteter | samma svep | ja | `listPatients` / UI-räknare |
| `getTenantStats` saknar intäktsfält | statisk läsning | ja | `ccoPatientMasterStore.js:1503–1521`, elva fält, inget om pengar |
| `lifetimeValue` beräknas per kund | statisk läsning | ja | `ccoPatientMasterStore.js:703` via `sumPipedriveWonDeals` (rad 616) |
| `lifetimeValue` renderas per kundkort | statisk läsning | ja | `patient-master-ui.js:6111`, `7202` |

## Vad som faktiskt saknas

Det här är **inte** ett saknat beräkningssteg. Per kund är allt på plats:

```js
// ccoPatientMasterStore.js:616
function sumPipedriveWonDeals(pipedrive) { … }   // summerar vunna affärer

// ccoPatientMasterStore.js:703
lifetimeValue: pipedriveWon.total > 0 ? pipedriveWon.total : null,
lifetimeValueLabel: pipedriveWon.wonCount > 0 ? `${pipedriveWon.wonCount} vunna affärer` : null,
```

Och klienten visar det, `patient-master-ui.js:7202`.

Det som saknas är **ett led högre upp**. `getTenantStats` returnerar elva fält — antal
patienter, hur många som har personnummer, matchningsstatus, arkiverade, importer — och
inte ett enda om pengar. 41,5 Mkr finns i registret, beräknas korrekt per rad, visas på
varje kundkort, och slutar sedan där. Ingen yta summerar dem.

Det gör att frågan "vad är en kund värd" inte går att svara på i produkten, trots att
svaret redan är uträknat 726 gånger.

## Nämnaren — beslutad av Fazli

**Hela registret, 7 451 aktiva identiteter.** Inte de 726 med vunna affärer.

41 489 801 / 7 451 = **5 568 kr** i genomsnittligt livstidsvärde per kund.

Det är den ärliga siffran. 726 som nämnare hade gett 57 149 kr, vilket besvarar en annan
fråga — "vad är en kund med minst en vunnen affär värd" — och som nyckeltal på en
översiktsyta hade den varit missvisande. Skillnaden är tiofaldig, så valet av nämnare får
inte vara implicit.

**Krav:** nämnaren ska stå utskriven i UI:t, inte bara i koden. `5 568 kr · snitt över
7 451 kunder`, inte ett ensamt `5 568 kr`.

## Uppgift

**Steg 1 — aggregatet i `getTenantStats`.**
Tre fält: summa vunna affärer, antal kunder med minst en vunnen affär, och nämnaren
(antal aktiva identiteter — finns redan som `totalPatients`).

Beräknas i **samma pass** som de befintliga elva fälten. `getTenantStats` går redan
igenom `bucket.patients` sju gånger med `.filter()`; lägg inte till ett åttonde svep.
Det är samma mönster som ORD-82 och ORD-85 handlade om — en invariant som räknas om i en
loop — och det vore olyckligt att införa ett nytt i samma vecka som fem togs bort.

**Steg 2 — exponera i API:t** där `getTenantStats` redan konsumeras. Inget nytt endpoint.

**Steg 3 — visa i Översikt**, inte i Studion. Media och kampanj hör hemma i Studion;
det här är ett beslutsunderlag och ska ligga på beslutsytan. Följ befintlig
sektionsdesign exakt — ingen ny design, inga nya färger.

## Krav

- **Sök befintligt först.** `renderPipedriveSection` och LTV-visning finns redan i
  `patient-master-ui.js`. Grep:a båda ytorna innan något nytt skrivs. Halvbyggda hooks
  räknas som byggt.
- Nämnaren ska synas i UI:t, se ovan.
- Ett test som låser att aggregatet är summan av per-kund-värdena. Om `sumPipedriveWonDeals`
  ändras ska aggregatet följa med, inte glida isär.
- Ett test för nämnaren: 726 som nämnare ska falla.
- Inget nytt svep över `bucket.patients`.

## Vad som INTE ingår

- Prognoser, trend eller segmentering på LTV. Först ska talet visas.
- Fortnox-intäkt. Den är en annan källa och redan live i CP (ORD-58).
- Att ändra `sumPipedriveWonDeals` eller `parseDealValue`. De är verifierade mot
  prod-data och rörs inte i den här ordern.

## Osäkerhet som ska bäras vidare

De 726 är de kunder som fått en Pipedrive-koppling. Namn-fallbacken skapar
`needs_review`-**förslag** och länkar aldrig automatiskt, så 41,5 Mkr är ett **golv**,
inte ett facit: kunder vars affärer aldrig matchats saknas i summan. Det ska framgå av
ordern och helst av UI:t, annars läses talet som fullständigt.
