# CFO + CM — Nuläge & plan framåt

**Datum:** 2026-07-12 · **Författare:** Claude (Cowork) på beställning av Fazli
**Metod:** statuskoder mot faktisk kod (CCO-BUILD-RULES #1). Genomläst: `src/cfo/` (22 filer),
`src/cm/` (3 filer + `src/routes/cm.js`), `server.js` (CF-routes ~rad 2128 ff, CM-mount ~11328),
`public/finance*.html`, `tests/cfo|cf/`, alla `CHIEF-OF-FINANCE-*`- och `CEM-`-docs, Fortnox-runbook
(iCloud), incident 2026-07-10, ORD-58/58b (repo + Notion), CEO-tjänsteinventering 2026-07-10,
MASTER-TODO / STATUS-OVERSIKT / Notion Master TODO + Order Inbox, `git status` (2026-07-12).
**Fil skapad ocommittad** — committa där den hör hemma, aldrig `git add -A`.

---

## 0 · TL;DR

|                  |                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CFO**          | Långt kommen: CF.2–CF.9 levererade som `src/cfo/*` + 3 UI-sidor + tester. **ORD-58b mergad (#826) + prod-verifierad 22:56**: latens FIXAD (1,3 s varm, från 11 s) — men revenue/AOV fortfarande null → kvar: Fortnox OAuth-state i prod-storen. |
| **CM**           | Backend-skelett DONE, men **6 hårda gap mot CEM-specen**: ingen delta-sync, inga bilagor, inget originalarkiv (BFN 7 år), ingen egen UI, 0 tester, ingen schemaläggning.                                                                        |
| **Strukturfynd** | CM och CFO har **två parallella expense-livscykler** (approve/export ×2). Konsolidera: CM = intagsmotor, CFO = enda livscykeln.                                                                                                                 |
| **Stabilitet**   | `cmStore` har samma monolitiska JSON-mönster som kraschade prod 2026-07-10. Åtgärda **innan** mail-sync skarpläggs.                                                                                                                             |
| **Styrning**     | CFO/CM finns inte i MASTER-TODO / STATUS-OVERSIKT / Notion-areor. iCloud `04 · CFO` tom, `06 · CM` = 1 fil. CFO-docs från 06-01 beskriver läget före leverans.                                                                                  |

---

## 1 · CFO — nuläge (verifierat mot kod 2026-07-12)

| Yta                     | Status                 | Evidens                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stores/motorer          | **DONE**               | `src/cfo/` 22 moduler: expense + rules + VAT + vendors + recurring + receipt + review/packager + reportEngine + monthlyClose + billingDraft + Fortnox-svit (client/connector/store/lister/patientSync/paidPeriodTotals/tenantResolve)                           |
| Expense-livscykel       | **DONE**               | `cfoExpenseStore`: `new → needs_review → categorized → approved → ready_for_export → exported / rejected`, secureStorage-bilagor (SHA256), audit `cf.expense.*`, Fortnox-hook-fält                                                                              |
| UI                      | **DONE**               | `finance.html` (1 267 rader, CF.2–CF.7-markörer) · `finance-reports.html` · `finance-review.html` (revisor)                                                                                                                                                     |
| Tester                  | **DONE (delvis)**      | `tests/cfo/` 9 filer + `tests/cf/financeReportsSmoke.js` (inkl. 2 nya via ORD-58b, mergade i #826)                                                                                                                                                              |
| Routes                  | **DONE men fel plats** | `/api/v1/cco-cf/*` ligger inline i **frysta** `server.js` (~2128 ff) — bryter mot ORGANISATION §4-riktningen                                                                                                                                                    |
| Fortnox READ            | **LIVE (nästan)**      | OAuth ansluten under tenant `hair_tp`; ORD-58b-fix (`cfoFortnoxTenantResolve`) löser alias `hair_tp` ↔ `hair-tp-clinic` + 10 min period-cache mot latens >8 s                                                                                                   |
| Fortnox WRITE (voucher) | **MISSING**            | CF.9-wiring ~4h enligt roadmap — förutsätter verifierad OAuth via ORD-58b-UAT                                                                                                                                                                                   |
| In flight               | **→**                  | ORD-58 fas 1 mergad (#824); ORD-58b mergad (#826). **Prod-verify 2026-07-12 22:56: 4/7** — readyz/status/latens(1 298 ms varm)/source=live PASS · revenueSek + AOV **null** → rotorsak = OAuth-state i `cfoFortnoxStore` prod (Render Shell), ej tenant-aliaset |

**Inaktuellt:** `CHIEF-OF-FINANCE-INVENTORY-2026-06-01.md` säger "Finance UI-vy: 0" och docs
refererar `src/ops/cco*`-namn — koden heter idag `src/cfo/cfo*`. Läs 06-01-filerna som historik.

---

## 2 · CM — nuläge mot CEM-specen

Källa: `CEM-corporate-expense-management.md` (styrande) vs `src/cm/` + `src/routes/cm.js` (20 endpoints).

| Krav (CEM)                       | Status      | Detalj                                                                                                                                        |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Datamodell, statusar, flaggor    | **DONE**    | `cmStore` speglar specen: 20 statusar, 8+15+8 flaggor, rawItems/documents/expenseRecords/ledger/audit/suppliers                               |
| Import→extraktion→record         | **DONE**    | `/cm/process` full pipeline; auto-record ≥50/70 confidence, annars `NEEDS_MANUAL_REVIEW`                                                      |
| AI-extraktion                    | **DONE**    | `cmAiExtractor` — gpt-4o-mini vision/text, svensk prompt, strukturerad JSON                                                                   |
| Dedupe                           | **PARTIAL** | sha256 på internetMessageId/fileHash/fakturanr/subject/avsändare/belopp — men OCR-nr, PNR, attachment-hash saknas                             |
| **Delta-sync**                   | **MISSING** | `deltaTokens` deklareras men **används aldrig**; varje körning = top-50 + subject-filter per mapp (Inbox/Fakturor/Kvitton/Expenses)           |
| **Bilagor (PDF/bild) från mail** | **MISSING** | Graph attachment-API anropas inte — endast mailtext (trunkerad 5 000 tecken) extraheras. Specens kärnkrav "PDF = original + OCR" är ouppfyllt |
| **Originalarkiv (BFN 7 år)**     | **MISSING** | Inget `secureStorage`-skriv i CM-flödet; rawEmailJson sparas inte                                                                             |
| Processing ledger + reprocess    | **PARTIAL** | Fält finns i store; mail-flödet skriver inte ledger, ingen processorVersion/filterVersion-gate                                                |
| **CM-UI (10 flikar)**            | **MISSING** | Endast `loadCmDashboard`-widget i `admin.html`                                                                                                |
| **Tester**                       | **MISSING** | 0 filer (`tests/` har inget cm-spår; bara cmo\*)                                                                                              |
| Schemalagd sync                  | **MISSING** | Manuell `POST /cm/mail-sync` (env `CM_MAIL_ACCOUNT`)                                                                                          |

---

## 3 · Strukturfyndet: två parallella expense-system

- `cmStore.expenseRecords` har **egen** approve/reject/markExported-livscykel + eget leverantörsregister.
- `cfoExpenseStore` har **komplett** livscykel + regelmotor (CF.4) + vendors (CF.5) + moms (CF.6) +
  återkommande (CF.7) + revisorportal (CF.8) + rapporter/månadsstängning (CF.9) + audit + secureStorage.
- Samma verksamhetsflöde, två sanningar → dubbel bokföringslogik, dubbla audit-spår, dubbla UI:n.

**Rekommendation (bygg-regel #2 — bygg inte om det som finns):**
CM blir **intagsmotorn** (mail/foto/uppladdning → raw → dedupe → extraktion → **kandidat**),
och lämnar över till `cfoExpenseStore` som äger **hela livscykeln** (granska → godkänn → exportera →
rapport). CM:s egna approve/reject/export-endpoints fasas ut. Kontrakt först (agent-koordinering
regel 4): definiera överlämningsfält, dedupe-ansvar och audit-kedja i en spec innan wiring.

---

## 4 · Stabilitet & arkitektur (lärdomar från incident 2026-07-10)

1. **`cmStore` = samma mönster som kraschade prod**: en monolitisk JSON-fil, `JSON.parse` av allt vid
   boot, obegränsad tillväxt (rawItems + auditEvents + records i samma fil). Crashloopen orsakades av
   exakt detta i `cco-mail-ingestion.json` (~1 GB). **Åtgärda innan skarp mail-sync**: rotera/sharda
   (mönster: `ccoMailboxTruthSharded`/LazyPreload), separera audit från data, cappa rawItems.
2. **Aldrig synkrona externa anrop i request-vägen** — ORD-58b:s period-cache är rätt princip; gör den
   till regel för alla `/monitor/*`- och dashboard-vägar (CEO-timeout 8 s).
3. **Flytta `/cco-cf/*` ur `server.js` + CM-mount** till `src/routes/cfo.js` enligt ORGANISATION §4
   (en domän = en PR = grönt test). CFO/CM är minst sammanflätade domänen — bra pilotflytt.
4. **P2-C (audit kind→action)**: roadmappen flaggade att `ccoAuditLog.append` läser `action` medan
   CF-stores skickade `kind` → allt loggas som `unknown`. Verifiera om patchad; annars 2h-fixen
   (`event.action || event.kind`). CM:s egen audit går inte via `ccoAuditLog` alls — ska in i kontraktet (§3).
5. Incident-uppföljning (klinik): bekräfta disabled-stubben no-op:ar alla kodvägar, trimma
   ingestion-filen offline, återaktivera, sänk Pro Max → Pro Plus.

---

## 5 · Styrning & dokumentation

| Gap                                                               | Åtgärd                                                                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| CFO/CM saknas i MASTER-TODO / PROJECT-CHECKLIST / STATUS-OVERSIKT | Lägg **DEL 6 — CFO/CM** i MASTER-TODO (eller egen `FINANCE-TODO.md`) + pekare i STATUS-OVERSIKT §1/§3                                                 |
| Notion Master TODO saknar Finance-Area                            | Lägg Area-alternativ `Finance/CM`; Order Inbox täcker redan ordrarna (ORD-58/58b synkade)                                                             |
| 06-01-docs beskriver pre-leverans-läge                            | Markera som historik (STATUS-OVERSIKT §5-regeln) + skriv kort `CFO-STATUS`-sektion med dagens sanning (denna fil kan vara fröet)                      |
| iCloud `04 · CFO` tom · `06 · CM` = 1 fil                         | Beslut: antingen **medvetet tomt** (repo äger allt — skriv det i `00-VAR-LIGGER-ALLT.md`) eller arkivera månadsstängnings-/rapportpaket dit per månad |

---

## 6 · Föreslagen ordning

**P0 — denna vecka**

1. **ORD-58b: verify körd 22:56 → 4/7.** Latens LÖST (1,3 s varm). Kvar: revenue/AOV null →
   kontrollera Fortnox OAuth-state i prod (`/api/v1/cco-fortnox/status` som owner, eller Render
   Shell → cfo-fortnox-state på `/var/data`); saknas anslutning → kör runbooken (Anslut-knappen,
   iCloud 06 · CM). Därefter om-verify + CEO-UAT hero 4/5.
2. Incident-uppföljning enligt §4.5 (stub-verifiering, filtrim, instans-nedväxling).

**P1 — nästa order-kedja (förslag till Order Inbox)** 3. **ORD-63 · CM↔CFO-kontrakt** (doc, ingen kod): kandidat-överlämning till `cfoExpenseStore`,
dedupe-ansvar, audit via `ccoAuditLog`, utfasning av CM:s egen livscykel. (§3) 4. **ORD-64 · CM-pipeline härdning**: persisted delta-tokens per mapp · Graph-bilagor (PDF/bild) →
`secureStorage` (`receipts/YYYY-MM/<sha>`) · rawEmailJson-original (BFN 7 år) · ledger-writes ·
store-rotation (§4.1) · schemalagd körning via befintlig scheduler. 5. **ORD-65 · Kvitto-UI**: CM-inbox/needs-review som flik i `finance.html` (återanvänd CF-DNA:t)
i stället för nytt silo-UI; egen `cm.html` först om volymen kräver. 6. **Tester**: `tests/cm/` för cmStore (dedupe/statusar), cmMailSync (fixture-Graph), cmAiExtractor
(mockade svar — ingen live-AI i test).

**P2** 7. **CF.9 voucher-sync** (~4h enligt roadmap) när ORD-58b-UAT bekräftat OAuth-state. 8. Route-flytt `cco-cf`/`cm` ur `server.js` (§4.3).

**P3** — styrning/dokumentation enligt §5.

---

## 7 · Beslutspunkter (owner-GO krävs)

1. **Konsolidering** CM→CFO-livscykel (§3) — rekommenderas. Alternativet (två spår) kräver aktivt beslut.
2. **AI/OCR-policy-konflikt:** `cmAiExtractor` skickar redan kvitton/fakturor till OpenAI
   (gpt-4o-mini) medan CF-spåret håller CF.10 blockerad i väntan på explicit AI-GO. Formalisera:
   extern AI OK för leverantörsunderlag (aldrig patientdata)? Om nej — Tesseract-spåret.
3. **Bank-CSV (CF.11)** och **payroll (CF.12)**: fortsatt parkerade?
4. **CM-mailkälla:** dedikerad adress/mapp (t.ex. `kvitto@`) i stället för subject-filter på Inbox?
5. **iCloud-arkivets roll** för CFO/CM (§5).

---

## Källor (för framtida läsare)

`CHIEF-OF-FINANCE-INVENTORY/MVP1–8` (2026-06-01) · `CEM-corporate-expense-management.md` ·
`RUNBOOK-Fortnox-aktivering-2026-06-10.md` (iCloud 06 · CM) · `INCIDENT-arcana-crashloop-2026-07-10.md`
(iCloud-rot) · `ORD-58`, `ORD-58b` (repo + Notion Order Inbox) · `CEO-TJANSTEINVENTERING-2026-07-10.md`
(iCloud 07 · CEO) · `src/cfo/`, `src/cm/`, `src/routes/cm.js`, `server.js`, `public/finance*.html`,
`tests/cfo|cf/` · `git status` 2026-07-12.

---

## Addendum 2026-07-12 — full genomgång av iCloud-arkivet (Major Arcana 2.0)

Hela mappen är nu inventerad (alla 10 toppmappar + rotfiler). Utöver §5:

1. **Tomma agentmappar:** `02 · COO`, `03 · CAO`, `05 · CMO` är helt tomma (som `04 · CFO`).
   Endast CCO, CEO och CM (1 fil) är befolkade — per-agent-strukturen finns men används inte.
   Samma beslut som §5: medvetet tomt (skriv in i `00-VAR-LIGGER-ALLT.md`) eller börja arkivera.
2. **Patientdata i iCloud:** `00 · Major Arcana (övergripande)/Migration-data/cco-secure-storage/`
   innehåller `patient-documents` + årsmappar 2024–2026. **Korrigering efter kodläsning:** detta är
   `ccoSecureStorageProvider`s DEFAULT-rot för lokal provider (by design, Mac-dev) — prod använder
   `ARCANA_CCO_SECURE_STORAGE_ROOT` på Render-disk. Ägarbeslutet kvarstår ändå: ska lokal-roten
   ligga i iCloud-synk (Apple-moln) eller flyttas till en osyncad disk-path? Hänger ihop med
   CEO-inventeringens städpunkt "iCloud-kodmappar + 89 GB journal-zip-offload".
3. **`01 · CCO`** = designhistorik/facit för V9–V12 (43 juni-filer, V10-DESIGNKODER, mockup-bilder,
   PR-143-screenshots) + `CCO-patientdokument-live` (arbetsmapp med symlinks; speglar repo-docs,
   öppen BOOKOFF-checklista 36 dokumenttyper — CCO-spår, ej CFO/CM).
4. **`90 · KOD/CCO-UNDERLAG`** = deduplicerad sammanslagning av gamla repo-kopior (2026-07-09) —
   städning enligt working-copy-regeln, klar. **`99 · Arkiv`** = 1 fil. **`_CURATIIO`** = före/efter-
   bilder (separat brand). **`gsc-indexing-progress.md`** (rot) = aktiv SEO-logg, uppdaterad 2026-07-12
   — hör egentligen hemma i `05 · CMO`.
