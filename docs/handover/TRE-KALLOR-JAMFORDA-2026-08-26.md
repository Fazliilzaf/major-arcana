# Figma, workflow-dokumenten och min kartläggning — jämförda

**Till Fazli · 2026-08-26**

Tre källor beskriver samma kundresa:

| Källa                                              | Vad den är                                   |
| -------------------------------------------------- | -------------------------------------------- |
| **`docs/workflow/cco-workflow-v13.md`**            | Huvud-workflow, 281 rader. Facit enligt dig. |
| **Figma "FlowChart \| Leo"**, nod Flow 26          | Swimlane-flödet, 17 642 px brett             |
| **`docs/handover/FLODET-MOT-KODEN-2026-08-26.md`** | Min kartläggning av Figma mot koden          |

Kort svar: **workflow-dokumentet är rikare och nyare än Figma.** Mitt
underlag följde Figma, och missade därför en hel dimension. Och två
punkter i mitt underlag var fel.

---

## 1 · Var källorna säger emot varandra

### Uppföljningen — Figma är föråldrad

| Källa                              | Säger                            |
| ---------------------------------- | -------------------------------- |
| `cco-workflow-v13.md`              | **4 / 8 / 12**                   |
| `cco-workflow-v13.html` (visualen) | **4 / 8 / 12** — nio förekomster |
| `cco-dokument-inventering.md`      | **4 / 8 / 12**                   |
| **Figma Flow 26**                  | **4 / 6 / 12**                   |
| `cco-end-to-end-kundresa.md`       | **4 / 6 / 12**                   |
| Koden · `ccoJournalSchemas.js`     | **4 / 6 / 12**                   |
| Koden · aftercare-cron             | **1 / 3 / 6 / 12**               |

Du har avgjort: **4/8/12**. Det betyder att de tre nyaste dokumenten har
rätt, och att **Figma-flödet är föråldrat på den punkten** — liksom
`cco-end-to-end-kundresa.md`.

Det får en konsekvens värd att säga rakt ut: `cco-workflow-v13.md`
inleds med _"facit = Figma Flow 26"_. **Den meningen stämmer inte
längre.** Dokumentet har gått förbi Figma. Antingen uppdateras Figma, eller
så tas den meningen bort — annars kommer nästa person att lita på fel
källa, precis som jag gjorde.

### PRP — här stämmer allt

`cco-workflow-v13.md` rad 90 säger, ordagrant:

> Op-dag: **PRP 1/4 på plats** → PRP 2/4, 3/4, 4/4 → uppföljning mån
> **4 / 8 / 12**

Det är exakt det du beskrev. Figma ritar samma sak. HTML-visualen har
fyra förekomster av "PRP 1/4" och fyra av "PRP 2/4". Ingen konflikt.

---

## 2 · Vad workflow-dokumentet har som Figma inte har

Det här är den viktiga delen, och det är här min kartläggning blev för
smal.

### Sex behandlingsvägar, inte en

Figma ritar **ett** förlopp: hårtransplantation. Workflow-dokumentet §2
har sex vägar som väljs vid konsultationen:

| Väg | Behandling               | Förlopp                                                          |
| --- | ------------------------ | ---------------------------------------------------------------- |
| A   | PRP hår                  | 3–4 behandlingar, ~4 v mellanrum, uppföljning ~2 mån efter sista |
| B   | PRP hud                  | samma som A                                                      |
| C   | Hårtransplantation       | det Figma ritar                                                  |
| D   | Ögonbrynstransplantation | samma som C                                                      |
| E   | Skäggtransplantation     | samma som C                                                      |
| F   | Curatiio estetik         | botox, fillers, profhilo, ögonlock, PRF, microneedling           |

**Följd för min kartläggning:** jag mätte bara väg C. Väg A och B —
PRP som **fristående behandling** — hoppade jag över helt. Och hela
Curatiio, väg F, finns inte i mitt underlag alls.

### PRP betyder två olika saker

Det här är lätt att missa och viktigt att hålla isär:

- **PRP som eftervård** (väg C/D/E) — 1 på op-dagen + 3 efter. Det vi
  pratade om.
- **PRP som egen behandling** (väg A/B) — 3–4 behandlingar med ~4 v
  mellanrum, uppföljning ~2 mån efter sista. Ingen operation
  inblandad.

Samma ord, olika serier, olika journaler. Väg A/B använder
`steg8-journal-prp-multi`; väg C:s eftervårds-PRP använder
`steg8-journal-tp-post-prp`.

Det förklarar också varför `recurringBookings.js` har **både**
`prp-hair-3` och `prp-hair-6`. Den ena är förmodligen väg A, den andra
ett längre upplägg.

### Regler som inte syns i flödet

Workflow-dokumentet §6 har sex regler. Fyra av dem framgår inte av Figma:

1. **Friskförsäkran — enbart på operationsdagen.** Figma placerar den i
   förkonsultationen.
2. **Ordination skrivs av läkare till alla transplantationspatienter.
   Sjuksköterskor ser den, kunden ser den inte.** Figma visar bara rutan
   "Ordination".
3. **PRP har ingen extraktion.** Dokumentet lyfter detta som en uttrycklig
   korrigering — extraktion sker enbart vid transplantation.
4. **Journal + bilder vid varje besök**, undantagslöst.

### Juridiken, i klartext

§9 innehåller detaljer som varken Figma eller koden gör tydliga:

- **Betänketid 2 dagar** — avtalet bindande först efter det, och
  **upphör 30 dagar** efter undertecknande om ingen tid bokas.
- **Ångerfrist 14 dagar** enligt distansavtalslagen 2005:59 — upphör när
  behandlingen påbörjas.
- **Avbokning** senare än 2 kalenderdagar → **500 kr** administrativ
  avgift. Ombokning vid sjukdom gratis mot läkarintyg.
- **Foto-samtycke: hårlinje + krona — aldrig ansikte.** Internt bruk för
  uppföljning; marknadsföring kräver **separat** samtycke.

Den sista är värd att notera mot advocacy-fasen. Flödet slutar med
"Resultatbilder → Instagram", men fotosamtycket i dokumenten täcker
**inte** marknadsföring. Det krävs ett andra samtycke som ingen ritat.

---

## 3 · Vad min kartläggning har som dokumenten inte har

Workflow-dokumentets §8 "Automatisering — mål V13" är i praktiken samma
lista som min, vilket är ett bra korstest. Vi är överens om fyra saker:

| Punkt                   | §8 säger             | Jag hittade                             |
| ----------------------- | -------------------- | --------------------------------------- |
| AutoMail-påminnelser ×4 | ⚠️ manuellt          | Noll träffar på hela sekvensbegreppet   |
| Anpassat erbjudande     | ⚠️ manuellt          | Halvautomatiskt plan→offert finns       |
| Instagram               | ⚠️ manuellt          | Ingen publicerings-API över huvud taget |
| Fakturering 20/80       | ⚠️ befintlig lösning | Ingen 20 %-logik, ingen slutfaktura     |

Men **§8 är optimistisk på fyra rader** där koden inte håller:

| §8 säger                                          | Vad koden säger                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| Journaler per besök ✅ behåll                     | Op-dagsjournalen har **noll** PRP-fält. PRP 1 kan inte journalföras.      |
| Dokument (avtal, samtycken) ✅ ok/avstå-ångerrätt | **Båda avståendena är döda.** Se §4 nedan.                                |
| Ekonomi (värde/skuld) ✅ behåll                   | Stämmer för visning. Men förskottet skrivs in via `window.prompt`.        |
| Bokningsmotor + AutoMail ✅ behåll                | Stämmer. Men Cliento-bokningar kommer in via **mail-parsning**, inte API. |

Och tre saker finns inte i något av workflow-dokumenten:

- **Telefonsamtalet loggas inte.** Figma ritar rutan, dokumentet nämner
  den inte, koden har ingenting.
- **CCO vet inte var kunden bor.** Inga adressfält alls. Det gör att
  mönster A/B/C för PRP inte kan härledas.
- **ID-verifiering som hård grind** — `CCO_ID_VERIFICATION_HARD_GATE` är
  på och blockerar op-dagen. Står inte i något dokument.

---

## 4 · Rättelser till mitt eget underlag

Två fel, båda upptäckta genom den här jämförelsen.

### Rättelse 1 · Betänketid och ångerfrist är inte samma sak

Jag skrev att systemet har "två olika tal för samma sak" — 2 dagar i
koden mot 14 i avtalstexten.

**Fel.** `cco-workflow-v13.md` §9 förklarar att det är två skilda
rättsliga begrepp:

- Betänketid **2 dagar** → avtalet blir bindande
- Ångerfrist **14 dagar** → distansavtalslagen

Båda är korrekta. De motsäger inte varandra.

**Men fyndet är värre än jag trodde, inte bättre.** Det finns två
avståenden och **ingendera läses**:

```
cooling_off_waiver   →  1 träff i src/   (definitionen)
booking_within_14d   →  1 träff i src/   (definitionen)
```

En namnförvirring gör det svårare att se: `samtycke_bokning_2d` — den
som avser **2 dagars** betänketid — bär `consentKind: 'booking_within_14d'`.

### Rättelse 2 · PRP kan bokas

Redan rättad i FLODET-dokumentet. Den ursprungliga kartläggningen läste
seed-värdena i `ccoBookingEngineStore.js` i stället för verkligt
tillstånd. Produktionens katalog säger `active=true` för alla
behandlingar.

---

## 5 · Vad jag föreslår

**Uppdatera Figma eller ta bort meningen.** Rad 3 i
`cco-workflow-v13.md` säger att Figma är facit. Det stämmer inte längre
på uppföljningarna. En av dem måste ge vika, och eftersom du redan valt
4/8/12 är det Figma som ska ändras.

**Komplettera min kartläggning med väg A, B och F.** Den täcker bara
hårtransplantation. PRP som egen behandling och hela Curatiio är
okartlagt mot koden. Det är ungefär lika mycket arbete igen.

**Ta ställning till marknadsföringssamtycket.** Fotosamtycket täcker
internt bruk. Instagram-steget i flödet kräver ett samtycke som inte
finns beskrivet i något dokument.

Säg vilket du vill ta först.
