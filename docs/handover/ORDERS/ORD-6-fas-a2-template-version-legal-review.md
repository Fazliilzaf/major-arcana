# ORD-6 — Fas A.2 legal_review (väg A: per mall-version)

**Notion:** [Fas A.2 legal_review](https://app.notion.com/p/374060ccc15b81a9904df02dd2a9cab2) · `ORD-6`  
**Beslut:** Väg A — godkänn **mall-version** (ej per patient). `record-legal-review` är **förbjuden**.

## Levererat

| Del        | Beskrivning                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Store      | `ccoTemplateVersionApprovalStore` — `templateApprovals[templateId@version]`                               |
| API        | `POST /api/v1/cco-treatment-agreement/template-version-approval`                                          |
| Body       | `{ templateId, version, status, approvedBy?, note? }` — `approvedBy`: `nordbro` \| `fazli` vid `approved` |
| Avtal      | `templateId` + `templateVersion` på agreement (sätts vid `from-offer`)                                    |
| `bookable` | Signerat + godkänd mall-version; **legacy** utan template-binding = fortfarande bookable                  |
| Spärrar    | `send-for-sign`, staff `accept`, `accept-public` utan mall-godkännande                                    |
| Automation | `missing_agreement_consent_bundle` + `ready_for_treatment` via `agreement.bookable`                       |
| Bokning    | `checkTreatmentBookingGate` respekterar mall-godkännande                                                  |

## Verify

```bash
npm run cco:verify-kundresa-canonical-9-step
npm run cco:verify-fas-a-readiness
node --test tests/ops/ccoTreatmentAgreementStore.test.js
node --test tests/ops/ccoTemplateVersionApprovalStore.test.js
```

## Ej i scope (A.3+)

- Bundle-signering · GetAccept/BankID · Kunder-UI-knapp · mail/SMS/AI
