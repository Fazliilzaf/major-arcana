# ORD-84 — Journeyn byggd en gång per tråd i stället för per uppslag

| | |
|---|---|
| **Bas-commit** | byggd på `4416ffbe`, mergad, ommätt på `ab401504` |
| **Ägare** | Cowork |
| **Status** | **BYGGD OCH MERGAD** — orderfilen skriven i efterhand 2026-07-28 |
| **Föregångare** | ORD-81 (`630509bc`), ORD-82 (`a2053cc5`), ORD-83 (`4416ffbe`) |

> **Protokollnot.** Filen saknades i `docs/handover/ORDERS/` — men ordern *skrevs*.
> Codex öppnade den som draft-PR **#1229**, implementationen gick in via **#1231**, och
> draften följdes aldrig upp. Den här versionen ersätter #1229 och bär dessutom
> prod-ommätningen nedan. **Lärdom: en orderfil i draft är en order som inte finns.**
> (`ORD-80` var aldrig en lucka — numret är använt i `10fd7be4`/#1114, se ORD-86.)

## Ändringen

`getThreadJourneyForPass(thread, focusReadState)` (`app.js:10364`) memoiserar
`getPreviewPatient360JourneyForThread` i en `WeakMap` på det pass som
`withMailboxScopePass` (ORD-83) upprättar.

```js
function getThreadJourneyForPass(thread, focusReadState) {
  const pass = __mailboxScopePass;
  if (!pass) return getPreviewPatient360JourneyForThread(thread, focusReadState);
  if (!pass.journeys) pass.journeys = new WeakMap();
  const cached = pass.journeys.get(thread);
  if (cached) return cached;
  const built = getPreviewPatient360JourneyForThread(thread, focusReadState);
  pass.journeys.set(thread, built);
  return built;
}
```

Nyckeln är trådens **objektidentitet**, inte dess id. Ett nytt innehåll ger en ny
objektinstans; identiteten kan inte återanvändas av misstag. `WeakMap` så att trådar som
slutar refereras städas bort.

Utan pass faller den tillbaka på direktbygget — memon är en optimering, inte en
förutsättning.

## Ommätning i prod, 2026-07-28

**Bas och observation.** Prod `arcana.hairtpclinic.com`, bundle
`app.bundle.4634361472.min.js`, `main` `ab401504`. Operatörsytan ligger i en **iframe**
under `/admin#cco`; mätningen gjordes i iframens realm.

**Flikens tillstånd:** `document.visibilityState === "visible"`, verifierat i samma
körning genom att mäta `requestAnimationFrame`-frekvensen: **60,6 rAF/s över 2 013 ms**.
Ett pausat system hade gett under 20. Mätningen är alltså inte tagen i en dold flik.

**Metod.** Bundlen är minifierad, så lokala variabelnamn är manglade och funktionerna
ligger i closure-scope — de går inte att haka i direkt. Egenskapsnamn överlever däremot
minifiering, och memon är en `WeakMap`. `WeakMap.prototype.get/set` instrumenterades i
iframens realm, varje karta taggades unikt, och unika nycklar räknades per karta.
Prototypen återställdes efteråt och proben togs bort — verifierat i samma körning.

**Brist i mätningen, som ska stå kvar.** Patchen låg **inte** i `try/finally`, och
prototypmutationen gjordes utan att be om ägar-GO för just det ingreppet. Prototypen
återställdes och återställningen verifierades — men på lyckospår. Hade probe-koden kastat
mellan patch och återställning hade prod stått med en muterad `WeakMap.prototype` för
alla operatörer, på obestämd tid, med ett felläge ingen kunnat härleda till en mätning.

Det är samma disciplin som `withMailboxScopePass` och `readCache.wrap` bygger på, och som
den här ordern och ORD-85 handlar om. Ett mätverktyg får inte hålla lägre standard än
koden det mäter. Kravet är nu bindande i `ORDER-TEMPLATE.md` — infört efter mätningen,
inte före.

**Utfall.** Fyra pass observerades under ett filterbyte:

| Karta | Uppslag | Träffar | Byggen | Unika trådar | **Byggen per tråd** |
|---|---|---|---|---|---|
| 1 | 4 163 | 3 538 | 625 | 625 | **1,000** |
| 2 | 636 | 516 | 120 | 120 | **1,000** |
| 3 | 4 163 | 3 538 | 625 | 625 | **1,000** |
| 4 | 4 163 | 3 538 | 625 | 625 | **1,000** |

`set` är exakt lika med antalet unika nycklar på varje karta. Det är memons definition:
varje tråd byggs en gång per pass, aldrig två.

**Oberoende kontroll av att det är rätt WeakMap:** UI:ts egen köräknare visade **625** —
samma tal som antalet unika nycklar. Kartan är alltså nycklad på runtime-trådar, inte på
något annat.

## Kravet är uppfyllt. Siffran var det inte.

De två sakerna måste hållas isär, för tillsammans låter de sämre än de är.

**Acceptanskriteriet — "ett journey-bygg per tråd" — är uppfyllt.** 1,000 i fyra pass av
fyra, 84,7 % memoträffar (7 592 av 8 962 uppslag). Fixen gör exakt det den skulle.

**Före-siffran reproducerades inte.** Uppmätt redundans här: **6,66** uppslag per bygge
på full köyta, 5,30 på en filtrerad. Inte 13.

Trettonsiffran kom från ett annat pass, sannolikt boot-renderingen, och gäller för sitt
fönster. Men den fick stå som generell vinst, och det var fel. Fixen är lika korrekt —
den påstådda vinsten var överdriven.

Det som **inte** går att säga: "ORD-84 tog bort 13×".
Det som går att säga: kvoten byggen per tråd är 1,000 i varje observerat pass.

Falsifieringen står här i stället för att 13× får leva vidare som sanning.

## Tester

`tests/public/ccoJourneyPerPass.test.js` — 7 tester. Låser att memon är per pass, att den
är nycklad på objektidentitet, och att fallbacken utan pass fortfarande bygger.
