# CCO: One.com IMAP for Info Fazli

This runbook connects `info@fazli.se` to CCO Konversationer as a read-only
external mailbox. It is separate from Finance's `CM_IMAP_*` integration and
does not enable sending through One.com.

## ORD-78 gate (OOM 2026-07-17)

Do **not** re-enable polling until after deploy of the streaming/UID-window fix:

1. `ARCANA_CCO_IMAP_ENABLED` / `ARCANA_CCO_IMAP_POLL_ENABLED` stay **false** in
   prod until RSS is stable under a controlled backfill.
2. First reactivation: `ARCANA_CCO_IMAP_POLL_INTERVAL_MINUTES=30` (or higher).
3. Confirm each cycle logs `scanned ≤ 25` and rising `lastUid` / falling
   `remainingBacklog` — never a jump that implies full-mailbox fetch.
4. CM*IMAP*\* must not be touched (Finance intake is separate and healthy).

## Render variables

Set the following on the Arcana service **after** ORD-78 is deployed and the
gate above is green:

```env
ARCANA_CCO_IMAP_ENABLED=true
ARCANA_CCO_IMAP_HOST=imap.one.com
ARCANA_CCO_IMAP_PORT=993
ARCANA_CCO_IMAP_USER=info@fazli.se
ARCANA_CCO_IMAP_PASSWORD=<One.com password for info@fazli.se>
ARCANA_CCO_IMAP_SINCE=2026-01-01
ARCANA_CCO_IMAP_FOLDERS=inbox,sent
ARCANA_CCO_IMAP_MAX_MESSAGES_PER_CYCLE=25
ARCANA_CCO_IMAP_POLL_ENABLED=true
ARCANA_CCO_IMAP_POLL_INTERVAL_MINUTES=30
```

`ARCANA_CCO_IMAP_PASSWORD` must be set as a separate secret. CCO never reads
or falls back to `CM_IMAP_PASSWORD`.

Blueprint defaults keep `ARCANA_CCO_IMAP_POLL_ENABLED=false` so a restart
cannot silently re-arm the poller before owner verification.

One.com's sent folder defaults to `Sent`. If the first sync reports a missing
sent folder, set its actual IMAP name with:

```env
ARCANA_CCO_IMAP_SENT_FOLDER=<actual One.com sent folder name>
```

## Expected result

After the service restarts with flags enabled, `Info Fazli` appears in CCO's
mailbox chooser. Each folder is bounded to 25 messages per cycle via a closed
UID window (`lastUid+1 .. lastUid+N`) plus SINCE, with a persisted cursor.
CCO stores capped HTML, inline `cid:` images, and attachment bytes in its
existing local truth and asset stores; it does not fetch mail live when a
thread is opened.

## Safety

- IMAP is TLS on port 993 and read-only.
- CCO does not move, mark read, delete, or send messages through One.com.
- Disable immediately by setting `ARCANA_CCO_IMAP_ENABLED=false` and
  `ARCANA_CCO_IMAP_POLL_ENABLED=false`.
