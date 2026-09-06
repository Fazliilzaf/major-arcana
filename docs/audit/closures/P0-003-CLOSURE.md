# P0-003 — Conversation Reply Safety · CANONICAL CLOSURE RECORD

**Status:** `P0-003 — VERIFIED CLOSED`
**Closure date:** 2026-09-06
**Record type:** Change-control closure for a shipped remediation. This record
changes no product code; the product change is merge `5e5bc589`.

---

## Provenance of the claims below

Same two-mark system as [ORD-224-P0-001-CLOSURE.md](ORD-224-P0-001-CLOSURE.md)
and [ORD-238-P0-002-CLOSURE.md](ORD-238-P0-002-CLOSURE.md).

| Mark           | Meaning                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[VERIFIED]** | Reproduced by the deploy operator at the time this record was written. Anyone can re-run the stated command and get the same answer.              |
| **[RELAYED]**  | Reported by another party (Builder, Red Team, Product Owner) and recorded here as their statement. Not independently re-executed for this record. |

---

## Finding

**ID:** P0-003 — Conversation reply bypassed the canonical send adapter
**Severity:** P0
**Class:** Broken/missing guard on a state-changing send path (missing
authorization + missing safety gates), reachable only by an authenticated
actor holding `mail.live_send`.

The conversation view's reply endpoint
`POST /cco/runtime/conversation/:key/reply` (mounted at `/api/v1`) called
`graphSendConnector.sendReply(...)` **directly**, instead of going through the
canonical send adapter (`createCcoGraphSendAdapter`). The direct call passed
**around** the three gates that every other customer-facing send path enforces:

1. **Deceased guard** (`assertNotDeceased`) — a reply could be sent to a
   deceased patient's address.
2. **Sender allowlist** (`ARCANA_GRAPH_SEND_ALLOWLIST`) — a reply could be sent
   from a non-allowlisted mailbox.
3. **Customer-mailing gate** (`audience: 'customer'` → `bedomKundutskick`) — a
   reply was not routed through the kundutskick spärr that the owner asked for.

### Root cause, stated once

The reply route re-implemented its own send call instead of reusing the single
canonical send path. This is the same duplication failure that produced P0-001
and P0-002: the guard existed in one place (the adapter) and one call site
carried a weaker, unguarded version of it.

---

## Implementation

|                     |                                                   |
| ------------------- | ------------------------------------------------- |
| Builder             | DeepSeek                                          |
| Builder branch      | `origin/p0-003-conversation-reply-safety-builder` |
| **Verified commit** | **`cd8c4da2a1697b20e950bbab1e9571566f485b80`**    |

**[VERIFIED]** The verified commit exists in the repository:

```
git cat-file -t cd8c4da2a1697b20e950bbab1e9571566f485b80    → commit
```

### What the implementation establishes

- `createCcoGraphSendAdapter` gains a `sendReply` method that runs, **in order
  and all before the connector** (no external side effect on block):
  1. `assertNotDeceased({ email: to })` — deceased guard, keyed on the
     recipient, fail-closed.
  2. `assertSenderAllowed(from)` — sender allowlist
     (`ARCANA_GRAPH_SEND_ALLOWLIST`), fail-closed (empty allowlist = nobody
     approved except explicit `*`).
  3. `audience: 'customer'` — declares the customer-mailing gate so the
     connector's `bedomKundutskick` applies.
- `server.js` wires `graphSendAdapter` into the conversation router
  (`graphSendConnector ? createCcoGraphSendAdapter(graphSendConnector) : null`).
- `src/routes/ccoConversation.js` reply route now calls
  `graphSendAdapter.sendReply(...)` instead of `graphSendConnector.sendReply`
  directly. The sender and recipient are derived from **server-side
  conversation state** (the latest inbound message), never from the client
  body.
- `config/graph-sandvagar.json` re-declares the canonical path: the
  `graphSendConnector.sendReply` row is marked `deklaration: null`, and the new
  canonical `ccoGraphSendAdapter.sendReply` row declares `audience: 'customer'`.

**[VERIFIED]** The route no longer references `graphSendConnector.sendReply`
directly (T-016 is a static audit that fails if it returns):

```
grep -n "graphSendConnector.sendReply" src/routes/ccoConversation.js   → (none)
```

---

## Independent Red Team

|                 |                                             |
| --------------- | ------------------------------------------- |
| Verifier        | Kimi                                        |
| Verified commit | `cd8c4da2a1697b20e950bbab1e9571566f485b80`  |
| Verdict         | **FINAL PASS — CAN PROCEED TO DEPLOY: YES** |

Reported by the Red Team _[RELAYED]_: original vulnerability CLOSED; blocking
findings NONE; can proceed YES.

---

## Attack matrix

Adversarial contracts measured by the P0-003 test suite (T-001…T-016 plus the
adapter and sanitize suites) _[VERIFIED]_:

| Vector                                                          | Expected result                                          |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| T-001 unauthenticated reply                                     | 401 — denied before any send                             |
| T-002 actor without `mail.live_send`                            | 403, `requiredPermission: mail.live_send`, 0 Graph calls |
| T-003 foreign tenant                                            | 403 `tenant_scope_forbidden`, 0 Graph calls              |
| T-004 client tenant in body/header                              | verified auth wins, 0 Graph calls                        |
| T-005/T-006 deceased recipient                                  | blocked (SEND_BLOCKED → 500 send_failed), 0 Graph calls  |
| T-007/T-008 non-allowlisted sender                              | denied, 0 Graph calls                                    |
| T-011/T-012 client-supplied sender/recipient override           | ignored — authoritative (server-derived) choice wins     |
| T-013 legitimate authorized reply                               | adapter/connector called exactly once                    |
| T-014 adapter error                                             | 500 send_failed, no false sent/delivered                 |
| T-016 route calls adapter, never `graphSendConnector.sendReply` | static audit passes                                      |
| Adapter: empty allowlist                                        | fail-closed — sender denied                              |
| Adapter: wildcard `*` allowlist                                 | sender approved                                          |
| Adapter: missing `connector.sendReply`                          | `graph_send_unavailable` (fail-closed)                   |
| `sanitizeReplyHtml`                                             | strips dangerous hrefs / comments / disallowed tags      |

---

## Canonical send path (after this remediation)

```
POST /api/v1/cco/runtime/conversation/:key/reply
  → authMiddleware (401 if unauthenticated)
  → requirePermission('mail.live_send') (403 if not owner)
  → resolve senderMailboxId + recipient from SERVER-side conversation state
  → graphSendAdapter.sendReply({ from: senderMailboxId, to: recipient, ... })
       → assertNotDeceased({ email: to })          # deceased guard, fail-closed
       → assertSenderAllowed(from)                  # sender allowlist, fail-closed
       → connector.sendReply({ audience:'customer', ... })  # kundutskick gate
```

No client-supplied field can select the sender or recipient.

---

## Test evidence at the integrated commit _[VERIFIED]_

Run by the deploy operator on the merge result (`5e5bc589`), `NODE_ENV=test`:

| Gate                                    | Result                                 |
| --------------------------------------- | -------------------------------------- |
| P0-003 targeted (6 files)               | **50 / 50 PASS**                       |
| Conversation/send suite (24 files)      | **171 / 171 PASS**                     |
| Security suite (`tests/security/*`)     | **190 / 190 PASS**                     |
| `npm run check:syntax`                  | **exit 0**                             |
| `npm run lint:no-bypass`                | **exit 0**                             |
| **Full regression `npm run test:unit`** | **8352 / 8354** (1 fail + 1 cancelled) |

```
ℹ tests 8354   ℹ suites 32   ℹ pass 8352   ℹ fail 1   ℹ cancelled 1
```

The two non-passing tests are pre-existing and unrelated to P0-003 (neither
file is touched by the merge `bf7fa117..5e5bc589`):

- `tests/ops/ccoBookingEngineStore.test.js` — "cykliska availabilityRules
  gäller bara rätt vecka" → date-sensitive (week-cycle anchored at 2026-09-14;
  run on 2026-09-06 yields week 8 ≠ 1).
- `tests/ops/ccoMailIngestionQueueMembership.test.js` —
  "reconcileProcessingQueue: 5000 ledgers…" → timed out at 60000 ms.

**0 NEW P0-003 FAILURES.**

---

## Merge

|                |                                            |
| -------------- | ------------------------------------------ |
| Pre-merge main | `bf7fa117aef9106278b088702ad143e306262374` |
| Builder        | `cd8c4da2a1697b20e950bbab1e9571566f485b80` |
| Merge commit   | `5e5bc589f3a315b92605e2c46ba9ea8519f03762` |
| Conflicts      | 0                                          |

**[VERIFIED]** The merge has exactly the two claimed parents:

```
git log --format='%h %p' -1 5e5bc589
  → 5e5bc589  bf7fa117 cd8c4da2
```

**[VERIFIED]** Pre-integration check per runbook §2: `main` had advanced by one
commit (`bf7fa117`, `public/staff-portal.html` + `tests/public/portalenFungerarIHanden.test.js`)
with **zero file overlap** against the eight P0-003 files. Dry merge
(`git merge-tree`) exited 0 with zero conflict markers. The actual `--no-ff`
merge produced 0 conflicts.

**P0-003 file diff (8 files, `bf7fa117..5e5bc589`):**

```
config/graph-sandvagar.json                     |  12 +-
server.js                                       |  10 +
src/infra/ccoGraphSendAdapter.js                |  92 +
src/routes/ccoConversation.js                   |  23 +-
tests/infra/ccoGraphSendAdapterReplySafety.test.js | 197 + (new)
tests/routes/ccoConversationReplySafety.test.js    | 329 + (new)
tests/routes/ccoConversationReplySanitize.test.js  |  43 +-
tests/routes/ccoReplyShadowE1.test.js              |  13 +
  8 files changed, 697 insertions(+), 22 deletions(-)
```

The implementation is unmodified: nothing was reconstructed by hand, no
creative conflict resolution, no redesign.

---

## Production deploy

|                              |                                            |
| ---------------------------- | ------------------------------------------ |
| Deploy operator              | Coworker                                   |
| Push                         | `bf7fa117..5e5bc589  main -> main`         |
| Expected live SHA            | `5e5bc589f3a315b92605e2c46ba9ea8519f03762` |
| Environment variable changes | NONE                                       |
| Render `envVars` changes     | NONE                                       |
| Patient data accessed        | NO                                         |
| Real mail sent               | NONE                                       |

### Live-SHA verification _[VERIFIED]_

The application now exposes a commit identifier at `/api/v1/_diag/version`
(added after the P0-002 closure, which noted its absence). The live endpoint
reports the exact commit:

```
curl -s https://arcana.hairtpclinic.com/api/v1/_diag/version
  → {"ok":true,"commit":"5e5bc589f3a315b92605e2c46ba9ea8519f03762",
     "branch":"main","serverStartedAt":"2026-09-06T04:20:39.054Z",…}
```

The reported `commit` is byte-for-byte identical to the merge SHA above. This
is **direct** live-SHA verification (the same endpoint the repo's own
`post-deploy-prod-heal` workflow uses for its "commit match" check), not the
indirect startedAt inference used in P0-002.

---

## Production smoke _[VERIFIED]_

All probes discarded response bodies (status codes only) except where the body
was read for the error message. No real customer, patient or mailbox was
contacted; no credentials were fabricated or entered.

### S-001 — unauthenticated reply

| Probe                                                                 | Status                                  |
| --------------------------------------------------------------------- | --------------------------------------- |
| `POST /api/v1/cco/runtime/conversation/test-key/reply` (no auth)      | **401** `{"error":"Inloggning krävs."}` |
| `POST …/reply` with client `from`/`to` in body, still unauthenticated | **401**                                 |
| `GET /api/v1/cco/runtime/conversation/test-key/summary` (no auth)     | **401** (route mounted, auth enforced)  |

Unauthenticated reply is denied before any sender/recipient resolution or any
Graph call. Nothing was sent.

### S-002 — foreign / invalid tenant reply

**`NOT SAFELY TESTABLE IN PRODUCTION`.** Reproducing requires a real session
token for a real foreign-tenant account. Covered pre-deploy by T-003 and T-004
(foreign tenant → 403 `tenant_scope_forbidden`, 0 Graph calls; client tenant in
body/header cannot override verified auth).

### S-003 — client-supplied sender override

**`NOT SAFELY TESTABLE LIVE` (verified pre-deploy).** The sender is derived
from the conversation's latest inbound message (`target.mailboxId`), never from
the request body. T-011/T-012 confirm the authoritative server-derived choice
wins and the client override is ignored.

### S-004 — client-supplied recipient override

**`NOT SAFELY TESTABLE LIVE` (verified pre-deploy).** The recipient is derived
from the inbound message's `from` address, and only
`ARCANA_MAIL_SEND_TEST_RECIPIENT` (server env, unset in prod) can redirect it.
T-011/T-012 confirm the client override is ignored.

### S-005 — blocked / deceased recipient

**`DEFERRED — INDEPENDENTLY VERIFIED PRE-DEPLOY`.** Not reproduced against a
real patient. Covered pre-deploy by T-005/T-006 (deceased → SEND_BLOCKED,
0 Graph calls).

### S-006 — unauthorized / non-allowlisted sender

**`DEFERRED — INDEPENDENTLY VERIFIED PRE-DEPLOY`.** No synthetic send mode
exists in production. Covered pre-deploy by T-007/T-008 and the adapter
fail-closed empty-allowlist test.

### S-007 — legitimate synthetic reply

**`NOT SAFELY TESTABLE IN PRODUCTION`.** Production currently has shadow mode
OFF (`ARCANA_MAIL_SHADOW_SEND=false`), no test-recipient set, and the
customer-mailing gate OFF (`kundutskickPa: false` in `/_diag/env`). There is no
safe synthetic-send mode and no approved safe test address; therefore no live
reply send was attempted. Actual-send correctness rests on the pre-deploy
Independent Red Team evidence.

---

## External side-effect safety _[VERIFIED]_

For the single live denial probe (S-001), the `401` is returned by
`authMiddleware` **before** the reply handler, so there is:

- no Graph delivery,
- no sent/delivered state,
- no false success,
- no retry side effect,
- no success audit event.

Production log access (Render) is unavailable to the deploy operator, so this
is established by code inspection of the route order (auth → permission → send)
plus status-code-only probes, not by reading production logs.

---

## Health after deploy _[VERIFIED]_

```
/api/v1/_diag/version  200   commit 5e5bc589 (branch main)
/healthz                200   ready: true, startupPhase: ready
/readyz                 200
/api/v1/cco/runtime/conversation/:key/summary   401  (router mounted, auth enforced)
```

Zero 5xx across the probed paths. The conversation router answers `401` rather
than `404`, which is the evidence it mounted behind authentication.

No rollback was required.

---

## Final status

```
P0-003 Conversation Reply Safety

[x] Implementation (DeepSeek)           cd8c4da2
[x] Kimi Red Team FINAL PASS
[x] Pre-deploy gate (50/50 targeted, 171/171 conv/send, 190/190 security,
                       syntax PASS, no-bypass PASS, regression 0 new P0-003)
[x] Merge                              5e5bc589
[x] Deploy (live SHA verified via /_diag/version)
[x] Production smoke S-001
[~] S-002..S-007  NOT SAFELY TESTABLE LIVE — covered pre-deploy
[x] CANONICAL CLOSURE RECORD

    P0-003 — VERIFIED CLOSED   (2026-09-06)
```

**Backlog carried forward (preserved, NOT fixed in this pass):**

1. Deceased resolver fail-open-hardening before boot/wiring.
2. `executionService` duplicated send-safety implementation.
3. Deceased denial returns `500 send_failed` instead of a more semantic status
   (e.g. `422`/`403` with a machine-readable code).
4. Other P0-003 non-blocking Red Team findings.

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

- Repository state at `5e5bc589` (2026-09-06), for every `[VERIFIED]` line.
- `src/infra/ccoGraphSendAdapter.js`, `src/routes/ccoConversation.js`,
  `config/graph-sandvagar.json` — the implementation.
- `tests/infra/ccoGraphSendAdapterReplySafety.test.js`,
  `tests/routes/ccoConversationReplySafety.test.js`,
  `tests/routes/ccoConversationReplySanitize.test.js`,
  `tests/routes/ccoReplyShadowE1.test.js` — the invariants that keep this
  closure true over time.
- Production probes against `https://arcana.hairtpclinic.com`, status codes
  only, 2026-09-06.
- Control Room transcript — for every `[RELAYED]` line.
