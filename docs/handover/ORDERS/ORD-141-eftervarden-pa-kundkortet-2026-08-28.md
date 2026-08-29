# ORD-141 · Eftervården på kundkortet — tre svar på en fråga

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`6bc3924a`)
**Föregås av:** ORD-126 (mönstret för filer → katalog), ORD-139, ORD-140

---

## Frågan kortet ska svara på

> **Är den här patientens eftervård på spår?**

Tre rader, ett svar var:

1. **Har patienten fått instruktionerna?**
2. **När är nästa uppföljning?**
3. **Har någon hört av sig, och hur gick det?**

Fazli, 2026-08-28: alla tre. Ingen ska väljas bort.

Det är inte tre listor bredvid varandra. Det är tre rader som tillsammans
säger om något behöver göras.

---

## Nuläget — tre källor i tre olika skick

### Rad 2 · Nästa uppföljning — data finns

Schemaläggarens jobb bär `dueAt`, `offsetToken`, `treatmentKey` och
`journalDraftEntryId`. Sorterat på `dueAt` (rad 367) ger det nästa
uppföljning direkt.

Sedan ORD-139 är kadensen rätt per behandling — botox 2 veckor, bleph 7
dagar, transplantation 4 · 8 · 12 månader.

### Rad 3 · Kontakt och utfall — data finns, kopplingen är trasig

`ccoAftercareStore` bär redan det som behövs:

```
AFTERCARE_STATUSES   (rad 5)
CONTACT_STATUSES     pending · confirmed · not_needed
OUTCOME_STATUSES     unknown · stable · needs_attention
```

Den har till och med `buildAftercareCaseReadout` — en färdig
sammanställning avsedd för precis den här ytan.

**Men den når aldrig kortet.** `server.js:3102`:

```js
aftercareStore: adapt(l.ccoAftercareStore, [
  'listByCustomer', 'listJobsByCustomer', 'getByCustomer'
]),
```

Två fel i samma rad:

1. `app.locals.ccoAftercareStore` **sätts aldrig** — storet skapas på rad
   11698 men exponeras inte.
2. Metodnamnen finns inte. Storet har `listCases`, `getCase`,
   `applyCaseAction`.

`adapt()` faller tillbaka till tomma listor. Sektionen har alltså varit tom
hela tiden, utan felmeddelande.

### Rad 1 · Instruktionerna — finns inte i systemet alls

Tre PDF:er på disk, **noll katalograder**:

```
[SE] Guide-För&Eftervård-TP.pdf      8 sidor · 773 KB   Hämtade filer
Eftervård HTP.docx.pdf                                  Hämtade filer
TP. Postoperativa instruktioner.pdf  388 KB             iCloud-arkivet
```

Den första börjar _"Förberedelser inför din hårtransplantation"_ och täcker
både för- och eftervård: läkemedel, rökning, nikotin, koffein.

Katalogen har ingen dokumenttyp för vare sig förberedelse eller eftervård.
Enda närliggande raden är `auto_instruktion_formular`, och den handlar om
hälsodeklaration — inte om det här.

**Samma hål som ORD-126 och ORD-133.** Filerna finns, katalogen känner dem
inte, alltså syns de inte och kan inte skickas.

---

## Uppgiften

### 1 · Laga den trasiga kopplingen — och gör den högljudd

`adapt()` ska inte tyst ge tomma listor när storet saknas eller
metodnamnen inte matchar. Det är fjärde gången samma mönster den här
veckan: saknad koppling ser ut som lyckad körning.

Logga när `adapt()` inte hittar någon av metoderna den bad om. En tom lista
och ett saknat store ska gå att skilja åt.

Exponera `ccoAftercareStore` i `app.locals` och peka på **rätt** metoder.

### 2 · Dokumenttyper för förberedelse och eftervård

Följ ORD-126:s mönster exakt:

- katalograder med `data-registry-id` i filerna
- `clinics: [...]` — plural, aldrig `clinic` singular
- `filler: 'system_auto'` om de skickas automatiskt, annars `staff`
- `flowApplies` / `serviceIds` så rätt guide följer rätt behandling

Förberedelse och eftervård är **två olika tillfällen** — före respektive
efter ingreppet. Två rader, inte en, även när de ligger i samma PDF.

### 3 · Kortet visar bevis, inte kryss

Rad 1 ska säga att instruktionen **är skickad och när** — inte att någon
kryssat i en ruta. Samma princip som hela systemet vilar på.

### 4 · Rör inte de tre lagren

Bygg inget fjärde store. Kortet läser:

| Rad                | Källa                                             |
| ------------------ | ------------------------------------------------- |
| Instruktioner      | dokumentregistret                                 |
| Nästa uppföljning  | `ccoAftercareScheduler`                           |
| Kontakt och utfall | `ccoAftercareStore` + `buildAftercareCaseReadout` |

---

## Godkänt när

1. Alla tre raderna syns på kundkortet, med riktig data.
2. `adapt()` loggar när metoderna inte matchar. Ett test som visar det.
3. Ett saknat store och ett tomt resultat går att skilja åt i loggen.
4. Förberedelse och eftervård är egna katalograder med
   `data-registry-id` i filerna.
5. Raderna når **båda** klinikerna där det gäller — `clinics` i plural.
6. Rad 1 visar skickat-datum, inte ett kryss.
7. Mutationstesta: koppla bort eftervårdsstoret och visa att ett test blir
   rött. Att sektionen blir tom **utan** att något larmar är exakt buggen vi
   lagar.
8. `CCO_SEND_LIVE` orörd.

## Vad jag inte avgjort

**`TP. Postoperativa instruktioner.pdf` är inte läst.** Filen ligger
molnlagrad och gav noll tecken text vid läsning. Kontrollera om den är
inskannad — i så fall behöver den OCR innan den kan bli en dokumenttyp med
sökbart innehåll.

**Om Curatiio har egna guider.** De tre filerna är alla märkta TP. Curatiios
behandlingar har egen eftervård — men jag har inte sett några filer. Fråga
Fazli, hitta inte på.

**Vad som händer när instruktionen inte är skickad.** Ska kortet bara visa
det, eller ska det gå att skicka därifrån? Utskick är `CCO_SEND_LIVE`-mark —
visa först, skicka sedan.
