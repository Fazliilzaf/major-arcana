# Microsoft Graph Read-Only Prep (2026-02-26)

## Scope
- Prepare Graph ingest for CCO (`AnalyzeInbox`) with read-only access.
- No send/update/delete operations.
- No persist outside capability `analysis` store.

## App Registration Checklist
1. Create Azure App Registration: `arcana-cco-inbox-read`.
2. Single tenant app (clinic tenant).
3. Add application permissions:
   - `Mail.Read`
   - `User.Read.All` (only if mailbox lookup by UPN/objectId is required)
4. Do not add write permissions:
   - `Mail.Send` (forbidden in this phase)
   - `Mail.ReadWrite` (forbidden in this phase)
5. Grant admin consent.
6. Create secret/certificate and store in secret manager.

## Required Environment Variables
- `ARCANA_GRAPH_TENANT_ID`
- `ARCANA_GRAPH_CLIENT_ID`
- `ARCANA_GRAPH_CLIENT_SECRET`
- `ARCANA_GRAPH_USER_ID` (target mailbox UPN or objectId; required when `ARCANA_GRAPH_FULL_TENANT=false` or `ARCANA_GRAPH_USER_SCOPE=single`)
- `ARCANA_GRAPH_FULL_TENANT` (`true|false`, default `false`)
- `ARCANA_GRAPH_USER_SCOPE` (`single|all`, default `single`)
- `ARCANA_GRAPH_MAILBOX_INDEXES` (optional, full-tenant indexfilter 1-baserad lista)
- `ARCANA_GRAPH_MAILBOX_IDS` (optional, full-tenant explicit filter med mailboxId/UPN)
- `ARCANA_GRAPH_MAX_USERS` (default `50`, only used when full-tenant mode is active)
- `ARCANA_GRAPH_MAX_MESSAGES_PER_USER` (default `50`, only used when full-tenant mode is active)
- `ARCANA_GRAPH_MAILBOX_TIMEOUT_MS` (default `5000`)
- `ARCANA_GRAPH_RUN_TIMEOUT_MS` (default `30000`)
- `ARCANA_GRAPH_MAX_MAILBOX_ERRORS` (default `5`)
- `ARCANA_GRAPH_REQUEST_MAX_RETRIES` (default `2`)
- `ARCANA_GRAPH_RETRY_BASE_DELAY_MS` (default `500`)
- `ARCANA_GRAPH_RETRY_MAX_DELAY_MS` (default `5000`)
- `ARCANA_GRAPH_PAGINATION_MAX_PAGES` (default `200`)
- `ARCANA_GRAPH_WINDOW_DAYS` (default `14`)
- `ARCANA_GRAPH_MAX_MESSAGES` (default `100`)

## Connector Implementation (Read-Only)
- Module: `src/infra/microsoftGraphReadConnector.js`
- Public API:
  - `createMicrosoftGraphReadConnector(config)`
  - `fetchInboxSnapshot(options)`
- Request flow:
  1. OAuth2 client credentials token request.
  2. Single mailbox mode:
     - `GET /users/{userId}/mailFolders/inbox/messages`
  3. Full tenant mode (`ARCANA_GRAPH_FULL_TENANT=true` + `ARCANA_GRAPH_USER_SCOPE=all`):
     - `GET /users?$select=id,mail,userPrincipalName&$top=<maxUsers>`
     - `GET /users/{id}/mailFolders/inbox/messages?...` for each user
  4. Filter: `receivedDateTime ge <now - 14d>` (default).
  5. Optional include read messages.
- Guardrails:
  - Stop on `@odata.nextLink` (pagination not yet implemented).
  - Stop on rate-limit (`429`).
  - Stop on per-mailbox timeout.
  - Abort run when mailbox error budget is exceeded.
- Output:
  - `systemStateSnapshot`-compatible envelope:
    - `snapshotVersion = graph.inbox.snapshot.v1`
    - `timestamps.capturedAt`
    - `conversations[]`
    - `metadata`

## PII Masking Before Persist
- Utility: `src/privacy/inboxMasking.js`
- Masks:
  - URLs -> `[lank]`
  - emails -> `[email]`
  - phones -> `[telefon]`
  - id-like values -> `[id]`
- Applied during Graph message normalization before snapshot output.

## Audit Requirements (runtime)
Runtime routes emit explicit mailbox read audit events:
- `mailbox.read.start`
- `mailbox.read.complete`
- `mailbox.read.error`

Each event should include:
- `tenantId`
- `actorUserId` (service principal or runtime actor)
- `mailboxUserId`
- `windowDays`
- `messageCount`
- `correlationId`

## Current State
- Connector implemented and wired for:
  - `POST /api/v1/capabilities/AnalyzeInbox/run`
  - `POST /api/v1/agents/CCO/run` (agent hydration path delegates to AnalyzeInbox hydrate)
- Snapshot hydrate path uses Graph read-only fetch when `systemStateSnapshot.conversations` is not provided.
- `mailbox.read.start`, `mailbox.read.complete`, `mailbox.read.error` audit events are emitted.
- No mailbox write path exists in this block.
