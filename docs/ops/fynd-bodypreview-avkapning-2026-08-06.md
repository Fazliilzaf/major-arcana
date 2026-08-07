# Fynd 2026-08-06 — meddelandekroppar renderas fran `bodyPreview`, inte fran kroppen

**ORD-99.** Upptackt under matgrind steg 2 i ORD-93.

**Detta ar INTE ett nytt fel.** Det ar en sjatte misstankt instans av den bugg
ORD-89 skapade och ORD-98 fixade i fem kodvagar. Las mekanik-avsnittet innan
nagot byggs — min forsta version av denna fil hade fel orsak.

Inga personuppgifter i denna fil med flit.

## Observation

Operatorsvyn, trad "RE: Uppfoljning" i `info@`. Tva meddelanden, bada avkapade
mitt i ett ord:

| Meddelande           | Langd                | Slutar                           |
| -------------------- | -------------------- | -------------------------------- |
| Inkommande (kund)    | 159 tecken           | mitt i "Med vanlig ha…"          |
| Utgaende (vart svar) | **exakt 255 tecken** | mitt i "boka en konsultationst…" |

255 ar inte ett godtyckligt tal. Det ar **Microsoft Graphs `bodyPreview`**, som
per definition ar "de forsta 255 tecknen av meddelandekroppen i textformat".

Verifierat att det inte ar CSS-klippning: markering med musen i bubblan tar slut
pa samma stalle som texten. Kroppen ar avkapad i lagret, inte i renderingen.

Uteslutet ocksa: renderingens egen cap `MAX_RUNTIME_BODY_HTML_CHARS` ar 240 000,
och lagringens `MAX_STORED_BODY_HTML_CHARS` ar 24 000. Ingen av dem kapar vid 255.

## Mekanism — RATTAD 2026-08-06, min forsta slutsats var fel

Jag skrev forst att `bodyPreview` kapas vid inmatning fran Graph. **Det ar fel.**
Orsaken star dokumenterad i koden sedan tidigare, och den ar en annan.

`ccoMailboxTruthReadAdapter.js:336-340`:

> _"ORD-98, samma fix, en tredje kodvag: efter ORD-89 ligger brodtexten i
> sidofiler och shardens falt ar tomt. `/cco/runtime/history` hydrerade aldrig,
> sa `buildCanonicalMailDocument` foll tillbaka pa `bodyPreview` — samma
> avhuggna text, samma saknade signatur, en annan rutt."_

ORD-89 flyttade brodtexten till sidofiler. Varje kodvag som laser meddelanden
utan att anropa `hydrateMessageBodies` far ett tomt kroppsfalt och faller
tillbaka pa forhandsvisningen. ORD-98 jagade samma bugg genom **fem** kodvagar
(`ccoConversation.js:929-934` raknar upp `/summary`, `/booking-confirm` och
`/draft` som fjarde och femte).

255 ar alltsa fortfarande Graphs `bodyPreview`-cap — men den ar ett _symptom_
av utebliven hydrering, inte en avkapning vid inmatning.

## SLUTGILTIGT 2026-08-07 — bevisad kedja

Jag vande mig tva ganger under utredningen. Slutsatsen nedan ar den som star,
och den ar bevisad med observation i prod — inte harledd ur koden.

### Bevisen

**1. Den avkapade texten finns i worklist-svaret.** Devtools-sokning pa
ordfragmentet `konsultationst` (inte pa kundnamnet — det var misstaget forra
gangen) traffar sex ganger i
`/api/v1/cco/runtime/worklist/consumer?mailboxIds=halso…,info…&limit=500`.
Texten slutar vid `boka en konsultationst"` foljt av nasta JSON-falt.

**2. `/messages` anropas inte.** Network med `Fetch/XHR` och filtret `messages`
ar tomt i samma flik, efter hard omladdning.

**3. Hydreringen rapporterar anda framgang.** `window.__ccoOpenFlowDiagnostics`
(exponerad i #1319) ger handelsekedjan:

```
open_flow_reset → select_thread → hydrate_start
→ hydrate_v2_direct_fetch (messageCount: 2, applied: true)
→ hydrate_direct_applied → hydrate_finish
```

Ingen skip. Ingen vakt slog till.

### Mekanismen

`hydrateRuntimeThreadHistory` (`runtime-dom-live-composition.js:2700-2725`):

```js
if (isPassiveConversationsV2Runtime()) {
  directPayload = await fetchV2DirectThreadPayload(...)
  updated = applyV2DirectThreadPayload(...)
}
if (!updated) {
  historyPayload = await fetchRuntimeThreadHistoryPayload(...)   // ← /messages
}
```

V2 provar sin direktvag forst. Den lyckas (`applied: true`) utan att gora nagot
natverksanrop — `fetchV2DirectThreadPayload:2437-2440` returnerar fran cache
nar TTL galler. Eftersom `updated` blir `true` kors **aldrig** fallbacken som
hamtar de fullstandiga kropparna.

Resultatet: operatoren ser worklistens 255-teckens forhandsvisning som om den
vore meddelandekroppen.

### Vad som ar RATT atgard

**Ratt:** v2-tradvyn ska hamta fullstandiga kroppar vid tradoppning. Antingen
genom att `applyV2DirectThreadPayload` inte far rakna som `updated` nar
payloaden saknar riktiga kroppar, eller genom att direktvagen alltid
kompletteras med `/messages`.

**Fel:** att hydrera worklisten. `ccoMailboxTruthWorklistReadModel.js:1174-1176`
forklarar varfor den ar forkortad med flit — hydrering dar aterger
allokeringsmonstret bakom produktionskrascherna (`#1302`, `#1304`).

Serversidan ar alltsa korrekt. `/messages` hydrerar
(`ccoConversation.js:935-938`) och skulle ge hela kroppen. Den fragas bara
aldrig.

### Foljd for ORD-93

`info@` rapporterade noll cid-referenser i ORD-93:s svep. Det ar konsekvent:
utan signatur i den lagrade forhandsvisningen finns inga `cid:` att rakna.
Bilderna ar inte forlorade — de nar bara aldrig fram till vyn.

## Sidoobservation — diakriter i utgaende post

Det utgaende svaret saknar samtliga a/a/o: "Tack for ditt meddelande",
"Arendet ar markerat", "aterkoppling", "Foreslaget nasta steg". Det inkommande
meddelandet i samma trad har diakriterna kvar ("gatt ett halvar", "pafyllning").

Skillnaden gar alltsa mellan inkommande och utgaende, inte mellan meddelanden.
Ej utrett. Kan vara samma ASCII-vikning som ger `?` i Drive-filnamn (PR #1300,
610 assets, dokumenterat olosligt), eller nagot i skrivvagen for utkast.

## Vad som INTE ar utrett

- **Hur manga meddelanden som bara har forhandsvisning.** Kraver ett svep som
  jamfor lagrad kroppslangd mot 255 och mot `bodyPreview`-faltet.
- **Om de riktiga kropparna finns kvar i Graph.** ORD-93:s probe visade att
  bilagor mestadels inte gar att hamta om, men kroppen ar en annan fraga och
  har inte probats.
- **Om detta galler alla brevlador eller bara vissa.** Bada exemplen kommer
  fran `info@`.

## UPPDATERING 2026-08-07 — matt, en fix byggd, en oppen fraga kvar

Fick ORD-99 och ett GO. Byggde matning innan kod, samma princip som ordern
sjalv efterfragar — se `window.__ccoOpenFlowDiagnostics.lastHydration.directFetch.bodyMetrics`
(#1319 exponerar diagnostiken, #1322 lagger till kroppslangder + bilageantal
per meddelande, aldrig innehall).

**Matt i prod, Ali Selim-traden:**

| Meddelande | bodyHtmlLength | bodyTextLength | bodyPreviewLength | attachmentCount |
| ---------- | -------------- | -------------- | ----------------- | --------------- |
| Inkommande | 0              | 159            | 230               | 5               |
| Utgaende   | 0              | 255            | 255               | 5               |

`bodyTextLength` (159, 255) matchar EXAKT den avkapade texten operatoren sag —
inte `bodyPreview`. Den riktiga lagrade textkroppen ar kort, punkt. Men
`bodyHtml` ar tom pa bada, och `attachmentCount: 5` pa bada — bilagorna finns,
kroppen som skulle badda in dem gor det inte.

**Fixat (#1323):** servern beraknar redan `isInline` + `inlineUrl` per bilaga,
oberoende av `bodyHtml`. Klientens `renderMessageAttachments`
(`cco-conversations-v2-shell.js`) filtrerade anda bort varje `isInline`-flaggad
bilaga — i tron att den skulle baddas in i html som inte fanns. Fem bilagor
forsvann tyst per meddelande. Fix: nar `html` ar tomt raknas ingen bilaga som
"redan inbaddad", allt renderas som chip. Tva tester, extraherar de riktiga
funktionerna ur kallan, inget stubbat.

**INTE byggt:** rikedomssparr i `applyV2DirectThreadPayload` (se
"SLUTGILTIGT 2026-08-07 → Vad som ar RATT atgard" ovan). Skulle inte ha
hjalpt just den har traden — fallbacken hade sannolikt gett samma tomma
`bodyHtml` fran samma kalla — men kan dolja rikare data pa ANDRA tradar.

**Fortfarande oppet:** varfor `bodyText` bara ar 159/255 tecken for de har
tva meddelandena. `/messages` beriker redan via `mailIngestionStore`
(`enrichConversationMessagesWithIngestion`) innan svaret byggs — om aven den
vagen ger kort text pekar det mot ett dataspar i hur `info@` importerades,
inte ett kodfel. Obekraftat. Kraver att nagon utreder importhistoriken for
`info@`, inte ett svep i klienten.
