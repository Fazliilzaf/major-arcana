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

## Open decisions before implementation

1. Confirm whether the booking-stage 2-day consent and the post-consultation agreement/consent are two separate documents in live flow, or one shared document used at two different moments.
2. Confirm the current Nordbro-approved TP offer/agreement version for FUE/DHI and whether zone-level graft planning belongs in the offer, the patient information/service specification, or both.
3. Confirm whether GetAccept remains the live signing provider or whether Arcana internal signing is the primary path with GetAccept as archive/import.
4. Confirm where Gabriella/Nordbro and Sofia/Insatt e-mail evidence should be stored in the source-evidence chain without copying sensitive mailbox content into git.
5. Confirm the exact patient-facing download mechanism for annotated offer images: authenticated patient portal, expiring signed link, or provider-hosted signing package.

## Implementation sequence

Recommended order:

1. Source audit: Nordbro/Insatt/Microsoft/Meridiq/GetAccept/Pipedrive/Drive plus Gabriella/Nordbro and Sofia/Insatt e-mail evidence.
2. Data contract: extend consultation plan fields from `zones: string[]` to structured zone rows with graft counts.
3. Offer package: include structured zone rows, annotated consultation photos and immutable sent-package audit.
4. Patient link: ensure download/access is authenticated or signed/expiring and logged.
5. Operation-day gate: ensure Friskförsäkran is surfaced for same-day transplant signing, not as a pre-offer requirement.
