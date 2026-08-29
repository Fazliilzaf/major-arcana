# ORD-131 · Tre listor till personalen — och en OCR med grind

**Arbetsorder · 2026-08-27**
**Bas:** `main` (`9dbe988b`)
**Föregås av:** städningen `needs_review` 578 → 281 och
`data/192-granskningslista.csv`

---

## Först: siffrorna stämmer, men de rör på sig

Jag räknade själv i den nedladdade prod-filen
`data/cco-patient-master.json` (7 860 patienter, tenant `hair-tp-clinic`):

|                                                | Antal     |
| ---------------------------------------------- | --------- |
| Flaggade totalt (`needs_review` + `unmatched`) | **343**   |
| — har kontaktuppgifter                         | **192** ✓ |
| — saknar kontakt, med personnummer             | **123**   |
| — saknar kontakt, utan personnummer            | **28**    |
| **Saknar kontakt totalt**                      | **151**   |

192 stämmer på patienten. Men "148" i rapporten är redan **151**, för att
`needs_review` driftat 278 → 281 medan vi pratade. Samma tre.

**Följd för den här ordern:** hårdkoda inget antal. Listorna ska
genereras vid körning och bära sitt eget datum och sin egen summa. En
lista som säger 148 när verkligheten säger 151 blir ifrågasatt i onödan.

---

## 1 · "Saknar kontakt"-listan · gör den

Alla flaggade utan e-post och utan telefon. Samma format som
`192-granskningslista.csv`: semikolon, BOM, och `store`-kolumnen på varje
rad.

Kolumner: `patientId`, `namn`, `personnummer_finns` (ja/nej — **inte**
numret självt), `status`, `har_journal_i_drive`, `senaste_besok`, `store`.

Dela upp i två filer, för de har olika ägare:

- `saknar-kontakt-med-pnr.csv` — identifierade, fylls i vid nästa besök
- `saknar-kontakt-utan-pnr.csv` — de 28, manuell granskning

**Personnumret ska inte stå i klartext i en CSV som mejlas runt.** Ja/nej
räcker för att personalen ska veta om personen går att slå upp.

## 2 · "Skräp/flagga"-listan · gör den

Presentkort, mötesbokningar, "CF7", mall-literaler. Ren CSV, samma form.

**Ingenting raderas.** Listan är ett underlag för ett mänskligt beslut,
och en rad som ser ut som skräp kan vara en felmatchad riktig patient.

## 3 · Bild-OCR på de ~28 inscannade journalerna · gör den, men med grind

Utdelningen är osäker, och det är fine — men OCR på inscannade
**patientjournaler** har en risk som inte är osäker:

**En felläst siffra i ett personnummer är värre än ett tomt fält.**
Tesseract förväxlar 0/O, 1/l/7, 5/S. Ett personnummer som är fel med en
siffra pekar på en annan verklig människa.

Därför:

1. **Inget OCR-resultat skrivs till patientregistret.** Utfallet går till
   en granskningsfil, precis som listorna ovan.
2. **Personnummer hämtas aldrig ur OCR.** Punkt. E-post och telefon får
   föreslås; identitetsnummer får det inte.
3. Varje rad bär `konfidens` från tesseract och **sidnumret** den kom
   ifrån, så en människa kan slå upp originalet.
4. Kör på kopior. Rör inte källfilerna i Drive.

---

## Godkänt när

- Tre (fyra med uppdelningen) CSV-filer i `data/`, alla med datum, summa
  och `store`-kolumn.
- Inget antal hårdkodat — allt räknat vid körning.
- Inga personnummer i klartext i CSV.
- Inget OCR-värde skrivet till patientregistret.
- Ingenting raderat.

## Rör inte

- `data/` är gitignorerat och ska förbli det. Committa ingen patientdata.
- `data/cco-patient-master.json.snapshot-20260825` — Fazlis
  jämförelsekopia.
- `public/major-arcana-preview/cco-v13-rail.css` — ORD-130, klar.
