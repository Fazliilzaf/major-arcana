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
- `ARCANA_GRAPH_USER_ID` (target mailbox UPN or objectId)
- `ARCANA_GRAPH_WINDOW_DAYS` (default `14`)
- `ARCANA_GRAPH_MAX_MESSAGES` (default `100`)

## Connector Implementation (Read-Only)
- Module: `src/infra/microsoftGraphReadConnector.js`
- Public API:
  - `createMicrosoftGraphReadConnector(config)`
  - `fetchInboxSnapshot(options)`
- Request flow:
  1. OAuth2 client credentials token request.
  2. `GET /users/{userId}/mailFolders/inbox/messages`
  3. Filter: `receivedDateTime ge <now - 14d>` (default).
  4. Optional include read messages.
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

## Audit Requirements (next step)
When wired into runtime routes/jobs, add explicit audit events:
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
- Connector implemented and wired for `POST /api/v1/capabilities/AnalyzeInbox/run`.
- Snapshot hydrate path uses Graph read-only fetch when `systemStateSnapshot.conversations` is not provided.
- `mailbox.read.start`, `mailbox.read.complete`, `mailbox.read.error` audit events are emitted.
- No mailbox write path exists in this block.
