# Meridiq Source of Truth Matrix

*Steg 10.3 av 11-stegs CCO/Hair TP Clinic compliance-audit. Föregående: [`CHANNEL-DOCUMENT-INVENTORY.md`](./CHANNEL-DOCUMENT-INVENTORY.md), [`MERIDIQ-DOCUMENT-COVERAGE-REPORT.md`](./MERIDIQ-DOCUMENT-COVERAGE-REPORT.md).*

> **Syfte:** Definiera **vilken källa som äger sanningen** för varje dokument-/dataområde i Hair TP Clinic + Curatiio så att vi kan svara entydigt på "vart hör det här hemma?" när vi bygger CCO och flyttar bort från legacy.
>
> **Sekretess:** Den här filen citerar ingen patientdata.

---

## Matrisens kolumner

| Kolumn | Betydelse |
|---|---|
| **Område** | Funktionsområde inom kundresan |
| **Primär källa** | Vart "facit" lever — den vi diffar emot vid versions-konflikt |
| **Sekundär källa** | Backup / historiska kopior / alternativa flöden |
| **Ska i GitHub?** | Får mall/struktur committas? (PII = ❌ alltid) |
| **Ska i CCO?** | Ska den lagras/serveras av CCO-applikationen? |
| **Kommentar** | Edge cases och beslutsregler |

---

## Huvudmatris (8 områden)

| # | Område | Primär källa | Sekundär källa | Ska i GitHub? | Ska i CCO? | Kommentar |
|---:|---|---|---|---|---|---|
| 1 | **Kundresa** (steg, status, övergångar) | **Meridiq** | Pipedrive (lead-flöde) / Cliento (bokning) | ✅ Ja (workflow-schema) | ✅ Ja | Meridiq är facit. Pipedrive-stegen mappas in i `kundresa`-schema. |
| 2 | **Journalmallar** (tomma) | **Meridiq** | Drive (historiska mallar) / Arkana (CCO-derivat) | ✅ Ja (mallstruktur/version) | ✅ Ja | Bara mallar — inte ifyllda journaler. |
| 3 | **Ifyllda journaler** (PII) | Meridiq + Drive | CCO arkiv (efter migrering) | ❌ **NEJ** | ✅ Ja (säker lagring) | Patientdata. CCO är ny primär efter cutover. |
| 4 | **Samtyckesmallar** (tomma) | **Meridiq** + Nordbro + Insatt | GetAccept (mall-arkiv) | ✅ Ja (mall/version) | ✅ Ja | Legal review krävs när Nordbro/Insatt levererar ny version. |
| 5 | **Signerade samtycken** (PII) | Meridiq + GetAccept + Drive | CCO arkiv (efter migrering) | ❌ **NEJ** | ✅ Ja (säker lagring) | Patientdata. Måste arkiveras med signatur-metadata. |
| 6 | **Eftervårdsmallar** | **Meridiq** | Arkana (CCO-derivat) / juridiskt (Insatt) | ✅ Ja (mall/version) | ✅ Ja | Skickad version per patient ska loggas i `patient.aftercareSent[].version`. |
| 7 | **Bokningspåminnelser** (SMS/email) | **Cliento** + Meridiq (trigger-regler) | CCO (ny logik) | ✅ Ja (template registry) | ✅ Ja | Triggerlogik styrs av `booking-reminder-lead-time-defaults.json`. |
| 8 | **Pipeline / kundresa före bokning** | **Pipedrive** + Meridiq | CCO (workflow-schema) | ✅ Ja (workflow) | ✅ Ja | Jämför Pipedrive-pipeline-steg mot Meridiqs `kundresa` — facit är Meridiq vid konflikt. |

---

## Område 1 — Kundresa

**Status:** ⚠️ PARTIAL — Meridiq-bindings (82 st) finns; CCO `workflow_state_machine` är inte komplett.

- **Befintliga artefakter:** `migration/meridiq/service-bindings-catalog.json` (82 bindings), `migration/meridiq/journal-schema-catalog.json` (14 scheman med stage-tilldelning), `data/cco-templates.json` (77 templates med category).
- **Gaps:** Ingen `workflow_state_machine.json` som kodifierar `Lead → Konsultation → Offert → Avtal → Bokning → Behandling → Eftervård → Uppföljning`. Pipedrive-pipeline-steg är inte mappade mot Meridiq-stages.

---

## Område 2 — Journalmallar (tomma)

**Status:** ✅ EXISTS — Meridiq-export komplett (Steg 10.1).

- **Befintliga artefakter:** `migration/meridiq/journal-schema-catalog.json` (14 schemas), `migration/meridiq/questionary-catalog.json` (16 formulär), `data/cco-templates.json` (50 meridiq-källa templates), `data/journal-text-templates.json`.
- **Gaps:** Historiska Word/PDF-mallar från Drive saknas → kan inte verifiera att Meridiq matchar vad som tidigare användes. Drift-loggning i `revisions[]` finns men ingen automatisk diff mot extern källa.

---

## Område 3 — Ifyllda journaler (PII)

**Status:** ⚠️ PARTIAL — finns i Meridiq + Drive (live), inget i repo/iCloud.

- **Befintliga artefakter:** Refereras i `docs/strategy/PROJECT-CHECKLIST.md` ("1 981 Drive-profiler", "5 152 historiska journalposter på prod"). Ingen export i repo eller `iCloud/Migration-data/`.
- **Gaps:** Bulk-export från Meridiq + Drive till säker lagring saknas. CCO arkiv-vy finns men är beroende av Drive API i runtime.

---

## Område 4 — Samtyckesmallar (tomma)

**Status:** ⚠️ PARTIAL — Meridiq-katalog komplett (39 st), Nordbro/Insatt endast versions-mapping, inga råmallar.

- **Befintliga artefakter:** `migration/meridiq/consent-catalog.json` (39 st), `config/external-template-versions.json` (3 nordbro-samtycken: `consent_photo_internal`, `consent_photo_publish`, `consent_marketing`).
- **Gaps:** 8 tomma `Behandlingsavtal`-mallar i Meridiq pekar mot externa PDFs som inte finns i repo eller iCloud. Råa Nordbro-PDFs saknas → kan inte verifiera att texten i Meridiq matchar Nordbros senaste version.

---

## Område 5 — Signerade samtycken (PII)

**Status:** ❌ MISSING — inget i repo, inget i iCloud, GetAccept-export saknas.

- **Befintliga artefakter:** Inga.
- **Gaps:** GetAccept-bulk-export är inte gjord. Drive innehåller troligen historiska signaturer men ingen inventering finns. CCO behöver `consent.signedAt`, `consent.signatureHash`, `consent.documentPath` per patient — inget är ifyllt.

---

## Område 6 — Eftervårdsmallar

**Status:** ⚠️ PARTIAL — Meridiq täcker, versionslogg saknas per patient.

- **Befintliga artefakter:** `migration/meridiq/consent-catalog.json` innehåller eftervårdsavtal (Behandlingsavtal-serien 170917+). `config/external-template-versions.json` har `aftercare_*` (nordbro).
- **Gaps:** Per-patient-logg `patient.aftercareSent[].version` är inte ifylld från historiska utskick. SMS/email-mall för eftervård är inte separerad från behandlingsavtal.

---

## Område 7 — Bokningspåminnelser

**Status:** ⚠️ PARTIAL — Cliento triggers finns, CCO template-registry är tunt.

- **Befintliga artefakter:** `migration/booking-reminder-lead-time-defaults.json`, `migration/booking-policy-defaults.json`, `migration/cliento/resource-catalog.json`, `migration/cliento-service-catalog.json`. Cliento UI dokumenterat i `CLIENTO-INVENTORY.md`.
- **Gaps:** SMS/email-mallar (faktisk text) är låsta i Cliento — inte exporterade. CCO `communication_template`-registry saknar mappning mot Cliento-template-IDs.

---

## Område 8 — Pipeline / kundresa före bokning

**Status:** ⚠️ PARTIAL — Pipedrive-export finns (PII-flyttad), mapping mot Meridiq saknas.

- **Befintliga artefakter:** `migration/pipedrive/README.md`, `iCloud/Migration-data/pipedrive-2026-05-24/` (3 694 personer + 3 487 affärer), `npm run migration:import-pipedrive` script.
- **Gaps:** Pipedrive-pipeline-steg (deals stages) är inte semantiskt mappade mot Meridiq `kundresa`. Ingen diff visar var de avviker. Lead-källa per kund är inte konsoliderad.

---

## Status-summering

| Område | Status |
|---|:---:|
| 1. Kundresa | ⚠️ PARTIAL |
| 2. Journalmallar | ✅ EXISTS |
| 3. Ifyllda journaler | ⚠️ PARTIAL |
| 4. Samtyckesmallar | ⚠️ PARTIAL |
| 5. Signerade samtycken | ❌ MISSING |
| 6. Eftervårdsmallar | ⚠️ PARTIAL |
| 7. Bokningspåminnelser | ⚠️ PARTIAL |
| 8. Pipeline före bokning | ⚠️ PARTIAL |

**Räkning:** 1 ✅, 6 ⚠️, 1 ❌.

---

## Top-3 högst prioriterade gaps

### Gap 1: Signerade samtycken är osynliga (Område 5)
**Varför akut:** Vi kan inte bevisa att vi har gällande samtycke för 6 455 Meridiq-patienter + 1 221 Cliento-extra-kunder. GDPR + patientdatalagen kräver verifierbar consent-chain.
**Åtgärd:** Bulk-export från GetAccept + Drive-skanning för historiska consent-PDFs → `iCloud/Migration-data/signed-consents/`. Bygg `consent-index.json` (per patient, ingen text).
**Owner:** Wendela (GetAccept) + Fazli (Drive-scan). **Deadline:** sprint 11.

### Gap 2: Externa råmallar saknas (Område 4 + 6)
**Varför akut:** `external-template-versions.json` säger "Nordbro patient_info_fue v3.0.0" men vi har inte själva PDFen. Vid versions-konflikt har vi inget att diffa mot → compliance-flaggor blir false positives/negatives.
**Åtgärd:** Skapa `iCloud/Migration-data/nordbro/{template_id}-{version}.pdf` och `iCloud/Migration-data/insatt/{template_id}-{version}.docx` för alla 18 mall-IDs.
**Owner:** Wendela. **Deadline:** sprint 11.

### Gap 3: Kundresa är inte kodifierad (Område 1 + 8)
**Varför akut:** Pipedrive och Meridiq beskriver båda samma kundresa men ingen entydig mapping finns. Utan `workflow_state_machine.json` kan vi inte automatiskt validera att en patient är i rätt stage eller att triggers (påminnelser, eftervård) skickas i rätt tid.
**Åtgärd:** Skriv `config/workflow-state-machine.json` med stages, allowed_transitions, required_documents_per_stage. Mappar Pipedrive-pipeline-steg → Meridiq stages.
**Owner:** Fazli. **Deadline:** sprint 11.

---

*Genererad: 2026-05-29*
