# ORDER #3 · B-sprint kickoff: Automation Registry dry-run + Smart Nästa Steg UI

**Created:** 2026-06-03
**Assignee:** cursor + claude
**Priority:** P1
**Status:** cursor-in-progress
**Blocked by:** ~~ORD-1~~ ~~ORD-2~~ — **GO B-sprint** (Fazli 2026-05-20)
**Notion:** https://app.notion.com/p/374060ccc15b81f898a9f11f74495f47

---

## Uppdrag

Bädda för kundresa-bygget (Fas A) genom att först synliggöra vad regelmotorn beräknar mot riktig data — utan att skriva något.

## Read-only — inga actions

Alla 10 signaler beräknas mot riktig customers-shell-data. UI visar dem som pills + dossier-sektion. **Inga knappar har real action.**

## Cursor (påbörjat)

- `src/ops/ccoAutomationRegistry.js`
- `src/ops/ccoAutomationRunner.js`
- `src/routes/ccoAutomationRoutes.js` (monterad via `ccoStaff`)
- `customers-shell?includeAutomation=1` → `automationSignals[]`
- `npm run cco:verify-smart-next-step-dry-run`
- **Env:** `ENABLE_AUTOMATION_RUNNER=true` på Render för prod dry-run

## Claude (väntar)

- Smart nästa steg i Kunder-dossier (UX-spec V2, disabled knappar)

## Gates

```bash
npm run cco:verify-smart-next-step-dry-run
npm run cco:verify-kunder-real-data
npm run cco:real-cco-gate
```

---

_Arcana Handover Protocol · uppdaterad 2026-05-20_
