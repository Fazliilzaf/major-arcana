# CCO Activation Evidence (2026-02-27)

## Scope
- Disable MFA requirement for admin login during build phase.
- Activate CCO inbox flow in production and staging.
- Activate CCO send route path (manual send) and verify gateway/audit path.

## Code changes
- Commit `a2f6f21`
  - `src/config.js`: added `AUTH_MFA_ENABLED` config (default `false`).
  - `server.js`: pass `mfaEnabled` into auth router.
  - `src/routes/auth.js`: enforce MFA only when `mfaEnabled=true`.
- Commit `4da0549`
  - `src/capabilities/executionService.js`: support wildcard mailbox allowlist entry (`*`) for CCO send.

## Environment activation
Updated for both services:
- `srv-d6b11o0boq4c73chm7f0` (production)
- `srv-d6gd8i94tr6s73dbb2ug` (staging)

Set:
- `AUTH_MFA_ENABLED=false`
- `ARCANA_GRAPH_SEND_ENABLED=true`
- `ARCANA_GRAPH_SEND_ALLOWLIST=*`
- `ARCANA_BOOTSTRAP_RESET_OWNER_PASSWORD=false`

Both services restarted and redeployed to `live`.

## Runtime verification
### Login
- Production: `requiresMfa=false`, token issued.
- Staging: `requiresMfa=false`, token issued.

### CCO run
- Production: `POST /api/v1/agents/CCO/run` => `200`, `decision=allow`, `mailboxCount=22`, `messageCount=71`, `suggestedDrafts=5`.
- Staging: same result.

### CCO send path
- `POST /api/v1/cco/send` now passes auth + gateway path.
- Current block reason in production audit:
  - `gateway.run.decision` with `errorStage=persist`
  - `errorMessage="Microsoft Graph reply failed (403): Access is denied. Check credentials and try again."`
- This confirms send path is active, but Graph app lacks required send permission.

## Graph token role check
Decoded app token roles:
- `Mail.Read`
- `User.Read.All`

Missing role:
- `Mail.Send` (required for Graph reply/send)

## Remaining external blocker
- Azure Entra app needs **Application permission `Mail.Send`** + **Admin consent granted**.
- After consent is granted, manual send in `/api/v1/cco/send` can complete.
