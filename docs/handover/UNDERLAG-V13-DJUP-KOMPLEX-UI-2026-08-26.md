# Underlag · Uppgradering av lilla V13 till djupare, komplext UI

**Analys · 2026-08-26 · ingen kod byggd — beslut krävs av Fazli**

---

## Steg 1 · Kritisk analys av nuvarande UI

### Färgpaletten — redan rätt, med två dokumenterade risker

Paletten som analyserades (ur `cco-kundkort-REFERENS.html`) är identisk med
V13-facits tokens (`--ink #2b251f`, `--ink-mute #8a8174`, `--gold #d4a847`,
`--amber #c8821e`, `--green #4a8268`, `--red #b94a4a`, `--info #4a7ba8`,
`--lila #7c3aed`, `--bg-page #f1ebe1`, `--vip-ink #bb4779`). Verbatim-porten
(ORD-107/109) har gett pixelexakt träff — den ska inte röras.

WCAG-risker (uppmätta, inte gissade):

- `#8a8174` (tertiär text) = 3,57:1 → **under 4,5:1**. OK bara för stor/fet text
  (≥12px fet). Idag används den i `.sec-label` (9,5px) — **men** versalt +
  800-fet gör den till "stor text" i praktiken; gränsen är fortfarande känslig.
- `#c8821e`, `#4a8268`, `#4a7ba8` = 2,9–4,3:1 → **aldrig som brödtext**; bara
  som streck/ikon/badge-bakgrund. Idag följs detta i railen (färgerna används
  i chips/räknare) — fortsätt så.
- Knapparna: `#f3ead8` på `#241f19` = 13,67:1 och `#7a5210` på `#f5dea7` =
  5,22:1 → godkända.

### Layoutens begränsningar idag (varför den är "för enkel")

Den nuvarande lilla V13 är en **läsbar sammanfattning**, inte en arbetsyta:

1. **Ingen sökning/filter i spalten.** 17 sektioner, men inget sätt att hitta
   en specifik journalanteckning, dokument eller bokning utan att scrolla.
2. **Ingen sektions-navigation.** Facit har ingen innehållsförteckning; i en
   spalt med 17 sektioner försvinner överblickten. JUMP-navet finns i canon
   men är inte portat till railen.
3. **Bara Aktivt besök är kollapsbar.** Facit säger att besöket alltid ska
   synas (rätt), men övriga sektioner är statiska — inget expand/collapse,
   inga "visa fler"-steg förutom j-expand.
4. **Statiska rubriker utan statusindikatorer.** Sektionerna vet inte om de
   har olästa ändringar/blockerare — räknarna (count) finns, men ingen
   pulserande/aktiv markering per sektion.
5. **Tomma ytor saknar handling.** Empty-states är texter; de erbjuder inte
   åtgärd (skapa journal, begär foto…).
6. **Ingen laddning/skelett.** Railen renderas först när data finns — ingen
   skeleton-state under laddning.
7. **Touch-mål underkända.** Facits knappar är 8,5–9px-typografi med 4–8px
   padding → långt under 44×44px. På desktop okej; på surfplatta/mobil är det
   ett klickfel per definition.

## Steg 2 · Arkitektur för det nya komplexa gränssnittet

### Visuell hierarki (vad ögat ska se först)

1. **Hero + kritiska varningar** (säkerhetsklass — rött/amber vinner alltid)
2. **Smart nästa steg + sticky-åtgärder** ("vad gör jag nu")
3. **Aktivt besök** (nuet)
4. Resa/journal/foto/plan/dokument (relationen)
5. Ekonomi/historik/insikter (bakgrunden)

### Avancerade komponenter som krävs (med befintliga adaptrar — ingen ny data)

| Komponent                   | Adapter (finns redan)                      | Funktion                                                       |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Snabb-hopp-lista (mini-TOC) | — (statisk sektionslista)                  | Klicka → scrolla till sektion                                  |
| Sektionsstatus-prickar      | buildCriticalWarnings + counts             | Röd/amber/grön prick per sektion med blockerare/pågående/klart |
| Kollapsbara sektioner       | alla build\*                               | Expand/collapse per sektion (ej besök — facitregeln)           |
| Sök i spalten               | — (klientfiltrering)                       | Filtrera journal/dokument/kommunikation i railen               |
| Flikar i spalten            | — (tre lägen)                              | Översikt (facit) / Journal / Bokningar som flikar              |
| Skelett/loading-state       | —                                          | Visa platshållare medan dossier-bundlen laddas                 |
| Interaktiva kort            | data-v9-section-link + befintliga handlers | Hela rader klickbara, inte bara knappar                        |
| Keyboard-navigation         | —                                          | Tab-ordning + Esc stänger, piltangenter i listor               |

Alla åtta komponenter återanvänder de 25 exporterade build\*-funktionerna —
ingen ny datainsamling, inga nya adaptrar.

## Steg 3 · Designsysten och färgval

Paletten behålls **oförändrad** (Steg 1-tabellen gäller — den är redan
verbatim-portad och rätt). Det nya lagret lägger till:

- **Statusprick-system** med befintliga semantiska färger: `--red` blockerare,
  `--amber` pågående, `--green` klart, `--info` notering.
- **Ytlager:** shell (befintlig gradient) → sektioner → rader — samma
  vellum-system, inget nytt.
- **AI-märkning:** `--vip-ink #bb4779` reserveras (ORD-121-infrastrukturen
  finns, visas bara för faktiskt härledda rader).
- Inga nya färger. Inga HEX-koder utanför tokenset.

## Responsiv specifikation (mått och layouthantering)

### 1. Brytpunkter — repo-kanon, inte egna siffror

Repots bindande brytpunkt: **`max-width: 1023px` = mobil/surfplatta,
`≥1024px` = desktop** (`MQ` i `cco-mobile-shell.js`/`cco-mobile-core.js` —
får inte ändras).

| Enhet         | Intervall   | Kolumner                                                   | Spalten                                  |
| ------------- | ----------- | ---------------------------------------------------------- | ---------------------------------------- |
| Desktop       | ≥1024px     | 3 kolumner (200px · 1fr · 360px i V13)                     | 340px shell, sticky                      |
| iPad liggande | 1024–1366px | 3 kolumner, listan kompakteras (`customers-list--compact`) | 360px kolumn                             |
| iPad stående  | 768–1023px  | **Mobil-shell**: listan dras in i drawer, railen tar ytan  | Fullbredd sheet, shell 100 % (max 480px) |
| Mobil         | ≤767px      | En yta åt gången (list → kund)                             | Fullbredd, bottensticky-åtgärder         |

### 2. Reflow per enhet

- **Mobil:** sektionerna staplas som idag (de är redan vertikala); sticky-
  fältet blir **bottensticky** (tum-avstånd); sök blir en ikon → fullbredds-
  fält i headern; flikar ersätter scrollning (Översikt/Journal/Bokningar).
- **iPad:** kolumnerna behålls men raden förstoras (min 12px typsnittssteg
  upp på interaktiva rader); flikar dyker upp; sidomenyn förblir synlig.
- **Desktop:** full komplexitet — mini-TOC, sektionsstatus, collapse,
  sök, flikar, keyboard.

### 3. Flexibla enheter

- Text/brytstorlekar: `rem` (root 16px) i det nya lagret; facits verbatim-px
  lämnas orörda tills tokensystemet får en rem-karta (eget beslut).
- Layout: CSS Grid för spalten (sektionsytor) + Flexbox för rader; `clamp()`
  för sökfältets bredd och sticky-fältets maxbredd.
- Avstånd: befintliga spacing-tokens (4/8/12/16/20/24/32) — inga nya magiska
  värden.

### 4. Touch-mål (44×44px)

- Desktop: facitstorlekarna behålls (verbatim-porten är orörd).
- **≤1023px:** alla interaktiva element får `min-height/min-width: 44px`
  via en media-scopead app-wiring-regel — knappens visuella yta förstoras
  med padding, inte med typsnittsstorlek (typografin är låst).

## Steg 4 · Implementering — väntar på beslut

Koden genereras först efter GO. Gränserna: facit-tokens och typografi orörda,
V11/V12 orörda, `?v13=off` oförändrat, inga påhittade data, en gren, svenska
commit-meddelanden, samma valideringssvit.

## Beslutsfrågor till Fazli

1. Flikar i spalten (Översikt/Journal/Bokningar) — ja/nej? Facit har inga.
2. Mini-TOC (snabbhopp) — ja/nej? Facit har ingen, men 17 sektioner talar för.
3. Sök i spalten — ja/nej?
4. Ska sektions-kollaps vara default öppen (facit) eller ihågkommen per kund?
5. Byggordning: sök+flikar först, eller statusprickar+TOC först?
