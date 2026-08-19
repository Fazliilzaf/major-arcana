# Designutkast: selektiv laddning av mail-ingestion-state

**Datum:** 2026-08-19  
**Status:** utkast för granskning  
**Bakgrund:** incident 2026-08-19 då en pilotkörning av `egzona@`-backlogen fördubblade heapen 1,48 → 3,10 GB på 14 sekunder och drev instansen in i en GC-dödsspiral.

---

## 1. Problem

`ccoMailIngestionStore._load()` läser hela `/var/data/cco-mail-ingestion.json` synkront med `JSON.parse`. Filen är 235 MB på disk och expanderar till ~1,4 GB heap. Detta laddas vid **varje** anrop till `/process-all`, `/process-batch`, `/reprocess-unmatched` och vissa scheduler-passet — oavsett vilken brevlåda som faktiskt ska processas.

Konsekvenser:

- Baslinje-heapen är permanent ~1,4 GB högre än den behöver vara.
- Varje process-all-anrop skapar en andra kopia under laddning, vilket trycker V8 nära sitt gamla-objekts-tak (6 144 MB) trots att containern har 16 GiB.
- Ingen brevlåda kan processas utan att alla brevlådors råmeddelanden (inklusive fulla `rawJson`-kopior) finns i minnet.

`ccoMailboxTruthStore` löser redan samma problem med shards: en fil per brevlåda, laddad selektivt. Mail-ingestion bör använda samma mönster.

---

## 2. Mål

- En process-drain av `egzona@` får bara ladda egzonas slice av state — inte hela state:et för alla brevlådor.
- Baslinje-heapen ska sjunka proportionellt mot hur många brevlådor som faktiskt är aktiva i minnet.
- Ingen förlust av data, inget avbrott i pågående flöden.
- Backwards-kompatibel migrering från dagens monolitfil.

---

## 3. Förslag: per-brevlåde-shards för mail-ingestion

### 3.1 Filstruktur

Dagens monolit:

```
/var/data/cco-mail-ingestion.json   (235 MB)
```

Föreslagen struktur:

```
/var/data/cco-mail-ingestion/
  index.json                          # metadata: version, migratedFrom, shardMapping
  shared.json                         # konton, synk-state, subscriptions, auditEvents, etc.
  shards/
    egzona@hairtpclinic.com.json      # rawMessages + ledger + threadIdentity för denna brevlåda
    fazli@hairtpclinic.com.json
    info@hairtpclinic.com.json
    ...
```

### 3.2 Vad som hamnar var

**`shared.json`** — globalt state, läses alltid:

- `mailAccounts`
- `mailSyncState`
- `graphSubscriptions`
- `mailImportRuns`
- `auditEvents`
- `mailReprocessJobs`
- `dedupeIndex` (om den är global; annars per shard)
- `processingQueue` (se nedan)

**`shards/<mailbox>.json`** — per brevlåda:

- `mailRawMessages` för denna brevlåda
- `mailProcessingLedger` för denna brevlåda
- `mailPatientMatches` för denna brevlåda
- `mailActions` för denna brevlåda
- `threadIdentityIndex` för trådar där det äldsta meddelandet tillhör denna brevlåda (se avsnitt 3.6)

### 3.3 `processingQueue`

Dagens `processingQueue` är en global FIFO av `rawMessageId`. Om vi delar upp den per brevlåda försvinner den globala ordningen. Det är troligen OK — redan idag är kön i praktiken per brevlåda eftersom `dequeueNextRawMessageId` filtrerar på `mailboxId`.

Förslag: byt `processingQueue` till en array per brevlåda i respektive shard. `dequeueNextRawMessageId({ mailboxEmail })` läser bara den aktuella shardens kö.

Risk: om någon kod förväntar sig en global FIFO. Sökning krävs för att verifiera.

### 3.4 `_load()`-beteende

Nytt API:

```js
// Laddar bara shared + en shard
await ingestionStore._load({ mailboxEmail: 'egzona@hairtpclinic.com' });

// Laddar shared + alla shards (t.ex. för dashboard/scheduler som sveper)
await ingestionStore._load();
```

Default beteende: om inget `mailboxEmail` anges, laddas alla shards (backwards-kompatibelt med dagens anrop).

Intern implementering:

1. Läs `index.json`.
2. Läs `shared.json`.
3. Om `mailboxEmail` anges: läs endast `shards/<mailbox>.json`.
4. Annars: läs alla shard-filer.

### 3.5 `save()`-beteende

Dagens `save()` skriver hela state:et. Nytt beteende:

- `save({ mailboxEmail })` — spara bara shared + aktuell shard.
- `save()` — spara shared + alla laddade shards.

För att undvika att glömma spara en shard inför vi ett "dirty shard"-set. När en operation muterar en shard markeras den dirty. `save()` skriver bara dirty shards (plus shared om den är dirty).

### 3.6 Trådidentitet över brevlådor

`threadIdentityIndex` mappar `conversationKey` → kanoniskt patientId. En tråd kan innehålla meddelanden från flera brevlådor (t.ex. inkommande på `info@`, svar från `fazli@`).

Två alternativ:

**A) Trådidentitet i shared.** Enklare — `threadIdentityIndex` blir global och läses alltid. Kostnad är låg eftersom den bara innehåller metadata.

**B) Trådidentitet i äldsta brevlådans shard.** Mer elegangt, men kräver att `updateThreadIdentityForMessage` avgör vilken brevlåda tråden "tillhör".

Rekommendation: **A** i första steget. Det minskar komplexiteten och kostnaden är försumbar.

### 3.7 Dedupe-index

Dagens `dedupeIndex` är globalt. Om det är litet kan det ligga i shared. Om det är stort bör det också shardas, men det är sekundärt — mät först.

---

## 4. Migreringsväg

### 4.1 Migrering vid uppstart

Vid boot:

1. Om `/var/data/cco-mail-ingestion.json` finns och `/var/data/cco-mail-ingestion/` inte finns:
   - Läs monolitfilen.
   - Skriv `index.json`, `shared.json` och per-brevlåda-shards.
   - Behåll monolitfilen som `cco-mail-ingestion.json.migrated-<timestamp>.bak`.
2. Om shard-katalogen finns: använd den.

### 4.2 Rollback

- Monolit-backupfilen ligger kvar.
- Om något går fel kan man flytta tillbaka till monolitfilen och ta bort shard-katalogen.

### 4.3 Pilot-fas

Föreslagen försiktig approach:

1. Implementera sharding bakom feature-flag eller env-variabel (`ARCANA_CCO_MAIL_INGESTION_SHARDED=true`).
2. Migrera på staging/dev först.
3. På prod: migrera vid nästa deploy, men behåll backupfilen.
4. Kör `/status` och en liten `/process-batch` för att verifiera.
5. Efter 1 vecka utan incidenter: ta bort backupfilen och monolit-stödet.

---

## 5. Tmp-städning vid uppstart

### 5.1 Problem

`writeJsonAtomic` skriver `${filePath}.${pid}.${uuid}.tmp` och döper om vid framgång. Dör processen under skrivning lämnas `.tmp`-filen kvar. Detta har hänt vid varje krasch i månader och gav 2 GB skräp i arbetskatalogen (plus 6,4 GB i backups).

### 5.2 Förslag

Vid boot, efter att `config` är laddad men innan några stores börjar skriva:

```js
await cleanupOrphanedTmpFiles({
  dataDir: config.dataDir,
  currentPid: process.pid,
});
```

Regler:

- Matcha mönstret `*.${pid}.${uuid}.tmp` där `pid` är en siffra och `uuid` är en UUID.
- Om filens `pid` **inte** är ett levande process-id, radera den.
- Om filens `pid` är nuvarande process, radera den (det är vår egen avbrutna skrivning).
- Ignorera filer yngre än 60 sekunder med levande pid (pågående skrivning från en annan process).

Placering: i `src/infra/fileStore.js` eller motsvarande där `writeJsonAtomic` definieras.

### 5.3 `auth.json`-kapplöpning

Observation: vid kraschen fanns fem `auth.json.93.*.tmp` från samma pid och samma sekund. Det betyder att fem `writeJsonAtomic`-anrop mot samma målfil var samtidiga. Sista rename vinner och de andras arbete kastas.

Detta är en separat bugg oavsett minnesfrågan. Förslag:

- Serialisera skrivningar per målfil med en `Map<filePath, Promise>`.
- Ett andra anrop till samma fil väntar på det första istället för att starta en egen `.tmp`-skrivning.

---

## 6. Risker

| Risk                                    | Sannolikhet | Påverkan | Mitigering                                                   |
| --------------------------------------- | ----------- | -------- | ------------------------------------------------------------ |
| Migreringen misslyckas halvvägs         | Låg         | Hög      | Behåll monolit-backup; rollback-förfarande testat på staging |
| Kod glömmer spara en shard              | Medel       | Medel    | "Dirty shard"-set; assertions i dev/test                     |
| Trådidentitet blir fel vid shardning    | Låg         | Hög      | Lägg den i shared i första steget                            |
| `processingQueue`-ordning ändras        | Medel       | Låg      | Verifiera att ingen kod förlitar sig på global FIFO          |
| Tmp-städning raderar pågående skrivning | Låg         | Hög      | pid-villkor + åldersmarginal                                 |

---

## 7. Beroenden

- `src/ops/ccoMailIngestion/store.js` — huvudsakliga ändringar.
- `src/infra/fileStore.js` — tmp-städning och serialisering av skrivningar.
- `src/ops/ccoMailIngestion/worker.js` — `_load({ mailboxEmail })` i `runProcessBatch`.
- `src/ops/scheduler.js` — eventuellt `_load({ mailboxEmail })` i scheduler-passet.
- `src/routes/ccoMailIngestion.js` — kan behöva skicka mailbox till `_load`.
- Tester för store, worker och routes.

---

## 8. Definition of done

- [ ] Monolitfilen migreras till shared + shards vid boot.
- [ ] `_load({ mailboxEmail })` laddar bara aktuell shard.
- [ ] `save()` skriver bara dirty shards + shared.
- [ ] Pilotkörning av en enskild brevlåda inte laddar andra brevlådors råmeddelanden.
- [ ] Tmp-städning vid uppstart är på plats (pid-baserad).
- [ ] `auth.json`-skrivningar är serialiserade.
- [ ] Enhetstester och integrationstester gröna.
- [ ] Staging-körning utan incidenter.

---

## 9. Nästa steg

1. Godkänn designen eller påpeka detaljer som behöver ändras.
2. Dela upp i PR:er: migrering/shardning först, tmp-städning + auth-serialisering separat.
3. Implementera bakom feature-flag.
4. Testa på staging.
