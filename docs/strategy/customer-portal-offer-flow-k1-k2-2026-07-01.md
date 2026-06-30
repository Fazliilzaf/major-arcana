# Customer Portal / Offertflöde — K1 + K2

Datum: 2026-07-01

Scope: inventering + datakontrakt. Inga nya dokument, ingen ny bildlagring, ingen ny signeringslogik.

## K1 — Befintlig grund

Det här finns redan i repo och ska återanvändas:

| Område                             | Fil / yta                                                                           | Status |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| Offert från behandlingsplan        | `src/routes/ccoCommercial.js` · `POST /api/v1/cco-commercial/offer-from-plan`       | Finns  |
| Offert-store                       | `src/ops/ccoCommercialStore.js`                                                     | Finns  |
| Offertdokument                     | `src/ops/ccoOfferFromPlan.js`                                                       | Finns  |
| Kundsignering                      | `src/ops/ccoOfferEsign.js` · `GET /api/v1/cco-commercial/offer-sign-page?token=...` | Finns  |
| Kundaccept                         | `POST /api/v1/cco-commercial/offer-accept-public?token=...`                         | Finns  |
| Offertdokument HTML/PDF/DOC        | `GET /api/v1/cco-commercial/offer-document(.pdf/.doc)`                              | Finns  |
| Token-skyddade konsultationsbilder | `GET /api/v1/cco-commercial/offer-photo?token=...&photoId=...`                      | Finns  |
| Demo / visuell kundportal          | `public/customer-quote.html`                                                        | Finns  |
| V3 portal-preview                  | `public/major-arcana-preview/cco-patient-offer-portal-v3.html`                      | Finns  |

## K2 — OfferPlan datakontrakt

`commercialCase.offerPlan` är den normaliserade bryggan mellan konsultationsplan, offertdokument och kundportal.

```json
{
  "schemaVersion": "offer-plan.v1",
  "treatmentLabel": "DHI — Hårlinje, mitt, krona",
  "method": "DHI",
  "consultationDate": "2026-07-01",
  "informationDeliveredAt": "2026-07-01T10:00:00.000Z",
  "planningNote": "Planering från konsultation och ritade bilder.",
  "grafts": {
    "total": "3500",
    "zones": [
      {
        "key": "hairline",
        "label": "Hårlinje",
        "grafts": "500",
        "source": "consultation_plan"
      },
      {
        "key": "mid_scalp",
        "label": "Mitt",
        "grafts": "1000",
        "source": "consultation_plan"
      },
      {
        "key": "crown",
        "label": "Krona",
        "grafts": "2000",
        "source": "consultation_plan"
      }
    ]
  },
  "price": {
    "quotedAmount": "75 000 kr",
    "depositAmount": "15 000 kr",
    "currency": "SEK"
  },
  "attachments": [
    {
      "photoId": "photo-1",
      "label": "Front",
      "hasAnnotation": true,
      "annotatedPreviewAvailable": true
    }
  ]
}
```

## Beslut

- Ritade bilder läses från befintliga konsultationsfoto-attachments.
- Offertdokument och signeringssida får samma normaliserade zon-/pris-/planeringsdata.
- `informationDeliveredAt` sätts när offerten skickas för signering. Det är startpunkten för kundens mottagna patientinformation i offertflödet.
- Patientportalen ska senare läsa samma `offerPlan`, så UI och PDF inte driver isär.

## Nästa block

| Fas | Innehåll                                                               |
| --- | ---------------------------------------------------------------------- |
| K3  | Token-skyddad bildpanel i portalen med ritade konsultationsbilder      |
| K4  | Kundportal visar zoner, hårsäckar, pris och planering från `offerPlan` |
| K5  | Personalflöde för att granska/justera `offerPlan` innan utskick        |
| K6  | Portalstatus: betänketid, signering, nedladdning, nästa steg           |
