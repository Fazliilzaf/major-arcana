# U4.5 — Post-op Fas 1: låsta produktbeslut

**Status:** Låst 2026-05-25 (sweep P1 Post-op live)  
**Relaterat:** [post-op-review-photo-flow.md](./post-op-review-photo-flow.md) · [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md) Fas 3 · [post-op-review-runbook.md](../ops/runbooks/post-op-review-runbook.md)

---

## 1. Kanal — patientutskick

| Beslut | Värde |
|--------|--------|
| **Primär kanal** | E-post via **Microsoft Graph send** (`transactionalMailer` / `graphSendConnector`) |
| **Ej i scope** | SMS (ny provider), Resend för post-op (Resend reserverad för bokningsbekräftelse U5A.4) |
| **Trigger Fas 1** | Manuell — operatör trycker **Markera sista uppföljning klar** i CCO |
| **Auto-send** | Ja, när `patientEmail` skickas i trigger-body och Graph send är live |
| **Skip** | `skipGraphSend: true` i body → token + länk returneras utan mail (copy-paste / test) |

**Config:** `ARCANA_POST_OP_NOTIFICATION_CHANNEL=graph_email` (dokumentation; kodväg är Graph-only idag)

---

## 2. Avsändare

| Beslut | Värde |
|--------|--------|
| **Post-op patientmail** | `kons@hairtpclinic.com` |
| **Operatörsnotiser (bokning m.m.)** | `OPERATOR_NOTIFY_TO` → default `contact@hairtpclinic.com` |
| **Graph send mailbox** | Måste finnas i `ARCANA_GRAPH_SEND_ALLOWLIST` |

**Config-nycklar:**

| Env | Default | Syfte |
|-----|---------|--------|
| `ARCANA_POST_OP_REVIEW_FROM_MAILBOX` | `kons@hairtpclinic.com` | Avsändare post-op review-länk |
| `OPERATOR_NOTIFY_TO` | `contact@hairtpclinic.com` | Operatörsnotis vid webb-bokning |
| `CCO_DEFAULT_MAILBOX` / `ARCANA_DEFAULT_MAILBOX` | `kons@hairtpclinic.com` | CCO standardinkorg |

---

## 3. Retention — post-op foton

| Data | Retention | Rensning |
|------|-----------|----------|
| **Metadata** (`post-op-reviews.json`) | Journal-/behandlingskoppling — följer GDPR export/anonymize | Capability `GdprAnonymizeCustomer` |
| **Foton utan publiceringsconsent** | **365 dagar** efter `submittedAt` | Scheduler `pruneNoConsentPhotos` |
| **Foton med consent** | **Obegränsat** tills operatör raderar eller patient begär radering | Manuell / GDPR-radering |
| **Token (URL)** | Giltig tills submission skickad + ev. ny token vid retry | Hash lagras, klartext bara i URL |

**Config-nycklar:**

| Env | Default |
|-----|---------|
| `ARCANA_POST_OP_PHOTO_RETENTION_DAYS` | `365` |
| `ARCANA_SCHED_POST_OP_PHOTO_PRUNE_HOURS` | `24` |
| `ARCANA_POST_OP_PHOTOS_DIR` | `<stateRoot>/post-op-photos` |

---

## 4. UI — patient `/uppfoljning/[token]`

| Beslut | Värde |
|--------|--------|
| **Teknik** | Vanilla HTML/JS (`public/uppfoljning/index.html`) — ingen ny SPA |
| **States** | loading → invalid → form → success |
| **Upload** | Drag-and-drop + filväljare, max **6** foton, **5 MB**/st, JPEG/PNG/WebP/HEIC |
| **Consent** | Obligatorisk checkbox före submit; explicit formulering om hemsida/Instagram |
| **Efter submit** | Tack-skärm + GBP-CTA via `/uppfoljning/:token/omdome` (beacon + redirect) |
| **Robots** | `noindex, nofollow` |
| **Rate limit** | 30 req/min/IP på token-routes |
| **CCO-knapp** | OWNER/OPERATOR/STAFF — **ingen separat godkänn-dialog** i Fas 1; operatör verifierar mottagare i trigger |

**Prod-URL:** `https://arcana.hairtpclinic.se/uppfoljning/[token]`

---

## Verifiering

```bash
# Graph send live (kräver prod secrets + OWNER auth)
npm run verify:post-op-graph-prod
npm run verify:graph-send-prod   # alias

# Patient-UI (prod fetch smoke eller lokal Playwright)
npm run verify:post-op-uppfoljning-prod
npm run test:playwright:post-op  # lokal server + Playwright

# Full post-op API smoke
npm run verify:post-op-prod
```

**GO U4:** U4.5 beslut låsta · U4.4 Graph send `PASS` på prod · U4.6 Playwright/fetch smoke `PASS`.
