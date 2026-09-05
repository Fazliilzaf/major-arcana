# ORD-224 / P0-001 — Remote Auth Bypass · CANONICAL CLOSURE RECORD

**Status:** `P0-001 — VERIFIED CLOSED`
**Closure date:** 2026-09-05
**Record type:** Change-control closure. Docs-only. No product code changed by this record.

---

## Provenance of the claims below

This record mixes two kinds of statements, and they are marked throughout so a
future agent does not have to guess which is which:

| Mark           | Meaning                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[VERIFIED]** | Reproduced from the repository at the time this record was written. Anyone can re-run the stated command and get the same answer.                 |
| **[RELAYED]**  | Reported by another party (Builder, Red Team, Product Owner) and recorded here as their statement. Not independently re-executed for this record. |

Re-verifying a `[RELAYED]` line is cheap; re-running the whole audit is not.
That is the reason the distinction is preserved rather than flattened.

---

## Finding

**ID:** P0-001 / ORD-224 — Remote Auth Bypass
**Severity:** P0
**Class:** Authentication bypass via client-controlled locality signals

A remote request could fabricate local-preview / OWNER elevation by supplying
locality information that the application trusted. Behind Express
`trust proxy`, `req.ip` follows `X-Forwarded-For` and `req.hostname` follows
`X-Forwarded-Host` — both are set by the client and neither is proof of
locality.

**Verified pre-fix production effect** _[RELAYED — measured before the fix, not
reproducible now that the hole is closed]_

```
normal request                      → 401
spoofed XFF / Host / preview token  → 200
```

### Root cause

Locality was inferred from request _headers_ rather than from the transport.
Only `req.socket.remoteAddress` reflects the actual TCP peer; every other
locality signal available to the handler is attacker-controlled when the app
sits behind a proxy. The same inference was written out in five separate
places, so no single edit could close it.

---

## Implementation

|                  |                                            |
| ---------------- | ------------------------------------------ |
| Builder          | DeepSeek                                   |
| Builder branch   | `ord-224-p0-001-builder`                   |
| Builder commit   | `1d9c0eff5ccad6c14e0b709cf1e44e2ed84f232c` |
| Canonical module | `src/security/lokalForhandsvisning.js`     |

**[VERIFIED]** The builder commit exists in the repository:

```
git cat-file -t 1d9c0eff5ccad6c14e0b709cf1e44e2ed84f232c   → commit
```

### What the implementation establishes

- Production local preview is **always denied**, regardless of any header.
- Locality uses a canonical server-side peer model
  (`req.socket.remoteAddress` against a loopback set).
- `Host`, `X-Forwarded-Host`, `X-Forwarded-For`, `req.hostname` and `req.ip`
  are **not** used as proof of locality.
- Five previously independent callers delegate to the canonical helper.
- No parallel preview-locality truth remains within scope.

**[VERIFIED]** All five callers require the canonical module and none defines
its own `isLocalPreviewRequest`:

```
src/security/authMiddleware.js       require: 1   own definition: 0
src/routes/ccoRouteShared.js         require: 1   own definition: 0
src/routes/ccoBookings.js            require: 1   own definition: 0
src/routes/ccoBookingEngine.js       require: 1   own definition: 0
src/routes/postOpReview.js           require: 1   own definition: 0
```

This invariant is not left to inspection. `tests/security/lokalForhandsvisning.test.js`
enforces it structurally (T-010 to T-013): the call-site inventory must be
non-empty, every listed caller must delegate, and the loopback literal
`::ffff:127.0.0.1` must not appear anywhere in `src/` outside the canonical
module. A sixth copy added later fails the suite.

---

## Builder evidence _[RELAYED]_

| Check           | Result            |
| --------------- | ----------------- |
| Targeted tests  | PASS              |
| Security tests  | PASS              |
| Syntax          | PASS              |
| No-bypass       | PASS              |
| Full regression | 0 new regressions |

---

## Independent Red Team

|                 |                                            |
| --------------- | ------------------------------------------ |
| Verifier        | Kimi                                       |
| Verified commit | `1d9c0eff5ccad6c14e0b709cf1e44e2ed84f232c` |
| Verdict         | **PASS / GO**                              |

Verified by the Red Team _[RELAYED]_:

- commit match
- original spoof variants blocked
- XFF spoof blocked
- Host / X-Forwarded-Host spoof blocked
- combined spoof blocked
- production loopback preview blocked
- dev loopback works per contract
- trust-proxy integration verified
- five callers delegate to the canonical helper
- no parallel locality implementation found within scope
- no new regressions

### Residual finding

A non-production local reverse proxy or tunnel can make the socket peer appear
to be loopback.

**Classification:** `NON-BLOCKING — SECURITY HARDENING BACKLOG`

Not a P0-001 blocker, because production preview is denied unconditionally
before the peer is consulted. The residual applies to development environments
only.

---

## Merge

|                |                                            |
| -------------- | ------------------------------------------ |
| Pre-merge main | `e5529ba4f794ef50ad53a87979761264e936bea6` |
| Merge commit   | `6f116faff5f6daa246692aa10b2c3643579ece6c` |

**[VERIFIED]** The merge commit has exactly the two claimed parents, so the
merge relationship is provable from git rather than taken on trust:

```
git log --format='%h %p' -1 6f116faf
  → 6f116faf  e5529ba4 1d9c0eff
```

---

## Production deploy

|                              |                                            |
| ---------------------------- | ------------------------------------------ |
| Deploy operator              | Coworker                                   |
| Expected live SHA            | `6f116faff5f6daa246692aa10b2c3643579ece6c` |
| Verified actual live SHA     | `6f116faff5f6daa246692aa10b2c3643579ece6c` |
| Environment variable changes | NONE                                       |
| `TRUST_PROXY` changes        | NONE                                       |
| Patient data accessed        | NO                                         |

Production probes discarded response bodies (`curl -o /dev/null`); only status
codes were read.

### Note on the live SHA after this date

**[VERIFIED]** `main` has advanced past `6f116faf` since the deploy — the
staff-portal UI work ORD-225 to ORD-230 landed on 2026-09-05. The live SHA
recorded above is therefore **the SHA at the moment of the P0-001 deploy and
smoke**, not a claim about the currently deployed SHA.

The fix itself is unaffected, and that is checkable rather than assumed. The
canonical module is byte-identical between the deploy commit and current
`main`:

```
git rev-parse 6f116faf:src/security/lokalForhandsvisning.js
  → 91cd81db64144c4fecbd13cf19846ba36a7daf85
git rev-parse 43b02b22:src/security/lokalForhandsvisning.js
  → 91cd81db64144c4fecbd13cf19846ba36a7daf85
```

`git diff 6f116faf HEAD` across the canonical module and all five callers is
empty. Any future doubt about whether the fix is still live should be settled
by re-running that blob comparison, not by re-reading this paragraph.

---

## Production security smoke

Executed against production after the deploy _[RELAYED for the pre-fix
baseline, VERIFIED post-fix at deploy time]_:

| Attack vector                                     | Result after fix |
| ------------------------------------------------- | ---------------- |
| Unauthenticated request                           | 401              |
| XFF loopback + preview token                      | 401              |
| Host / X-Forwarded-Host localhost + preview token | 403              |
| Combined spoof                                    | 403              |
| Additional IPv6 / XFF variants                    | unauthorized     |

The vector that previously returned 200 returns 4xx. No rollback was required.

Independently reproduced by the Product Owner from his own machine, which
matters: it removes the deploy operator as a single point of trust.

---

## Legitimate OWNER path (S-005)

The legitimate OWNER login path was **accepted as operational by the Product
Owner / Control Room** _[RELAYED]_.

It is recorded honestly here that this step was **not** verified by the deploy
operator. The operator does not enter credentials in any system — not in the
staff portal, not in cloud consoles — so the login flow could not be exercised
from that side. What the operator could verify was that a _pre-existing_
authenticated session continued to work after the deploy; the credential entry
itself was performed and accepted by the Product Owner.

This is a provenance note, not a reopened item. P0-001 is closed.

---

## Final status

```
P0-001 Remote Auth Bypass

[x] Implementation
[x] DeepSeek Builder
[x] Kimi Red Team PASS
[x] Merge
[x] Deploy
[x] Production attack smoke
[x] Attack closed live
[x] CANONICAL CLOSURE RECORD

    P0-001 — VERIFIED CLOSED   (2026-09-05)
```

**Carried forward, not closed by this record:**

- Residual: non-production reverse proxy / tunnel loopback impersonation →
  security hardening backlog.
- P0-002 — PAUSED. Builder complete, Red Team not started.
- P0-003 — LOCKED.
- P0-004 — LOCKED.

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

- Repository state at `43b02b22` (2026-09-05), for every `[VERIFIED]` line.
- `src/security/lokalForhandsvisning.js` — canonical implementation.
- `tests/security/lokalForhandsvisning.test.js` — T-001 to T-013, the
  invariants that keep this closure true over time.
- Control Room transcript — for every `[RELAYED]` line.
