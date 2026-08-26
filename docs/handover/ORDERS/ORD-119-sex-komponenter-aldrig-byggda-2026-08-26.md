# ORD-119 · Sex komponenter i lilla V13 är aldrig byggda

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Facit:** `V13-HOGERSPALT-2026-08-24.html`

Fazli säger att vyn inte ser ut som facit. Jag har gått igenom den
sektion för sektion, klass för klass. Han har rätt — men inte om
färgerna.

---

## Det som stämmer, och som ingen ska röra

**Alla fjorton designtokens är identiska.** `--ink #2b251f`,
`--ink-mute #8a8174`, `--gold #d4a847`, `--amber #c8821e`,
`--green #4a8268`, `--red #b94a4a`, `--info #4a7ba8`, `--lila #7c3aed`,
`--bg-page #f1ebe1`, `--vip-ink #bb4779`, plus `--hair`, `--ink-soft`,
`--card-bg` och `--shell-bg` — samma värden som i facit.

**Typografin är exakt:**

| Element                 | Facit                                                   | Produktion   |
| ----------------------- | ------------------------------------------------------- | ------------ |
| `.sec-label`            | 9,5 px · 800 · .14em · versaler · ink-mute              | **identisk** |
| `.btn-action`           | 5/10 px · 999 px · #e89a2e→#c8821e · 9 px · 800 · .08em | **identisk** |
| `.btn-action.secondary` | vit gradient, ink, vit kant                             | **identisk** |
| `.tag`                  | 2/8 px · 999 px · 9 px · 800 · .04em                    | **identisk** |
| `.shell`                | 340 px · radie 24 · shell-gradient · skugga             | **identisk** |

**Alla 17 sektioner finns, i rätt ordning, med rätt rubriker.**

CSS-porten från ORD-107/109 är alltså gjord ordentligt. Skillnaden Fazli
ser sitter i **innehållet**, inte i stilen.

---

## Sex komponenter finns inte i renderaren

Noll träffar i `app/cco-v13-render.js` — de är inte trasiga, de är inte
skrivna:

| Sektion        | Saknade klasser                         | Vad det är i facit                                              |
| -------------- | --------------------------------------- | --------------------------------------------------------------- |
| **s-insights** | `sticky` · `sticky-grid` · `sticky-btn` | **Hela åtgärdsfältet — fem knappar**                            |
| **s-resa**     | `j-steps` · `j-step` · `j-expand`       | Steglistan under progressbaren: badge, etikett, status per steg |
| **s-plan**     | `q-right` · `q-status` · `q-amount`     | Offertradens högerkolumn — status och belopp                    |
| **s-journal**  | `j-status` · `notes-divider`            | Statuskolumn per journalrad + avdelare mot anteckningar         |
| **s-foto**     | `photo-foot` + Begär-knappen            | Fotsektionen under bildrutnätet                                 |
| **s-warn**     | `warn-more`                             | "Fler varningar"-raden                                          |

### Den viktigaste: sticky-fältet

Facit avslutar spalten med fem knappar (rad ~1180):

```html
<div class="sticky">
  <div class="sticky-grid">
    <button class="sticky-btn gold full">
      📤 Skicka HD nu · blockerar konsultation
    </button>
    <button class="sticky-btn ghost">+ Anteckning</button>
    <button class="sticky-btn ghost">📷 Foto</button>
    <button class="sticky-btn green full">📅 Boka uppföljning</button>
    <button class="sticky-btn primary full">Öppna full arbetsyta →</button>
  </div>
</div>
```

`.sticky-btn` i produktion: **finns inte**. Det är hela "vad gör jag
nu"-ytan som fattas — den som gör spalten till ett arbetsredskap i
stället för en sammanfattning.

Byggstenen finns redan: `buildStickyActions` i
`app/cco-v11-rail-adapters.js:822`, oanvänd av V13.

### Steglistan i kundresan

Produktionen visar rubrik, stegbricka och en procentbar. Facit visar
**dessutom** varje steg som en rad med badge, etikett och status
(`done` / `active` / `todo`) plus en `j-expand`-rad. Utan den är
"Kundresa · mini" bara en mätare — man ser att man är på steg 3 av 9,
inte vilka de andra åtta är.

---

## Etiketter som skiljer

| Sektion  | Facit                  | Produktion |
| -------- | ---------------------- | ---------- |
| `s-warn` | **Skicka** · **Begär** | Visa       |

Facits varningsrader erbjuder åtgärden. Produktionens skickar dig
vidare för att titta. Det är skillnad på ett arbetsflöde och en länk.

---

## Det som ser saknat ut men inte är fel

Följande klasser saknades i min mätning **för just den här kunden**,
eftersom det inte finns data: `photo-grid`, `photo-tile`, `comm-row`,
`comm-preview`, `warn-row`, `next-wait`, `doc-meta`, `chip`. Alla finns i
renderaren. **Bygg inte om dem.**

Kontrollera mot en kund med foton, kommunikation och varningar innan du
rör något i de sektionerna.

---

## Uppgift

Bygg de sex komponenterna, i den här ordningen:

1. **`sticky` / `sticky-grid` / `sticky-btn`** i `s-insights`. Återanvänd
   `buildStickyActions`. Knapparnas villkor styrs av kortets tillstånd —
   "Skicka HD nu" ska bara visas när hälsodeklarationen saknas, precis
   som facits `gold full`-variant antyder.
2. **`j-steps` / `j-step` / `j-expand`** i `s-resa`. Datan finns i
   `buildCanonicalJourneyLive` — samma nio steg som redan driver
   procentbaren.
3. **`q-right` / `q-status` / `q-amount`** i `s-plan`.
4. **`j-status` / `notes-divider`** i `s-journal`.
5. **`photo-foot`** + Begär-knappen i `s-foto`.
6. **`warn-more`** i `s-warn`, och byt etiketterna till **Skicka** och
   **Begär**.

**Kopiera facits markup och klassnamn ordagrant.** CSS-reglerna finns
redan i `cco-v13-rail.css` — det är därför de fem primitiven jag mätte
stämmer på pixeln. Skriver du egna klassnamn tappar du stilen.

## Gränser

- **Rör inte tokens, typografi eller `.shell`.** De är rätt. Jag har
  mätt dem mot facit och de stämmer.
- Inga påhittade värden — saknas datan ska raden utebli, som idag.
- Stora vyn (`.workspace`) är utanför den här ordern.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

I produktion, på en kund med data (`82e48577-…` har både offert och
varningar):

```js
const rail = document.querySelector('#v13-rail');
const har = (c) => !!rail.querySelector('.' + c);
({
  sticky: har('sticky-btn'), //  ska bli true
  stickyAntal: rail.querySelectorAll('.sticky-btn').length, //  5
  jSteps: rail.querySelectorAll('.j-step').length, //  9
  jExpand: har('j-expand'),
  qStatus: har('q-status'),
  qAmount: har('q-amount'),
  jStatus: har('j-status'),
  photoFoot: har('photo-foot'),
  warnMore: har('warn-more'),
});
```

Alla ska vara `true` respektive rätt antal. Idag är samtliga `false`
eller `0`.

Kontrollera samtidigt att de fem primitiven **inte** har ändrats:

```js
const c = getComputedStyle(rail.querySelector('.sec-label'));
[c.fontSize, c.fontWeight, c.letterSpacing]; //  9.5px, 800, 1.33px
```

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`
