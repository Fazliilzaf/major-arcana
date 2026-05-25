# Notion ↔ MASTER-TODO sync-manifest

**Database:** [Major Arcana — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6)  
**Data source:** `collection://7e2211ad-1af3-4d10-9e73-9c330fdce0d0`  
**Repo-sanningskälla:** `docs/strategy/MASTER-TODO.md` (2026-05-25)  
**Prod:** https://arcana.hairtpclinic.se

Egenskaper i Notion: `Task` (title), `Status`, `Priority`, `Area`, `Owner`, `Notes`

Status-värden: `Done` | `In progress` | `Not started` | `Blocked`

---

## Befintliga sidor — uppdatera

| Task (Notion) | Page ID | Status | Notes (kort) |
|---------------|---------|--------|----------------|
| Drive-PDF på prod (Google Drive API) | `36a060cc-c15b-815d-a38d-ddb69e5e91d7` | **Done** | U3.1: API+stream prod. Index 56554/57558 driveFileId (98,3%). verify:migration-prod PASS. |
| Verify prod efter Render duplicate-cleanup | `36a060cc-c15b-8198-879e-ffd097165b4d` | **Done** | 7217 kunder, needsReview 0, verify:migration-prod PASS 2026-05-25. |
| Pipedrive People+Deals export | `36a060cc-c15b-8158-86c7-cb403c841807` | **Done** | Import prod: 3362 pipedriveLinked. UI+merge 1d15c0b. 273 unmatched by design. |
| MA-6.2 E2E pilot 5/5 prod | `36a060cc-c15b-81f5-8133-f064ab8abc8d` | **Done** | 5/5 PASS 2026-05-25 (E2E återställning efter journal-push). MA-B.3 + MA-C.2 + MA-D verifierade. |
| Rollback-plan + underhållsfönster dokumenterat | `36a060cc-c15b-819a-badb-c37d21878f16` | **Done** | auth-go-live-rollback-runbook.md. Produkt: se Underhållsfönster P2. |
| Underhållsfönster i produkt (P2) | `36a060cc-c15b-8175-a2ef-e48ce46f997d` | **Done** | GET /ops/maintenance-window 200 + STAFF-banner. Env ARCANA_MAINTENANCE_WINDOW_*. |
| Plan A valfritt: Resend patient-mail + bokning→journal | `36a060cc-c15b-8199-bdfc-c893d723d388` | **In progress** | Bokning→journal **Done** (J-6.3). Resend **Blocked** (RESEND_API_KEY saknas). |
| Mobil UX sweep #1–16 (kod + prod) | `36a060cc-c15b-81ef-b78a-d36a33abb1ac` | **Done** | verify:cco-mobile-pilot-prod PASS (retry vid 502). |
| Post-op Fas 1 — 4 beslut + Graph live + smoke | `36a060cc-c15b-812a-95f7-ff7a0c6847c2` | **Done** | U4.4–U4.6 PASS. verify:post-op-uppfoljning-prod. |
| Fas 5.6 — ≥2 personal, ≥5 konsultationer | `36a060cc-c15b-818da95ae17da7d16115` | **Not started** | U1.6/J-10.7 — fältpilot uppskjuten. Automation räcker för go-live. |
| Fas 5.5 — Android Chrome + iPad | `36a060cc-c15b-8109b433dbafa6475a86` | **Not started** | J-10.6 uppskjuten. |
| Minst en personal utbildad i /staff | `36a060cc-c15b-819aa4f1e3e6e69edb09` | **Not started** | U3.3 — externt/klinik. |

---

## Nya rader — skapa i databasen

| Task | Status | Area | Priority | Owner | Notes |
|------|--------|------|----------|-------|-------|
| J-6.3 Bokning → journal (prod) | Done | Booking | P1 | Agent | ccoJournalBookingBridge live. Plan A E2E PASS. |
| J-7 Påminnelser (scheduler + operatör-digest) | Done | Booking | P2 | Agent | cco_customer_reminders. Ej patient-SMS. |
| J-8 CCO-care (saknade formulär + draft-godkännande) | Done | Backlog | P1 | Agent | Scheduler + ops API + UI godkänn/avvisa. Ej full autonom agent. |
| U3.2 Drive enrich 98% (1004 kvar) | In progress | Infra | P1 | Agent | 56554/57558 driveFileId. Saknar Drive-koppling-etikett i UI. |
| U5A.4 Resend patient-mail | Blocked | Booking | P1 | Du | RESEND_API_KEY saknas. Kod klar. Se resend-domain-go-live.md. |
| U2.2 OWNER MFA enforced prod | In progress | Auth | P1 | Du | MFA kod klar. Prod env ARCANA_AUTH_OWNER_MFA_REQUIRED=false. |
| TL-B Tidslinje tillfälle (foto + flik) | Done | Pilot | P1 | Agent | syncConsultationPhotoToEncounter + Tidslinje-flik. |
| TL-C Journal per tillfälle (gruppering) | Done | Pilot | P2 | Agent | Journaltyper grupperade per tillfälle i UI (2026-05-25). |
| U6B CMO live connectors | Not started | Backlog | P2 | Agent | Fixture prod. LIVE_FETCH=false tills go-live. |
| U6C CAO admin-operator | Not started | Backlog | P2 | Agent | Plan finns. Ej prod-operator. |

### Nya rader skapade 2026-05-25 (MCP)

| Task | Page ID |
|------|---------|
| J-6.3 Bokning → journal (prod) | `36b060cc-c15b-81fd-9b49-fd9c1e782b77` |
| J-7 Påminnelser | `36b060cc-c15b-8159-abb7-e851ddd590dc` |
| J-8 CCO-care | `36b060cc-c15b-81f8-a9f5-dc3799074679` |
| TL-B Tidslinje | `36b060cc-c15b-81a9-ba33-c02fc78af40d` |
| TL-C Journal per tillfälle | `36b060cc-c15b-818f-9ee7-da690fe92205` |
| U3.2 Drive enrich | `36b060cc-c15b-81f6-8723-c7d337e114f0` |
| U5A.4 Resend | `36b060cc-c15b-8141-b6f2-eecd8a07c2f8` |
| U2.2 OWNER MFA | `36b060cc-c15b-8130-bcc4-cef2c99f1d1a` |

---

## ☐ i MASTER-TODO = lämna Not started / Blocked

- J-6.2 Egen engine (Cliento ut)
- U5B.3 Post-op auto-trigger Q4
- U6A (duplicerar J-8 — använd J-8-raden som Done, U6A = Not started för “full agent”)
- TL-C.1–C.4 (kod ☑ — synka Notion-raden TL-C → Done)
- BL.1–BL.4 backlog

---

## Verifiering efter sync

1. Notion-vy sorterad på Status → Done ska matcha ☑ i MASTER-TODO (~90 % av kärnspår).
2. Inga Done-rader utan motsvarande kod/verify i repo.
3. **Blocked** endast Resend (U5A.4).

---

## Sync-status

| Datum | Resultat | Evidens |
|-------|----------|---------|
| 2026-05-25 | **PASS (MCP)** | 9× `notion-update-page` + 8× `notion-create-pages` + rad Kundmaster §1 Done (`36b060cc-c15b-8155-9180-d41495f1988b`). |
| 2026-05-25 | **Deploy** | Git `09b7884` → prod. Kundmaster GDPR/spärr/merge dismiss live. |
| 2026-05-25 (tidigare) | BLOCKED (REST) | `NOTION_API_KEY` saknas i `.env` — REST-script ej kört; MCP räcker när Cursor Notion är kopplat. |

**REST (valfritt):** `npm run check:notion-sync-prereqs` → `npm run sync:notion-master-todo` om du vill synka utan MCP.

---

## Cursor / MCP

Om Notion-sync från agent misslyckas med **Unauthorized**: öppna Cursor → Settings → MCP → Notion → koppla om workspace, kör sedan:

> “Synka Notion Master TODO enligt docs/strategy/NOTION-SYNC-MANIFEST.md”

**2026-05-25 (agent):** Synk ej körd — ingen API-åtkomst. Lägg nyckel i `.env` (committa aldrig):

```bash
# notion.so/my-integrations → skapa integration → dela databasen "Major Arcana — Master TODO"
echo 'NOTION_API_KEY=secret_…' >> .env
npm run check:notion-sync-prereqs
npm run sync:notion-master-todo
```

**Alternativ (en åtgärd):** Cursor → Settings → MCP → Notion → **Connect** → skriv *"kör notion sync"* igen.
