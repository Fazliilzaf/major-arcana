# CCO Patient Portal — Audit + Polish-rapport — 2026-05-31

Sprint 10 · Audit av befintlig patientportal + säkerhets-/UX-fixar.

## Befintlig arkitektur (innan denna sprint)

| Komponent  | Path                                                     | Status       |
| ---------- | -------------------------------------------------------- | ------------ |
| Frontend   | `public/patient-portal.html` (427 rader)                 | ✅ Existerar |
| Routes     | `src/routes/patientPortal.js` (185 rader)                | ✅ Existerar |
| Store      | `createPatientPortalStore` (i samma fil)                 | ✅ Existerar |
| Data       | `data/cco-patient-portal.json` (auto-created)            | ✅           |
| Mount      | `app.use('/api', router)` → `/api/patient-portal/:token` | ✅           |
| Token      | `crypto.randomBytes(24).toString('base64url')` ≈ 192-bit | ✅ Säker     |
| TTL        | 7 dagar default (`expiresInDays`)                        | ✅           |
| Mobile-CSS | `@media (max-width:520px)` egen styling                  | ✅           |

## Identifierade gaps (audit-fas)

| #   | Gap                                                                        | Risk                                                  | Prio   | Status                   |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------- | ------ | ------------------------ |
| 1   | Ingen audit-logging på portal-actions (view/submit/fail)                   | Medium — saknar revisorspår                           | **P0** | ✅ Fixed                 |
| 2   | Ingen IP-logg på submit                                                    | Medium — kan inte spåra missbruk                      | **P0** | ✅ Fixed                 |
| 3   | Ingen rate-limit på `/portal/:token` (brute-force-risk)                    | Låg (192-bit token) men praxis                        | **P0** | ✅ Fixed                 |
| 4   | Ingen rate-limit på submit (DOS-risk via duplicate-submit-attempts)        | Medium                                                | **P0** | ✅ Fixed                 |
| 5   | Signatur ej validerad server-side (kan submittas tom)                      | Hög — legal-krav                                      | **P0** | ✅ Fixed                 |
| 6   | `findInvite` returnerar ALLT invite-data inkl `signature`/`formData` (PII) | Hög — endpoint kan läcka PII vid "completedAt" return | **P0** | ✅ Fixed                 |
| 7   | Inget submitIp/submitUserAgent persisterat                                 | Medium                                                | **P1** | ✅ Fixed                 |
| 8   | Ingen `journalEntriesCreated`-räknare i submit-respons                     | Låg                                                   | **P2** | ✅ Fixed                 |
| 9   | X-Frame-Options inte explicit (klick-jacking)                              | Låg — serveras från egen domän                        | **P3** | ⏸ Skip                   |
| 10  | CSP-header saknas                                                          | Låg                                                   | **P3** | ⏸ Skip                   |
| 11  | `formData` server-validering mot form-spec                                 | Medium — kan tilldelas okända fält                    | **P2** | ⏸ Skip (Sprint 11)       |
| 12  | Ingen "ny token-request"-flöde när expired                                 | UX                                                    | **P3** | ⏸ Skip (manuell process) |

## Implementation

### `src/routes/patientPortal.js`

**Audit-logging:**

- `portal.invite.viewed` — vid lyckad token-läsning (med IP, UA, outcome)
- `portal.invite.view_failed` — vid missing_token/invite_not_found
- `portal.submitted` — vid lyckad submit (med journalEntriesCreated)
- `portal.submit_failed` — vid missing_token/expired/already_submitted/missing_signature

**PII-mask i audit:**

- Token maskas till första 8 chars + `…`
- UserAgent klippt till 80 chars
- IP-adress full (juridiskt krav för revisorlogg)

**IP-extraktion:**

- `x-forwarded-for` (med trim av första värde)
- Fallback till `req.socket.remoteAddress`

**Server-side signatur-validering:**

- Min 2 tecken — annars 400 "missing_signature"

**Respons-minimering vid completedAt:**

- Returnerar endast `patientName + serviceLabel` (tidigare hela invite-objektet)

**Persistens i submit:**

- `submitIp` + `submitUserAgent` sparas i invite + metadata

### `server.js`

**Rate-limit:**

- `/api/patient-portal/` → 60 req/min per IP (scope: portal-browse)
- `/api/patient-portal/:token/submit` → 10 submits/15 min per IP (scope: portal-submit)
- 429 + `Retry-After` header vid överskridning

**Audit-log injection:**

- `auditLog: ccoAuditLog` passas till router-factory

## Smoke-test

```
GET /api/patient-portal/BOGUSTOKEN123
→ HTTP 404
→ {"ok":false,"error":"invite_not_found","message":"Länken är ogiltig eller har utgått."}
→ audit: portal.invite.view_failed (outcome:invite_not_found)

GET /api/patient-portal/test (headers)
→ X-RateLimit-Limit: 60
→ X-RateLimit-Remaining: 58
→ X-RateLimit-Reset: 1780179689

POST /api/patient-portal/test/submit (utan signatur)
→ HTTP 404 invite_expired (test-token finns ej)
(om hade funnits: 400 missing_signature)
```

## Säkerhetspostur efter denna sprint

| Kontroll                              | Status                                       |
| ------------------------------------- | -------------------------------------------- |
| Token entropi (192 bits)              | ✅                                           |
| Token TTL (7 dagar)                   | ✅                                           |
| Token expiry-enforcement i findInvite | ✅                                           |
| Replay-skydd via completedAt          | ✅                                           |
| Rate-limit browse                     | ✅ Sprint 10                                 |
| Rate-limit submit                     | ✅ Sprint 10                                 |
| Server-side signatur-krav             | ✅ Sprint 10                                 |
| Audit-logging (view+submit+fails)     | ✅ Sprint 10                                 |
| IP + UA persisterad vid submit        | ✅ Sprint 10                                 |
| PII-mask i audit                      | ✅ Sprint 10                                 |
| PII-minimering vid completed-svar     | ✅ Sprint 10                                 |
| HTTPS-only (deploy)                   | 🟡 Lokalt HTTP, prod HTTPS via reverse proxy |
| X-Frame-Options                       | ⏸ Sprint 11                                  |
| CSP-header                            | ⏸ Sprint 11                                  |
| Form-spec server-validering           | ⏸ Sprint 11                                  |

## Mobile

Patient-portal har egen `@media (max-width:520px)` styling och länkar INTE in `cco-mobile.css` (medvetet — staff-stilar ska inte sippra in i portal-vyn). Befintliga mobile-rules:

- `body{padding:14px}`
- `.hero{padding:18px 20px;border-radius:20px}`
- `.panel{padding:18px 20px;border-radius:20px}`
- `.btn{font-size:12px;padding:12px 14px}`

Status: ✅ acceptabel för mobile-render (egen styling, single-column, touch-vänliga inputs).

## Vad återstår (Sprint 11)

- **P1:** Form-spec server-validering (mot `templateRegistry` form-schema)
- **P2:** Security headers (X-Frame-Options, CSP, Strict-Transport-Security via env)
- **P2:** Email-mall för portal-invite med {token-link} (om patient-mail aktiveras)
- **P3:** "Begär ny länk"-flöde via staff-side
- **P3:** Patient-side signatur via canvas (touch-handteckning)

## Guardrails efterlevda

- [x] Ingen ny separat app (lever i `/api/patient-portal/`)
- [x] Inga Drive-länkar
- [x] Ingen extern AI på journalinnehåll
- [x] Inga live massutskick (portal bara IN-data från patient)
- [x] Inga nya tredjepartsintegrationer
- [x] Patientdata stannar i `data/cco-patient-portal.json` + journalstore
- [x] CCO-design behållen (rose-pill, kalender-accent, calm typography)
- [x] Mobile fungerar (egen @media)
- [x] Patient ser bara sina egna data (token-bundet)
