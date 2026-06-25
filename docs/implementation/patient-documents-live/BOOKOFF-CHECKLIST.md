# Avprickningslista — 36 dokumenttyper (patientdokument live)

**Skapad:** 2026-06-04  
**Facit:** [`KUNDKORT-DOKUMENT-PLACERING-FACIT.md`](../../strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md) · `src/ops/hairtp-document-types.catalog.json`  
**Design:** [`DESIGN-SPEC.md`](./DESIGN-SPEC.md) · `public/major-arcana-preview/patient-document-shell.css`

---

## Så här använder du listan

1. **En rad = en dokumenttyp** (`registryId`). Bocka av kolumn för kolumn — hoppa inte över **U** eller **T** bara för att CCO redan har modal/bundle.
2. **Meridiq-ID får aldrig synas** i patient-synlig HTML (endast intern facit i kod).
3. **Word/SharePoint** = ordalydelse-facit. **Meridiq** (intern) = fältstruktur. **final-demo** = helsida med Hair TP-logga + _X av 9_.
4. När **D** är klar: fil i `public/major-arcana-preview/steg*-*.html` eller `patient-doc/{registryId}.html`.

### Kolumner

| Kol   | Betydelse                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **U** | Underlag — Word/PDF lokalt (`01-word-original-lokalt/`) eller MS-OK i [SharePoint-inventory](../../strategy/SHAREPOINT-TEMPLATE-INVENTORY.md) |
| **T** | Textfacit — Word ↔ intern MQ diff godkänd (inga `VERSION_CONFLICT` utan owner)                                                                |
| **D** | **D**emo HTML — final-demo shell, korrekt steg-badge, inga förbjudna färger                                                                   |
| **L** | **L**ive CCO — full-page route, signering/audit/PDF (ej enbart modal)                                                                         |
| **V** | **V**erify — `npm run verify:*` eller Playwright @ 390px                                                                                      |

---

## Statusöversikt (2026-06-25)

| Kategori            |  Antal | U klart | T klart | D klart | L klart | V klart |
| ------------------- | -----: | ------: | ------: | ------: | ------: | ------: |
| **A · Kund**        |     15 |       1 |       1 |      15 |      15 |      15 |
| **B · Personal**    |     11 |       0 |       0 |      11 |      11 |      11 |
| **C · Auto / info** |     10 |       0 |       0 |      10 |      10 |      10 |
| **Totalt**          | **36** |   **1** |   **1** |  **36** |  **36** |  **36** |

**V-kolumn (2026-06-25):** alla 36 typer → `npm run verify:patient-doc-v-column` (shell, registry-id, färger, steg-badge, staff/sign där relevant).

**L-kolumn (2026-06-25):** alla 36 typer → `/major-arcana-preview/patient-doc/{registryId}` (offert: `?phase=5|7`). Kundkort öppnar full-page via `CcoPatientDocumentLive`. **E8 (2026-06-04):** signering/audit/PDF kopplat via `patient-document-shell.js` för A1–A11 + A15.

**Klara final-demo idag:** #1–2 HD, #3 FC, #4–9 offerter, #10–11 samtycken, #12–15 patientinfo/foto, **#16–26 staff komplett**, **#27–36 auto/info/cross komplett — D 36/36**.

---

## A · Kund fyller i (15)

|   # | registryId             | Dokument                             |   UX-steg |  U  |  T  |  D  |  L  |  V  | Anteckning                                                                                             |
| --: | ---------------------- | ------------------------------------ | --------: | :-: | :-: | :-: | :-: | :-: | ------------------------------------------------------------------------------------------------------ |
|   1 | `haelso_tp_sve`        | Hälsodeklaration · Hair TP Clinic    |         3 | [x] | [x] | [x] | [x] | [x] | `steg3-halsodeklaration-final-demo.html` · diff `diffs/HD-16414-diff-2026-06-04.md`                    |
|   2 | `health_tp_eng`        | ENG · Health Questionnaire           |         3 | [ ] | [x] | [x] | [x] | [x] | `steg3-health-questionnaire-eng-final-demo.html` · Meridiq 14865 · `diff:patient-doc-hd-eng` PARITY_OK |
|   3 | `friskfoers_tp`        | Friskförsäkran · TP                  |         8 | [ ] | [ ] | [x] | [x] | [x] | `steg8-friskforsakran-final.html` · Word lokalt MS-LOKAL                                               |
|   4 | `offert_tp`            | Offert / behandlingsavtal · TP       | 5 / **7** | [ ] | [ ] | [x] | [x] | [x] | `steg5-offert-tp-final-demo.html` + `steg7-v6-kundkort-final-demo.html`                                |
|   5 | `offert_prp_hair`      | Offert · PRP hår                     |     5 / 7 | [ ] | [ ] | [x] | [x] | [x] | `steg5-offert-prp-hair-final-demo.html` + `steg7-offert-prp-hair-final-demo.html`                      |
|   6 | `offert_prp_skin`      | Offert · PRP hud                     |     5 / 7 | [ ] | [ ] | [x] | [x] | [x] | `steg5-offert-prp-skin-final-demo.html` + `steg7-offert-prp-skin-final-demo.html`                      |
|   7 | `offert_microneedling` | Offert · Microneedling + PRP         |     5 / 7 | [ ] | [ ] | [x] | [x] | [x] | `steg5-offert-microneedling-final-demo.html` + `steg7-offert-microneedling-final-demo.html`            |
|   8 | `offert_prf`           | Offert · PRF hud                     |     5 / 7 | [ ] | [ ] | [x] | [x] | [x] | `steg5-offert-prf-final-demo.html` + `steg7-offert-prf-final-demo.html`                                |
|   9 | `offert_profilo`       | Offert · Profhilo                    |     5 / 7 | [ ] | [ ] | [x] | [x] | [x] | `steg5-offert-profilо-final-demo.html` + `steg7-offert-profilо-final-demo.html`                        |
|  10 | `samtycke_bokning_2d`  | Samtycke vid bokning inom 2 dagar    |         6 | [ ] | [ ] | [x] | [x] | [x] | `steg6-betanketid-samtycke-final-demo.html` · VERSION_CONFLICT 2 vs 14 d · 154369                      |
|  11 | `samtycke_angerratt`   | Begäran + samtycke ångerfrist (14 d) |     6 / 7 | [ ] | [ ] | [x] | [x] | [x] | `steg6-betanketid-samtycke-final-demo.html` + steg 7 · 170955                                          |
|  12 | `prp_hair_info_sve`    | PRP hår – patientinfo SWE            |       3–4 | [ ] | [ ] | [x] | [x] | [x] | `steg4-prp-hair-info-sve-final-demo.html`                                                              |
|  13 | `prp_hair_info_eng`    | PRP hår – patientinfo ENG            |       3–4 | [ ] | [ ] | [x] | [x] | [x] | `steg4-prp-hair-info-eng-final-demo.html`                                                              |
|  14 | `microneedling_info`   | Microneedling info                   |       3–4 | [ ] | [ ] | [x] | [x] | [x] | `steg4-microneedling-info-sve-final-demo.html`                                                         |
|  15 | `foto_samtycke`        | Samtycke till foto-publicering       |         9 | [ ] | [ ] | [x] | [x] | [x] | `steg9-foto-samtycke-final-demo.html` · T väntar ORD-24 (full Nordbro-text)                            |

---

## B · Personal fyller i (11)

|   # | registryId              | Dokument                             | UX-steg |  U  |  T  |  D  |  L  |  V  | Anteckning                                                                         |
| --: | ----------------------- | ------------------------------------ | ------: | :-: | :-: | :-: | :-: | :-: | ---------------------------------------------------------------------------------- |
|  16 | `journal_tp`            | Journal · TP Behandling              |       8 | [ ] | [ ] | [x] | [x] | [x] | `steg8-journal-tp-final-demo.html` · staff-shell utan nav-länkar · 52 fält         |
|  17 | `journal_tp_post_prp`   | Journal · TP Efterbehandling PRP     |  post-8 | [ ] | [ ] | [x] | [x] | [x] | `steg8-journal-tp-post-prp-final-demo.html` · 24 fält                              |
|  18 | `journal_tp_follow_4`   | Journal · TP Uppföljning 4 mån       |  post-8 | [ ] | [ ] | [x] | [x] | [x] | `steg8-journal-tp-follow-4-final-demo.html` · 8 fält                               |
|  19 | `journal_tp_follow_6`   | Journal · TP Uppföljning 6 mån       |  post-8 | [ ] | [ ] | [x] | [x] | [x] | `steg8-journal-tp-follow-6-final-demo.html` · 8 fält                               |
|  20 | `journal_tp_follow_12`  | Journal · TP Resultat 12 mån         |  post-8 | [ ] | [ ] | [x] | [x] | [x] | `steg8-journal-tp-follow-12-final-demo.html` · 1 fält (MQ-paritet PARTIAL)         |
|  21 | `journal_prp_multi`     | Journal · PRP/PRF/Microneedling      |       8 | [ ] | [ ] | [x] | [x] | [x] | `steg8-journal-prp-multi-final-demo.html` · 12 fält                                |
|  22 | `behandlingsplan_staff` | Behandlingsplan / offert (personal)  |       5 | [ ] | [ ] | [x] | [x] | [x] | `steg5-behandlingsplan-staff-final-demo.html` · dynamisk plan · MS Offert HT       |
|  23 | `konsultationsmall`     | Konsultationsmall · Hair TP          |       4 | [ ] | [ ] | [x] | [x] | [x] | `steg4-konsultationsmall-final-demo.html` · consultation-summary + staff-fält      |
|  24 | `ordination_tp`         | Ordinationsmall · Hårtransplantation |   5 + 8 | [ ] | [~] | [x] | [x] | [x] | `steg8-ordination-tp-final-demo.html` · stub + lokalbedövningsfält · T väntar Word |
|  25 | `anteckningar_kort`     | Anteckningar på patientkort          |   cross | [ ] | n/a | [x] | [x] | [x] | `staff-anteckningar-kort-final-demo.html` · fritext · badge Patientkort            |
|  26 | `id_verifiering`        | ID-verifiering                       |   4 + 8 | [ ] | [ ] | [x] | [x] | [x] | `steg4-id-verifiering-final-demo.html` · process + ID-kontroll facit               |

---

## C · Auto / informationsdokument (10)

|   # | registryId                   | Dokument                             | UX-steg |  U  |  T  |  D  |  L  |  V  | Anteckning                                                           |
| --: | ---------------------------- | ------------------------------------ | ------: | :-: | :-: | :-: | :-: | :-: | -------------------------------------------------------------------- |
|  27 | `info_offert_tp`             | Offert & behandlingsplan · TP (auto) |       5 | [ ] | [ ] | [x] | [x] | [x] | `steg5-info-offert-tp-final-demo.html` · mailmall read-only          |
|  28 | `auto_bokningsbekraftelse`   | Bokningsbekräftelse SMS/e-post       |       2 | [ ] | [ ] | [x] | [x] | [x] | `steg2-auto-bokningsbekraftelse-final-demo.html` · `98. Mailmallar/` |
|  29 | `auto_bokningspaminnelse`    | Bokningspåminnelse                   |   cross | [ ] | [ ] | [x] | [x] | [x] | `auto-bokningspaminnelse-final-demo.html` · Cliento/SMS              |
|  30 | `auto_avbokningsbekraftelse` | Avbokningsbekräftelse                |   cross | [ ] | [ ] | [x] | [x] | [x] | `auto-avbokningsbekraftelse-final-demo.html` · Mailmallar            |
|  31 | `auto_instruktion_formular`  | Instruktion HD/FC till kund          |   3 + 8 | [ ] | [ ] | [x] | [x] | [x] | `steg3-auto-instruktion-formular-final-demo.html` · Underbilaga 1    |
|  32 | `auto_betanketid`            | Betänketid enligt lag (e-post)       |       6 | [ ] | [ ] | [x] | [x] | [x] | `steg6-auto-betanketid-final-demo.html` · process + Nordbro          |
|  33 | `auto_medical_finance`       | Medical Finance                      |   cross | [ ] | n/a | [x] | [x] | [x] | `auto-medical-finance-final-demo.html` · extern MF wrapper           |
|  34 | `auto_integritet`            | Personuppgiftspolicy                 |   cross | [ ] | [ ] | [x] | [x] | [x] | `auto-integritet-final-demo.html` · legal PUB facit                  |
|  35 | `fore_efter_bildmall`        | Före/efter-bildmallar                |     8–9 | [ ] | n/a | [x] | [x] | [x] | `steg8-fore-efter-bildmall-final-demo.html` · foto-taxonomi Op-dag   |
|  36 | `auto_internt_sms`           | Internt SMS bokning/avbokning        |   cross | [ ] | n/a | [x] | [x] | [x] | `staff-auto-internt-sms-final-demo.html` · intern operatör-e-post    |

---

## D · Utökade samtycken (Meridiq catalog — **ej** i 36-katalogen)

Dessa finns i `consent-catalog.json` / bundle v7 men **saknar egen rad** i kundkort-katalogen. Lägg till i registry vid cutover eller mappa till befintlig offert-rad.

| Consent (intern titel)                      | Brand    | Koppla till     |  U  |  T  |  D  |  L  |  V  |
| ------------------------------------------- | -------- | --------------- | :-: | :-: | :-: | :-: | :-: |
| Hyalase SWE                                 | Hair TP  | info steg 3–4?  | [ ] | [ ] | [ ] | [ ] | [ ] |
| Botulinumtoxin SWE/ENG                      | Hair TP  | Curatiio-flöde  | [ ] | [ ] | [ ] | [ ] | [ ] |
| Fillers SWE                                 | Curatiio | Curatiio        | [ ] | [ ] | [ ] | [ ] | [ ] |
| Kemisk peeling / IPL / Plasma Pen           | Hair TP  | ej i 36         | [ ] | [ ] | [ ] | [ ] | [ ] |
| Ortopedisk PRP/PRF (+ HA)                   | Curatiio | Curatiio        | [ ] | [ ] | [ ] | [ ] | [ ] |
| Behandlingsavtal Botox / Fillers / Ögonlock | Curatiio | separata flöden | [ ] | [ ] | [ ] | [ ] | [ ] |

---

## E · Gemensamma milstolpar (bockas en gång)

### Underlag & shell

- [x] **E1** `patient-document-shell.css` — färger + layout (ingen mörk guld)
- [x] **E2** Build-scripts steg 3 / 7 / 8 + `npm run build:patient-doc-demos`
- [x] **E3** iCloud `CCO-patientdokument-live/` synkad (`npm run sync:patient-documents-live-folder`)
- [ ] **E4** Alla saknade Word → `01-word-original-lokalt/` (HD ✅, FC ✅, TP-journal, offert-zip)
- [ ] **E5** `patient-document-shell.js` + dev-index `/patient-doc/` (alla 36 länkar) — **shell.js klar (E8), dev-index medvetet pausad**
- [ ] **E6** Legal diff-mall per dokumenttyp (Word ↔ MQ ↔ demo)

### CCO live (efter D-kolumnen)

- [x] **E7** Ersätt modal-only patient flow med full-page shell
- [x] **E8** Signering + audit + PDF för alla **signera**-typer (A1–A11, A15) — `patientDocumentSignRegistry.js` + `patient-document-shell.js` + `npm run verify:patient-doc-sign-e8`
- [x] **E9** Staff-shell variant (badge “Personal”) för B16–B24 — `STAFF_LIVE_REGISTRY_IDS` + live headers + `npm run verify:patient-doc-staff-e9`
- [x] **E10** Prod-verify suite för alla steg 2–9 — `npm run verify:patient-doc-prod` (routes + V + E8 + E9 + ENG-1)

---

## F · Rekommenderad ordning (boka av)

1. **A10–A11** — samtycken steg 6 (2-dagar + ångerfrist) — blockerar avtal
2. **A4–A9** — offertvarianter steg 5 (visning) + steg 7 (signering)
3. **A12–A15** — patientinfo read-only steg 3–4 + foto steg 9 ✅
4. **A2** — ENG HD (steg 3) ✅ · T väntar legal review av översättning
5. **B16–B26** — staff personal-demos ✅ komplett
6. **B22–B24** — plan, konsultation, ordination ✅
7. **C27–C34** — mail/info previews ✅
8. **C35–C36** — cross referens ✅

---

## G · Snabbkommandon

```bash
npm run build:patient-doc-demos          # steg 3 + 7 + 8 + staff + auto/info
npm run build:auto-info-demos            # C27–C34 only
npm run build:staff-cross-demos          # C35–C36 only
npm run verify:patient-doc-live-routes     # L-kolumn · 36 routes + manifest
npm run verify:patient-doc-sign-e8         # E8 · sign boot + shell på A1–A11, A15
npm run verify:patient-doc-staff-e9        # E9 · staff badge Personal B16–B24
npm run verify:patient-doc-eng1            # ENG-1 · health_tp_eng Meridiq 14865 (29 frågor)
npm run verify:patient-doc-v-column        # V-kolumn · 36 extended checks
npm run verify:patient-doc-prod            # E10 · all patient-doc prod verifies
npm run diff:patient-doc-hd-eng          # T-kolumn · 14865 label parity report
npm run sync:patient-documents-live-folder
rg -i 'Meridiq|#bd7a18' public/major-arcana-preview/steg*.html  # ska vara tomt (synlig text)
```

**Källor:** [IMPLEMENTATION-CHECKLIST.md](./IMPLEMENTATION-CHECKLIST.md) (detaljer per MS/MQ/CCO) · [README.md](./README.md)
