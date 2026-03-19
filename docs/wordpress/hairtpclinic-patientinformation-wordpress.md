# Hair TP Clinic · Patientinformation i WordPress

## Rekommenderad lösning
Använd en **WordPress child theme-mall + ACF Pro**.

Det här är rätt väg för den här typen av sida eftersom:

- layouten är för avancerad för att redigeras säkert som fri Gutenberg-text
- ni vill kunna ändra allt innehåll i admin
- designen måste hållas konsekvent mellan flera tjänstespecifikationer
- samma mall ska kunna återanvändas för fler behandlingar

Jag rekommenderar därför:

1. Ett eget innehållsslag:
   - `tjanstespecifikation`
2. En dedikerad mall:
   - `single-tjanstespecifikation.php`
3. Alla texter och listor via **ACF-fält**
4. Layout, färger, spacing och typografi hålls i kod

Det betyder:

- redaktören ändrar bara innehåll
- designen går inte sönder av misstag
- fler tjänstesidor kan skapas utan att bygga om sidan från grunden

## Varför inte bara vanlig WordPress-sida?
Det går, men jag rekommenderar inte det för den här lösningen.

Om ni bygger detta som en vanlig sida i blockeditorn kommer ni snabbt få problem med:

- ojämn typografi
- tappad rytm mellan kort och text
- brutna sektioner
- för många manuella steg för redaktören

För just den här sidan är det bättre att WordPress används som **innehållsmotor**, inte som visuell layoutmotor.

## Innehållsmodell
Bygg mallen som en fast struktur med redigerbara fält.

### 1. Grunddata
- Intern titel
- Publik sidtitel
- Kort metabeskrivning
- URL-slug

### 2. Toppsektion
- `eyebrow`
- `title_line_1`
- `title_line_2`
- `lead_text`
- `note_text`
- `primary_button_label`
- `primary_button_url`
- `secondary_button_label`
- `secondary_button_anchor`

### 3. Kontaktpanel
- kliniknamn
- telefon
- e-post
- adress
- bokningslänk

### 4. Börja här-kort
Repeater med:
- stegnummer
- rubrik
- kort text
- länk 1 etikett
- länk 1 mål
- länk 2 etikett
- länk 2 mål

### 5. Snabböversikt
Repeater med:
- siffra
- rubrik
- text

### 6. Huvudsektioner
Varje sektion ska ha egna fasta fältgrupper, inte ett stort WYSIWYG-fält.

Gemensamt för varje sektion:
- sektionsnummer
- sektionstitel
- sektionsintro

#### Om behandlingen
- inledande stycken, separat som repeater
- informationskort som repeater:
  - bubbla/etikett
  - rubrik
  - text
- uppföljningskort:
  - etikett
  - punktlista

#### Vem behandlingen passar för, förväntningar och risker
- inledande stycken
- två första kort
- alternativ-kort
- riskkort (repeater)
- kontaktkort

#### Konsultation, samtycke och förberedelser
- inledande stycken
- konsultationskort
- efter konsultation-kort
- fyra förberedelsekort

#### Så går behandlingsdagen till
- inledning
- steglista/timeline som repeater:
  - stegnummer
  - rubrik
  - text
- kompetens och ansvar-kort

#### Eftervård, PRP och uppföljning
- inledning
- eftervårdskort som repeater
- PRP- och uppföljningsstycken
- uppföljningskort

#### Garanti, försäkringar, pris och dina rättigheter
- inledning
- garanti/pris-kort
- vad som ingår-kort
- rättighetskort

#### Jämförelse mellan DHI och FUE
- inledning
- gemensam jämförelsetext
- DHI-kort
- FUE-kort

### 7. Sidokolumn / stödkort
- snabböversikt
- tidslinje
- kontaktkort

Även dessa bör vara fältstyrda om de ska återanvändas på fler sidor.

### 8. PDF-sektion
- etikett
- rubrik
- text
- knappetikett

### 9. Footer
- kontakttext
- webbplatslänk
- bokningslänk

## Så bör ACF sättas upp
Använd:

- `Tab`-fält för varje större område
- `Group`-fält för fasta block
- `Repeater`-fält för kort, listor, tidslinjer och stödkort
- `Textarea` för vanlig brödtext
- `URL` för länkar
- `Text` för rubriker, etiketter och knappar

Undvik om möjligt:

- stora WYSIWYG-fält för hela sektioner
- fri blockredigering inne i själva mallen

Anledning:

- då tappar ni snabbt den visuella precisionen
- samma struktur blir svår att återanvända
- PDF-versionen blir mindre förutsägbar

## WordPress-arkitektur jag rekommenderar

### Alternativ A: Bäst för flera tjänster
Skapa CPT:
- `tjanstespecifikation`

Fördelar:
- en mall för alla behandlingar
- enkel filtrering och administration
- ni kan lägga till fler behandlingar senare utan att ändra strukturen

Exempel på framtida poster:
- DHI + PRP
- PRP för hår
- Microneedling / Dermapen
- FUE

### Alternativ B: Om ni bara ska ha 1–2 sidor
Bygg det som vanliga WordPress-sidor med en specifik sidmall.

Det fungerar, men är sämre om ni tänker skala upp.

## Hur det kopplas till er nuvarande WordPress-sajt

### Rekommenderad implementation
1. Lägg detta i ert **child theme** eller ett litet internt plugin.
2. Registrera CPT `tjanstespecifikation`.
3. Lägg till ACF-fältgrupper kopplade till det innehållsslaget.
4. Skapa mallfilen `single-tjanstespecifikation.php`.
5. Flytta in nuvarande HTML-struktur i PHP-mallen.
6. Byt ut den hårdkodade texten mot `get_field()` och repeater-loopar.
7. Enqueue samma CSS-designsystem som används nu.

### Slutresultat
Redaktören går in i WordPress och fyller i:
- rubriker
- kort
- listor
- kontaktuppgifter
- sammanfattningar
- PDF-text

Men själva designen förblir låst och konsekvent.

## Hur redigeringen ska kännas för er
Det viktiga är att admin inte blir för tekniskt.

Jag hade därför byggt redigeringsvyn så här:

- Tab 1: Topp
- Tab 2: Snabböversikt
- Tab 3: Om behandlingen
- Tab 4: Trygghet och risker
- Tab 5: Förberedelser
- Tab 6: Behandlingsdagen
- Tab 7: Eftervård
- Tab 8: Ekonomi och rättigheter
- Tab 9: Jämförelse DHI/FUE
- Tab 10: Sidokolumn och PDF

Det blir betydligt enklare för redaktören än ett enda långt fältpaket.

## Viktigt beslut: strukturerad text eller fri text?
Jag rekommenderar:

- **strukturerad text** för kort, listor, tidslinjer och fasta informationsblock
- **begränsad fri text** endast för introduktionsstycken

Det här är bästa balansen mellan:

- redigerbarhet
- designkontroll
- läsbarhet
- PDF-stabilitet

## PDF i WordPress
Behåll samma princip som nu:

- sida på webben
- knapp `Ladda ner som PDF`
- `window.print()`

Det är enklare än att generera PDF på serversidan och ger färre fel.

Om ni senare vill ha riktig servergenererad PDF kan det byggas som steg två.

## Min rekommendation i klartext
Om ni ska använda den här mallen på riktigt i WordPress:

- bygg den **inte** som fri Gutenberg-layout
- bygg den som **ACF + egen PHP-mall**
- använd **CPT** om ni ska ha fler än en tjänstespecifikation

Det är den lösning som ger bäst kombination av:

- enkel redigering
- konsekvent design
- bättre kvalitet för kund
- mindre risk att sidan förstörs över tid

## Nästa praktiska steg
Om vi ska göra detta på riktigt är rätt ordning:

1. Bestäm om ni vill ha:
   - vanlig WordPress-sida
   - eller CPT `tjanstespecifikation`
2. Skapa ACF-fältgruppen
3. Bygga PHP-mallen
4. Flytta över nuvarande innehåll
5. Testa mobil, desktop och PDF

## Vad som redan finns i Arcana
Nuvarande statiska mall finns här:

- innehåll: `/Users/fazlikrasniqi/Desktop/Arcana/public/patientinformation-hartransplantation-dhi-prp.html`
- stil: `/Users/fazlikrasniqi/Desktop/Arcana/public/styles/hairtpclinic-patientinformation.css`
- tokens: `/Users/fazlikrasniqi/Desktop/Arcana/public/styles/hairtpclinic-patientinformation-tokens.css`
- route: `/Users/fazlikrasniqi/Desktop/Arcana/server.js`

Det gör det möjligt att använda den nuvarande versionen som exakt källa när WordPress-mallen byggs.
