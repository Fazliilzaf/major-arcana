# ÄRENDE: Auto-intaget (CM mejl-import) brustet — misstänkt ENCRYPTION_KEY-regression

**Prioritet: hög — blockerar allt nytt kvitto-intag (Bolt/SJ/Loopia/Lufthansa-vidarebefordringar väntar).**
Skapat: 2026-08-30 ~17:20 · Rapporterat av: Kimi-sessionen (CFO/CM-underlagsräddningen)

## Symtom (verifierat mot prod 2026-08-30 17:14)

```
POST /api/v1/cm/mail-sync →
{
  "ok": false,
  "mailboxId": "kvitto@hairtpclinic.com",
  "folders": [
    { "folderType": "inbox",
      "error": "Graph read connector saknar delta-API (fetchMailboxTruthFolderDeltaPage)" },
    { "folderType": "custom",
      "error": "Cannot read properties of null (reading 'fetchAccessToken')" }
  ]
}
```

- CM records frysta på 1 664 (oförändrat sedan ~09:40, ingen ny månadstäckning).
- Mailbox-truth läsbar som vanligt (shards intakta, kvitto@ = 3 364 meddelanden) — problemet är INTE datan, det är connectorn.

## Misstanke

Regression från dagens ENCRYPTION_KEY-deploy (~10:00, genererad 64-hex på Render + deploy).

`graphReadConnector` aktiveras bara om tenantId/clientId/clientSecret/**userId** löses (server.js ~10353/10359: annars loggas "graphReadConnector inaktiv"). Om userId eller mailbox-tokens löses ur ett krypterat store som inte längre dekrypteras med den nya nyckeln → connector init failar tyst → CM-synken får null.

Tidslinjen passar: Bolt/Loopia jul–aug importerades fint före ~09:40; inget nytt efter deployen.

## Att kolla (i ordning)

1. Server-startloggen på Render: står det
   `[server] ARCANA_GRAPH_READ_ENABLED=true men saknar userId — graphReadConnector inaktiv`
   eller `...saknar tenantId/clientId/clientSecret`?
2. Om mailbox-tokens/userId lagras krypterade: dekrypteras de med nya ENCRYPTION_KEY? Gamla poster kan behöva om-krypteras, eller så behövs stöd för gammal+ny nyckel vid rotation (decrypt-with-old, encrypt-with-new).
3. Snabb verifiering efter fix: `POST /api/v1/cm/mail-sync` ska inte längre ge `fetchAccessToken null`.

## Konsekvens om ofixat

Vidarebefordrade kvittomejl (Bolt jan–maj ~30, SJ jan–maj ~9, Loopia ~10, Lufthansa ~8) landar i kvitto@ men importeras inte — exportgate kan inte öppnas. Allt annat i underlagskedjan (drop-import, repair, auto-approve) är opåverkat och live.
