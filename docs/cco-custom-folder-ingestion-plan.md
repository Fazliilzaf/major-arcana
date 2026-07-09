# CCO — Ingestion av custom-mappar ("mappar") + utökad brevlådetäckning

Status: DESIGN (avvaktar godkännande innan sync-kärnan rörs)
Kontext: PR #722 mergad. Ny branch `claude/hair-tp-staff-portal-kvzfxl` från main.

## Mål (från beställning)

Ta in resten av mailen från Microsoft in i CCO — **inkomna, skickade, utkast och
custom-mappar** — genom den befintliga pipelinen, utan att förstöra
"har-inte-svarat"-sektionen (väntar). Utrullning: **delade brevlådor först**, sen
personliga.

## Vad som redan finns (återbruk)

- Graph-hämtning av 4 well-known-mappar (inbox/sent/drafts/deleted), backfill + delta.
  `src/infra/microsoftGraphReadConnector.js` (`MAILBOX_TRUTH_FOLDER_SPECS` :981).
- Pipeline: källfilter → säkerhetsfilter → klassificering → matcha kund (Pipedrive)
  → triage → portal-nudge. `src/ops/ccoMailIngestion/pipeline.js`.
- Väntar-logik: `needsReply = lastInboundAt && (!lastOutboundAt || lastOutboundAt <
lastInboundAt)`. `src/ops/ccoMailboxTruthWorklistReadModel.js:1293`.
- Riktnings-inferens för icke-well-known-mappar finns redan (alias-jämförelse):
  `inferMailboxTruthDirection` :1153-1168.

## Gap mot målet

### A. Brevlådetäckning = CONFIG (Coworker deployer)

Prod-allowlist smalnat till `kons@` (`render.yaml`: `ARCANA_MAILBOX_ALLOWLIST`,
`ARCANA_SCHEDULER_CCO_HISTORY_MAILBOX_IDS`, `ARCANA_CCO_MAIL_INGESTION_DEFAULT_MAILBOX`).
Stegvis: delade först (`kons,info,contact,halso,marknad,kvitto`), sen `egzona,fazli`.
Ingen ny kod. Förbereds som render.yaml-diff, Coworker applicerar + kör backfill.

### B. Custom-mappar = NY KOD (byggs här)

1. **Mapp-discovery.** Ny Graph-enumerering `GET /users/{id}/mailFolders` (+ `childFolders`
   för nästlade). Well-known 4 behåller sin semantiska `folderType`; övriga → `folderType:'custom'`
   men bär med **folderId** + `displayName`. Hoppa (v1) över Junk. Ny funktion i
   `microsoftGraphReadConnector.js` bredvid `MAILBOX_TRUTH_FOLDER_SPECS`.

2. **folderType-modell.** Lägg till `'custom'` i:
   - `normalizeFolderType` (`src/infra/microsoftGraphMailboxTruth.js:66`) — collapsar idag okänt → 'unknown'.
   - `MAILBOX_FOLDER_TYPES` (`src/ops/ccoMailIngestion/constants.js:29`).
   - `enabledFolders`-grinden (`src/ops/ccoMailIngestion/pipeline.js:25`) — annars avvisas de
     som `folder_custom_disabled`.
   - Riktning för custom = befintlig alias-inferens (inbound om mottagare=brevlådan, outbound om avsändare=brevlådan).

3. **Delta-checkpoints per folderId (KRITISKT).** `toSyncCheckpointKey`/`toFolderKey`
   (`src/ops/ccoMailboxTruthStore.js:180-195`) nycklar på `mailboxId:folderType`. Custom-mappar
   måste nycklas på `mailboxId:custom:{folderId}` annars krockar deras delta-tokens. Litet men
   nödvändigt tillägg i store-keying + delta-loopen.

4. **Väntar-integration (PRODUKTBESLUT — se nedan).** Worklist-modellen listar bara
   `['inbox','sent','drafts','deleted']` (:1102). Om custom-mappar ska synas/påverka måste listan
   utökas.

## Öppet produktbeslut: ska custom-mappar påverka "väntar"?

- **Alt A (rek.):** Custom-mappar syns i **trådhistoriken** (hela konversationen), men driver
  INTE väntar-bucketing (väntar håller sig till inbox/sent). Motiv: om du flyttat ett mail till en
  "Arkiv/Klar"-mapp ska det inte återuppväcka eller snedvrida väntar-läget. Dedup-säkert.
- **Alt B:** Custom-mappar deltar fullt (alias-inferens matar lastInbound/lastOutbound). Risk: att
  flytta mail ändrar väntar-status oväntat.

## Dedup av flyttade mail

Flyttat mail = nytt Graph-id, samma `internetMessageId`. Truth-store nycklar på graphMessageId →
separat post, men grupperas rätt tråd via stabilt `conversationId`. Läs-tids-collapse dedupar på
Message-ID (`collapseDuplicateMessages`, `ccoConversation.js:711`). lastInbound/lastOutbound =
max(timestamp) så identiska kopior är ofarliga för väntar-tider. Verifieras med test.

## Föreslagen ordning (små PRs)

1. **PR1 (config-prep):** render.yaml-diff för stegvis brevlådeutrullning (Coworker deployer). Ingen kod.
2. **PR2 (kod):** Custom-mapp-discovery + folderType-modell + per-folderId checkpoints + pipeline-grind.
   Bakom flagga (`ARCANA_CCO_CUSTOM_FOLDER_INGEST`), default av. Unit-tester på keying/dedup/riktning.
3. **PR3 (kod):** Väntar-integration enligt valt alternativ (A/B). Test på väntar-parity.
