# ORD-136 · Konsultationsformuläret — det som saknas mellan hälsodeklaration och offert

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`da1959b8`)
**Föregås av:** ORD-133 (tjänstespecifikationen), ORD-135 (ärvda underlag)
**Läs först:** `docs/workflow/MASTERPLAN-CCO-2026-08-27.md`

Allt som påstås om koden nedan är räknat i repot i dag. Där jag inte vet
står det att jag inte vet.

---

## 1 · Regeln som gäller före allt annat i den här ordern

**Offert och journal är två helt olika saker.**

Offerten skickas till kunden. Journalen är personalens journalföring av
patienten. De delar aldrig fält.

Konkret, för graftantalet:

|             | Bär vad                                                           | Vem läser                         |
| ----------- | ----------------------------------------------------------------- | --------------------------------- |
| **Offert**  | `zone.grafts` — det **planerade** antalet per zon                 | kunden, i portalen                |
| **Journal** | `graftsSingel/Dubbel/Trippel/Kvadrupel` — det **utförda** antalet | personalen, journalföringsplikten |

`ccoOfferFromPlan.js` läser i dag `fields.zones[].grafts` och bygger
`graftsZones` — det är offertvägen och den är rätt.

**Ingen kod i den här ordern får skriva från offerten in i journalen.**
Ett planerat antal som hamnar i en journal är en osanning i en handling
man inte redigerar i efterhand. Journalen fylls av den som utförde
ingreppet, och antalet ska gå att ändra manuellt.

---

## 2 · Nuläget, mätt

### Formuläret finns inte

`public/major-arcana-preview/steg4-konsultationsmall-final-demo.html`

|                                       |                     |
| ------------------------------------- | ------------------- |
| Storlek                               | 51 213 byte         |
| `<input>` + `<select>` + `<textarea>` | **10**              |
| `data-registry-id`                    | `konsultationsmall` |
| Andra konsultationsfiler i katalogen  | **0**               |

50 KB, tio fält. Filen är en visning, inte ett formulär. Det finns alltså
inget att fylla i under en konsultation i dag.

### Katalograden är felklassad

```
konsultationsmall · filler: staff · journeyStep: 4 · actionKind: skriv
                    requiredFor: ['offert'] · clinic: 'hairtp'
```

Din rättelse: **konsultationsmallen är presentationerna**, alltså något
man visar — inte ett formulär man fyller i. Raden beskriver i dag fel
sak, och när det riktiga formuläret byggs kolliderar de två.

### Ritningen finns som kod men är inte inkopplad

`src/ops/ccoPhotoAnnotationStore.js` — 224 rader, `SCHEMA_VERSION 1.0.0`,
`createCcoPhotoAnnotationStore`.

Jag sökte efter alla som importerar den: **noll**. Filen refererar bara
sig själv. Ritningsstödet är byggt och sedan aldrig anslutet — varken
till en vy, till en rutt eller till ett test.

### Fotot landar rätt redan i dag

`src/ops/ccoAssetNaming/encounterMapper.js` rad 30 klassar `konsult` som
`consultation`, och rad 261 använder `consultation` som förval när inget
annat går att avgöra. Bilder från en konsultation hamnar alltså på rätt
möte utan att något nytt byggs.

### Tjänstespecifikationen finns sedan ORD-133

`ccoTjanstespecifikationStore.js` ger `getServiceSpec`,
`resolveServicePrice`, `getRequiredUnderlag`, `getUnderlagSource`.
Namn, metod, tid och pris per tjänst finns att visa.

### Presentationerna finns på disk, inte i systemet

`~/Downloads/TP Hair - Presentationer-2`

| Mapp    | Filer                                                 |
| ------- | ----------------------------------------------------- |
| `Krona` | DHI · FUE · PRP (PDF) + `Hair TP Clinic - Krona.pptx` |
| `Vikar` | DHI · FUE · PRP (PDF) + `Hair TP Clinic - Vikar.pptx` |

Sex PDF-kombinationer: **område × metod**. Ingen av dem är en
dokumenttyp i katalogen och ingen av dem går att välja i en vy.

---

## 3 · Uppgiften

### 3.1 · Konsultationsformuläret — ett flöde, sex steg

Ett formulär som fungerar **både på plats och online**. Samma fält, samma
ordning; det enda som skiljer är hur foto och signatur kommer in.

**Steg 1 · De tre F:en**
Förväntningar · förhoppningar · förutsättningar. Tre separata fält, i den
ordningen, med egen rubrik var. De ska inte slås ihop till ett
anteckningsfält — det är tre olika frågor och de besvaras i tur och
ordning under samtalet.

**Steg 2 · Foto**
Foto tas på **alla** konsultationer. Formuläret ska begära det, inte
erbjuda det. Bilderna knyts till mötet via befintlig
`consultation`-klassning — bygg ingen ny fotoväg.

Fotot i sig är inte samma sak som `foto_samtycke` (steg 9, patientens
samtycke till **publicering**). Blanda inte ihop dem: här handlar det om
underlag för behandlingen, inte om marknadsföring.

**Steg 3 · Ritning på fotot**
Ni ritar på alla kunder. Koppla in `ccoPhotoAnnotationStore` — den finns
redan och behöver en vy, en rutt och ett test, inte en ny modell. Om
lagringsmodellen inte räcker: säg det, ändra den inte i tysthet.

Ritningen hör till konsultationen. Den ska gå att öppna igen och att
versionera — ritar man om vid ett återbesök ska den första ritningen
finnas kvar.

**Steg 4 · Tjänstespecifikationen med biverkningsgenomgången**
Hämta specen för den bokade tjänsten ur tjänstespecifikationsstoret och
visa den i formuläret: metod, omfattning, tid, pris, biverkningar.

**Det här är den enda punkt i ordern jag ber dig läsa två gånger.**
Genomgången av biverkningar är det som gör samtycket **informerat**. Ett
kryss i en ruta bevisar ingenting. Fältet ska registrera:

- **vem** som gick igenom den
- **när** — tidsstämpel, inte datum
- **vilken version** av tjänstespecifikationen som visades

Samma princip som hela systemet vilar på: bevis, inte kryss. Ändras
specen ett halvår senare ska det gå att se vad patienten faktiskt fick
höra den dagen.

**Steg 5 · Presentationen**
Personalen väljer bland de sex kombinationerna (Krona · Vikar × DHI ·
FUE · PRP) och visar den som en del av konsultationen. Kunderna vill se
stegen visuellt.

Vilken presentation som visades registreras på konsultationen. Förval
föreslås ur den bokade tjänsten — men det ska gå att välja en annan, och
att visa fler än en.

**Steg 6 · Vidare till offerten**
När konsultationen är klar ska ritningen och de valda zonerna gå in i
offertunderlaget via den befintliga `zones`/`grafts`-vägen i
`ccoOfferFromPlan.js`. Offerten går till kundportalen.

**Inte till journalen.** Se punkt 1.

### 3.2 · Tre katalogrättelser

| Rad                             | I dag                         | Ska bli                                                                   | Varför                                                                                                           |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `konsultationsmall`             | `filler: staff`, ett formulär | **presentationsmaterial** — något som visas och registreras, inte fylls i | Fazlis rättelse: mallen är presentationerna                                                                      |
| ny rad, konsultationsformuläret | finns inte                    | `filler: staff`, steg 4, `requiredFor: ['offert']`                        | det är den här som faktiskt fylls i                                                                              |
| `id_verifiering`                | steg 4, `filler: staff`       | **steg 3**, tillsammans med hälsodeklarationen                            | ID-verifieringen sker när kunden fyller i hälsodeklarationen — fysiskt eller via länk före online-konsultationen |

`id_verifiering` bär redan `journeyStepDisplay: [4, 8]`, så den syns på
två ställen. Det som ska flytta är **när den efterfrågas**, inte var den
visas.

### 3.3 · Curatiio-hålet

`konsultationsmall` och `id_verifiering` bär båda `clinic: 'hairtp'` —
**singular, och ingen `clinics`-lista**. Registret läser `clinics` före
`clinic` (`ccoDocumentTypeRegistry.js:66`), så utan plurallistan når
raderna aldrig Curatiio.

Curatiio har konsultationer. Curatiio verifierar identitet. Båda raderna,
och den nya konsultationsformulärsraden, ska bära
`clinics: ['hairtp', 'curatiio']`.

Det är exakt samma hål som ORD-126 stängde för journalerna och ORD-133
för tjänstebeskrivningarna. Tredje gången.

---

## 4 · Godkänt när

1. Konsultationsformuläret finns som **katalograd** — inte som en lös
   HTML-fil. Ny dokumenttyp = ny rad, aldrig hårdkodad i en vy.
2. De tre F:en är tre fält, inte ett.
3. Ritningen sparas via `ccoPhotoAnnotationStore` och går att öppna igen.
   Mutationstesta: bryt kopplingen och visa att ett test blir rött.
4. Biverkningsgenomgången registrerar **vem, när och vilken version**.
   Ett test som sätter fältet till `true` utan de tre uppgifterna ska
   misslyckas.
5. Vald presentation ligger på konsultationen och går att byta.
6. Ritning och zoner når offerten. **Inget test och ingen kodväg går
   från offert till journal** — visa det, påstå det inte.
7. Alla tre raderna bär `clinics: ['hairtp','curatiio']`.
8. `pending` är kvar som förval. Ingen mall godkänns av kod.
9. `CCO_SEND_LIVE` orörd. Konsultationen skapar underlag, den skickar
   ingenting.

---

## 5 · Vad jag inte avgjort

**Om `ccoPhotoAnnotationStore` duger som den är.** Jag har läst att den
finns och att ingen använder den — jag har inte prövat om modellen bär
versionerade ritningar. Räcker den inte: säg det i rapporten.

**Var presentationerna ska bo.** De ligger i en Downloads-mapp i dag. Om
de ska in i repot, i drive-lagringen eller pekas ut med en sökväg är en
fråga om var Fazli vill kunna byta ut dem — inte något jag ska bestämma
åt honom.

**Vilka biverkningar som ska stå i varje tjänstespecifikation.** Det är
klinisk text. Strukturen — att genomgången registreras med vem, när och
vilken version — är min; innehållet är klinikerns.

**Curatiios uppföljningsjournal** är fortfarande obesvarad sedan ORD-133.
Den frågan lever kvar oavsett vad den här ordern gör.
