# Post-op review — runbook (Fas 1)

Senast uppdaterad: 2026-05-23  
Spec: [post-op-review-photo-flow.md](../../strategy/post-op-review-photo-flow.md)

## Flöde

1. Operatör markerar **sista uppföljning klar** i CCO (booking-case).
2. API: `POST /api/v1/cco-bookings/:caseId/mark-follow-up-completed`
3. Capability `RequestPostOpReview` skapar token + emailDraft.
4. Om `patientEmail` i body + Graph konfigurerat → auto-send via M365.
5. Patient öppnar `/uppfoljning/:token` → laddar upp foton → samtycke → GBP-länk.

## Prod-verify

```bash
node --test tests/capabilities/requestPostOpReview.test.js
bash scripts/run-rollout-sweep.sh
```

## Env

| Nyckel | Syfte |
|--------|--------|
| `ARCANA_POST_OP_REVIEW_STORE_PATH` | JSON metadata |
| `ARCANA_POST_OP_PHOTOS_DIR` | Filer på disk |
| `ARCANA_POST_OP_PHOTO_RETENTION_DAYS` | Cron prune (default 365) |
| Graph send allowlist | Auto-mail |

## GDPR

- Export: `GdprExportCustomer` inkluderar `sections.postOpReviews`
- Anonymize: raderar submission-rader (foton på disk rensas via cron/manuell FS)

## Rollback

- Ingen auto-trigger Fas 2 — endast manuell knapp
- Invalidera token: radera submission i store (OWNER) eller vänta `expiresAt` (90 d)
