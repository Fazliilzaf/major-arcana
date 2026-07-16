# CCO: One.com IMAP for Info Fazli

This runbook connects `info@fazli.se` to CCO Konversationer as a read-only
external mailbox. It is separate from Finance's `CM_IMAP_*` integration and
does not enable sending through One.com.

## Render variables

Set the following on the Arcana service after the CCO IMAP change has been
deployed:

```env
ARCANA_CCO_IMAP_ENABLED=true
ARCANA_CCO_IMAP_HOST=imap.one.com
ARCANA_CCO_IMAP_PORT=993
ARCANA_CCO_IMAP_USER=info@fazli.se
ARCANA_CCO_IMAP_PASSWORD=<One.com password for info@fazli.se>
ARCANA_CCO_IMAP_SINCE=2026-01-01
ARCANA_CCO_IMAP_FOLDERS=inbox,sent
ARCANA_CCO_IMAP_POLL_ENABLED=true
ARCANA_CCO_IMAP_POLL_INTERVAL_MINUTES=3
```

`ARCANA_CCO_IMAP_PASSWORD` must be set as a separate secret. CCO never reads
or falls back to `CM_IMAP_PASSWORD`.

One.com's sent folder defaults to `Sent`. If the first sync reports a missing
sent folder, set its actual IMAP name with:

```env
ARCANA_CCO_IMAP_SENT_FOLDER=<actual One.com sent folder name>
```

## Expected result

After the service restarts, `Info Fazli` appears in CCO's mailbox chooser. The
first CCO cycle begins after two minutes, then runs every three minutes. Each
folder is bounded to 25 messages per cycle and uses a UID cursor. CCO stores
HTML, inline `cid:` images, and attachment bytes in its existing local truth
and asset stores; it does not fetch mail live when a thread is opened.

## Safety

- IMAP is TLS on port 993 and read-only.
- CCO does not move, mark read, delete, or send messages through One.com.
- Disable immediately by setting `ARCANA_CCO_IMAP_ENABLED=false`.
