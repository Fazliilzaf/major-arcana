# ORD-64 · CM-pipeline härdning (delta-sync, bilagor, original, rotation)

**Status:** BYGGD (Claude 2026-07-12, denna PR) · **Beställare:** Fazli (svep-GO 2026-07-12)
**Bakgrund:** `CFO-CM-NULAGE-OCH-PLAN-2026-07-12.md` §2 + §4.1. Fynd vid bygget: gamla
`cmMailSync` anropade `graphReadConnector.listMessages(...)` — **metoden finns inte** i
`microsoftGraphReadConnector` → mail-syncen har aldrig kunnat köra mot riktiga connectorn.

## Byggt

1. **Äkta delta-sync:** `cmMailSync` omskriven på `fetchMailboxTruthFolderDeltaPage`
   (samma API som truth-storen). Delta-cursor (`deltaLink`) persisteras per mailbox+folderType
   i `cmStore.syncState`. `GRAPH_DELTA_TOKEN_INVALID` → cursor nollställs + omstart utan cursor.
   Max 3 sidor/körning (bounded).
2. **Bilagor:** `hasAttachments` → attachment-lista via Graph (`$select=id,name,contentType,size,isInline`),
   PDF/bild (≤10 MB, ej inline) hämtas via `fetchMessageAttachmentContent` →
   `ccoSecureStorage.putObject` under `cm/receipts/YYYY-MM/…` → `cmStore.createDocument`
   (storagePath=storageKey, fileHash=checksum).
3. **Original (BFN 7 år):** hela Graph-meddelande-JSON:et sparas till secure storage
   (`cm/raw-mail/YYYY-MM/<id>.json`) innan processning. Raderas aldrig.
4. **Extraktion:** PDF → `pdf-parse`-text → AI · bild → vision · annars body-text.
   Kostnadstak: `CM_MAX_EXTRACT_PER_SYNC` (default 10) extraktioner/körning.
5. **Processing ledger:** varje item får ledger-rad (processorVersion=2, filterVersion=1,
   status/attempts/error) — reprocess-underlag enligt CEM-specen.
6. **Rotationsskydd (crashloop-lärdomen):** `cmStore.persist()` roterar när `rawItems` > 2000
   eller `auditEvents` > 5000 → äldsta raderna appendas till `<store>.archive-YYYYMM.jsonl`
   (läses ALDRIG vid boot). Bounded fil = bounded boot-parse.

## Medvetet EJ med (senare beslut)

- Custom-mappar (Fakturor/Kvitton) — delta-API:t stödjer wellknown-folders; v1 kör `inbox`.
- Schemalagd körning — jobbet registreras INTE i scheduler ännu (allowlist-läget är ägar-styrt);
  manuell `POST /api/v1/cm/mail-sync` tills ägaren öppnar jobbet.
- OCR-policy: extraktion går till OpenAI (gpt-4o-mini) som tidigare — policybeslut §7.2 i nulägesdoc.

## Forbidden

Journal/feed/forms orörda · ingen mailbox-write (read-only Graph) · original raderas aldrig.

## Gates

`npm run check:syntax` · `npm run lint:no-bypass` · `node --test tests/cm/`
