# ORD-7 — Bundle-signering (avtal + behandlingssamtycke)

**Scope:** Utöka befintlig CCO esign-flow — **ingen** GetAccept, BankID eller extern sign-API.

## UAT-kontext (före implementation)

Från ORD-6 STAFF-UAT på prod (`arcana.hairtpclinic.com`):

- `POST /cco-treatment-agreement/template-version-approval` — PASS
- Få signerade avtal i prod-sample → logik täcks av unit tests + verify
- Bundle-UAT på prod kräver patient med `from-offer` + `send-for-sign` + publik signering

## Levererat

| Del             | Beskrivning                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Sign-sida       | `buildTreatmentAgreementSignPageHtml` — obligatorisk `consent_ack` via `resolveTemplate(treatmentType)` |
| Publik sign     | `POST accept-public` sätter avtal signerat + `consent.signed`, audit `bundle_signed_public`             |
| Store           | `bundleStatus`: `missing_consent_template` \| `ready_to_send` \| `sent` \| `signed`                     |
| `send-for-sign` | `assertBundleReadyToSend` — blockerar saknad consent-mall (plus befintlig mall-version-gate)            |
| `from-offer`    | Applicerar consent-mall från offert/behandlingstyp                                                      |
| Runtime         | `meridiqConsentCatalogRuntime.resolveTemplate()` + `service-bindings-catalog.json`                      |

## API (oförändrade paths)

- `POST /api/v1/cco-treatment-agreement/send-for-sign`
- `GET /api/v1/cco-treatment-agreement/sign-page?token=…`
- `POST /api/v1/cco-treatment-agreement/accept-public` — body: `customerSignedName`, `consent_ack` (eller `consentAck` / `consentAccepted`)

## Verify

```bash
npm run cco:verify-bundle-sign-flow
node --test tests/ops/ccoTreatmentAgreementBundle.test.js
node --test tests/ops/ccoTreatmentAgreementStore.test.js
node --test tests/ops/meridiqConsentCatalogRuntime.test.js
npm run cco:verify-fas-a-readiness
```

## Ej i scope

- GetAccept / BankID / extern sign-provider
- Kunder-UI-knappar · mail/SMS · staff `accept` sätter inte automatiskt consent (endast publik bundle)
