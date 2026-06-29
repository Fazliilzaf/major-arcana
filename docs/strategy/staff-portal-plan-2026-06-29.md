# Personalportal — Teknisk plan & informationsarkitektur
**Hair TP Clinic · Major Arcana**
Datum: 2026-06-29 · Status: Prototyp (read-only) klar · Fas 2 kräver beslut

---

## 1. Scope & avgränsningar

### Inkluderat
- Rollbaserade dashboards: sjuksköterska, läkare, admin/ägare
- Delegeringsdokument kopplade till enskild personal
- Kund-/patientkonversationer och bilder synliga för tilldelad personal
- Ordinationsunderlag som arbetsuppgift för legitimerad läkare (human-in-the-loop)
- QMS: checklistor (pre/postop), avvikelserapporter (OLS-3), handbok, audit trail
- RBAC, audit-logg, signatur/tidsstämpel per händelse
- Kunden ser **aldrig** vilken sjuksköterska som hanterar ärendet

### Explicit utanför scope
- AI ordinerar, godkänner behandling, tolkar medicinska bilder — **förbjudet**
- Automatisk statusändring på ordination — **förbjudet**
- Medicinsk dokumentation som ersätter journalsystem — **ej här**

---

## 2. Rollmodell (utökar befintlig RBAC)

Befintliga roller: `owner`, `operator`, `konsult`, `personal`, `revisor`

Personalportalen mappar befintliga roller med nya permissions:

| Roll i portal | CCO-roll | Nya permissions |
|--------------|---------|----------------|
| Sjuksköterska | `personal` | `delegation.read`, `ordination.view`, `qms.read` |
| Läkare | `konsult` | `ordination.view`, `ordination.approve`, `journal.read_any`, `qms.read` |
| Admin/Ägare | `owner` | alla ovanstående + `qms.write`, `staff.manage`, `audit.read` |

**Obs:** `ordination.approve` ges **aldrig** till `personal` — sjuksköterskor kan läsa
ordinationsstatusen på kundkortet men kan aldrig ändra den.

---

## 3. Nya datamodeller (SQLite-tabeller)

Alla tabeller läggs i `sqliteStore` under `ARCANA_STATE_ROOT`.

### `staff_tasks`
```sql
CREATE TABLE staff_tasks (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  assigned_to TEXT NOT NULL,  -- staffId (userId)
  role_hint   TEXT,           -- 'nurse' | 'doctor'
  kind        TEXT NOT NULL,  -- 'incoming_message' | 'ordination_review' | 'followup_image'
  status      TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'in_progress' | 'done'
  priority    TEXT DEFAULT 'normal',
  meta        TEXT,           -- JSON blob för extra info
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

### `ordination_reviews`
```sql
CREATE TABLE ordination_reviews (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL,
  customer_id      TEXT NOT NULL,
  treatment_type   TEXT NOT NULL,   -- 'DHI' | 'FUE' | 'PRP'
  treatment_detail TEXT,            -- JSON: antal graft, anestesi, etc.
  requested_by     TEXT NOT NULL,   -- staffId (admin som skapade)
  requested_at     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  -- status: 'pending' | 'approved' | 'rejected' | 'more_info_requested'
  -- SYSTEMET SÄTTER ALDRIG status='approved' automatiskt
  reviewed_by      TEXT,            -- läkarens staffId
  reviewed_at      TEXT,
  signature        TEXT,            -- e.g. 'DO-20260629-001'
  comment          TEXT,
  audit_ref        TEXT,            -- traceId i cco_audit_log
  general_ord_ref  TEXT,            -- dokumentId för allmän ordination
  individual_ord   TEXT             -- JSON om individuell avvikelse krävs
);
```

### `qms_checklist_completions`
```sql
CREATE TABLE qms_checklist_completions (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  checklist_kind TEXT NOT NULL,  -- 'pre_op' | 'post_op' | 'daily'
  item_key      TEXT NOT NULL,
  completed_by  TEXT NOT NULL,
  completed_at  TEXT NOT NULL,
  -- Immutable: rader raderas aldrig (audit trail)
  session_id    TEXT             -- operationsdatum/session-id
);
```

### `qms_deviations`
```sql
CREATE TABLE qms_deviations (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  kind         TEXT NOT NULL,   -- 'procedure' | 'equipment' | 'documentation' | 'other'
  description  TEXT NOT NULL,
  reported_by  TEXT NOT NULL,
  reported_at  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'under_review' | 'closed'
  resolution   TEXT,
  resolved_by  TEXT,
  resolved_at  TEXT,
  audit_ref    TEXT
);
```

### `staff_delegations`
```sql
CREATE TABLE staff_delegations (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  staff_id     TEXT NOT NULL,
  document_id  TEXT NOT NULL,   -- ref till document-catalog
  valid_from   TEXT NOT NULL,
  valid_until  TEXT NOT NULL,
  signed_by    TEXT NOT NULL,   -- ansvarig (läkare/owner)
  signed_at    TEXT NOT NULL,
  revoked_at   TEXT             -- NULL om aktiv
);
```

---

## 4. API-plan (fas 2)

Alla routes i `src/routes/staffPortal.js` (stubs finns, implementeras i fas 2).

| Method | Path | Permission | Beskrivning |
|--------|------|-----------|-------------|
| GET | `/staff-portal` | session | Serverar HTML-prototyp |
| GET | `/api/v1/staff/me` | any staff | Inloggad personal + roll |
| GET | `/api/v1/staff/tasks` | customers.read | Uppgifter för inloggad personal |
| GET | `/api/v1/staff/ordination-reviews` | ordination.view | Väntande ordinationer |
| POST | `/api/v1/staff/ordination-reviews/:id/approve` | ordination.approve | Manuellt godkännande (läkare) |
| POST | `/api/v1/staff/ordination-reviews/:id/reject` | ordination.approve | Manuellt avvisande (läkare) |
| GET | `/api/v1/staff/delegations` | delegation.read | Delegeringsdokument per personal |
| GET | `/api/v1/staff/qms/checklists` | qms.read | Aktiva checklistor |
| POST | `/api/v1/staff/qms/checklists/:id/complete-item` | qms.read | Markera checkpunkt klar |
| POST | `/api/v1/staff/qms/deviations` | qms.read | Ny avvikelserapport |
| GET | `/api/v1/staff/customer-threads/:cid` | mail.read | Konversationer (tilldelad personal) |

---

## 5. Säkerhetsarkitektur

### Human-in-the-loop (HITL) — obligatorisk

```
Admin skapar ordination_reviews-rad (status='pending')
         ↓
Läkare ser rad i dashboard (GET /ordination-reviews)
         ↓
Läkare läser dokument, bedömer manuellt
         ↓
Läkare POST:ar /approve eller /reject (kräver signatur + ordination.approve)
         ↓
Backend: uppdaterar status + skriver audit-logg med actor/ts/signatur
         ↓
Sjuksköterska ser "Godkänd av Dr. X" på kundkortet
```

**Systemet kan aldrig hoppa från pending → approved utan läkarens POST.**

### Kund-anonymitet mot personal
- `assigned_to` i `staff_tasks` visas **aldrig** i patient-API
- Kundkortet visar tilldelad personal för staff men inte för patienten
- GET `/customer-threads` filtrerar alltid på `assignedTo === req.session.userId`
  (undantag: `mail.read` + `owner/operator` kan se alla)

### Audit trail
Varje händelse → `ccoAudit.append({ kind, actor, entityId, detail })`:
- `ordination.approved` — actor=läkarens userId, detail: signatur, comment
- `ordination.rejected` — actor=läkarens userId, detail: comment
- `qms.checklist.item_completed` — actor, itemKey, customerId
- `qms.deviation.reported` — actor, kind, avvikelse-id
- `delegation.viewed` — actor, documentId

Audit-loggen är append-only och exponeras via `/api/v1/cco-audit` (befintlig).

---

## 6. Frontend-arkitektur

### Prototypen (fas 1 — klar)
`public/staff-portal.html` — komplett read-only prototyp, inline CSS/JS,
följer CCO warm-row designsystem. Rollväxlare för demo.

### Fas 2 — Live-implementation
Samma HTML-shell, JS byter till riktiga API-anrop:

```js
// Ersätt mock-data med:
const me = await fetch('/api/v1/staff/me').then(r => r.json());
const tasks = await fetch('/api/v1/staff/tasks').then(r => r.json());
```

Inga frameworks — vanilla JS + Fetch API, samma mönster som befintlig CCO.

---

## 7. Dokumentkatalog-integration

Befintliga dokument i `src/ops/hairtp-document-types.catalog.json` kopplas:

| Dokumenttyp | Portal-användning |
|------------|------------------|
| `haelso_tp_sve` / `health_tp_eng` | Visas på kundkort (staff-vy, signerad status) |
| `friskfoers_tp` | Visas på kundkort + i ordinationsunderlag |
| `offert_tp` / `offert_prp_hair` | Bakgrundsdokument i ordinationsunderlag |
| `kundkort_tp` | Kundkortsvy i portalen |
| Delegeringsdokument (ny kategori) | `staff_delegations`-tabell + dokumentkatalog |
| Allmän ordination TP/PRP | Referensdokument i ordinationsflödet |
| Individuell ordination | Skapas per patient vid avvikelse (mall finns) |

---

## 8. OLS / Kvalitetssäkring

### Checklistor
Tre typer definieras som JSON-templates (kan utökas av admin):
- `pre_op` — 7 punkter (hälsodekl., friskförsäkran, ordination, instrument, mm)
- `post_op` — 5 punkter (patient informerad, dokumentation klar, mm)
- `daily` — öppning/stängning av klinik

Completions sparas immutabelt i `qms_checklist_completions`.

### Avvikelserapporter (OLS-3)
All personal kan rapportera via portalen. Kategorier: procedur, utrustning,
dokumentation, övrigt. Ägare/operator stänger avvikelser med resolution.

### Handbok
Statisk referens — serveras som dokument från dokumentkatalogen.
Läsbar i portalen, redigeras av ägare utanför portalen.

---

## 9. Fas-plan

| Fas | Innehåll | Status |
|-----|---------|--------|
| **1 — Inventering & prototyp** | CCO-inventering, informationsarkitektur, read-only HTML-prototyp, RBAC-tillägg, API-stubs | ✅ Klar |
| **2 — Datamodell & API** | SQLite-tabeller, implementerade API-routes, audit-logg-koppling | Nästa |
| **3 — Live frontend** | Prototyp → live API-anrop, auth-gating, rollbaserad routing | |
| **4 — Dokumentkatalog-koppling** | Delegationer, ordinationsdokument, QMS-mallar | |
| **5 — QA & test** | Playwright E2E, audit trail-verifiering, RBAC-matrix-test | |

---

## 10. Vad kräver beslut innan fas 2

1. **Ny databas eller befintlig SQLite-fil?**
   Rekommendation: befintlig `sqliteStore` med ny `staff_portal`-prefix.

2. **Autentisering för personal**
   Idag: machine-tokens. Fas 2 behöver session-auth per person (email+lösen eller SSO).
   Befintlig `auth.js` + `authMiddleware.js` behöver utökas för personalinloggning.

3. **Vilka delegeringsdokument finns?**
   Behöver inventering av befintliga Word/PDF-delegationer för att bygga katalog.

4. **Ordinationsdokument-format**
   Allmän ordination och individuell ordination — finns som PDF/Word i SharePoint?
   Ska de importeras till CCO eller länkas?

5. **QMS-checklistors exakta innehåll**
   Vem fastställer pre_op/post_op-punkterna? Läkare + ägare bör godkänna listan.
