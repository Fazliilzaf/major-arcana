# ORD-159 · Betänketiden säger tre olika saker om samma ingrepp

**Arbetsorder · 2026-09-01**
**Bas:** `main` (`f916bf6b`)
**Föregås av:** ORD-129 (ögonlocksplastik är kirurgi), ORD-157 §2 (avtalet rättat till sju dagar), `1bb5e9de`
**Grind:** `CCO_SEND_LIVE` är `false` — ingen patient har fått fel i dag
**Prioritet:** P1 — måste vara löst innan `CCO_SEND_LIVE` slås på

---

## Fyndet

Ögonlocksplastik får tre olika betänketider beroende på var man läser.

```
avtalet patienten signerar     sju (7) dagar     rättat 2026-09-01, ORD-157 §2
kundkortets flöde              ingen alls        minorSurgery hoppar över steg 6
backend, coolingOffEndsAt      två (2) dagar     HAIR_TP_COOLING_OFF_DAYS
```

Avtalet är det juridiskt bindande. De två andra är systemet som ska
verkställa det.

---

## Uppmätt

### 1 · Flödet hoppar över steget

`public/major-arcana-preview/app/cco-kundkort-kkx.js`

```js
var STEP_VARIANTS = {
  minorSurgery: {
    6: { skip: true, note: 'Mindre ingrepp — ingen betänketid' },
    8: { title: 'Friskförsäkran', when: 'behandlingsdagen' },
  },
};

var TREATMENT_TYPE_VARIANT_HINTS = {
  bleph: 'minorSurgery',
  ögonlock: 'minorSurgery',
  ogonlock: 'minorSurgery',
};
```

Steg 6 är betänketiden — samma fil, rad 611: `cooling_off_active` /
`cooling_off_passed`.

ORD-129 klassade ögonlocksplastik som `minorSurgery` för att den **skulle
få** friskförsäkran på steg 8. Det var rätt. Men varianten bar redan
`6: skip` med noten "Mindre ingrepp — ingen betänketid", och den följde med
på köpet. Ingen hade fel; två riktiga beslut möttes i en variant.

### 2 · Backend känner bara till två dagar

`src/ops/ccoHairTpCoolingOffPolicy.js`

```js
const HAIR_TP_COOLING_OFF_DAYS = (() => {
  const raw = Number(process.env.CCO_HAIR_TP_COOLING_OFF_DAYS);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 30) return Math.floor(raw);
  return 2;
})();
```

Modulen heter `HairTp`, men den är den enda som finns. `ccoCommercialStore.js:885`
använder den för **varje** ärende:

```js
coolingOffEndsAt: new Date(
  Date.parse(nextOpen.ts) + HAIR_TP_COOLING_OFF_DAYS * 24 * 60 * 60 * 1000
).toISOString(),
```

Ingen kontroll av varumärke. Ingen kontroll av om behandlingen är kirurgi.

```
$ git grep -nE "coolingOffDays.*7|SURGERY_COOLING|sju dagar" src/
→ inga träffar
```

Sju dagar finns inte i koden.

### 3 · Avtalet säger sju

`offert_op` bär sedan `1bb5e9de` Nordbros sjudagarsmening, teckenidentiskt,
och `tests/ops/betanketidMotNordbro.test.js` mäter det mot källfilen.

---

## Varför ingen patient drabbats

`CCO_SEND_LIVE` är `false` i prod, verifierat mot `/api/v1/_diag/env`
2026-09-01. De kommersiella sändvägarna är grindade
(`tests/ops/ccoDriftPathsNotGated.test.js` mäter att driftvägarna INTE är
det). Ingen offert med fel betänketid har gått ut.

Det gör det här till en order som ska vara klar **före** `CCO_SEND_LIVE`,
inte en incident.

---

## Uppgiften

### 1 · Betänketiden ska följa behandlingen, inte varumärket

Lag 2021:363 skiljer på ingreppstyp:

```
kirurgiskt ingrepp        sju (7) dagar
injektionsbehandling      två (2) dagar
```

Modulen heter i dag `ccoHairTpCoolingOffPolicy` och antar ett varumärke.
Ögonlocksplastik utförs på Curatiio och kräver sju; Hair TP:s
transplantationer är inte kirurgi i lagens mening och har två. **Varumärket
är fel axel.** Byt till behandlingstyp.

Härled typen ur samma källa som resten av systemet redan använder —
`ccoServiceDocumentMap.harledGrupp` känner igen `ogonlocksplastik` — hellre
än att införa en ny lista som ska hållas synkad.

### 2 · Flödet ska visa steget för kirurgi

`minorSurgery` behöver delas. Friskförsäkran på steg 8 ska vara kvar;
`6: skip` ska bort för ögonlocksplastik.

Om någon annan behandling verkligen ska sakna betänketid, ge den en egen
variant med ett eget namn och en egen motivering. Skriv inte om noten så att
den låter rätt — mät vilka behandlingar som faktiskt bär varianten först.

### 3 · Ett test som binder ihop de tre lagren

Det som saknades var aldrig en kontroll av något av lagren för sig. Alla tre
var interna konsistenta. Det som saknades var en kontroll av att de säger
**samma sak**.

Testet ska läsa betänketiden ur avtalet (`offert_op`, mot Nordbros källfil
som `betanketidMotNordbro` redan gör), ur policyn, och ur flödesvarianten —
och faila när de skiljer sig.

### 4 · Lagrade ärenden rörs inte

ORD-153 §4 gäller: `coolingOffEndsAt` på signerade och arkiverade ärenden
skrivs inte om. En ny policy gäller nya ärenden. Att retroaktivt förlänga en
betänketid som redan löpt ut ändrar inget för patienten men gör historiken
osann.

---

## Fällan

**Ändra inte bara siffran till 7.** Då får injektionsbehandlingar sju dagars
betänketid, vilket är fel åt andra hållet och försenar varje botoxbokning med
fem dagar.

**Ta inte bort `minorSurgery` för att lösa steg 6.** Då förlorar
ögonlocksplastiken friskförsäkran på operationsdagen, som ORD-129 byggde
varianten för.

**Lita inte på att `CCO_SEND_LIVE=false` skyddar.** Den grinden är avsedd att
slås på, och den här ordern är det som ska vara klart innan dess.

---

## Godkänt när

1. Betänketiden härleds ur behandlingstyp, inte ur varumärke.
2. Ögonlocksplastik ger sju dagar i backend, och steg 6 visas i flödet.
3. Injektionsbehandlingar ger fortfarande två.
4. Ett test som failar när avtalet, policyn och flödet säger olika saker.
5. Mutationstesta punkt 4: sätt policyn till 2 för kirurgi och visa att testet
   blir rött. Sätt tillbaka `6: skip` och visa att det blir rött igen.
6. Signerade och arkiverade ärenden har oförändrad `coolingOffEndsAt`. Visa
   diffen.

---

## Vad jag inte avgjort

**Om transplantation är kirurgi i lagens mening.** Jag har antagit nej,
eftersom avtalen för `offert_tp` bär tvådagarsmeningen och ägaren bekräftade
2026-09-01 att "allt annat förutom ögonplastik har 2 dagar enligt lag". Det
är ägarens ord och det räcker för den här ordern — men om Nordbro säger något
annat om DHI/FUE är det deras svar som gäller, inte den här raden.

**Om `CCO_HAIR_TP_COOLING_OFF_DAYS` ska finnas kvar som env-override.** Den
låter någon sätta betänketiden till noll i produktion utan kodändring. Det var
rimligt när modulen bara gällde Hair TP:s operativa fönster. Med lagreglerade
värden är en env-variabel en märklig plats att bestämma dem på.
