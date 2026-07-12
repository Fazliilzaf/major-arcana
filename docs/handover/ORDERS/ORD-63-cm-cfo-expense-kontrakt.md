# ORD-63 · CM→CFO expense-kontrakt + promote-flöde

**Status:** BYGGD (Claude 2026-07-12, denna PR) · **Beställare:** Fazli (ägar-GO 2026-07-12: "JA" på konsolidering)
**Bakgrund:** `CFO-CM-NULAGE-OCH-PLAN-2026-07-12.md` §3 — två parallella expense-livscykler.

## Beslut (ägar-GO)

CM = **intagsmotor** (mail/foto/uppladdning → raw → dedupe → extraktion → **kandidat**).
CFO (`cfoExpenseStore`) = **enda livscykeln** (granska → godkänn → exportera → rapport → Fortnox).
CM:s egna approve/reject/markExported behålls tills vidare men är **deprecated** — tas bort när
UI:t (ORD-65) enbart använder promote-vägen.

## Kontrakt: CM-kandidat → cfoExpense

`src/cm/cmCfoHandoff.js` äger mappningen. Regler:

| CM-fält                           | CFO-fält                  | Regel                                                                                                 |
| --------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `amountIncVat` (fallback ex+moms) | `fields.amountSek`        | brutto                                                                                                |
| `vatAmount`                       | `fields.vatSek`           | —                                                                                                     |
| `supplierName`                    | `fields.supplier`         | —                                                                                                     |
| `date`                            | `fields.date`             | —                                                                                                     |
| `category` (fritext från AI)      | `fields.category`         | mappas via synonymtabell → `VALID_CATEGORIES`; ingen träff → `null` (CFO-status `new`/`needs_review`) |
| dokument.`storagePath`            | `fields.attachmentKeys[]` | originalet följer med                                                                                 |
| id/typ/nummer/confidence          | `fields.notes`            | spårbarhet: `CM-import: … · cm-record <id> · confidence NN`                                           |

- **Idempotens:** promote sätter `cfoExpenseId` + `bookkeepingStatus='handed_off'` på CM-recordet;
  ny promote på samma record → 409.
- **Audit:** CM auditar `cm.expense_record.handed_off`; CFO auditar `cf.expense.created` som vanligt
  (via `ccoAuditLog`, action+kind).
- **Dedupe-ansvar:** CM äger dedupe på källnivå (mail/fil-hash). CFO litar på att promote inte skickar
  dubbletter; `notes`-spårbarheten gör manuell kontroll möjlig.
- **Ingen auto-promote:** människa klickar (ORD-65-UI) — AI föreslår, människan godkänner (CEM-principen).

## Endpoint

`POST /api/v1/cm/expense-records/:id/promote` (OWNER) → `{ ok, cfoExpense, record }`.

## Forbidden

Journal/feed/forms-routes orörda · aldrig `git add -A` · inga Fortnox-writes · ingen auto-promote.

## Gates

`npm run check:syntax` · `npm run lint:no-bypass` · `node --test tests/cm/`
