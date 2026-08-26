# V13 · STORA vyn — utredning inför bygget (ORD-109 uppgift 3)

**Leverans · 2026-08-26 · read-only, ingen kod**
Källfakta är hämtade ur den körande koden, inte ur facit-text.

---

## Nuläget (verifierat i koden)

- Det finns **ingen helsidesvy för kundkortet idag**.
- `data-v9-dossier-open` (sätts i `patient-master-ui.js` ~rad 6333) växlar
  bara spaltens bredd: `customers-rail--dominant` på railen och
  `customers-list--compact` på listan. Listan stannar synlig.
- V11/V12 ärver samma mekanik — de är alltid "i spalten".
- Den lilla V13 (ORD-109 uppgift 1) renderar i samma spalt och får
  facits 340 px-design i en ~660 px spalt (breddfrågan avgör Fazli
  visuellt, enligt ordern).

## Fråga 1 — Hur öppnas den stora V13 från den lilla?

| Alternativ                                                     | Vad det innebär                                                                                                                                                                       | Kostnad                                                                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · Läge som gömmer listan**                                 | Nytt läge i `customers-layout`: listan gömmer sig (eller kollapsar helt), railen/arbetsytan tar hela bredden. Data-attribut som `data-v13-fullview=on` på layouten, CSS i eget scope. | Liten–medel. Återanvänder befintlig DOM och patient-data — inget nytt shell, ingen ny route, bakåt-knapp = ta bort attributet.                                                                |
| **B · Modal overlay**                                          | `.v13-workspace-shell` renderas som overlay ovanpå kundlistan (samma mönster som V12-workspace-overlayen i `patient-master-ui.js`).                                                   | Medel. Overlay + scroll-hantering + Esc/backdrop finns delvis som mönster (V12-openFromRail), men det ger aldrig 1 280 px på smalare skärmar och känns som fel metafor för "hela relationen". |
| **C · Egen route** (`/admin#customer/:id/full` eller liknande) | Hel ny vy med egen shell, egen scroll, egen bak-knapp.                                                                                                                                | Störst. Ny route-listen/fn, ny shell-CSS, deep-link-hantering, och all patient-data-laddning måste återanvändas via befintlig runtime — annars dubbla hämtningsvägar.                         |

**Rekommendation: A.** Den stora V13 är en arbetsyta över samma kunddata
som redan är laddad i railen. Att gömma listan ger exakt facits
fristående sidkänsla (1 280 px arbetsbredd) utan ny route eller nytt
dataflöde. Mönstret finns redan i form av `data-v9-dossier-open` —
detta blir ett tredje läge bredvid det.

## Fråga 2 — Vilket klick öppnar den?

Facit sätter redan rätt krokar:

- `data-v12-scroll-module` (t.ex. `s-hero` på "Ändra profil") → **scrolla**
  till sektionen i den stora vyn
- `data-v12-open-module` (på sektionerna) → **öppna** sektionen

Men ingen av dem betyder "öppna fullvyn" idag. Två alternativ:

| Alternativ                             | Bedömning                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A · Återanvänd open-module-klicket** | Ett klick på valfri sektion i lilla V13 öppnar stora V13 med rätt sektion i fokus. Sömlöst ("klicka i den lilla → den stora öppnas, rätt plats") — men tar bort "kika utan att öppna", och hanterarna (`data-v12-open-module`) är redan bundna till V12-logik i sex filer. Kräver ny bindning eller eget attribut. |
| **B · Egen öppna-knapp i shellen**     | En `Öppna fullvy →`-knapp i dhead eller som sticky-element i `#v13-rail`. Klicken i sektionerna behåller sina befintliga betydelser.                                                                                                                                                                               |
| **C · Kombination**                    | dhead-klick ("Ändra profil" → s-hero) + egen knapp, medan sektionsklick i railen behåller sina gamla hanterare.                                                                                                                                                                                                    |

**Rekommendation: B** (eller C). En explicit knapp gör övergången
förutsägbar och rör inga befintliga hanterare. "Klick i lilla öppnar
stora" kan läggas senare som förbättring när hanterarna kartlagts.

## Fråga 3 — Ska den stora ärva `?v13=on`?

**Ja.** Båda vyerna är samma produktbeslut (V13 vs V11/V12). En egen
flagga (`?v13full=on`) ger två opt-in-grindar för personalen och en
tredje uppsättning dokumentation. Den stora vyn nås bara _inifrån_ den
lilla, så `?v13=on` är redan sann när den öppnas.

## Fråga 4 — Var får den 1 280 px ifrån?

- `customers-layout` är den begränsande containern. Läget A gömmer
  listan, men layouten har fortfarande sin egen maxbredd/padding.
- Facit antar fristående sida: `body`-bakgrund, `.workspace` med
  `max-width: 1280px` och 24 px-gap.
- Läge A bör sätta `max-width: 1280px; margin: 0 auto` på
  arbetsyte-containern och låta railens befintliga
  `--v11-rk-live-rail-width` sluta styra (den är V11:s — se gränserna i
  ORD-109).
- Skärmar under ~1 310 px får en responsiv försämring (workspace-griden
  behöver en enkolumns-fallback under ~900 px) — det finns inte i facit
  och måste specificeras av Fazli.

## Öppen fråga till Fazli

Facits stora vy antar 1 280 px. I läge A är det fullt möjligt — men om
appens kundarbetsyta i praktiken ska vara ett modal/panel-flöde ändras
premissen. Beslut önskas om A/B/C och om responsiv fallback krävs.
