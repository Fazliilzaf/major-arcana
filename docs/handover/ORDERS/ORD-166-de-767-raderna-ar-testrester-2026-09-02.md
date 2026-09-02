# ORD-166 — de 767 raderna är inte en stavningsfråga

**Arbetsorder · 2026-09-02**
**Bas:** `main` (`b02912cc`)
**Föregås av:** ORD-165 §3, TILLÄGG 1 och 2
**Grind:** ORD-131 · `CCO_SEND_LIVE` orörd · ingen radering utan ägarbeslut
**Prioritet:** P2 — ingen patient påverkas, men siffran förorenar varje mätning

---

## Vad mätningen visade

Tre gånger har den här tråden handlat om att `hairtpclinic` är en femte
tenant-stavning som måste migreras. Den slutsatsen höll inte. Mätt i prod
2026-09-02, `/var/data/cco-journal.json`:

```
journalposter totalt                5 943
  hairtpclinic                        767   12,9 %
  hair-tp-clinic                    5 176

de 767, uppdelade:
  cco-readiness-smoke-1780402011      254
  cco-pilot-20260602-a                259
  cco-pilot-20260602-b                253
  cco-pilot-20260602-c                  1

  samtliga journalType                consultation_plan
  samtliga fält                       tomma
  764 av 767                          "låsta" och "signerade"
  skapade                             2026-06-02 12:06 → 2026-06-03 07:16
  finns i cco-patient-master          nej, ingen av de fyra
  förekommer i annan fil i /var/data   nej, ingen
```

**De 767 raderna är rester från ett smoke-test och en pilotkörning.** Ingen av
de fyra patienterna finns i patientregistret. Alla fälten är tomma. De 764
"signerade" posterna är signerade tomma formulär, signerade av en testkörning.

Korrelationen är exakt: varje `hairtpclinic`-rad är en testrad, och varje
testrad är en `hairtpclinic`-rad. Det finns ingen tredje kategori.

**Åtgärden är alltså inte migrering. Det är städning.**

---

## Vad detta rättar i det jag själv skrivit

**TILLÄGG 1:** *"Ett jobb som kördes en gång med fel stavning."* Nära, men jag
angav det som fakta utan att ha tittat. Det var ett smoke-test, inte ett
importjobb, och det syns i patient-id:na — inte i tidsfönstret jag byggde
slutsatsen på.

**TILLÄGG 2:** *"`hairtpclinic` är kodens vanligaste default (52 ställen i 25
filer) … systemet är inte överens med sig självt om vad Hair TP heter … de 767
raderna är inte längre städning utan en förutsättning."*

De 52 defaulterna finns och räkningen stämmer. Men slutsatsen om deras verkan
gjorde jag för stark: **de har producerat noll riktiga patientrader.** Det enda
de gav upphov till är testresterna ovan. Det är samma sorts övertolkning som jag
just kritiserade agenten för när den sa att `hair_tp` "höll i skrivvägen" — jag
gjorde om det, en dag och en stavning bort.

Kodens inkonsekvens är verklig och värd att rätta. Den är inte en pågående
dataskada.

---

## Beslutet som behövs innan något görs

Raderna är testdata, men de är skrivna som signerade journalposter i ett
patientjournalsystem. Vem som får radera vad ur en journal är inte en teknisk
fråga. **Ingen radering sker utan ägarens besked**, och frågan bör ställas till
Nordbro om det finns minsta tvekan.

Tre vägar, i ordning efter hur lite de förstör:

| | Vad som händer | Vad som vinns | Vad som förloras |
|---|---|---|---|
| **A · Märk** | Sätt `isTestData: true` på de 767, filtrera bort dem i vyer och mätningar | Inget raderas. Spåret finns kvar. | Siffran 5 943 fortsätter vara fel för den som inte känner till flaggan |
| **B · Arkivera och ta bort** | Skriv de 767 till `/var/data/arkiv/`, ta bort dem ur journalen | Journalen blir 5 176 riktiga poster. Går att återställa. | Två sanningar tills arkivet städas |
| **C · Ta bort** | Radera de 767 | Renast | Oåterkalleligt |

Min läsning: **A eller B.** C ger ingen fördel över B, och en oåterkallelig
radering i ett journalsystem är inte något jag rekommenderar för att en siffra
ska bli snyggare.

---

## Uppgiften, när beslutet finns

### 1 · Skriv skriptet som en torrkörning först

Det ska gå att köra utan att röra något och skriva ut exakt vilka 767 poster som
skulle träffas, med patient-id och antal. Ingen skarp körning innan den listan
är läst och stämmer med siffrorna i den här ordern.

Kriteriet ska vara **både** tenant och patient-id — inte bara stavningen. En
framtida riktig rad med `hairtpclinic` ska inte kunna svepas med.

### 2 · Ta backup av `/var/data/cco-journal.json` före skarp körning

Samma mönster som `pre-cleanup-`-filerna som redan finns i `/var/data`.

### 3 · Testet som hindrar att det händer igen

Ett smoke-test skrev 767 signerade journalposter i produktionsdatabasen. Det är
det egentliga felet — stavningen var bara hur det blev synligt.

Skriv testet som failar när en journalpost skapas med ett patient-id som matchar
testmönstret (`cco-readiness-smoke`, `cco-pilot-`, `cco-smoke`, `uat-`, `test-`)
utan att `isTestData` är satt. Mutationstesta det.

### 4 · Först därefter: stavningen i koden

De 52 ställena som defaultar till `hairtpclinic` och de 31 filerna med egna
variant-listor. **En fil i taget, med ett test per fil som visar vilken vy som
ändrade svar.** Ett massbyte har samma form som duplicerings-buggen i
`8c401043`: det ser rätt ut och alla tester är gröna tills en rad med gammal
stavning passerar.

**Rör inte** journalens skrivväg. Se kommentaren i `ccoJournalStore.upsertEntry`
och `tests/ops/ccoJournalTenantNormalizeBlockerad.test.js`. Den ordningen gäller
fortfarande: migrera först, gör `upsert` entryId-baserad sedan, normalisera sist.

---

## Godkänt när

1. Ägaren har valt A, B eller C — nedskrivet i den här filen.
2. Torrkörningen listar exakt 767 poster fördelade 254/259/253/1.
3. Backup tagen före skarp körning.
4. Efter körning: `cco-journal.json` innehåller 5 176 poster och noll med
   `hairtpclinic`, mätt i prod.
5. Testet i §3 finns och är mutationstestat.
6. Ingen ändring i skrivvägen, i `tenantIdCanonical`, eller i BRAND-/
   FORMVARIANT-raderna.

---

## Vad jag inte avgjort

**Om de tre osignerade av de 767 skiljer sig från de 764.** Jag räknade dem men
tittade inte på vad som gör dem annorlunda.

**Om samma smoke-test lämnat rester i andra stores.** Jag sökte på de fyra
patient-id:na i alla filer under 60 MB i `/var/data` och fick träff bara i
`cco-journal.json`. Fyra filer hoppades över för storleks skull:
`capability-analysis.json` (160 MB) och tre `cco-patient-assets`-filer (358 MB
vardera). De är inte genomsökta.
