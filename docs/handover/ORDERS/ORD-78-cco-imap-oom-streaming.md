# ORD-78 · INCIDENT: cco-imap-poller OOM — strömning före återaktivering

**Status:** PR FÖRBEREDD · **ÅTERAKTIVERING BLOCKERAD** tills RSS-gate grön  
**Repo:** major-arcana · **Prio:** P0 · **Byggare:** CURSOR  
**Notion:** [ORD-78](https://app.notion.com/p/3a0060ccc15b810795bbdfc69e7a337d)  
**OBS:** Separat från CM*IMAP*\* (Finance). Rör inte CM-flaggorna.

---

## Incident (2026-07-17)

- Instans-kraschloop (exit 143/OOM): RSS 3,4→4,2 GB på ~1 min.
- Rotorsak: `cco-imap-poller` mot `info@fazli.se` (~16k mail), poll var 3:e minut.
- Åtgärd live: `ARCANA_CCO_IMAP_ENABLED` + `POLL_ENABLED=false` → stabil.

## Inventering (check-before-code)

| Del                               | Finns? | Var                       | Gap                                           |
| --------------------------------- | ------ | ------------------------- | --------------------------------------------- |
| UID-cursor + max 25/cykel         | del    | `ccoImapMailboxSync.js`   | search använde `n:*` utan SINCE i cursor-läge |
| CM-mönster (25 + lastUid + SINCE) | hel    | `cmImapSync.js` ORD-74b   | återanvänd, duplicera inte                    |
| Poller                            | hel    | `ccoImapMailboxPoller.js` | defaultintervall 3 min för aggressivt         |
| Blueprint                         | del    | `render.yaml`             | hade `POLL_ENABLED=true`                      |

## Fix (denna order)

1. Stängt UID-fönster `lastUid+1 .. lastUid+N` (aldrig `n:*` / hela lådan).
2. SINCE följer med i cursor-läge (samma lärdom som CM ORD-74b).
3. `resolveUidBatch` capar batch + `remainingBacklog`; gap-skip avancerar cursor.
4. Source-/attachment-buffers nollas efter parse/cache.
5. Blueprint: `POLL_ENABLED=false`, intervall **30 min**, max **25**/cykel.
6. Config-default pollintervall: 30 min.

## Gate innan flaggor slås på

- [ ] Deploy med ORD-78-kod
- [ ] Minnestest: RSS stabil under backfill (scanned ≤ 25/cykel)
- [ ] Första prod: `POLL_INTERVAL ≥ 30`
- [ ] Claude/Fazli aktiverar `ARCANA_CCO_IMAP_*` — **inte** Cursor

## Filer

- `src/ops/ccoImapMailboxSync.js`
- `src/config.js`
- `render.yaml`
- `docs/runbook-cco-one-com-imap.md`
- `tests/ops/ccoImapMailboxSync.test.js`
