# ORD-84 — Journeyn byggd en gång per tråd i stället för per uppslag

| | |
|---|---|
| **Bas-commit** | byggd på `4416ffbe`, mergad, ommätt på `ab401504` |
| **Ägare** | Cowork |
| **Status** | **BYGGD OCH MERGAD** — orderfilen skriven i efterhand 2026-07-28 |
| **Föregångare** | ORD-81 (`630509bc`), ORD-82 (`a2053cc5`), ORD-83 (`4416ffbe`) |

> **Protokollnot.** Den här filen saknades. ORD-84 byggdes, granskades och mergades utan
> att någon order skrevs, tvärtemot handover-protokollet. Den skrivs nu för att
> mätningen ska ha en plats, och för att luckan ska synas i stället för att tystna.
> `ORD-80` saknas fortfarande — se ORD-86.

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

## Falsifiering som ska stå kvar

**Redundansfaktorn 13 reproducerades inte.** Uppmätt här: **6,66** uppslag per bygge på
full köyta, 5,30 på en filtrerad. Memon tar bort 100 % av det redundanta arbetet — men i
den här interaktionen var redundansen 6,66×, inte 13×.

Trettonsiffran kom från ett annat pass, sannolikt boot-renderingen, och den mätningen
gäller för sitt fönster. Det som **inte** går att säga är "ORD-84 tog bort 13×". Det som
går att säga är: kvoten byggen per tråd är 1,000 i alla observerade pass, och 84,7 % av
uppslagen (7 592 av 8 962) serverades ur memon i stället för att byggas om.

## Tester

`tests/public/ccoJourneyPerPass.test.js` — 7 tester. Låser att memon är per pass, att den
är nycklad på objektidentitet, och att fallbacken utan pass fortfarande bygger.
