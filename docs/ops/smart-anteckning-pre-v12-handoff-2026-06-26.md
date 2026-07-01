# Smart anteckning - pre-V12 CCO handoff

Datum: 2026-06-26

Detta dokument pekar ut den implementerade Smart anteckning-funktionen i gamla CCO innan V12-ombyggnaden. Detta är inte kundkortets anteckningssektion och inte nya V12-vyn.

## Källa

Arkiverad pre-V12 implementation:

`/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/major-arcana/major-arcana-test/public/major-arcana-preview/index.html`

Viktiga ankare i källan:

- `#note-mode-shell` runt rad 8144: lägesväljare för Smart anteckning.
- `aria-label="Öppna smart anteckning"` runt rad 9165: knappen i Svarstudio-verktygsraden.
- `#note-shell` runt rad 9536: själva Smart anteckning-arbetsytan.

## Screenshots

Triggern i Svarstudio:

`/Users/fazlikrasniqi/Code/major-arcana/docs/ops/screenshots/pre-v12-smart-anteckning/pre-v12-smart-anteckning-button-highlighted-in-svarstudio.png`

Lägesväljare:

`/Users/fazlikrasniqi/Code/major-arcana/docs/ops/screenshots/pre-v12-smart-anteckning/pre-v12-smart-anteckning-mode-picker.png`

Arbetsyta:

`/Users/fazlikrasniqi/Code/major-arcana/docs/ops/screenshots/pre-v12-smart-anteckning/pre-v12-smart-anteckning-shell.png`

## Funktionellt innehåll

Smart anteckning öppnas från Svarstudio via en liten dokumentikon i verktygsraden.

Lägesväljaren har fyra val:

- Sammanfatta konversation
- Extrahera viktiga detaljer
- Identifiera åtgärder
- Skapa manuell anteckning

Arbetsytan innehåller:

- Sparplats: Kundprofil, Konversation, Medicinsk, Betalning, SLA / eskalering, Intern, Uppföljning.
- Liveförhandsvisning av var anteckningen hamnar.
- Auto-hämtad data: konversations-ID/sammanhang, sentiment, avsikt, svarstid.
- Auto-kopplas till: relevanta tråd- och ansvarspunkter.
- Snabbmallar: Ombokning begärd, Allergier / kontraindikationer, Betalningsplan.
- Anteckningsredigerare med auto-genererad text.
- Taggar och ny tagg.
- Prioritet.
- Synlighet.
- Spara anteckning / Avbryt.

## Beslut

Cloud Code ska använda dessa pre-V12 screenshots och källankare som facit för att återskapa Smart anteckning i konversationsflödet. Använd inte V12-kundkortets anteckningsblock som facit för denna funktion.
