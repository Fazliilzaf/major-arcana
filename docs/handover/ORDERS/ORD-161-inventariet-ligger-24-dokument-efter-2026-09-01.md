# ORD-161 · Inventariet ligger 24 dokument efter

**Arbetsorder · 2026-09-01**
**Bas:** `main` (`91fde401`)
**Föregås av:** ORD-133 (Curatiio-dokumenten), ORD-157 §4 (proveniens, mätt), `23a1eccc`
**Grind:** ingen dokumenttext ändras · `CCO_SEND_LIVE` orörd
**Prioritet:** P2 — inget är trasigt för patienter, men inventariet svarar fel på frågor det finns för att svara på

---

## Fyndet

Ordern skulle handla om fyra Curatiio-avtal. Mätningen visade tjugofyra.

```
src/ops/hairtp-document-types.catalog.json    62 dokument
public/…/cco-dokument-v1.html                 60 dokument
src/ops/document-inventory.json               36 dokument
```

Alla tjugofyra saknade finns i typkatalogen och i vyn. Ingen finns bara i
inventariet — driften går åt ett håll. Inventariets `generatedDate` är
2026-06-27 och har inte följt med sedan dess.

De som saknas:

```
avtal            offert_botox, offert_filler, offert_op, offert_ortopedi
journaler        journal_estetik_botox, _filler, _profhilo, _ortopedi, _op
patientinfo      curatiio_botox_info, _filler_info, _ogonlock_info,
                 _ortoped_info, _prf_hud_info, _profhilo_info, _prp_hud_mn_info
läkemedel        hyalase_info, botulinum_info
ordination       ordination_recept
friskförsäkran   friskfoers_curatiio_op
för/eftervård    forberedelse_tp, eftervard_tp,
                 forberedelse_curatiio, eftervard_curatiio
```

## Varför det spelar roll

Inventariet är den fil som svarar på _var kommer den här texten ifrån, och är
den godkänd?_ ORD-157 §4 lärde oss vad det kostar när svaret är fel: sex avtal
stod som klinikens egen text medan de bar arton meningar ordagrant ur Nordbros
källa.

Nu är svaret inte fel — det saknas. Frågar någon om `offert_op` finns ingen
rad. Det är en tystnad som ser ut som att dokumentet inte finns, och det gör
det.

Fyra av de tjugofyra fick `serviceIds` i typkatalogen i dag (ORD-148). Samma
dokument har alltså en rad i en fil och ingen i den andra.

---

## Uppgiften

### 1 · Fyll de tjugofyra

Fälten finns redan — kopiera formen från en befintlig post:

```
catalogId, name, journeyStep, category, action, filler, sourceCanonical,
contentSource, repoFiles, canonicalFile, formProvider, language,
flowApplies, legalFlags, notes
```

Det mesta går att härleda ur typkatalogen och ur filerna. **Gissa ingenting.**
Ett fält du inte kan mäta ska stå som `null` med en `notes`-rad som säger vad
som saknas — inte fyllas med något rimligt.

`clinics` / `flowApplies` avgör vilken klinik dokumentet hör till. Curatiios
sjutton och Hair TP:s sju blandas inte.

### 2 · Proveniens där den går att mäta

`src/ops/nordbroProvenance.js` finns sedan ORD-157 §4 och räknar fram hur många
meningar i ett avtal som står ordagrant i Nordbros källfil. Kör den på de fyra
avtalen och skriv in resultatet, i samma form som de sex Hair TP-avtalen fick.

För patientinformation och läkemedelstexter finns ingen Nordbro-källa. Då är
`provenance` inte tillämplig — utelämna fältet hellre än att sätta det till
något tomt.

### 3 · Kontrollen som saknades

Det är den här som gör att det inte händer igen.

Tre filer beskriver samma dokumentuppsättning. De har glidit isär med
tjugofyra rader utan att något sagt ifrån. Skriv ett test som failar när ett
dokument-id finns i typkatalogen eller i vyn men inte i inventariet.

Åt andra hållet också: ett id som bara finns i inventariet är också drift, även
om det inte finns i dag.

Vyn är HTML med inline-JS. Läs den med en regex mot `id: '…'` — det är
skört, och det är avsiktligt synligt: står regexen fel ska testet falla, inte
tyst hitta noll dokument. Assertera att antalet är rimligt innan du jämför.

### 4 · Läs filsystemet, inte git

`git grep` och `git ls-files` läser indexet. En fil som ingen hunnit
`git add` finns inte för dem, och ett test byggt på dem släpper igenom precis
den nya kod det finns för att stoppa. Se
`tests/meta/testerFragarInteGit.test.js` — grinden failar om du gör det ändå.

---

## Fällan

**Generera inte de tjugofyra ur typkatalogen rakt av.** Fälten överlappar men
betyder olika saker: typkatalogen beskriver dokumenttypen, inventariet beskriver
var innehållet kommer ifrån. `contentSource` finns inte i typkatalogen och kan
inte härledas — den måste mätas per dokument.

**Sätt inte `contentSource` till "repo".** Att filen ligger i repot säger inget
om var texten kommer ifrån. Det var precis det felet ORD-157 §4 rättade.

**Rör ingen dokumenttext.** Diff ska visa noll rader under
`public/major-arcana-preview/steg*`.

---

## Godkänt när

1. Inventariet och typkatalogen beskriver samma uppsättning dokument.
2. De fyra avtalen bär mätt proveniens ur `nordbroProvenance.js`.
3. Inget fält är ifyllt med en gissning — det som inte gick att mäta står som
   `null` med en förklaring i `notes`.
4. Ett test som failar när filerna glider isär, åt båda håll.
5. Mutationstesta punkt 4: ta bort en rad ur inventariet och visa att testet
   blir rött. Lägg till ett påhittat id och visa detsamma.
6. Testet läser filsystemet, inte git.
7. Noll ändrade rader i dokumenttexterna.

---

## Vad jag inte avgjort

**Om inventariet ska genereras i stället för underhållas.** Två filer som ska
hållas i synk för hand glider isär — det är vad som hände. Men de bär olika
sorters sanning, och en generator som gissar `contentSource` vore värre än
tystnaden. Kontrollen i punkt 3 löser symptomet; frågan om filerna borde vara
en enda är större och egen.

**Vad `journeyStep` ska vara för de fyra Curatiio-avtalen.** Hair TP:s står som
`"5→7"`. Curatiios flöde kan skilja sig. Mät mot kundkortet innan du skriver
en siffra.
