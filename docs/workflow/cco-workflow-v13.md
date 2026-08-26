# CCO — Workflow V13 · Hela kundresan

> **Det här dokumentet är källan.** Vid konflikt gäller det här, inte Figma, inte koden, inte de äldre workflow-dokumenten.
> **Syfte:** detaljerad, automatiserbar CCO-workflow för hela företaget. Allt är omsatt till **CCO** (fd "Meridiq") och specificerar vad **kunden får**, vad **personalen gör/journalför**, och vilket **CCO-dokument/verktyg** som binder dem — per behandling och per moment.
> **Körfält:** 🟣 Kund · 🌸 **CCO** · 🟢 Personal · 🔵 Ekonomi
> **Datum:** 2026-08-25 · källhänvisning rättad 2026-08-26

## Om Figma

Dokumentet utgick från Figma **"FlowChart | Leo"** (nod Flow 26), men har
gått förbi den. **Figma är illustration, inte facit.**

Kända avvikelser per 2026-08-26:

| Punkt            | Figma säger                   | Gäller                   |
| ---------------- | ----------------------------- | ------------------------ |
| Behandlingsvägar | ritar bara hårtransplantation | **sex vägar A–F**, se §2 |
| Curatiio         | finns inte                    | **väg F**                |

**Uppföljningen är rättad i Figma 2026-08-26.** Tre noder i flödet sa
6 mån och säger nu 8: `8 mån | Uppföljning`, `Boka 8 mån Uppföljning`,
`Journal | 8 månaderskontroll`. Efter ändringen: fyra träffar på 4 mån,
tre på 8, tre på 12, **noll på 6**. Även "Meridiq" är borta ur flödet —
noll träffar.

Att den skillnaden inte var utskriven hade redan kostat riktigt arbete:
en kartläggning av flödet mot koden följde Figma och fick både
uppföljningsmånaderna och omfattningen fel. Se
`docs/handover/TRE-KALLOR-JAMFORDA-2026-08-26.md`.

De två raderna som står kvar gäller fortfarande. Ritas väg A/B/F in i
Figma — stryk dem också.

**Föråldrade dokument i samma mapp:** `cco-end-to-end-kundresa.md` säger
4/6/12 och är inte rättad.

---

## 0. Struktur (som Figma)

| Körfält     | Ansvar                                              |
| ----------- | --------------------------------------------------- |
| 🟣 Kund     | Bokar, godkänner, genomgår behandling, följer upp   |
| 🌸 CCO      | System/data: bokning, dokument, journaler, bildbank |
| 🟢 Personal | Sjuksköterska, läkare, hårspecialist/klinikchef     |
| 🔵 Ekonomi  | Fakturering 20/80                                   |

**Livscykel (kolumner):** `INTEREST → CONSIDERATION → CONVERSION → SERVICE → LOYALTY → ADVOCACY`

---

## 1. Kundresan fas-för-fas (Kund / CCO / Personal / Ekonomi)

### FAS 1 · Upptäckt & intresse · _INTEREST_

- **Kund:** webb (hairtpclinic.com / curatiio.com), Instagram, telefon → formulär.
- **CCO:** webbformulär → potentiell kund. **Personal/ekonomi:** ej inblandad.

### FAS 2 · Bokning · _CONSIDERATION → CONVERSION_

- **Kund:** bokar konsultation (`Boka konsultation`) → **Online** eller **Fysisk** → `Slutför bokning`; godkänner personuppgiftspolicy, bokningsvillkor & GDPR.
- **CCO BOOKING-data:** Personuppgiftspolicy | Samtycke · Bokningsvillkor & GDPR | Samtycke · Personuppgifter. `Bokningsportal` → `Bokning slutförd`.
- **Mail:** `Mail | Bokningsbekräftelse` → Bokningsbekräftelse + **Hälsodeklaration | HTPC** + **Tjänstespecifikation | Länk** + AutoMail.
- **Dokument:** `steg2-auto-bokningsbekraftelse-final-demo.html`

### FAS 3 · Konsultation · _CONSIDERATION_

- **Kund:** fyller **hälsodeklaration** (fysiskt på plats, eller **online → länk före konsultationen**).
- **Personal:** hårspecialist/klinikchef (TP/PRP) eller ssk/läkare (estetik) genomför konsultation enligt **konsultationsmall** + **ID-verifiering**; stämmer av hälsodeklaration; avgör behandlingsbarhet + väljer **behandlingsväg** (A–F).
- **CCO:** `Hälsodeklaration | Reg.` → kundkort, kalender.
- **Dokument:** `steg3-halsodeklaration-final-demo.html`, `steg3-halsodeklaration-curatiio-final-demo.html`, `steg3-health-questionnaire-eng-final-demo.html`, `steg4-konsultationsmall-final-demo.html`, `steg4-id-verifiering-final-demo.html`
- **Info till kund (per väg):** `steg4-prp-hair-info-sve/eng`, `steg4-botulinum-info-sve`, `steg4-hyalase-info-sve`, `steg4-microneedling-info-sve`, `curatiio-profhilo-info`, `curatiio-prp-hud-mn-info`.

### FAS 4 · Offert & behandlingsplan · _CONVERSION_

- **Kund:** får offert (innehåll: behandlingsplan, tjänstespec, ev. ritningar), läser, accepterar → `Offert | Accepterad`.
- **Personal:** tar fram offert per väg, markerar `Offert | Accepterad`, bokar tid → `Behandlingstid | Bokad`.
- **CCO:** offertmodul. **`PåminnelseMail x4` = manuell** (ska auto ≤ V13).
- **Offert (kund):** `steg5-offert-tp`, `steg5-offert-prp-skin`, `steg5-offert-profilo`, `steg5-offert-prf`, `steg5-offert-microneedling`, `steg7-offert-prp-hair`, `steg5-info-offert-tp`
- **Personal:** `steg5-behandlingsplan-staff-final-demo.html`

### FAS 5 · Förberedelse inför behandling · _SERVICE_

- **Kund:** godkänner/skriver avtal, avstår ångerrätt 2 v., godkänner bildhantering + bokningsvillkor; **friskförsäkran** (enbart **på operationsdagen**).
- **Personal:** pre-OP — ID & friskförsäkran, vitalparametrar, bekräfta behandlingsplan, rakning/ritning/pre-OP-foto (transplantation).
- **CCO DATA:** `TP DATA` (🔒TP Behandlingsavtal | Godkänd · Avstå ångerrätt 2 v. | Godkänd · Bokningsvillkor | Godkänd · Bildhantering | Godkänd) + `Förkonsultation DATA` (Friskförsäkran | Ifylld · Behandlingsplan | Bekräftad · Ritning Pre-OP Foto | Bildbank · Rakning Pre-OP Foto | Bildbank · Post OP Foto | Bildbank).
- **Dokument:** `steg6-angerratt-samtycke`, `steg6-betanketid-samtycke`, `steg6-auto-betanketid`, `steg8-friskforsakran`, `steg8-fore-efter-bildmall`.

### FAS 6 · Behandling · _SERVICE_

Se **§2 Behandlingsvägar** (A–F). Exakt förlopp + journaltyp per väg.

### FAS 7 · Betalning & fakturering · _SERVICE_

- **Kund:** betalar förskott **20 %** → `Förskott betald`, därefter slutfaktura **80 %** → `Slutfaktura | Betald`; får **Faktura 20 % | Mail** och **Faktura 80 % | Mail**.
- **Ekonomi:** `Ekonomiansvarig` → `Faktura | 20 % av behandlingskostnaden` → `Faktura 20 % | Betald` → `Slutfaktura | 80 %` → `Slutfaktura | Betald`.
- **CCO:** ekonomi-modul (värde/skuld). Fakturering i dag via befintlig lösning.

### FAS 8 · Eftervård & uppföljning · _SERVICE → LOYALTY_

- **Kund:** eftervårdsråd, uppföljningar.
- **Personal:** bokar + genomför uppföljningar; **journal + före/efter-bilder varje besök**; AutoMail + påminnelse (24 h före behandling).
- **CCO:** `Journal | PRP Efterbehandling`, `Journal | 4/8/12 månaderskontroll`, `Före & Efter | Bildbank` per tillfälle, `Efterbehandling bokad | 3/4`, `4/4`.
- **Dokument:** `steg8-journal-prp-multi`, `steg8-journal-tp`, `steg8-journal-tp-post-prp`, `steg8-journal-tp-follow-4/8/12`.

### FAS 9 · Resultat & återkomst · _LOYALTY → ADVOCACY_

- **Kund:** nöjd, återkommer/rekommenderar.
- **Personal/marknad:** `🔒 Resultatbilder | Före & Efter` → Instagram (`Anpassat Mail | Manuellt`).
- **Dokument:** `steg9-foto-samtycke-final-demo.html`

---

## 2. Behandlingsvägar (val i FAS 3)

| #   | Väg                      | Behandlingsförlopp                                                                                    | Journaltyp                                       | Berörda journalfiler                                                                                                          |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A   | PRP hår                  | 3–4 behandlingar (~4 v mellanrum) → uppföljning ~2 mån efter sista                                    | PRP-journal (multi)                              | `steg8-journal-prp-multi-final-demo.html`                                                                                     |
| B   | PRP hud                  | 3–4 behandlingar (~4 v mellanrum) → uppföljning ~2 mån efter sista                                    | PRP-journal (multi)                              | `steg8-journal-prp-multi-final-demo.html`                                                                                     |
| C   | Hårtransplantation       | Op-dag: **PRP 1/4 på plats** → PRP 2/4, 3/4, 4/4 → uppföljning mån **4 / 8 / 12** (12 = slutresultat) | TP-journal + TP-post-PRP + TP-uppföljning 4/8/12 | `steg8-journal-tp` · `steg8-journal-tp-post-prp` · `steg8-journal-tp-follow-4/8/12`                                           |
| D   | Ögonbrynstransplantation | samma som C                                                                                           | TP-journal (+ uppföljning 4/8/12)                | samma som C                                                                                                                   |
| E   | Skäggtransplantation     | samma som C                                                                                           | TP-journal (+ uppföljning 4/8/12)                | samma som C                                                                                                                   |
| F   | Curatiio estetik         | Botox, fillers, profhilo, ögonlock, PRF, microneedling — enligt behandlingsplan                       | Estetik-journal per behandling                   | genereras via journal-bygge (`cco-journalbygge-v3`, `cco-journal-qa-v3`, `cco-journal-safety-v3`, `journal-plan-editor-demo`) |

> **⚠️ Korrigering:** **PRP har ingen extraktion.** Extraktion (uttag av hårsäckar) sker **enbart på hårtransplantationer**. PRP-behandling = **blodprov → centrifugering/PRP-beredning → injektion**.

---

## 3. Per behandlingsväg — dokument till kund, personal & journal (vid varje moment)

### A · PRP hår

| Moment               | Dokument till kund (fil)              | Personal utför/journalför (fil)             | CCO-data         |
| -------------------- | ------------------------------------- | ------------------------------------------- | ---------------- | --------------------------- | ----- |
| Konsultation         | PRP-hår-info SV/EN                    | Konsultationsmall, ID-verifiering           | Hälsodeklaration | Reg.                        |
| Offert               | Offert PRP-hår                        | Behandlingsplan (staff)                     | Offert           | Accepterad · Behandlingstid | Bokad |
| Förberedelse         | Avtal, bildhantering, bokningsvillkor | —                                           | TP DATA godkänd  |
| Behandling (1/4…4/4) | Behandlingsbekräftelse (AutoMail)     | **PRP-journal** (multi) + före/efter-bilder | Journal          | PRP Efterbehandling         |
| Uppföljning (~2 mån) | Påminnelse, eftervårdsråd             | PRP-journal, bildbank                       | Före & Efter     | Bildbank                    |

### B · PRP hud

Samma som A (PRP-journal), dock info/offert = PRP-skin: `steg5-offert-prp-skin`, `curatiio-prp-hud-mn-info`.

### C · Hårtransplantation

| Moment             | Dokument till kund (fil)                                                              | Personal utför/journalför                                                                                                                                               | CCO-data                       |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------- | -------- |
| Konsultation       | Info-offert TP                                                                        | Konsultationsmall, hårspecialist/klinikchef                                                                                                                             | Hälsodeklaration               | Reg.                                   |
| Offert             | Offert TP + tjänstespec + ritningar                                                   | Behandlingsplan (staff)                                                                                                                                                 | Offert                         | Accepterad                             |
| Förberedelse       | TP Behandlingsavtal, avstå ångerrätt 2 v., bildhantering, bokningsvillkor, betänketid | Pre-OP: ID, vitalparametrar, plan, rakning/ritning/pre-OP-foto                                                                                                          | TP DATA + Förkonsultation DATA |
| **Op-dag**         | **Friskförsäkran (endast denna dag)**                                                 | **Ordination (läkare — ej kund)** + OP: med. instruktion → lokalbedövning 1&2 → **extraktion** → kanaler → implantation → PRP 1/4 → post-OP-foto → POST-OP-medicinering | Ordination klar · Journal      | TP                                     |
| PRP 2/4–4/4        | Bokningsbekräftelse (AutoMail) + påminnelse 24 h                                      | **TP-post-PRP-journal** + bilder                                                                                                                                        | Journal                        | PRP Efterbehandling                    |
| Uppföljning 4/8/12 | Påminnelse, eftervårdsråd, foto-samtycke                                              | **TP-uppföljningsjournal 4/8/12** + före/efter-bilder                                                                                                                   | Journal                        | 4/8/12-månaderskontroll · Före & Efter | Bildbank |

### D & E · Ögonbryn- / skäggtransplantation

Exakt samma flöde, journaler och dokument som C (hårtransplantation). Enda skillnad: ingreppets område.

### F · Curatiio estetik

| Moment       | Dokument till kund (fil)                                                    | Personal utför/journalför                   | CCO-data               |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------- | ---------------------- | ---------- |
| Konsultation | Info per behandling (botulinum/hyalase/microneedling, profhilo, PRP-hud-mn) | Konsultationsmall, ssk/läkare               | Hälsodeklaration       | Reg.       |
| Offert       | Offert (profilo/prf/microneedling)                                          | Behandlingsplan (staff)                     | Offert                 | Accepterad |
| Förberedelse | Estetik-avtal, bildsamtycke, bokningsvillkor                                | —                                           | Dok godkända           |
| Behandling   | Behandlingsbekräftelse (AutoMail)                                           | **Estetik-journal** per behandling + bilder | Journal per behandling |
| Uppföljning  | Enligt plan                                                                 | Estetik-journal, bildbank                   | Före & Efter           | Bildbank   |

---

## 4. Dokument till **kunden** (sammanfattning per typ)

| Behandling         | Info                                                                                          | Offert                                     | Avtal/samtycke                                          | Op-dag                 | Uppföljning/resultat                               |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- | ---------------------- | -------------------------------------------------- |
| PRP hår            | `steg4-prp-hair-info-sve/eng`                                                                 | `steg7-offert-prp-hair`                    | `steg6-angerratt-samtycke`, bildhantering               | —                      | foto-samtycke                                      |
| PRP hud            | `curatiio-prp-hud-mn-info`                                                                    | `steg5/7-offert-prp-skin`                  | samma                                                   | —                      | foto-samtycke                                      |
| Hårtransplantation | `steg5-info-offert-tp`                                                                        | `steg5/7-offert-tp`                        | `steg6-angerratt-samtycke`, `steg6-betanketid-samtycke` | `steg8-friskforsakran` | `steg9-foto-samtycke`, `steg8-fore-efter-bildmall` |
| Ögonbryn/skägg     | `steg5-info-offert-tp`                                                                        | `steg5/7-offert-tp`                        | samma                                                   | `steg8-friskforsakran` | `steg9-foto-samtycke`                              |
| Curatiio estetik   | `steg4-botulinum/hyalase/microneedling`, `curatiio-profhilo-info`, `curatiio-prp-hud-mn-info` | `steg5/7-offert-profilo/prf/microneedling` | estetik-avtal, bildsamtycke                             | —                      | bildsamtycke                                       |

## 5. Dokument **personalen** använder & journaler (alla typer)

| Journaltyp                            | Behandling                                                        | Fil                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **PRP-journal (multi)**               | PRP hår, PRP hud                                                  | `steg8-journal-prp-multi-final-demo.html`                                                                                              |
| **TP-journal**                        | Hår/ögonbryn/skäggtransplantation                                 | `steg8-journal-tp-final-demo.html`                                                                                                     |
| **TP-post-PRP-journal**               | Transplantation (PRP 2/4–4/4)                                     | `steg8-journal-tp-post-prp-final-demo.html`                                                                                            |
| **TP-uppföljningsjournal 4/8/12**     | Transplantation uppföljning                                       | `steg8-journal-tp-follow-4-final-demo.html`, `steg8-journal-tp-follow-8-final-demo.html`, `steg8-journal-tp-follow-12-final-demo.html` |
| **Estetik-journal**                   | Curatiio (botox, fillers, profhilo, ögonlock, PRF, microneedling) | genereras (`cco-journalbygge-v3.html`, `cco-journal-qa-v3.html`, `cco-journal-safety-v3.html`, `journal-plan-editor-demo.html`)        |
| **Ordination TP**                     | Transplantation (läkare → ssk, **ej kund**)                       | `steg8-ordination-tp-final-demo.html`, `steg8-ordination-recept-final-demo.html`                                                       |
| **Före/efter-bildmall**               | Alla behandlingar                                                 | `steg8-fore-efter-bildmall-final-demo.html`                                                                                            |
| **Konsultationsmall / ID / kundkort** | Alla                                                              | `steg4-konsultationsmall-final-demo.html`, `steg4-id-verifiering-final-demo.html`, `steg7-v6-kundkort-final-demo.html`                 |

---

## 6. Regler & knytpunkt

1. **Hälsodeklaration** — med **alla** kunder. Fysiskt på plats **eller** online (länk före konsultation).
2. **Friskförsäkran** — **enbart på operationsdagen**, oavsett operation. (`steg8-friskforsakran-final.html`)
3. **Ordination** — individuell, skrivs av **läkare** till alla transplantationspatienter. **Sjuksköterskor ser den, kunden ser den inte.**
4. **Journal + bilder varje besök** — varje tillfälle kunden är här journalförs + före/efter-bilder.
5. **PRP = ingen extraktion** — extraktion endast på hårtransplantationer.
6. **Knytpunkt:** samma CCO-data bärs genom kedjan (kund lämnar → personal använder → CCO sparar). Ingen dubbel registrering.

---

## 7. Varumärkes-skillnader

| Område       | Hair TP Clinic                                      | Curatiio                                                             |
| ------------ | --------------------------------------------------- | -------------------------------------------------------------------- |
| Behandlingar | PRP-hår, hår/ögonbryn/skäggtransplantation          | Botox, fillers, profhilo, ögonlock, PRF-hud, microneedling, ortopedi |
| Avtal        | TP Behandlingsavtal, ångerrätt 2 v.                 | Estetik-avtal, bildsamtycke                                          |
| Journaler    | PRP-journal, TP-journal, uppföljningsjournal 4/8/12 | Estetik-journal                                                      |
| Konsultation | hårspecialist/klinikchef, läkare                    | ssk/läkare                                                           |
| Uppföljning  | PRP 2–4 + mån 4/8/12                                | enligt behandlingsplan                                               |

---

## 8. Automatisering — mål V13

| Del                                  | Status                                | Ska bli             |
| ------------------------------------ | ------------------------------------- | ------------------- |
| Kundresa 9 steg                      | ✅ `buildJourneyFromState` / V11-rail | behåll              |
| Bokningsmotor + AutoMail             | ✅ `ccoBookingEngineStore`            | behåll              |
| Offert / accepterad                  | ✅ kommersiell store                  | behåll              |
| Hälsodeklaration + friskförsäkran    | ✅ (kundresan steg 2/8)               | behåll              |
| Dokument (avtal, samtycken)          | ✅ ok/avstå-ångerrätt                 | behåll              |
| Journaler per besök                  | ✅ Besök · tillfällen                 | behåll              |
| Ekonomi (värde/skuld)                | ✅ V11-rail                           | behåll              |
| **AutoMail-påminnelser ×4**          | ⚠️ manuellt                           | **automatisera**    |
| **Anpassat erbjudande/resultatmail** | ⚠️ manuellt                           | **automatisera**    |
| **Instagram-publicering**            | ⚠️ manuellt                           | delvis auto         |
| **Fakturering 20/80**                | ⚠️ befintlig lösning                  | **flytta in i CCO** |

**Nästa steg:** koppla varje dokument/journal ovan till sin fas i CCO så hela kedjan körs automatiskt utan dubbel registrering.

---

## 9. Djupinnehåll i dokumenten (extraherat ur de förberedda filerna)

### Journaler — faktiska fält

**TP-journal · Op-dag (52 fält)** — `steg8-journal-tp-final-demo.html`

- Metod: **FUE / DHI / kombination**
- Status & observation före ingrepp: reaktion på **lokalbedövning 1 & 2**
- Läkemedel: **Dalacin** (ja/nej)
- **Grafts:** singel · dubbel · trippel · kvadrupel · **totalt antal**
- **Tidsregistrering:** start planering (bilder/ritning) · lokalbedövning donation · extraktion donation · lokalbedövning mottagar · kanalpreparering mottagar · implantation start/slut · lämnar rum
- **Läkemedelsanvändning (ml):** Carbokain adrenalin 20 mg/ml · Marcain 5 mg/ml · Adrenalin 1 mg/ml · Tribonat

**TP-post-PRP-journal (24 fält)** — `steg8-journal-tp-post-prp-final-demo.html`

- Kontroller: känselbortfall · klåda · svårt att sova · öm donationsområde · blödning · spänningshuvudvärk · kommit åt/slagit område · annat besvär
- Stickstatus: nålrädd · svårstucken · svaga kärl · rädd för blod · annat av betydelse
- Allmänna anteckningar (text)

**TP-uppföljningsjournal 4/8 mån (8 fält)** — `steg8-journal-tp-follow-4-final-demo.html` · `steg8-journal-tp-follow-8-final-demo.html`

- Läkning normal · lätt rodnad · ökad ärrvävnad · återväxt bra · gleshet i nacken · långsam/försenad återväxt · glest slutresultat · relevanta observationer (text)

**TP-resultat 12 mån (12 fält)** — `steg8-journal-tp-follow-12-final-demo.html`

- Fält: läkning normal · lätt rodnad · ökad ärrvävnad · återväxt bra · gleshet i nacken · långsam/försenad återväxt · glest slutresultat · relevanta observationer (text) · **slutresultat/bedömning · patient nöjd · rekommendation** · före/efter-bild

**Ordination · lokalbedövning TP** — `steg8-ordination-tp-final-demo.html`

- Besök/patient: patient · personnummer · behandlingsdag · behandlare
- Läkemedel (ml): Carbokain (mepivakain+adrenalin 20 mg/ml) · Marcain (bupivakain+adrenalin 5 mg/ml) · Adrenalin 1 mg/ml i NaCl · Tribonat (buffert)
- Ordinerande behandlare · övrig ordination/anteckning
- Källa: SharePoint "Ordination – Lokalbedövning vid hårtransplantation.docx"

**Ordination · recept** — `steg8-ordination-recept-final-demo.html`

- ⚠️ **Stub/placeholder** — avvaktar SharePoint/e-recept; ingen "Signera"-knapp (endast "Spara utkast")

### Samtycken & avtal

**Ångerrätt & betänketid** — `steg6-angerratt-samtycke-final-demo.html`, `steg6-betanketid-samtycke-final-demo.html`

- **Betänketid 2 dagar:** avtal bindande först när ≥2 dagar förflutit; gäller tills behandling fullgjord; upphör **30 dagar** efter undertecknande om ingen tid bokas
- **Ångerfrist 14 dagar** (distansavtalslagen 2005:59): samtycke att påbörja behandling innan ångerfristen löpt; ångerrätten upphör vid behandlingsstart
- **Boknings-/avbokningsvillkor:** avbokning senare än 2 kalenderdagar före behandling → administrativ avgift **500 kr**; ombokning vid sjukdom gratis mot **läkarintyg**; giltig avbokning kräver e-post till **contact@hairtpclinic.com** + skriftlig bekräftelse
- 2 kryssrutor: boknings-/avbokningsvillkor · samtycke att påbörja under ångerfristen

**Foto-samtycke** — `steg9-foto-samtycke-final-demo.html`

- **Scope: hårlinje + krona — aldrig ansikte.** Före/efter-bilder sparas i journalen; används **internt för uppföljning**, ej marknadsföring utan separat samtycke; scope sparas samma dag.

### Hälsodeklaration & friskförsäkran

**Hälsodeklaration (14 frågor)** — `steg3-halsodeklaration-final-demo.html`, `curatiio`-variant

- Personuppgifter: förnamn · efternamn · personnummer · adress · postnummer/postort · e-post · telefon
- Hälsa: tobak/nicotin · gravid/ammar · hjärt-/kärlsjukdom · högt blodtryck · annan sjukdom · blodöverförbar sjukdom · annat · läkemedel · blodförtunnande · Omega 3/fiskolja · allergi läkemedel
- Övrigt: längd (cm) · vikt (kg) · fokus (hår/hud/båda) · hur kom du i kontakt · datum
- 2 kryssrutor: uppgifter sparas enligt patientdatalagen & GDPR · godkännande av utskick på mail

**Friskförsäkran (13 frågor)** — `steg8-friskforsakran-final.html`

- **ID-handling:** Nationellt ID-kort / svenskt körkort / svenskt ID-kort + ID-nummer
- **Sjukdomstillstånd (flerval):** blödningsrubbning · hjärt-/kärlsjukdom · diabetes · lever-/njursjukdom · astma · epilepsi · hepatit · HIV · psykisk ohälsa · infektion/feber
- **Ja/Nej:** annan sjukdom · vid god hälsa · blodförtunnande (6 mån) · läkemedel · allergier (latex/desinfektion/födoämnen/läkemedel) · komplikation vid narkos/lokalbedövning · alkohol/narkotika 48 h
- **Intyg:** vid god hälsa · uppgett alla läkemedel · ingen alkohol 48 h före/efter · rökning påverkar resultat (inga garantier) · tagit del av info · fått frågor besvarade · informerat samtycke · uppgifter korrekta · godkänner friskförsäkran

### ⚠️ Glapp som behöver byggas

- ✅ **`steg4-botulinum-info-sve-final-demo.html`** — byggd (Botox/Botulinumtoxin-info, Curatiio estetik)
- ✅ **TP-resultat 12 mån-journalen** — byggd (12 fält: slutresultat, patient nöjd, rekommendation + 8 basfält)
- ⚠️ **Ordination recept** — nu en fungerande ordinationsstub (Signera); e-recept/SharePoint-koppling återstår

---

## 10. Komplett dokumentsats (underlag)

### Hair TP Clinic — alla dokument (per steg)

| Steg | Dokument                       | Fil                                                                                                                                                                               |
| ---- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | Bokningsbekräftelse            | `steg2-auto-bokningsbekraftelse-final-demo.html`                                                                                                                                  |
| 2    | Bokningspåminnelse             | `auto-bokningspaminnelse-final-demo.html`                                                                                                                                         |
| 2    | Avbokningsbekräftelse          | `auto-avbokningsbekraftelse-final-demo.html`                                                                                                                                      |
| 3    | Hälsodeklaration SV            | `steg3-halsodeklaration-final-demo.html`                                                                                                                                          |
| 3    | Hälsodeklaration EN            | `steg3-health-questionnaire-eng-final-demo.html`                                                                                                                                  |
| 3    | Auto-instruktion/formulär      | `steg3-auto-instruktion-formular-final-demo.html`                                                                                                                                 |
| 4    | PRP-hår-info SV/EN             | `steg4-prp-hair-info-sve-final-demo.html` · `steg4-prp-hair-info-eng-final-demo.html`                                                                                             |
| 4    | Konsultationsmall              | `steg4-konsultationsmall-final-demo.html`                                                                                                                                         |
| 4    | ID-verifiering                 | `steg4-id-verifiering-final-demo.html`                                                                                                                                            |
| 5    | Info-offert TP                 | `steg5-info-offert-tp-final-demo.html`                                                                                                                                            |
| 5    | Offert TP                      | `steg5-offert-tp-final-demo.html`                                                                                                                                                 |
| 5    | Offert PRP-hår                 | `steg5-offert-prp-hair-final-demo.html`                                                                                                                                           |
| 5    | Behandlingsplan (staff)        | `steg5-behandlingsplan-staff-final-demo.html`                                                                                                                                     |
| 6    | Ångerrätt & samtycke           | `steg6-angerratt-samtycke-final-demo.html`                                                                                                                                        |
| 6    | Betänketid & samtycke          | `steg6-betanketid-samtycke-final-demo.html`                                                                                                                                       |
| 7    | Offert TP (v7) / Kundkort      | `steg7-offert-tp-final-demo.html` · `steg7-v6-kundkort-final-demo.html`                                                                                                           |
| 8    | Friskförsäkran (op-dag)        | `steg8-friskforsakran-final.html`                                                                                                                                                 |
| 8    | Före/efter-bildmall            | `steg8-fore-efter-bildmall-final-demo.html`                                                                                                                                       |
| 8    | TP-journal · post-PRP · 4/8/12 | `steg8-journal-tp-final-demo.html` · `steg8-journal-tp-post-prp-final-demo.html` · `steg8-journal-tp-follow-4/-8/-12-final-demo.html` · `steg8-journal-prp-multi-final-demo.html` |
| 8    | Ordination TP / recept         | `steg8-ordination-tp-final-demo.html` · `steg8-ordination-recept-final-demo.html`                                                                                                 |
| 9    | Foto-samtycke                  | `steg9-foto-samtycke-final-demo.html`                                                                                                                                             |
| —    | Avtal & samtycke-bundle        | `cco-avtal-samtycke-bundle.html`                                                                                                                                                  |

### Curatiio — alla dokument

| Typ              | Innehåll                                                            | Fil                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Info             | Botox / hyalase / microneedling                                     | `steg4-botulinum-info-sve-final-demo.html` · `steg4-hyalase-info-sve-final-demo.html` · `steg4-microneedling-info-sve-final-demo.html`                                                                                                                                                                |
| Info             | Botox / fillers / profhilo / ögonlock / PRF / PRP-hud+MN / ortopedi | `curatiio-botox-info-final-demo.html` · `curatiio-filler-info-final-demo.html` · `curatiio-profhilo-info-final-demo.html` · `curatiio-ogonlock-info-final-demo.html` · `curatiio-prf-hud-info-final-demo.html` · `curatiio-prp-hud-mn-info-final-demo.html` · `curatiio-ortoped-info-final-demo.html` |
| Offert           | profilo / PRF / microneedling / PRP-skin                            | `steg5-offert-profilo-final-demo.html` · `steg5-offert-prf-final-demo.html` · `steg5-offert-microneedling-final-demo.html` · `steg5-offert-prp-skin-final-demo.html`                                                                                                                                  |
| Hälsodeklaration | Curatiio                                                            | `steg3-halsodeklaration-curatiio-final-demo.html`                                                                                                                                                                                                                                                     |
| Journal          | Estetik-journal (genereras)                                         | `cco-journalbygge-v3.html` · `cco-journal-qa-v3.html` · `cco-journal-safety-v3.html` · `journal-plan-editor-demo.html`                                                                                                                                                                                |

> **Källa för hela listan:** `docs/workflow/cco-dokument-inventering.md` + `cco-workflow-v13.md` (detta dokuments §1–9). Totalt 112 HTML-filer i `public/major-arcana-preview/`.

| — | GDPR / integritetspolicy | `auto-integritet-final-demo.html` |
| — | Medicinsk / finans | `auto-medical-finance-final-demo.html` |
