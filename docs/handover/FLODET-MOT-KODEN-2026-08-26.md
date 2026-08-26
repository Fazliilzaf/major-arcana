# Figma-flödet mot vad CCO gör idag

**Beslutsunderlag till Fazli · 2026-08-26**
**Källa:** FlowChart | Leo, nod 58171:1697 — kartlagt ruta för ruta mot
kodbasen.

Ingen kod är beställd. Det här är vad som finns, vad som saknas, och vad
varje lucka kostar.

---

## Kortversionen

Av flödets sju faser är **bokning, konsultation och behandling till stor
del byggda**. Det som fattas ligger samlat i tre klumpar:

| Klump            | Vad det handlar om                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| **Pengarna**     | Halva betalningsflödet finns inte. Ingen 20/80-logik, ingen slutfaktura.                          |
| **Eftervården**  | PRP går att boka, men inget bokas automatiskt. Serie-strukturen 1/4–4/4 finns i koden men är död. |
| **Efter kunden** | Advocacy och återkomst finns inte alls. Flödet tar slut.                                          |

Och en sak som inte är en lucka utan ett **fel**: kunden kan signera bort
sin ångerrätt, men koden läser aldrig den signaturen. Betänketiden
blockerar ändå.

---

## De fem som betyder mest

Sorterade efter hur billigt det är att fixa mot hur mycket det kostar
att låta vara. Varje påstående är kontrollerat mot koden, och de fem
nedan dessutom mot produktion.

### 1 · Ångerrättsavståendet läses aldrig

Dokumentet finns registrerat — `samtycke_angerratt`, `consentKind:
'cooling_off_waiver'` (`src/ops/patientDocumentSignRegistry.js:78`).
Kunden kan signera det.

**Men ingen kod läser `cooling_off_waiver`.** Sökningen ger bara
definitionen. `coolingOffEndsAt` i
`src/ops/ccoTreatmentAgreementStore.js` upphävs aldrig.

**Följd:** kunden avstår ångerrätten, systemet bryr sig inte, bokningen
blockeras ändå tills betänketiden gått ut.

Dessutom: betänketiden är **2 dagar** i koden
(`ccoHairTpCoolingOffPolicy.js`, `CCO_HAIR_TP_COOLING_OFF_DAYS`), medan
avtalstexten talar om **14 dagar**
(`ccoTreatmentAgreementDocument.js:84`). Två olika tal i samma system.

**Detta är en bugg, inte en saknad funktion.** Den bör bekräftas mot
verkligheten: har någon kund fastnat här?

### 2 · Slutfakturan 80 % finns inte

Förskottet finns delvis: `depositAmount`, statusen `deposit_pending`,
Swish och kortlänk. Men beloppet skrivs in för hand — bokstavligen:

```js
// public/major-arcana-preview/app/patient-master-ui.js:13697
window.prompt('Deposition (valfritt):');
```

Ingen 20 %-beräkning. Sökning på `slutfaktura`, `restbelopp`,
`finalInvoice`, `delfaktura` ger **noll träffar**.

Fortnox finns som integration men `ARCANA_FORTNOX_ENABLED=false`, och
patientspåret är uttryckligen `mode: 'prepare_only'`,
`fortnoxWriteSupported: false` — det står i klartext att fakturan ska
skapas manuellt i Fortnox.

**Följd:** flödets ruta "Slutfaktura | 80 % behandlingskostnad" motsvaras
av ingenting. All fakturering är manuell.

### 3 · Två motstridiga uppföljningsklockor

Journalmallarna säger 4, 6 och 12 månader
(`src/ops/ccoJournalSchemas.js:25`).

Aftercare-cron säger 1, 3, 6 och 12 månader
(`config/cco-treatment-document-requirements.json`, mallar
`followup_fue_1m/3m/6m/12m`).

Figma säger 4, 6 och 12. Dokumentationen
(`cco-workflow-v13.md:73`) säger 4, **8** och 12 — och det finns en
`steg8-journal-tp-follow-8`-HTML som inte har något schema.

**Fyra källor, tre olika svar.**

→ **Avgjort 2026-08-26: 4, 8 och 12 gäller.** Se avsnittet "Fazlis
beslut" nedan för de elva ställen som säger något annat.

### 4 · Telefonsamtalet är osynligt

Flödets ruta mellan accepterad offert och bokad behandling är
"Telefonsamtal". I koden finns **ingenting**: inget samtalsobjekt, ingen
kanal `phone`, ingen samtalslogg. Sökt på `telefonsamtal`, `callLog`,
`outbound_call`, `phone_call` — noll.

**Följd:** ni vet inte vem som ringt, när, eller vad som sades. Steget
där affären faktiskt stängs lämnar inga spår.

### 5 · PåminnelseMail ×4 saknas

Detta är rutan Figma själv märkt "MANUELL HANTERING". Bekräftat i koden:
`dispatchOfferEmail` är **engångs** och idempotensblockerad
(`ccoCommercialMailDispatch.js:138`). `ccoPortalNudge` är också engångs.
Ingen sekvens, ingen eskalering.

Sökt: `offerReminder`, `quoteReminder`, `obesvarad`, `followUpSequence`,
`sequenceStep`, `escalation`. Noll.

**Följd:** en offert som inte besvaras dör tyst, om ingen råkar titta.

---

## Fas för fas

### FAS 1 · Bokning

| Steg i flödet                    | Status                                                                                                    | Anmärkning                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bokning via widget in i systemet | Delvis                                                                                                    | **Cliento-bokningar kommer in via mail-parsning**, inte API. Egen bokningsmotor finns parallellt. `ARCANA_CLIENTO_INTEGRATION_ENABLED=false`.          |
| Online / Fysisk konsultation     | Finns                                                                                                     | Båda `publicBookable: true`.                                                                                                                           |
| Samtycke bokningsvillkor         | **Saknas**                                                                                                | Endast GDPR valideras. Sökt `bokningsvillkor`, `termsConsent`, `acceptTerms` — noll.                                                                   |
| Samtycke personuppgiftspolicy    | Finns                                                                                                     | Hård gate + tidsstämpel. **Men bara i egna bokningsmotorn** — Cliento-bokningar får inget GDPR-samtycke registrerat.                                   |
| Personuppgifter lagras           | Finns                                                                                                     |                                                                                                                                                        |
| AutoMail bokningsbekräftelse     | Finns                                                                                                     | Med ICS-bilaga, idempotent.                                                                                                                            |
| AutoMail hälsodeklaration        | Delvis                                                                                                    | Funktionen finns men är **operatörsdriven**, inte trigga-på-bokning. Bokningsbekräftelsen innehåller ingen HD-länk — trots att koden påstår motsatsen. |
| AutoMail tjänstespecifikation    | Delvis                                                                                                    | Länken finns, men skickas i avtalssteget, inte vid bokning.                                                                                            |
| PåminnelseMail 24 h              | **E-post i drift.** SMS byggt men avstängt (`CCO_SMS_REMINDERS_LIVE`). Lead-tid: 24 h fysisk, 4 h online. |

### FAS 2 · Konsultation

| Steg                      | Status     | Anmärkning                                                                            |
| ------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| Hälsodeklaration fylls i  | Finns      | Två vägar: patientportal med token, och mail-ingest till `halso@`.                    |
| Konsultation dokumenteras | Finns      | Encounter + consultation-case. Ingen egen `consultation`-journaltyp.                  |
| Behandlingsplan           | Finns      | Med statusflöde och zoner.                                                            |
| Offert                    | Finns      | Skapas, skickas, e-signeras, betänketid.                                              |
| Ritningar / zoner         | Finns      | `journal-plan-editor.js`, graftantal per zon.                                         |
| Anpassat erbjudande       | Delvis     | Automatisk plan→offert finns. Men "anpassat erbjudande" är dokumenterat som manuellt. |
| PåminnelseMail ×4         | **Saknas** | Se punkt 6 ovan.                                                                      |
| Ja/Nej på offert          | Finns      | Men **ingen kundvänd avvisa-knapp** — bara personal kan sätta `rejected`.             |

### FAS 3 · Konvertering

| Steg                                | Status          | Anmärkning                                                                  |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------- |
| Telefonsamtal                       | **Saknas**      | Se punkt 5.                                                                 |
| Offert accepterad → boka behandling | Finns           | Grind kräver signerat avtal för `fue, dhi, beard, eyebrow`.                 |
| Behandlingsbekräftelse              | Delvis          | Samma mall som konsultation. Ingen behandlingsspecifik bilaga.              |
| TP Behandlingsavtal                 | Finns           | Full statusmaskin, PDF, e-signering.                                        |
| Samtycke bildhantering              | Finns           | Två lager: avtalsbundle + `ccoPhotoConsentStore`.                           |
| Avstå ångerrätt                     | **Trasigt**     | Se punkt 2.                                                                 |
| Bokningsvillkor som länk            | **Saknas**      | Inga villkorslänkar i bekräftelsemallarna.                                  |
| "Alla fyra godkända"                | Finns           | `computeReadyForTreatment` väger åtta villkor.                              |
| Betala förskott 20 %                | Delvis          | Swish, kortlänk, fakturautkast finns. **Ingen 20 %-logik.**                 |
| Faktura 20 %                        | Delvis          | `prepare_only`. Manuell i Fortnox.                                          |
| Förskott betalt                     | Delvis          | Läses, sätts inte automatiskt.                                              |
| Slutfaktura 80 %                    | **Saknas**      | Se punkt 3.                                                                 |
| Bokförings-/betalintegration        | Finns, avstängd | Fortnox, Swish, Nets. Alla `false` by default. Klarna och Visma finns inte. |

### FAS 4 · Behandling

Den här fasen är den mest kompletta i hela systemet.

| Steg                              | Status     | Anmärkning                                                                                                     |
| --------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| Förkonsultation som eget steg     | **Saknas** | Sökt `förkonsultation`, `pre-consultation` — noll.                                                             |
| ID & friskförsäkran               | Finns      | Hård grind: alla op-dagsknappar låsta tills friskförsäkran signerats.                                          |
| Vitalparametrar                   | Delvis     | Blodtryck och puls finns — som **fritext**. Inga gränsvärden, inga varningar.                                  |
| Bekräfta behandlingsplan          | Finns      |                                                                                                                |
| Rakning + pre-OP-foto             | Delvis     | Rakning är efterhandsobservation, inte ett moment med checklista.                                              |
| Ritning + pre-OP-foto             | Finns      |                                                                                                                |
| Bildbank                          | Finns      | Termen finns inte, funktionen gör det: foton per besök med fas och encounter-koppling.                         |
| Medicinsk instruktion             | Delvis     | Dokumenttypen finns, `formProvider: "manual"` — ingen ifyllbar mall.                                           |
| Lokalbedövning 1 & 2              | Finns      | Med doser: Carbokain, Marcain, adrenalin, Tribonat.                                                            |
| Extraktion, kanaler, implantation | Finns      | Tidsregistrering per moment + graftantal per typ.                                                              |
| PRP 1/4 under OP                  | **Saknas** | `journal-tp-schemas.js` har **noll** PRP-träffar.                                                              |
| Post-OP-foto                      | Finns      |                                                                                                                |
| POST OP-medicinering              | Delvis     | Ja/nej-fält för Dalacin, Betapred, Ibuprofen. Ingen dos, ingen behandlingstid, inget patientutskick.           |
| Ordination / recept               | Delvis     | Granskningsflöde finns. Mallarna är `manual`. Ingen e-recept, ingen apoteksintegration.                        |
| Rumsallokering                    | Delvis     | Fungerar i bokningen. **Rummet följer inte med till journalen** — encounter och TP-journal bär inget rumsfält. |

### FAS 5 · PRP-eftervård

| Steg                        | Status            | Anmärkning                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRP går att boka            | Finns             | Kontrollerat mot produktionens katalog: `prp-hair`, `prp-skin`, `microneedling`, `fue`, `dhi`, `beard`, `eyebrow` är alla `active=true, publicBookable=true`. **Obs:** seed-värdena i `ccoBookingEngineStore.js` säger `false` för alla dessa — en ny miljö startar alltså med hela behandlingskatalogen avstängd. |
| Boka PRP 2/4 efter OP       | **Saknas (auto)** | Ingen kod skapar bokningar programmatiskt. Alls.                                                                                                                                                                                                                                                                   |
| Serie 1/4–4/4               | **Död kod**       | `src/ops/recurringBookings.js` har full seriemodell med `sequenceNumber`, `totalInSeries`, `getSeriesProgress`. **Ingen route, ingen UI använder den.**                                                                                                                                                            |
| Påminnelse per PRP          | Delvis            | Generisk 24 h-påminnelse. Ingen PRP-specifik regel.                                                                                                                                                                                                                                                                |
| Bokningsbekräftelse per PRP | Finns             | Men se punkt 1 — PRP går inte att boka.                                                                                                                                                                                                                                                                            |
| Journal per PRP             | Finns             | `prp_treatment:tp_post_op`.                                                                                                                                                                                                                                                                                        |
| Före/efter per omgång       | Delvis            | Bilder taggas `before`/`after`, men kopplas inte till omgångsnummer.                                                                                                                                                                                                                                               |
| "Bokad 3/4"                 | **Saknas**        | Frasen finns bara i dokumentationen.                                                                                                                                                                                                                                                                               |

Ett kuriosum värt att notera: sessionnumret härleds ur **fotodatum**,
inte ur bokningar, och koden flaggar det själv som
`sessionNumberIsUnreliable`.

### FAS 6 · Uppföljning 4/6/12 mån

| Steg                       | Status            | Anmärkning                                                                                     |
| -------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| Boka uppföljning           | **Saknas (auto)** |                                                                                                |
| Journalutkast              | Finns             | `ccoFollowupDraftPlanner` skapar **journalutkast** — bokar inget, mailar inget.                |
| Journalmallar 4/6/12       | Finns             | Men se punkt 4 om vilka månader som gäller.                                                    |
| Räknare 1/3, 2/3, 3/3      | Delvis            | Tre statusbubblor i UI:t, ingen "x av 3".                                                      |
| Påminnelse 24 h            | Delvis            | Bara om någon bokat manuellt. Utkastgeneratorn skapar inga bokningar, alltså inga påminnelser. |
| Före/efter per uppföljning | Delvis            | Stadiet finns i namngivningen, kopplingen till omgång saknas.                                  |

### FAS 7 · Advocacy

| Steg                        | Status                           | Anmärkning                                                                                                                                                                                                                                                     |
| --------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resultatbilder Före & Efter | Delvis                           | Endpoint finns som returnerar `{before, after, unclassified}`. Ingen sammanställning, ingen kurering.                                                                                                                                                          |
| Anpassat Mail manuellt      | Delvis                           | Generisk fil-utskickskanal finns. **Dry-run som default** (`CCO_SEND_LIVE`). Ingen resultatbild-mall.                                                                                                                                                          |
| Instagram                   | **Saknas**                       | Ingen publicerings-API. `media_publish`, `ig_user`, `instagram_business` — noll träffar. Instagram finns i CMO:s kanalplanering, men piloten kör bara LinkedIn.                                                                                                |
| Publiceringssamtycke        | Finns — **i fyra separata spår** | `publishBeforeAfterPhotos` på patientmaster, en utskickbar samtyckesmall, `consentToPublish` i post-op-flödet, och en Meridiq-katalogflagga. **De synkas inte med varandra.** Endpointen returnerar samtycket men blockerar inte utan det.                     |
| Efter 12 månader            | Delvis                           | Ett review-utskick triggas efter sista uppföljningen: fotolänk + omdömes-CTA, 4–5★ kan publiceras till Google efter godkännande. **Ingen recall, ingen nästa behandling, ingen merförsäljning.** Sidopanelen "Merförsäljningsmöjligheter" är `enabled: false`. |

---

## Vad flödet inte visar, men koden gör

Tre saker finns i CCO som Figma inte ritat:

- **Automationsregistret** — femton signaler
  (`ccoAutomationRegistry.js`) som redan upptäcker saknad
  hälsodeklaration, saknad behandlingsplan, saknat fotosamtycke.
  Runnern är avstängd (`ENABLE_AUTOMATION_RUNNER`, en flagga som inte
  ens finns i `.env.example`) och allt kräver mänskligt godkännande.
- **Omdömesflödet efter 12 mån** — beskrivet ovan, finns inte i Figma.
- **ID-verifiering som hård grind** — `CCO_ID_VERIFICATION_HARD_GATE`
  är på by default. Blockerar op-dagen. Står inte i flödet.

---

## Vad jag inte kunnat avgöra

- ~~Vilken uppföljningskadens ni kör.~~ **Besvarad: 4/8/12.**
- ~~Hur många PRP-omgångar det är.~~ **Besvarad: fyra — en på
  operationsdagen, tre efter.**
- Om betänketiden faktiskt fastnat för någon kund i verkligheten, eller
  om ni löser det manuellt.
- Om PRP-bokningarna görs i Cliento i stället, och därför inte behöver
  automatiseras i bokningsmotorn.

De två som återstår avgör hur mycket av listan ovan som är verkliga
problem och hur mycket som är kartan som inte stämmer med terrängen.

---

## Fazlis beslut · 2026-08-26

Två av de tre öppna frågorna är besvarade.

### Beslut 1 · Uppföljningen är 4, 8 och 12 månader

Inte 4/6/12. Inte 1/3/6/12.

**Elva ställen i koden säger något annat.** Alla behöver ändras:

| Fil                                             | Rad        | Vad som står                                                 |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `src/ops/ccoFollowupDraftPlanner.js`            | 29         | `FOLLOWUP_MONTHS = [4, 6, 12]`                               |
| `src/ops/ccoFollowupDraftPlanner.js`            | 33         | `6: '6_manader'`                                             |
| `src/ops/ccoJournalSchemas.js`                  | 25         | `['4_manader', '6_manader', '12_manader']`                   |
| `app/journal-follow-up-schemas.js`              | 139–141    | hela `6_manader`-blocket                                     |
| `app/patient-master-ui.js`                      | 9899       | knappen `data-follow-form-variant="6_manader"`               |
| `app/cco-v9-customers-parity.js`                | 1515       | trösklarna `{'4_manader':4, '6_manader':6, '12_manader':12}` |
| `app/cco-v9-customers-parity.js`                | 2007, 2009 | statusbubblan `follow_6`                                     |
| `migration/meridiq/journal-schema-catalog.json` | 683–685    | schemadefinitionen                                           |
| `src/ops/scheduler.js`                          | 4618       | jobbnamnet "4/6/12 mån"                                      |
| `src/ops/ccoPatientCareOps.js`                  | 825        | kommentaren                                                  |
| `src/ops/recurringBookings.js`                  | 25         | etiketten "Uppföljning HT (4+6+12 mån)"                      |

Och separat, med en **helt annan kadens**:

```json
// config/cco-treatment-document-requirements.json
treatments.fue: ["1m", "3m", "6m", "12m"]
treatments.dhi: ["1m", "3m", "6m", "12m"]
```

Fyra tillfällen, varav inget sammanfaller med 4/8/12. Den här filen styr
aftercare-cronets utskick — så systemet mailar enligt en kalender och
journalför enligt en annan.

**Det goda:** 8-månadersmallen finns redan.
`steg8-journal-tp-follow-8-final-demo.html`, skapad 2026-08-26 07:15.
Den behöver inte byggas, bara kopplas in — det saknas ett
`8_manader`-schema för den.

En detalj värd att kontrollera: mallarna för 4 och 6 månader är
byte-identiska i storlek och skiljer sig i praktiken bara på titeln. Om
4-, 8- och 12-månaderskontrollerna ska fråga olika saker är det inte
gjort än.

### Beslut 2 · PRP är fyra totalt — en på operationsdagen, tre efter

Detta är redan kodat. I en modul ingen använder.

```js
// src/ops/recurringBookings.js:20
{ templateId: 'prp-hair-3', label: 'PRP Hår — 3 behandlingar',
  serviceId: 'prp-hair', count: 3, intervalWeeks: 4 }
```

Tre behandlingar, fyra veckors mellanrum. Exakt modellen. Modulen har
också `sequenceNumber`, `totalInSeries`, `markOccurrenceBooked`,
`markOccurrenceCompleted` och `getSeriesProgress` — allt som behövs för
"efterbehandling bokad 3/4".

`rg "recurringBookings"` ger **en enda träff utanför filen själv**:
`server.js:10434`, en `require`. Ingen route, ingen UI, inget anrop.

**Det som faktiskt saknas är dokumentationen av PRP 1.**

```
grep -ci "prp" app/journal-tp-schemas.js  →  0
```

TP-journalen — den som fylls i på operationsdagen — har **noll**
PRP-fält. Figma-flödet ritar "PRP 1/4" som ett moment i OP-rutan
tillsammans med extraktion, kanaler och implantation. I journalen finns
de tre andra men inte PRP.

Följden: PRP-omgång 1 lämnar inga spår, och därför kan systemet aldrig
veta att omgång 2 är näst på tur. Fritextfältet i efterbehandlings\-
journalen — _"Hur många PRP-efterbehandlingar har genomförts hittills?
Ange siffra"_ — är den enda räknaren som finns, och den fylls i för hand.

Och `config/cco-treatment-document-requirements.json` säger för
`prp_hair`: `["2w_after_each_session", "1m_after_final"]` — alltså en
egen kadens som inte heller vet om att det ska vara fyra.

### Vad besluten betyder tillsammans

Två saker blir tydliga när båda svaren ligger på bordet:

**Serie-strukturen behöver inte byggas.** Den finns, komplett, för både
PRP och uppföljningar. Den behöver kopplas in och få rätt siffror. Det
är en mycket mindre uppgift än att bygga den från noll.

**Men den kan inte kopplas in förrän PRP 1 dokumenteras.** Utan ett
PRP-fält i op-dagsjournalen finns ingen startpunkt för serien. Det är
den ena ändan av tråden.

### Kvar att bestämma

- Fyra veckors mellanrum mellan PRP-omgångarna — stämmer det, eller är
  det något annat i praktiken?
- Räknas 4/8/12 från operationsdagen eller från sista PRP?
- Ska 4-, 8- och 12-månadersmallarna fråga olika saker, eller räcker
  samma formulär tre gånger?

---

## Om metoden

Kartläggningen gjordes av tre parallella genomgångar av kodbasen, en per
fasblock. Därefter kontrollerade jag de viktigaste påståendena själv.

Det var befogat. Ett av dem — "PRP-tjänsterna är avstängda och kan inte
bokas" — var **fel**. Genomgången hade läst seed-värdena i
`ccoBookingEngineStore.js` (som mycket riktigt säger `active: false`)
och inte det verkliga tillståndet. Produktionens katalog säger tvärtom.
Påståendet är struket.

De påståenden som står kvar i listan över de fem viktigaste är
kontrollerade var för sig:

| Påstående                         | Kontroll                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `cooling_off_waiver` läses aldrig | 1 träff i hela `src/` — definitionen                                                   |
| Ingen slutfaktura                 | 0 träffar: `slutfaktura`, `restbelopp`, `finalInvoice`, `delfaktura`, `depositPercent` |
| Telefonsamtal loggas inte         | 0 träffar: `telefonsamtal`, `callLog`, `outbound_call`, `phone_call`, `samtalslogg`    |
| Ingen offertpåminnelse-sekvens    | 0 träffar: `offerReminder`, `quoteReminder`, `followUpSequence`, `sequenceStep`        |
| Betänketid 2 dagar                | `ccoHairTpCoolingOffPolicy.js:9`                                                       |

Övriga rader i fas-tabellerna kommer från genomgångarna och är **inte**
enskilt omkontrollerade. Behandla dem som väl underbyggda, inte som
bevisade — och be mig kontrollera innan något beställs på dem.
