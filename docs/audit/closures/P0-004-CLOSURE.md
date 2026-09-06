# P0-004 — Staff RBAC: canonical role model, role management, REVISOR finance

**Status: VERIFIED CLOSED** · closed 2026-09-06

Provenance is marked throughout. `[VERIFIED]` = reproduced from this repository
or measured against production by the Deploy Operator. `[RELAYED]` = reported by
another party and recorded, not re-derived here.

---

## 1. Finding

The staff authorization model was not canonical. Legacy roles (`STAFF`,
`DOCTOR`, `ADMIN`) coexisted with intended roles without a single source of
truth, permissions were asserted in several places, and no role could actually
be assigned through the product. Two consequences mattered:

- an approved role model that cannot be applied is not in force, and
- `REVISOR`, contracted to own the finance workflow end to end, was locked out
  of most of it.

## 2. Human Gate decisions (Beslut A, frozen by Product Owner) `[RELAYED]`

- Canonical roles: `OWNER`, `KONSULT`, `PERSONAL`, `FINANCE`, `REVISOR`
  (+ `PATIENT` as a separate trust model).
- `OPERATOR` is a **technical legacy/transitional role** — a migration bridge
  for old `STAFF`, never a role staff pick in the UI.
- Normalization may only fix casing and documented legacy aliases. It must not
  collapse genuinely granular roles.
- `REVISOR` has full finance/CFO rights, but no automatic journal, ordination,
  booking, customer live-send or staff admin.

## 3. Canonical role model as deployed `[VERIFIED]`

`src/security/roles.js` is the single source of truth; both the auth layer
(`authStore` / `authMiddleware`) and the authorization layer (`ccoRbac`) derive
from it.

```
STAFF  → OPERATOR      (legacy alias, no privilege escalation)
DOCTOR → KONSULT
OWNER  → OWNER         (preserved)
ADMIN, SUPERUSER, ""   → '' / anonymous   (fail-closed, no guess)
```

Measured on the deployed merge:

```
node -e 'const m=require("./src/security/ccoRbac");
         ["STAFF","staff","DOCTOR","ADMIN","SUPERUSER",""]
           .forEach(r=>console.log(r,"→",m.getRoleFromRequest({auth:{role:r}})))'

STAFF → operator     staff → operator     DOCTOR → konsult
ADMIN → anonymous    SUPERUSER → anonymous    "" → anonymous
```

## 4. History

| Step                             | Artefact                                         | Verdict                                             |
| -------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| Builder (DeepSeek)               | initial P0-004 implementation                    | Kimi **FAIL** `[RELAYED]`                           |
| Remediation B-1 / B-2 / B-3      | `857b6813d5ecd0f607429cdbeab27e25622063b3`       | Kimi narrow **PASS** `[RELAYED]`                    |
| First controlled deploy          | merge `6f2080c8d5d7ccbbfd52525ace17f4c093c6b5b7` | deploy PASS, **staff acceptance FAIL** `[VERIFIED]` |
| Remediation B-4 / B-5            | `b2545a70`                                       | —                                                   |
| B-5a finding + final remediation | `514f1b0c2447cc57100a6e144c8063c2cf6b3781`       | Kimi **FINAL PASS** `[RELAYED]`                     |
| Final controlled deploy          | merge `d31c2b916052b05da018def36f013a745815a17d` | **PASS** `[VERIFIED]`                               |

### 4.1 Why the first deploy did not close P0-004 `[VERIFIED]`

The RBAC unit tests were green and the deploy was clean, but the acceptance
question — _can the approved workflow actually be performed in the product?_ —
was answered by measurement rather than by the test suite, and it came back no.

**Blocker 1 — role management UI missing.** The backend had
`POST /api/v1/users/staff` (invite) and `PATCH /api/v1/users/staff/:membershipId`
(role change), both OWNER-gated, plus the capabilities `users.invite` and
`users.role_change`. The Staff Portal referenced **zero** `/api/v1/users/*`
paths, had no role selector and no invite form; `/api/v1/staff/team` was a
GET-only colleague list. No page under `public/` called the endpoints. An OWNER
therefore could not assign a role through the product.

**Blocker 2 — REVISOR finance workflow incomplete.** B-3 widened
`cfMutateRBAC` in `src/routes/cfo.js`, but the constant existed in **two**
places; `src/routes/cfoReceiptRepair.js` still read `['owner','finance']` with
the comment _"revisor är read-only"_. The auxiliary routers were hardcoded
owner-only: bank 16/16, card 13/13, voucher 10/10. Measured against the
endpoints the finance views actually call, **20 of 36 denied REVISOR** — the
whole reconciliation flow.

Both are the same defect the codebase keeps producing: one fact stored in N
places, fixed in one of them.

## 5. Integration `[VERIFIED]`

```
PRE-MERGE MAIN   b584e59c53522536a2dff5c8512a5203f574baf9
REMEDIATION      514f1b0c2447cc57100a6e144c8063c2cf6b3781
                 (head of origin/p0-004-staff-rbac-b4-b5)
MERGE SHA        d31c2b916052b05da018def36f013a745815a17d
merge-base       6f2080c8  (= previously deployed P0-004 base, as expected)
conflicts        0
files            13  (+1149 / −568)
file overlap between remediation and main-since-base: 0
```

Method: `git worktree add --detach` from `origin/main`, `git merge --no-ff`,
then `git merge --ff-only` into the working copy after verifying the trees were
identical. No change was recreated by hand.

## 6. Pre-deploy test gate `[VERIFIED]`

Run on Node v22.23.2 — the version production runs (see §10).

```
B-4 role management UI            5/5
B-5 finance                       5/5
B-5a bank + card                  4/4
P0-004 RBAC + role assignment    26/26
auth + security (whole tree)    253/253
P0-002 booking regression       388/388
P0-003 send-safety regression  3376/3376
finance / CFO                   172/172
check:syntax                     exit 0
lint:no-bypass                   exit 0
FULL REGRESSION              8453/8453   fail 0
new failures                     0
```

Kimi's baseline was `8446/8447` with `tenantIdCanonical.test.js` as the one
known failure `[RELAYED]`. It passes here, and the reason is measured, not
assumed: the test reads data files that are gitignored. It fails in a fresh
worktree because those files are absent and passes in a working copy where they
exist. It is an environment artefact, not a regression in either direction.

## 7. Deploy `[VERIFIED]`

```
EXPECTED SHA     d31c2b916052b05da018def36f013a745815a17d
ACTUAL LIVE SHA  d31c2b916052b05da018def36f013a745815a17d   MATCH
```

Read from the canonical build identifier `X-Arcana-UI-Build` on `/admin`, which
`server.js` sets from `ARCANA_UI_BUILD_ID || RENDER_GIT_COMMIT || …`. This is a
**direct** verification. The P0-002 closure recorded that the app exposed no
build identifier and marked its live SHA indirectly verified; that was wrong,
and this record corrects it.

Health, three consecutive rounds, no 5xx:

```
/healthz 200   /readyz 200   /admin 200   /staff-portal 200
/api/v1/_diag/env 200   /api/v1/staff/me 401   /api/v1/cco-cf/dashboard 401
```

## 8. B-4 — role management production acceptance: **PASS** `[VERIFIED]`

The deployed artefact was fetched and compared, not inferred:

```
GET /staff-portal-role-management.js   200, 7774 bytes
sha256 identical to public/staff-portal-role-management.js  (diff: no output)
```

- Loaded and mounted by the deployed portal: `<script src="/staff-portal-role-management.js">`
  present, `ArcanaStaffRoleManagement.mount({…})` called, and the container
  markup (`rm-invite-form`, `rm-staff-list`, `rm-role-input`, `rm-status`)
  present in the served HTML.
- Explicit canonical role selection:
  `ASSIGNABLE_ROLES = ['KONSULT','PERSONAL','FINANCE','REVISOR','OPERATOR']`,
  with `OPERATOR` labelled _(legacy)_ and never a default.
- Every UI call resolves to a mounted backend route — checked one by one,
  because the previous blocker was precisely a UI that called nothing:

```
GET   /api/v1/users/staff                  → backend exists
POST  /api/v1/users/staff                  → backend exists
PATCH /api/v1/users/staff/:membershipId    → backend exists
GET   /api/v1/staff/me                     → backend exists
```

The auth router is mounted at `app.use('/api/v1', createAuthRouter(...))`, so
the paths the UI uses are the paths the server serves.

- Current role is loaded from the backend (`/api/v1/staff/me`), not from a demo
  switcher; success and error states are rendered via `.rm-status`, and a
  401/403 is surfaced rather than masked.

### 8.1 B-4 security `[VERIFIED]`

Measured against production. Nothing returned 2xx.

```
GET/POST/PATCH /api/v1/users/staff…                       401
?role=owner, ?role=OWNER&demo=1                           401
x-cco-role: owner|OWNER|revisor|personal|konsult|operator|patient   401 (all)
x-cco-role: "" and x-cco-role: hittepa                    401   (fail-closed,
                                                          no silent OPERATOR)
XFF 127.0.0.1 + Host localhost + Bearer __preview_local__ 403
```

Revealing the hidden DOM gains nothing: the module holds no authority. Every
action goes through `authFetch` to an OWNER-gated backend route, and
`container.hidden` is a presentation detail, not a permission.

## 9. B-5 / B-5a — REVISOR finance production acceptance: **PASS** `[VERIFIED]`

The duplicated constant is gone. `FINANCE_ROLES = ['owner','finance','revisor']`
is defined once in `src/security/ccoRbac.js` and imported by every auxiliary
finance router; `cfoReceiptRepair.js`'s local `cfMutateRBAC` now _is_
`FINANCE_ROLES` rather than a second opinion.

Same measurement as the one that produced the blocker, re-run on the deployed
merge — the finance views' `cco-cf` calls mapped to the guard that answers them:

```
                      before        after
REVISOR admitted        16            33
REVISOR denied          21             4
```

Across the whole finance surface (165 routes): **147 admit REVISOR**, 12 are
owner-only, 6 have no role gate (OAuth callbacks hit by the provider, not by
staff).

**Critical question — is any owner-only route required by the normal REVISOR
finance workflow? No.** Each named step in the approved workflow was checked
individually:

| Step                                                               | REVISOR                                      |
| ------------------------------------------------------------------ | -------------------------------------------- |
| CFO core, read/write, receipt, voucher, reconciliation, bank, card | yes                                          |
| review, correction, approve, close                                 | yes — `cfReviewerRBAC = ['owner','revisor']` |
| Fortnox, Swish                                                     | yes                                          |

The 12 remaining owner-only routes are, deliberately and by name:

- `cfOwnerOnlyRBAC = ['owner'] // reopen` — reopening a **closed** period is the
  reversal of a close, not a step in it. Closing itself is open to REVISOR.
- `DELETE /cco-cf/expenses/:id` and `POST /cco-cf/expenses/bulk-release-blocked`
  — destructive operations.
- nine Google Ads / Meta Ads OAuth routes (`auth`, `status`, `invoices`,
  `disconnect`) — advertising-integration credential management, not a finance
  workflow step.

Recorded as observations for the Project Lead, not as blockers.

## 10. Role isolation `[VERIFIED]` — 24 assertions, 0 deviations

```
REVISOR   billing.read/write JA · journal NEJ · ordination NEJ · bookings NEJ
          mail.live_send NEJ · staff.manage NEJ · settings.write NEJ
          users.invite NEJ · users.role_change NEJ
PERSONAL  bookings.write JA · conflict_override JA · schedule_write NEJ
OPERATOR  bookings.write JA · mail.read JA · conflict_override NEJ
KONSULT   ordination.approve JA · billing.write NEJ · staff.manage NEJ
OWNER     staff.manage JA · users.role_change JA · billing.write JA
```

## 11. Migration status `[VERIFIED]`

```
REQUIRED FOR FUNCTION:  NO
EXECUTED:               NO
```

Legacy roles are normalized on **every request**, in both `authMiddleware`
(`normalizeRole(req.auth.role)`) and `ccoRbac` (`getRoleFromRequest`). A
membership still stored as `STAFF` resolves to `operator` at read time, so the
stored value never has to be rewritten for the system to behave correctly.
Migration is data hygiene and was not run to make this ledger tidier.

The tool itself (`scripts/migrate-auth-roles-p0-004.js`) was exercised against a
synthetic fixture rather than production data: `STAFF→OPERATOR`,
`DOCTOR→KONSULT`, `OWNER` preserved, unknown roles skipped with a warning and no
guess, idempotent (second run: 0 changes, no second backup). Production
`auth.json` lives under `ARCANA_STATE_ROOT` on Render and was not read; the
Deploy Operator does not sign in to the hosting console.

## 12. Production safety during this deploy `[VERIFIED]`

```
REAL STAFF DATA MUTATED         NO
REAL PATIENT/CUSTOMER MUTATED   NO
REAL FINANCIAL DATA MUTATED     NO
CUSTOMER COMMUNICATION SENT     NO
ENVIRONMENT CHANGED             NO
ROLLBACK REQUIRED               NO
```

No account was created to prove the UI works; the deployed artefact was
inspected instead. Production probes discarded response bodies and read status
codes only.

### A note on the instrument

Two checks in this verification were initially wrong in a way worth recording,
because the same trap will catch the next reader.

Under `/api/v1/staff/` and `/api/v1/cco-cf/`, authentication runs **before**
routing, so a request to a path that does not exist also returns `401`. A `401`
in those namespaces therefore proves the gate, not the mount. Mounting was
confirmed instead where the server does distinguish (`/api/v1/cco-bookings/…`
returns `404` for unknown paths) and, for the rest, by fetching the deployed
artefact directly.

The first B-4 sweep reported that the portal called no role-management endpoint.
It does. The module uses an injected `apiFetch` rather than a literal `fetch(`,
and the paths are `/api/v1/users/...`, not `/api/v1/auth/users/...`. Grepping
for the wrong string is not evidence of absence.

## 13. Residual backlog — recorded, not fixed

Preserved deliberately; none of these blocks the approved P0-004 workflows.

- `scripts/migrate-auth-roles-p0-004.js` docblock is **wrong on three of five
  lines**: it states `STAFF → PERSONAL`, `OPERATOR → PERSONAL`,
  `REVISOR → FINANCE`. The code does none of these. Its "Skyddsregel" comment
  also describes a guard that is asserted rather than implemented. This is the
  text a human reads before a destructive operation on auth data.
- `authMiddleware` comment inaccuracies.
- MFA header hardening.
- audit IP / XFF handling.
- capabilities / orchestrator legacy vocabulary.
- `tenantIdCanonical.test.js` reads gitignored data files (see §6).
- pre-existing WCAG failures found while measuring adjacent surfaces:
  `.live-note` using `var(--sage)` at 3.81:1 across 60 occurrences.
- cosmetic demo switcher.
- unrelated P1.

## 14. Environment note

Production runs **Node v22.23.2**. Before this deploy the repository declared
`engines >=20.0.0 <23.0.0`, CI pinned Node 20 in 26 hardcoded lines across 19
workflows, and no suite had ever run on 22 — the version actually serving
traffic. Unified in `b584e59c`: `.nvmrc` is now the single source and CI reads
it via `node-version-file`. The full suite was run on 22.23.2 before CI moved
there. `render.yaml` still says only `runtime: node`; pinning the hosting
runtime is a deployment change and is deliberately left to its own deliberate
deploy.

## 15. Verdict

```
FINAL VERDICT   PASS
P0-004          VERIFIED CLOSED
NEW BLOCKERS    NONE
```
