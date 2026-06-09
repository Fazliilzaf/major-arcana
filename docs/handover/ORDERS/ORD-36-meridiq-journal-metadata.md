# ORD-36 — Journal-metadata: steg + behandlare (Meridiq-källan)

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Codex (backend / Meridiq-integration)
**Claude-spår:** frontend visar fälten + UAT
**Prio:** P1 · datakvalitet journal-sektionen
**Relaterat:** ORD-34 (datum via Drive modifiedTime), journal-städning i renderaren (a5fff452)

---

## Bakgrund / mål

Journal-sektionen i kundkortet visar nu rena typ-etiketter + minat datum, men **steg + behandlare saknas** ("Steg 5 · Egzona" i facit). De importerade PDF:erna bär bara fil + datum — ingen struktur. Källan till journalerna är **Meridiq**, som HAR strukturen (författare/behandlare, datum, behandlingstyp, ev. steg/serie).

Mål: få **behandlare + steg + behandlingstyp** per journal så sektionen blir som facit ("Ordinationsmall · Steg 5 · 12 maj · Egzona").

## Scope (Codex)

1. **Undersök Meridiq-metadatakälla.** Finns API/export med journal-poster (författare, datum, typ, klient-id)? `migration/meridiq/` har consent-/questionary-kataloger + `buildMeridiqReadLink` (staff-söklänk). Behövs en journal-metadata-endpoint/export.
2. **Synka journal-metadata per patient** → fält på journal-entryt / drive-importerad journal: `treater` (behandlare), `treatmentType`, `journalStep` (om finns), `journalDateReal`. Matcha Meridiq-post ↔ importerad fil (på klient + datum + typ).
3. **Exponera** fälten i dossier-bundle/journalEntries så frontend kan visa "Steg X · datum · behandlare".
4. **Fallback om Meridiq-metadata ej nås:** härled **behandlare** ur Cliento-bokning på journalens datum (bokning bär `staff`/`resourceLabel`), och **steg** ur kanoniska kundresan vid det datumet. Dokumentera vilken väg som valdes.

## FÖRBJUDET

- Skriv inget i Meridiq (read-only).
- Hitta inte på behandlare/steg — bara verklig data (Meridiq eller bokning/journey-matchning). Saknas data → lämna tomt.
- Ingen PII i loggar/URL. Inga creds i kod.

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Test: metadata-matchning (Meridiq el. bokning-fallback), tom-fall (ingen behandlare → tomt, ej påhittat).
- Commit refererar ORD-36.

## Rapport till Claude

Commit + filer + (a) källa (Meridiq-API/export el. bokning-fallback), (b) fältform på journalEntry (treater/treatmentType/journalStep), (c) täckningsgrad (hur många journaler får behandlare/steg). Claude visar fälten i journal-sektionen + UAT.

## Status

| Fas                                | Status          |
| ---------------------------------- | --------------- |
| Order skapad (repo + Notion)       | KLAR 2026-06-08 |
| Codex: Meridiq-metadata / fallback | Väntar          |
| Claude: frontend + UAT             | Väntar          |

---

## PRIORITERAD (Fazli 2026-06-08) + exakt data-fynd

**Prio höjd:** journal-sektionen ska matcha facit ("Steg 5 · 28 maj · Fazli") — steg + behandlare saknas och är nu blockerande för "identisk" design/funktion.

**Verifierat i prod-data (journalEntries via dossier-bundle), Abdulaziz Cabdi Kumi (8 importerade journaler):**

- Fält som finns: `entryId, journalType ("historical_import"), status ("signed"), locked, title (mojibakad), source ("drive_import"), signedAt (=IMPORTDATUM 2026-05-24, ej behandlingsdatum), signedByName ("Drive-import"), treatmentEncounterId (TOM), importMeta, fields, attachments`.
- **Behandlare:** `signedByName` finns men = **"Drive-import"** för importerade (ej riktig kliniker). Claude visar nu `signedByName` filtrerat (döljer "Drive-import") — så riktiga in-app-journaler visar behandlaren, importerade visar inget.
- **Steg:** finns INTE (`treatmentEncounterId` tom, inget step-fält). Kan ej härledas frontend.
- **Riktigt datum:** ligger i `title`/`importMeta.importKey`-sökvägen (t.ex. "December TP 2023 Begum/…2024-01-10") + Drive `modifiedTime` (ORD-34).

**Vad ORD-36 måste leverera:** för importerade journaler — hämta riktig **behandlare** + **journeyStep** + **behandlingstyp** ur Meridiq (matcha på personnummer + datum + typ), eller härled behandlare ur importMeta-sökvägens mapp-namn ("Begum" = kliniker?) + steg ur kanoniska kundresan vid datumet. Exponera som `treater`, `journalStep`, `treatmentType` på journalEntry.
