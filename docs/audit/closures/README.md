# Canonical closure ledger

This directory is the **single source of truth** for closed security and
change-control findings in Major Arcana. A finding is not closed because a
chat says it is closed; it is closed when there is a record here.

## The ledger

| ID               | Finding                                                  | Status              | Closed     | Record                                                 |
| ---------------- | -------------------------------------------------------- | ------------------- | ---------- | ------------------------------------------------------ |
| P0-001 / ORD-224 | Remote auth bypass via client-controlled locality        | **VERIFIED CLOSED** | 2026-09-05 | [ORD-224-P0-001-CLOSURE.md](ORD-224-P0-001-CLOSURE.md) |
| P0-002 / ORD-238 | Booking write authorization + cross-tenant conflict leak | **VERIFIED CLOSED** | 2026-09-05 | [ORD-238-P0-002-CLOSURE.md](ORD-238-P0-002-CLOSURE.md) |
| P0-003           | _(scope held in Control Room)_                           | LOCKED              | —          | —                                                      |
| P0-004           | _(scope held in Control Room)_                           | LOCKED              | —          | —                                                      |

## Why this exists

P0-001 was implemented, independently red-teamed, merged, deployed and
smoke-tested in production — and then nearly lost, because the evidence lived
only in chat transcripts. That is a change-control gap, not a security gap.
Reconstructing an incident from scrollback is expensive and the reconstruction
is not trustworthy.

A closure record exists so the next agent does not have to reconstruct it.

## What a closure record must contain

- finding
- root cause
- Builder commit
- Red Team verdict
- merge SHA
- live SHA at deploy
- production smoke evidence
- residual backlog
- closure date
- source / evidence notes

## Two rules that make these records worth reading

**1. Mark provenance.** Separate what was reproduced from the repository
(`[VERIFIED]`) from what another party reported (`[RELAYED]`). A future reader
must be able to tell which claims they can re-check in seconds and which would
require re-running an audit. Flattening the two makes the whole document as
weak as its weakest claim.

**2. Prefer a command to a sentence.** Where a claim can be settled by running
something — a commit exists, a merge has these parents, a file is unchanged —
record the command and its output rather than the conclusion alone. Sentences
go stale silently; commands can be re-run.

## Not a closure ledger

- `docs/security/pentest-latest.md` — external vendor review evidence. Related
  but separate; do not merge the two.
