# Kundresa 9 · Byggplan

Status: ORD-47 V1  
Kalla: `KUNDKORT-DOKUMENT-PLACERING-FACIT.md` + `hairtp-document-types.catalog.json`

## P0 · Facit

Kundkortet ska inte visa 36 dokument som en flat arbetslista. Katalogen ar sanningskallan, men UI:t ska placera varje dokument dar personalen naturligt arbetar i kundresan.

Tre lager galler:

- **A · Rail/hogerpanel:** kort statusrad och nasta action.
- **B · Stor kundvy:** nio tematiska kort efter kundresan.
- **C · Registry:** dolt mallbibliotek for QA/admin/felsokning.

## P1 · Topp-rad

Topp-raden visar patient, aktuellt steg, nasta action och tid till operation. Den ska hoppa till ratt kort, inte oppna registry-listan.

## P2 · Nio kort

Stor kundvy byggs runt dessa kort:

1. Bokning
2. Halsa
3. Behandling
4. Juridik
5. Operation
6. Foto-samtycke
7. Uppfoljning
8. Ekonomi
9. Anteckningar & policy

## P3 · Offert 5/7-split

Offert-typerna ligger kvar med `journeyStep: 7` i katalogen eftersom kunden signerar/acceptar i steg 7.

UX-regeln ar:

- `journeyStepDisplay: 5` for behandlingsplan/offertarbete.
- `journeyStepAction: 7` for signering/avtal.
- Samma `registryId`, tva ytor.

## P4 · Resolver

`cco-journey-doc-resolver.js` ar ORD-47-motorn for UI:

- `resolvePatientJourneyStep(card)`
- `resolveActiveFlow(card)`
- `listDocsForUiCard(card, uiCard)`
- `railStatusLine(card)`

Den filtrerar bort irrelevanta offerter/journaler sa personalen bara ser aktivt flode.

## P5 · Katalogmetadata

Alla 36 typer ska ha:

- `uiCard`
- `uiCards`
- `journeyStepDisplay`
- `journeyStepAction`
- `actionKind`
- `uiLayerA`
- `hiddenFromRegistryDefault: true`

Verifiering sker med `npm run verify:journey-doc-placement`.

## P6 · Bokning

§1 visar bokningsbekraftelse, paminnelse, avbokningsbekraftelse och formularinstruktioner som kommunikationsrader. Steg 1 ar bokningsmotor, inte dokument.

## P7 · Halsa

§2 samlar HD, ENG-formular, PRP/MN-info, konsultationsmall och ID-verifiering. Kortet visar status for aktivt flode, inte alla formular alltid.

## P8 · Behandling

§3 samlar behandlingsplan, ordination, offert-mail och aktiv offertvisning. Det ar personalens planeringsyta.

## P9 · Juridik

§4 samlar betanketid, angerratt, narbokningssamtycke och signeringsmomentet for aktiv offert. Avtalsreview bor ligga har.

## PA · Operation

§5 ar operationsdagens personalyta: friskforsakran, journal, ordination och fore/efter-bildmall. Op-dag-panelens fem knappar mappar hit.

## PB · Foto

§6 ar foto-samtycke. Bildstudio och ritade offertbilder kan lankas hit, men originalbilder per besok ligger i Besok/Journal-flodet.

## PC · Uppfoljning

§7 ar post-op timeline for PRP, 4 man, 6 man och 12 man. Dessa journaler ska inte blandas in i vardags-registry.

## PD · Ekonomi Och Policy

§8 samlar Medical Finance och externa ekonomisystem som Fortnox/Pipedrive. §9 samlar interna anteckningar, integritet och internt SMS.

## ORD-47 V1 Leverans

- Katalogen har 36/36 placeringar.
- Resolver ar laddad fore kundkortsreferensen.
- CSS-tokens for nio kort finns.
- Verify-scriptet stoppar orphan-placeringar och felaktig offert 5/7-split.

Nasta implementation far bygga visuella kort ovanpa detta utan att skapa en ny datavag.
