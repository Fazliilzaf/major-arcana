# ORD-135 · De 21 nollkronetjänsterna — 18 ärver, 3 står själva

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`be5736ed`)
**Beslut:** Fazli lämnade strukturfrågan till mig 2026-08-28. Jag tar den
med den avgränsning som står under "Vad jag inte avgjort".

---

## Bakgrund

Tjänstekatalogen har **21 tjänster som kostar 0 kr**. De är bokningsbara
moment som ingår i något annat, och de finns som rader i arbetsbladet
trots att de sällan har egna underlag.

Frågan var: egna kopplingar, eller ärva huvudtjänstens?

---

## Beslutet

### Ärver huvudtjänstens underlag — 18 stycken

**Åtta PRP-efterbehandlingar**

- FUE Hårtransplantation: PRP-efterbehandling
- DHI Hårtransplantation: PRP-efterbehandling
- FUE Skäggtransplantation: PRP-efterbehandling
- DHI Skäggtransplantation: PRP-efterbehandling
- DHI Ögonbrynstransplantation: PRP-efterbehandling
- DHI Ärr: PRP-efterbehandling

**Nio uppföljningar**

- Uppföljning: Hårtransplantation FUE / DHI
- Uppföljning: Skäggtransplantation FUE / DHI
- Uppföljning: Ögonbrynstransplantation DHI
- Uppföljning: Ögonlocksplastik
- Uppföljning: Botox / Filler / Profilho

**Plus**

- Ögonlocksplastik: Suturborttagning

**Skälet:** de är samma vårdepisod som huvudtjänsten. En PRP-behandling
efter en transplantation är inte en egen affär — den ingår i priset och i
journalen.

### Står själva — 3 stycken

- Möte på kliniken · Fysisk konsultation
- Digitalt videosamtal · Onlinekonsultation
- Estetiska injektioner · Konsultation
- Ortopediska injektionsbehandlingar · Konsultation
- Ögonlocksplastik · Konsultation

**Skälet:** en konsultation är ett eget möte med egna underlag —
konsultationsmall och ID-verifiering — oavsett vad den leder till. Den
ska inte ärva en transplantations journalkrav bara för att patienten
senare bokar en.

_(Fem rader, tre "sorter". Alla behandlas lika: egna rader i bladet.)_

---

## Uppgiften

### 1 · Ärv-begrepp i importen

`getRequiredUnderlag(prpEfterbehandling)` ska svara samma som
`getRequiredUnderlag(huvudtjänsten)`.

Bygg det **explicit**, inte genom namnlikhet. En tabell som säger vilken
tjänst som ärver från vilken, i klartext, så att nästa läsare ser
kopplingen utan att gissa. Namnmatchning är precis det som gav oss fyra
felaktiga patientsammanslagningar.

Ärvningen ska vara **synlig i utdata**: när `getRequiredUnderlag` svarar
för en ärvande tjänst ska svaret bära varifrån det kommer.

### 2 · Ta de 18 ur arbetsbladet

De ska inte längre kräva ifyllnad. Antingen tas raderna bort, eller så
markeras de som ärvande med en egen kolumn. Välj det som gör bladet
lättast att läsa — men **`?` får inte stå kvar på dem**, annars räknas de
som obesvarade i färdigräkningen.

Fazlis genomgång ska då gälla **61 rader**, inte 82.

### 3 · Flagga de två osäkra

Två av de 18 är mina bedömningar, inte fakta, och en kliniker ska kunna
säga emot utan att arbetet görs om:

**Ögonlocksplastik: Suturborttagning.** Jag lade den som ärvande, men det
är ett eget ingrepp på en annan dag. Ska ssk journalföra den separat hör
den till gruppen som står själv.

**Uppföljning: Botox / Filler / Profhilo.** Ärver de från huvudtjänsten
får de `journal_estetik_*` — alltså en behandlingsjournal vid ett
återbesök där ingen behandling ges. Det hänger ihop med den öppna frågan
från ORD-133: **Curatiio har ingen uppföljningsjournal alls.**

Markera båda i bladet eller i ärv-tabellen som "bedömd, ej klinikerkontrollerad".

---

## Godkänt när

1. Ärv-tabellen är explicit och läsbar — ingen namnmatchning.
2. `getRequiredUnderlag` svarar rätt för en ärvande tjänst, och svaret
   visar varifrån. Mutationstesta: bryt en ärvning och visa att testet
   blir rött.
3. Arbetsbladet räknar 61 rader att gå igenom, inte 82.
4. De två osäkra är märkta.

## Vad jag inte avgjort

**Om en uppföljning kliniskt kräver en viss journal.** Det är vård, inte
systemdesign. Strukturen — att en efterbehandling ärver sin
huvudtjänsts underlag — är min; innehållet i den ärvningen är
klinikerns.

**Och Curatiios uppföljningsjournal** är fortfarande obesvarad sedan
ORD-133. Den frågan kvarstår oavsett vad den här ordern gör.
