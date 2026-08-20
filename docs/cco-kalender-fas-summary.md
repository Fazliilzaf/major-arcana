# CCO Kalender — sammanställning av genomförd fas

Sammanställd 2026-08-20. Grundad i git-historik och tester som körts i detta pass.

## Kort svar

Kalender-fas A är i praktiken avverkad. Samtliga elva punkter från uppdraget är
antingen implementerade och testade, eller — i fallet v8/v7-städning — redan
borttagna från repot. Den enda nya kod som landade i detta pass är mobilskalens
hantering av `?view=calendar`; allt annat fanns redan på `feat/kalender-fas-a-b`.

## Vad som gjordes, punkt för punkt

| # | Uppgift | Status | Verifierat av |
|---|---------|--------|---------------|
| 1 | Skapa bokning (`openCreateBookingDrawer`) | ✅ | `kalender.html` sätter `CCO_CALENDAR_CREATE_BOOKING_ENABLED = true`; `cco-kalender-shell.js` innehåller `renderCreateBookingDrawer` med catalog-preflight |
| 2 | Datakvalitetspanelen (`bindQualityPanel`) | ✅ | `bindQualityPanel()` finns och testas i `tests/public/ccoKalenderLiveRead.test.js` |
| 3 | Resursvy | ✅ | `v6RenderResourceView()` grupperar bokningar per resurs; test "V6 calendar includes a read-only resource view renderer" passerar |
| 4 | Boka om | ✅ | `performCalendarRebook()` med bekräftelse; test "V6 calendar exposes rebooking for confirmed engine bookings with identity" passerar |
| 5 | Filter på resurs och behandlingstyp | ✅ | `applyResourceFilter()` / `applyServiceFilter()`; test "V6 calendar exposes resource and service filters wired to displayVisits" passerar |
| 6 | Kunddossié i högerpanelen | ✅ | Dossié-flikar (Besök, Historik, Filer, Anteckningar) och `fetchDossierBundle`; test "V6 calendar patient intel enables dossier tabs and fetches dossier-bundle" passerar |
| 7 | Kamera för före/efter-bilder kopplat till journalen | ✅ | `openCameraDrawer()` och journal-länk; test "V6 calendar exposes a camera drawer linked to the journal" passerar |
| 8 | Tangentbordsgenvägar | ✅ | `1/2/3/4` för vyer, `j/k/h/l` för navigering, `?` för hjälp; test "V6 calendar exposes keyboard shortcuts for view switching and help" passerar |
| 9 | `?view=calendar` öppnar kalendern | ✅ | E2E-test `?view=calendar öppnar kalendern direkt utan att klicka nav` grönt på både chromium och mobile-iphone |
| 10 | Ta bort `cco-calendar-v8-shell.js`, `-v7-shell.js`, `-v8-flag.js` | ✅ | Filerna finns inte kvar i repo |
| 11 | Rensa död kod bakom read-only-flaggan | ✅ | `window.CCO_CALENDAR_READ_ONLY = true` är borta från `kalender.html`; test "read-only flag should be removed" passerar |

## Nytt i detta pass (2026-08-20)

### Mobilskalet respekterar `?view=calendar`

Tidigare omdirigerade `/major-arcana-preview/?view=calendar` på mobil till
`/staff?view=customers`, och bottennavet markerade **Hem** även när kalendern
var aktiv.

Ändrat i:

- `public/major-arcana-preview/app/patient-master-ui.js`
- `public/major-arcana-preview/cco-mobile-shell.js`
- `tests/e2e/cco-flows.spec.js` (täcker både desktop och mobil)

Pushad till `feat/kalender-fas-a-b` som `ede4bd0cb`.

## Testresultat från detta pass

### Enhetstester

```
npm run test:unit
→ 7 028/7 028 pass
```

### Kalender-specifika nodtester

```
node --test tests/public/ccoKalenderLiveRead.test.js
→ 14/14 pass
```

### E2E

```
npm run test:e2e
→ 58 passed, 8 skipped, 0 failed
```

Felen åtgärdades i commit `e8b1899e5`:

- Uppdaterade föråldrade förväntningar i `tests/e2e/cco-flows.spec.js`
  (sidtitel, antal runtime-moduler, sök/⌘K, bokningsytans synlighet).
- Exkluderade `cco-v2-virtualization.spec.js` från huvudkonfigen — den har
  sin egen server (`playwright.virtualization.config.js`) och ska köras med
  `npm run test:e2e:v2-virtualization`.

```
npm run test:e2e:v2-virtualization
→ 2/2 passed
```

Kalenderspecifika E2E-tester är gröna:

- `?view=calendar öppnar kalendern direkt utan att klicka nav` (chromium + mobile-iphone)
- `CCO Preview UI › calendar day view` (chromium + mobile-iphone)

## Teknisk översikt

### Arkitektur

- `/kalender.html` är den enda levande kalendern.
- `/major-arcana-preview/?view=calendar` öppnar samma `kalender.html` i en
  iframe (`?embed=1`).
- `cco-kalender-shell.js` är den enda kalender-runtime som laddas.
- `cco-calendar-v8-shell.js` / `-v7-shell.js` / `-v8-flag.js` är borta.

### Patientsäkerhet bevarad

- "Okopplad patient" / "Tvetydig · okopplad" visas fortfarande.
- Kundkort öppnas inte vid osäker identitet.
- Källa (CCO eller Cliento) visas per bokning.

### Datakopplingar

- `patientId` är migrerat till 42 051 av 53 316 Cliento-bokningar.
- Legacy-bokningsärenden har fått `patientId` där matchning var möjlig.
- Kalendervyerna exponerar `patientId` så att kundkort kan öppnas.

## Produktionsspotcheck (2026-08-20)

Prod kör commit `dee5a133d` på `main` — den har **inte** kalender-fas A:s
ändringar än. Grenen `feat/kalender-fas-a-b` är inte mergad till `main`.

```
https://arcana.hairtpclinic.se/kalender.html
→ title: "CCO Kalender — v6 de vilda"
→ CCO_CALENDAR_READ_ONLY = true   (fortfarande satt)
→ CCO_CALENDAR_CREATE_BOOKING_ENABLED: ej satt
→ Resursfliken finns i DOM, inte disabled
→ cco-kalender-shell.js?v=20260717j laddas
```

**Slutsats:** prod är fortfarande i read-only-läge. För att kalender-fas A:s
funktioner (skapa bokning, ombokning, resursvy, filter, dossié, kamera,
tangentbordsgenvägar) ska nå produktion krävs en merge av
`feat/kalender-fas-a-b` → `main` följt av deploy.

## Öppna frågor / kvarstående risker

1. **Kalender vs övriga segment.** Kalendern har nu `patientId`, men en del
   andra ytor (t.ex. Automatisering, Analys) är fortfarande löst kopplade till
   kund-ID enligt tidigare analys. Det är ett separat spår, inte en
   kalender-blockerare.

2. **Testtäckning för skrivande operationer.** Ombokning och skapa bokning har
   tester på funktionsnivå, men det finns inga fulla E2E-tester som går hela
   vägen från UI-klick till bekräftad bokning i backend. Det är den största
   återstående testluckan.

3. **Deploy och prod-verifiering.** Innan personal använder skrivande funktioner
   bör grenen deployas till staging/prod och en manuell UI-spotcheck göras på
   riktig data.

## Rekommendation

Fas A är klar att stängas. Nästa naturliga steg är antingen:

- **Fas B:** fulla E2E-tester för skapa/omboka bokning, inklusive
  patientsäkerhetsfall (tvetydig identitet, konflikter).
- **Integrering:** knyta kalenderns bokningshändelser till Konversationer och
  Automatisering så att påminnelser/no-show-regler kan triggras.
