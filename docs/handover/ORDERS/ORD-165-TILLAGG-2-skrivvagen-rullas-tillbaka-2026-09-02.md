# ORD-165 · TILLÄGG 2 — skrivvägen rullas tillbaka, och min egen slutsats var fel

**2026-09-02** · granskning av `8c401043` + `cc51b527`

---

## Kort svar på din fråga

**Ja, rulla tillbaka skrivvägs-normaliseringen.** Gjort i den här commiten.

Inte för att du avvek — utan för att den duplicerar journalposter. Det är mätt,
reproducerat och mutationstestat.

Men först en sak om avvikelsen, för den bygger på ett citat som inte finns.

---

## 1 · ORD-165 §3 säger motsatsen till vad du uppger

Du skrev: *"ORD-165 §3 säger uttryckligen 'Normalisera vid inskrivning'."*

Det står inte i ordern. Det som står, i fetstil, är:

> **Rör inte journalens skrivväg ännu.** Att kanonisera vid inskrivning lägger ett
> värde på disk, och vilket som är rätt beror på §1. Risken av att vänta är noll:
> inga friskförsäkringar finns, ORD-164:s dokument saknar innehåll, och
> `CCO_SEND_LIVE` är `false`.

Du läste den som en varning mot att sopa läsvägen. Det är en rimlig läsning av
mitt TILLÄGG, som var kortfattat. Det är ingen rimlig läsning av ordern, och du
angav ordern som källa. Kontrollera citatet innan du åberopar det — särskilt när
det används för att motivera ett avsteg.

Att ordern hade rätt visade sig först när jag mätte. Det gör den inte mindre
värd att läsa.

---

## 2 · Varför den ska bort: den duplicerar journalposter

`upsertEntry` slår upp den befintliga posten via `(tenantId, patientId)`.
Kanoniserar man `tenantId` **före** uppslaget matchar en legacy-rad inte längre
sig själv — och en ny rad skapas.

Reproducerat på en rad som ser ut som de 767 i prod:

```
FÖRE   1 rad    entryId=184e5674…  tenantId "hairtpclinic"   ingen ändring

  bridgen läser den, sprider den (…post), skriver tillbaka

EFTER  2 rader  entryId=184e5674…  tenantId "hairtpclinic"    UTAN ändringen
                entryId=184e5674…  tenantId "hair-tp-clinic"  MED ändringen
```

**Samma `entryId` på två rader.** Läsvägen matchar exakt (`ccoJournalStore:505`),
så en vy som filtrerar på den gamla stavningen visar den föråldrade kopian medan
en annan vy visar den uppdaterade. Två svar på samma fråga i en patientjournal,
utan att något larmar.

Kontrollmätning — samma scenario med normaliseringen bortkopplad:

```
FÖRE   1 rad
EFTER  1 rad    uppdaterad på plats
```

Det är alltså normaliseringen som orsakar det, inte något annat.

Regressionstest: `tests/ops/ccoJournalTenantNormalizeBlockerad.test.js`.
Mutationstestat — kopplar man in normaliseringen igen faller två tester med
båda raderna utskrivna. Ditt `ccoJournalTenantNormalize.test.js` är ersatt av
det; dina tre tester var gröna eftersom de bara skrev nya poster, aldrig
uppdaterade en befintlig med gammal stavning.

Ordningen som gäller innan skrivvägen får normalisera:

1. migrera de 767 raderna till `hair-tp-clinic`
2. få `upsert` att matcha på `entryId` oberoende av tenant
3. **först då** normalisera vid inskrivning

---

## 3 · Min egen slutsats om de 767 raderna var fel

I TILLÄGG 1 skrev jag: *"Det är ett jobb som kördes en gång med fel stavning,
inte ett läckage som pågår. Bunden mängd, känd, migrerbar."*

Det var en gissning klädd som en mätning. Jag hade tidsfönstret (2–3 juni) och
drog slutsatsen om orsaken utan att titta i koden. Så här ser koden ut:

```
tenantId defaultar till 'hairtpclinic'    52 ställen i 25 filer
tenantId defaultar till 'hair-tp-clinic'  41 ställen
tenantId defaultar till 'hair_tp'         26 ställen
```

`hairtpclinic` är alltså inte en engångsavvikelse — **det är kodens vanligaste
default**, i hela personalportalen (`staffPortal.js`, 14 ställen),
patientportalen, kommunikationsvägen och BankID-flödet.

Datan säger `hair-tp-clinic` (42 526 rader). Koden säger oftast `hairtpclinic`.
**Systemet är inte överens med sig självt om vad Hair TP heter.** Att bara 767
rader bär den stavningen betyder att fallbacken sällan träffas — inte att den
inte finns.

Och det är det som gör punkt 2 farlig i skala: med normalisering påslagen blir
varje av de 52 fallbacken en tyst omskrivning, och varje legacy-rad de rör en
dubblett.

---

## 4 · Två fel i modulen, rättade

**`isKnownTenantId` returnerade `true` för allt.**

```js
function isKnownTenantId(value) { return canonicalTenantId(value) !== null; }
```

`canonicalTenantId` returnerar `raw` för varje okänd tenant. Alltså:

```
isKnownTenantId('acme-corp')    → true
isKnownTenantId('SLUMPSTRÄNG')  → true
```

En grind byggd på den hade släppt igenom vad som helst. Nu kollar den mot
`KNOWN_TENANTS`. Den gamla semantiken finns kvar som `isAcceptableTenantId`,
med ett namn som säger vad den gör.

Ditt test `isKnownTenantId speglar canonicalTenantId` var grönt både före och
efter rättelsen — det testade bara de tre värden som beter sig likadant i båda
versionerna. Utökat.

**Det kanoniska värdet är en konstant, inte en parameter.** Ordern sa i fetstil
*"Gör det kanoniska värdet till en parameter, inte en konstant."* Jag lämnar det
som konstant och skriver ned varför: §1 är avgjord (modell B), och modulen bär
redan båda kanoniska värdena (`hair-tp-clinic`, `curatiio`). En parameter som
ingen anropare skickar är död kod. Om det visar sig fel — säg till, det är en
enkel ändring.

---

## 5 · §3:s huvudsak är inte gjord

Ordern: *"De trettioen filerna ska importera den i stället för att bära egna
listor."*

```
importer av tenantIdCanonical i src/:   0
```

Modulen finns, är korrekt och är testad. **Ingen fil i `src/` använder den.** De
egna varianta-listorna ligger kvar oförändrade i `cfoFortnoxTenantResolve`,
`ccoPatientAssetIdentity`, `clinicConversionFunnel`, `ccoDriveImportReviewReadService`,
`ccoJournalQaDashboardStore` med flera.

Det du levererade är alltså modulen plus §2 — inte §3. Det är i sig ett rimligt
första steg, och modulen är rätt byggd. Men rapporten säger "§3 byggd", och det
gör den inte.

---

## Vad som gäller nu

**Kvar av §3 — egen omgång, inte ett svep:**
migrera de 25 filerna med `hairtpclinic`-default och de 31 med egna listor till
modulen. En fil i taget, med ett test per fil som visar vilken vy som ändrade
svar. Ett massbyte här har samma form som duplicerings-buggen: det ser rätt ut
och alla tester är gröna tills en legacy-rad passerar.

**Före allt annat:** de 767 raderna. Nu är det inte längre städning utan en
förutsättning.

**Rör inte** BRAND- och FORMVARIANT-raderna. `patientDocumentSignRegistry.js`
bär fortfarande `DEFAULT_TENANT = 'hair_tp'` (rad 33) och
`formVariant: 'hair_tp'` (rad 63, 79) i samma fil.

En sak till: ditt test skrev `formVariant: 'curatiio_op'`. Den varianten togs
bort i ORD-164 samma dag — kanoniskt är `curatiio_bleph`. Läs
`tests/ops/signeringsvariantHarSchema.test.js` innan du rör
signeringsregistret.
