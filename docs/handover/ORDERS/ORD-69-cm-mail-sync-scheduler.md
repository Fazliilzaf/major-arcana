# ORD-69 · CM: schemalagt kvitto@-intag (cm_mail_sync)

**Status:** BYGGD (Claude 2026-07-13) · **Beställare:** Fazli ("allt detta ska ske
automatiskt utan att jag trycker på knappar")

## Byggt

Scheduler-jobbet **`cm_mail_sync`** (var 30:e minut, `ARCANA_SCHEDULER_CM_MAIL_SYNC_INTERVAL_MINUTES`):

1. Delta-sync mot kvitto@ (`CM_MAIL_ACCOUNT` överrider) — nya mail in.
2. Reprocess (limit 10) — mail utan kandidat läses om, bilagor hämtas i efterhand.
3. Lazy deps-holder i server.js (CM-storen monteras efter schedulern) — jobbet
   `skipped: cm_deps_missing` tills mounten är klar, aldrig krasch.

## Automatiskt vs manuellt (design, ändras inte utan ägar-beslut)

| Automatiskt (jobbet) | Manuellt (människa) |
|---|---|
| Hämta mail + bilagor · arkivera original (BFN) · AI-läsa → KANDIDATER | →CFO-promote · godkänna · exportera · Fortnox-write |

Kostnadstak: AI-budget per körning (`CM_MAX_EXTRACT_PER_SYNC`, default 10).
Knapparna i finance.html finns kvar för behovskörning.

## Gates

check:syntax · scheduler-status visar `cm_mail_sync` efter deploy · nästa körning ger
kandidater utan knapptryck.
