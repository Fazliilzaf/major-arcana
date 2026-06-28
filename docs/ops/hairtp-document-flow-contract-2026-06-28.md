# Hair TP document flow contract — owner decision 2026-06-28

Status: owner-provided operational truth, pending source verification against Nordbro, Insatt, Microsoft/SharePoint, Meridiq, GetAccept, Pipedrive and relevant legal e-mail correspondence.

This document locks the intended Hair TP Clinic document flow before further implementation. It does not change legal text, send documents, or activate any external integration.

## Owner decision

The canonical flow for Hair TP consultation, offer, consent and operation-day documents is:

1. Consultation booking
   - The consent/information for bookings within 2 days is sent when the consultation is booked.
   - This is separate from the later treatment offer/agreement package.

2. Consultation visit
   - Staff creates or updates the consultation treatment plan.
   - Staff can upload consultation photos in the large customer view.
   - Staff can draw/mark on the customer photo in the existing plan editor.
   - The marked photos are saved back to the consultation plan and must be available for the offer package.

3. After consultation
   - The offer is created after the consultation.
   - The offer must include:
     - price,
     - total graft count,
     - graft count per planned zone,
     - transplant planning based on the drawn/marked consultation photos,
     - the marked consultation images,
     - patient information/service specification needed for the customer to make an informed decision.
   - The reflection/cooling-off timing starts from the date/time the customer receives the complete information/package, not from the booking itself.

4. Offer/agreement/consent package
   - The agreement/consent package is sent together after the offer package is prepared.
   - The exact sent package must be auditable: what document version, what patient information, what images, what graft plan and what price were sent.
   - Patient-facing links must be access-controlled and auditable. Annotated consultation photos are patient data and must not be exposed through unprotected public links.

5. Operation day
   - Friskförsäkran is signed the same day as the hair transplant.
   - It should not be treated as a generic pre-consultation or offer-stage form.

## Existing repo support found

The following implementation pieces already exist and should be reused instead of rebuilt:

- Large customer view treatment-plan section: `public/major-arcana-preview/app/patient-master-ui.js`
- Consultation photo upload: `POST /api/v1/cco-journal/photo`
- Plan annotation save/read: `PUT /api/v1/cco-journal/plan-annotation`, `GET /api/v1/cco-journal/plan-annotation`
- Annotated image retrieval: `GET /api/v1/cco-journal/photo?variant=annotated`
- Offer creation from plan: `POST /api/v1/cco-commercial/offer-from-plan`
- Offer document views/downloads:
  - `GET /api/v1/cco-commercial/offer-document`
  - `GET /api/v1/cco-commercial/offer-document.pdf`
  - `GET /api/v1/cco-commercial/offer-document.doc`
- Offer signing handoff: `POST /api/v1/cco-commercial/offer-send-for-sign`
- Offer builder: `src/ops/ccoOfferFromPlan.js`
- Offer templates: `src/ops/ccoOfferTemplateStore.js`
- Consultation plan journal fields: `src/ops/ccoJournalStore.js`
- Journal photo storage including annotated previews: `src/ops/ccoJournalPhotoStore.js`

## Current implementation gap

The existing offer builder already includes:

- price,
- total grafts,
- method,
- zones as a list,
- PRP included,
- notes,
- consultation images,
- annotated image variant when available.

The owner-requested offer needs a stronger structured plan:

- `graftsTotal`
- zone-level graft rows, for example:
  - hairline: 500
  - mid-scalp: 1000
  - crown: 2000
- optional custom zones,
- explicit link between drawn shapes/marked areas and graft-zone rows,
- patient-download package that includes the exact annotated images and exact offer/plan version sent,
- `sentAt` timestamp as the start of the information/reflection period,
- immutable audit event for the sent package.

## Document source verification requirement

Before legal-facing text is changed again, every relevant document decision must be verified against source material:

- Nordbro legal documents and comments.
- Insatt material.
- Microsoft/SharePoint documents.
- Meridiq source catalogs and forms.
- GetAccept templates and signed-document archive.
- Pipedrive pipeline/customer journey material.
- Google Drive imported document/image archives.
- Legal e-mail correspondence with Gabriella at Nordbro (`gabrielle.handler@nordbro.com`) where it discusses document wording, timing, reflection period, cancellation, offer/agreement flow, or patient information.
- Legal/product e-mail correspondence with Sofia Lysen at Insatt (`sofia.lysen@insatt.com`) where it discusses friskförsäkran, agreement templates, signing flow, timing, patient information, or document source/version ownership.

No legal conclusion should be inferred from filenames alone.

## Source verification: Insatt / Sofia Lysén (completed 2026-06-28)

**Scope confirmed:** Insatt's engagement covers GDPR compliance only — not patient document flow, treatment agreements, signing, or Friskförsäkran.

**Evidence trace (no sensitive content copied):**

| Date | Subject | Key finding |
|---|---|---|
| 2025-04-30 | GDPR-frågor | Insatt requests access to process documentation |
| 2025-05-08 | GDPR-frågor | Reviews personal data processing documentation |
| 2025-05-20 | GDPR-frågor | Scope discussion — certain formulations outside the quoted engagement |
| 2025-05-21 | GDPR-frågor | Cajsa-Stella Danielsson added as co-jurist; access to shared Drive requested |
| 2025-06-04 | Möte för genomgång av registerförteckning | Data register draft ready; review meeting with Leonora and Fazli |
| 2025-06-17 | Sv: Möte för genomgång av registerförteckning | **Scope exclusion confirmed:** "vi tittar inte på t.ex. bokningsvillkor" — booking/cancellation terms explicitly out of scope; a separate quote is required if Insatt is to review those |
| 2025-06-17 | Sv: Möte... (attachment: Offert Hair TP Clinic.pdf) | Insatt's engagement offer attached; scope = data register, privacy documents only |
| 2025-06-17 | Registerförteckning (Cajsa-Stella) | GDPR process question raised: "is it necessary to collect health data at consultation, or can it be collected later?" — a register question, not a document-template question; no documented answer in the reviewed thread |
| 2025-06-24 | Sv: Registerförteckning | 75 % of estimated hours reached; reminder to review data register |
| 2025-07-02 | Sv: Registerförteckning — slutleverans | **Delivered:** GDPR information (employees), GDPR information (website), Intern integritetspolicy, IT-Policy, Logg för personuppgiftsincidenter, Nulägesanalys och åtgärdsförslag, Underbilaga 1 – Instruktion (data-processor instruction template) |
| 2025-09-01 | Sv: Registerförteckning | Clarification re. dataskyddsombud (DPO) requirement |

**What Insatt has NOT addressed:**
- Friskförsäkran (content, timing, signing)
- Treatment agreement templates
- Signing flow (GetAccept or internal)
- Patient document timing / reflection period start
- Booking and cancellation terms (explicitly excluded)
- Offer package structure

**Conclusion:** Sofia/Insatt are the GDPR compliance source, not the patient document flow source. Their deliverables (registerförteckning, integritetspolicies) may inform which systems handle which data but do not govern document wording, signing order, or timing. A separate quote is required if Insatt is to review patient-facing document templates or booking/cancellation terms.

**Owner decision 2026-06-28:** request a separate Insatt review specifically for the Hair TP health declaration flow. Scope must include:

- whether health data must be collected before/at consultation or can be collected later,
- what minimum health data is necessary at consultation booking versus before treatment,
- whether the Swedish canonical health declaration and matching English version are appropriate from a GDPR/patient-data perspective,
- how the health declaration should be stored, audited and surfaced in CCO,
- whether the health declaration timing affects the document journey or patient-information package.

This review is a GDPR/patient-data necessity review. It does not replace Nordbro/legal review of treatment agreement terms, offer wording, cancellation terms or medical consent text.

**Mailbox reviewed:** info@fazli.se / fazli@hairtpclinic.com  
**Reviewed:** 2026-06-28  
**Sensitive content:** not copied to repository

## Open decisions before implementation

1. Confirm whether the booking-stage 2-day consent and the post-consultation agreement/consent are two separate documents in live flow, or one shared document used at two different moments.
2. Confirm the current Nordbro-approved TP offer/agreement version for FUE/DHI and whether zone-level graft planning belongs in the offer, the patient information/service specification, or both.
3. Confirm whether GetAccept remains the live signing provider or whether Arcana internal signing is the primary path with GetAccept as archive/import.
4. Confirm where Gabriella/Nordbro and Sofia/Insatt e-mail evidence should be stored in the source-evidence chain without copying sensitive mailbox content into git.
5. Confirm the exact patient-facing download mechanism for annotated offer images: authenticated patient portal, expiring signed link, or provider-hosted signing package.
6. Request separate Insatt review of the Hair TP health declaration timing/content from a GDPR and patient-data minimization perspective.

## Implementation sequence

Recommended order:

1. Source audit: Nordbro/Insatt/Microsoft/Meridiq/GetAccept/Pipedrive/Drive plus Gabriella/Nordbro and Sofia/Insatt e-mail evidence.
2. Data contract: extend consultation plan fields from `zones: string[]` to structured zone rows with graft counts.
3. Offer package: include structured zone rows, annotated consultation photos and immutable sent-package audit.
4. Patient link: ensure download/access is authenticated or signed/expiring and logged.
5. Operation-day gate: ensure Friskförsäkran is surfaced for same-day transplant signing, not as a pre-offer requirement.
