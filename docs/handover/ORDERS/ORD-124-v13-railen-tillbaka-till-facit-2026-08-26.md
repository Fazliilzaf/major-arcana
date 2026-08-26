# ORD-124 · V13-railen är tillbaka på facit — tre frågor kvar

**Arbetsorder · 2026-08-26**
**Bas:** `main` · **Gjort i** `57f24461`
**Facit:** `docs/facit/v13/V13-HOGERSPALT-2026-08-24.html` (identisk med
Fazlis uppladdning — jag jämförde tecken för tecken, enda skillnaden är
sju snedstreck i void-taggar)

Fazli hade rätt. Det var inte hans ögon.

---

## Vad som hade byggts in i railen

`e9fe701c` la in fem saker som **inte finns i facit**, mitt i spalten
mellan huvudet och aktivt besök:

| Vad                                | Facit |
| ---------------------------------- | ----- |
| Flikarna Översikt/Journal/Bokningar | nej   |
| Sökfältet "Sök i kundvyn…"          | nej   |
| A–J-knapparna (TOC-snabbhopp)       | nej   |
| Statusprickar i varje sektionsrubrik | nej  |
| Kollapsknapp `▾` i varje rubrik     | nej   |

Koden erkände det själv: `/* App-chrome … (EJ facit — se app-wiring
CSS) */` och `/* APP-WIRING — EJ FACIT */`. Det stod i commit-texten att
"facits 17 sektioner är orörda" — och det stämde. Men allt _mellan_ dem
var nytt.

Dessutom en `@media (max-width: 1023px)` som satte `min-width: 44px` på
`.btn-action` och `.sticky-btn`. Facit har **noll** mediafrågor. Den
regeln ritade om facits knappmått på varje skärm under 1023 px.

**Allt är borta.** Railen är hero + sexton sektioner + sticky.

## Två knappar utan CSS

`.btn-open-full` i huvudet och `.j-btn` i uppföljningsraderna. Ingen av
dem har en enda regel i `cco-v13-rail.css` — de renderades som råa
webbläsarknappar, grå fyrkanter i en spalt där allt annat är rundat och
tonat. Det är den mest synliga enskilda avvikelsen på skärmbilden.

Båda borttagna. Funktionen finns kvar: sticky-knappen "Öppna full
arbetsyta →" öppnar redan fullvyn via `data-v12-open-module`
(`patient-master-ui.js:7274`), och "📅 Boka uppföljning" ligger i
sticky-raden.

## Kontaktraderna var tomma på varenda kund

Facits huvud har tre rader: ☎ telefon, ✉ mejl, ⌂ ort · ålder.
Produktionen visade bara Kund-ID.

Orsaken är inte databrist. `hero()` läste:

```js
var phone = txt(card.phone || card.mobile || card.phoneNumber);
var email = txt(card.email);
```

Inget av de fälten finns. Jag läste kortets riktiga payload i
produktion — `dossier-bundle:3e0d4e43-…`:

```json
"displayName": "Abdihakim abdille",
"primaryEmail": "abdihakimabdiile52@gmail.com",
"primaryPhone": "+46761259459",
"ageYears": null
```

`primaryPhone` / `primaryEmail` — samma fält listan läser
(`cco-v9-customers-parity.js:3438`) och samma fält
`buildProfileFromBcard` redan normaliserar. Renderaren anropade den
adaptern men använde bara `profile.name`.

Rättat: läser `profile` först, sedan `primaryPhone`/`contactPhone`/
`primaryEmail`/`contactEmail`. Ort finns inte i dagens payload — då
skrivs bara åldern, aldrig en påhittad ort.

## Typografin låg 4 % fel

Facit sätter basen på `body`: `12.5px/1.42 Inter` plus
`font-feature-settings: "ss01","cv11"`. När CSS:en skalades om till
`.v13-view-shell` följde inte den regeln med. Railen ärvde appens
**13 px** från `.preview-canvas`, och varje omätt rad — `em`, enhetslös
`line-height`, allt oskrivet — blev för stor.

Regeln ligger nu på shellen. Uppmätt i produktion: `12.5px / 17.75px`.

## Ekonomicellerna

Facit dämpar cellen när värdet är okänt (`eko-cell mute` för
Livstidsvärde och Snitt/besök). Renderaren skrev aldrig modifieraren.
Rättat.

---

## Bevis

**CSS, selektor för selektor:** 239 av facits selektorer finns i
produktionens `cco-v13-rail.css`. **Noll saknas. Noll
egenskapsavvikelser. Noll extra selektorer.** 35 av 35 designtokens
identiska. (`:root` heter `.v13-view-shell` i prod — rätt scoping, samma
innehåll.)

**Sida vid sida i produktion.** Jag renderade facits rail i samma
dokument som den levande railen, med produktionens stylesheet på båda,
och jämförde 134 klasser med 24 beräknade egenskaper var. Kvar efter
filtrering: **noll äkta stilskillnader**. Alla utslag var antingen
bredder som följer textlängd, eller element som facit har men kunden
saknar data för (varningsrader, foton, journalrader).

**Tester:** `tests/public` 836/836 gröna.

---

## Tre saker jag inte rör utan besked

**1 · `s-warn` visar fortfarande noll.** ORD-120 är inte levererad. Jag
läste `#s-warn` i produktion nyss: `count-badge 0`, "Inga kritiska
varningar". Det är kvar hos DeepSeek.

**2 · Knapptexterna i Smart nästa steg.** Facit säger `Skicka` och
`Boka`. Produktionen visar **"Granska & åtgärda"** — texten kommer ur
signalregistrets `ctaLabel`, alltså riktig produktcopy, inte design. En
lång etikett spränger facits kompakta rad så `what` bryts på tre rader.
Antingen kortas registrets CTA:er, eller så accepterar vi bredare rader.
**Det är Fazlis beslut, inte mitt** — jag skriver inte om affärscopy för
att få en layout att stämma.

**3 · Kickern i huvudet.** Facit: "Aktiv · steg 3 av 9 · **HD pågår**".
Produktionen: "Aktiv · steg 3 av 13". Stegantalet är rätt (resan är 13
steg nu). HD-suffixet skulle jag få gissa mig till, och taggen "HD
saknas" säger redan samma sak två rader ned. Lämnat.

## Gränser

- Lägg **aldrig** tillbaka flikar, sök, snabbhopp, prickar eller
  kollaps i `#v13-rail` utan att facit ändras först. Vill vi ha dem hör
  de hemma utanför railen, i appens eget chrome.
- Ingen ny klass i railen utan en CSS-regel i `cco-v13-rail.css`. Är
  klassen inte i facit ska den inte finnas.
- Rör inte tokens eller typografi.
