# ORD-81 — Memoisera `sanitizeMailboxSignatureHtml` (CCO boot-frys)

| | |
|---|---|
| **Bas-commit** | `24de03b1` (origin/main, 2026-07-26) |
| **Gren** | `agent/ord-81-signature-memo` |
| **Arbetskopia** | `~/Code/.wt-ord81-signature-memo` (egen worktree — `~/Code/major-arcana` lämnas orörd på `agent/calendar-nested-history-handoff`) |
| **Ägare** | Claude (Cowork) |
| **GO** | Fazli, 2026-07-26 |
| **Ordernummer** | ORD-81 — högsta i `docs/handover/ORDERS/` = ORD-79, ORD-80 finns i git-loggen. **Notion Order Inbox ej kontrollerad** (connector ej auktoriserad) — verifiera innan numret anses låst. |

## Problem

CCO:s konversationsyta fryser huvudtråden i ~20 sekunder vid boot, och igen vid
varje `worklist/consumer`-refresh (~var 76:e sekund).

Uppmätt i prod (`arcana.hairtpclinic.com`, bundle `53cc971ffa`):

```
LONGTASK 19 668 ms  @ 27,6 s
  ├─ 26 192 anrop till sanitizeMailboxSignatureHtml
  ├─ 1 807 248 DOM-nodbesök
  ├─ 5 579 569 RegExp.exec
  ├─ 3 267 944 String.replace
  └─   776 672 Array.from
```

Ingen renderloop finns — det är verifierat separat (1,3 `setTimeout`/s, 0,2
mutations-callbacks/s). Det är ett fåtal enorma synkrona pass, inte många små.

## Rotorsak

`sanitizeMailboxSignatureHtml` (`public/major-arcana-preview/app.js:3867`)
parsar signatur-HTML till ett `<template>`, itererar över varje element och
varje attribut, och kör `sanitizeSignatureStyle` (`app.js:3889`) — fem kedjade
`/gi`-replaces — per style-attribut. Closuren omallokeras vid varje anrop.

Anropskedjan: `normalizeCustomMailboxDefinition` (`app.js:15014`, anropad från
11 ställen varav tre `.map()` över mailboxar) → signaturprofil-bygget
(`app.js:4796`) → saneraren.

Resultat: samma oförändrade signatur-HTML (~69 element) saneras från grunden
26 192 gånger i ett enda synkront pass. Ingen memoisering finns i main.

## Ändring

Memoisera `sanitizeMailboxSignatureHtml` på indata-strängen.

### Korrekthetskrav (icke förhandlingsbart)

Funktionen har en tidig returväg som **inte** sanerar:

```js
if (!mailboxAdminSignatureEditor?.ownerDocument) {
  return String(html || "").trim();
}
```

Utdatat beror alltså på modultillstånd, inte bara på indata. En cache som
nycklas enbart på indata-strängen skulle, om första anropet sker innan
signatur-editorn är monterad, cacha den **osanerade** strängen och sedan
fortsätta servera den som sanerad. Det är säkerhetsrelevant.

**Krav:** cachen får endast fyllas på den sanerande grenen. Den osanerade
returvägen ska returnera utan att skriva till cachen.

### Övriga krav

- Bunden cache: `Map` med tak (förslag 64 poster, FIFO-vräkning). En obunden
  cache i en långlivad flik är en läcka.
- Nyckel = hela indata-strängen, oförändrad. Ingen normalisering av nyckeln.
- Inga ändringar i saneringslogiken, tillåtna taggar, eller regex-uppsättningen.
  Detta är en ren cache-ändring, inte en översyn av sanering.

## Scope-vakt

**Endast** `sanitizeMailboxSignatureHtml` i denna sväng.

`classifyRuntimeRowFamily` (`app.js:7070`, 17 fält × NFKD-normalisering per rad,
står för 1,6 M `toLowerCase`) är en känd sekundär hotspot men **rörs inte** —
annars går det inte att avgöra vilken av dem som gav vinsten. Egen order om
ommätningen visar att den behövs.

## Mätprotokoll (före/efter)

Instrument: den inbyggda harnessen `?ccoPerf=1` (`__ccoPerf`, finns i prod sedan
`cce0ebf2` / #1213) **plus** longtask-räknare med sanerar-counter.

URL: `https://arcana.hairtpclinic.com/major-arcana-preview/?embed=admin&conversations=v2&view=conversations&ccoPerf=1`

Mät i båda fallen, kall laddning, samma inloggade session:

| Nyckeltal | Före (uppmätt) | Efter (krav) |
|---|---|---|
| **Tid till `#cco-conv-v2-root` monterad** | 40–163 s | **< 5 s** |
| Största longtask vid boot | 19 668–62 597 ms | < 1 000 ms |
| Anrop till saneraren | 26 192 | < 50 |
| DOM-nodbesök i saneraren | 1 807 248 | < 5 000 |
| Blockerad huvudtråd, 30 s fönster | 26 % | < 3 % |

Tid-till-montering är det mått som beskriver vad operatören faktiskt upplever
och ska vara det som avgör om fixen lyckats. Spridningen i före-värdena är stor
mellan laddningar — mät minst tre kalla laddningar och redovisa alla tre, inte
ett medelvärde.

## Acceptanskriterier

1. Nyckeltalen ovan uppnådda, uppmätta i prod efter deploy.
2. Signatur-HTML renderas visuellt identiskt före/efter i CCO och i
   mailbox-adminens signatur-editor.
3. Cachen fylls aldrig från den osanerade returvägen (täcks av test).
4. Befintlig testsvit grön. Nytt test: samma indata två gånger → ett enda
   `<template>`-bygge; osanerad gren → ingen cache-post.
5. `arcana-ci` grön före deploy.

## Utanför scope — egna spår

- ~~`#cco-conv-v2-root` monteras aldrig~~ — **FELAKTIGT, indraget.** Roten
  monteras och äger den synliga ytan (`#cco-conv-v2-root > .app-grid >
  .inbox-shell`); `.preview-workspace` är `display:none`. **V2 är den yta
  operatörerna kör**, och ORD-81 träffar alltså rätt yta. Alla mätningar som
  visade `v2Root: false` togs under boot eller mitt i frysen, innan monteringen
  hunnit ske — ett övergångstillstånd rapporterat som sluttillstånd.

  Det gör frysen allvarligare, inte mindre allvarlig: så länge huvudtråden står
  i saneraren är legacy dolt av flagg-CSS:en och V2 ännu inte monterat, så
  operatören ser en **helt blank sida**. Uppmätt tid till montering i en och
  samma session: 40 s respektive 163 s (ett block på 62 597 ms).

- **`lit-switchover` renderar in i en dold container.** `.queue-history-list`
  är 0×0 inuti det dolda legacy-skalet, men 8 `arcana-thread-card` byggs och
  patchas där ändå. Rent spill när V2 är på. Egen städning, ej perf-kritisk.
- `classifyRuntimeRowFamily`-memoisering (se Scope-vakt).

## Rättelser till tidigare påståenden i denna tråd

Följande påståenden från Cowork var **fel** och ska inte föras vidare:

- *"`ccoPerf` finns inte i kodbasen"* — fel. 7 träffar i `app.js`, 2 i
  `runtime-dom-live-composition.js`, 16 i `tests/ops/ccoLoadObservability.test.js`.
  Deployad och live i prod (`window.__ccoPerf` är ett objekt). Orsak: Cowork
  grep:ade en checkout på `agent/calendar-nested-history-handoff` (`a20d1795`),
  122 commits efter `origin/main`.
- *"Lokalt main ligger 142 commits efter"* — gällde Coworks egen stale checkout,
  inte Fazlis. Radnummer-avvikelsen (3588 vs 3867, 6788 vs 7070, konsekvent
  ~280 rader) är diagnostik-blocket från #1213.
- *"`origin/main` har 68 röda tester"* — indraget. Reproduceras inte i en
  riktig checkout; Codex fick 1 rött. Cowork körde först med symlänkade
  `node_modules` från ett träd med annan `package.json`, och även efter `npm ci`
  + inlänkad `.env` kvarstod 73 röda route/auth-tester som Codex inte ser.
  Miljöskillnaden är **oförklarad**. Det enda som är fastställt är att ORD-81 är
  differentiellt neutralt: `tests/routes/ccoConversationRbac.test.js` faller
  9/18 på pristine `origin/main` i samma miljö, med och utan ändringen.
- *"`#cco-conv-v2-root` monteras aldrig"* — indraget, se Utanför scope ovan.

**Gemensam nämnare för alla fyra felen: slutsats dragen från en omätt eller
otidsatt premiss.** Ange bas-commit, miljö och mättidpunkt i varje rapport.

Följande påstående från paritetsauditen var fel och rättas separat:

- *"V2-flaggan är default-OFF"* — `cco-conversations-v2-flag.js` säger
  `CUTOVER: default ON, opt-out`. Påverkar auditens rollback-resonemang.
