'use strict';

const express = require('express');
const { extractDocument } = require('../cm/cmAiExtractor');
const { createCmMailSync, DEFAULT_FOLDER_TYPES } = require('../cm/cmMailSync');
const { promoteRecordToCfo } = require('../cm/cmCfoHandoff');

function createCmRouter({
  authStore,
  cmStore,
  graphReadConnector,
  cfoExpenseStore = null,
  secureStorage = null,
}) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';
  const ROLE_STAFF = 'STAFF';

  // Dashboard — ORD-70: inkl. auto-intagets senaste körning (statusraden i UI:t)
  router.get('/cm/dashboard', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const mailbox = process.env.CM_MAIL_ACCOUNT || 'kvitto@hairtpclinic.com';
    const autoSync = cmStore.getSyncState(mailbox, '_scheduler') || null;
    const folderSync = cmStore.getSyncState(mailbox, 'inbox') || null;
    return res.json({
      ok: true,
      ...cmStore.getDashboard(),
      autoSync,
      lastFolderSyncAt: folderSync?.lastSyncAt || null,
      maxExtractPerSync: Math.max(0, Number(process.env.CM_MAX_EXTRACT_PER_SYNC) || 10),
    });
  });

  // Inbox
  router.get('/cm/inbox', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getInbox() });
  });

  // Needs review
  router.get('/cm/needs-review', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getNeedsReview() });
  });

  // Invoices
  router.get('/cm/invoices', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getInvoices() });
  });

  // Receipts
  router.get('/cm/receipts', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getReceipts() });
  });

  // Travel
  router.get('/cm/travel', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getTravel() });
  });

  // Approval queue
  router.get('/cm/approvals', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    return res.json({ ok: true, items: cmStore.getApprovalQueue() });
  });

  // Ready for bookkeeping
  router.get('/cm/ready-for-bookkeeping', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    return res.json({ ok: true, items: cmStore.getReadyForBookkeeping() });
  });

  // Exported
  router.get('/cm/exported', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    return res.json({ ok: true, items: cmStore.getExported() });
  });

  // Duplicates
  router.get('/cm/duplicates', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, pairs: cmStore.getDuplicates() });
  });

  // Import errors
  router.get('/cm/import-errors', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    return res.json({ ok: true, items: cmStore.getImportErrors() });
  });

  // Import raw item (manual upload or mail ingestion)
  router.post('/cm/import', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const result = cmStore.importRawItem(req.body || {});
    if (!result.ok) return res.status(409).json(result);
    await cmStore.persist();
    return res.json(result);
  });

  // Create document from raw item
  router.post(
    '/cm/documents',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const doc = cmStore.createDocument(req.body || {});
      await cmStore.persist();
      return res.json({ ok: true, document: doc });
    }
  );

  // Create expense record from document
  router.post(
    '/cm/expense-records',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const record = cmStore.createExpenseRecord(req.body || {});
      await cmStore.persist();
      return res.json({ ok: true, record });
    }
  );

  // ORD-63 · Promota CM-kandidat till CFO — cfoExpenseStore äger livscykeln därefter.
  router.post(
    '/cm/expense-records/:id/promote',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore) {
        return res
          .status(503)
          .json({ ok: false, error: 'cfoExpenseStore ej monterad — promote otillgänglig' });
      }
      const record = cmStore.getExpenseRecordById(req.params.id);
      if (!record) return res.status(404).json({ ok: false, error: 'not_found' });
      if (record.cfoExpenseId) {
        return res
          .status(409)
          .json({ ok: false, error: 'already_promoted', cfoExpenseId: record.cfoExpenseId });
      }
      const documents = record.documentId
        ? [cmStore.getDocumentById(record.documentId)].filter(Boolean)
        : [];
      // ORD-75: originalmailet är underlaget — följer med till CFO-utgiften
      const rawItem = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
      const actor = {
        userId: req.user?.id || req.user?.email || 'owner',
        role: 'owner',
        via: 'cm-promote',
      };
      try {
        const result = await promoteRecordToCfo({
          record,
          documents,
          rawItem,
          cfoExpenseStore,
          actor,
        });
        if (!result.ok) return res.status(502).json(result);
        cmStore.markHandedOff(record.id, {
          cfoExpenseId: result.cfoExpense.id,
          actor: actor.userId,
        });
        await cmStore.persist();
        return res.json({
          ok: true,
          cfoExpense: result.cfoExpense,
          record: cmStore.getExpenseRecordById(record.id),
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // Mail sync — ORD-64: äkta delta-sync + bilagor + originalarkiv
  router.post('/cm/mail-sync', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const mailSync = createCmMailSync({ graphReadConnector, cmStore, secureStorage });
    // ORD-67f: kvitto@ = kanonisk CM-mailkälla (ägar-beslut 2026-07-13).
    // Env CM_MAIL_ACCOUNT överrider; fallbacken gör UI-knappen fungerande
    // utan env-deploy. Verifierad läsbar via Graph 2026-07-13 (19 mail import).
    const mailboxId =
      req.body?.mailboxId || process.env.CM_MAIL_ACCOUNT || 'kvitto@hairtpclinic.com';
    if (!mailboxId)
      return res
        .status(400)
        .json({ ok: false, error: 'Inget mailkonto konfigurerat (CM_MAIL_ACCOUNT)' });
    const folderTypes =
      Array.isArray(req.body?.folderTypes) && req.body.folderTypes.length
        ? req.body.folderTypes.map((f) => String(f))
        : DEFAULT_FOLDER_TYPES;
    const result = await mailSync.syncAll(mailboxId, folderTypes);
    // Bugbot PR #831: maska inte folder-fel — ok speglar att ALLA mappar lyckades.
    // (reprocess-routen nedan hanterar items som redan passerat delta-cursorn)
    const allOk = (result.folders || []).every((f) => f?.ok !== false);
    return res.status(allOk ? 200 : 502).json({ ok: allOk, ...result });
  });

  // ORD-68 · Reprocess: läs om rawItems utan expense-record — hämtar bilagor
  // i efterhand (mail som passerat delta-cursorn, t.ex. före ORD-67f) och kör
  // om extraktionen på kombinerat underlag (ämne + mailtext + PDF).
  router.post('/cm/reprocess', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const mailSync = createCmMailSync({ graphReadConnector, cmStore, secureStorage });
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 10));
    try {
      const result = await mailSync.reprocessUnprocessed({ limit });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ORD-72 · Om-extraktion: records som saknar totalbelopp läses om ur det
  // SPARADE källmailet (mailtext + bilagor). Fyller endast tomma fält och
  // backfillar redan promotade CFO-utgifter vars belopp fortfarande är tomt.
  // ORD-72e · recordIds (optional): rikta om-extraktion mot specifika poster.
  router.post('/cm/reextract-missing', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const mailSync = createCmMailSync({
      graphReadConnector,
      cmStore,
      secureStorage,
      cfoExpenseStore,
    });
    const body = req.body || {};
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 10));
    // force=true (UI-knappen): kör om även poster som redan försökts på
    // denna processorversion. Schemakörningar kör utan force.
    const force = body.force === true;
    // debug=true: returnera per-post-diagnostik utan att påverka normalt beteende.
    const debug = body.debug === true;
    // recordIds (optional): rikta in sig på specifika poster. Override-ar
    // CM_MAX_EXTRACT_PER_SYNC upp till limit; används vid källgranskning.
    const recordIds = Array.isArray(body.recordIds)
      ? body.recordIds.filter((id) => typeof id === 'string' && id.length > 0)
      : null;
    try {
      const result = await mailSync.reextractMissingAmounts({ limit, force, debug, recordIds });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ORD-76 · Auto-avvisa poster som saknar belopp och är uppenbart icke-ekonomiska
  // mail (bokningsbekräftelser, leveransnotiser, Kivra-aviseringar etc.).
  // dryRun=true som standard — kör utan dryRun=false för att faktiskt avvisa.
  router.post(
    '/cm/auto-classify-backlog',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const mailSync = createCmMailSync({ graphReadConnector, cmStore, secureStorage });
      const limit = Math.min(500, Math.max(1, Number(req.body?.limit) || 100));
      const dryRun = req.body?.dryRun !== false;
      try {
        const result = await mailSync.classifyNonEconomicRecords({ limit, dryRun });
        return res.json(result);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-73 · IMAP-intag (info@fazli.se hos one.com — utanför M365-tenanten).
  // Fail-closed: kräver CM_IMAP_ENABLED + user/password i env.
  router.post('/cm/imap-sync', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const { createCmImapSync } = require('../cm/cmImapSync');
      const imapSync = createCmImapSync({ cmStore, secureStorage });
      const result = await imapSync.syncInbox();
      return res.status(result.ok ? 200 : 502).json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ORD-75 · Backfill av underlags-pekare: rawItems från IMAP-skörden som
  // saknar originalStorageKey får sina arkiv-pekare (avdragsbevis-kedjan).
  router.post(
    '/cm/imap-backfill-originals',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const { createCmImapSync } = require('../cm/cmImapSync');
        const imapSync = createCmImapSync({ cmStore, secureStorage });
        const limit = Math.min(100, Math.max(1, Number(req.body?.limit) || 50));
        const result = await imapSync.backfillOriginals({ limit });
        return res.status(result.ok ? 200 : 502).json(result);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-75b · Omkoppling: promotade CFO-utgifter som saknar underlag får
  // originalmail + bilagor kopplade i efterhand (avdragsbevis-kedjan bakåt).
  router.post(
    '/cm/relink-expense-attachments',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore?.listExpenses || !cfoExpenseStore?.updateExpense) {
        return res.status(502).json({ ok: false, error: 'cfoExpenseStore saknas' });
      }
      const results = { ok: true, checked: 0, relinked: 0, skipped: 0, errors: [] };
      try {
        const expenses = await cfoExpenseStore.listExpenses({ limit: 500 });
        const list = Array.isArray(expenses) ? expenses : expenses?.items || [];
        for (const e of list) {
          if (Array.isArray(e.attachmentKeys) && e.attachmentKeys.length > 0) continue;
          const recId = (String(e.notes || '').match(/cm-record ([0-9a-f-]{36})/) || [])[1];
          if (!recId) continue;
          results.checked++;
          const record = cmStore.getExpenseRecordById(recId);
          if (!record) {
            results.skipped++;
            continue;
          }
          const keys = [];
          if (record.documentId) {
            const doc = cmStore.getDocumentById(record.documentId);
            if (doc?.storagePath) keys.push(doc.storagePath);
          }
          const rawItem = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
          if (rawItem?.originalStorageKey && !keys.includes(rawItem.originalStorageKey)) {
            keys.push(rawItem.originalStorageKey);
          }
          if (!keys.length) {
            results.skipped++;
            continue;
          }
          try {
            await cfoExpenseStore.updateExpense({
              id: e.id,
              patch: { attachmentKeys: keys },
              actor: 'cm-relink-ord75',
            });
            results.relinked++;
          } catch (err) {
            results.errors.push({ expenseId: e.id, error: err.message });
          }
        }
        return res.json(results);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-CM-4 · Klumphantering: gruppera öppna kandidater per leverantör/avsändare
  // ORD-CM-6c: indexerad rawItem-lookup — find() per post över 3 500+ rawItems
  // blockerade eventloopen i tiotals sekunder (O(n²)).
  function rawIndex() {
    const map = new Map();
    if (typeof cmStore.listRawItems === 'function') {
      for (const r of cmStore.listRawItems()) map.set(r.id, r);
    }
    return map;
  }

  function bulkGroupKey(record, rawById) {
    const supplier = String(record.supplierName || '')
      .trim()
      .toLowerCase();
    if (supplier) return `s:${supplier}`;
    const raw = record.rawItemId
      ? rawById
        ? rawById.get(record.rawItemId)
        : cmStore.getRawItemById(record.rawItemId)
      : null;
    const domain = String(raw?.fromEmail || '').split('@')[1] || 'okänd';
    return `d:${domain.toLowerCase()}`;
  }

  function openBulkRecords() {
    return [...cmStore.getInbox(), ...cmStore.getNeedsReview()].filter(
      (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i
    );
  }

  // ORD-CM-6 · Pyramid-vy (ägar-krav: "sorterat i lager som en pyramid —
  // år, månad, kategori, företag — lättåtkomligt för en människa").
  function recordDate(r, rawById) {
    if (/^\d{4}-\d{2}/.test(r.date || '')) return r.date;
    const raw = r.rawItemId
      ? rawById
        ? rawById.get(r.rawItemId)
        : cmStore.getRawItemById(r.rawItemId)
      : null;
    return (raw?.receivedAt || r.createdAt || '').slice(0, 10);
  }

  // ORD-CM-22 · Källgranskning (ägar-regel: "vi gissar inget"): läs rå-mailets
  // metadata + textutdrag för en record/rawItem. Owner-only, read-only.
  // ORD-CM-23 · Z-rapporternas intäktssummering (avstämning mot Fortnox/Cliento).
  router.get('/cm/z-reports', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const raws =
      typeof cmStore.listRawItems === 'function'
        ? cmStore.listRawItems().filter((r) => /z[- ]?rapport/i.test(String(r.subject || '')))
        : [];
    const byRaw = new Map();
    const recs = typeof cmStore.listRecords === 'function' ? cmStore.listRecords() : [];
    for (const rec of recs) if (rec.rawItemId) byRaw.set(rec.rawItemId, rec);
    const months = new Map();
    for (const r of raws) {
      const rec = byRaw.get(r.id);
      const d = (rec?.date || r.receivedAt || '').slice(0, 7) || 'okänt';
      if (!months.has(d)) months.set(d, { month: d, count: 0, sum: 0 });
      const m = months.get(d);
      m.count += 1;
      m.sum += Number(rec?.amountIncVat) || 0;
    }
    return res.json({
      ok: true,
      totalReports: raws.length,
      months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
      note: 'Z-rapporter = kassans dagsavslut. Extraherade summor — avstäm mot Fortnox-intäkter innan skarp användning.',
    });
  });

  // ORD-CM-24 · Käll-uppslag för godtycklig record (owner, read-only) — handedOff
  // syns inte i list-vyerna men behövs vid källgranskning ("vi gissar inget").
  // ORD-CM-26 · AMEX-matchning: kortutdrags-CSV → fyll belopp på records utan
  // belopp (exakt-en-träff-regeln; fill-only-empty). Owner-only.
  router.post(
    '/cm/amex-match',
    requireAuth,
    requireRole(ROLE_OWNER),
    express.json({ limit: '2mb' }),
    async (req, res) => {
      try {
        const { matchAmexCsv } = require('../cm/cmAmexMatch');
        const result = matchAmexCsv({ cmStore, csvText: String(req.body?.csv || '') });
        await cmStore.persist();
        return res.json({ ok: true, ...result });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  router.get('/cm/expense-records/:id', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const rec =
      typeof cmStore.getExpenseRecordById === 'function'
        ? cmStore.getExpenseRecordById(req.params.id)
        : null;
    if (!rec) return res.status(404).json({ error: 'record finns ej' });
    return res.json({ ok: true, record: rec });
  });

  // ORD-CM-? · Reject a single expense record regardless of which queue it is in.
  // Needed to clean up dangling records (e.g. receipts that reference a deleted
  // CFO expense or records without a rawItem) that bulk reject cannot reach.
  router.post(
    '/cm/expense-records/:id/reject',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const record =
        typeof cmStore.getExpenseRecordById === 'function'
          ? cmStore.getExpenseRecordById(req.params.id)
          : null;
      if (!record) return res.status(404).json({ ok: false, error: 'record finns ej' });
      if (record.approvalStatus === 'rejected') {
        return res.json({ ok: true, record, note: 'redan avvisad' });
      }
      const rejectedBy = req.user?.id || req.user?.email || req.auth?.userId || 'owner';
      const reason = String(req.body?.reason || 'manuellt avvisad via cm-reject-route').trim();
      const rejected = cmStore.reject(record.id, { rejectedBy, reason });
      if (!rejected) {
        return res.status(500).json({ ok: false, error: 'kunde inte avvisa record' });
      }
      await cmStore.persist();
      return res.json({ ok: true, record: cmStore.getExpenseRecordById(record.id) });
    }
  );

  // Bulk-reject för städ av stora CM-backlogar.
  // Säkerhetsgate: kräver confirm=true, och som standard dryRun=true.
  // Filtrerar needs-review-poster som saknar belopp (MISSING_TOTAL_AMOUNT)
  // och därmed troligen är icke-ekonomiska mail.
  router.post(
    '/cm/expense-records/bulk-reject',
    requireAuth,
    requireRole(ROLE_OWNER),
    express.json({ limit: '1mb' }),
    async (req, res) => {
      const body = req.body || {};
      if (body.confirm !== true) {
        return res.status(400).json({
          ok: false,
          error: 'confirm måste vara true för att utföra bulk-reject',
        });
      }
      const dryRun = body.dryRun !== false;
      const reason = String(
        body.reason || 'Bulk-rejected: saknar belopp, troligen icke-ekonomiskt mail'
      ).trim();
      const rejectedBy = req.user?.id || req.user?.email || req.auth?.userId || 'owner';
      const candidates = (cmStore.getNeedsReview ? cmStore.getNeedsReview() : []).filter(
        (r) =>
          (r.amountIncVat == null || r.amountIncVat === 0) &&
          Array.isArray(r.flags) &&
          r.flags.includes('MISSING_TOTAL_AMOUNT')
      );
      let rejected = 0;
      let alreadyRejected = 0;
      const errors = [];
      for (const r of candidates) {
        if (r.approvalStatus === 'rejected') {
          alreadyRejected++;
          continue;
        }
        try {
          const ok = cmStore.reject(r.id, { rejectedBy, reason });
          if (ok) {
            rejected++;
          } else {
            errors.push({ id: r.id, error: 'cmStore.reject returnerade falsy' });
          }
        } catch (e) {
          errors.push({ id: r.id, error: e.message });
        }
      }
      if (!dryRun && rejected > 0) {
        await cmStore.persist();
      }
      return res.json({
        ok: true,
        dryRun,
        scanned: candidates.length,
        rejected,
        alreadyRejected,
        errors: errors.slice(0, 20),
      });
    }
  );

  router.get('/cm/raw-items/:id', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const raw =
      typeof cmStore.getRawItemById === 'function' ? cmStore.getRawItemById(req.params.id) : null;
    if (!raw) return res.status(404).json({ error: 'rawItem finns ej' });
    const full = req.query.full === '1' || req.query.full === 'true';
    const out = {
      ok: true,
      id: raw.id,
      mailbox: raw.mailbox || null,
      folder: raw.folder || raw.folderType || null,
      fromEmail: raw.fromEmail || null,
      subject: raw.subject || null,
      receivedAt: raw.receivedAt || null,
      hasOriginal: !!raw.originalStorageKey,
      originalStorageKey: full ? raw.originalStorageKey || null : undefined,
      attachmentNames: Array.isArray(raw.attachments)
        ? raw.attachments.map((a) => a?.name || a?.filename).filter(Boolean)
        : [],
      bodyPreview: String(raw.rawBodyText || raw.bodyPreview || '').slice(0, 1500),
    };
    if (full) {
      out.rawBodyText = String(raw.rawBodyText || raw.bodyPreview || '');
      out.metadata = raw.metadata || null;
    }
    return res.json(out);
  });

  router.get('/cm/groups-tree', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const rawById = rawIndex();
    const years = new Map();
    for (const r of openBulkRecords()) {
      const d = recordDate(r, rawById);
      const year = d.slice(0, 4) || 'okänt';
      const month = d.slice(5, 7) || '??';
      if (!years.has(year)) years.set(year, { year, count: 0, sum: 0, months: new Map() });
      const y = years.get(year);
      y.count++;
      y.sum += r.amountIncVat || 0;
      if (!y.months.has(month)) y.months.set(month, { month, count: 0, sum: 0, groups: new Map() });
      const m = y.months.get(month);
      m.count++;
      m.sum += r.amountIncVat || 0;
      const key = bulkGroupKey(r, rawById);
      if (!m.groups.has(key)) {
        const raw = r.rawItemId ? rawById.get(r.rawItemId) : null;
        m.groups.set(key, {
          key,
          label: r.supplierName || (raw?.fromEmail || 'okänd').split('@')[1] || 'okänd',
          count: 0,
          sum: 0,
          medBelopp: 0,
          kategorier: new Map(),
          poster: [],
        });
      }
      const g = m.groups.get(key);
      g.count++;
      if (r.amountIncVat) {
        g.sum += r.amountIncVat;
        g.medBelopp++;
      }
      if (r.category) g.kategorier.set(r.category, (g.kategorier.get(r.category) || 0) + 1);
      if (g.poster.length < 15) {
        const raw = r.rawItemId ? rawById.get(r.rawItemId) : null;
        g.poster.push({
          id: r.id,
          datum: d,
          tid: (raw?.receivedAt || '').slice(11, 16),
          belopp: r.amountIncVat || 0,
          typ: r.expenseType,
          amne: (raw?.subject || '').slice(0, 70),
        });
      }
    }
    const ut = [...years.values()]
      .sort((a, b) => b.year.localeCompare(a.year))
      .map((y) => ({
        year: y.year,
        count: y.count,
        sum: Math.round(y.sum),
        months: [...y.months.values()]
          .sort((a, b) => b.month.localeCompare(a.month))
          .map((m) => ({
            month: m.month,
            count: m.count,
            sum: Math.round(m.sum),
            groups: [...m.groups.values()]
              .sort((a, b) => b.sum - a.sum || b.count - a.count)
              .map((g) => ({
                key: g.key,
                label: g.label,
                count: g.count,
                sum: Math.round(g.sum),
                medBelopp: g.medBelopp,
                kategoriForslag:
                  [...g.kategorier.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
                poster: g.poster.sort((a, b) => b.datum.localeCompare(a.datum)),
              })),
          })),
      }));
    return res.json({ ok: true, years: ut, totalOpen: openBulkRecords().length });
  });

  // ORD-CM-7 · Intags-pyramiden: samma lagerstruktur som klumphanteringen
  // (ägar-krav: inte en platt 3800-lista). Utan year/month: år+månads-aggregat.
  // Med year+month: dagens poster grupperade per dag. status=inbox|needs_review filtrerar.
  function intakeRecords(status) {
    let rows;
    if (status === 'inbox') rows = cmStore.getInbox();
    else if (status === 'needs_review') rows = cmStore.getNeedsReview();
    else rows = [...cmStore.getInbox(), ...cmStore.getNeedsReview()];
    return rows.filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
  }

  router.get('/cm/intake-tree', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const status = ['inbox', 'needs_review'].includes(req.query.status) ? req.query.status : 'all';
    const rawById = rawIndex();
    const rows = intakeRecords(status);
    const qYear = String(req.query.year || '');
    const qMonth = String(req.query.month || '');
    if (qYear && qMonth) {
      const days = new Map();
      for (const r of rows) {
        const d = recordDate(r, rawById);
        if ((d.slice(0, 4) || 'okänt') !== qYear || (d.slice(5, 7) || '??') !== qMonth) continue;
        const day = d.slice(8, 10) || '??';
        if (!days.has(day))
          days.set(day, { day, datum: d.slice(0, 10), count: 0, sum: 0, poster: [] });
        const g = days.get(day);
        g.count++;
        g.sum += r.amountIncVat || 0;
        const raw = r.rawItemId ? rawById.get(r.rawItemId) : null;
        g.poster.push({
          id: r.id,
          tid: (raw?.receivedAt || '').slice(11, 16),
          belopp: r.amountIncVat || 0,
          typ: r.expenseType,
          foretag: r.supplierName || raw?.fromEmail || 'Okänd',
          amne: (raw?.subject || '').slice(0, 70),
          granska: (r.flags || []).includes('NEEDS_MANUAL_REVIEW'),
        });
      }
      const ut = [...days.values()]
        .sort((a, b) => b.day.localeCompare(a.day))
        .map((g) => ({
          ...g,
          sum: Math.round(g.sum),
          poster: g.poster.sort((a, b) => b.tid.localeCompare(a.tid)),
        }));
      return res.json({ ok: true, days: ut, totalOpen: rows.length });
    }
    const years = new Map();
    for (const r of rows) {
      const d = recordDate(r, rawById);
      const year = d.slice(0, 4) || 'okänt';
      const month = d.slice(5, 7) || '??';
      if (!years.has(year)) years.set(year, { year, count: 0, sum: 0, months: new Map() });
      const y = years.get(year);
      y.count++;
      y.sum += r.amountIncVat || 0;
      if (!y.months.has(month)) y.months.set(month, { month, count: 0, sum: 0 });
      const m = y.months.get(month);
      m.count++;
      m.sum += r.amountIncVat || 0;
    }
    const ut = [...years.values()]
      .sort((a, b) => b.year.localeCompare(a.year))
      .map((y) => ({
        year: y.year,
        count: y.count,
        sum: Math.round(y.sum),
        months: [...y.months.values()]
          .sort((a, b) => b.month.localeCompare(a.month))
          .map((m) => ({ month: m.month, count: m.count, sum: Math.round(m.sum) })),
      }));
    return res.json({ ok: true, years: ut, totalOpen: rows.length });
  });

  router.get('/cm/groups', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const rawById = rawIndex();
    const groups = new Map();
    for (const r of openBulkRecords()) {
      const key = bulkGroupKey(r, rawById);
      if (!groups.has(key)) {
        const raw = r.rawItemId ? rawById.get(r.rawItemId) : null;
        groups.set(key, {
          key,
          label: r.supplierName || (raw?.fromEmail || 'okänd').split('@')[1] || 'okänd',
          count: 0,
          sumIncVat: 0,
          medBelopp: 0,
          exempel: r.supplierName || raw?.subject || '',
        });
      }
      const g = groups.get(key);
      g.count++;
      if (r.amountIncVat) {
        g.sumIncVat += r.amountIncVat;
        g.medBelopp++;
      }
    }
    const list = [...groups.values()].sort((a, b) => b.count - a.count);
    return res.json({ ok: true, groups: list, totalOpen: openBulkRecords().length });
  });

  // POST /cm/bulk {action:'promote'|'reject', groupKey, category?, reason?}
  // Bulk skapar/kategoriserar/avvisar — GODKÄNNANDE förblir alltid mänskligt.
  router.post('/cm/bulk', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const { action, groupKey, category, reason, year, month } = req.body || {};
    if (!['promote', 'reject'].includes(action) || !groupKey) {
      return res.status(400).json({ ok: false, error: 'action (promote|reject) + groupKey krävs' });
    }
    // ORD-CM-6: valfritt år/månads-scope — bulk agerar bara inom öppnad nivå
    const rawById = rawIndex();
    const targets = openBulkRecords().filter((r) => {
      if (bulkGroupKey(r, rawById) !== groupKey) return false;
      if (year || month) {
        const d = recordDate(r, rawById);
        if (year && d.slice(0, 4) !== String(year)) return false;
        if (month && d.slice(5, 7) !== String(month).padStart(2, '0')) return false;
      }
      return true;
    });
    const results = { ok: true, action, groupKey, matched: targets.length, done: 0, errors: [] };
    const actor = {
      userId: req.user?.id || req.user?.email || 'owner',
      role: 'owner',
      via: 'cm-bulk',
    };
    for (const record of targets) {
      try {
        if (action === 'reject') {
          cmStore.reject(record.id, {
            rejectedBy: actor.userId,
            reason: reason || 'bulk-avvisad per grupp',
          });
          results.done++;
          continue;
        }
        // promote — hoppa över poster utan belopp (kan inte bli verifikat)
        if (!record.amountIncVat) {
          results.errors.push({ recordId: record.id, error: 'saknar belopp — hoppad' });
          continue;
        }
        const documents = record.documentId
          ? [cmStore.getDocumentById(record.documentId)].filter(Boolean)
          : [];
        const rawItem = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
        const result = await promoteRecordToCfo({
          record,
          documents,
          rawItem,
          cfoExpenseStore,
          actor,
        });
        if (!result.ok) {
          results.errors.push({ recordId: record.id, error: result.error });
          continue;
        }
        cmStore.markHandedOff(record.id, {
          cfoExpenseId: result.cfoExpense.id,
          actor: actor.userId,
        });
        if (category && cfoExpenseStore?.updateExpense) {
          await cfoExpenseStore
            .updateExpense({ id: result.cfoExpense.id, patch: { category }, actor: actor.userId })
            .catch((err) =>
              results.errors.push({ recordId: record.id, error: `kategori: ${err.message}` })
            );
        }
        results.done++;
      } catch (err) {
        results.errors.push({ recordId: record.id, error: err.message });
      }
    }
    await cmStore.persist();
    return res.json(results);
  });

  // AI extraction — skicka bild eller text, få strukturerad data tillbaka
  router.post('/cm/extract', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const { imageBase64, mimeType, text, source } = req.body || {};
    if (!imageBase64 && !text) {
      return res.status(400).json({ ok: false, error: 'Skicka imageBase64 eller text' });
    }
    const result = await extractDocument({ imageBase64, mimeType, text, source });
    if (!result.ok) return res.status(502).json(result);

    // Auto-create expense record if confidence >= 70
    if (result.extraction?.confidenceScore >= 70 && result.extraction?.documentType !== 'unknown') {
      const record = cmStore.createExpenseRecord({
        expenseType: result.extraction.documentType,
        supplierName: result.extraction.supplier,
        invoiceNumber: result.extraction.invoiceNumber,
        receiptNumber: result.extraction.receiptNumber,
        orderNumber: result.extraction.orderNumber,
        date: result.extraction.date,
        dueDate: result.extraction.dueDate,
        amountExVat: result.extraction.amountExVat,
        vatAmount: result.extraction.vatAmount,
        amountIncVat: result.extraction.amountIncVat,
        currency: result.extraction.currency,
        category: result.extraction.category,
        confidenceScore: result.extraction.confidenceScore,
      });
      await cmStore.persist();
      result.expenseRecord = record;
    }

    return res.json(result);
  });

  // Full pipeline: import + extract in one call
  router.post('/cm/process', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const {
      sourceType,
      subject,
      fromEmail,
      receivedAt,
      rawBodyText,
      imageBase64,
      mimeType,
      hasPdf,
      hasImage,
      metadata,
    } = req.body || {};

    // Step 1: Import raw
    const importResult = cmStore.importRawItem({
      sourceType: sourceType || 'manual',
      subject,
      fromEmail,
      receivedAt,
      rawBodyText,
      hasAttachments: Boolean(imageBase64 || hasPdf),
      hasPdf: Boolean(hasPdf),
      hasImage: Boolean(hasImage || imageBase64),
      metadata,
    });
    if (!importResult.ok) return res.status(409).json(importResult);

    // Step 2: Extract
    const extractResult = await extractDocument({
      imageBase64,
      mimeType,
      text: rawBodyText,
      source: sourceType || 'manual',
    });

    // Step 3: Create expense record if extraction succeeded
    let expenseRecord = null;
    if (extractResult.ok && extractResult.extraction?.confidenceScore >= 50) {
      expenseRecord = cmStore.createExpenseRecord({
        expenseType: extractResult.extraction.documentType,
        supplierName: extractResult.extraction.supplier,
        invoiceNumber: extractResult.extraction.invoiceNumber,
        receiptNumber: extractResult.extraction.receiptNumber,
        orderNumber: extractResult.extraction.orderNumber,
        date: extractResult.extraction.date,
        dueDate: extractResult.extraction.dueDate,
        amountExVat: extractResult.extraction.amountExVat,
        vatAmount: extractResult.extraction.vatAmount,
        amountIncVat: extractResult.extraction.amountIncVat,
        currency: extractResult.extraction.currency,
        category: extractResult.extraction.category,
        confidenceScore: extractResult.extraction.confidenceScore,
        flags:
          extractResult.extraction.confidenceScore < 70
            ? ['NEEDS_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXTRACTION']
            : [],
      });
    }

    await cmStore.persist();

    return res.json({
      ok: true,
      import: importResult,
      extraction: extractResult.ok ? extractResult.extraction : null,
      expenseRecord,
      needsReview: !expenseRecord || (expenseRecord?.confidenceScore || 0) < 70,
    });
  });

  return router;
}

module.exports = { createCmRouter };
