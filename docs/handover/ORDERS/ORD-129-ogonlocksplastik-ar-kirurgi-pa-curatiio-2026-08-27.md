# ORD-129 · Ögonlocksplastik är kirurgi — och den utförs på Curatiio

**Arbetsorder · 2026-08-27**
**Bas:** `main` (`9589d47a`)
**Till:** DeepSeek
**Bekräftat:** Fazli 2026-08-27 — **ögonlocksplastik utförs i Curatiio.**

---

## Varför det här är en order och inte bara en notering

Curatiio behandlas i koden som den icke-kirurgiska kliniken. En av deras
åtta behandlingar är ett kirurgiskt ingrepp. Den motsägelsen är inte
farlig i dag — men den ligger en rad från att bli det.

### Uppmätt i `public/major-arcana-preview/app/cco-kundkort-kkx.js`

```js
var STEP_VARIANTS = {
  hairTP: {},
  nonSurgical: {
    8: { skip: true, note: 'Icke-kirurgisk — ingen operationsdag' },
    9: { title: 'Bildsamtycke', … },   // ORD-122: hoppas ALDRIG över
  },
  minorSurgery: {
    6: { skip: true, note: 'Mindre ingrepp — ingen betänketid' },
    8: { title: 'Friskförsäkran', when: 'behandlingsdagen', note: 'Ambulant ingrepp' },
  },
};

var TREATMENT_TYPE_VARIANT_HINTS = {
  prp: 'nonSurgical',
  hårbehandling: 'nonSurgical',
  'hair treatment': 'nonSurgical',
};
```

`nonSurgical` sätter **`8: { skip: true }`** — hela operationsdagen
hoppas över.

Ögonlocksplastik finns inte i `TREATMENT_TYPE_VARIANT_HINTS`, så den
auto-klassas inte i dag. **Det är alltså ingen bugg just nu.** Men den
dagen någon lägger in Curatiios behandlingar i den listan — vilket är den
naturliga nästa handgreppet när Curatiio ska stödjas — försvinner
operationsdagen och därmed friskförsäkran för en patient som ska sövas
och skäras i.

Curatiio-sidan säger vad som gäller:

> Ögonlocksplastik (bleph) · Förlopp: kirurgiskt ingrepp; op-dag +
> återbesök enligt plan. · Journaltyp: Estetik-journal (op).
> **Friskförsäkran på op-dag.** · `steg8-friskforsakran-final.html`

`minorSurgery` är varianten som redan gör rätt: den behåller steg 8 och
byter titeln till Friskförsäkran på behandlingsdagen.

---

## Uppgiften

1. **Klassa ögonlocksplastik som `minorSurgery`** — via
   `TREATMENT_TYPE_VARIANT_HINTS` eller explicit `card.pathVariant`. Välj
   det som är svårast att råka ändra av misstag, och motivera valet i
   committen.

2. **Skriv kommentaren.** `nonSurgical` behöver samma sorts spärrkommentar
   som ORD-122 satte på steg 9:

   > Curatiio är inte synonymt med icke-kirurgiskt. Ögonlocksplastik är
   > ett kirurgiskt ingrepp och ska ha `minorSurgery`, aldrig
   > `nonSurgical` — steg 8 bär friskförsäkran.

3. **Kontrollera hela `minorSurgery`-varianten mot Curatiio-sidan.** Den
   hoppar över steg 6 (betänketid). Är det rätt för ögonlocksplastik?
   Katalogen har `undantag_betanketid` och `undantag_angerratt` som
   requiredFor-värden. **Fråga Fazli** — betänketid inför kirurgi är en
   juridisk fråga, inte en teknisk. Antag ingenting.

4. Ta med de övriga sju Curatiio-behandlingarna när du ändå är där, men
   som en separat lista i text som Fazli får bekräfta — inte som kod du
   skriver på eget bevåg.

## Godkänt när

1. Ett test där en patient har ögonlocksplastik visar **steg 8 kvar** med
   friskförsäkran. Mutationstesta: sätt varianten till `nonSurgical` och
   visa att testet blir rött.
2. Kommentaren i `STEP_VARIANTS` finns och namnger ögonlocksplastik.
3. Betänketidsfrågan är ställd till Fazli, inte avgjord av dig.

## Rör inte

- Steg 9. ORD-122 slog fast att bildsamtycke aldrig hoppas över, oavsett
  variant. Den regeln står fast.
- `hairTP` som kanonisk väg.
