# ORD-150 · Offerten ska sluta lova något den inte bifogar

**Arbetsorder · 2026-08-30**
**Bas:** `main` (`aac66ccc`)
**Föregås av:** ORD-143 §2 (fyndet), ORD-149 (momsen, nyss klar), ORD-133 (dokument pekar på tjänsten)
**Grind:** ORD-131 — ingenting raderas · `CCO_SEND_LIVE` orörd

---

## Varför den här och inte något annat

```
sendable: 0
```

Ingen mall i CCO är juridiskt godkänd. Ingenting kan nå en patient. Det är
inte ett tekniskt fel — det är att ingen människa kan skriva under på att
mallarna stämmer.

Och det kan de inte, för systemet säger detta i bindande text — och kan
inte belägga det.

### Rättelse 2026-08-30 · siffran i den här ordern var fel

Ordern skrevs på uppgiften *"8 av 10 offerter nämner tjänstespecifikationen"*.
**Det stämmer inte.** Mätt om:

```
$ git grep -c "tjänstespec" -- src/ops/ccoOfferTemplateStore.js
0

agreementText-mallar: 14
```

Ingen av de fjorton offertmallarna nämner tjänstespecifikationen. Siffran
kom ur en tidigare rapport som jag förde vidare utan att mäta om. Mitt
fel.

### Var påståendet faktiskt bor

Inte i offerten — i **signeringsflödet**:

```
ccoTreatmentAgreementDocument.js:96
  "Genom signering bekräftar patienten att bilaga 1 mottagits
   och att villkoren accepteras."

ccoOfferEsign.js:260
  "…betänketid är X kalenderdagar från att du mottagit
   tjänstespecifikation, patientinformation och offertunderlag…"

ccoTreatmentAgreementDocument.js:69
  "Bilaga 1 — Patientinformation & tjänstespecifikation (PDF)"
```

Rad 96 är allvarligast: **patienten skriver under på att hon fått
bilagan.** Hennes signatur på ett faktum systemet inte kan belägga.

Rad 260 är farlig på ett annat sätt: betänketiden **räknas från**
mottagandet. Är den utgångspunkten fiktiv är hela betänketiden fel, och
signeringen kan ske för tidigt.

```
Katalograder för tjänstespecifikation   0
Kopplad version på någon väg            0
```

**Att godkänna det här vore att godkänna ett påstående som inte är sant.**
Därför står `sendable` på noll, och därför ligger den här ordern före allt
annat i CCO.

Vägen till att CCO verkställs är: **den här ordern → juridiskt godkännande
→ `CCO_SEND_LIVE`.** Ingenting annat ligger på den vägen.

---

## Läs det här först — två saker finns redan

### Underlagen finns, och de är färska

Femton tjänstespecifikationer i SharePoint, **mars 2026** — nyare än
nästan allt annat i systemet:

```
PDF Tjänstespecifikationer - Curatiio/   10 st   2026-03-11
  Botox® · Fillers · Profhilo® · PRF hud · PRP hud ·
  Microneedling+PRP hud · Ögonlocksplastik ·
  Ortopedi: hyaluronsyra · HA+PRP/PRF · PRP/PRF

PDF Tjänstespecifikationer - HTPC/        5 st   2026-03-10/11
  Microneedling+PRP hud · PRF hud · PRP hår · PRP hud · (+1)
```

Ingenting ska skrivas. De ska hämtas och kopplas.

### Versionshanteringen finns

```
ccoTemplateRegistry.js:342   snapshotForSend
                             currentRevision(record)
                             record.currentVersion
```

Registret bär redan revisioner och en aktuell version. **Bygg inte en
andra versionsmodell.** §2b ska använda den som finns.

---

## Uppgiften

### 1 · Specifikationen blir en referens till tjänsten

Följ ORD-133:s struktur: en rad i katalogen som dokumenten **pekar på** —
inte fritext i tjugo mallar.

Femton specifikationer, 84 tjänster. Det går inte jämnt ut, och det är
avsiktligt: en specifikation täcker flera tjänster (alla botox-varianter
delar en). Mappningen ska vara **explicit**, aldrig namnmatchning.

Det är samma regel som `cco-service-inheritance.json` — och samma skäl:
ORD-142 klassade Curatiios enda eftervårdsdokument som "nej" på filnamnet
och tappade det i två dygn.

### 2 · Offerten bär vilken version kunden fick

Använd registrets `currentVersion`. Ändras specen i mars 2027 ska det gå
att se vad som gällde den dag kunden signerade.

En version som bara pekar på "den senaste" är ingen version.

### 3 · Grinden — och det här är orderns viktigaste punkt

**Ett dokument som gör påståendet får inte kunna skickas utan en kopplad
version.**

```
påstående i texten + kopplad version   →  får skickas
påstående i texten + ingen koppling    →  BLOCKERAS
inget påstående                        →  får skickas
```

**På två vägar, inte en** — mätt 2026-08-30:

```
buildTreatmentAgreementHtml   ccoTreatmentAgreementDocument.js:96
buildOfferSignPageHtml        ccoOfferEsign.js:260
```

Båda genereras i signeringsflödet. En grind enbart på
`buildOfferDocumentHtml` skulle missa båda — en spärr som ser ut att
skydda men inte gör det.

**Mutationstest per väg.** Koppla bort grinden på avtalsvägen, visa rött.
Sedan samma på signeringsvägen. Ett mutationstest bevisar att spärren
sitter fast där den sitter, ingenting annat.

Fail-closed. Saknas kopplingen ska det kasta, inte tyst utelämna bilagan.

Vi har fyra fail-open-fällor i repot sedan tidigare — `adapt()`,
`JOURNAL_STATUSES`, readiness-grinden, `isPendingType`. Den här får inte
bli den femte. En offert som skickas utan bilagan men med påståendet är
värre än en offert som inte går iväg.

### 4 · `prp-hair` och `prp-skin`

**Utgår.** Punkten byggde på den felaktiga "8 av 10" — ingen offertmall
nämner specifikationen, så det finns inga åtta att jämna ut mot.

Lägg **inte** till texten i någon mall. Påståendet ska finnas där det
redan finns, i signeringsflödet, och där ska grinden sitta. Att sprida
formuleringen till fjorton mallar skapar fjorton nya löften att infria.

Kopplingen finns redan i mappningen (`7114…→spec_prp_har`,
`7117…→spec_prp_hud_htpc`). Den räcker.

### 4b · Betänketiden behöver ett datum, inte bara ett ja

`ccoOfferEsign.js:260` räknar betänketiden **från mottagandet**. En grind
som bara svarar *om* specen är kopplad ger inte den räkningen ett
startdatum.

**Mät om datumet finns någonstans.** Gör det inte är det en egen sak —
rapportera, laga inte i samma pass.

### 5 · Tjänster utan specifikation

Femton specifikationer täcker inte 84 tjänster. Vad händer med en tjänst
som ingen spec pekar på?

**Inte tyst ingenting.** Rapportera vilka tjänster som saknar
specifikation, som en lista per id. Fazli avgör om de behöver en eller om
påståendet ska bort ur just deras offert.

Bygg inte en gissning. Räkna och rapportera.

---

## Godkänt när

1. Mappningen tjänst → specifikation är **explicit**, aldrig namnmatchad.
   Visa tabellen.
2. Offerten bär versionen, hämtad ur `ccoTemplateRegistry`. **Ingen andra
   versionsmodell.** Sök och visa.
3. **Påstående utan koppling blockerar — på båda vägarna.** Ett test per
   väg, och **ett mutationstest per väg**. Ett räcker inte.
4. `ccoOfferFromPlan.js:370` visar **ingen version** när ingen koppling
   finns. En version utan belagt mottagande är ett påstående i sig.
5. Lista per id över tjänster utan specifikation. Ingen tystnad.
6. Alla 15 specifikationerna är katalograder med `clinics` i plural.
7. `legalReviewStatus: 'pending'` på varje ny rad. **Ingen mall godkänns
   av kod.**
8. `CCO_SEND_LIVE` orörd.

## Vad jag inte avgjort

**Om påståendet ska stå kvar i texten.** Alternativet till att bifoga är
att stryka meningen. Jag väljer att bifoga — advokaten skrev sjustegsordningen
för att specifikationen *ska* nå kunden, inte för att den ska tas bort ur
avtalet. Men det är Fazlis och Nordbros beslut, inte kodens. Säg emot om
du ser något jag missat.

**Vilka tjänster som ska ha en egen spec.** Se punkt 5 — räkna först,
fråga sedan.

**Godkännandet självt.** När det här är klart kan en människa läsa
offerten och se att den stämmer. Det är då `legalReviewStatus` kan bli
`approved` — av en människa, i gränssnittet, aldrig av en agent.
