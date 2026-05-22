# AnalyzeInbox Snapshot Contract v1

## Purpose
This contract defines the required and optional `systemStateSnapshot` shape for capability `AnalyzeInbox`.
Goal: stable and deterministic inbox analysis, draft preparation, and policy-safe output generation.

## Version
- Contract: `AnalyzeInboxSnapshot.v1`
- Capability: `AnalyzeInbox@1.0.0`
- Persist strategy: `analysis`

## Input Envelope
`AnalyzeInbox` receives:
- `input`
- `systemStateSnapshot`
- runtime context (`tenantId`, `actor`, `channel`, `requestId`, `correlationId`)

This document only defines `systemStateSnapshot`.

## Snapshot Requirements
Top-level object:

```json
{
  "snapshotVersion": "inbox.snapshot.v1",
  "timestamps": {
    "capturedAt": "2026-02-26T12:00:00.000Z",
    "sourceGeneratedAt": "2026-02-26T11:59:59.000Z"
  },
  "conversations": []
}
```

Rules:
- `conversations`: optional array, defaults to `[]` if omitted.
- `timestamps.capturedAt`: strongly recommended ISO timestamp for freshness and debug evidence.
- `snapshotVersion`: recommended for traceability and schema migration.

## Conversation Object
Each conversation should contain:
- identity:
  - `conversationId` OR `threadId` OR `id`
- metadata:
  - `subject` or `title`
  - `status` (`open`/`closed` or source-native value)
  - `slaDeadlineAt` or `sla.deadline` (ISO timestamp)
  - `lastInboundAt` and `lastOutboundAt` (optional ISO timestamps)
  - `riskWords` (optional string array, max 20)
- messages:
  - `messages[]` with:
    - `messageId` or `id`
    - `direction`/`role`/`type` (normalized to `inbound|outbound|unknown`)
    - `sentAt`/`createdAt`/`ts` timestamp
    - `bodyPreview`/`preview`/`text`/`content`

## Normalization and Safety
`AnalyzeInbox` applies:
- subject sanitization:
  - diagnosis/guarantee language replaced with safe placeholders
- body preview masking:
  - links -> `[lank]`
  - emails -> `[email]`
  - phone numbers -> `[telefon]`
  - personal id-like values -> `[id]`
- direction normalization:
  - maps source terms to `inbound` or `outbound`

## Derived Classification Rules
For unresolved threads (latest inbound newer than latest outbound):
- `slaBreaches`:
  - include conversation when `slaDeadlineAt < now`
- `needsReplyToday`:
  - include when deadline is within 24h
  - OR unanswered inbound age >= 6h
  - OR risk flags detected
- `urgentConversations`:
  - include when SLA breached
  - OR high/critical risk flag
  - OR unanswered inbound age >= 24h

## Risk and Policy Enforcement
`AnalyzeInbox` contract flags:
- `requiresInputRisk = false`
- `requiresOutputRisk = true`
- `requiresPolicyFloor = true`

Execution gateway must evaluate:
- output risk score over full capability output
- policy floor over generated draft text

Blocked decisions must not persist output artifacts.

## Persist and Write Boundaries
- allowed: `analysis` persist in capability analysis store
- forbidden: mailbox write actions (`send`, `markAsRead`, `updateThread`) from `AnalyzeInbox`

## Debug Evidence
If `input.debug = true`, response metadata includes `snapshotDebug`:
- `keys`
- `counts`
- `fieldCounts`
- `timestamp`
- `sourceTimestamp`
- `snapshotVersion`

This debug envelope is for evidence and troubleshooting only.
