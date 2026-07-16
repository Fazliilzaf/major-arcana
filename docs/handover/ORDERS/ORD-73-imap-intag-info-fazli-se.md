# ORD-73 · IMAP-intag: info@fazli.se (one.com) — historik + löpande

**Status:** BYGGD (Claude 2026-07-13), väntar env-creds från ägaren
**Prio:** P1 · **Notion:** Order Inbox

## Ägar-beställning (ordagrant behov)

> "de flesta köpen som har gjorts online finns på info@fazli.se så vi behöver
> komma åt det mailet — ska vi inte göra någon koppling dit för vi kommer
> behöva komma åt det framöver?"

info@fazli.se ligger hos one.com — utanför klinikens M365-tenant (Graph:
ErrorInvalidUser). Vidarebefordran fångar bara framtida mail; historiska
onlineköp kräver riktig IMAP-koppling.

## Byggt

1. **`src/cm/cmImapSync.js`** — imapflow mot imap.one.com:993 (TLS, läs-only)
   + mailparser. UID-cursor i `cmStore.syncState(user,'imap-inbox')`;
   backfill från `CM_IMAP_SINCE` (default 2026-01-01), max 25 mail +
   AI-budget per körning → autopiloten betar av historiken i omgångar.
   Ekonomifilter (samma nyckelord som kvitto@), original → `cm/raw-mail/`
   (.eml, BFN 7 år), bilagor → `cm/receipts/` (pdf-parse/vision),
   dedupe på messageId. Fail-closed utan env.
2. **Route** `POST /api/v1/cm/imap-sync` (OWNER).
3. **Scheduler**: `cm_mail_sync`-jobbet kör IMAP-synken i samma 30-min-loop;
   ORD-70-statusraden visar "N från info@ (M kvar i historiken)".
4. **UI**: knappen "✉ Synka info@" i finance.html.
5. **Beroenden**: imapflow + mailparser (nya, prod).
6. **Tester**: 4 st med fixture-klient (fail-closed, ekonomifilter+belopp+
   cursor, PDF+dedupe, backlog-tak). 32/32 cm-tester gröna.

## Kvar hos ägaren (Claude rör aldrig lösenord)

1. Hämta/skapa IMAP-lösenordet för info@fazli.se i one.com:s kontrollpanel.
2. Render env (deploy, ej restart):
   - `CM_IMAP_ENABLED=true`
   - `CM_IMAP_USER=info@fazli.se`
   - `CM_IMAP_PASSWORD=<one.com-lösenordet>`
   - (valfritt) `CM_IMAP_SINCE=2026-01-01` — hur långt bak historiken hämtas
3. Klicka "✉ Synka info@" — verifiera att 8463-mailet blir kandidat.

## Design-lås

- Läs-only mot IMAP: inga flaggor, ingen radering, original bevaras.
- Beslut förblir mänskliga: intaget skapar kandidater, aldrig godkännanden.
- Lösenord endast i Render env — aldrig i kod, logg eller git.
