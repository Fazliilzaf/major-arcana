# Designutkast: minska minnesavtrycket för mail-ingestion

**Datum:** 2026-08-19  
**Status:** reviderat utkast efter mätning  
**Bakgrund:** incident 2026-08-19 då en pilotkörning av `egzona@`-backlogen fördubblade heapen 1,48 → 3,10 GB på 14 sekunder och drev instansen in i en GC-dödsspiral.

---

## 1. Problem

`ccoMailIngestionStore._load()` läser hela `/var/data/cco-mail-ingestion.json` synkront med `JSON.parse`. Filen är 235 MB på disk och expanderar till ~1,4 GB heap.

Mätningen avslöjar att fördelningen är extremt skev:

| brevlåda                | meddelanden | andel  |
| ----------------------- | ----------- | ------ |
| egzona@hairtpclinic.com | 17 570      | 90,7 % |
| info@fazli.se           | 1 288       | 6,7 %  |
| kons@hairtpclinic.com   | 414         | 2,1 %  |
| fazli@hairtpclinic.com  | 100         | 0,5 %  |

`egzona@` **är** state:et. Enbart per-brevlåde-shards skulle göra `shards/egzona@...json` till ~210 MB (~1,3 GB heap) och inte lösa kraschen.

Det stora minnet sitter i `rawJson`, `bodyHtml` och `bodyText` för varje meddelande — cirka 24 KB per meddelande, helt dominerat av brödtexter. `ccoMailboxTruthStore` har redan löst samma sak genom att lägga brödtexterna i separata filer under `/var/data/cco-mailbox-truth/bodies/` och bara metadata i shards.

---

## 2. Mål

- En process-drain av `egzona@` får inte behöva ladda alla 17 570 brödtexter i minnet samtidigt.
- Minneskostnaden ska vara proportionell mot **batchen** (50 meddelanden), inte mot brevlådans totala backlogg.
- Baslinje-heapen ska sjunka kraftigt genom att brödtexter inte ligger residenta i state-objektet.
- Ingen förlust av data, inget avbrott i pågående flöden.
- Backwards-kompatibel migrering från dagens monolitfil.

---

## 3. Förslag A: externalisera brödtexter (huvudfix)

### 3.1 Vilka fält som ska ut

För varje `mailRawMessages[id]`:

- `rawJson` — hela Graph/JSON-objektet.
- `bodyHtml` — HTML-versionen.
- `bodyText` — textversionen.

Dessa flyttas till separata filer. Metadata (`subject`, `from`, `to`, `receivedAt`, `conversationKey`, `mailboxId`, `dedupeKey`, etc.) behålls i state-filen.

### 3.2 Filstruktur

Dagens monolit:

```
/var/data/cco-mail-ingestion.json   (235 MB)
```

Föreslagen struktur:

```
/var/data/cco-mail-ingestion/
  index.json                          # metadata: version, migratedFrom
  state.json                          # metadata per meddelande, ledger, konton, etc.
  bodies/
    <rawMessageId>.json               # rawJson + bodyHtml + bodyText
    ...
```

Alternativt gruppera i underkataloger för att undvika för många filer i en katalog:

```
  bodies/
    ab/
      abcd1234...json
    ef/
      efgh5678...json
```

### 3.3 När bodies läses

- **Vid processning:** när `processRawMessage` behandlar ett meddelande läses dess body-fil in.
- **Vid import:** när ett nytt meddelande sparas skrivs body-filen direkt (atomiskt).
- **Vid status/dashboard:** bodies läses **aldrig** — bara metadata räknas.
- **Vid reprocess-unmatched:** bodies behövs inte förrän meddelandet faktiskt processas.

### 3.4 `rawJson`-fältet

`rawJson` används idag på flera ställen. Innan externalisering måste vi kartlägga alla läsare. Förslag:

1. Ersätt `rawJson` med `rawJsonRef: { filePath, sizeBytes }` i state.
2. Lägg till `getRawJson(rawMessageId)` som laddar body-filen on demand.
3. Uppdatera alla läsare att anropa `getRawJson()` istället för att läsa fältet direkt.

### 3.5 Tillfällig kompatibilitet

För att minska risken kan vi under en övergångsperiod behålla både inline `rawJson` och externaliserad variant, med en feature-flag:

```js
const useExternalBodies = config.ccoMailIngestionExternalBodies === true;
```

När flaggan är av: gamla beteendet. När flaggan är på: nya beteendet. Efter verifiering: ta bort inline-stödet.

### 3.6 Förväntad effekt

- `state.json` sjunker från 235 MB till kanske 20–40 MB (~150–300 MB heap).
- En drain av `egzona@` laddar 50 metadata-poster + 50 body-filer per batch ≈ några MB, inte 1,3 GB.
- Baslinje-heapen sjunker kraftigt eftersom bodies inte längre är residenta.

---

## 4. Förslag B: per-brevlåde-shards (sekundär optimering)

Efter att bodies är externaliserade blir shardning enklare och mer effektiv. Då kan `state.json` delas upp i:

```
/var/data/cco-mail-ingestion/
  index.json
  shared.json                         # konton, synk-state, subscriptions, auditEvents, etc.
  shards/
    egzona@hairtpclinic.com.json      # metadata per meddelande + ledger för denna brevlåda
    info@fazli.se.json
    ...
  bodies/
    ...
```

Detta ger ytterligare minskning av baslinje-heapen för dashboard/scheduler och gör att andra brevlådor kan processas utan att ladda egzonas metadata.

**Rekommendation:** gör förslag A först. När det är stabilt, överväg förslag B.

---

## 5. Tmp-städning vid uppstart

### 5.1 Problem

`writeJsonAtomic` skriver `${filePath}.${pid}.${uuid}.tmp` och döper om vid framgång. Dör processen under skrivning lämnas `.tmp`-filen kvar. Vid kraschen i morse låg åtta sådana filer kvar, inklusive fem för `auth.json` från samma pid — vilket indikerar kapplöpning.

### 5.2 Förslag

Vid boot, efter att `config` är laddad men innan några stores börjar skriva:

```js
await cleanupOrphanedTmpFiles({
  dataDir: config.dataDir,
  currentPid: process.pid,
});
```

Regler:

- Matcha mönstret `${filePath}.${pid}.${uuid}.tmp` där `pid` är en siffra och `uuid` är en UUID.
- Om filens `pid` **inte** är ett levande process-id → radera.
- Om filens `pid` är **nuvarande process** → radera (vid boot kan vår egen process inte ha pågående skrivningar än).
- Om filens `pid` är en **levande främmande process** → rör **aldrig**, oavsett ålder. En `save()` av detta state tog tidigare 27 s och växer med datamängden; 60 sekunders gräns är för kort.

Städningen körs bara vid boot, vilket eliminerar risken med pid-återanvändning (en ny process med samma pid som kraschen skulle annars kunna radera sina egna pågående skrivningar).

### 5.3 `auth.json`-kapplöpning

Fem `auth.json.93.*.tmp` från samma pid och samma sekund betyder att `authStore.save()` saknar serialisering — varje anrop startar sin egen `writeJsonAtomic`. De fem tmp-filerna var fem samtidiga skrivningar som dödades i flykten.

Lösning för `authStore`:

- Håll reda på pågående skrivning med `Map<filePath, Promise>`.
- Om ingen skrivning pågår → skriv nu.
- Om skrivning pågår och ingen är köad → köa en uppföljare, returnera dess promise.
- Om skrivning pågår och en redan är köad → returnera den köades promise.

Detta slår ihop fem samtidiga `save()` till högst två skrivningar: den pågående + en uppföljare som innehåller alla fem mutationer. Ingen anropare får "klart" förrän hens mutation faktiskt ligger på disk.

**Obs:** `writeJsonAtomic` finns i **92 kopior** i `src/`. En generell serialisering i en gemensam modul är rätt på sikt, men det är mekaniskt arbete som bör vara en separat insats. Här börjar vi med `authStore` eftersom den skrivs oftast och ligger närmast en säkerhetsfunktion.

---

## 6. Migreringsväg för förslag A

### 6.1 Migrering vid uppstart

Vid boot:

1. Om `/var/data/cco-mail-ingestion.json` finns och `/var/data/cco-mail-ingestion/` inte finns:
   - Läs monolitfilen.
   - För varje `mailRawMessages[id]`: skriv body-fil med `rawJson`, `bodyHtml`, `bodyText`; ersätt dessa fält i state med `bodyRef`.
   - Skriv `index.json` och `state.json`.
   - Behåll monolitfilen som `cco-mail-ingestion.json.migrated-<timestamp>.bak`.
2. Om den nya katalogen finns: använd den.

### 6.2 Rollback

- Monolit-backupfilen ligger kvar.
- **Viktigt:** backupen är en ögonblicksbild från migreringstillfället. Om skrivningar har skett mot den nya strukturen kan man inte bara "flytta tillbaka" till monolitfilen utan datatapp.
- Två alternativ:
  - **A)** Rollback-fönstret stängs vid första skrivningen. Därefter krävs en återmigrering som slår ihop `state.json` + bodies tillbaka till monolitformat.
  - **B)** Under pilotfasen skriver vi alltid både monolit (som backup) och ny struktur, så rollback är trivial. Detta dubblerar skrivkostnaden under piloten.

Rekommendation: **A** med tydlig dokumentation. Piloten ska vara kort och på staging.

### 6.3 Pilot-fas

1. Implementera externalisering bakom env-variabel (`ARCANA_CCO_MAIL_INGESTION_EXTERNAL_BODIES=true`).
2. Migrera på staging/dev.
3. Kör `/status`, `/process-batch` och en liten drain för att verifiera.
4. Efter 1 vecka utan incidenter på prod: ta bort monolit-backup och inline-stödet.

---

## 7. Risker

| Risk                                    | Sannolikhet | Påverkan | Mitigering                                                                    |
| --------------------------------------- | ----------- | -------- | ----------------------------------------------------------------------------- |
| Externalisering misslyckas halvvägs     | Låg         | Hög      | Behåll monolit-backup; testad rollback-återmigrering på staging               |
| Någon kod läser `rawJson` direkt        | Medel       | Hög      | Sök igenom alla läsare; inför `getRawJson()` och tester                       |
| Body-filer blir korrupta/försvinner     | Låg         | Hög      | Atomisk skrivning; validering vid laddning; backup                            |
| `processingQueue`-semantik ändras       | Låg         | Medel    | Behåll global FIFO i förslag A; överväg per-brevlåda-kö först i förslag B     |
| Tmp-städning raderar pågående skrivning | Låg         | Hög      | Städa aldrig levande främmande pid; kör endast vid boot                       |
| Auth-serialisering blockerar vid fel    | Låg         | Medel    | Timeout + felhantering så att en trasig skrivning inte låser filen för alltid |

---

## 8. Definition of done

- [ ] Brödtexter (`rawJson`, `bodyHtml`, `bodyText`) lagras i separata filer.
- [ ] `state.json` innehåller bara metadata + referenser till body-filer.
- [ ] Alla läsare av `rawJson` använder `getRawJson()` / lazy loading.
- [ ] Migrering vid boot med monolit-backup.
- [ ] Tmp-städning vid uppstart (pid-baserad, boot-only).
- [ ] `writeJsonAtomic` serialiserar skrivningar per målfil.
- [ ] Enhetstester och integrationstester gröna.
- [ ] Staging-körning av drain utan minnesincident.

---

## 9. Nästa steg (rekommenderad ordning)

1. **Tmp-städning vid boot** — egen PR, låg risk. Den är global: ett ställe täcker alla 92 `writeJsonAtomic`-kopior, inklusive de åtta filerna från morgonens krasch och alla framtida.
2. **Auth-serialisering** — egen PR, låg risk. Punktinsats för den fil som skrivs oftast och ligger närmast en säkerhetsfunktion.
3. **Externalisera bodies** — huvudfixen. Större PR, kräver granskning och staging-test.
4. **Shardning av metadata** — sekundär optimering efter att bodies är ute.

Säg till vilket du vill att jag börjar med.
