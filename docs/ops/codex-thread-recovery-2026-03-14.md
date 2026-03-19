# Codex Thread Recovery 2026-03-14

## Broken thread

- Thread ID: `019cd9a8-aa16-7570-90d5-e7537044649d`
- Session file: `/Users/fazlikrasniqi/.codex/sessions/2026/03/10/rollout-2026-03-10T22-30-35-019cd9a8-aa16-7570-90d5-e7537044649d.jsonl`
- Local size observed on 2026-03-14: about `21G`
- Stored `tokens_used` for the thread: about `606,939,178`

## Why it crashes

The thread is too large for Codex Desktop to hydrate safely. The app reports `SIGKILL`, which matches a resource kill rather than a normal turn error. The thread should be treated as a broken local session artifact, not as the source of truth for continuing the work.

## Safe continuation source

The thread itself is broken, so the safe source of truth is the repository and the CCO shell files, not the crashed UI session.

## Correct recovered workstream

The active workstream is the CCO desktop mail-client shell with the Major Arcana overlay.

Key evidence in the repo:

- `AGENTS.md` contains the active CCO Major Arcana overlay spec and mail-client skeleton lock.
- `public/styles/cco-major-arcana-skin.css` exists.
- `public/styles/cco-major-arcana-skin-tokens.css` exists.
- `public/styles/cco-density-rebuild-final.css` contains `data-cco-skin="major-arcana"` rules.
- `public/admin.html` and `public/admin.js` are the live shell entry points.
- `docs/ops/evidence/` contains multiple CCO Major Arcana screenshots and pass logs.

## Files to resume from

- `/Users/fazlikrasniqi/Desktop/Arcana/public/admin.html`
- `/Users/fazlikrasniqi/Desktop/Arcana/public/admin.js`
- `/Users/fazlikrasniqi/Desktop/Arcana/public/styles/cco-major-arcana-skin.css`
- `/Users/fazlikrasniqi/Desktop/Arcana/public/styles/cco-major-arcana-skin-tokens.css`
- `/Users/fazlikrasniqi/Desktop/Arcana/public/styles/cco-density-rebuild-final.css`
- `/Users/fazlikrasniqi/Desktop/Arcana/docs/major-arcana-color-inventory.md`
- `/Users/fazlikrasniqi/Desktop/Arcana/docs/major-arcana-color-palette.png`

## Relevant recent history

Recent CCO shell commits affecting the resume path:

- `b809d8b` Sanitize CCO top shell and worklist header
- `66ea4e5` Sanitize CCO header and worklist top
- `345fa76` Recover CCO history and reply workspace
- `520a418` Tighten CCO inbox density
- `47cb437` Restore stable CCO base for shell pass
- `0871493` Rebuild CCO workspace into 3-column mail client
- `2d3bda0` Align major arcana shell to locked token spec

## Resume instruction

If the broken thread is unavailable, continue from the CCO Major Arcana shell files above. Do not reopen the 21G thread unless the goal is forensic recovery only.
