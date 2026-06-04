# CCO Controlled Completion Canaries — Cycle 16

**Prod:** https://arcana.hairtpclinic.com  
**Mål:** Minska riktiga blocker-köer (Photo 860 · Import 1497 · Mail 493) med max **25 beslut per spår**.

---

## Aktivering (Render env)

```bash
ENABLE_CCO_OPERATOR_CANARY=true
ENABLE_PHOTO_REVIEW_WRITE=true
ENABLE_PHOTO_REVIEW_CANARY_ON_PROD=true   # endast om prod-write avsiktlig
ENABLE_IMPORT_REVIEW_WRITE=true
ENABLE_MAIL_REVIEW_CANARY=true
```

Efter varje deploy: `npm run cco:presentation-gate`  
Efter canary-pass: `npm run cco:operator-canary-report` · `npm run cco:daily-readiness`

---

## 1 · Photo Review (max 25)

| Krav                                                     | Implementering                                             |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| Explicit flagga                                          | `ENABLE_PHOTO_REVIEW_WRITE` + `ENABLE_CCO_OPERATOR_CANARY` |
| reviewer, reason, imageStage, bodyArea, approvedCategory | `ccoPhotoReviewWriteValidation`                            |
| Ett beslut per bild                                      | `mass_approval_blocked` om `assetIds.length > 1`           |
| storageKey/checksum/originalFileName oförändrade         | `assertImmutableUnchanged`                                 |
| 0 massapproval / 0 AI                                    | Ingen batch-endpoint                                       |
| Audit                                                    | `photo_review.decision`                                    |

**API:** `POST /api/v1/cco/photo-review/assets/:id/decide` · `GET .../canary-status`

**Stoppa vid:** checksum/storageKey-ändring · fel patient · audit fail

---

## 2 · Import Review (max 25)

| Action                                | Regel                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------- |
| approve_match                         | Endast `isStrongCustomerMatch` · ett `suggestedPatientId` · ingen `new_*` |
| reject_match                          | reason krävs                                                              |
| leave_unresolved / needs_owner_source | Kvar i kö                                                                 |

**API:** `POST /api/v1/ops/cco/import-review/decide` · `GET .../canary-status`

**Stoppa vid:** customerId mismatch · ny kund · osäker match

---

## 3 · Mail ambiguous (max 25)

| Action                                                       | Regel                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| approve_single_match                                         | Minst 3 deterministiska fält (`MIN_APPROVE_MATCH_FIELDS`) |
| exclude_non_actionable / reject_candidate / leave_unresolved | Tillåtet                                                  |

Kräver **både** `ENABLE_CCO_OPERATOR_CANARY` och `ENABLE_MAIL_REVIEW_CANARY`.

**API:** `POST /api/v1/ops/cco/enrichment/gap-recovery/ambiguous-review/decide` (owner, go=true)

---

## 4 · Ops Workbench

`/cco-ops-workbench.html` — sektion **Controlled Completion Canaries** med per-spår-resultat och `recommendedNextWork`.

Export: `/cco-operator-canary-status.json`

---

## 5 · Rapportering

`npm run cco:operator-canary-report` skriver:

- `public/cco-operator-canary-status.json`
- `data/reports/cco-operator-canary-status.json`
- `completionReport` (photo/import/mail aggregerat)

---

## Heligt flöde (orört)

personal-start → kundkort → pilotkund → journal → signera → rättelse → timeline

**Bygg inte:** full batch · autoapproval · Aisia · journalroute-ändringar · server.js-risk utan P0
