# P1-001 / P1-002 — Conversation tenant truth

**Status: VERIFIED CLOSED** · closed 2026-09-06

Provenance is marked throughout. `[VERIFIED]` = reproduced from this repository
or measured against production by the Deploy Operator. `[RELAYED]` = reported by
another party and recorded, not re-derived here.

---

## 1. Findings

**P1-001 — conversation state was keyed under a non-tenant.** `req.tenantId` is
never set by auth (auth sets `req.auth.tenantId`), so every
`req.tenantId || defaultTenantId` expression in the conversation domain fell
through to `defaultTenantId` — and `server.js` passed the literal `'cco'` to
that router rather than `config.defaultTenantId`. All conversation state
(operational state, Klar/Senare, assignment, AI summary, sentiment, worklist,
dashboard, notes, reply/forward, staff portal, audit) was therefore keyed under
`'cco'`, which is not a tenant.

**P1-002 — no single tenant source.** The same value was derived independently
in several modules, each with its own fallback: `ccoAiThreadSummary` defaulted
to `'cco'`, `ccoCustomerComm` had `_tenantId || config?.defaultTenantId || 'cco'`,
and `ccoCustomerDossier` carried `'cco'` as a permanent dual-read candidate.
One fact, five opinions — the pattern this codebase keeps reproducing.

## 2. Canonical decision

`'cco'` is not a tenant and must never be used as a tenant key. Conversation
tenant comes from the authenticated membership tenant, canonicalised, with
`config.defaultTenantId` as the only (canonical) fallback when no trusted auth
context exists. Legacy `cco`-keyed data is handled by migration, not by
permanent dual-read.

## 3. History

| Step                          | Artefact                                         | Verdict                                 |
| ----------------------------- | ------------------------------------------------ | --------------------------------------- |
| Builder (DeepSeek) runtime    | `e86a428d09cbb695163ac5fe4c81fd92a200288c`       | Kimi **PASS_WITH_FINDINGS** `[RELAYED]` |
| B-MIG-1 / B-MIG-2 remediation | `cfc5689b315d5aa436a5350a9ea938a398b93dfb`       | Kimi narrow **PASS** `[RELAYED]`        |
| Controlled deploy             | merge `fe37363567c476999f490fa6e9f0d9f356b95bb0` | **PASS** `[VERIFIED]`                   |

B-MIG-1: `'cco'` must be rejected as a migration target in every spelling.
B-MIG-2: malformed rows must be preserved, never fabricated into valid records.

## 4. Integration `[VERIFIED]`

```
PRE-MERGE MAIN   6bc901a089dc110b8981424fd2497d48c3647d2f
REMEDIATION      cfc5689b315d5aa436a5350a9ea938a398b93dfb
                 (head of origin/p1-001-002-conversation-tenant-truth-builder)
MERGE SHA        fe37363567c476999f490fa6e9f0d9f356b95bb0
merge-base       6bc901a0  (= main head; branch sat directly on main)
conflicts        0
files            13  (+1112 / −24)
```

The branch contained `e86a428d` as an ancestor (verified with
`git merge-base --is-ancestor`), so the runtime fix and its remediation were
integrated as one chain. Method: clean `git worktree` from `origin/main`,
`merge --no-ff`, then `merge --ff-only` into the working copy after confirming
the trees were identical. Nothing recreated by hand.

## 5. Pre-deploy test gate `[VERIFIED]`

Run on Node v22.23.2 — the version production runs.

```
P1 tenant targeted              74/74
migration remediation           23/23
multi-tenant / security       253/253
conversation                  732/732
worklist / dashboard            84/84
check:syntax                   exit 0
lint:no-bypass                 exit 0
FULL REGRESSION            8489/8489   fail 0
new failures                       0
```

`tenantIdCanonical.test.js` did not fail. It is a known environment artefact —
it reads gitignored data files, so it fails in a fresh worktree and passes in a
working copy where those files exist.

## 6. The fix as deployed `[VERIFIED]`

A single canonical source, `src/tenant/conversationTenantResolver.js`:

```js
function resolveConversationTenant(req, fallbackTenantId = '') {
  const authenticated = canonicalTenantId(normalizeText(req?.auth?.tenantId));
  if (authenticated) return authenticated;
  return canonicalTenantId(normalizeText(fallbackTenantId)) || '';
}
```

Fifteen call sites in `ccoConversation.js` now route through it (16 occurrences
of the name, one of which is the import). The one line changed in `server.js`
is the root cause itself:

```diff
-      defaultTenantId: 'cco',
+      defaultTenantId: config.defaultTenantId,
```

`ccoAiThreadSummary` → `HAIR_TP_CANONICAL` + `canonicalTenantId`.
`ccoCustomerComm` → `canonicalTenantId(_tenantId) || config?.defaultTenantId`.
`ccoCustomerDossier` → `'cco'` removed from the active candidate list.

**No active `'cco'` literal remains** in the changed source. Two occurrences
survive and both were checked rather than assumed:

- `server.js:931  importedBy: actor.userId || 'cco'` — an audit **actor label**
  in journal annotation import, not a tenant. Pre-existing, untouched by P1.
- `ccoConversationTenantMigration.js:19  const LEGACY_TENANT = 'cco'` — the
  migration tool's **detection** constant, required by §12.

## 7. Client cannot control tenant `[VERIFIED]`

Measured, not read. Nine cases; zero client-controlled outcomes.

```
body.tenantId=curatiio          → hair-tp-clinic
query.tenantId=curatiio         → hair-tp-clinic
x-cco-tenant: curatiio          → hair-tp-clinic
x-tenant-id: curatiio           → hair-tp-clinic
req.tenantId=curatiio           → hair-tp-clinic
all four at once                → hair-tp-clinic
auth.tenantId=curatiio          → curatiio          (trusted source wins)
auth=hair-tp + body=curatiio    → hair-tp-clinic    (auth beats body)
no auth at all                  → hair-tp-clinic    (canonical default)
```

Against production, unauthenticated probes with each override returned `401` —
never `2xx`.

## 8. Deploy `[VERIFIED]`

```
EXPECTED SHA     fe37363567c476999f490fa6e9f0d9f356b95bb0
ACTUAL LIVE SHA  fe37363567c476999f490fa6e9f0d9f356b95bb0   MATCH
```

Read from `X-Arcana-UI-Build`. Health:

```
/healthz 200   /readyz 200   /admin 200   /staff-portal 200   /_diag/env 200
```

Conversation router mounted **and** gated — proven by a control that
distinguishes the two: unknown paths under `/api/v1/cco/runtime/` and
`/api/v1/cco-comm/` return `404`, real routes return `401`.

> **Correction, 2026-09-06 (P1-003/004 deploy).** The control above was measured
> on the coarse prefix. Measured one level deeper, an unknown path under
> `/api/v1/cco/runtime/conversation/` returns `401`, not `404` — auth runs
> before routing on that subtree. `/api/v1/cco-comm/` does return `404` and
> still carries the mounting claim. The mounting claim for the **conversation**
> router is therefore weaker than written here: the `401`s prove the gate, not
> the mount. See `P1-003-004-CLOSURE.md` §11.

## 9. Production canonical tenant `[VERIFIED]`

`ARCANA_DEFAULT_TENANT` is **unset** in production (`envSource: "unset"`), so
`config.defaultTenantId` falls back to `brand`, which defaults to
`'hair-tp-clinic'`. Measured with production's environment:

```
defaultTenantId  "hair-tp-clinic"     canonical: "hair-tp-clinic"     is cco? NO
```

## 10. Migration `[VERIFIED]`

```
LEGACY cco ROWS      NOT INDEPENDENTLY DETERMINABLE
CANONICAL ROWS       NOT INDEPENDENTLY DETERMINABLE
IDEMPOTENCY ROWS     NOT INDEPENDENTLY DETERMINABLE
MIGRATION REQUIRED   NO
MIGRATION EXECUTED   NO
```

Production conversation state lives under `ARCANA_STATE_ROOT=/var/data` on
Render. The Deploy Operator does not sign in to the hosting console, and no safe
diagnostic route exposes tenant counts — `/api/v1/_diag/{tenants,state,
conversation-state}` all return `404`. Builder reported 0 legacy rows, 3
canonical, 0 idempotency `[RELAYED]`; Kimi could not reproduce it, and neither
could this deploy.

Per the runbook: migration `--apply` is only permitted when a current read-only
inspection **proves** legacy rows exist. No such proof was obtainable, so no
migration was run. Nothing was mutated to make this ledger tidier.

## 11. Migration tool safety `[VERIFIED]` — six properties, each measured

Exercised against synthetic fixtures in `/tmp`. Production was never touched.

| Property                   | Evidence                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| dry-run is the default     | no `--apply` → `Mode: dry-run`, file byte-identical after                                                                          |
| `'cco'` rejected as target | `cco`, `CCO`, `cco`, `Cco` → `INVALID_TARGET_TENANT`, 0 migrated, file untouched                                                   |
| unknown target, no guess   | no `--target-tenant` and no mailbox evidence → 3 `UNRESOLVED`, 0 migrated                                                          |
| malformed rows preserved   | `cco:t4` (a string, not an object) → `INVALID (bevarad, ej migrerad)`, kept in place                                               |
| backup before write        | `--apply` wrote `s.json.bak-2026-09-06T17-48-57-505Z` before mutating                                                              |
| collision, no overwrite    | `cco:t3` → `hair-tp-clinic:t3` already existed → `COLLISION (hoppas över)`; the existing record compared byte-identical afterwards |

### A note on the instrument

The first fixture reported **0 legacy rows in a file built to contain six**. The
fixture was wrong, not the tool: `planConversationTenantMigration` expects
`{conversationStates, idempotencyRecords}`, not a flat map. Had that run been
reported as-is it would have read as "detection works, nothing to migrate" —
the most expensive kind of false green. Rebuilt to the real shape, detection
found 4 of 4.

## 12. Hair TP / Curatiio separation `[VERIFIED]`

```
KNOWN_TENANTS                    ["hair-tp-clinic","curatiio"]
curatiio membership       → curatiio         key: curatiio:trad-1
hair-tp membership        → hair-tp-clinic   key: hair-tp-clinic:trad-1
separated                 → YES
```

The Curatiio router remains unmounted; nothing was enabled in this deploy.

## 13. P0-003 regression `[VERIFIED]`

3376/3376 in the send-safety suite, and unauthenticated production probes on
`/conversation/:key/reply`, `/conversation/:key/action` and `/cco-comm/drafts`
all returned `401`. No real email, no environment flags enabled.

## 14. New observation — recorded, not fixed

**Legacy key detection is case- and whitespace-sensitive.** B-MIG-1 hardened the
migration _target_ against `CCO` / `cco` / `Cco`. Key detection was not
hardened — `splitConversationStateKey` compares `parts.tenant !== 'cco'`
exactly. Measured:

```
key "cco:t"     legacy-counted 1   migrated 1
key "CCO:t"     legacy-counted 0   migrated 0
key " cco :t"   legacy-counted 0   migrated 0
key "Cco:t"     legacy-counted 0   migrated 0
key "cco :t"    legacy-counted 0   migrated 0
```

Fail-safe, not fail-dangerous: an undetected key is skipped, never mis-migrated.
The risk is an _incomplete_ migration reported as complete — a run could print
`legacy 'cco': 0` while case-variant keys remain. This belongs to backlog **F-7
(colon prefix hardening)** and is deliberately not fixed here.

Related, same family: `canonicalTenantId('cco')` returns `'cco'` unchanged, so
the resolver would key under `'cco'` if an authenticated membership stored that
value. Not client-reachable — it requires a stored membership tenant — and
production's default is `hair-tp-clinic`. Belongs to backlog **F-6 (resolver
hardening)**.

## 15. Production safety during this deploy `[VERIFIED]`

```
REAL CUSTOMER/PATIENT DATA MUTATED   NO
CUSTOMER COMMUNICATION SENT          NO
ENVIRONMENT CHANGED                  NO
ROLLBACK REQUIRED                    NO
```

Production probes discarded response bodies and read status codes only.

## 16. Backlog — preserved, not fixed

F-1 Curatiio router enablement · F-2 client-driven tenant reads in other routes ·
F-3 duplicate conversation store instance · F-4 env-dependent tenant test ·
F-5 canonicalisation at every store caller · F-6 resolver hardening (see §14) ·
F-7 colon prefix hardening (see §14) · F-8 AI-summary fallback · P1-003.

## 17. Verdict

```
FINAL VERDICT      PASS
P1-001 / P1-002    VERIFIED CLOSED
NEW BLOCKERS       NONE
```
