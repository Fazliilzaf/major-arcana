---
owner: Arkitektur
status: active
---

# Kunskapsbas per Tenant — RAG Architecture Design

Version: 1.0
Datum: 2026-05-14
Status: UTKAST

---

## 1. Nuläge

### Vad som redan finns

| Komponent | Fil | Status |
|-----------|-----|--------|
| Knowledge retriever | `src/knowledge/retriever.js` | ✅ Chunkar + söker i markdown/text-filer |
| Knowledge per brand | `knowledge/hair-tp-clinic/`, `knowledge/curatiio/` | ✅ Mappar finns |
| Site ingest | `scripts/ingest-site.js` | ✅ Crawlar webbsida → markdown |
| Mail ingest | `scripts/ingest-mails.js` | ✅ mbox/eml/json → anonymiserade insikter |
| Chat knowledge lookup | `src/routes/chat.js` | ✅ Retriever används i patientchatt |

### Vad som saknas (gap 10.8)

| Gap | Beskrivning |
|-----|-------------|
| Versionering | Knowledge-filer versioneras inte per tenant separat |
| Tenant-isolerad sökning | Retrievern söker per brand, inte per tenant-config |
| Strukturerad metadata | Ingen maskinläsbar metadata per kunskapsdokument |
| RAG med embeddings | Sökning är keyword-baserad, inte semantisk |
| Admin-UI för knowledge | Ingen vy för att se/redigera kunskapsbasen |
| Automatisk uppdatering | Ingen scheduler för knowledge refresh |

---

## 2. Arkitektur

### 2.1 Knowledge Document Model

```javascript
{
  documentId: "kd_<uuid>",
  tenantId: "hair-tp-clinic",
  source: "site_ingest | mail_ingest | manual | api",
  category: "treatment | pricing | faq | aftercare | policy | general",
  title: "Hårtransplantation DHI — Vad du behöver veta",
  content: "...",
  contentHash: "sha256:...",
  language: "sv",
  metadata: {
    sourceUrl: "https://hairtpclinic.se/dhi",
    author: "Fazli Krasniqi",
    medicalReviewer: null,
    lastVerifiedAt: "2026-05-14T00:00:00Z",
  },
  chunks: [
    {
      chunkId: "kc_<uuid>",
      text: "DHI-metoden innebär...",
      tokenCount: 180,
      position: 0,
    }
  ],
  createdAt: "2026-05-14T00:00:00Z",
  updatedAt: "2026-05-14T00:00:00Z",
  version: 1,
}
```

### 2.2 Retrieval Pipeline

```
Query (patient/agent/operator)
  → Tenant-scoped filter
  → Keyword search (current retriever.js)
  → [Future: embedding similarity search]
  → Re-rank by relevance + recency
  → Top-K chunks (default 5)
  → Context window assembly
  → AI prompt injection
```

### 2.3 Storage Options

| Option | Pros | Cons | Rekommendation |
|--------|------|------|----------------|
| **JSON on disk** (nuvarande) | Enkelt, gratis, fungerar | Inte skalbart, ingen semantisk sökning | ✅ Fas 1 |
| **SQLite** | Lokalt, snabbt, FTS5 | Kräver migration | Fas 2 |
| **Supabase/Postgres + pgvector** | Full RAG, embedding-sökning | Extern dependency, kostnad | Fas 3 |

---

## 3. Implementation — Fas 1 (JSON + förbättrad retriever)

### 3.1 Tenant-isolerad knowledge store

```javascript
// src/knowledge/tenantKnowledgeStore.js
{
  listDocuments({ tenantId, category, limit }),
  getDocument({ tenantId, documentId }),
  upsertDocument({ tenantId, document }),
  deleteDocument({ tenantId, documentId }),
  search({ tenantId, query, maxResults, category }),
}
```

### 3.2 Knowledge API endpoints

| Method | Endpoint | Beskrivning |
|--------|----------|-------------|
| GET | `/api/v1/knowledge/documents` | Lista kunskapsdokument (OWNER/STAFF) |
| GET | `/api/v1/knowledge/documents/:id` | Hämta dokument |
| POST | `/api/v1/knowledge/documents` | Skapa/uppdatera dokument (OWNER) |
| DELETE | `/api/v1/knowledge/documents/:id` | Radera dokument (OWNER) |
| POST | `/api/v1/knowledge/search` | Sök i kunskapsbasen (OWNER/STAFF) |
| POST | `/api/v1/knowledge/ingest` | Importera från URL/fil (OWNER) |

### 3.3 Integration med agenter

| Agent | Knowledge-användning |
|-------|---------------------|
| Patient | Hämtar relevant kunskap för chattvar |
| CAO | Jämför mall-content mot kunskapsbas för consistency |
| CMO | Identifierar content-gap mellan kunskapsbas och artiklar |
| COO | Inkluderar knowledge-health i daily brief |

---

## 4. Implementation — Fas 2 (FTS + metadata)

- SQLite med FTS5 full-text search
- Metadata-indexering (category, language, updatedAt)
- Chunk-level sökning istället för dokument-level
- Token-counting per chunk för context window management

---

## 5. Implementation — Fas 3 (Embeddings + RAG)

- Embedding-generering via OpenAI text-embedding-3-small
- Vector store (pgvector eller Pinecone)
- Hybrid search: keyword + semantic similarity
- Context window optimization (max tokens budget)
- Retrieval quality metrics i monitor

---

## 6. Knowledge Lifecycle

```
Ingest → Chunk → Index → Search → Serve → Monitor → Refresh
```

| Steg | Trigger | Ansvarig |
|------|---------|----------|
| **Ingest** | Manual / scheduler / API | OWNER |
| **Chunk** | Automatisk vid ingest | System |
| **Index** | Automatisk vid chunk | System |
| **Search** | Patient query / agent run | System |
| **Serve** | Chat response / agent output | System |
| **Monitor** | Scheduler (knowledge freshness) | COO agent |
| **Refresh** | Manuell eller schemalagd re-crawl | OWNER |

---

## Relaterade filer

- `src/knowledge/retriever.js` — Befintlig retriever
- `knowledge/` — Knowledge-filer per brand
- `scripts/ingest-site.js` — Site crawler
- `scripts/ingest-mails.js` — Mail ingest
- `src/routes/chat.js` — Patientchatt med knowledge lookup
