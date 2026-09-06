'use strict';

/**
 * CFO / Chief of Finance routes (ORD-63 .. ORD-73).
 *
 * Previously lived inline in server.js inside a giant async IIFE.
 * Extracted to src/routes/cfo.js so CM/CFO work can be reasoned about
 * without touching the rest of the monolith.
 *
 * Voucher-sync routes remain in src/routes/cfoVoucherSync.js by design.
 */

const express = require('express');
const multer = require('multer');
const { simpleParser } = require('mailparser');
const { attachRole, requireAnyRole, getActor } = require('../security/ccoRbac');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripHtml(html) {
  return typeof html === 'string'
    ? html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    : '';
}

function graphMessageDate(parsed) {
  const candidates = [
    parsed.receivedDateTime,
    parsed.sentDateTime,
    parsed.createdDateTime,
    parsed.date,
  ];
  for (const d of candidates) {
    if (!d) continue;
    const iso = new Date(d).toISOString();
    if (iso !== 'Invalid Date') return iso;
  }
  return null;
}

function graphMessageText(parsed) {
  const body =
    typeof parsed.body === 'string'
      ? parsed.body
      : typeof parsed.body?.content === 'string'
        ? parsed.body.content
        : '';
  const text =
    normalizeText(parsed.bodyPreview) ||
    normalizeText(parsed.text) ||
    stripHtml(body) ||
    stripHtml(parsed.html) ||
    normalizeText(parsed.bodyHtml) ||
    '';
  return text.slice(0, 8000);
}

function createCfoRouter({
  requireAuthenticated,
  cfoReceiptStore,
  cfoExpenseStore,
  cfoExpenseRuleStore,
  cfoFinanceVendorStore,
  cfoRecurringExpenseStore,
  cfoFinanceReviewStore,
  cfoFinanceMonthlyCloseStore,
  cfoFortnoxInvoiceLister,
  cfoFortnoxStore,
  ccoSwishStore,
  ccoCommercialStore,
  ccoSecureStorage,
  ccoAuditLog: auditLog,
  config,
}) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '32kb' });

  const receiptStore = cfoReceiptStore;
  const expenseStore = cfoExpenseStore;
  const ruleStore = cfoExpenseRuleStore;
  const vendorStore = cfoFinanceVendorStore;
  const recurringStore = cfoRecurringExpenseStore;
  const reviewStore = cfoFinanceReviewStore;
  const monthlyCloseStore = cfoFinanceMonthlyCloseStore;
  const fortnoxInvoiceLister = cfoFortnoxInvoiceLister;
  const fortnoxStore = cfoFortnoxStore;
  const swishStore = ccoSwishStore;
  const commercialStore = ccoCommercialStore;
  const secureStorage = ccoSecureStorage;

  const cfReceiptUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });
  const cfExpenseUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  // ── CF.4/CF.5/CF.6/CF.7: kör förslagsmotorerna på en ny expense ───────────
  // Delad mellan POST /expenses och bulk-promote så båda får samma AI-förslag.
  async function enrichExpenseWithSuggestions(expense, actor) {
    const store = expenseStore;
    let enriched = expense;
    let matchedVendor = null;

    // CF.5: vendor-match först — länka supplierId + recordMatched
    if (vendorStore && enriched.supplier && !enriched.supplierId) {
      try {
        const match = vendorStore.findBySupplierName(enriched.supplier);
        if (match && match.matched && match.confidence >= 0.55) {
          matchedVendor = match;
          enriched = await store.linkSupplier({
            id: enriched.id,
            supplierId: match.vendor.id,
            matchType: match.matchType,
            confidence: match.confidence,
            actor,
          });
          await vendorStore.recordMatched({
            id: match.vendor.id,
            expenseId: enriched.id,
            amount: Number(enriched.amountSek) || 0,
            actor,
          });
        }
      } catch (err) {
        console.warn('[cco-cf] vendor-match error:', err.message);
      }
    }

    // CF.4: kör rule engine om expense saknar category — föreslå utan att applicera.
    if (ruleStore && !enriched.category) {
      try {
        const rules = ruleStore.listRules({ enabled: true, limit: 500 });
        const historyExpenses = store
          .listExpenses({ limit: 200 })
          .filter((h) => h.id !== enriched.id);
        const ruleSuggestion = ruleStore.evaluateAllRules({
          expense: enriched,
          rules,
          historyExpenses,
        });

        // CF.5: om ingen rule-bestMatch men en vendor är länkad med defaults,
        // bygg en vendor-baserad suggestion. Confidence från vendor-match.
        let finalSuggestion = ruleSuggestion;
        if (
          (!ruleSuggestion.bestMatch || ruleSuggestion.bestMatch.confidence < 0.3) &&
          matchedVendor &&
          matchedVendor.vendor
        ) {
          const v = matchedVendor.vendor;
          const vendorFields = {};
          if (v.defaultCategory && !enriched.category) vendorFields.category = v.defaultCategory;
          if (
            v.defaultVatRatePercent !== null &&
            v.defaultVatRatePercent !== undefined &&
            (enriched.vatRatePercent === null || enriched.vatRatePercent === undefined)
          ) {
            vendorFields.vatRatePercent = v.defaultVatRatePercent;
          }
          if (v.defaultPaymentMethod && !enriched.paymentMethod)
            vendorFields.paymentMethod = v.defaultPaymentMethod;
          if (v.defaultNote) {
            const existing = String(enriched.notes || '').trim();
            vendorFields.notes = existing ? `${existing} · ${v.defaultNote}` : v.defaultNote;
          }
          if (Object.keys(vendorFields).length > 0) {
            finalSuggestion = {
              ...ruleSuggestion,
              bestMatch: {
                ruleId: null,
                ruleName: `Leverantörs-default: ${v.name}`,
                source: 'vendor_defaults',
                vendorId: v.id,
                confidence: matchedVendor.confidence,
                suggestedFields: vendorFields,
              },
            };
          }
        }

        const hasBest = finalSuggestion?.bestMatch;
        const hasRecurring = finalSuggestion?.recurring;
        if (hasBest || hasRecurring) {
          enriched = await store.setSuggestion({
            id: enriched.id,
            suggestion: finalSuggestion,
            actor,
          });
        }
      } catch (err) {
        console.warn('[cco-cf] suggestion engine error:', err.message);
      }
    }

    // CF.7: match mot active recurring-mallar → länka + audit + anomalies
    const recStore = recurringStore;
    if (recStore && enriched.supplier) {
      try {
        const match = recStore.findMatchingRecurring(enriched);
        if (match && match.matched) {
          const recentExpenses = store
            .listExpenses({ limit: 200 })
            .filter((h) => h.id !== enriched.id);
          const anomalies = recStore.detectAnomalies({
            recurring: match.recurring,
            matchedExpense: enriched,
            recentExpenses,
          });
          enriched = await store.linkRecurring({
            id: enriched.id,
            recurringExpenseId: match.recurring.id,
            confidence: match.confidence,
            anomalies,
            actor,
          });
          await recStore.recordExpenseMatch({ id: match.recurring.id, expense: enriched, actor });
          for (const a of anomalies) {
            try {
              await recStore.recordAnomaly({ id: match.recurring.id, anomaly: a, actor });
            } catch {}
          }
        }
      } catch (err) {
        console.warn('[cco-cf] recurring-match error:', err.message);
      }
    }

    // CF.6: VAT-suggestion baserat på category + supplierId-defaults + vatRatePercent
    if (!enriched.vatMode) {
      try {
        const { suggestVatMode } = require('../cfo/cfoExpenseVatRules');
        const sug = suggestVatMode({
          category: enriched.category,
          vatRatePercent: enriched.vatRatePercent,
          supplierCountry: 'SE',
          reverseChargeHint: false,
        });
        if (sug) {
          enriched = await store.setVatSuggestion({ id: enriched.id, suggestion: sug, actor });
        }
      } catch (err) {
        console.warn('[cco-cf] vat-suggestion error:', err.message);
      }
    }

    return enriched;
  }

  // ── CF.2 (MVP 1) — Chief of Finance routes ────────────────────
  // RBAC: owner / finance / revisor. Audit på alla mutationer.
  // ORD-67b (2026-07-13): CF-routes registreras FÖRE auth-bootstrap och hade
  // därför aldrig någon token-parser i prod → attachRole såg alltid
  // 'anonymous' → 403 för ALLA (även owner). Bryggan nedan delegerar till
  // auth.requireAuth vid request-tid (samma mönster som requireAuthenticated)
  // så Bearer/x-auth-token parsas och req.auth.role sätts innan attachRole.
  router.use('/cco-cf', requireAuthenticated);
  const cfRBAC = ['owner', 'finance', 'revisor'];
  // B-3: revisor har FULLA ekonomirättigheter (write/approve/close/korrigering).
  const cfMutateRBAC = ['owner', 'finance', 'revisor'];
  // CF.2-fix 2026-06-01 (BUG-2): använd getActor-helper istället för det
  // gamla pattern som läste actor.userId från req-objekt som attachRole
  // inte sätter. Se CHIEF-OF-FINANCE-MVP1-UAT-2026-06-01.md.
  const { getActor } = require('../security/ccoRbac');

  // GET /api/v1/cco-cf/dashboard — KPI:er + status
  router.get('/cco-cf/dashboard', attachRole, requireAnyRole(cfRBAC), async (req, res) => {
    try {
      const actor = getActor(req);
      const { buildFinanceDashboard } = require('../cfo/cfoFinanceDashboardBuilder');
      const dashboard = await buildFinanceDashboard({
        stores: {
          fortnoxStore: fortnoxStore,
          swishStore: swishStore,
          commercialStore: commercialStore,
          receiptStore: receiptStore,
          expenseStore: expenseStore, // CF.3
          ruleStore: ruleStore, // CF.4
          vendorStore: vendorStore, // CF.5
          recurringStore: recurringStore, // CF.7
          reviewStore: reviewStore, // CF.8
          monthlyCloseStore: monthlyCloseStore, // CF.9
          fortnoxInvoiceLister: fortnoxInvoiceLister,
        },
        tenantId: actor.tenantId || 'hair_tp',
      });
      try {
        auditLog?.append?.({
          action: 'cf.dashboard.viewed',
          kind: 'cf.dashboard.viewed',
          surface: 'cco.cf',
          ts: new Date().toISOString(),
          actor: { userId: actor.userId, role: actor.role },
          detail: { partial: dashboard.partial, anomalies: dashboard.anomalies.length },
        });
      } catch {}
      res.json(dashboard);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/receipts?status=&limit=
  router.get('/cco-cf/receipts', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const store = receiptStore;
      if (!store) return res.status(503).json({ error: 'receipt store not ready' });
      const status = req.query.status || null;
      const sourceSystem = req.query.sourceSystem || null;
      const customerId = req.query.customerId || null;
      const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200));
      const list = store.listReceipts({ status, sourceSystem, customerId, limit });
      const summary = store.summary();
      res.json({ ok: true, receipts: list, summary });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/receipts/:id
  router.get('/cco-cf/receipts/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const store = receiptStore;
      if (!store) return res.status(503).json({ error: 'receipt store not ready' });
      const r = store.getById(req.params.id);
      if (!r) return res.status(404).json({ error: 'not found' });
      res.json(r);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/receipts/upload — multer 20MB-cap
  router.post(
    '/cco-cf/receipts/upload',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    cfReceiptUpload.single('file'),
    async (req, res) => {
      try {
        const store = receiptStore;
        if (!store) return res.status(503).json({ error: 'receipt store not ready' });
        if (!req.file)
          return res.status(400).json({ error: 'file krävs (multipart/form-data field: file)' });
        const actor = getActor(req); // CF.2-fix BUG-2
        const sourceSystem = req.body?.sourceSystem || 'manual_upload';
        const metadata = {
          supplier: req.body?.supplier || null,
          amountSek: req.body?.amountSek ? Number(req.body.amountSek) : null,
          vatSek: req.body?.vatSek ? Number(req.body.vatSek) : null,
          date: req.body?.date || null,
          category: req.body?.category || null,
          notes: req.body?.notes || null,
          customerId: req.body?.customerId || null,
          encounterId: req.body?.encounterId || null,
          treatmentId: req.body?.treatmentId || null,
          offerId: req.body?.offerId || null,
        };
        const r = await store.uploadReceipt({
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalFileName: req.file.originalname,
          actor,
          sourceSystem,
          metadata,
        });
        res.json({ ok: true, receipt: r });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/receipts/:id/repair-storage-key — byt ut kvittots fil
  // Body: multipart/form-data med field `file` och optional `reason`.
  // Används för reparation när ett kvitto pekar på fel underlag.
  router.post(
    '/cco-cf/receipts/:id/repair-storage-key',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    cfReceiptUpload.single('file'),
    async (req, res) => {
      try {
        const store = receiptStore;
        if (!store) return res.status(503).json({ error: 'receipt store not ready' });
        if (!store.repairStorageKey) {
          return res.status(503).json({ error: 'receipt store saknar repairStorageKey' });
        }
        if (!req.file) return res.status(400).json({ error: 'file krävs (multipart field: file)' });
        const actor = getActor(req);
        const r = await store.repairStorageKey({
          id: req.params.id,
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalFileName: req.file.originalname,
          actor,
          reason: req.body?.reason || null,
        });
        res.json({ ok: true, receipt: r });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // PATCH /api/v1/cco-cf/receipts/:id — kategorisera/uppdatera metadata
  router.patch(
    '/cco-cf/receipts/:id',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = receiptStore;
        if (!store) return res.status(503).json({ error: 'receipt store not ready' });
        const actor = getActor(req); // CF.2-fix BUG-2
        const r = await store.updateReceipt({ id: req.params.id, patch: req.body || {}, actor });
        res.json({ ok: true, receipt: r });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/receipts/:id/status — transition (reject/exported/etc)
  router.post(
    '/cco-cf/receipts/:id/status',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = receiptStore;
        if (!store) return res.status(503).json({ error: 'receipt store not ready' });
        const actor = getActor(req); // CF.2-fix BUG-2
        const r = await store.transitionStatus({
          id: req.params.id,
          newStatus: req.body?.status,
          reason: req.body?.reason,
          actor,
        });
        res.json({ ok: true, receipt: r });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/receipts/bulk-promote — skapa expenses från valda kvitton.
  // Body: { receiptIds?: string[], allNew?: boolean, autoApproveThreshold?: number }
  // allNew=true tar alla receipts med status 'new' eller 'needs_review'.
  // autoApproveThreshold: om angivet, expenses vars bästa förslag har confidence >= threshold
  //   godkänns automatiskt och flyttas till status 'categorized' (med category satt).
  router.post(
    '/cco-cf/receipts/bulk-promote',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const rStore = receiptStore;
        const eStore = expenseStore;
        if (!rStore || !eStore) return res.status(503).json({ error: 'store not ready' });
        const actor = getActor(req);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const autoApproveThreshold =
          typeof body.autoApproveThreshold === 'number' ? body.autoApproveThreshold : null;

        let targetIds = [];
        if (Array.isArray(body.receiptIds) && body.receiptIds.length > 0) {
          targetIds = body.receiptIds.map((id) => String(id)).filter(Boolean);
        } else if (body.allNew === true) {
          targetIds = rStore
            .listReceipts({ limit: 1000 })
            .filter((r) => r.status === 'new' || r.status === 'needs_review')
            .map((r) => r.id);
        } else {
          return res.status(400).json({ error: 'receiptIds eller allNew krävs' });
        }

        const existingByReceipt = new Map(
          eStore.listExpenses({ limit: 1000 }).map((e) => [e.receiptId, e.id])
        );

        const created = [];
        const skipped = [];
        const errors = [];

        for (const id of targetIds) {
          const receipt = rStore.getById(id);
          if (!receipt) {
            skipped.push({ id, reason: 'not_found' });
            continue;
          }
          if (existingByReceipt.has(id)) {
            skipped.push({ id, reason: 'already_promoted', expenseId: existingByReceipt.get(id) });
            continue;
          }
          if (receipt.status !== 'new' && receipt.status !== 'needs_review') {
            skipped.push({ id: receipt.id, reason: 'bad_status', status: receipt.status });
            continue;
          }

          try {
            // Skapa expense från receipt och kör förslagsmotorerna.
            let expense = await eStore.createExpense({
              actor,
              receiptId: receipt.id,
              fields: {
                supplier: receipt.supplier,
                amountSek: receipt.amountSek,
                vatSek: receipt.vatSek,
                vatRatePercent: null,
                date: receipt.date,
                category: receipt.category,
                paymentMethod: null,
                notes: receipt.notes,
                customerId: receipt.customerId,
                encounterId: receipt.encounterId,
                treatmentId: receipt.treatmentId,
                offerId: receipt.offerId,
              },
            });

            expense = await enrichExpenseWithSuggestions(expense, actor);

            // Markera kvittot som exporterat så det försvinner från inkorgen.
            await rStore.transitionStatus({
              id: receipt.id,
              newStatus: 'exported',
              reason: 'bulk-promote',
              actor,
            });

            let finalExpense = expense;

            // Auto-approve om vi har ett högkvalitativt förslag.
            if (
              autoApproveThreshold !== null &&
              expense.status === 'needs_review' &&
              expense.suggestion?.bestMatch &&
              expense.suggestion.bestMatch.confidence >= autoApproveThreshold
            ) {
              const suggestedFields = expense.suggestion.bestMatch.suggestedFields || {};
              const patch = {};
              if (suggestedFields.category && !expense.category)
                patch.category = suggestedFields.category;
              if (suggestedFields.vatRatePercent !== undefined && expense.vatRatePercent === null) {
                patch.vatRatePercent = suggestedFields.vatRatePercent;
              }
              if (suggestedFields.paymentMethod && !expense.paymentMethod) {
                patch.paymentMethod = suggestedFields.paymentMethod;
              }
              if (suggestedFields.notes) patch.notes = suggestedFields.notes;
              if (Object.keys(patch).length > 0) {
                finalExpense = await eStore.updateExpense({ id: expense.id, patch, actor });
              }
              finalExpense = await eStore.transitionStatus({
                id: expense.id,
                newStatus: 'categorized',
                actor,
              });
              if (ruleStore && expense.suggestion.bestMatch.ruleId) {
                try {
                  await ruleStore.recordApplied({
                    id: expense.suggestion.bestMatch.ruleId,
                    expenseId: expense.id,
                    actor,
                    suggestionConfidence: expense.suggestion.bestMatch.confidence,
                  });
                } catch {}
              }
            }

            created.push({
              receiptId: receipt.id,
              expenseId: finalExpense.id,
              status: finalExpense.status,
              category: finalExpense.category,
              suggestion: expense.suggestion
                ? {
                    ruleName: expense.suggestion.bestMatch?.ruleName || null,
                    confidence: expense.suggestion.bestMatch?.confidence || null,
                    source: expense.suggestion.bestMatch?.source || null,
                  }
                : null,
              autoApproved: autoApproveThreshold !== null && finalExpense.status === 'categorized',
            });
          } catch (err) {
            errors.push({ id, error: err.message });
          }
        }

        res.json({
          ok: true,
          processed: targetIds.length,
          created: created.length,
          skipped: skipped.length,
          errors: errors.length,
          details: { created, skipped, errors },
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-cf/receipts/:id/download — secure-storage proxy
  router.get(
    '/cco-cf/receipts/:id/download',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const store = receiptStore;
        if (!store) return res.status(503).json({ error: 'receipt store not ready' });
        const r = store.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'not found' });
        const secure = secureStorage;
        if (!secure?.getObject) return res.status(503).json({ error: 'secure storage not ready' });
        // CF.3-fix 2026-06-02: getObject returnerar {stream, buffer, mimeType, size, checksum}
        // — extrahera .buffer. ENOENT om fil saknas på disk → 404.
        let obj;
        try {
          obj = await secure.getObject(r.storageKey);
        } catch (e) {
          return res.status(404).json({ error: 'secure-storage-fil saknas', detail: e?.message });
        }
        try {
          const dlActor = getActor(req); // CF.2-fix BUG-2
          auditLog?.append?.({
            action: 'cf.receipt.downloaded',
            kind: 'cf.receipt.downloaded',
            surface: 'cco.cf',
            ts: new Date().toISOString(),
            actor: { userId: dlActor.userId, role: dlActor.role },
            target: { kind: 'receipt', id: r.id },
            detail: { storageKey: r.storageKey, sizeBytes: r.sizeBytes },
          });
        } catch {}
        res.setHeader('Content-Type', r.mimeType || obj.mimeType || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(obj.buffer || obj);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-cf/expenses/:id/attachments/:index/download — säker
  // nedladdning av expense-bilaga via secure storage.
  router.get(
    '/cco-cf/expenses/:id/attachments/:index/download',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const store = expenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const e = store.getById(req.params.id);
        if (!e) return res.status(404).json({ error: 'not found' });
        const keys = Array.isArray(e.attachmentKeys) ? e.attachmentKeys : [];
        const index = Math.max(0, Number(req.params.index) || 0);
        if (index >= keys.length) {
          return res.status(404).json({ error: 'bilaga finns ej' });
        }
        const entry = keys[index];
        const key = typeof entry === 'string' ? entry : entry?.key;
        const originalFileName = typeof entry === 'string' ? null : entry?.originalFileName;
        if (!key) return res.status(404).json({ error: 'ogiltig bilagereferens' });
        if (!ccoSecureStorage?.getObject) {
          return res.status(503).json({ error: 'secure storage not ready' });
        }
        const obj = await ccoSecureStorage.getObject(key);
        const buffer = obj?.buffer || obj;
        if (!Buffer.isBuffer(buffer)) {
          return res.status(404).json({ error: 'secure-storage-fil saknas' });
        }
        const mimeType =
          obj?.mimeType ||
          (key.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
        const fileName =
          originalFileName || (key.toLowerCase().endsWith('.pdf') ? 'underlag.pdf' : 'underlag');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.send(buffer);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-cf/expenses/:id/attachment-text — extrahera text ur
  // bilagor (PDF, EML, JSON) för att kunna stämma av datum/belopp utan att
  // ladda ner filen. Returnerar också eventuellt datum från bilagan.
  router.get(
    '/cco-cf/expenses/:id/attachment-text',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const store = expenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const e = store.getById(req.params.id);
        if (!e) return res.status(404).json({ error: 'not found' });
        const keys = Array.isArray(e.attachmentKeys) ? e.attachmentKeys : [];
        if (keys.length === 0) {
          return res.status(404).json({ ok: false, error: 'inga bilagor', attachmentKeys: keys });
        }

        let pdfParse = null;
        try {
          pdfParse = require('pdf-parse');
        } catch {
          pdfParse = null;
        }

        const attachments = [];
        for (const key of keys.slice(0, 5)) {
          try {
            const obj = await secureStorage.getObject(key);
            const buffer = obj?.buffer || obj;
            if (!Buffer.isBuffer(buffer)) throw new Error('ingen buffer från secure storage');
            const lowerKey = String(key).toLowerCase();

            if (lowerKey.endsWith('.pdf')) {
              if (!pdfParse) throw new Error('pdf-parse inte installerat');
              const parsed = await pdfParse(buffer);
              attachments.push({
                key,
                type: 'pdf',
                text: String(parsed?.text || '').slice(0, 8000),
              });
            } else if (lowerKey.endsWith('.eml')) {
              const parsed = await simpleParser(buffer);
              attachments.push({
                key,
                type: 'eml',
                date: parsed.date ? parsed.date.toISOString() : null,
                subject: parsed.subject || null,
                from: parsed.from?.value?.[0]?.address || null,
                text: normalizeText(parsed.text || parsed.html || '').slice(0, 8000),
              });
            } else if (lowerKey.endsWith('.json')) {
              const parsed = JSON.parse(buffer.toString('utf8'));
              const fromObj = parsed.from;
              const fromAddr =
                typeof fromObj === 'string'
                  ? fromObj
                  : fromObj?.address || fromObj?.emailAddress?.address || null;
              attachments.push({
                key,
                type: 'json',
                date: graphMessageDate(parsed),
                rawDate: {
                  receivedDateTime: parsed.receivedDateTime || null,
                  sentDateTime: parsed.sentDateTime || null,
                  createdDateTime: parsed.createdDateTime || null,
                  date: parsed.date || null,
                },
                rawPreview: JSON.stringify(parsed).slice(0, 2000),
                subject: parsed.subject || null,
                from: fromAddr,
                text: graphMessageText(parsed),
              });
            } else {
              attachments.push({
                key,
                type: 'unknown',
                text: buffer.toString('utf8').slice(0, 2000),
              });
            }
          } catch (err) {
            attachments.push({ key, type: 'error', error: err.message });
          }
        }

        const pdfCount = attachments.filter((a) => a.type === 'pdf').length;
        const texts = attachments
          .filter((a) => a.type === 'pdf')
          .map((a) => ({ key: a.key, text: a.text }));

        return res.json({
          ok: true,
          expenseId: e.id,
          supplier: e.supplier,
          amountSek: e.amountSek,
          pdfCount,
          attachments,
          texts,
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
  );

  // ── CF.3 (MVP 2) — Expense routes ─────────────────────────────
  // Manual expense workflow utan Fortnox-write. Audit på alla mutationer.

  // GET /api/v1/cco-cf/expenses — lista + filter
  router.get('/cco-cf/expenses', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const store = expenseStore;
      if (!store) return res.status(503).json({ error: 'expense store not ready' });
      const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200));
      const list = store.listExpenses({
        status: req.query.status || null,
        category: req.query.category || null,
        supplier: req.query.supplier || null,
        customerId: req.query.customerId || null,
        receiptId: req.query.receiptId || null,
        batchId: req.query.batchId || null,
        fortnoxSyncStatus: req.query.fortnoxSyncStatus || null,
        fromDate: req.query.fromDate || null,
        toDate: req.query.toDate || null,
        limit,
      });
      const summary = store.summary();
      res.json({ ok: true, expenses: list, summary });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ORD-CM-8 · GET /api/v1/cco-cf/expenses-tree — utgifts-inkorgens pyramid.
  // Utan year/month: år+månads-aggregat (hela boken, ingen limit-cap).
  // Med year&month: månadens fulla utgiftsobjekt. status=<expStatus>|vat_review.
  router.get('/cco-cf/expenses-tree', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const store = expenseStore;
      if (!store) return res.status(503).json({ error: 'expense store not ready' });
      const q = String(req.query.status || '');
      // ORD-CM-9: ägarvänliga statusgrupper (KPI-korten) + råa statusar
      const GROUPS = {
        att_hantera: ['new', 'needs_review', 'categorized'],
        godkanda: ['approved', 'ready_for_export'],
        exporterade: ['exported'],
        avvisade: ['rejected'],
      };
      const opts = {
        statuses: GROUPS[q] || null,
        status: !GROUPS[q] && q && q !== 'all' && q !== 'vat_review' ? q : null,
        vatReview: q === 'vat_review',
      };
      const summary = store.summary();
      if (req.query.year && req.query.month) {
        const expenses = store.listMonthExpenses({
          year: String(req.query.year),
          month: String(req.query.month),
          ...opts,
        });
        return res.json({ ok: true, expenses, total: expenses.length, summary });
      }
      const years = store.aggregateByMonth(opts);
      res.json({
        ok: true,
        years,
        total: years.reduce((a, y) => a + y.count, 0),
        summary,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/expenses/anomalies — ORD-CM-25: poster som väntar på ägaren
  router.get('/cco-cf/expenses/anomalies', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const store = expenseStore;
      if (!store) return res.status(503).json({ error: 'expense store not ready' });
      const anomalies = store.findAnomalies ? store.findAnomalies() : [];
      res.json({ ok: true, count: anomalies.length, anomalies });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/expenses/:id
  router.get('/cco-cf/expenses/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const store = expenseStore;
      if (!store) return res.status(503).json({ error: 'expense store not ready' });
      const e = store.getById(req.params.id);
      if (!e) return res.status(404).json({ error: 'not found' });
      res.json(e);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/v1/cco-cf/expenses/:id — permanent radering av avvisad expense
  router.delete('/cco-cf/expenses/:id', attachRole, requireAnyRole(['owner']), async (req, res) => {
    try {
      const store = expenseStore;
      if (!store) return res.status(503).json({ error: 'expense store not ready' });
      const actor = getActor(req);
      const result = await store.deleteExpense({ id: req.params.id, actor });
      res.json({ ok: true, deleted: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/expenses — skapa (från receipt eller fristående)
  router.post(
    '/cco-cf/expenses',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = expenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const actor = getActor(req);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        let expense = await store.createExpense({
          actor,
          receiptId: body.receiptId || null,
          fields: {
            supplier: body.supplier,
            amountSek: body.amountSek,
            vatSek: body.vatSek,
            vatRatePercent: body.vatRatePercent,
            date: body.date,
            category: body.category,
            paymentMethod: body.paymentMethod,
            notes: body.notes,
            customerId: body.customerId,
            encounterId: body.encounterId,
            treatmentId: body.treatmentId,
            offerId: body.offerId,
          },
        });

        expense = await enrichExpenseWithSuggestions(expense, actor);

        res.json({
          ok: true,
          expense,
          newSupplierDetected: !!(expense.supplier && !expense.supplierId),
        });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/re-suggest — kör förslagsmotorerna på alla
  // expenses som saknar suggestion. Användbart efter deploy av nya regler eller
  // när bulk-promote tidigare skapade expenses utan AI-förslag.
  router.post(
    '/cco-cf/expenses/re-suggest',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = expenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const actor = getActor(req);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const onlyMissing = body.onlyMissing !== false;
        const statusFilter = body.status || null;
        const limit = Math.max(1, Math.min(5000, parseInt(body.limit, 10) || 1000));

        let candidates = store.listExpenses({ limit: 5000 });
        if (statusFilter) {
          candidates = candidates.filter((e) => e.status === statusFilter);
        }
        if (onlyMissing) {
          candidates = candidates.filter((e) => !e.suggestion || !e.suggestion.bestMatch);
        }
        candidates = candidates.slice(0, limit);

        const processed = [];
        for (const expense of candidates) {
          try {
            const enriched = await enrichExpenseWithSuggestions(expense, actor);
            processed.push({
              id: enriched.id,
              status: enriched.status,
              category: enriched.category,
              suggestion: enriched.suggestion
                ? {
                    ruleName: enriched.suggestion.bestMatch?.ruleName || null,
                    confidence: enriched.suggestion.bestMatch?.confidence || null,
                    source: enriched.suggestion.bestMatch?.source || null,
                  }
                : null,
            });
          } catch (err) {
            processed.push({ id: expense.id, error: err.message });
          }
        }

        const withSuggestion = processed.filter((p) => p.suggestion).length;
        res.json({
          ok: true,
          processed: processed.length,
          withSuggestion,
          details: processed,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/bulk-approve-suggestions — godkänn AI-förslag
  // på alla befintliga expenses som har confidence >= threshold. Detta är
  // komplementet till bulk-promote: bulk-promote skapar nya expenses från
  // kvitton, medan denna endpoint godkänner förslag på redan skapade expenses.
  router.post(
    '/cco-cf/expenses/bulk-approve-suggestions',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const exStore = expenseStore;
        const rStore = ruleStore;
        if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
        const actor = getActor(req);
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const threshold = typeof body.threshold === 'number' ? body.threshold : 0.7;
        const limit = Math.max(1, Math.min(5000, parseInt(body.limit, 10) || 1000));
        const dryRun = body.dryRun === true;

        const candidates = exStore
          .listExpenses({ limit: 5000 })
          .filter((e) => e.status === 'needs_review' || e.status === 'new')
          .filter(
            (e) =>
              e.suggestion &&
              e.suggestion.bestMatch &&
              typeof e.suggestion.bestMatch.confidence === 'number' &&
              e.suggestion.bestMatch.confidence >= threshold
          )
          .sort((a, b) => b.suggestion.bestMatch.confidence - a.suggestion.bestMatch.confidence)
          .slice(0, limit);

        if (dryRun) {
          return res.json({
            ok: true,
            threshold,
            dryRun,
            considered: candidates.length,
            approved: candidates.length,
            errorCount: 0,
            approvedIds: candidates.map((c) => c.id),
          });
        }

        const ids = candidates.map((c) => c.id);
        const { approved: approvedDetails, errors: approvalErrors } =
          await exStore.approveSuggestionsBulk({
            ids,
            actor,
            onAppliedPerItem: async ({ id, ruleId, confidence }) => {
              if (rStore && ruleId) {
                try {
                  await rStore.recordApplied({
                    id: ruleId,
                    expenseId: id,
                    actor,
                    confidence,
                  });
                } catch {}
              }
            },
          });

        const approved = approvedDetails.map((d) => ({
          id: d.id,
          status: d.status,
          category: d.category,
          ruleName: d.ruleId,
          confidence: d.confidence,
        }));

        res.json({
          ok: true,
          threshold,
          dryRun,
          considered: candidates.length,
          approved: approved.length,
          errorCount: approvalErrors.length,
          approvedIds: approved.map((a) => a.id),
          errors: approvalErrors,
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // PATCH /api/v1/cco-cf/expenses/:id — uppdatera metadata/kategori
  router.patch(
    '/cco-cf/expenses/:id',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = expenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        // CF.9: blockera mutation om expense.date faller i en stängd period
        const closeStore = monthlyCloseStore;
        const existing = store.getById?.(req.params.id);
        if (closeStore && existing?.date && closeStore.isDateInLockedPeriod(existing.date)) {
          return res.status(423).json({
            error: `Perioden ${String(existing.date).slice(0, 7)} är låst (closed). Owner måste reopen perioden för att ändra.`,
            periodLocked: true,
          });
        }
        const actor = getActor(req);
        const expense = await store.updateExpense({
          id: req.params.id,
          patch: req.body || {},
          actor,
        });
        res.json({ ok: true, expense });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/:id/status — transition
  router.post(
    '/cco-cf/expenses/:id/status',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = expenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const actor = getActor(req);
        const expense = await store.transitionStatus({
          id: req.params.id,
          newStatus: req.body?.status,
          reason: req.body?.reason,
          actor,
        });
        res.json({ ok: true, expense });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/:id/attachment — extra bilaga
  router.post(
    '/cco-cf/expenses/:id/attachment',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    cfExpenseUpload.single('file'),
    async (req, res) => {
      try {
        const store = expenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        if (!req.file) return res.status(400).json({ error: 'file krävs' });
        const actor = getActor(req);
        const result = await store.attachFile({
          id: req.params.id,
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalFileName: req.file.originalname,
          actor,
        });
        res.json({ ok: true, attachment: result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/export — bygg export-paket (CSV+JSON) utan Fortnox
  router.post(
    '/cco-cf/expenses/export',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        if (process.env.ARCANA_CFO_EXPORT_BLOCKED_UNTIL_REPAIR === 'true') {
          return res.status(503).json({
            ok: false,
            error: 'export_blocked_until_repair',
            detail: 'Kvitto-reparation pågår. Export är tillfälligt avstängd.',
          });
        }
        const store = expenseStore;
        const secure = secureStorage;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        if (!secure?.putObject) return res.status(503).json({ error: 'secure storage not ready' });
        const actor = getActor(req);
        const { buildExpenseExportPackage } = require('../cfo/cfoExpenseExporter');
        const result = await buildExpenseExportPackage({
          expenseStore: store,
          secureStorage: secure,
          actor,
          auditLog: auditLog,
          statusFilter: req.body?.statusFilter || 'ready_for_export',
          expenseIds: Array.isArray(req.body?.expenseIds) ? req.body.expenseIds : null,
          fromDate: req.body?.fromDate || null,
          toDate: req.body?.toDate || null,
        });
        if (!result.ok) return res.status(400).json(result);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ORD-CM-74 · Bulk-release av expenses som fastnat med fortnoxSyncStatus='blocked_integration'.
  // De som redan är 'ready_for_export' exporteras direkt. De som är 'categorized' med
  // kategori 'annat' får rätt kategori/moms/vatMode utifrån en leverantörsmappning.
  // Kräver owner + confirm=true; dryRun=true som standard.
  router.post(
    '/cco-cf/expenses/bulk-release-blocked',
    attachRole,
    requireAnyRole(['owner']),
    jsonParser,
    async (req, res) => {
      try {
        if (process.env.ARCANA_CFO_EXPORT_BLOCKED_UNTIL_REPAIR === 'true') {
          return res.status(503).json({
            ok: false,
            error: 'export_blocked_until_repair',
            detail: 'Kvitto-reparation pågår. Bulk-release är tillfälligt avstängd.',
          });
        }
        const store = expenseStore;
        if (!store) return res.status(503).json({ error: 'expense store not ready' });
        const body = req.body || {};
        const confirm = body.confirm === true;
        const dryRun = confirm ? false : body.dryRun !== false;
        if (!confirm && !dryRun) {
          return res.status(400).json({
            ok: false,
            error: 'confirm måste vara true för skarp körning',
          });
        }
        const actor = getActor(req);

        // Leverantörsbaserad kategorimappning för de poster som fortfarande har category='annat'.
        // Anpassad efter ägarbeslut 2026-08-17: "3" (gör båda i ett svep).
        const supplierMappings = [
          {
            contains: 'Elite Services Group',
            category: 'forbrukning',
            vatRatePercent: 25,
            vatMode: 'standard_25',
          },
          {
            contains: 'Comfort Hotel Helsinki',
            category: 'resor',
            vatRatePercent: 0,
            vatMode: 'reverse_charge_eu',
          },
          {
            contains: 'Removify',
            category: 'marknadsforing',
            vatRatePercent: 0,
            vatMode: 'reverse_charge_non_eu',
          },
          { contains: 'Doktor24', category: 'personal', vatRatePercent: 0, vatMode: 'standard_0' },
          {
            contains: 'Uber Eats',
            category: 'mat_representation',
            vatRatePercent: 12,
            vatMode: 'standard_12',
          },
          {
            contains: 'Uber Payments',
            category: 'resor',
            vatRatePercent: 25,
            vatMode: 'standard_25',
          },
          { contains: 'Uber', category: 'resor', vatRatePercent: 25, vatMode: 'standard_25' },
          {
            // 'Flixbus' — inte 'Flix': substring-matchade "Netflix" och
            // mappade privata streaming-poster som resor (QA-fynd 2026-08-31).
            contains: 'Flixbus',
            category: 'resor',
            vatRatePercent: 0,
            vatMode: 'standard_0',
          },
          {
            contains: 'JustAnswer',
            category: 'juridik_konsult',
            vatRatePercent: 0,
            vatMode: 'reverse_charge_non_eu',
          },
          {
            contains: 'Shift Espresso',
            category: 'mat_representation',
            vatRatePercent: 0,
            vatMode: 'reverse_charge_non_eu',
          },
          {
            contains: 'Spotify',
            category: 'marknadsforing',
            vatRatePercent: 25,
            vatMode: 'standard_25',
          },
          {
            contains: 'Anthropic Ireland',
            category: 'it_telefoni',
            vatRatePercent: 0,
            vatMode: 'standard_0',
          },
        ];

        const blocked = store.listExpenses({
          fortnoxSyncStatus: 'blocked_integration',
          limit: 1000,
        });
        const readyForExport = blocked.filter((e) => e.status === 'ready_for_export');
        const categorized = blocked.filter((e) => e.status === 'categorized');

        const result = {
          ok: true,
          dryRun,
          readyForExport: {
            count: readyForExport.length,
            exported: [],
          },
          categorized: {
            count: categorized.length,
            mapped: [],
            unmapped: [],
          },
        };

        for (const e of readyForExport) {
          if (!dryRun) {
            await store.transitionStatus({
              id: e.id,
              newStatus: 'exported',
              actor,
              reason: 'bulk-release-blocked: ready_for_export → exported',
            });
            await store.markFortnoxUnblocked({ id: e.id, actor });
          }
          result.readyForExport.exported.push({
            id: e.id,
            supplier: e.supplier,
            amountSek: e.amountSek,
            category: e.category,
          });
        }

        for (const e of categorized) {
          const mapping = supplierMappings.find((m) =>
            String(e.supplier || '')
              .toLowerCase()
              .includes(m.contains.toLowerCase())
          );
          if (!mapping) {
            result.categorized.unmapped.push({
              id: e.id,
              supplier: e.supplier,
              amountSek: e.amountSek,
            });
            continue;
          }
          if (!dryRun) {
            await store.updateExpense({
              id: e.id,
              patch: { category: mapping.category, vatRatePercent: mapping.vatRatePercent },
              actor,
            });
            await store.setVatMode({
              id: e.id,
              vatMode: mapping.vatMode,
              vatRatePercent: mapping.vatRatePercent,
              actor,
            });
            await store.transitionStatus({
              id: e.id,
              newStatus: 'approved',
              actor,
              reason: 'bulk-release-blocked: categorized → approved',
            });
            await store.transitionStatus({
              id: e.id,
              newStatus: 'ready_for_export',
              actor,
              reason: 'bulk-release-blocked: approved → ready_for_export',
            });
            await store.transitionStatus({
              id: e.id,
              newStatus: 'exported',
              actor,
              reason: 'bulk-release-blocked: ready_for_export → exported',
            });
            await store.markFortnoxUnblocked({ id: e.id, actor });
          }
          result.categorized.mapped.push({
            id: e.id,
            supplier: e.supplier,
            amountSek: e.amountSek,
            category: mapping.category,
            vatRatePercent: mapping.vatRatePercent,
            vatMode: mapping.vatMode,
          });
        }

        res.json(result);
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // GET /api/v1/cco-cf/expenses/export/:batchId/:fileType — ladda ner export-fil
  router.get(
    '/cco-cf/expenses/export/:batchId/:fileType',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const secure = secureStorage;
        if (!secure?.getObject) return res.status(503).json({ error: 'secure storage not ready' });
        const { batchId, fileType } = req.params;
        if (!/^expbatch_[a-f0-9]+$/.test(batchId))
          return res.status(400).json({ error: 'ogiltig batchId' });
        if (!['csv', 'json'].includes(fileType))
          return res.status(400).json({ error: 'fileType måste vara csv eller json' });
        // CF.3-fix 2026-06-02: getObject returnerar {stream, buffer, mimeType, ...}
        // VIKTIG: använd UTC-månader. Exporterns ym=new Date().toISOString().slice(0,7)
        // är UTC. Local Date-konstruktor + toISOString shiftar månaden bakåt i positiva
        // tidszoner (t.ex. Stockholm) första dagen i månaden.
        const now = new Date();
        const utcYear = now.getUTCFullYear();
        const utcMonth = now.getUTCMonth();
        let obj = null;
        let foundKey = null;
        for (let i = 0; i < 12 && !obj; i += 1) {
          const probe = new Date(Date.UTC(utcYear, utcMonth - i, 1));
          const ym = probe.toISOString().slice(0, 7);
          const key = `exports/expenses/${ym}/${batchId}.${fileType}`;
          try {
            obj = await secure.getObject(key);
            foundKey = key;
          } catch {}
        }
        if (!obj) return res.status(404).json({ error: 'export-fil hittas ej' });
        const buf = obj.buffer || obj;
        try {
          const actor = getActor(req);
          auditLog?.append?.({
            kind: 'cf.export.downloaded',
            surface: 'cco.cf.expense',
            ts: new Date().toISOString(),
            actor: { userId: actor.userId, role: actor.role },
            target: { kind: 'expense_batch', id: batchId },
            detail: { fileType, storageKey: foundKey, sizeBytes: buf.length },
          });
        } catch {}
        res.setHeader('Content-Type', fileType === 'csv' ? 'text/csv' : 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${batchId}.${fileType}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(buf);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ── CF.4 (MVP 3) — Expense Rule Engine routes ────────────────
  // Auto-categorization utan AI. Human approval krävs alltid — engine
  // sätter aldrig fält direkt på expense.

  // GET /api/v1/cco-cf/rules — lista
  router.get('/cco-cf/rules', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const rs = ruleStore;
      if (!rs) return res.status(503).json({ error: 'rule store not ready' });
      const enabled =
        req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
      const rules = rs.listRules({
        enabled,
        supplier: req.query.supplier || null,
        category: req.query.category || null,
        limit: Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200)),
      });
      const summary = rs.summary();
      res.json({ ok: true, rules, summary });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/rules/:id
  router.get('/cco-cf/rules/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const rs = ruleStore;
      if (!rs) return res.status(503).json({ error: 'rule store not ready' });
      const r = rs.getById(req.params.id);
      if (!r) return res.status(404).json({ error: 'not found' });
      res.json(r);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/rules — skapa
  router.post(
    '/cco-cf/rules',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const rs = ruleStore;
        if (!rs) return res.status(503).json({ error: 'rule store not ready' });
        const rule = await rs.createRule({ actor: getActor(req), input: req.body || {} });
        res.json({ ok: true, rule });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // PATCH /api/v1/cco-cf/rules/:id — uppdatera
  router.patch(
    '/cco-cf/rules/:id',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const rs = ruleStore;
        if (!rs) return res.status(503).json({ error: 'rule store not ready' });
        const rule = await rs.updateRule({
          id: req.params.id,
          patch: req.body || {},
          actor: getActor(req),
        });
        res.json({ ok: true, rule });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // DELETE /api/v1/cco-cf/rules/:id — radera
  router.delete('/cco-cf/rules/:id', attachRole, requireAnyRole(cfMutateRBAC), async (req, res) => {
    try {
      const rs = ruleStore;
      if (!rs) return res.status(503).json({ error: 'rule store not ready' });
      const out = await rs.deleteRule({ id: req.params.id, actor: getActor(req) });
      res.json(out);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/rules/test — dry-run: kör regler mot ett expense-objekt eller mot existerande
  router.post(
    '/cco-cf/rules/test',
    attachRole,
    requireAnyRole(cfRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const rs = ruleStore;
        const exStore = expenseStore;
        if (!rs) return res.status(503).json({ error: 'rule store not ready' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const rules = rs.listRules({ enabled: true, limit: 500 });
        let target;
        if (body.expenseId && exStore) {
          target = exStore.getById(body.expenseId);
          if (!target) return res.status(404).json({ error: 'expense finns ej' });
        } else if (body.expense) {
          target = body.expense;
        } else {
          return res.status(400).json({ error: 'expense eller expenseId krävs' });
        }
        const historyExpenses = exStore
          ? exStore.listExpenses({ limit: 200 }).filter((h) => h.id !== target.id)
          : [];
        const result = rs.evaluateAllRules({ expense: target, rules, historyExpenses });
        res.json({ ok: true, ...result });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/:id/suggestion/approve
  router.post(
    '/cco-cf/expenses/:id/suggestion/approve',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const exStore = expenseStore;
        if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
        const actor = getActor(req);
        // Snappa upp suggestion innan approve, för att veta vendor-koppling
        const pre = exStore.getById(req.params.id);
        const expense = await exStore.approveSuggestion({
          id: req.params.id,
          actor,
          onApplied: async ({ ruleId, confidence }) => {
            if (ruleStore && ruleId) {
              await ruleStore.recordApplied({
                id: ruleId,
                expenseId: req.params.id,
                actor,
                suggestionConfidence: confidence,
              });
            }
          },
        });
        // CF.5: om suggestion var vendor-baserad eller expense har supplierId,
        // räkna upp vendor.timesUsed
        if (vendorStore && pre?.suggestion?.bestMatch?.vendorId) {
          await vendorStore.recordUsed({
            id: pre.suggestion.bestMatch.vendorId,
            expenseId: expense.id,
            amount: Number(expense.amountSek) || 0,
            actor,
          });
        } else if (vendorStore && expense.supplierId) {
          await vendorStore.recordUsed({
            id: expense.supplierId,
            expenseId: expense.id,
            amount: Number(expense.amountSek) || 0,
            actor,
          });
        }
        res.json({ ok: true, expense });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/:id/suggestion/reject
  router.post(
    '/cco-cf/expenses/:id/suggestion/reject',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const exStore = expenseStore;
        if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
        const actor = getActor(req);
        const expense = await exStore.rejectSuggestion({
          id: req.params.id,
          reason: req.body?.reason || null,
          actor,
          onRejected: async ({ ruleId, reason }) => {
            if (ruleStore && ruleId) {
              await ruleStore.recordRejected({
                id: ruleId,
                expenseId: req.params.id,
                reason,
                actor,
              });
            }
          },
        });
        res.json({ ok: true, expense });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/:id/save-as-rule — skapa ny rule från expense-fält
  router.post(
    '/cco-cf/expenses/:id/save-as-rule',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const exStore = expenseStore;
        if (!exStore || !ruleStore) return res.status(503).json({ error: 'stores not ready' });
        const e = exStore.getById(req.params.id);
        if (!e) return res.status(404).json({ error: 'expense finns ej' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const supplier = body.supplier || e.supplier;
        if (!supplier)
          return res.status(400).json({ error: 'supplier krävs (på expense eller body)' });
        const ruleInput = {
          name: body.name || `Regel: ${supplier}${e.category ? ' → ' + e.category : ''}`,
          description: body.description || `Skapad från expense ${e.id}`,
          priority: Number(body.priority) || 10,
          enabled: body.enabled !== false,
          matchType: body.matchType || 'any',
          conditions: body.conditions || [{ type: 'supplier_contains', value: supplier }],
          setCategory: body.setCategory || e.category || null,
          setVatRatePercent: body.setVatRatePercent ?? e.vatRatePercent ?? null,
          setPaymentMethod: body.setPaymentMethod || e.paymentMethod || null,
          setSupplier: body.setSupplier || null,
          setNotes: body.setNotes || null,
        };
        const rule = await ruleStore.createRule({ actor: getActor(req), input: ruleInput });
        res.json({ ok: true, rule, sourceExpenseId: e.id });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ── CF.5 (MVP 4) — Finance Vendor Register routes ────────────
  // Leverantörsregister för ekonomi. Inte att förväxla med ccoVendorRegister
  // (PUB-avtal/databehandlare för GDPR Art.28/30).

  // GET /api/v1/cco-cf/suppliers — lista med filter
  router.get('/cco-cf/suppliers', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const vs = vendorStore;
      if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
      const active =
        req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
      const needsReview = req.query.needsReview === 'true';
      const vendors = vs.listVendors({
        active,
        needsReview,
        source: req.query.source || null,
        query: req.query.q || null,
        limit: Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200)),
      });
      res.json({ ok: true, vendors, summary: vs.summary() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/suppliers/:id
  router.get('/cco-cf/suppliers/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const vs = vendorStore;
      if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
      const v = vs.getById(req.params.id);
      if (!v) return res.status(404).json({ error: 'not found' });
      res.json(v);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/suppliers — skapa
  router.post(
    '/cco-cf/suppliers',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const vs = vendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const vendor = await vs.createVendor({ actor: getActor(req), input: req.body || {} });
        res.json({ ok: true, vendor });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // PATCH /api/v1/cco-cf/suppliers/:id — uppdatera
  router.patch(
    '/cco-cf/suppliers/:id',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const vs = vendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const vendor = await vs.updateVendor({
          id: req.params.id,
          patch: req.body || {},
          actor: getActor(req),
        });
        res.json({ ok: true, vendor });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/suppliers/:id/deactivate
  router.post(
    '/cco-cf/suppliers/:id/deactivate',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const vs = vendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const vendor = await vs.deactivateVendor({
          id: req.params.id,
          reason: req.body?.reason || null,
          actor: getActor(req),
        });
        res.json({ ok: true, vendor });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/suppliers/:id/activate
  router.post(
    '/cco-cf/suppliers/:id/activate',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    async (req, res) => {
      try {
        const vs = vendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const vendor = await vs.activateVendor({ id: req.params.id, actor: getActor(req) });
        res.json({ ok: true, vendor });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/suppliers/match — testa vendor-match mot supplier-string
  router.post(
    '/cco-cf/suppliers/match',
    attachRole,
    requireAnyRole(cfRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const vs = vendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const sup = req.body?.supplier;
        if (!sup) return res.status(400).json({ error: 'supplier krävs' });
        const match = vs.findBySupplierName(sup);
        res.json({ ok: true, match });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/:id/link-supplier — manuell länk
  router.post(
    '/cco-cf/expenses/:id/link-supplier',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const exStore = expenseStore;
        if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
        const supplierId = req.body?.supplierId;
        if (!supplierId) return res.status(400).json({ error: 'supplierId krävs' });
        if (vendorStore && !vendorStore.getById(supplierId)) {
          return res.status(404).json({ error: 'vendor finns ej' });
        }
        const actor = getActor(req);
        const expense = await exStore.linkSupplier({
          id: req.params.id,
          supplierId,
          matchType: 'manual',
          confidence: 1.0,
          actor,
        });
        if (vendorStore) {
          await vendorStore.recordMatched({
            id: supplierId,
            expenseId: expense.id,
            amount: Number(expense.amountSek) || 0,
            actor,
          });
        }
        res.json({ ok: true, expense });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/suppliers/:id/link-rule — koppla en regel till en vendor
  router.post(
    '/cco-cf/suppliers/:id/link-rule',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const vs = vendorStore;
        if (!vs) return res.status(503).json({ error: 'vendor store not ready' });
        const ruleId = req.body?.ruleId;
        if (!ruleId) return res.status(400).json({ error: 'ruleId krävs' });
        if (ruleStore && !ruleStore.getById(ruleId))
          return res.status(404).json({ error: 'rule finns ej' });
        const vendor = await vs.linkRule({ id: req.params.id, ruleId, actor: getActor(req) });
        res.json({ ok: true, vendor });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ── CF.6 (MVP 5) — VAT-rules routes ──────────────────────────
  // Manuell vat-mode-set + suggestion approve

  // GET /api/v1/cco-cf/vat-modes — enum-list för UI
  router.get('/cco-cf/vat-modes', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const {
        VALID_VAT_MODES,
        VAT_MODE_LABELS,
        CATEGORY_DEFAULT_VAT_MODE,
      } = require('../cfo/cfoExpenseVatRules');
      res.json({
        ok: true,
        modes: VALID_VAT_MODES,
        labels: VAT_MODE_LABELS,
        categoryDefaults: CATEGORY_DEFAULT_VAT_MODE,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/meta — alla CFO-enum-konstanter för UI
  router.get('/cco-cf/meta', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const {
        VALID_STATUSES,
        VALID_CATEGORIES,
        VALID_PAYMENT_METHODS,
        VALID_VAT_RATES,
        VALID_FORTNOX_SYNC_STATUSES,
      } = require('../cfo/cfoExpenseStore');
      const {
        VALID_VAT_MODES,
        VAT_MODE_LABELS,
        CATEGORY_DEFAULT_VAT_MODE,
        VALID_REVIEW_STATUSES,
      } = require('../cfo/cfoExpenseVatRules');
      const {
        VALID_REVIEW_STATUSES: VALID_EXPORT_REVIEW_STATUSES,
      } = require('../cfo/cfoFinanceReviewStore');
      res.json({
        ok: true,
        statuses: VALID_STATUSES,
        categories: VALID_CATEGORIES,
        paymentMethods: VALID_PAYMENT_METHODS,
        vatRates: VALID_VAT_RATES,
        fortnoxSyncStatuses: VALID_FORTNOX_SYNC_STATUSES,
        vatModes: VALID_VAT_MODES,
        vatLabels: VAT_MODE_LABELS,
        categoryDefaults: CATEGORY_DEFAULT_VAT_MODE,
        reviewStatuses: VALID_REVIEW_STATUSES,
        exportReviewStatuses: VALID_EXPORT_REVIEW_STATUSES,
        months: {
          '01': 'Januari',
          '02': 'Februari',
          '03': 'Mars',
          '04': 'April',
          '05': 'Maj',
          '06': 'Juni',
          '07': 'Juli',
          '08': 'Augusti',
          '09': 'September',
          10: 'Oktober',
          11: 'November',
          12: 'December',
          '??': 'Okänt datum',
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/expenses/:id/vat — sätt vatMode (godkänner samtidigt)
  router.post(
    '/cco-cf/expenses/:id/vat',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const exStore = expenseStore;
        if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
        const actor = getActor(req);
        const expense = await exStore.setVatMode({
          id: req.params.id,
          vatMode: req.body?.vatMode,
          vatRatePercent: req.body?.vatRatePercent,
          markedReview: !!req.body?.markedReview,
          actor,
        });
        res.json({ ok: true, expense });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/:id/vat/suggest — kör suggestVatMode + spara
  router.post(
    '/cco-cf/expenses/:id/vat/suggest',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    async (req, res) => {
      try {
        const exStore = expenseStore;
        if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
        const e = exStore.getById(req.params.id);
        if (!e) return res.status(404).json({ error: 'expense finns ej' });
        const { suggestVatMode } = require('../cfo/cfoExpenseVatRules');
        const sug = suggestVatMode({
          category: e.category,
          vatRatePercent: e.vatRatePercent,
          supplierCountry: 'SE',
        });
        if (!sug) return res.json({ ok: false, reason: 'no_suggestion' });
        const actor = getActor(req);
        const expense = await exStore.setVatSuggestion({
          id: req.params.id,
          suggestion: sug,
          actor,
        });
        res.json({ ok: true, expense });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ── CF.7 (MVP 6) — Recurring Expense routes ──────────────────
  // GET /api/v1/cco-cf/recurring — lista
  router.get('/cco-cf/recurring', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const rs = recurringStore;
      if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
      const list = rs.listRecurrings({
        status: req.query.status || null,
        supplierId: req.query.supplierId || null,
        frequency: req.query.frequency || null,
        source: req.query.source || null,
        dueBefore: req.query.dueBefore || null,
        limit: Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 200)),
      });
      res.json({ ok: true, recurrings: list, summary: rs.summary() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/recurring/:id
  router.get('/cco-cf/recurring/:id', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const rs = recurringStore;
      if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
      const r = rs.getById(req.params.id);
      if (!r) return res.status(404).json({ error: 'not found' });
      res.json(r);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/recurring — skapa manuell
  router.post(
    '/cco-cf/recurring',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const rs = recurringStore;
        if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
        const r = await rs.createRecurring({ actor: getActor(req), input: req.body || {} });
        res.json({ ok: true, recurring: r });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // PATCH /api/v1/cco-cf/recurring/:id
  router.patch(
    '/cco-cf/recurring/:id',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const rs = recurringStore;
        if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
        const r = await rs.updateRecurring({
          id: req.params.id,
          patch: req.body || {},
          actor: getActor(req),
        });
        res.json({ ok: true, recurring: r });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/recurring/:id/status — transition
  router.post(
    '/cco-cf/recurring/:id/status',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const rs = recurringStore;
        if (!rs) return res.status(503).json({ error: 'recurring store not ready' });
        const r = await rs.transitionStatus({
          id: req.params.id,
          newStatus: req.body?.status,
          reason: req.body?.reason || null,
          actor: getActor(req),
        });
        res.json({ ok: true, recurring: r });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/recurring/detect — kör auto-detection mot historiska expenses
  router.post(
    '/cco-cf/recurring/detect',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const rs = recurringStore;
        const exStore = expenseStore;
        if (!rs || !exStore) return res.status(503).json({ error: 'stores not ready' });
        const expenses = exStore.listExpenses({ limit: 1000 });
        const existing = rs.listRecurrings({ limit: 1000 });
        const proposals = rs.detectRecurringFromHistory({
          expenses,
          existingRecurrings: existing,
        });
        // Spara förslag som proposed (om body.save=true)
        const actor = getActor(req);
        const saved = [];
        if (req.body?.save === true) {
          for (const p of proposals) {
            const r = await rs.createRecurring({
              actor,
              input: { ...p, source: 'detected_from_expenses', status: 'proposed' },
            });
            saved.push(r);
          }
        }
        res.json({ ok: true, proposalCount: proposals.length, proposals, saved });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/expenses/:id/link-recurring — manuell länk
  router.post(
    '/cco-cf/expenses/:id/link-recurring',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const exStore = expenseStore;
        const recStore = recurringStore;
        if (!exStore) return res.status(503).json({ error: 'expense store not ready' });
        const recurringId = req.body?.recurringExpenseId;
        if (!recurringId) return res.status(400).json({ error: 'recurringExpenseId krävs' });
        if (recStore && !recStore.getById(recurringId))
          return res.status(404).json({ error: 'recurring finns ej' });
        const actor = getActor(req);
        const expense = await exStore.linkRecurring({
          id: req.params.id,
          recurringExpenseId: recurringId,
          confidence: 1.0,
          actor,
        });
        if (recStore) {
          await recStore.recordExpenseMatch({ id: recurringId, expense, actor });
        }
        res.json({ ok: true, expense });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ── CF.8 (MVP 7) — Accountant Review Portal routes ───────────
  // Revisor får läsa allt + skriva på review-objekt (men aldrig original-expense).

  // GET /api/v1/cco-cf/review/exports — lista alla export-batches m. review-status
  router.get('/cco-cf/review/exports', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const exStore = expenseStore;
      const revStore = reviewStore;
      if (!exStore || !revStore) return res.status(503).json({ error: 'stores not ready' });
      const batches = exStore.listExportBatches({ limit: 500 });
      const enriched = batches.map((b) => {
        const review = revStore.getByBatchId(b.batchId);
        return {
          ...b,
          review: review
            ? {
                id: review.id,
                status: review.status,
                reviewer: review.reviewer,
                reviewedAt: review.reviewedAt,
                decidedAt: review.decidedAt,
                noteCount: (review.notes || []).length,
                hasManifest: !!review.manifestKey,
              }
            : { status: 'pending', noteCount: 0, hasManifest: false },
          expenseCount: (b.expenseIds || []).length,
        };
      });
      res.json({ ok: true, batches: enriched, summary: revStore.summary() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/review/exports/:batchId — full detalj
  router.get(
    '/cco-cf/review/exports/:batchId',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const exStore = expenseStore;
        const revStore = reviewStore;
        if (!exStore || !revStore) return res.status(503).json({ error: 'stores not ready' });
        const batchId = req.params.batchId;
        const batch = exStore.listExportBatches({ limit: 500 }).find((b) => b.batchId === batchId);
        if (!batch) return res.status(404).json({ error: 'batch finns ej' });
        const expenses = exStore.listExpenses({ batchId, limit: 5000 });
        const review = await revStore.getOrCreateForBatch({ batchId, actor: getActor(req) });
        const linkedReceiptIds = [...new Set(expenses.map((e) => e.receiptId).filter(Boolean))];
        const receipts = receiptStore?.getById
          ? linkedReceiptIds.map((id) => receiptStore.getById(id)).filter(Boolean)
          : [];
        res.json({ ok: true, batch, expenses, receipts, review });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/review/exports/:batchId/status
  router.post(
    '/cco-cf/review/exports/:batchId/status',
    attachRole,
    requireAnyRole(cfRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const revStore = reviewStore;
        if (!revStore) return res.status(503).json({ error: 'review store not ready' });
        const review = await revStore.setStatus({
          batchId: req.params.batchId,
          newStatus: req.body?.status,
          reason: req.body?.reason || null,
          actor: getActor(req),
        });
        res.json({ ok: true, review });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/review/exports/:batchId/note
  router.post(
    '/cco-cf/review/exports/:batchId/note',
    attachRole,
    requireAnyRole(cfRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const revStore = reviewStore;
        if (!revStore) return res.status(503).json({ error: 'review store not ready' });
        const review = await revStore.addNote({
          batchId: req.params.batchId,
          text: req.body?.text,
          actor: getActor(req),
        });
        res.json({ ok: true, review });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/review/exports/:batchId/build-package
  router.post(
    '/cco-cf/review/exports/:batchId/build-package',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const exStore = expenseStore;
        const revStore = reviewStore;
        const secure = secureStorage;
        if (!exStore || !revStore || !secure)
          return res.status(503).json({ error: 'stores not ready' });
        const { buildReviewPackage } = require('../cfo/cfoFinanceReviewPackager');
        const result = await buildReviewPackage({
          expenseStore: exStore,
          receiptStore,
          secureStorage: secure,
          batchId: req.params.batchId,
          actor: getActor(req),
          reviewStore: revStore,
          auditLog: auditLog,
        });
        if (!result.ok) return res.status(400).json(result);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-cf/review/exports/:batchId/manifest
  router.get(
    '/cco-cf/review/exports/:batchId/manifest',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const revStore = reviewStore;
        const secure = secureStorage;
        if (!revStore || !secure?.getObject)
          return res.status(503).json({ error: 'stores not ready' });
        const review = revStore.getByBatchId(req.params.batchId);
        if (!review || !review.manifestKey)
          return res.status(404).json({ error: 'manifest finns ej (kör build-package först)' });
        let obj;
        try {
          obj = await secure.getObject(review.manifestKey);
        } catch (e) {
          return res.status(404).json({ error: 'manifest-fil saknas', detail: e?.message });
        }
        const actor = getActor(req);
        try {
          await revStore.recordDownload({
            batchId: req.params.batchId,
            fileType: 'manifest',
            sizeBytes: (obj.buffer || obj).length,
            actor,
          });
        } catch {}
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${req.params.batchId}-manifest.json"`
        );
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(obj.buffer || obj);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-cf/review/exports/:batchId/attachment/:receiptId — secure download
  router.get(
    '/cco-cf/review/exports/:batchId/attachment/:receiptId',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const exStore = expenseStore;
        const revStore = reviewStore;
        const secure = secureStorage;
        if (!exStore || !receiptStore || !revStore || !secure?.getObject)
          return res.status(503).json({ error: 'stores not ready' });
        // Verifiera att receipt är länkad till en expense i batchen
        const expenses = exStore.listExpenses({ batchId: req.params.batchId, limit: 5000 });
        if (!expenses.some((e) => e.receiptId === req.params.receiptId)) {
          return res.status(403).json({ error: 'receipt ej kopplad till denna batch' });
        }
        const r = receiptStore.getById(req.params.receiptId);
        if (!r) return res.status(404).json({ error: 'receipt finns ej' });
        let obj;
        try {
          obj = await secure.getObject(r.storageKey);
        } catch (e) {
          return res.status(404).json({ error: 'secure-storage-fil saknas', detail: e?.message });
        }
        const actor = getActor(req);
        try {
          await revStore.recordDownload({
            batchId: req.params.batchId,
            fileType: 'attachment',
            sizeBytes: (obj.buffer || obj).length,
            actor,
          });
        } catch {}
        res.setHeader('Content-Type', r.mimeType || obj.mimeType || 'application/octet-stream');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${r.originalFileName || r.id}"`
        );
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(obj.buffer || obj);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // GET /finance-review.html mappas via static (public/)

  // ─────────────────────────────────────────────────────────────
  // CF.9 (MVP 8) — Finance Reports + Monthly Close
  // ─────────────────────────────────────────────────────────────
  const cfReviewerRBAC = ['owner', 'revisor']; // approve/correct/close/begin-review
  const cfOwnerOnlyRBAC = ['owner']; // reopen

  function cfBuildReportData() {
    return {
      expenses: expenseStore?.listExpenses?.({ limit: 5000 }) || [],
      receipts: receiptStore?.listReceipts?.({ limit: 5000 }) || [],
      vendors: vendorStore?.listVendors?.({ limit: 2000 }) || [],
      recurrings: recurringStore?.listRecurrings?.({ limit: 2000 }) || [],
      reviews: reviewStore?.listReviews?.({ limit: 2000 }) || [],
      exportBatches: expenseStore?.listExportBatches?.({ limit: 500 }) || [],
    };
  }

  // GET /api/v1/cco-cf/reports — lista tillgängliga rapport-typer + meta
  router.get('/cco-cf/reports', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const { VALID_REPORT_KINDS, REPORT_DEFS } = require('../cfo/cfoFinanceReportEngine');
      return res.json({
        ok: true,
        availableKinds: VALID_REPORT_KINDS,
        reports: REPORT_DEFS,
        fortnoxStatus: 'BLOCKED_INTEGRATION',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/reports/generate — generera rapport (no persistence)
  router.post(
    '/cco-cf/reports/generate',
    attachRole,
    requireAnyRole(cfRBAC),
    jsonParser,
    (req, res) => {
      try {
        const { generateReport } = require('../cfo/cfoFinanceReportEngine');
        const { kind, period } = req.body || {};
        const actor = getActor(req);
        const data = cfBuildReportData();
        const report = generateReport({ kind, period, data, generatedBy: actor });
        try {
          auditLog.append({
            action: 'cf.report.generated',
            kind: 'cf.report.generated',
            surface: 'cco.cf.reports',
            ts: new Date().toISOString(),
            actor,
            detail: { reportKind: kind, period, anomalyCount: report.anomalies?.length || 0 },
          });
        } catch {}
        return res.json({ ok: true, report });
      } catch (err) {
        const code =
          err.message?.startsWith('Okänd') || err.message?.startsWith('Ogiltig') ? 400 : 500;
        res.status(code).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/reports/package — generera + spara till secure storage
  router.post(
    '/cco-cf/reports/package',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const { buildReportPackage } = require('../cfo/cfoFinanceReportPackager');
        const secure = secureStorage;
        if (!secure) return res.status(503).json({ error: 'secure storage saknas' });
        const { kind, period } = req.body || {};
        const actor = getActor(req);
        const data = cfBuildReportData();
        const result = await buildReportPackage({
          kind,
          period,
          data,
          secureStorage: secure,
          actor,
          auditLog: auditLog,
        });
        return res.json({
          ok: true,
          packageId: result.packageId,
          manifest: result.manifest,
          report: result.report,
        });
      } catch (err) {
        const code =
          err.message?.startsWith('Okänd') || err.message?.startsWith('Ogiltig') ? 400 : 500;
        res.status(code).json({ error: err.message });
      }
    }
  );

  // GET /api/v1/cco-cf/reports/package/:period/:kind/:packageId/download/:fileKind
  router.get(
    '/cco-cf/reports/package/:period/:kind/:packageId/download/:fileKind',
    attachRole,
    requireAnyRole(cfRBAC),
    async (req, res) => {
      try {
        const { downloadFromPackage } = require('../cfo/cfoFinanceReportPackager');
        const secure = secureStorage;
        if (!secure) return res.status(503).json({ error: 'secure storage saknas' });
        const { period, kind, packageId, fileKind } = req.params;
        const actor = getActor(req);
        const { buffer, mimeType, sizeBytes } = await downloadFromPackage({
          packageId,
          fileKind,
          reportKind: kind,
          period,
          secureStorage: secure,
          actor,
          auditLog: auditLog,
        });
        const ext = fileKind === 'report_csv' ? 'csv' : 'json';
        res.setHeader('Content-Type', mimeType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${packageId}-${fileKind}.${ext}"`
        );
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Length', sizeBytes);
        res.send(buffer);
      } catch (err) {
        const code = err.message?.includes('finns inte') ? 404 : 500;
        res.status(code).json({ error: err.message });
      }
    }
  );

  // ── Periods (monthly close) ──────────────────────────────────

  // GET /api/v1/cco-cf/periods — lista perioder
  router.get('/cco-cf/periods', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const store = monthlyCloseStore;
      if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
      const periods = store.listPeriods({ limit: 100 });
      return res.json({ ok: true, periods, summary: store.summary() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/cco-cf/periods/:periodId — detail + checklist
  router.get('/cco-cf/periods/:periodId', attachRole, requireAnyRole(cfRBAC), (req, res) => {
    try {
      const store = monthlyCloseStore;
      if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
      const periodId = req.params.periodId;
      const period = store.getPeriod(periodId) || store.getOrInitPeriod(periodId);
      const checklist = store.evaluateChecklist({
        periodId,
        stores: {
          expenseStore: expenseStore,
          receiptStore: receiptStore,
          recurringStore: recurringStore,
          reviewStore: reviewStore,
        },
      });
      return res.json({ ok: true, period, checklist });
    } catch (err) {
      const code = err.message?.startsWith('Ogiltig') ? 400 : 500;
      res.status(code).json({ error: err.message });
    }
  });

  // POST /api/v1/cco-cf/periods/:periodId/start-close — finance/owner
  router.post(
    '/cco-cf/periods/:periodId/start-close',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = monthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const actor = getActor(req);
        const period = await store.startClose({ periodId: req.params.periodId, actor });
        return res.json({ ok: true, period });
      } catch (err) {
        res.status(err.statusCode || 400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/periods/:periodId/ready-for-review — finance/owner
  router.post(
    '/cco-cf/periods/:periodId/ready-for-review',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = monthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const actor = getActor(req);
        const period = await store.markReadyForReview({ periodId: req.params.periodId, actor });
        return res.json({ ok: true, period });
      } catch (err) {
        res.status(err.statusCode || 400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/periods/:periodId/request-correction — owner/revisor
  router.post(
    '/cco-cf/periods/:periodId/request-correction',
    attachRole,
    requireAnyRole(cfReviewerRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = monthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const actor = getActor(req);
        const reason = String(req.body?.reason || '').trim();
        if (!reason) return res.status(400).json({ error: 'reason krävs' });
        const period = await store.requestCorrection({
          periodId: req.params.periodId,
          actor,
          reason,
        });
        return res.json({ ok: true, period });
      } catch (err) {
        res.status(err.statusCode || 400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/periods/:periodId/approve — owner/revisor
  router.post(
    '/cco-cf/periods/:periodId/approve',
    attachRole,
    requireAnyRole(cfReviewerRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = monthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const actor = getActor(req);
        const period = await store.approve({ periodId: req.params.periodId, actor });
        return res.json({ ok: true, period });
      } catch (err) {
        res.status(err.statusCode || 400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/periods/:periodId/close — owner/revisor
  router.post(
    '/cco-cf/periods/:periodId/close',
    attachRole,
    requireAnyRole(cfReviewerRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = monthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const actor = getActor(req);
        const period = await store.close({ periodId: req.params.periodId, actor });
        return res.json({ ok: true, period });
      } catch (err) {
        res.status(err.statusCode || 400).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/periods/:periodId/reopen — OWNER ONLY (kräver reason)
  router.post(
    '/cco-cf/periods/:periodId/reopen',
    attachRole,
    requireAnyRole(cfOwnerOnlyRBAC),
    jsonParser,
    async (req, res) => {
      try {
        const store = monthlyCloseStore;
        if (!store) return res.status(503).json({ error: 'monthly close store not ready' });
        const actor = getActor(req);
        const reason = String(req.body?.reason || '').trim();
        if (!reason) return res.status(400).json({ error: 'reason krävs vid reopen' });
        const period = await store.reopen({ periodId: req.params.periodId, actor, reason });
        return res.json({ ok: true, period });
      } catch (err) {
        res.status(err.statusCode || 400).json({ error: err.message });
      }
    }
  );

  console.log(
    '[cco-cf] monterad: dashboard + receipts + expenses + CF.4 rules + CF.5 vendors + CF.6 vat + CF.7 recurring + CF.8 review + CF.9 reports/monthly-close (RBAC: owner/finance/revisor)'
  );

  return router;
}

module.exports = { createCfoRouter };
