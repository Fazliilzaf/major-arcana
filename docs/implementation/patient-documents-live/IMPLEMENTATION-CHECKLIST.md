# Implementationschecklista — final-demo-design + Microsoft + Meridiq + CCO live

**Uppdaterad:** 2026-06-04  
**Avprickning (36 typer):** [BOOKOFF-CHECKLIST.md](./BOOKOFF-CHECKLIST.md) — **börja här** för U/T/D/L/V per rad.  
**Designmål:** Alla dokument nedan ska kunna visas i **final-demo-layout** (se [DESIGN-SPEC.md](./DESIGN-SPEC.md)).

**Statusnycklar**

| Kod             | Betydelse                                 |
| --------------- | ----------------------------------------- |
| `DESIGN-OK`     | final-demo HTML finns (ev. förenklad)     |
| `DESIGN-SAKNAS` | Ingen final-demo — bara modal/kod/Word    |
| `MS-OK`         | Word/PDF i SharePoint, kartlagd           |
| `MS-LOKAL`      | .docx finns lokalt (iCloud/MA-Archive)    |
| `MS-SAKNAS`     | Måste laddas från SharePoint              |
| `MQ-OK`         | Meridiq-export med fält/text              |
| `CCO-OK`        | Implementerad i CCO (JS/bundle/templates) |
| `CCO-PARTIAL`   | Delvis — stub eller modal-only            |

SharePoint-rotkatalog: `1. Kunddokument - KVALITETSSÄKRA/` på `hairtpclinic1.sharepoint.com/sites/Ledning`.

---

## A. Fylls i av kund

| #   | Dokument                                         | Steg | registryId             | final-demo                                             | Microsoft SharePoint (Word/PDF)                                                      | Meridiq                          | CCO live idag                                                | **Göra**                                                                  |
| --- | ------------------------------------------------ | ---- | ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A1  | Hälsodeklaration \| Hair TP Clinic               | 3    | `haelso_tp_sve`        | **DESIGN-OK** `steg3-halsodeklaration-final-demo.html` | **MS-OK** Word lokalt 2026-06-25                                                     | **MQ-OK** (intern 16414)         | **CCO-OK** schema 14/14                                      | **D+V klart** · **L** kvar (live route)                                   |
| A2  | ENG \| Health Questionnaire                      | 3    | `health_tp_eng`        | DESIGN-SAKNAS                                          | **MS-SAKNAS**                                                                        | **MQ-OK** ENG                    | **CCO-PARTIAL**                                              | Se [BOOKOFF #2](./BOOKOFF-CHECKLIST.md)                                   |
| A3  | Friskförsäkran \| TP                             | 8    | `friskfoers_tp`        | **DESIGN-OK** `steg8-friskforsakran-final.html`        | **MS-LOKAL**                                                                         | **MQ-OK** (intern 16413)         | **CCO-OK** overlay                                           | **D+V klart** · Word-diff · **L** kvar                                    |
| A4  | Behandlingsavtal / offert \| TP                  | 5/7  | `offert_tp`            | **DESIGN-PARTIAL** steg7 Nordbro-facit                 | **MS-OK** Nordbro 251203                                                             | **MQ-OK** (intern 170917)        | **CCO-OK** bundle                                            | Offert steg **5** saknas · se BOOKOFF #4                                  |
| A5  | Behandlingsavtal / offert \| PRP hår             | 5/7  | `offert_prp_hair`      | DESIGN-SAKNAS                                          | **MS-OK** `97. Versioner från advokat/251203_Behandlingsavtal…(PRP-behandling).docx` | **MQ-OK** **170945**             | **CCO-OK** bundle + template import                          | final-demo · Word som facit                                               |
| A6  | Behandlingsavtal / offert \| PRP hud             | 5/7  | `offert_prp_skin`      | DESIGN-SAKNAS                                          | **MS-OK** samma Nordbro PRP-doc / Curatiio VIKTIG-avtal                              | **MQ-OK** **170944**             | **CCO-OK** `meridiq_consent_behandlingsavtal_prp_hud_170944` | final-demo                                                                |
| A7  | Behandlingsavtal / offert \| Microneedling + PRP | 5/7  | `offert_microneedling` | DESIGN-SAKNAS                                          | **MS-OK** Curatiio/NY Behandlingsavtal VIKTIG + MN tjänstespec                       | **MQ-OK** **170946**             | **CCO-OK** bundle                                            | final-demo                                                                |
| A8  | Behandlingsavtal / offert \| PRF hud             | 5/7  | `offert_prf`           | DESIGN-SAKNAS                                          | **MS-OK** tjänstespec PRF 2026 PDF/DOCX                                              | **MQ-OK** **170947**             | **CCO-OK** bundle                                            | final-demo                                                                |
| A9  | Behandlingsavtal / offert \| Profhilo            | 5/7  | `offert_profilo`       | DESIGN-SAKNAS                                          | **MS-OK** Profhilo tjänstespec 2026 (SharePoint PDF)                                 | **MQ-OK** **170948**             | **CCO-OK** bundle + `patient_info_profhilo` import           | final-demo                                                                |
| A10 | Samtycke vid bokning inom 2 dagar                | 6    | `samtycke_bokning_2d`  | DESIGN-SAKNAS                                          | **MS-OK** Nordbro **251203** `(DHI-metoden), 2 dagar` · Bokningsvillkor 2026         | **MQ-OK** **154369**             | **CCO-PARTIAL** bundle                                       | final-demo steg 6 · Word 2-dagars som facit                               |
| A11 | Begäran + samtycke ångerfrist (14 d)             | 6/7  | `samtycke_angerratt`   | DESIGN-SAKNAS (ingår delvis i steg7 demo)              | **MS-OK** Nordbro avtal + Konsumentverket bilaga (extern)                            | **MQ-OK** **170955**             | **CCO-OK** steg7-facit + bundle                              | final-demo · cooling-text verbatim                                        |
| A12 | PRP hår – Platelet Rich Plasma (SWE)             | 3–4  | `prp_hair_info_sve`    | DESIGN-SAKNAS                                          | **MS-OK** `Tjänstespecifikation - PRP-hårbehandling 2026.pdf`                        | **MQ-OK** consent/info i catalog | **CCO-OK** bundle FULL                                       | final-demo read-only info-kort steg 3/4                                   |
| A13 | PRP – Platelet Rich Plasma (ENG)                 | 3–4  | `prp_hair_info_eng`    | DESIGN-SAKNAS                                          | **MS-SAKNAS** ENG PDF?                                                               | **MQ-OK** Meridiq ENG            | **CCO-OK** bundle                                            | Bekräfta SharePoint ENG · final-demo                                      |
| A14 | Microneedling (SWE / ENG)                        | 3–4  | `microneedling_info`   | DESIGN-SAKNAS                                          | **MS-OK** MN+PRP tjänstespec 2026                                                    | **MQ-OK**                        | **CCO-OK** bundle                                            | final-demo SWE (+ ENG om finns)                                           |
| A15 | Hyalase (SWE)                                    | 3–4  | _(bundle: hyalase)_    | DESIGN-SAKNAS                                          | **MS-SAKNAS** (text i Meridiq/bundle)                                                | **MQ-OK** letterText i bundle    | **CCO-OK** bundle                                            | Hitta Word i SharePoint om finns · annars Meridiq-only med legal sign-off |
| A16 | Botulinumtoxin (SWE / ENG)                       | 3–4  | `botulinum_info`       | DESIGN-SAKNAS                                          | **MS-OK** `Botox® Tjänstespecifikation 2026.pdf/docx`                                | **MQ-OK** bundle SWE+ENG         | **CCO-OK** bundle                                            | final-demo · Hair TP scope only                                           |
| A17 | Samtycke foto-publicering                        | 9    | `foto_samtycke`        | DESIGN-SAKNAS                                          | **MS-SAKNAS** (Meridiq G4)                                                           | **MQ-OK** consent catalog        | **CCO-PARTIAL** overlay                                      | final-demo steg 9 · hårlinje/krona scope                                  |

---

## B. Fylls i av vårdpersonal

| #   | Dokument                              | Steg   | registryId              | final-demo    | Microsoft SharePoint                                                                                                            | Meridiq                       | CCO live idag                                                        | **Göra**                                                        |
| --- | ------------------------------------- | ------ | ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| B1  | Journal \| TP Behandling              | 8      | `journal_tp`            | DESIGN-SAKNAS | **MS-OK** `6. TP Journal – Behandling FÖRSLAG.docx` (SharePoint)                                                                | **MQ-OK** **16411** (59 fält) | **CCO-OK** `journal-tp-form.js`                                      | Staff-shell samma design · 52/59 fält parity                    |
| B2  | Journal \| TP Efterbehandling (PRP)   | 8/post | `journal_tp_post_prp`   | DESIGN-SAKNAS | **MS-SAKNAS** (Meridiq mall)                                                                                                    | **MQ-OK** **16412**           | **CCO-OK** `journal-prp-form.js`                                     | final-demo staff layout                                         |
| B3  | Journal \| TP Uppföljning 4 mån       | post-8 | `journal_tp_follow_4`   | DESIGN-SAKNAS | Meridiq-driven                                                                                                                  | **MQ-OK** **16407**           | **CCO-OK** `journal-follow-up-form.js`                               | final-demo                                                      |
| B4  | Journal \| TP Uppföljning 6 mån       | post-8 | `journal_tp_follow_6`   | DESIGN-SAKNAS | Meridiq-driven                                                                                                                  | **MQ-OK** **16409**           | **CCO-OK** follow-up form                                            | final-demo                                                      |
| B5  | Journal \| TP Resultat 12 mån         | post-8 | `journal_tp_follow_12`  | DESIGN-SAKNAS | Meridiq-driven                                                                                                                  | **MQ-OK** **16390**           | **CCO-OK** follow-up form                                            | final-demo                                                      |
| B6  | Journal \| PRP, PRF, Microneedling    | 8      | `journal_prp_multi`     | DESIGN-SAKNAS | Meridiq-driven                                                                                                                  | **MQ-OK** **14988**           | **CCO-OK** `journal-prp-form.js`                                     | final-demo                                                      |
| B7  | Behandlingsplan / offert (personal)   | 5      | `behandlingsplan_staff` | DESIGN-SAKNAS | **MS-OK** `98. Mailmallar/Offert/Behandlingsplan och offert - HÅRTRANSPLANTATION.docx`                                          | —                             | **CCO-OK** offer engine + `ccoOfferTemplateStore.js` (14 Word-hints) | final-demo preview · Word offertmallar (zip korrupt — ladda om) |
| B8  | Konsultationsmall \| Hair TP Clinic   | 4      | `konsultationsmall`     | DESIGN-SAKNAS | **MS-SAKNAS**                                                                                                                   | **MQ-OK**                     | **CCO-PARTIAL**                                                      | Hitta Word · final-demo staff                                   |
| B9  | Ordinationsmall \| Hårtransplantation | 5/8    | `ordination_tp`         | DESIGN-SAKNAS | **MS-OK** `99. Fazlis mapp/NY Ordination – Lokalbedövning vid hår-.docx` · **MS-LOKAL** Kvalitetsledningssystem/Ordination…docx | —                             | **CCO-PARTIAL** stub i bundle                                        | Kopiera Word lokalt · final-demo Op-dag                         |
| B10 | Ordination (recept)                   | 8      | _(recept)_              | DESIGN-SAKNAS | e-recept externt                                                                                                                | —                             | **CCO-PARTIAL** stub                                                 | Ej final-demo förrän e-recept kopplat                           |
| B11 | Anteckningar på patientkort           | cross  | `anteckningar_kort`     | DESIGN-SAKNAS | —                                                                                                                               | —                             | **CCO-OK** kundkort UI                                               | Enkel staff-shell — låg prio                                    |
| B12 | ID-verifiering                        | 4/8    | `id_verifiering`        | DESIGN-SAKNAS | Del av FC Word                                                                                                                  | **MQ-OK** (FC-fält)           | **CCO-OK** gates/checklista                                          | Inbäddat i FC final-demo + Op-dag                               |

---

## C. Informationsdokument (läs/skicka)

| #   | Dokument                              | Steg  | registryId                   | final-demo    | Microsoft SharePoint                                                                      | Meridiq/SMS          | CCO live                  | **Göra**                                       |
| --- | ------------------------------------- | ----- | ---------------------------- | ------------- | ----------------------------------------------------------------------------------------- | -------------------- | ------------------------- | ---------------------------------------------- |
| C1  | Offert & Behandlingsplan \| TP (auto) | 5     | `info_offert_tp`             | DESIGN-SAKNAS | **MS-OK** Mailmall offert HT                                                              | Cliento/Meridiq mall | **CCO-OK** outbound       | Read-only final-demo för preview               |
| C2  | Bokningsbekräftelse SMS/e-post        | 2     | `auto_bokningsbekraftelse`   | DESIGN-SAKNAS | **MS-OK** `98. Mailmallar/Konsultation – Bokningsbekräftelse.docx` + behandlingsvarianter | Cliento              | **CCO-PARTIAL** templates | E-post preview i samma design (utan signering) |
| C3  | Bokningspåminnelse                    | cross | `auto_bokningspaminnelse`    | DESIGN-SAKNAS | Mailmallar                                                                                | SMS catalog          | **CCO-PARTIAL**           | Template preview                               |
| C4  | Avbokningsbekräftelse                 | 2     | `auto_avbokningsbekraftelse` | DESIGN-SAKNAS | Mailmallar                                                                                | Cliento              | **CCO-PARTIAL**           | Template preview                               |
| C5  | Instruktion HD/FC till kund           | 3/8   | `auto_instruktion_formular`  | DESIGN-SAKNAS | **MS-OK** `Underbilaga 1 - Instruktion.docx` (Juridik-GDPR lokalt)                        | Meridiq SMS          | **CCO-PARTIAL**           | final-demo instruktionskort                    |
| C6  | Betänketid 14 dagar (e-post)          | 6     | `auto_betanketid`            | DESIGN-SAKNAS | Nordbro avtal + process                                                                   | Meridiq              | **CCO-PARTIAL**           | Read-only kort                                 |
| C7  | Medical Finance                       | cross | `auto_medical_finance`       | DESIGN-SAKNAS | Extern MF                                                                                 | —                    | **CCO-PARTIAL**           | Extern PDF/länk — ev. wrapper                  |
| C8  | Personuppgiftspolicy                  | cross | `auto_integritet`            | DESIGN-SAKNAS | **MS-OK** `GDPR/Information om personuppgiftsbehandling - HTPC.docx`                      | Meridiq settings     | **CCO-OK** legal repo     | Read-only final-demo                           |
| C9  | Före/efter-bildmallar                 | 8/9   | `fore_efter_bildmall`        | DESIGN-SAKNAS | Journal process                                                                           | —                    | **CCO-OK** foto-flow      | UI i Op-dag — inte separat HTML                |
| C10 | Internt SMS bokning/avbokning         | cross | `auto_internt_sms`           | DESIGN-SAKNAS | —                                                                                         | Cliento intern       | **CCO-PARTIAL**           | Staff-only — ej patient final-demo             |

---

## D. Gemensamma implementationsteg (alla dokument)

### Fas 0 — Underlag (blocker)

- [ ] **D0.1** Kör SharePoint-sync lokalt — ladda ner saknade Word till `CCO-patientdokument-live/01-word-original-lokalt/` (HD, TP-journal, offert-zip)
- [ ] **D0.2** Reparera `Offertmallar.zip` (korrupt på iCloud) — 14 docx enligt `ccoOfferTemplateStore.js`
- [x] **D0.3** Kopiera `steg7` + `steg8` final-demo till iCloud + repo
- [ ] **D0.4** Legal diff-matris: Word vs Meridiq per A1–A17 — [BOOKOFF](./BOOKOFF-CHECKLIST.md) kolumn **T**

### Fas 1 — Design shell (en gång)

- [ ] **D1.1** Extrahera CSS från steg3 → `patient-document-shell.css`
- [ ] **D1.2** `patient-document-shell.js` — header, progress, logo, registryId → steg
- [ ] **D1.3** Dev-index: lista alla 36+ docs med länk till preview

### Fas 2 — Kunddokument (A1–A17)

- [ ] **D2.1** A1 HD — full Meridiq 16414 + Word facit
- [ ] **D2.2** A3 FC — full 16413 + Word facit
- [ ] **D2.3** A4–A11 avtal/samtycke — Nordbro Word + Meridiq apiId
- [ ] **D2.4** A12–A17 info/samtycke — tjänstespec PDF/Word + bundle
- [ ] **D2.5** A2 ENG HD — när facit finns

### Fas 3 — Personaljournaler (B1–B12)

- [ ] **D3.1** Samma shell, staff-badge, koppla befintliga `journal-*-form.js`
- [ ] **D3.2** Op-dag 5 knappar → final-demo routes (FC, journal, ordination, bild, foto)

### Fas 4 — CCO live koppling

- [ ] **D4.1** Ersätt modal-only patient flow med full-page shell i kundresa
- [ ] **D4.2** Signering + audit + PDF — befintlig pipeline, ny UI
- [ ] **D4.3** Prod-verify: varje steg 3/7/8/9 @ iPhone viewport

### Fas 5 — Informationsdokument (C1–C10)

- [ ] **D5.1** Mail/SMS preview från SharePoint `98. Mailmallar/`
- [ ] **D5.2** Integritetspolicy read-only kort

---

## E. Sammanfattning siffror

| Kategori            | Antal  | final-demo idag    | Microsoft SharePoint | Meridiq/CCO innehåll                        |
| ------------------- | ------ | ------------------ | -------------------- | ------------------------------------------- |
| Kund (A)            | 17     | **3** (steg 3/7/8) | ~14 MS-OK            | ~15 CCO-OK/PARTIAL                          |
| Personal (B)        | 12     | **0**              | ~4 Word              | ~10 CCO-OK                                  |
| Info (C)            | 10     | **0**              | ~6 mail/GDPR         | ~8 CCO-PARTIAL                              |
| **Katalog (facit)** | **36** | **3**              | —                    | [BOOKOFF-CHECKLIST](./BOOKOFF-CHECKLIST.md) |

**Slutsats:** Innehåll och Microsoft-underlag finns för nästan allt. **Design-gapet** är att bara 3 HTML-demoer finns — resten måste få samma shell med **Word/Meridiq som textfacit**, inte nyskrivet.

---

## F. Referens — var Microsoft redan är implementerat i CCO

| Pipeline               | Fil                                                                    | Vad                                                       |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| SharePoint → templates | `docs/strategy/SHAREPOINT-IMPORT-REPORT-2026-05-30.md`                 | Avtal, FC, Profhilo m.fl. → `data/cco-templates.json`     |
| Inventory              | `docs/strategy/SHAREPOINT-TEMPLATE-INVENTORY.md`                       | 62 dokument via Graph MCP                                 |
| Content bundle         | `public/major-arcana-preview/data/hairtp-document-content-bundle.json` | Meridiq + SharePoint + steg7-facit sammanslaget           |
| Offerter               | `src/ops/ccoOfferTemplateStore.js`                                     | 14 offertmallar (Word-hints)                              |
| Journal UI             | `public/major-arcana-preview/app/journal-*.js`                         | Personalformulär                                          |
| Steg 7/8/9 modal       | `cco-avtal-samtycke-bundle.html`, overlays                             | **Meridiq-fulltext** — ska migreras till final-demo shell |
