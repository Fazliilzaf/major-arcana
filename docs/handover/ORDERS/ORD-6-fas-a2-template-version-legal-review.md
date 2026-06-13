# ORD-6 — Fas A.2 legal_review (väg A: per mall-version)

**Notion:** [Fas A.2 legal_review](https://app.notion.com/p/374060ccc15b81a9904df02dd2a9cab2) · `ORD-6`  
**Beslut:** Väg A — godkänn **mall-version** (ej per patient). `record-legal-review` är **förbjuden**.

## GO (Fazli 2026-06-13)

- **Väg A bekräftad:** juridisk gate per `templateId@version`, inte per patient/avtal.
- **Kod:** på `main` sedan `0885cf8b` (`feat(ord-6): Fas A.2 legal_review per template-version`).
- **Verify lokalt:** `npm run cco:verify-fas-a-readiness` + `node --test tests/ops/ccoTemplateVersionApprovalStore.test.js` + `node --test tests/ops/ccoTreatmentAgreementStore.test.js` — **PASS** (2026-06-13).
- **Prod STAFF-UAT:** väntar tills `arcana.hairtpclinic.com` svarar (502 vid GO — heal deploy först).

### Staff-UAT i UI (efter deploy)

1. Kunder → öppna patient med avtal-blockerare
2. **Granska utkast** → **Kontrollera gate (skickar inte)** — ingen kundkontakt
3. Vid behov: **Skapa avtal från offert** → **Godkänn mall-version (internt)**
4. **Aktivera signering** — endast om du medvetet vill nå kunden (extra bekräftelse)

```bash
curl -sS -X POST 'https://arcana.hairtpclinic.com/api/v1/cco-treatment-agreement/template-version-approval' \
  -H 'Content-Type: application/json' \
  -H 'Cookie: …' \
  -d '{
    "templateId": "hair-tp-treatment-agreement",
    "version": "251203",
    "status": "approved",
    "approvedBy": "fazli",
    "note": "Fas A.2 GO 2026-06-13"
  }'
```

Ersätt `templateId`/`version` med den version som faktiskt bundlas vid `from-offer` (default `hair-tp-{offerType}@251203`).

**Efter godkännande:** `send-for-sign` / signering tillåten för avtal som pekar på godkänd mall-version → signerat + consent → `bookable`.

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
