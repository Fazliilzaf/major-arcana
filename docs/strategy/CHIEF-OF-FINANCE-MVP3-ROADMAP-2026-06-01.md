# Chief of Finance MVP 3 (CF.4+) — Roadmap

**Datum:** 2026-06-01
**Status:** **PLAN ONLY** — ingen kod byggs ännu. Owner-GO krävs per delsprint nedan.
**Bakgrund:** CF.2 (Receipt Inbox + Dashboard) och CF.3 (Expense Categorization + Manual Workflow) är levererade. Fortnox = `BLOCKED_INTEGRATION` (Utvecklarportalen ger 3 felkoder hos Fortnox backend). CF fortsätter CCO-native.

---

## 0 · Beslutsprinciper (gäller hela roadmappen)

1. **Ingen Fortnox-write** förrän Fortnox OAuth fungerar (väntar Fortnox support)
2. **Ingen extern AI/OCR** utan explicit owner-GO per sprint
3. **Ingen bank-CSV-import** utan explicit owner-GO
4. **Ingen payroll** — separat modul, separat sprint, ej i CF
5. **Inga kvitton / bilagor / bankfiler / exportfiler i GitHub** — secure storage only
6. **Audit på alla mutationer** (kind→action-fältmismatch P2-C löses först)
7. **RBAC owner/finance/revisor** — etablerad, återanvänds

---

## 1 · Sprint-översikt

| Sprint | Område | Effort | Owner-GO krävs på | Status |
|---|---|---|---|---|
| **CF.4** | Auto-categorization regelmotor (utan AI) | ~10h | scope + regelpriotering | ⏸ väntar GO |
| **CF.5** | Leverantörsregister + leverantörsregler | ~8h | scope | ⏸ väntar GO + CF.4 |
| **CF.6** | Momsregler + reverse-charge stöd | ~6h | scope + svensk moms-policy | ⏸ väntar GO + CF.4 |
| **CF.7** | Återkommande kostnader (subscription tracker) | ~10h | scope | ⏸ väntar GO + CF.4 |
| **CF.8** | Revisor-portal (read-only export-hub) | ~6h | scope + revisor-RBAC-utökning | ⏸ väntar GO |
| **CF.9 (framåt)** | Fortnox voucher-sync wiring | ~4h | **Fortnox OAuth-blocker löst** | 🟡 blocker |
| **CF.10 (framåt)** | OCR av kvittobilder | ~10h | **explicit AI/OCR-GO** | 🔴 blocker |
| **CF.11 (framåt)** | Bank-CSV-import (Handelsbanken/SEB/Nordea-format) | ~12h | **explicit bank-CSV-GO** | 🔴 blocker |
| **CF.12 (framåt)** | Payroll / lönehantering | ~30h+ | **separat modul-GO** | 🔴 blocker |

---

## 2 · CF.4 — Auto-categorization regelmotor (utan AI)

**Mål:** Automatiskt sätta `category` på nya expenses baserat på regler som matchar `supplier`, `notes`, `amountSek`, `paymentMethod`. Sparar 80% av manuell kategoriseringstid.

### 2.1 Scope (vad som byggs)

| # | Komponent | Detalj |
|---|---|---|
| 1 | `ccoExpenseRuleStore.js` | Persisterad regelmotor i `data/cco/expense-rules.json` |
| 2 | Regelfält | `id, name, priority, enabled, matchType (any/all), conditions[], setCategory, setNotes, addTags, audit-id` |
| 3 | Condition-typer | `supplier_equals`, `supplier_contains`, `supplier_regex`, `amount_between`, `payment_method_is`, `date_range`, `notes_contains` |
| 4 | Match-engine | Ren JS-funktion `evaluateRules(expense, rules)` → returnerar matched rule(s) |
| 5 | Integration | Inhakad i `ccoExpenseStore.createExpense` + `updateExpense` när category saknas |
| 6 | UI | Ny tab "Regler" i `/finance.html` — lista/skapa/redigera regler · "Testa" mot expense-sample |
| 7 | Dry-run-mode | `POST /cco-cf/rules/test` → simulerar mot existerande expenses utan att skriva |
| 8 | Audit | `cf.rule.created/updated/deleted/applied` — `applied` triggas per auto-kategoriserad expense |
| 9 | Override | Manuell PATCH av category överrider regel + sätter `categorySource: 'manual_override'` |
| 10 | Reglerstart-set | 10 förslag baserade på CF.3-data: "Apoteket → forbrukning", "ICA/Coop → mat_representation", "Klarna/Stripe → bank_finansiell", etc. |

### 2.2 Ej i CF.4

- AI/ML-baserad kategorisering — kräver owner-GO för CF.10
- Auto-supplier-merging (matcha "Apoteket" och "Apoteket AB" till samma vendor) — flyttas till CF.5
- Auto-momsslag-detektering — CF.6
- Regler från receipt-OCR — CF.10

### 2.3 Säkerhet

- Regler är konfigurationsdata, INTE kvitton/PII
- Sparas i `data/cco/expense-rules.json` (gitignored)
- RBAC: owner/finance write · revisor read
- Audit: `cf.rule.*` events
- Dry-run kan köras av revisor (read-only safe)

### 2.4 Acceptance (CF.4)

- Regel kan skapas/uppdateras/raderas
- Regel kan testas mot existerande expenses utan att modifiera dem
- Ny expense med matchande regel får auto-kategori + audit `cf.rule.applied`
- Manuell override fungerar + spårbar via `categorySource`
- 10 förslag-regler kan importeras via "Lägg till förslag"-knapp
- Inga AI-anrop
- Inga writes mot Fortnox

---

## 3 · CF.5 — Leverantörsregister + leverantörsregler

**Mål:** Bygg en enda källa för leverantörer (vendors) som CF.4-regler, expense-formulär och dashboard kan referera till.

### 3.1 Scope

| Komponent | Detalj |
|---|---|
| `ccoFinanceVendorStore.js` | Persistens i `data/cco/finance-vendors.json` |
| Fält | `id, name, aliases[], orgNo, vatNo, defaultCategory, defaultPaymentMethod, defaultVatRate, country, fortnoxCustomerId (null), notes` |
| Merge-utility | "Apoteket" + "Apoteket AB" + "APOTEKET-1024" → samma vendor via aliases |
| UI | Ny sektion "Leverantörer" i `/finance.html` — list/skapa/merge |
| Integration | Expense-editor visar typeahead från vendor-store + sätter defaults |
| Audit | `cf.vendor.created/updated/merged` |

### 3.2 Ej i CF.5

- Fortnox-sync av vendors (CF.9)
- Auto-fetch av orgNo via Bolagsverket-API (separat owner-GO för extern API)

### 3.3 Acceptance

- Vendor kan skapas + redigeras + slås ihop (alias-merge)
- Expense-editor föreslår vendor från befintliga + sätter defaults
- Inga externa API-anrop
- Inga writes mot Fortnox

---

## 4 · CF.6 — Momsregler + reverse-charge

**Mål:** Korrekt svensk momshantering enligt Skatteverkets standardmoms (0, 6, 12, 25 %) + reverse-charge (omvänd skatteskyldighet) för EU-handel.

### 4.1 Scope

| Komponent | Detalj |
|---|---|
| Validering | Existerande `VALID_VAT_RATES = [0, 6, 12, 25, 'reverse_charge']` (CF.3) utökas med kontrollogik |
| Auto-beräkning | Om `amountSek` + `vatRatePercent` är satt och `vatSek` saknas → räkna ut `vatSek = amountSek * rate / (100 + rate)` |
| Reverse-charge-flagga | Om `vatRatePercent === 'reverse_charge'` → `vatSek = 0` + auto-tag "EU-handel" |
| Per-kategori-default | T.ex. `lokal → 25%`, `forsakring → 0%` (momsbefriat), `mat_representation → 12%` |
| Dashboard | Ny KPI "Moms per momssats denna månad" |
| Audit | Befintliga `cf.expense.updated` med fält `vatRatePercent` täcker detta |

### 4.2 Ej i CF.6

- Periodisk momsdeklaration-export (SIE-format) — CF.5+SIE = MVP 5
- Skatteverket-integration

### 4.3 Acceptance

- Vat-beräkning auto-fyller när möjligt
- Reverse-charge sätter `vatSek=0` + flagga
- Dashboard visar moms-summering per sats
- Inga externa API-anrop

---

## 5 · CF.7 — Återkommande kostnader

**Mål:** Spåra prenumerationer och löpande avtal (kontorshyra, mjukvarulicenser, försäkringar) så att man ser vad som dragits + vad som väntas dras.

### 5.1 Scope

| Komponent | Detalj |
|---|---|
| `ccoRecurringExpenseStore.js` | Återkommande regler: `frequency (monthly/quarterly/annual), nextDueDate, lastExpenseId, vendor, category, expectedAmount, expectedVatRate, active` |
| Cron-check | Daglig job (befintlig scheduler) → om `nextDueDate <= today + 7d` → notifiera + auto-skapa draft-expense (status: `needs_review`) |
| UI | "Återkommande"-tab i `/finance.html` |
| Anomaly detection | Faktiskt belopp avviker > 20% från `expectedAmount` → flagga + notifiera |
| Audit | `cf.recurring.created/updated/triggered/anomaly_detected` |

### 5.2 Ej i CF.7

- Mail-baserad faktura-import (CF.10 senare)
- Bank-CSV-koppling (CF.11)

### 5.3 Acceptance

- Återkommande regel kan skapas
- Cron skapar draft-expense när due-date närmar sig
- Anomaly på avvikelse > 20% loggas + visas i dashboard
- Inga externa anrop

---

## 6 · CF.8 — Revisor-portal (read-only export-hub)

**Mål:** Ge revisorn en egen vy med endast export-funktioner — utan att de behöver komma in på övriga CCO-sidor.

### 6.1 Scope

| Komponent | Detalj |
|---|---|
| `/finance-revisor.html` | Ny dedikerad sida (revisor-role) |
| Innehåll | Lista exportbatches · ladda ner CSV/JSON per batch · filter på datum/kategori/leverantör · "Skapa ny export"-knapp (för ready_for_export) |
| Ingen mutations-UI | Inga edit/approve/reject-knappar |
| Audit | Existerande `cf.export.created/downloaded` täcker detta |
| Onboarding | Owner skickar revisor `https://major-arcana-frankfurt.onrender.com/finance-revisor.html` + revisor-konto |

### 6.2 Ej i CF.8

- Eget login för revisor (använder existerande auth-system)
- Direkt-koppling till Fortnox (CF.9)
- Bokföringsförslag genererade av CCO

### 6.3 Acceptance

- Revisor kan logga in + se exportbatches
- Revisor kan ladda ner CSV/JSON
- Revisor får 403 på alla write-routes
- Audit visar varje download

---

## 7 · Framåt-sprintar (BLOCKERS)

### 7.1 CF.9 — Fortnox voucher-sync (BLOCKER: Fortnox OAuth)

**Förutsättning:** Fortnox Utvecklarportalen fungerar (3 felkoder lösta) + OAuth-flödet är gjord per CHIEF-OF-FINANCE-MVP1-UAT-2026-06-01.md §3-§7.

**Då räcker ~4h att bygga:**
- `ccoFortnoxVoucherSync.js` — läser expenses med `fortnoxExportPending=true` + `status='exported'`
- Mappar till Fortnox `Voucher`-format (SIE-konton, verifikatserier, etc.)
- POST mot Fortnox-API
- Uppdaterar `fortnoxSyncStatus='synced'` + `fortnoxVoucherId=<from-response>`
- Audit `cf.fortnox.voucher_synced`

**Allt redan förberett:** 3 fält per expense (`fortnoxSyncStatus, fortnoxVoucherId, fortnoxExportPending`) + dashboard-summering + UI-badge. Ingen datamigration.

### 7.2 CF.10 — OCR (BLOCKER: explicit AI-GO)

**Två vägar:**
- **Lokal Tesseract** — owner-GO för installation, inga externa anrop, ingen internet-skick av kvitton
- **Cloud-OCR** (Google Vision, Azure Form Recognizer) — owner-GO + DPA-avtal + Art 28-bedömning

**Hindrad tills:** owner explicit pingar "GO för OCR med <Tesseract|cloud-provider>".

### 7.3 CF.11 — Bank-CSV-import (BLOCKER: explicit owner-GO)

**Scope om GO:** Parse Handelsbanken/SEB/Nordea/Swedbank CSV-format → matcha mot expenses (belopp+datum) → auto-länka eller skapa needs_review-expense.

**Hindrad tills:** owner pingar "GO för bank-CSV" + bekräftar att bank-CSV-filer hanteras enligt secure storage (ALDRIG i repo).

### 7.4 CF.12 — Payroll (BLOCKER: separat modul-beslut)

Payroll/löner är **inte CF-scope**. Egen modul med separata krav (Skatteverket-AGI, CSR-rapport, lönebesked, semesterlönehantering, etc.).

**Hindrad tills:** owner explicit pingar "Bygg payroll som separat modul".

---

## 8 · P2-bugg som bör prioriteras separat

**P2-C: ccoAuditLog kind→action-mismatch (upptäckt 2026-06-02)**

`ccoAuditLog.append` läser `event.action`. CF.2/CF.3 + Incident/DSR/Photo/Plan/PortalLink/CustomerEvent skickar `event.kind`. Alla CF audit-events skrivs med `action='unknown'`.

**Effort:** ~2h — tvärfunktionell fix antingen i `ccoAuditLog.append` (accept både `action` och `kind`) eller i alla anropssites (8+ stores).

**Rekommenderad fix:** patcha `ccoAuditLog.append` att läsa `event.action || event.kind` — bakåtkompatibel, fixar alla berörda stores på en gång.

**Hindrad tills:** owner-GO för tvärfunktionell audit-sprint (förslagsvis efter CF.4).

---

## 9 · Säkerhetsregler (gäller alla CF.4+)

| Regel | Tillämpning |
|---|---|
| Ingen Fortnox-write | CF.4-CF.8 bygger ingen Fortnox-integration. CF.9 är separat sprint efter blocker. |
| Ingen extern AI/OCR | CF.4-CF.9 har inga externa AI-anrop. CF.10 kräver explicit GO. |
| Ingen bank-CSV | CF.4-CF.10 berör inte bank-data. CF.11 kräver explicit GO. |
| Ingen payroll | Helt utanför CF-scope. |
| Inga kvitton / bilagor / bankfiler / exporter i GitHub | Befintlig secureStorage + gitignored `data/` återanvänds för alla sprintar. |
| Secure storage | Alla nya filer går genom `app.locals.ccoSecureStorage.putObject` (positional eller object — shim:en finns nu efter P1-B-fix). |
| Audit | Alla mutationer ska emittas via `ccoAuditLog.append` med både `action` (preferred) OCH `kind` (legacy) tills P2-C är fixad. Workaround: använd `action` istället för `kind` när nya stores skapas. |
| RBAC | owner/finance/revisor — read-routes för revisor, write-routes för owner+finance. Befintlig `cfRBAC` + `cfMutateRBAC` återanvänds. |

---

## 10 · Owner-checklista innan CF.4 startar

| # | Beslut | Behövs |
|---|---|---|
| 1 | GO för CF.4 (auto-categorization regelmotor utan AI) | Owner |
| 2 | Prioritering: ska 10 förslag-regler ingå i första launch eller läggas till manuellt? | Owner |
| 3 | (Valfritt) Beslut om att även patcha P2-C (audit kind→action) i samma sprint | Owner |
| 4 | Bekräfta att CF.5-CF.8 fortsatt är ⏸ (väntar separat GO per sprint) | Owner |

---

**Rapport-författare:** Claude (CF-roadmap)
**Datum:** 2026-06-01
**Status:** PLAN ONLY — ingen kod skriven. Väntar owner-GO per sprint.
