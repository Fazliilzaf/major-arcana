# Notion ↔ MASTER-TODO sync-manifest

**Database:** [Major Arcana — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6)  
**Data source:** `collection://7e2211ad-1af3-4d10-9e73-9c330fdce0d0`  
**Repo-sanningskälla:** `docs/strategy/MASTER-TODO.md` (2026-05-25 DEL 6 paritet)  
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
| Plan A valfritt: Resend patient-mail + bokning→journal | `36a060cc-c15b-8199-bdfc-c893d723d388` | **Done** | J-6.3 + U5A.4 ☑: Render `RESEND_API_KEY`, domän verified, transactional-probe `provider:resend` live 2026-05-25. |
| Mobil UX sweep #1–16 (kod + prod) | `36a060cc-c15b-81ef-b78a-d36a33abb1ac` | **Done** | verify:cco-mobile-pilot-prod PASS (retry vid 502). |
| Post-op Fas 1 — 4 beslut + Graph live + smoke | `36a060cc-c15b-812a-95f7-ff7a0c6847c2` | **Done** | U4.4–U4.6 PASS. verify:post-op-uppfoljning-prod. |
| Fas 5.6 — ≥2 personal, ≥5 konsultationer | `36a060cc-c15b-818da95ae17da7d16115` | **Not started** | U1.6/J-10.7 — fältpilot uppskjuten. Automation räcker för go-live. |
| Fas 5.5 — Android Chrome + iPad | `36a060cc-c15b-8109b433dbafa6475a86` | **In progress** | BL.3 Playwright Pixel 5 ☑ (`verify:android-staff-prod`). Fysisk enhet + iPad kvar. |
| Minst en personal utbildad i /staff | `36a060cc-c15b-819aa4f1e3e6e69edb09` | **Not started** | U3.3 — externt/klinik. |

---

## Nya rader — skapa i databasen

| Task | Status | Area | Priority | Owner | Notes |
|------|--------|------|----------|-------|-------|
| J-6.3 Bokning → journal (prod) | Done | Booking | P1 | Agent | ccoJournalBookingBridge live. Plan A E2E PASS. |
| J-7 Påminnelser (scheduler + operatör-digest) | Done | Booking | P2 | Agent | verify:cco-care-sweep-prod CC-11 PASS 2026-05-25. |
| J-8 CCO-care (saknade formulär + draft-godkännande) | Done | Backlog | P1 | Agent | J-8.1–8.2 ☑ prod. CC-06 UI + CC-09/10/11 PASS. |
| U3.2 Drive enrich 99% (570 utan match) | Done | Infra | P1 | Agent | 56988/57558 driveFileId. Push --index-only 2026-05-25. Se page `36b060cc-c15b-81f6-8723-c7d337e114f0`. |
| U5A.4 Resend patient-mail | Done | Booking | P1 | Agent | Render `RESEND_API_KEY` + domän verified + OWNER transactional-probe live 2026-05-25. |
| U2.2 OWNER MFA enforced prod | In progress | Auth | P1 | Du | Prod: ARCANA_AUTH_OWNER_MFA_REQUIRED=false. apply:auth-go-live-prod vid go-live. |
| TL-B Tidslinje tillfälle (foto + flik) | Done | Pilot | P1 | Agent | syncConsultationPhotoToEncounter + Tidslinje-flik. |
| TL-C Journal per tillfälle (gruppering) | Done | Pilot | P2 | Agent | Journaltyper grupperade per tillfälle i UI (2026-05-25). |
| U6B CMO live connectors | Not started | Backlog | P2 | Agent | Fixture prod. LIVE_FETCH=false tills go-live. |
| U6C CAO admin-operator | Not started | Backlog | P2 | Agent | Plan finns. Ej prod-operator. |
| BL.3 Android Playwright (Pixel 5) | Done | Infra | P2 | Agent | verify:android-staff-prod + test:visual:mobile:android. |

### Nya rader skapade 2026-05-25 (MCP)

| Task | Page ID |
|------|---------|
| J-6.3 Bokning → journal (prod) | `36b060cc-c15b-81fd-9b49-fd9c1e782b77` |
| J-7 Påminnelser | `36b060cc-c15b-8159-abb7-e851ddd590dc` |
| J-8 CCO-care | `36b060cc-c15b-81f8-a9f5-dc3799074679` |
| TL-B Tidslinje | `36b060cc-c15b-81a9-ba33-c02fc78af40d` |
| TL-C Journal per tillfälle | `36b060cc-c15b-8138-bf21-c680e8466e29` *(ersätter ogiltig `818f-9ee7`)* |
| U3.2 Drive enrich | `36b060cc-c15b-81f6-8723-c7d337e114f0` |
| U5A.4 Resend | `36b060cc-c15b-8141-b6f2-eecd8a07c2f8` |
| U2.2 OWNER MFA | `36b060cc-c15b-8130-bcc4-cef2c99f1d1a` |

### Paket A — skapade 2026-05-25 (MCP agent-sweep)

| Task | Page ID |
|------|---------|
| J-9.1 Retention 10 år | `36a060cc-c15b-8199-a309-c3a6ce527782` |
| J-9.4 Art. 30 + PUB | `36b060cc-c15b-8141-907d-e7624882d1b5` |
| J-10.3 Prod smoke staff + mobil | `36a060cc-c15b-8190-9146-e82094a5a6ed` |
| TL-D.2 Arkiv-segment | `36b060cc-c15b-81f0-94f2-ec4909066dd7` |
| BL.3 Android Playwright | `36b060cc-c15b-8104-8b25-fab750c15b6a` | **Done** | verify:android-staff-prod (Pixel 5 shell/login/tabs). |

---

## ☐ i MASTER-TODO = lämna Not started / Blocked

- J-6.2 Egen engine (Cliento ut)
- U5B.3 Post-op auto-trigger Q4
- U6A full agent (J-8 ☑ — full autonom agent kvar)
- U2.2 MFA (Notion = In progress tills enforced prod)
- BL.1, BL.4–BL.5 backlog
- BL.3 Android Playwright ☑ (2026-05-25)

---

## DEL 6 — Full paritet Cliento + Meridiq (2026-05-25 MCP)

**Referensrad:** [DEL 6 — Full paritet Cliento + Meridiq (referens)](https://www.notion.so/36b060ccc15b81a8b513fad39fd12d02) · Page ID `36b060cc-c15b-81a8-b513-fad39fd12d02`

**169 delpunkter** (P6.1.1 → P6.18.6) skapade i databasen. Filtrera: Task börjar med `P6.` eller Notes innehåller `DEL 6`.

| Område | Antal | Status-fördelning |
|--------|-------|-------------------|
| Pilot | 52 | Done + Not started |
| Booking | 38 | Done + Not started |
| Compliance | 19 | Done + Not started |
| Backlog | 35 | Done + Not started |
| Infra | 13 | Done + In progress + Not started |
| Auth | 6 | In progress + Not started |
| Referens | 1 | In progress |

**Exempel page IDs:**

| Task | Page ID |
|------|---------|
| P6.1.1 Kundmaster | `36b060cc-c15b-8172-9e8e-f87f99dffdfa` |
| P6.18.6 U6A–U6D | `36b060cc-c15b-81de-a099-d2475562a7ec` |

---

## Verifiering efter sync

1. Notion-vy sorterad på Status → Done ska matcha ☑ i MASTER-TODO (~95 % kärnspår).
2. Inga Done-rader utan motsvarande kod/verify i repo.
3. **In progress:** U2.2 MFA.
4. **Not started:** U5B.3 Q4, U6B–D, BL.4–BL.5.
5. **Done (senaste svep):** BL.3 Android Playwright · U5A.4 Resend · Plan A 3 tjänster.

---

## Sync-status

| Datum | Resultat | Evidens |
|-------|----------|---------|
| 2026-05-25 | **PASS (DEL 6 svep)** | 169× `notion-create-pages` P6.1.1–P6.18.6 + referensrad. MASTER-TODO DEL 6. |
| 2026-05-25 | **PASS (BL.3 svep)** | Android Playwright: mobilePlaywrightDevices + verify:android-staff-prod + playwright.android.config. MASTER-TODO BL.3 ☑. |
| 2026-05-25 | **PASS (MCP agent-sweep)** | 5× update (U5A.4 Blocked→Done, U3.2 In progress→Done, Underhållsfönster notes, J-7/J-8→Not started) + 5× create (J-9.1, J-9.4, J-10.3, TL-C, TL-D.2). TL-C page ID korrigerad. |
| 2026-05-25 | **Doc-sync svep** | MASTER-TODO: J-7/U5B.1–2 ☑, J-8.1 ☑, J-8.2 ~, U2.2 ~. `verify:cco-care-sweep-prod` (CC-06 UI fail). |
| 2026-05-25 | **PASS (MCP)** | 9× `notion-update-page` + 8× `notion-create-pages` + rad Kundmaster §1 Done (`36b060cc-c15b-8155-9180-d41495f1988b`). |
| 2026-05-25 | **Deploy** | Git `09b7884` → prod. Kundmaster GDPR/spärr/merge dismiss live. |
| 2026-05-25 (tidigare) | BLOCKED (REST) | `NOTION_API_KEY` saknas i `.env` — REST-script ej kört; MCP räcker när Cursor Notion är kopplat. |

**REST (valfritt):** `npm run check:notion-sync-prereqs` → `npm run sync:notion-master-todo` om du vill synka utan MCP.

---

## Cursor / MCP

Om Notion-sync från agent misslyckas med **Unauthorized**: öppna Cursor → Settings → MCP → Notion → koppla om workspace, kör sedan:

> “Synka Notion Master TODO enligt docs/strategy/NOTION-SYNC-MANIFEST.md”

**2026-05-25 (doc-sync):** MASTER-TODO avbockad mot prod-audit. J-7/U5B backend ☑. J-8.2 UI kvar (CC-06). Notion MCP: J-8 In progress, U2.2 In progress.

**2026-05-25 (tidigare agent):** Synk ej körd — ingen API-åtkomst. Lägg nyckel i `.env` (committa aldrig):

```bash
# notion.so/my-integrations → skapa integration → dela databasen "Major Arcana — Master TODO"
echo 'NOTION_API_KEY=secret_…' >> .env
npm run check:notion-sync-prereqs
npm run sync:notion-master-todo
```

**Alternativ (en åtgärd):** Cursor → Settings → MCP → Notion → **Connect** → skriv *"kör notion sync"* igen.
