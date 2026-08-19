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
| Migreringens omfattning    | Per brevlåda (`mailboxId` + `shardPath`)                                                                              |
| Torrkörning                | `apply = false` är default; skarp körning är opt-in                                                                   |
| Utrymme                    | Diskspärr som kräver `shardStat.size * 2 * marginRatio` innan start                                                   |
| Backup                     | `${shardPath}.${Date.now()}.pre-body-migration.bak` före skrivning                                                    |
| Stegvis utrullning         | Följer av per-brevlåda-migreringen                                                                                    |
| Utlösare                   | Ops-route, inte boot. Operatörsstyrd                                                                                  |

Beslutet i tidigare utkast om migrering **vid boot** bör alltså förkastas.
Per brevlåda på begäran är både säkrare och redan byggt.

---

## 3. Det som faktiskt skiljer sig — fyra beslut

**3.1 `rawJson` finns bara i mail-ingestion.**
Mailbox-truth externaliserar brödtext. Här finns dessutom hela MIME-objektet
(9 686 nycklar). Förslag: samma sidofil som `bodyHtml`/`bodyText` — de behövs
vid samma tillfälle, och en uppdelning dubblar filantalet utan vinst.

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

## 6. Ordning

1. Migrera en liten brevlåda torrt (`apply: false`), granska rapporten.
2. Samma brevlåda skarpt. Verifiera `/status` och en `/process-batch`.
3. Resterande små brevlådor.
4. `egzona@` sist — 90,7 % av datan, och den som faktiskt löser problemet.
5. Först därefter: `FILTER_VERSION`-bump och omkörning av backloggen.

---

## 7. Kräver beslut av ägaren

- Godkänn 3.1–3.4, eller peka ut vad som ska ändras.
- Ska `mailbox-truth`-migreringen återanvändas som modul, eller ska
  mail-ingestion få en egen kopia? Återanvändning kräver att den generaliseras
  bort från shard-formatet; en kopia riskerar att de glider isär.
- Backupfilerna från migreringen tar plats som `cco-mail-ingestion.json`.
  När får de raderas?
