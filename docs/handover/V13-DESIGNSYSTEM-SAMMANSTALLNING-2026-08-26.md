# V13 · Designsysten — komplett sammanställning

**Sammanställning · 2026-08-26 · källan är den portade facit-CSS:en i
`cco-v13-rail.css` + `cco-v13-workspace.css` (verbatim ur
V13-HOGERSPALT/V13-WORKSPACE-facit 2026-08-24) + app-wiring-lagret.**

---

## 1 · Paletten — exakt, varje färg med HEX

### Tokens (gäller för båda V13-vyerna)

| Token                        | Värde                                                   | Roll                             |
| ---------------------------- | ------------------------------------------------------- | -------------------------------- |
| `--ink`                      | **#2b251f**                                             | Primär text (rubriker, brödtext) |
| `--ink-soft`                 | **rgba(70,60,50,0.72)**                                 | Sekundär text/metadata           |
| `--ink-mute`                 | **#8a8174**                                             | Tertiär text, etiketter          |
| `--bg-page`                  | **#f1ebe1**                                             | Sidbakgrund                      |
| `--lila`                     | **#7c3aed**                                             | Systemtaggar, auto-dokument      |
| `--lila-soft`                | **#b896d8**                                             | Lila bakgrundston                |
| `--amber`                    | **#c8821e**                                             | Varning, pågående                |
| `--amber-bg`                 | **rgba(200,130,30,0.16)**                               | Varningsytor                     |
| `--amber-grad-top`           | **#e89a2e**                                             | Guldknappens topp                |
| `--green`                    | **#4a8268**                                             | Klart, godkänt                   |
| `--green-bg`                 | **rgba(74,130,104,0.16)**                               | Gröna ytor                       |
| `--green-soft`               | **#5fa37e**                                             | Grön accent                      |
| `--red`                      | **#b94a4a**                                             | Blockerare, risk                 |
| `--red-bg`                   | **rgba(185,74,74,0.16)**                                | Röda ytor                        |
| `--info`                     | **#4a7ba8**                                             | Information                      |
| `--info-bg`                  | **rgba(74,123,168,0.16)**                               | Info-ytor                        |
| `--gold`                     | **#d4a847**                                             | Guldstreck/accenter              |
| `--vip-ink`                  | **#bb4779**                                             | Varumärke/AI-accent              |
| `--vip-top` / `--vip-bottom` | **rgba(252,233,240,0.98)** → **rgba(241,207,220,0.95)** | VIP-gradient                     |
| `--hair`                     | **rgba(215,202,194,0.5)**                               | Avdelare                         |
| `--hair-strong`              | **rgba(215,202,194,0.85)**                              | Stark avdelare                   |

### Ytor (gradienter med exakta stoppmärken)

| Yta            | Värde                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Shell-bakgrund | `linear-gradient(180deg, rgba(252,249,245,0.97), rgba(243,237,231,0.92))`                              |
| Kort           | `linear-gradient(180deg, rgba(255,255,255,0.94), rgba(247,241,236,0.86))`                              |
| Shell-skugga   | `0 2px 6px rgba(93,74,60,0.06), 0 30px 60px rgba(93,74,60,0.16), inset 0 1px 0 rgba(255,255,255,0.85)` |
| Kortskugga     | `0 3px 10px rgba(56,40,28,0.08), inset 0 1px 0 rgba(255,255,255,0.92)`                                 |
| Kort-hover     | `0 8px 22px rgba(56,40,28,0.12), inset 0 1px 0 rgba(255,255,255,0.96)`                                 |
| Kortkant       | `1px solid rgba(255,255,255,0.6)`                                                                      |
| Amber-stripe   | `inset 3px 0 0 #c8821e`                                                                                |
| Grön-stripe    | `inset 3px 0 0 #4a8268`                                                                                |

### Knappar

| Knapp             | Bakgrund                                                   | Text                      |
| ----------------- | ---------------------------------------------------------- | ------------------------- |
| Primär (guld)     | `linear-gradient(180deg, #e89a2e, #c8821e)`                | **#fff7e0**-ton, 800-fet  |
| Guld-textvariant  | —                                                          | **#8a6a1a** / **#a07e1f** |
| Sekundär          | vit gradient (`rgba(255,255,255,0.94)→(247,241,236,0.86)`) | **#2b251f**               |
| Sticky gold full  | guldgradienten                                             | ljus text                 |
| Sticky green full | `--green`-familjen                                         | ljus text                 |
| Sticky ghost      | vit/vellum                                                 | `--ink`                   |

---

## 2 · Typografi (facit-mått, låsta)

| Element       | Mått                                                           |
| ------------- | -------------------------------------------------------------- |
| `.sec-label`  | 9,5px · 800 · 0,14em · versaler · `#8a8174`                    |
| `.btn-action` | 5/10px padding · radie 999 · guldgradient · 9px · 800 · 0,08em |
| `.tag`        | 2/8px · 999 · 9px · 800 · 0,04em                               |
| `.shell`      | 340px · radie 24 · shell-gradient + skugga                     |
| Rubriker      | `--ink` #2b251f, fet                                           |
| Metatext      | `--ink-soft`, 8,5–10px                                         |

## 3 · Måttsystem

- **Spacing:** 4 / 8 / 12 / 16 / 20 / 24 / 32 px (facits skala)
- **Radier:** shell 24 · kort 14–18 · knappar 999 (kapslar)
- **Spalt:** 340px shell i 360px-kolumn (desktop), max 480px som sheet (mobil)
- **Touch:** 44×44px på ≤1023px (app-wiring)

## 4 · Responsiv (repo-kanon)

| Enhet              | Intervall | Layout                                                |
| ------------------ | --------- | ----------------------------------------------------- |
| Desktop            | ≥1024px   | 3 kolumner (200 · 1fr · 360), shell 340 sticky        |
| iPad liggande      | 1024–1366 | samma, listan kompakteras                             |
| iPad stående/mobil | ≤1023px   | mobil-shell, spalten fullbredd, bottensticky-åtgärder |

## 5 · App-wiring-lagret (EJ facit, medvetna tillägg)

Flikar, sök, TOC, statusprickar, kollaps, touch-mål — allt i befintliga
tokens (prickarna: röd #b94a4a, amber #c8821e, grön #4a8268, blå #4a7ba8;
fliktvärdena #2b251f/#8a8174).

## 6 · De färger som INTE finns i V13 (ur äldre REFERENS — valbara)

`#faf6f2` (REFERENS-bakgrund), mörk knapp `#42392e→#241f19`,
knapptext `#f3ead8`, guldtext `#7a5210`, teal `#2596a8`.

**Beslut:** behåll V13-facits set (rekommenderat — det är din nyaste design),
eller byt in REFERENS-värdena per punkt 6. Säg vilka.
