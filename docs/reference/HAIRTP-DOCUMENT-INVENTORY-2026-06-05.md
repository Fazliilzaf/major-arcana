# Hair TP Clinic — Document Inventory + Segment Schema

**Skapad:** 2026-06-05
**Källa:** Owner (Fazli) leverans 2026-06-05
**Syfte:** Canonical katalog över alla 36 dokument i Hair TP-flödet + segment-schema som styr dossier-render, journey-state, triage och blockers.
**Status:** DRAFT — väntar owner-approval innan ORD-24 backend-implementation går till Cursor.

---

## Segment-axlar (6 — uppdaterad 2026-06-05 efter owner-svar)

Varje dokument klassificeras längs dessa sex axlar — alla axlar är filterbara i dossier + triage.

| Axel            | Värden                                                                        |
| --------------- | ----------------------------------------------------------------------------- |
| **clinic**      | `hairtp` · `curatiio` (Curatiio = systerklinik för skin/Profhilo)             |
| **filler**      | `patient` · `staff` · `system_auto`                                           |
| **category**    | `intake` · `commit` · `treatment` · `follow_up` · `info` · `internal`         |
| **journeyStep** | `1`–`9` eller `cross` (tvärgående)                                            |
| **flow**        | `tp` · `prp_hair` · `prp_skin` · `microneedling` · `prf` · `profhilo` · `all` |
| **language**    | `sv` · `en` · `sv+en`                                                         |

**Bonus-fält per dokument:**

- `requiredFor` — vilka nästa-steg som blockeras tills detta är klart
- `formProvider` — `meridiq_g4` · `manual` · `external` · `sms_template` · `email_template`
- `legallySensitive` — boolean (true → kräver e-signatur + audit-log)
- `surfaces` — array av UI-zoner där dokumentet renderas: `hero_briefing` · `journal_pdf` · `document_group` · `attachment`
- `alsoUsedAs` — sekundär roll (t.ex. `attachment` för före/efter-bildmallar som även är journal-attachment)

---

## Gruppindelning (per owner-lista 2026-06-05)

### 1. Fylls i av kund (15 dokument)

| #   | Dokument                          | filler  | category  | journeyStep | flow          | language | requiredFor      | provider   | legal |
| --- | --------------------------------- | ------- | --------- | ----------- | ------------- | -------- | ---------------- | ---------- | ----- |
| 1   | Hälsodeklaration · Hair TP Clinic | patient | intake    | 3           | tp            | sv       | konsultation (4) | meridiq_g4 | ✓     |
| 2   | ENG · Health Questionnaire        | patient | intake    | 3           | tp            | en       | konsultation (4) | meridiq_g4 | ✓     |
| 3   | Friskförsäkran · TP               | patient | treatment | 8           | tp            | sv       | behandling (8)   | meridiq_g4 | ✓     |
| 4   | Offert · TP                       | patient | commit    | 7           | tp            | sv       | avtal (7)        | meridiq_g4 | ✓     |
| 5   | Offert · PRP hår                  | patient | commit    | 7           | prp_hair      | sv       | avtal (7)        | meridiq_g4 | ✓     |
| 6   | Offert · PRP hud                  | patient | commit    | 7           | prp_skin      | sv       | avtal (7)        | meridiq_g4 | ✓     |
| 7   | Offert · Microneedling + PRP      | patient | commit    | 7           | microneedling | sv       | avtal (7)        | meridiq_g4 | ✓     |
| 8   | Offert · PRF hud                  | patient | commit    | 7           | prf           | sv       | avtal (7)        | meridiq_g4 | ✓     |
| 9   | Offert · Profhilo                 | patient | commit    | 7           | profhilo      | sv       | avtal (7)        | meridiq_g4 | ✓     |

**Owner-korrigering 2026-06-05:** dessa 6 heter "Offert" på deskan (inte "Behandlingsavtal"). De finns redan sparade i systemet.
| 10 | Samtycke vid bokning inom 2 dagar | patient | commit | 6 | all | sv | undantag betänketid | meridiq_g4 | ✓ |
| 11 | Begäran + samtycke ångerfrist (2 d) | patient | commit | 6 | all | sv | undantag ångerfrist | meridiq_g4 | ✓ |
| 12 | PRP hår · Platelet Rich Plasma (SWE) | patient | intake | 3 | prp_hair | sv | info+samtycke | meridiq_g4 | ✓ |
| 13 | PRP · Platelet Rich Plasma (ENG) | patient | intake | 3 | prp_hair | en | info+samtycke | meridiq_g4 | ✓ |
| 14 | Microneedling (SWE/ENG) | patient | intake | 3 | microneedling | sv+en | info+samtycke | meridiq_g4 | ✓ |
| 15 | Samtycke till foto-publicering | patient | treatment | 9 | all | sv | foto-publik | meridiq_g4 | ✓ |

### 2. Fylls i av vårdpersonal (11 dokument)

| #   | Dokument                                      | filler | category  | journeyStep | flow                                   | language | requiredFor    | provider   | legal |
| --- | --------------------------------------------- | ------ | --------- | ----------- | -------------------------------------- | -------- | -------------- | ---------- | ----- |
| 16  | Journal · TP Behandling                       | staff  | treatment | 8           | tp                                     | sv       | op-dag         | meridiq_g4 | ✓     |
| 17  | Journal · TP Efterbehandling (PRP)            | staff  | follow_up | post-8      | tp                                     | sv       | follow-up      | meridiq_g4 | ✓     |
| 18  | Journal · TP Uppföljning 4 mån                | staff  | follow_up | post-8      | tp                                     | sv       | 4-mån-check    | meridiq_g4 | ✓     |
| 19  | Journal · TP Uppföljning 6 mån                | staff  | follow_up | post-8      | tp                                     | sv       | 6-mån-check    | meridiq_g4 | ✓     |
| 20  | Journal · TP Resultatuppföljning 12 mån       | staff  | follow_up | post-8      | tp                                     | sv       | 12-mån-final   | meridiq_g4 | ✓     |
| 21  | Journal · PRP/PRF/Microneedling               | staff  | treatment | 8           | prp_hair, prp_skin, prf, microneedling | sv       | behandlingsdag | meridiq_g4 | ✓     |
| 22  | Behandlingsplan / offert (skapas av personal) | staff  | commit    | 5           | all                                    | sv       | accept (6/7)   | manual     | —     |
| 23  | Konsultationsmall · Hair TP Clinic            | staff  | intake    | 4           | all                                    | sv       | offert (5)     | manual     | —     |
| 24  | Ordinationsmall · Hårtransplantation          | staff  | commit    | 5           | tp                                     | sv       | pre-op         | manual     | ✓     |
| 25  | Anteckningar på patientkort                   | staff  | internal  | cross       | all                                    | sv       | —              | manual     | —     |
| 26  | ID-verifiering (pass/körkort/leg)             | staff  | intake    | 4           | all                                    | sv+en    | konsult (4)    | manual     | ✓     |

### 3. Informationsdokument (10 dokument — läses/skickas, fylls normalt inte)

| #   | Dokument                                  | filler      | category  | journeyStep | flow | language | requiredFor                    | provider                    | legal |
| --- | ----------------------------------------- | ----------- | --------- | ----------- | ---- | -------- | ------------------------------ | --------------------------- | ----- |
| 27  | Offert & Behandlingsplan · TP             | system_auto | info      | 5           | tp   | sv       | skickas efter konsult          | email_template              | —     |
| 28  | Bokningsbekräftelse (SMS/e-post)          | system_auto | info      | 2           | all  | sv+en    | auto vid bokning               | sms_template+email_template | —     |
| 29  | Bokningspåminnelse (SMS/e-post)           | system_auto | info      | cross       | all  | sv+en    | T-24h, T-2h                    | sms_template                | —     |
| 30  | Avbokningsbekräftelse (SMS/e-post)        | system_auto | info      | cross       | all  | sv+en    | vid avbokning                  | sms_template+email_template | —     |
| 31  | Instruktion: hälsodekl / friskförsäkran   | system_auto | info      | 2,3,8       | all  | sv+en    | inbäddad i bokningsbekräftelse | email_template              | —     |
| 32  | Betänketid enligt lag (2 d) (e-post)      | system_auto | info      | 6           | all  | sv       | auto vid plan-accept           | email_template              | ✓     |
| 33  | Medical Finance · betalningsinfo (e-post) | system_auto | info      | 5,7         | all  | sv       | finansiering                   | email_template              | —     |
| 34  | Personuppgiftspolicy / integritetsinfo    | system_auto | info      | cross       | all  | sv+en    | inställningar/portal           | static                      | ✓     |
| 35  | Före/efter-bildmallar (journal → bild)    | staff       | treatment | 8,post-8    | tp   | sv       | foto-protokoll                 | manual                      | ✓     |
| 36  | Internt SMS vid bokning/avbokning         | system_auto | internal  | cross       | all  | sv       | personal-notis                 | sms_template                | —     |

---

## Härledda segment (filterbara grupper i UI)

Dessa är användarsegment som dossier/triage filtrerar på — INTE samma som kundsegment (active/risk/new/dormant per ORD-22).

### A. Status-segment per journeyStep

- **Steg 2 · Bokningsbekräftelse**: dok #28, #31
- **Steg 3 · Hälsodeklaration**: dok #1, #2, #12, #13, #14
- **Steg 4 · Konsult**: dok #23, #26
- **Steg 5 · Offert/plan**: dok #22, #24, #27, #33
- **Steg 6 · Betänketid**: dok #10, #11, #32
- **Steg 7 · Avtal+samtycke**: dok #4-9
- **Steg 8 · Behandling**: dok #3, #16, #21, #35
- **Steg 9 · Foto-samtycke**: dok #15
- **Post-8 follow-up**: dok #17-20

### B. Flödes-segment (per behandlingstyp)

- **TP** (klassisk hårtransplantation): #1, #2, #3, #4, #15, #16, #17, #18, #19, #20, #24, #27, #35
- **PRP hår**: #5, #12, #13, #21
- **PRP hud**: #6, #21
- **Microneedling**: #7, #14, #21
- **PRF hud**: #8, #21
- **Profhilo**: #9
- **Alla flöden** (cross-cutting): #10, #11, #15, #22, #23, #26, #28-34, #36

### C. Aktör-segment

- **Patient fyller**: #1-15 (15 dokument)
- **Personal fyller**: #16-26 (11 dokument)
- **System auto**: #27-34, #36 (9 dokument)
- **Personal fyller men info**: #35

### D. Legal-segment (kräver e-signatur + audit)

20 dokument: #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16-21, #24, #26, #32, #34, #35

### E. Provider-segment (var ligger formuläret)

- **Meridiq G4**: 21 dokument (alla patient-formulär + alla personal-journaler)
- **Manuell** (skapas i CCO): 5 dokument (#22, #23, #24, #25, #35)
- **Email template**: 5 dokument (#27, #28, #30, #31, #32, #33)
- **SMS template**: 4 dokument (#28, #29, #30, #36)
- **Statisk**: 1 dokument (#34 PUP)

---

## Owner-svar 2026-06-05 (locked)

1. **Profhilo (#9)** — `clinic: 'curatiio'`. Profhilo tillhör systerkliniken Curatiio, inte Hair TP. Behåll `flow: 'profhilo'` men markera clinic-axeln. **Ny clinic-axel tillagd.**
2. **Journal · PRP/PRF/Microneedling (#21)** — EN delad journal-typ. Behåll som single entry med `flow: ['prp_hair','prp_skin','prf','microneedling']`.
3. **Före/efter-bildmallar (#35)** — i båda sammanhang. `surfaces: ['document_group', 'attachment']` + `alsoUsedAs: 'attachment'`. Registry-entry kvar men kan även renderas inline i journal.
4. **Internt SMS (#36)** — syns i kundens auto-dokument-grupp (`surfaces: ['document_group']`).
5. **Konsultationsmall (#23)** — separat registry-entry, men dual surface: `surfaces: ['hero_briefing', 'journal_pdf']`. Key fields extraheras till hero medicinsk briefing, hela dokumentet finns som PDF i journal-sektionen.
6. **Ångerfrist-undantag #10 + #11** — båda behövs separat. Olika juridiska scenarier, behåll som 2 entries.

### Follow-up open question (efter owner-svar)

- **PRP-skin (#6), Microneedling (#7+#14), PRF (#8)** — owner svarade att Profhilo tillhör Curatiio. Tillhör även dessa skin/cosmetic-flöden Curatiio (då Curatiio = skin-kliniken)? Eller bara Profhilo? Default i registry: `clinic: 'hairtp'` tills owner bekräftar.

---

## Nästa steg

1. Owner approve segment-schema (5 axlar) + svara på 6 open questions
2. Skapa **ORD-24** till Cursor — backend datamodell + endpoints för dokument-segment
3. Dossier-display: använda axlarna för att gruppera/filtrera i Journaler-sektionen + Dokument-sektionen
4. Triage-engine: mappa inkommande dokument → rätt journeyStep/flow automatiskt
5. Blockers-engine: använda `requiredFor` för att blockera nästa-steg-aktioner tills dok är klart

---

_Källa: Owner-leverans 2026-06-05 · väntar approval innan ORD-24 går till Cursor_
