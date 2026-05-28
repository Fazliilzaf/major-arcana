---
owner: COO
status: active
section: ops
title: Semantisk sökning (embeddings)
description: Aktivera + underhålla semantisk RAG för kunskapsbasen
---

# Runbook — semantisk sökning (knowledge embeddings)

Kunskapslagret (`searchKnowledge`) kör **hybrid keyword + semantisk** sökning när
en embeddings-store finns och OpenAI-nyckel är satt. Utan något av det degraderar
det tyst till **keyword-only** — inget går sönder, sökningen blir bara grundare.

Detta gäller BÅDE adminsöket (`/api/v1/knowledge/search`) OCH agenternas
grounding (CAO/CMO-briefer m.fl.) — flippen aktiverar allt på en gång.

## Status

- `GET /api/v1/knowledge/embeddings/status` →
  `{ configured, mode: 'keyword'|'hybrid', stale, store }`.
- `configured` = OpenAI-nyckel satt. `mode: hybrid` = store finns och laddas.
- `stale: true` = en doc har ändrats efter att storen byggdes → bygg om.

## Aktivera (engångs)

1. **Sätt nyckeln i Render** (tjänsten `major-arcana`):
   - `OPENAI_API_KEY=<din nyckel>`
   - `ARCANA_AI_PROVIDER=openai` (default när nyckel finns).
2. **Bygg storen** (kostar OpenAI-tokens en gång):

   ```bash
   npm run build:knowledge-embeddings          # kräver OPENAI_API_KEY
   # eller, säkert i deploy: bygg bara om vid behov
   npm run embeddings:ensure
   ```

   Storen skrivs till `data/knowledge-embeddings.json` (prod: på data-disken,
   gitignorerad — den hör hemma i runtime, inte i repot).

3. **Verifiera:** `GET /api/v1/knowledge/embeddings/status` → `mode: 'hybrid'`,
   `stale: false`. Adminsökets statusrad visar då `RAG: hybrid`.

## Uppskatta omfång utan att spendera

```bash
npm run build:knowledge-embeddings -- --dry-run
# DRY-RUN: N dokument → M chunks, ~T tokens (est). Inget OpenAI-anrop.
```

## Underhåll

- **Efter att docs ändrats:** storen blir `stale`. Kör `npm run embeddings:ensure`
  (bygger bara om när den saknas/är inaktuell — säker att lägga i post-deploy).
- **Byt modell:** `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`),
  bygg sedan om storen.
- **Rulla tillbaka till keyword-only:** ta bort `data/knowledge-embeddings.json`
  (eller avsätt nyckeln). Sökningen fortsätter fungera, bara keyword.

## Felsökning

- `mode: 'keyword'` trots satt nyckel → storen är inte byggd. Kör buildern.
- `stale: true` som inte försvinner → kontrollera att build-steget kör på samma
  disk som runtime läser (`data/knowledge-embeddings.json`).
- Build kraschar på `OPENAI_API_KEY saknas` → nyckeln finns inte i miljön där
  scriptet kör.
