# ORD-238 / P0-002 — Booking Write Authorization · CANONICAL CLOSURE RECORD

**Status:** `P0-002 — VERIFIED CLOSED`
**Closure date:** 2026-09-05
**Record type:** Change-control closure for a shipped remediation. This record
changes no product code; the product change is merge `376e12f0`.

---

## Provenance of the claims below

Same two-mark system as [ORD-224-P0-001-CLOSURE.md](ORD-224-P0-001-CLOSURE.md).

| Mark           | Meaning                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[VERIFIED]** | Reproduced by the deploy operator at the time this record was written. Anyone can re-run the stated command and get the same answer.              |
| **[RELAYED]**  | Reported by another party (Builder, Red Team, Product Owner) and recorded here as their statement. Not independently re-executed for this record. |

---

## Finding

**ID:** P0-002 / ORD-238 — Booking write authorization
**Severity:** P0
**Class:** Missing authorization (broken access control) on state-changing
booking endpoints, plus cross-tenant state leakage through an unscoped
self-exclusion key.

Three blockers were raised and are recorded separately because they have
different root causes and different evidence.

### B-1 — Legacy booking mutations did not require `bookings.write`

`src/routes/ccoBookings.js` gated its write endpoints on _being staff_, not on
holding the `bookings.write` permission — and several legacy mutation routes
were reachable by any authenticated session, including `PATIENT`. Authentication
was checked; authorization was not.

### B-2 — The same gap across status / case / event / offer-draft mutations

B-1 was not a single endpoint. The same missing check applied to status
mutation, case upsert, event mutation and offer-draft writes. This is the
recurring shape in this codebase: the rule existed in one place and the other
call sites each carried their own weaker version of it.

### B-3 — Conflict detection and override were tenant-blind and unaudited

Room and slot conflict detection excluded "self" purely by
`conversationId`. `conversationId` is not tenant-scoped, so a conversation
identifier belonging to another tenant suppressed a genuine conflict against
that tenant's state. Separately, overriding a detected conflict produced no
audit record, so a deliberate double-booking left no trace.

### NB-1 — the follow-up blocker found during remediation review

The first remediation attempt (`7750a16e`) fixed the permission gap but left the
self-exclusion key unscoped. NB-1 is the finding that `excludeConversationId`
must match **tenant AND conversation** before it may exclude anything.
`1531067f` is the commit that closes it.

### Root cause, stated once

Authorization was expressed as _role membership_ at each call site rather than
as a _permission_ asserted through one shared helper — the same duplication
failure as P0-001, in a different subsystem. Tenant isolation was likewise
assumed from an identifier that carried no tenant.

---

## Implementation

|                     |                                                           |
| ------------------- | --------------------------------------------------------- |
| Builder             | DeepSeek                                                  |
| Builder branch      | `origin/p0-002-booking-write-auth-remediation`            |
| Original builder    | `106d9035`                                                |
| First remediation   | `7750a16e`                                                |
| **Verified commit** | **`1531067f6868bf29a52f38dd4dfbd31ecf7cc938`** (NB-1 fix) |

**[VERIFIED]** Both endpoints of the chain exist in the repository:

```
git cat-file -t 106d9035                                    → commit
git cat-file -t 1531067f6868bf29a52f38dd4dfbd31ecf7cc938    → commit
```

### What the implementation establishes

- `requireBookingWrite(context)` asserts the `bookings.write` **permission**
  via `roleHasPermission`, and is applied to every in-scope write endpoint:
  `reservations`, `reservations/renew`, `confirm`, `cancel`, `rebook`, and the
  legacy `cco-bookings` mutations.
- A denial returns `403` with `metadata.requiredPermission = 'bookings.write'`
  — machine-readable, not just a message.
- Self-exclusion in `isSlotTaken` / `isRoomTaken` requires **same tenant AND
  same conversation** (`isSelfReference`). A foreign `conversationId` can no
  longer suppress a conflict.
- Overriding a conflict is explicit (`override: true`) and writes a
  `bookings.conflict_override` audit event through `appendStrict`, carrying
  actor, tenant, resource, slot and time.
- If the append-only audit log is unavailable, the override path fails closed
  with `503 audit_unavailable` rather than proceeding unlogged.

**[VERIFIED]** The invariant is enforced structurally, not by inspection.
`tests/routes/ccoBookingEngineWriteAuth.test.js` T-013 is a static audit: every
in-scope write endpoint must call `requireBookingWrite`. A new write endpoint
added later without the check fails the suite.

---

## Independent Red Team

|                 |                                             |
| --------------- | ------------------------------------------- |
| Verifier        | Kimi                                        |
| Verified commit | `1531067f6868bf29a52f38dd4dfbd31ecf7cc938`  |
| Verdict         | **FINAL PASS — CAN PROCEED TO DEPLOY: YES** |

Reported by the Red Team _[RELAYED]_: B-1, B-2 and B-3 CLOSED; no new blockers.

---

## Test evidence at the integrated commit _[VERIFIED]_

Run by the deploy operator on the merge result, with `NODE_ENV=test`
(running `tests/security/` without it produces four false failures):

| Gate                                                          | Result               |
| ------------------------------------------------------------- | -------------------- |
| `ccoBookingRemediation` + `ccoBookingNB1` (B-1/B-2/B-3, NB-1) | **23 / 23 PASS**     |
| `ccoBookingEngineWriteAuth` (original P0-002 suite)           | **9 / 9 PASS**       |
| Booking suite (39 files)                                      | **305 / 305 PASS**   |
| Security suite (`tests/security/*.test.js`)                   | **190 / 190 PASS**   |
| `npm run check:syntax`                                        | **exit 0**           |
| `npm run lint:no-bypass`                                      | **exit 0**           |
| **Full regression `npm test`**                                | **8324 / 8324 PASS** |

```
ℹ tests 8324    ℹ suites 32    ℹ pass 8324    ℹ fail 0
ℹ cancelled 0   ℹ skipped 0    ℹ todo 0
```

**[VERIFIED]** `tests/tenant/tenantIdCanonical.test.js` is in the run and is
green — it appears in no failure line of an 8324/8324 pass. It is recorded here
as **PASS**, superseding any earlier expectation that it would fail.

The suite grew from 8292 to 8324: exactly the 32 tests the three new P0-002
files contribute (9 + 6 + 17).

---

## Merge

|                |                                            |
| -------------- | ------------------------------------------ |
| Pre-merge main | `3536bbc37bcb4328cbdd070b4d7f42835e4814ae` |
| Remediation    | `1531067f6868bf29a52f38dd4dfbd31ecf7cc938` |
| Merge commit   | `376e12f0e97cb94d8a6d475f0f66744c7070b42a` |

**[VERIFIED]** The merge has exactly the two claimed parents:

```
git log --format='%h %p' -1 376e12f0
  → 376e12f0  3536bbc3 1531067f
```

**[VERIFIED]** Pre-integration check per runbook §3: zero file overlap between
the five commits `main` had advanced by (ORD-233…ORD-237, all
`public/staff-portal.html` plus four files under `tests/public/`) and the
P0-002 files. Dry merge (`git merge-tree`) exited 0 with zero conflict lines.
The actual merge produced 0 conflicts and a clean working copy.

```
git diff --stat 3536bbc3 376e12f0
  server.js                                       1 +
  src/ops/ccoBookingEngineStore.js              113 +-
  src/routes/ccoBookingEngine.js                 31 +
  src/routes/ccoBookings.js                      80 +-
  tests/routes/ccoBookingEngineWriteAuth.test.js 393 +
  tests/routes/ccoBookingNB1.test.js             321 +
  tests/routes/ccoBookingRemediation.test.js     676 +
  7 files changed, 1554 insertions(+), 61 deletions(-)
```

The merge was `--no-ff`, so the remediation history is preserved whole. The
implementation is unmodified: nothing was reconstructed by hand, no creative
conflict resolution, no redesign.

**Note on the commit type.** `merge(p0-002): …` was rejected by commitlint —
the configured types are feat/fix/docs/style/refactor/perf/test/build/ci/chore/
revert. The staged merge was re-committed as `fix(p0-002): …`. The commit
_type_ changed; the tree did not.

---

## Production deploy

|                              |                                                    |
| ---------------------------- | -------------------------------------------------- |
| Deploy operator              | Coworker                                           |
| Push                         | `3536bbc3..376e12f0  main -> main` at 20:56:06 UTC |
| Expected live SHA            | `376e12f0e97cb94d8a6d475f0f66744c7070b42a`         |
| Environment variable changes | NONE                                               |
| `TRUST_PROXY` changes        | NONE                                               |
| Patient data accessed        | NO                                                 |
| Real bookings mutated        | NONE                                               |

### Honest limitation on live-SHA verification

The running application exposes **no commit or build identifier**.
`/api/v1/_diag/env` returns six keys and none of them is a SHA; `/healthz`
returns readiness and uptime only. The deploy operator does not log in to
Render, so the dashboard SHA was not read.

The live SHA is therefore **indirectly verified**, and this record says so
rather than overstating it. The evidence _[VERIFIED]_:

```
push completed                 2026-09-05T20:56:06Z
process restart (startedAt)    2026-09-05T20:56:48Z   (+42 s)
no second restart through      2026-09-05T21:00:53Z   (uptimeSec climbing monotonically)
portal marker class="a11y-skip"  present  → real app served, not a 502 page
```

A single restart in the window following the push, with the application serving
correctly before and after, is consistent with the auto-deploy of `376e12f0`
and with nothing else observed. Anyone wanting a stronger guarantee should add
a build-SHA field to `/api/v1/_diag/env`; that is recorded as backlog below, not
claimed as done.

The portal marker was checked **first**, before any "the old value is gone"
reasoning — during the ORD-236 deploy a 502 page made every such check look
like success.

### Note on the live SHA after this date

`376e12f0` is **the SHA at the moment of the P0-002 deploy and smoke**, not a
claim about the currently deployed SHA. This closure record itself lands as a
later commit, and `main` will advance further.

The remediation is unaffected, and that is checkable rather than assumed. Any
future doubt about whether the fix is still live should be settled by comparing
the blobs, not by re-reading this paragraph:

```
git rev-parse 376e12f0:src/routes/ccoBookings.js
git rev-parse HEAD:src/routes/ccoBookings.js
git rev-parse 376e12f0:src/routes/ccoBookingEngine.js
git rev-parse HEAD:src/routes/ccoBookingEngine.js
git rev-parse 376e12f0:src/ops/ccoBookingEngineStore.js
git rev-parse HEAD:src/ops/ccoBookingEngineStore.js
```

Equal hashes mean the deployed remediation is byte-identical to the verified
one. Unequal hashes mean someone changed it, and that change needs its own
record.

---

## Production security smoke _[VERIFIED]_

All probes discarded response bodies (`curl -o /dev/null`); only status codes
were read. No real customer, patient or booking record was created, cancelled,
rebooked or otherwise mutated.

### S-001 — unauthenticated booking write

| Endpoint (POST)                           | Status |
| ----------------------------------------- | ------ |
| `/api/v1/cco-booking-engine/reservations` | 401    |
| `/api/v1/cco-booking-engine/confirm`      | 401    |
| `/api/v1/cco-booking-engine/cancel`       | 401    |
| `/api/v1/cco-booking-engine/rebook`       | 401    |
| `/api/v1/cco-bookings/candidates`         | 401    |
| `/api/v1/cco-bookings/status`             | 401    |

No unauthenticated write path exists. Nothing was mutated.

### S-002 — authenticated actor without `bookings.write`

**`NOT SAFELY TESTABLE IN PRODUCTION`.**

Reproducing this live requires a real session token for a real account lacking
the permission. The deploy operator does not fabricate credentials and does not
enter passwords in any system. The behaviour is covered pre-deploy by
`ccoBookingEngineWriteAuth` T-002 and T-004..T-007 and by `ccoBookingRemediation`
T-R1, T-R2/T-R4, T-R5, T-R7, T-R9, T-R11 — all green at the deployed commit.

### S-003 — client-supplied identifiers as proof of authorization

| Vector                                            | Status |
| ------------------------------------------------- | ------ |
| `?tenantId=hairtp` + `x-tenant-id: hairtp`        | 401    |
| `?tenantId=hairtp` + `x-arcana-tenant: hairtp`    | 401    |
| `?tenantId=hairtp` + `x-forwarded-for: 127.0.0.1` | 401    |

A client-provided tenant identifier grants nothing. The third line also
re-confirms P0-001 in production: a spoofed loopback `X-Forwarded-For` does not
produce local-preview elevation.

### B-3 live mutation test

**`DEFERRED — VERIFIED PRE-DEPLOY BY INDEPENDENT RED TEAM`**

Per the runbook, the cross-tenant conflict/override attack is **not** reproduced
in production, because doing so requires creating a real conflicting booking on
a real resource and time. The instruction stands: do not mutate real
customer/patient bookings merely to test P0-002.

B-3 is covered pre-deploy by `ccoBookingRemediation` T-R16 through T-R25 and by
`ccoBookingNB1` T1–T8 — cross-tenant conflict raised, no foreign tenant or
customer data in the conflict response or the audit event, override denied
without `bookings.write`, override audited when authorized, unrelated
resource/time unaffected, and the ordinary same-tenant flow unchanged.

---

## Health after deploy _[VERIFIED]_

```
/healthz                                    200   ready: true, startupPhase: ready
/readyz                                     200
/staff-portal.html                          200   portal marker present
/api/v1/_diag/env                           200
/api/v1/cco-booking-engine/catalog          401   (router mounted, auth enforced)
/api/v1/cco-booking-engine/availability     401   (router mounted, auth enforced)
```

Zero 5xx across the probed paths. The booking-engine router answers `401`
rather than `404`, which is the evidence that it mounted: startup completed and
the routes are live behind authentication.

No rollback was required.

---

## Final status

```
P0-002 Booking Write Authorization

[x] Implementation (DeepSeek)
[x] B-1 / B-2 / B-3 remediation
[x] NB-1 remediation                 1531067f
[x] Kimi Red Team FINAL PASS
[x] Pre-deploy gate  8324/8324
[x] Merge                            376e12f0
[x] Deploy
[x] Production smoke S-001, S-003
[~] S-002   NOT SAFELY TESTABLE IN PRODUCTION — covered pre-deploy
[~] B-3     LIVE MUTATION DEFERRED — covered pre-deploy
[x] CANONICAL CLOSURE RECORD

    P0-002 — VERIFIED CLOSED   (2026-09-05)
```

**Carried forward, not closed by this record:**

- The application exposes no build/commit identifier, so live-SHA verification
  is indirect. Adding one to `/api/v1/_diag/env` would make every future deploy
  verifiable in one request. → change-control backlog.
- S-002 and the B-3 live mutation remain unproven _in production_ by design.
  They become testable the day a synthetic tenant with synthetic resources
  exists in production. → security-testing backlog.
- P0-003 — LOCKED. P0-004 — LOCKED. Neither was touched.
- Out of scope and deliberately untouched in this pass: RBAC beyond
  `bookings.write`, the calendar backlog, `tenantIdCanonical`, environment
  variables, clinical gates, `offer.write` separation, and the audit IP/XFF
  provenance finding.

---

## Roles

| Role                                    | Party    |
| --------------------------------------- | -------- |
| Product Owner                           | Fazli    |
| Project Lead / Orchestrator             | ChatGPT  |
| Builder                                 | DeepSeek |
| Independent Red Team                    | Kimi     |
| Deploy Operator                         | Coworker |
| Documentation / Change-Control Operator | Coworker |

## Sources

- Repository state at `376e12f0` (2026-09-05), for every `[VERIFIED]` line.
- `src/routes/ccoBookings.js`, `src/routes/ccoBookingEngine.js`,
  `src/ops/ccoBookingEngineStore.js` — the implementation.
- `tests/routes/ccoBookingEngineWriteAuth.test.js`,
  `tests/routes/ccoBookingRemediation.test.js`,
  `tests/routes/ccoBookingNB1.test.js` — the invariants that keep this closure
  true over time.
- Production probes against `https://arcana.hairtpclinic.com`, status codes
  only, 2026-09-05 20:56–21:01 UTC.
- Control Room transcript — for every `[RELAYED]` line.
