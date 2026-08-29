# ORD-139 · Kadensen hör hemma i configen, inte i dokumentets id

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`95a97123`)
**Rättar:** ORD-137 §5
**Föregås av:** ORD-111, ORD-127, ORD-138

---

## Först: ORD-137 §5 var mitt fel

Jag lät `journal_estetik_follow_4/8/12` gå igenom med motiveringen "samma
kadens som Hair TP". Två saker var fel med det.

**Kadensen stämmer inte.** `config/cco-treatment-document-requirements.json`
bär redan femton behandlingar med var sin kadens, och flera räknas i
veckor och dagar:

```
fue · dhi · beard · eyebrow   4m · 8m · 12m
botox                         2w_touchup_window · 3m_re_treat_window
filler                        2w_check · 12m_re_treat
profhilo                      1m · 2m_second_session · 6m
bleph                         7d_suture_removal · 3m · 12m
prp_hair · prp_skin           2w_after_each_session · 1m_after_final
microneedling_hair            1w_after_each_session · 1m_after_final
mesotherapy                   1w_after_each
fat_dissolving                2w_each_session · 1m_after_final
orthopedics_prp               1w_pain_check · 1m · 3m_outcome · 6m
trichoscopy                   (ingen)
```

**Och principen var redan beslutad.** `ccoAftercareSchedulerStore.js:210`
bär kommentaren från ORD-111:

> "Väg B: delad mall per tillfälle i stället för per behandling.
> Behandlingstypen kommer in som `{{treatment}}`-variabel vid sändning."

Jag godkände en rad som gick emot ett beslut som redan fanns i koden. Den
här ordern rättar det.

---

## Beslutet

Fazli, 2026-08-28: **ja.** En dokumenttyp utan siffra, kadensen ur
configen.

---

## Uppgiften

### 1 · En rad i stället för tre

`journal_estetik_follow_4` · `_8` · `_12` → **`journal_estetik_follow`**

Ingen siffra i id:t. `flowApplies` behåller de åtta estetikflödena.
Tillfället är en variabel, inte en dokumenttyp — samma princip som
ORD-111.

Skälet är ORD-127. Där satt kadensen i id:t, en klinisk ändring från 6 till
8 månader blev en omdöpning i tolv filer. Skulle vi göra det per behandling
nu blir det elva id:n, och nästa kadensändring börjar om samma arbete.

### 2 · Bygg inte om kadenslogiken — den finns

Det här är orderns viktigaste punkt.

Din plan sa "lär planeraren läsa configen" och "lägg till dag/vecka-offset".
**Båda finns redan**, i `ccoAftercareSchedulerStore.js`:

| Finns redan                                   | Var                            |
| --------------------------------------------- | ------------------------------ |
| Läser `followupCadence` ur configen           | rad 198                        |
| `parseCadenceOffset` — `h` · `d` · `w` · `m`  | rad 42–54                      |
| `after_final` och `each_session`              | rad 51–52, `expandCadencePlan` |
| Delad mall per tillfälle (`followup_<token>`) | rad 208–211                    |
| **Skapar journalutkast vid schemaläggning**   | rad 214                        |

Skriv ingen andra parser och ingen andra configläsning. Två schemaläggare
med var sin kadenslogik glider isär — och den som läser koden om ett år vet
inte vilken som gäller.

Det är samma misstag som den duplicerade foto-annotation-routern. Sök i
hela repot innan du bygger.

### 3 · `ccoFollowupDraftPlanner` avvecklas

Frågan är utredd och besvarad. Planeraren är överflödig:

```
rad  38   FOLLOWUP_MONTHS = [4, 8, 12]      hårdkodad
rad  80   addMonthsUtc()                    kan bara månader
rad  87   isTransplantEncounter()           filtrerar bort all estetik
rad 133   leadDays = 30
```

Den producerar dessutom bara `planState` — planrader, inte utkast. En
annan generator skapar utkasten. Aftercare-storet gör hela vägen i ett
steg (`createFollowUpJournalDraft`, rad 218).

**Avveckla planeraren och batch-jobbet `cco_followup_draft_generator`** —
i ett eget steg, med egen verifiering, efter att punkt 1 och 2 är gröna.
Inte i samma commit.

**Rör inte TP-kadensen.** `[4, 8, 12]` stämmer med configens `fue`/`dhi`/
`beard`/`eyebrow`. Den är rätt i dag och ska förbli det. TP-uppföljningar
skapas framöver av aftercare-storet, med samma kadens.

### 3b · Lead-tiden: **utkastet skapas dag 0**

Beslutat. Planerarens 30-dagarsfönster följer inte med.

Tre skäl:

1. **Utkastet skapas i samma händelse som den signerade behandlingen.**
   Ett batch-jobb kan sluta köra utan att någon märker det; ett utkast som
   redan finns kan inte tappas bort.
2. **Filtreringen finns redan.** Jobbet bär `dueAt` (rad 323), listan
   sorteras på det (rad 367) och kön filtrerar `dueAt <= now` (rad 555).
   Att inte visa något som inte förfallit är en vy-fråga — den är löst.
3. Att skapa sent för att styra vad som syns kopplar lagring till
   presentation. Fel lager.

**Det som följer av beslutet:** ett 12-månadersutkast ligger i ett år.
Skriv i rapporten vad som händer med ett oförfallet utkast när vårdepisoden
avslutas eller behandlingen avbokas. Radera inget — se ORD-131:s grindar.

### 4 · Påfyllningen från ORD-138

Med en enda dokumenttyp faller regeln ut av sig själv: en påfyllning
schemalägger nya jobb från den dagen, med behandlingens egen kadens, och
använder samma journal. Påfyllningsavsnittet avgör kontroll eller
behandling.

Bygg ingen särskild väg för det.

### 5 · Testet heter fel

`tests/ops/uppfoljningKadens4812.test.js` bär kadensen i filnamnet och
täcker båda vägarna. Döp om det och låt det täcka **flera** kadenser — minst
en i veckor, en i dagar och en i månader.

Ett test som heter `4812` är samma antimönster som ett dokument-id som
heter `_4`.

---

## Godkänt när

1. `journal_estetik_follow` finns som **en** rad. De tre numrerade är
   borta.
2. En botox-uppföljning schemaläggs till **2 veckor**, inte 4 månader.
   Visa det med ett test.
3. En bleph-uppföljning schemaläggs till **7 dagar**. Visa det.
4. `parseCadenceOffset` finns på **ett** ställe i repot. Sök och visa
   antalet träffar.
5. TP-kadensen är oförändrad — 4 · 8 · 12. Ett test som bevisar att den
   inte rörts.
6. `ccoFollowupDraftPlanner` och `cco_followup_draft_generator` är
   avvecklade — **i en egen commit**, efter att 1–5 är gröna. Visa att
   TP-uppföljningarna fortfarande skapas, nu av aftercare-storet.
7. Utkastet finns **dag 0** med `dueAt` i framtiden, och listan visar det
   inte förrän det förfaller. Ett test för vardera.
8. Rapporten svarar på vad som händer med ett oförfallet utkast när
   vårdepisoden avslutas.
9. Mutationstesta: ändra `botox` i configen till en annan kadens och visa
   att schemaläggningen följer med **utan att någon fil döps om**. Det är
   hela poängen med ordern.
10. `CCO_SEND_LIVE` orörd. Raden är `pending`. Ingenting skickas.

## Vad jag inte avgjort

**Om `journal_tp_follow_4/8/12` ska migreras.** De behåller sina siffror
tills vidare. Två mönster i katalogen är en verklig kostnad, men tp:s
kadens stämmer och ändras sällan — migrationen är ett eget arbete, inte en
bisats i den här.

**Vilken kadens som är klinisk rätt.** Configen säger vad den säger. Om en
kliniker vill ändra den är det en configändring — och efter den här ordern
är det också bara en configändring.
