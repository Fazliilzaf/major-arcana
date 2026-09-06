# P1-003 / P1-004 — Customer dossier tenant isolation

**Status: VERIFIED CLOSED** · closed 2026-09-06

Provenance is marked throughout. `[VERIFIED]` = reproduced from this repository
or measured against production by the Deploy Operator. `[RELAYED]` = reported by
another party and recorded, not re-derived here.

---

## 1. Findings

**P1-003 — the dossier read a client-controlled tenant first.**
`resolveTenantId(req, config)` in `ccoCustomerDossier.js` started with
`req.query.tenantId` and only then fell back to `req.auth.tenantId`. A caller
could therefore name the tenant its own dossier read would be scoped to.

**P1-004 — a global static alias list was applied to every tenant.**
`tenantCandidates()` returned `[tenant, 'hairtpclinic', 'hair-tp-clinic',
'hair_tp']` regardless of who was asking. Curatiio's dossier read therefore
carried Hair TP's legacy storage keys as read candidates. One clinic's alias
list was every clinic's alias list.

The same client-first pattern ran on all eight customer-communication
surfaces: `normalizeText(req.query.tenantId) || req.auth?.tenantId || …`.

**B-1 (Kimi blocker) — conversation thread action state was not tenant-keyed.**
`getThreadStateKey` produced `customerId::threadId`. Two tenants with the same
customer id and thread id shared one record: handled / snoozed / read state
crossed the tenant boundary even after the routes were fixed.

## 2. Canonical decision

The authenticated membership tenant is the only authority. A client-supplied
tenant is not a selector — it is an assertion that must match, and a mismatch
is a 403 raised **before** any read. Legacy read aliases are derived _from_ the
authenticated tenant, never applied globally. Thread state is keyed
`tenantId::customerId::threadId`.

## 3. History

| Step               | Artefact                                         | Verdict                                 |
| ------------------ | ------------------------------------------------ | --------------------------------------- |
| Builder (DeepSeek) | `a7836599b959358e04516d8ef09a97f40be91037`       | Kimi **FAIL** — blocker B-1 `[RELAYED]` |
| B-1 remediation    | `67b7013997b35b5d832d3f0f0567ae90e16e63be`       | Kimi narrow **PASS** `[RELAYED]`        |
| Controlled deploy  | merge `87350468757ab359ef5022e4e777e0f35a01d99d` | **PASS** `[VERIFIED]`                   |

Kimi final: `BLOCKER RE-CHECK: PASS` · `CAN PROCEED TO DEPLOY: YES` `[RELAYED]`.

## 4. Integration `[VERIFIED]`

```
PRE-MERGE MAIN   2cf67f7028c53f89a5d037bc7dd60201c19fe47f
REMEDIATION      67b7013997b35b5d832d3f0f0567ae90e16e63be
                 (= head of origin/p1-003-004-customer-dossier-tenant-builder)
MERGE SHA        87350468757ab359ef5022e4e777e0f35a01d99d
merge-base       2cf67f70  (= main head; branch sat directly on main)
main advanced    0 commits since the branch base
conflicts        0
files            11  (+874 / −67)
```

`a7836599` is an ancestor of `67b70139` (`git merge-base --is-ancestor`), so the
builder fix and the B-1 remediation were integrated as one chain. Method: clean
`git worktree` from `origin/main`, `merge --no-ff`, then `merge --ff-only` into
the working copy. `git diff 67b70139..MERGE` is empty — nothing was recreated by
hand.

The five files the runbook named as stop-conditions —
`ccoCustomerDossier.js`, `ccoCustomerComm.js`, `conversationTenantResolver.js`,
`tenantIdCanonical.js`, `ccoConversationThreadStore.js` — had **0 commits on
main** since the branch base. No tenant/security conflict was resolved, because
none existed.

## 5. Pre-deploy test gate `[VERIFIED]`

Run on Node v22.23.2 — the version production runs.

```
P1-003/004 dossier isolation        8/8
P1-003/004 customer comm isolation  9/9
tenant scope                       13/13
customer surface guard              1/1
B-1 thread-state isolation          5/5
patientStore tenant contract        8/8
P1-001/002 tenant truth            88/88     (11 files)
conversation                     2039/2039   (203 files)
multi-tenant / security           892/892    (121 files)
P0-003 send safety               1624/1624   (168 files)
P0-004 RBAC                       261/261    (32 files)
check:syntax                     exit 0
lint:no-bypass                   exit 0
FULL REGRESSION              8525/8525   fail 0   exit 0
new failures                        0
```

8525 is the count Kimi reported independently `[RELAYED]`, and it is what this
run measured `[VERIFIED]`. It is 8489 (the P1-001/002 baseline) plus the 36 new
tests this change adds — the arithmetic closes.

### A note on the instrument

The first attempt to run the targeted suites used `npx jest` and reported
`Tests: 0 total`. This project has no jest; `npm run test:unit` drives
`node --test`. Reported as-is, "0 total" alongside a green exit would have read
as a pass. Re-run with the project's own runner.

## 6. The fix as deployed `[VERIFIED]`

One new canonical guard in `src/tenant/conversationTenantResolver.js`:

```js
function resolveTenantScope(
  req,
  { clientTenant = '', fallbackTenantId = '' } = {}
) {
  const authenticated = resolveConversationTenant(req, fallbackTenantId);
  const provided = normalizeText(clientTenant);
  if (!provided) return authenticated;
  const providedCanonical = canonicalTenantId(provided);
  if (!providedCanonical || providedCanonical !== authenticated) {
    const error = new Error('tenant_scope_forbidden');
    error.statusCode = 403;
    throw error;
  }
  return authenticated; // never the client value, even on a match
}
```

and one in `src/tenant/tenantIdCanonical.js`:

```js
function tenantReadCandidates(canonicalValue) {
  const canonical = canonicalTenantId(canonicalValue);
  if (!canonical) return [];
  if (canonical === HAIR_TP_CANONICAL)
    return [HAIR_TP_CANONICAL, 'hairtpclinic', 'hair_tp'];
  return [canonical];
}
```

Measured, not read:

```
tenantReadCandidates("hair-tp-clinic")  ["hair-tp-clinic","hairtpclinic","hair_tp"]
tenantReadCandidates("hair_tp")         ["hair-tp-clinic","hairtpclinic","hair_tp"]
tenantReadCandidates("curatiio")        ["curatiio"]
tenantReadCandidates("")                []
curatiio contains a Hair TP alias       NO
'cco' appears as a candidate            NO   (for hair-tp-clinic / curatiio / hair_tp)

auth=hair-tp, no client tenant     → "hair-tp-clinic"
auth=hair-tp, client=hair_tp       → "hair-tp-clinic"   (alias matches, auth value used)
auth=hair-tp, client=curatiio      → 403 tenant_scope_forbidden
auth=curatiio, client=hair-tp      → 403 tenant_scope_forbidden
auth=hair-tp, client=cco           → 403 tenant_scope_forbidden
auth=hair-tp, client=../../etc     → 403 tenant_scope_forbidden
auth=hair-tp, client=CURATIIO      → 403 tenant_scope_forbidden
no auth,      client=curatiio      → 403 tenant_scope_forbidden
```

## 7. Customer communication surface `[VERIFIED]`

All eight surfaces route through `resolveTenantScope`:

conversation-threads · unified-timeline · journey read · journey advance ·
journey rollback · conversation-context · communication-feed ·
conversation-thread action.

```
resolveTenantScope(req, …) call sites in ccoCustomerComm.js   8
client-first tenant expressions remaining                      0
```

The 403 reaches the client on all eight: six routes gained an explicit
`if (error.statusCode === 403)` branch, and the two journey writes already had
`res.status(Number(error?.statusCode || 400))` catches, so the status passes
through rather than collapsing into a 500. Both were checked, not assumed.

## 8. B-1 thread-state tenant isolation `[VERIFIED]`

```js
function getThreadStateKey(tenantId, customerId, threadId) {
  return [
    normalizeTenantKey(tenantId),
    String(customerId || ''),
    String(threadId || ''),
  ].join('::');
}
```

`normalizeTenantKey` runs the same `canonicalTenantId` used everywhere else, so
`hair_tp` and `hairtpclinic` collapse to `hair-tp-clinic`. `getThreadState`,
`ensureThreadStateRecord` (used by `performAction`) and
`buildThreadsForCustomer` all pass `tenantId` through.

## 9. Legacy thread state `[VERIFIED]` — synthetic fixtures, production untouched

Measured against fixtures in `/tmp`, built to the shape
`ensureThreadStateRecord` produces:

| Property                                      | Measured                                                      |
| --------------------------------------------- | ------------------------------------------------------------- |
| legacy `customerId::threadId` → which tenant? | `hair-tp-clinic` and its aliases only                         |
| Curatiio can read the legacy record           | **NO** (`getThreadState('curatiio',…)` → `null`)              |
| empty / unknown tenant can read it            | NO                                                            |
| pure read persists the migration              | **NO** — file byte-identical, key still `["kund1::trad1"]`    |
| next legitimate write persists tenant-scoped  | YES — `["hair-tp-clinic::kund1::trad1"]`, 2-segment key gone  |
| a Curatiio write inherits Hair TP state       | NO — writes `curatiio::kund1::trad1` alongside, never into it |

`persist()` has exactly one call site: inside `performAction`. Reads cannot
write.

**Production legacy row count: NOT INDEPENDENTLY DETERMINABLE.** Thread state
lives under `ARCANA_STATE_ROOT=/var/data` on Render. The Deploy Operator does
not sign in to the hosting console, and no safe diagnostic route exposes
thread-state counts — `/api/v1/_diag/{tenants,state,conversation-state,
thread-state,threads}` all return `404`; only `/_diag/version` and `/_diag/env`
exist. No migration was run and nothing was mutated to make this ledger tidier.

## 10. Client tenant override `[VERIFIED]`

Fourteen unauthenticated probes across all nine routes — query `tenantId`,
`x-cco-tenant`, `x-tenant-id`, body `tenantId`, malformed values, and all four
at once. **Every one returned `401`. None returned `2xx`.** Response bodies were
discarded (`-o /dev/null`); only status codes were read. No credentials were
fabricated, so the authenticated 403 path is proven by §6 measurement and the
44 new tests, not by a production call.

## 11. Route mounting vs. auth gate `[VERIFIED]`

A `401` proves the gate. It proves the _mount_ only where an unknown path under
the same prefix returns `404` — otherwise auth ran before routing and an unknown
path would answer `401` too. Measured per prefix:

```
/api/v1/cco/runtime/customer/…/finns-inte-xyz     404   → routing first
/api/v1/cco-customers/…/finns-inte-xyz            404   → routing first
/api/v1/cco-conversation-threads/finns-inte-xyz   404   → routing first
/api/v1/cco-comm/finns-inte-xyz                   404   → routing first
/api/v1/users/finns-inte-xyz                      404   → routing first
/api/v1/cco/runtime/conversation/…/finns-inte-xyz 401   → AUTH FIRST
/api/v1/staff/finns-inte-xyz                      401   → AUTH FIRST
```

So the dossier route, all eight comm surfaces, `/cco-comm/drafts` and
`/users/staff` are proven **mounted and gated**. On
`/api/v1/cco/runtime/conversation/…` and `/api/v1/staff/…` the 401s prove the
**gate only** — those mounts are not established by this evidence and are not
claimed to be.

**Correction to an earlier record.** The P1-001/002 closure §8 stated that
unknown paths under `/api/v1/cco/runtime/` return `404` and used that to prove
the conversation router mounted. The coarse prefix does return 404; the deeper
`conversation/` subtree does not. That closure's mounting claim for the
conversation router is therefore weaker than written.

## 12. Deploy and health `[VERIFIED]`

```
EXPECTED SHA     87350468757ab359ef5022e4e777e0f35a01d99d
ACTUAL LIVE SHA  87350468757ab359ef5022e4e777e0f35a01d99d   MATCH
```

Read from two independent sources: the `X-Arcana-UI-Build` response header
(`/admin`) and `/api/v1/_diag/version` → `commit`. Both are a 40-hex SHA equal
to the merge commit, which none of `uiBuildId`'s fallbacks
(`npm_package_version`, `Date.now()`) could produce.

```
/healthz 200   /readyz 200   /admin 200   /staff-portal 200
/api/v1/_diag/version 200      no new 5xx observed
```

The canonical host is `arcana.hairtpclinic.com`; `…hairtpclinic.se` answers
`301` to it. Probing the `.se` host for a build header returns nothing — a
redirect, not a missing header.

## 13. P1-001/002 regression `[VERIFIED]`

```
ARCANA_DEFAULT_TENANT   unset  (envSource "unset")
ARCANA_BOOTSTRAP_TENANT_ID     "hair-tp-clinic"
config.defaultTenantId  "hair-tp-clinic"   canonical "hair-tp-clinic"   is cco? NO
```

No active `'cco'` literal remains in the conversation domain — the four
remaining occurrences in `src/tenant/` and `ccoConversation.js` are comments
explaining why `'cco'` is not a tenant. Migration tooling is intact and
dry-run remains the default (`--apply` required to write). **No migration
executed.**

`config` is exported as `{ config: … }`; reading the module object directly
gives `defaultTenantId: undefined`. The first measurement here did exactly that
and would have recorded a wrong (if harmless) value.

## 14. P0-003 and P0-004 regression `[VERIFIED]`

P0-003: reply route still routes through the canonical send adapter (1624/1624
in the send-safety suites), and unauthenticated `POST` on
`/conversation/:key/reply`, `/conversation/:key/action` and `/cco-comm/drafts`
all returned `401`. No real email. No live-send flag changed. All three customer
send gates remain OFF.

P0-004: RBAC artefact intact (261/261). Unauthenticated `GET /staff/me`,
`GET /users/staff`, `PATCH /users/staff/:id` and `POST /users/staff` all
returned `401`. No role changed, no staff account mutated.

## 15. New observations — recorded, not fixed

**N-1 · Legacy migration overwrites an existing tenant-scoped record.**
`migrateLegacyThreadStates` moves `customerId::threadId` to
`hair-tp-clinic::customerId::threadId` unconditionally. Measured with both keys
present for the same thread: the **legacy** record wins and `handled` reverts
`true → false`. Unreachable on a forward-only path — before this deploy every
key is 2-segment, and after the first write every key is 3-segment. It becomes
reachable only after a rollback to the previous code followed by a roll-forward.
Silent, and it loses the newer state. Belongs to backlog item _direct
thread-store hardening_.

**N-2 · The thread store accepts any tenant string as a key prefix.**
Writing with `''`, `'cco'`, `'CCO'` or `'../../etc'` produced the keys
`::k::t`, `cco::k::t`, `CCO::k::t`, `../../etc::k::t`. `'HAIR_TP'` correctly
normalised to `hair-tp-clinic`. Not client-reachable — all nine routes obtain
`tenantId` from `resolveTenantScope`, i.e. from authenticated context — and the
value is a JSON object key, not a filesystem path, so `../../etc` is inert.
This is the already-listed backlog item, now measured rather than asserted.

**N-3 · `canonicalTenantId('cco')` returns `'cco'`,** so
`tenantReadCandidates('cco')` returns `['cco']`. Requires a stored membership
whose tenant is `'cco'`; a client asking for `cco` gets 403. Same family as
P1-001/002 backlog **F-6**.

## 16. Backlog — preserved, not fixed

Direct thread-store malformed/missing tenant hardening (see N-1, N-2) · static
guard broadening · Fortnox / Hair TP alias hygiene · `ccoCommDraft` tenant issue ·
`ops.js` tenant issues · `qms.js` tenant issues · naming / photo-review tenant
headers · P1-001/002 F-1…F-8 · P1-005+.

Nothing in this list was touched. Scope was not expanded.

## 17. Production safety during this deploy `[VERIFIED]`

```
REAL CUSTOMER/PATIENT DATA ACCESSED   NO
REAL CUSTOMER/PATIENT DATA MUTATED    NO
CUSTOMER COMMUNICATION SENT           NO
ENVIRONMENT CHANGED                   NO
MIGRATION EXECUTED                    NO
ROLLBACK REQUIRED                     NO
```

Every production probe was unauthenticated, discarded its response body and
read only the status code. Isolation properties were proven against synthetic
fixtures in `/tmp` and against the artefact whose SHA is live, never by reading
a foreign tenant's data.

## 18. Verdict

```
FINAL VERDICT      PASS
P1-003 / P1-004    VERIFIED CLOSED
NEW BLOCKERS       NONE
```
