# Utkast: flytta ut bodies ur cco-mail-ingestion.json

**Datum:** 2026-08-19 · **Status:** beslutsunderlag, inte implementationsplan

Det här är medvetet **inte** ett fristående designdokument. Mönstret finns
redan implementerat i den här kodbasen, för samma sorts data. Utkastet säger
vad vi speglar och listar bara det som faktiskt skiljer sig.

Uppfinner vi ett eget schema hamnar två inkompatibla body-lösningar i samma
datakatalog, och nästa person måste lära sig båda.

---

## 1. Problemet, mätt

```
cco-mail-ingestion.json     235 MB, EN rad
  9 686 rawMessages         9 686 rawJson · 9 664 bodyHtml · 19 216 bodyText
  ~24 KB per meddelande, helt dominerat av brödtext
egzona@                     90,7 % av meddelandena
```

`_load()` gör `JSON.parse` på hela filen: ~1,4 GB heap, permanent resident.
Pilotkörningen 2026-08-19 fördubblade heapen 1,48 → 3,10 GB på 14 sekunder,
följt av GC-stall på 3–16 sekunder tills hälsokollen föll och Render startade
om instansen.

Shardning per brevlåda löser det inte: egzonas shard blir ~210 av 235 MB.

---

## 2. Vad vi speglar (redan besvarat i koden)

Referens: `ccoMailboxTruthBodyStore.js`, `ccoMailboxTruthBodyMigration.js`,
`ccoMailboxTruthBodyStreamTransform.js`. I drift: `bodies/` 157 MB skilt från
`mailboxes/` 77 MB.

| Fråga                      | Svar från befintlig implementation                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Filnamn                    | `bodyRoot/<mailbox>/<sha256[0:2]>/<läsbart48>.<sha256>.json`                                                          |
| Kollision mellan brevlådor | Brevlådan är egen katalognivå — löst                                                                                  |
| Katalogstruktur            | Per brevlåda + 256-vägs hash-uppdelning. Inte per månad                                                               |
| Stort antal filer          | Hash-uppdelningen håller katalogerna hanterbara                                                                       |
| Läsning                    | `bodySource: 'bodies_sidecar' \| 'shard_inline_only'` styrt av `deepScan` — metadata som standard, sidofil på begäran |
| Migreringens omfattning    | Per fil. Mailbox-truth har en fil per brevlåda — mail-ingestion har EN fil, se 6                                      |
| Torrkörning                | `apply = false` är default — men den skriver ändå backup och alla sidofiler, se 6                                     |
| Utrymme                    | Diskspärr som kräver `shardStat.size * 2 * marginRatio` innan start                                                   |
| Backup                     | `${shardPath}.${Date.now()}.pre-body-migration.bak` före skrivning                                                    |
| Stegvis utrullning         | Bygger på en fil per brevlåda — gäller INTE här, se 6                                                                 |
| Utlösare                   | Ops-route, inte boot. Operatörsstyrd                                                                                  |

Beslutet i tidigare utkast om migrering **vid boot** bör alltså förkastas.
På begäran via ops-route är både säkrare och redan byggt.

---

## 3. Det som faktiskt skiljer sig — fyra beslut

**3.1 `rawJson` ÄR problemet, och det är ett objekt.**

Mätt 2026-08-19 — fältfördelningen inom de 206,4 MB:

```
rawJson    184,1 MB   89 %   objekt
bodyText    22,3 MB   11 %   sträng
bodyHtml     0,0 MB    0 %   sträng, men TOM på alla 9 664 nycklar
```

`bodyHtml` bär ingenting. HTML-kroppen ligger inuti `rawJson`. Det betyder att
den befintliga transformen, som hanterar exakt `bodyText` och `bodyHtml`,
skulle flytta **22,3 MB av 206,4** — filen går från 235 MB till ~213 MB. I
praktiken ingen vinst.

Transformen är en teckenvis JSON-skanner som ersätter _strängvärden_. Att
hoppa över ett nästlat objekt från `{` till matchande `}` är ny logik. Den
utökningen är projektets kärna, inte en detalj.

`rawJson` och `bodyText` går till samma sidofil. `bodyHtml` lämnas som den är.

**3.2 Nyckeln.**
Kandidater: internt `rawMessageId` eller `internetMessageId`. Förslag:
**internt id**. Det externa kan saknas eller återanvändas av avsändaren.

**3.3 Bodies behövs för varje processat meddelande — och hela batchen lever kvar.**
`classifyMailType` bygger sin text av `subject` + `bodyPreview` + `bodyText`,
så varje meddelande som processas behöver sin body. "Ladda vid behov" får
alltså inte läsas som att bodies sällan behövs.

Toppminnet blir inte ett meddelande utan **hela batchen**. `processQueue` gör
`results.push(result)` (syncService.js:197) där `result` innehåller
`rawMessage`, och arrayen returneras ur batchen (`return { processed, failed,
results }`). Laddas bodies på begäran och hängs på `rawMessage` lever alltså
alla 50 kvar tills batchen är klar — och de lämnar batchen.

Vinsten är ändå den avgörande: proportionellt mot batchen (50) i stället för
mot brevlådan (8 785). Men implementationen bör antingen inte hänga bodies på
`rawMessage`, eller strippa dem ur `results` innan retur. Annars ligger 50
bodies resident utan att någon bett om det.

**3.4 `bodyPreview` stannar kvar som metadata.**
Mätt: 2,4 MB fördelat på samtliga 9 686 meddelanden, alltså 1 % av filen. Den
används av `classifyMailType` och av review-UI:t, och är liten nog att inte
motivera en sidofilsläsning. Följer alltså **inte** med bodies.

**3.5 Kön och ledgern rörs inte.**
Metadata, `processingQueue` och `mailProcessingLedger` stannar i
`cco-mail-ingestion.json`. Ingen shardning av metadata i det här steget — den
blir en separat, valfri optimering efteråt.

Storleken efter flytten är **mätt, inte uppskattad** (2026-08-19):

```
total                            235,0 MB
rawJson + bodyHtml + bodyText    206,4 MB   87,8 %   flyttas ut
bodyPreview                        2,4 MB    1,0 %   stannar
kvar i cco-mail-ingestion.json    28,6 MB
```

28,6 MB ger ungefär 170–200 MB heap vid `JSON.parse`, jämfört med dagens
~1,4 GB. En tidigare uppskattning i det här utkastet sa 10–25 MB; den var för
låg.

---

## 4. Påverkade läsvägar

Måste fungera under och efter migrering:

| Yta                                           | Behöver bodies?                       |
| --------------------------------------------- | ------------------------------------- |
| `/process-all`, `/process-batch`              | Ja — hela batchen lever kvar, se 3.3  |
| `reprocess-unmatched`                         | Ja, samma väg                         |
| Poller / scheduler                            | Nej — metadata räcker                 |
| `/status`, dashboard                          | Nej                                   |
| Review-UI (`/cco-mail-ingestion-review.html`) | Ja, vid visning av enskilt meddelande |

Det är den listan som avgör om en läsväg glömts. Varje `ja` behöver ett anrop
till sidofilen; varje `nej` ska **inte** ha ett.

---

## 5. Risker

| Risk                              | Sannolikhet | Påverkan | Mitigering                                                                         |
| --------------------------------- | ----------- | -------- | ---------------------------------------------------------------------------------- |
| Läsväg glömd → tomma bodies       | Medel       | Hög      | Listan i avsnitt 4; test per yta                                                   |
| Avbrott mitt i migrering          | Låg         | Hög      | Backup + verifiera-före-byt, redan i mönstret                                      |
| Diskutrymme under migrering       | Låg         | Hög      | Diskspärren, redan i mönstret                                                      |
| Sidofil saknas vid läsning        | Medel       | Medel    | `readBody` returnerar `null` = "ingen sidofil", inte fel — måste hanteras explicit |
| Migrering av egzona@ tar lång tid | Hög         | Låg      | Per brevlåda; kör små först                                                        |

---

## 6. En passering, inte per brevlåda

Mailbox-truth har **en fil per brevlåda**, så dess migrering kan köras
inkrementellt. Mail-ingestion har **en fil för alla brevlådor**. Den
stegvisa utrullningen går därför inte att ärva.

**Beslut: en passering över hela monoliten.** Alternativet — sharda metadata
per brevlåda först — lägger till ett helt migreringssteg innan bodies-problemet
ens är löst. Och 235 MB genom en ström är inte det som sänkte instansen; det
var `JSON.parse` som materialiserade allt i heapen. En passering undviker
just det.

### Torrkörningen måste gå mot en kopia

`apply: false` betyder **inte** read-only. Flaggan läses först på rad 220,
efter att modulen har:

- skrivit backupen (full kopia av källfilen)
- skrivit tmp-filen (full kopia)
- skrivit **samtliga sidofiler**
- läst tillbaka och verifierat dem

`abort('torrkorning')` tar bara bort tmp-filen. Backupen och sidofilerna
ligger kvar. Modulens egen kommentar säger det: _"`apply: false` gör allt utom
att byta in den nya"_.

Originalfilen rörs aldrig, så det är ofarligt. Men en torrkörning mot
`/var/data/cco-mail-ingestion.json` lämnar en 235 MB backup och ~9 686
sidofiler i den levande datakatalogen.

**Kör torrt mot en kopia i en scratch-katalog**, inte mot produktionsfilen.
Det ersätter "liten brevlåda först" som sätt att få bevis före skarp körning.

---

## 7. Implementationsordning

| Steg | Vad                                                                                                              | Klart när                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 0    | Parametrisera transformen: `BODY_FIELDS` och sökvägsvillkoret `keyAtDepth[1] === 'messages'` → `mailRawMessages` | Befintliga mailbox-truth-tester fortfarande gröna                              |
| 1    | Utöka transformen med objekthoppning för `rawJson`                                                               | Nya tester: nästlade objekt, strängar med klammer, escapade tecken             |
| 2    | Torrkörning mot kopia av produktionsfilen                                                                        | Rapport: antal flyttade bodies, filstorlek före/efter, `decoded_chars` stämmer |
| 3    | Skarp migrering av produktionsfilen                                                                              | `fileBytesAfter` ≈ 28,6 MB, backup kvar                                        |
| 4    | `/process-batch` mot migrerad data                                                                               | Batchen går igenom, heap följer batchstorlek                                   |
| 5    | `FILTER_VERSION`-bump och omkörning av backloggen                                                                | Se varningen i `constants.js`                                                  |

Steg 1 är det enda som är verklig nykonstruktion. Steg 0 är två konstanter.
Steg 2–4 är körningar, inte kod.

---

## 8. Beslutade frågor

**Återanvänd migreringsmodulen — kopiera inte.** Orkestreringen är generisk
och värdefull: diskspärr, backup, mottryck åt båda håll, serialiserade
skrivningar, verifiering före byte. Kommentarerna dokumenterar **två redan
lösta OOM-incidenter** — en från att brödtexter ackumulerades i en `Map`, en
från att läsströmmen pumpade snabbare än skrivströmmen. En kopia betyder att
båda måste härledas om.

Formatberoendet är isolerat i transformen och litet: två konstanter plus
objekthoppningen i steg 1.

**Backupfilerna raderas** när verifieringen passerat _och_ en `/process-batch`
gått igenom mot den nya strukturen — inte på tidsgräns.

---

## 9. Kvar att besluta

- Godkänn 3.1–3.5, eller peka ut vad som ska ändras.
- Var ska scratch-katalogen för torrkörningen ligga? `/var/data` har 217 GB
  ledigt, men kopian plus sidofilerna är ~440 MB och bör inte hamna bland
  levande data.
