# Microsoft 365 Activation Evidence (2026-02-27)

## Scope
Activation order: `ARCANA – ACTIVATE MICROSOFT 365 FULL TENANT (STAGING FIRST)`.

Hard rules respected:
- No patient channel activation
- No auto-send
- No mailbox mutation
- No full-body persist
- No attachment persist

## Service Targets
- Staging: `srv-d6gd8i94tr6s73dbb2ug` (`https://arcana-staging.onrender.com`)
- Production: `srv-d6b11o0boq4c73chm7f0` (`https://arcana-3pji.onrender.com`)

## 1) Deploy CCO Version to Staging
Status: **Done**

Evidence:
- Staging live deploy: `dep-d6ge96mr433s73erd5r0`
- Commit: `26fdf892d26316ffe7b9de619e345ae05a516da9`
- Message: `feat(cco): add CCO inbox agent bundle and gateway coverage tests`

Staging capability visibility (`GET /api/v1/capabilities/meta`):
- Capabilities: `GenerateTaskPlan`, `SummarizeIncidents`, `AnalyzeInbox`
- Agent bundles: `COO`, `CAO`, `CCO`

## 2) Azure / Entra Setup (Application Permissions)
Status: **Blocked (not executable from current repo/runtime context)**

Missing external evidence:
- App registration existence for `Arcana-Mail-Ingest`
- Application permissions (`Mail.Read`, `User.Read.All` if needed)
- Admin consent status
- Tenant ID / Client ID / Client Secret

No Azure credentials/session was available in this environment to create/verify Entra objects.

## 3) Set ENV in Staging
Status: **Partially done / Blocked for live ingest**

Current staging Graph env status:
- `ARCANA_GRAPH_READ_ENABLED`: set (`false`)
- `ARCANA_GRAPH_TENANT_ID`: missing
- `ARCANA_GRAPH_CLIENT_ID`: missing
- `ARCANA_GRAPH_CLIENT_SECRET`: missing
- `ARCANA_GRAPH_USER_ID`: missing

Why blocked:
- `src/routes/capabilities.js` enforces fail-fast at startup when `ARCANA_GRAPH_READ_ENABLED=true` and any required Graph credential is missing.

## 4) Runtime Verification in Staging
Status: **Partially done**

`POST /api/v1/agents/CCO/run` on staging:
- HTTP `200`
- `decision=allow`
- `mailboxCount=0`
- `messageCount=0`
- `subjects=[]`

Audit (`GET /api/v1/audit/events?limit=500`):
- `mailbox.read.start=0`
- `mailbox.read.complete=0`
- `mailbox.read.error=0`

Interpretation:
- CCO + AnalyzeInbox path is active in staging.
- Graph mailbox ingest is not active (kill-switch disabled + missing Graph creds).

## 5) Security Checks
Status: **Partially done**

Verified:
- Analysis persist path active (`/api/v1/agents/analysis?agent=CCO` returns entries with capability `CCO.InboxAnalysis`)
- Persist strategy is `analysis` (no template/mailbox write path used)
- No mailbox-read audit events when Graph read is disabled

Code/test evidence:
- `tests/capabilities/capabilityGateway.test.js`:
  - Graph hydrate start/complete events test
  - Graph error path test
  - Fail-fast test when Graph enabled without credentials
- `tests/privacy/inboxMasking.test.js`:
  - PII masking behavior

Pending for full live proof:
- Real mailbox pull (`mailbox.read.start/complete`) with valid credentials
- Runtime confirmation of masked subjects from live inbox

## 6) Load Test
Status: **Partially done**

Automated evidence:
- `tests/infra/microsoftGraphReadConnector.test.js` passed (windowing/read filters)
- `tests/capabilities/capabilityGateway.test.js` passed (Graph hydrate + error path)

Pending:
- Real staging load with multiple live mailboxes, pagination, and latency/timeout observation.

## 7) Promote to Production
Status: **Blocked by staging criteria**

Production current state:
- `GET /api/v1/capabilities/meta` shows only:
  - `GenerateTaskPlan`, `SummarizeIncidents`
  - agent bundles: `COO`, `CAO`
- `POST /api/v1/agents/CCO/run` returns `404` (`Agent saknas: CCO.`)
- Graph env keys are missing in production

Promotion not executed because staging has not met Graph-live criteria.

## 8) Post-Activation Evidence Summary
Status: **Created (blocked activation report)**

Collected evidence:
- Deploy proof (staging live commit)
- Meta proof (staging has AnalyzeInbox/CCO; production does not)
- Runtime proof (CCO route runs in staging, analysis persist only)
- Audit proof (no `mailbox.read.*` when Graph disabled)
- Test proof for Graph connector + masking + gateway enforcement

## Exact Blockers To Unblock Next
1. Provide/verify Azure Entra app registration and admin consent.
2. Set staging:
   - `ARCANA_GRAPH_READ_ENABLED=true`
   - `ARCANA_GRAPH_TENANT_ID`
   - `ARCANA_GRAPH_CLIENT_ID`
   - `ARCANA_GRAPH_CLIENT_SECRET`
   - `ARCANA_GRAPH_USER_ID`
3. Restart staging and rerun:
   - `POST /api/v1/agents/CCO/run`
   - `GET /api/v1/audit/events?limit=500`
   - `GET /api/v1/agents/analysis?agent=CCO&limit=3`
4. Require live proof:
   - `mailbox.read.start|complete` present
   - `mailboxCount > 0`
   - `messageCount > 0`
   - masked subjects only
   - no full body / no attachments persisted
5. Only then mirror env to production and repeat verification.

---

## Update (2026-02-27 10:05 UTC)

### Activation status
Status: **Graph read-only ingest activated in staging and production**

Completed:
- Entra values configured in runtime:
  - `ARCANA_GRAPH_TENANT_ID`: set
  - `ARCANA_GRAPH_CLIENT_ID`: set
  - `ARCANA_GRAPH_CLIENT_SECRET`: set
- Controlled limits configured in both services:
  - `ARCANA_GRAPH_FULL_TENANT=true`
  - `ARCANA_GRAPH_USER_SCOPE=all`
  - `ARCANA_GRAPH_MAX_USERS=50`
  - `ARCANA_GRAPH_MAX_MESSAGES_PER_USER=50`
  - `ARCANA_GRAPH_MAILBOX_TIMEOUT_MS=5000`
  - `ARCANA_GRAPH_RUN_TIMEOUT_MS=30000`
  - `ARCANA_GRAPH_MAX_MAILBOX_ERRORS=5`
- `ARCANA_GRAPH_READ_ENABLED=true` in staging and production.

Note about deployed branch behavior:
- Deployed runtime commit `26fdf892...` still enforces `ARCANA_GRAPH_USER_ID` at startup when Graph read is enabled.
- Therefore `ARCANA_GRAPH_USER_ID=fazli@hairtpclinic.com` is set in both staging and production to satisfy fail-fast.

### Staging evidence
- Service: `srv-d6gd8i94tr6s73dbb2ug`
- Live deploy with Graph enabled: `dep-d6gmes95pdvs73d5v81g`
- Startup log confirms successful boot after config:
  - `Auth bootstrap klart ... (staging-owner@hairtpclinic.com) password synced`
- Runtime verification (`POST /api/v1/agents/CCO/run` + audit query):
  - `mailbox.read.start`: present
  - `mailbox.read.complete`: present
  - `mailbox.read.error`: 0
  - sample metadata includes:
    - `conversationCount: 35`
    - `messageCount: 41`
    - `snapshotVersion: graph.inbox.snapshot.v1`

### Production evidence
- Service: `srv-d6b11o0boq4c73chm7f0`
- Production service branch updated to: `chore/cco-graph-isolated-20260226`
- Live deploy with CCO/AnalyzeInbox + Graph enabled: `dep-d6gmm4kr85hc7392m9vg`
- Runtime meta (`GET /api/v1/capabilities/meta`):
  - Capabilities: `GenerateTaskPlan`, `SummarizeIncidents`, `AnalyzeInbox`
  - Agents: `COO`, `CAO`, `CCO`
- Runtime verification (`POST /api/v1/agents/CCO/run` + audit query):
  - `mailbox.read.start`: present
  - `mailbox.read.complete`: present
  - `mailbox.read.error`: 0
  - sample metadata includes:
    - `conversationCount: 36`
    - `messageCount: 42`
    - `snapshotVersion: graph.inbox.snapshot.v1`

### Security and hard-rule checks
- No mailbox write paths were enabled.
- No send action was enabled.
- Read path remains Graph read-only.
- Persist target remains analysis path.

### Current remaining issue
- `POST /api/v1/agents/CCO/run` returns blocked decision on output for current policy/risk profile:
  - error text: `AnalyzeInbox blockerade agent-korning.`
- This is an enforcement behavior in gateway/policy/risk, not an ingest failure.
- Ingest proof is valid via `mailbox.read.start|complete` + non-zero conversation/message counts in audit metadata.

### Rotation follow-up (2026-02-27 10:41 UTC)
- Secret rotation change applied.
- Corrected production `ARCANA_GRAPH_CLIENT_ID` back to app id `13adfc91-69ab-4c35-ac80-b52ebba7e09f`.
- Updated `ARCANA_GRAPH_CLIENT_SECRET` to latest working value in both services.
- Token endpoint check now passes for both staging and production (`graph_token=OK`).
- Fresh production deploy after fix: `dep-d6gn7as50q8c73a6r3ng` (status `live`).
- Fresh production runtime evidence after fix:
  - `mailbox.read.start` present
  - `mailbox.read.complete` present
  - latest sample metadata: `conversationCount: 37`, `messageCount: 43`

Note:
- One earlier `mailbox.read.error` remains in recent audit window from pre-fix misconfiguration.
- Current latest run is successful (`mailbox.read.complete`) and confirms active Graph ingest.
