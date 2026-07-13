# ORD-68 · CM: kombinerad extraktion + reprocess

**Status:** BYGGD (Claude 2026-07-13) · **Beställare:** Fazli ("agenten måste läsa själva
mail-innehållet, inte bara PDF-filer, annars problem framöver")

## Byggt

1. **Kombinerad extraktion (v3):** ämne + mailtext + PDF-text skickas i SAMMA AI-anrop
   (`buildCombinedText`). Tidigare valdes EN källa — belopp i mailtexten tappades när PDF
   fanns och tvärtom (rotorsaken till "missing total amount"-kandidaterna). Bild-kvitton
   utan PDF går fortsatt vision-vägen.
2. **Strukturbevarande HTML→text:** tabellrader/stycken blir egna rader (`<td>` → ` | `,
   `</tr>` → radbrytning) så belopp behåller sitt sammanhang i HTML-mail.
3. **Reprocess:** `POST /api/v1/cm/reprocess` + knappen **"⟳ Läs om oprocessade"** i
   finance.html — läser om rawItems utan expense-record, hämtar bilagor i efterhand
   (löser de 19 kvitto@-mail som synkades före ORD-67f) och kör om extraktionen.
   Ledger spårar varje försök (processorVersion 3).
4. `expenseRecords.rawItemId` — spårbar koppling raw→record (reprocess-dedupe).

## Forbidden

Original raderas aldrig · read-only Graph · AI-budget (`CM_MAX_EXTRACT_PER_SYNC`) gäller
även reprocess · patientdata aldrig till extern AI (policy 2026-07-13).

## Gates

`node --test tests/cm/` (21 tester) · check:syntax · prod-UAT: reprocess mot kvitto@:s
gamla mail → kandidater med belopp ur bilagor.
