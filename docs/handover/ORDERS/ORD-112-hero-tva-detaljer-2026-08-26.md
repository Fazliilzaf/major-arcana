# ORD-112 · Hero — två detaljer mot facit

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-109

Kort order. Två saker, båda i hero.

---

## Först: de tre gapen är stängda

Jag mätte i produktion, inte på din rapport:

|                                | Resultat                                                                    |
| ------------------------------ | --------------------------------------------------------------------------- |
| `.av-body`                     | finns, med `av-empty`, `av-empty-cta`, `av-timeline`                        |
| Tidslinjenoder                 | **5**                                                                       |
| Snabbknappar                   | **4** med `data-v11-active-visit-action`                                    |
| Kollapsknapp                   | `▾` → `▸`, klassen växlar till `collapsed`, `.av-body` blir `display: none` |
| Sektionen synlig när kollapsad | **ja** — facits regel håller                                                |
| Hero                           | `tags`, `head-badges`, `step-pill`, `btn-edit-profile` alla på plats        |

`next-wait` saknas, men kunden har noll kommande bokningar — korrekt
utelämnat enligt din egen beskrivning.

Med ögat är det facit-material nu: guldknappen, preflight-tidslinjen
bokad → HD saknas → check-in → journal → klart, och Foto/Ant./Slut. i
rätt färger.

Två detaljer kvar.

---

## 1 · Kund-ID visas som hela UUID:t

`cco-v13-render.js:75`:

```js
if (pid) contact.push('<span class="id">Kund-ID: ' + esc(pid) + '</span>');
```

Det ger 36 tecken som bryter över två rader i en 340 px spalt:

```
Kund-ID: 03c7a38d-e58d-4810-8fb0-
496fbf66d6e7
```

Facit visar kort form (`V13-HOGERSPALT`, rad 1733):

```html
<span class="id">Kund-ID: aj-9c14</span>
```

Och V12-canon kortar redan, `cco-v12-canon.js:202`:

```js
esc(pid.slice(0, 8)) +
  (personnummer ? ' · ' + esc(personnummer) : ' · personnr ej registrerat');
```

**Gör som V12-canon.** Åtta tecken plus personnummer eller "personnr ej
registrerat". Den formen finns redan i produktion i V11-railen, så
personalen känner igen den.

---

## 2 · Bara en av tre taggar renderar

`cco-v13-render.js:83`:

```js
var brand = txt(card.brandLabel || card.brand || card.tenantLabel);
```

För kunden `03c7a38d-…` ger det inget, så `Hair TP`-chipet uteblir.
`card.isNewCustomer` ger inte heller något. Enda taggen som renderar är
`HD saknas`.

Facit visar tre (rad 1735–1739):

```html
<span class="tag info">Hair TP</span>
<span class="tag warning">HD saknas</span>
<span class="tag neutral">Ny kund</span>
```

Kunden **är** uppenbart en Hair TP-kund — hela tenanten är det. Så
antingen bär `card` varumärket under ett annat namn, eller så sätts det
aldrig.

**Ta reda på vilket innan du ändrar.** Skriv i leveransen vilket fält du
band den till och varför. Om varumärket inte finns på kortet alls —
säg det, och föreslå var det borde komma ifrån. Hitta inte på ett
fallback-värde: din kommentar på rad 77 säger _"enbart ur riktig data,
inga påhittade chips"_ och den principen är rätt.

Samma sak för `isNewCustomer`. Finns det ett fält som säger hur länge
kunden funnits? Om inte — vad ska "ny" betyda?

---

## Gränser

- Rör inte V11 eller V12. `?v13=off` ska fortsätta ge
  `patient-master-card v11-rail`.
- Inga påhittade värden. Saknas datan är rätt svar att säga det.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

På kundkortet med `?v13=on`:

```js
const c = document.querySelector('#s-hero .contact');
({
  idLängd: (c.textContent.match(/Kund-ID:\s*(\S+)/) || [])[1]?.length, // ska vara 8
  taggar: [...document.querySelectorAll('#s-hero .tags .tag')].map((t) =>
    t.textContent.trim()
  ),
});
```

Idag: `idLängd: 36`, `taggar: ['HD saknas']`.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`

Sviten var **7 236 pass / 0 fail** när jag körde den senast. Rapportera
det verkliga talet.
