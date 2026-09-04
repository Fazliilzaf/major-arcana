# Varför samma kund visar steg 1 i lådan och steg 4 i kortet

**Analys 4 sep 2026.** Spårad i kod, inte gissad. Vad som är bevisat och vad som
återstår att bekräfta står utskrivet.

---

## Fyndet: det finns tre uträkningar av samma sak

```
buildCanonicalJourneyLive()          ← EN källa, cco-kundkort-kkx.js:693
        │
        ├── buildJourneyFromState()  ← V11-adaptern (v11-rail-adapters.js:690)
        │      cur: j.activeStep || null
        │      total: steps.length
        │
        └── polishReferensJourney()  ← Legacy referens (kundkort-referens.js:1793)
               cur: activeStep ?? active.id ?? doneCount
               total: 9  (HÅRDKODAT)
```

Källan är gemensam. **Det som skiljer är vad de gör när svaret saknas.**

---

## Fel 1 · Fallbacken visar ANTAL KLARA som om det vore aktuellt steg

`cco-kundkort-referens.js:1802`

```js
cur:
  canonicalJourney.activeStep != null
    ? canonicalJourney.activeStep
    : active
      ? active.id
      : doneCount,          // ← här
```

Saknas `activeStep`, och finns inget steg med status `active`, används
**`doneCount`** — antalet avklarade steg.

Det är två helt olika tal. För Abbe Boccard: Hälsodeklarationen är signerad,
alltså `doneCount = 1` → gränssnittet skriver **"STEG 1 AV 13"**.

Kunden står inte på steg 1. Hon har ett steg klart. Siffran är sann om något
annat än det den påstår sig beskriva.

V11-adaptern gör rätt i samma läge:

```js
cur: j.activeStep || null; // → vyn skriver "Steg — / 13"
```

Ett tomt streck är ärligt. En siffra som betyder något annat är det inte.

---

## Fel 2 · `total` är hårdkodat till 9 i den ena vägen

`cco-kundkort-referens.js:4543–4545`

```js
var polished = polishReferensJourney(canonicalJourney, steps, cur, 9);
steps = polished.steps;
cur = polished.cur;
total = 9;
```

Nio, medan gränssnittet säger 13. Adaptern räknar i stället `steps.length` — det
faktiska antalet.

Kommentaren i `cco-kundkort-kkx.js:601` känner till problemet:

> _"kan summa till 12 medan rubriken säger 'av 13'. Medveten avgränsning."_

Det var medvetet en gång. Nu finns tre olika tal för samma nämnare.

---

## Fel 3 · Mini och hero räknar `cur` på olika sätt — i SAMMA vy

`cco-v13-render.js`

| Rad     | Vad             | `total`                                | `cur` när det saknas |
| ------- | --------------- | -------------------------------------- | -------------------- |
| 85–86   | `hero()`        | `journey.total` ?? 9                   | **`null`**           |
| 402–403 | `journeyMini()` | `steps.length` ?? `journey.total` ?? 9 | **`0`**              |
| 931–932 | `wsHero()`      | `journey.total` ?? 9                   | `null`               |

Rubriken läser `journey.total`. Minilistan räknar `steps.length`. Är listan
kortare än totalen — vilket den blir när steg hoppas över via `STEP_VARIANTS` —
säger de två olika saker på samma skärm.

**Det förklarar lådan i din skärmbild:** "Steg 1 av 13" i rubriken,
"1 klara · 1 pågår · 12 kommande" undertill, och steg 3 markerat SIGNERAD. Tre
tal ur tre uträkningar.

---

## Varför `activeStep` saknas i den ena vyn

Båda skalen anropar samma `assemble(ctx)` (`cco-v13-render.js:1384`):

```js
journey: call(
  'buildJourneyFromState',
  [card, ctx.journalEntries, bundle],
  null
);
```

Uträkningen är alltså identisk. **Skillnaden ligger i `ctx`.**

`buildCanonicalJourneyLive(card, journalEntries, dossierBundle, extras)` väger
in journalposter och dossier-bundle för att avgöra vilket steg som är aktivt.
Får den mindre bevis blir svaret ett annat — och när inget steg kan markeras
aktivt slår fallbacken i fel 1 till.

Dessutom matas källan med olika fjärde argument beroende på väg:

```js
// V11/V13-vägen
kkx.buildCanonicalJourneyLive(card, journalEntries, dossierBundle, {}); // tom

// Legacy referens-vägen
kkx.buildCanonicalJourneyLive(bcard, journalEntries, bundle, ctxExtras); // bookingExtras
```

**BEVISAT:** de tre uträkningarna finns, med de skillnader som står ovan.
**INTE BEVISAT:** att lådan får en tunnare `ctx` än kortet. Det är slutsatsen
koden pekar mot, men den kräver en mätning i webbläsaren på just den kunden —
läs `ctx.journalEntries` och `ctx.dossierBundle` i båda lägena och jämför.

---

## Och en fjärde renderare i beredskap

`patient-master-ui.js:7415`

```
usesV13View()   →  V13 full / detail        (default PÅ sedan 2026-08-26)
     ↓ faller tillbaka
V11-rail                                    (default PÅ, opt-out)
     ↓ faller tillbaka
kkref (legacy referens)                     ← den med doneCount och total: 9
```

Fallbacken finns för att aldrig visa en blank vy — rätt tänkt. Men den betyder
att en krasch i V13 tyst byter till en renderare som räknar annorlunda. Vyn
fortsätter fungera och börjar visa andra siffror, utan att någon får veta.

---

## Vad jag föreslår

### Steg 1 — bekräfta ctx-skillnaden

En mätning i webbläsaren på Abbe Boccard: logga `ctx.journalEntries.length` och
`Boolean(ctx.dossierBundle)` i både lådan och kortet. Bekräftar eller kullkastar
slutsatsen ovan. Utan den bygger jag på en läsning av koden.

### Steg 2 — servern räknar, vyerna visar

Flytta stegberäkningen till servern: **ett** svar per kund, som alla vyer läser.

```
GET /api/v1/cco/customer/:id/journey
  → { steg: 4, av: 13, aktivt: 'Konsultation',
      klara: 1, nasta: 'Journal saknas', variant: 'hairTP' }
```

Vinsten är inte kosmetisk. Servern har hela underlaget — journal, dokument,
bokningar — oavsett vilken vy som frågar. Ingen vy kan då räkna på halva bevis,
och en fallback kan inte längre byta matematik i tysthet.

### Steg 3 — ta bort fallbacken som ljuger

`doneCount` som `cur` ska bort oavsett vad som väljs i steg 2. Vet vi inte
steget ska det stå `—`, inte ett tal som betyder något annat.

---

## Vad det här säger om riktningsvalet

Du ville ta beslut om vilket håll som är bäst för personalens effektivitet efter
den här analysen. Ett underlag:

Det finns i dag **fyra renderare** för samma kundkort (V13 full, V13 detail,
V11-rail, legacy kkref), valda av flaggor, med fallback mellan sig. Det är
27 000 rader som beskriver samma kund på fyra sätt.

Det är inte i sig ett fel — det är hur en produkt ser ut när den byggts om tre
gånger utan att det gamla tagits bort. Men det är den verkliga kostnaden för
personalen: samma kund, olika svar, beroende på var man klickade.

**En serversanning löser det utan att någon vy behöver skrivas om.** Det är
därför jag föreslår den före allt annat på den här listan.
