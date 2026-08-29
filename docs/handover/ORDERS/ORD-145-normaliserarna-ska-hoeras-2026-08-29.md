# ORD-145 · Normaliserarna ska höras när de kastar fält

**Arbetsorder · 2026-08-29**
**Bas:** `origin/main` (`08d5b912`)
**Utlöst av:** `signatureProof` föll tyst ur `normalizeAgreement` och
`normalizeCommercialCase` — beviset hade aldrig nått disken.

---

## Problemet

Normaliserarna bygger sina objekt fält för fält. Skickar någon in ett fält
som inte står i listan **försvinner det utan ett ljud**. Inget kastas,
ingenting loggas, testet blir grönt.

Det är sjätte gången samma mönster den här veckan:

|                                 | Vad som var tyst                        |
| ------------------------------- | --------------------------------------- |
| `JOURNAL_STATUSES`              | okänt status föll tillbaka till `draft` |
| `journalStore` i schedulern     | utkast skapades aldrig i produktion     |
| `adapt(l.ccoAftercareStore, …)` | tomma listor, fel metodnamn             |
| foto-annoteringen               | store byggd, aldrig anropad             |
| avbokningsrutten                | fel sväljs i ett fält ingen läser       |
| **normaliserarna**              | **okända fält kastas**                  |

`signatureProof` upptäcktes för att någon letade. Frågan är vad som redan
har försvunnit utan att någon gjorde det.

## Vad ordern **inte** är

**Lägg inte till fält i whitelists.** Det lagar en instans i taget och
lämnar nästa åt slumpen.

**Ändra inte vad som sparas.** Ordern gör bortfallet _synligt_, inget
annat. Börjar en normaliserare plötsligt bevara ett fält den tidigare
kastade är det en dataformsändring förklädd till observerbarhet — och det
är farligare än buggen vi lagar.

---

## Uppgiften

### 1 · En delad hjälpare, inte 271 ändringar

Repot har **271 filer** i `src/ops/` med normaliserare. Rör dem inte alla.

Bygg **en** modul som tar indata och det byggda objektet, jämför nycklarna
och rapporterar dem som föll bort.

### 2 · Bara utanför produktion

`config.js:184` har redan `nodeEnv`, och `ccoJournalStore.js:691` visar
mönstret (`NODE_ENV !== 'test'`). Använd det som finns.

I produktion ska hjälparen vara en no-op. Det här är ett
utvecklingsverktyg, inte en runtime-kontroll — den får inte kosta något i
en het kodväg och inte fylla produktionsloggen.

### 3 · Undantagslista för det som ska kastas

En del fält kastas med flit: interna, tillfälliga, utfasade. De ska stå i
en **namngiven lista med skäl**, inte tystas med en generell filtrering.
Listan är dokumentation — nästa läsare ska se att bortfallet var avsiktligt.

### 4 · Börja med de åtta som bär patient- och juridikdata

54 normaliserare, inte 271:

```
ccoBookingEngineStore        14
ccoPatientMasterStore        10
ccoConsultationStore          9
ccoCommercialStore            7   ← normalizeCommercialCase
ccoJournalStore               7
ccoTreatmentAgreementStore    4
ccoPhotoAnnotationStore       2
ccoAftercareSchedulerStore    1
```

### 5 · Kör den, och rapportera vad som faller

**Det här är orderns egentliga leverabel.**

Kör sviten med hjälparen på och skriv ner varje fält som kastas i dag, per
store. Den listan säger om `signatureProof` var ensamt eller ett av flera.

Rättar du något du hittar: **egen commit, en i taget.** Inte i samma pass.

---

## Godkänt när

1. Hjälparen finns på ett ställe. Sök och visa att den inte kopierats.
2. Den är en no-op i produktion. Ett test som visar det.
3. Ett känt fält som kastas ger utslag. Ett test.
4. Undantagslistan har ett skäl per rad.
5. **Ingen normaliserare bevarar något nytt.** Jämför sparad data före och
   efter — byte-identisk. Det är den viktigaste punkten.
6. Rapporten finns i `docs/handover/`, per store.
7. Mutationstesta: ta bort ett fält ur en whitelist och visa att hjälparen
   fångar det.

## Vad jag inte avgjort

**Vad som ska göras med det som hittas.** Vissa fält ska börja sparas,
andra ska bort ur anropande kod. Det avgörs per fynd, inte i förväg.

**Om hjälparen ska köras i CI.** Först vill vi veta hur mycket den hittar.
Larmar den på hundra fält blir den brus och stängs av. Mät först.
