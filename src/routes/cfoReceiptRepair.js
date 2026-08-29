'use strict';

/**
 * CFO-kvitto-reparation: byt ut ett kvittos underlag genom att återhämta
 * rätt bilaga ur mailbox truth för den korttransaktion kvittot ursprungligen
 * skapades från.
 *
 * Används efter import-buggar där många kvitton pekar på samma felaktiga fil.
 */

const express = require('express');
const {
  findMailboxMessage,
  fetchMailboxPdfAttachment,
  findCmRecord,
  loadCmDocumentBuffer,
} = require('../cfo/cfoInvoiceFetch');
const { attachRole, requireAnyRole, getActor } = require('../security/ccoRbac');

const cfMutateRBAC = ['owner', 'finance']; // revisor är read-only

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCardTransactionFromNotes(notes) {
  const text = normalizeText(notes);
  // "...för korttransaktion BOLT OPERATIONS OU TALLINN 2026-03-05\n..."
  const m = text.match(/för korttransaktion\s+(.+?)\s+(\d{4}-\d{2}-\d{2})/i);
  if (!m) return null;
  return {
    description: m[1].trim(),
    date: m[2],
  };
}

function findTransaction({ description, date, reconciliation }) {
  if (!reconciliation || typeof reconciliation.listTransactions !== 'function') return null;
  const all = reconciliation.listTransactions({ limit: 10000 });
  const target = normalizeText(description).toLowerCase();
  return (
    all.find((t) => {
      if (normalizeText(t.date) !== date) return false;
      const td = normalizeText(t.description).toLowerCase();
      // Tillåt match om någon av de vanliga token matchar.
      const tokens = target.split(/\s+/).filter(Boolean);
      return tokens.length > 0 && tokens.every((tok) => td.includes(tok));
    }) || null
  );
}

function createCfoReceiptRepairRouter({
  cfoReceiptStore: receiptStore,
  cardReconciliation: reconciliation,
  mailboxTruthStore,
  graphReadConnector,
  cmStore = null,
  secureStorage = null,
  googleAdsConnectorStore = null,
  metaAdsConnectorStore = null,
  config,
}) {
  const router = express.Router();

  // POST /api/v1/cco-cf/receipts/:id/repair-from-mailbox
  // Återhämtar rätt bilaga ur mailbox truth och byter ut kvittots underlag.
  router.post(
    '/cco-cf/receipts/:id/repair-from-mailbox',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    async (req, res) => {
      try {
        if (!receiptStore) return res.status(503).json({ error: 'receipt store not ready' });
        if (!receiptStore.repairStorageKey) {
          return res.status(503).json({ error: 'receipt store saknar repairStorageKey' });
        }
        if (!reconciliation || !mailboxTruthStore || !graphReadConnector) {
          return res.status(503).json({
            error: 'reparation kräver reconciliation, mailboxTruthStore och graphReadConnector',
          });
        }

        const r = receiptStore.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'receipt finns ej' });

        const parsed = parseCardTransactionFromNotes(r.notes);
        if (!parsed) {
          return res.status(400).json({ error: 'kunde inte parsa korttransaktion ur notes' });
        }

        const tx = findTransaction({
          description: parsed.description,
          date: parsed.date,
          reconciliation,
        });
        if (!tx) {
          return res
            .status(404)
            .json({ error: 'kunde inte hitta korttransaktion i reconciliation' });
        }

        const mailboxIds = mailboxTruthStore.listLoadedMailboxes?.() || [];
        const message = await findMailboxMessage({ tx, mailboxTruthStore, opts: { mailboxIds } });
        if (!message) {
          return res.status(404).json({ error: 'ingen mailbox-träff för transaktionen' });
        }

        const force = req.query?.force === 'true' || req.body?.force === true;
        let attachment = await fetchMailboxPdfAttachment({ message, graphReadConnector, tx });
        let usedFallback = false;

        if (!attachment?.buffer) {
          if (force && attachment?.bestFailed?.buffer) {
            attachment = attachment.bestFailed;
            usedFallback = true;
          } else {
            return res.status(404).json({
              error: 'kunde inte hämta/validera PDF-bilaga',
              detail: attachment?.error || 'okänt fel',
            });
          }
        }

        const actor = getActor(req);
        const repaired = await receiptStore.repairStorageKey({
          id: r.id,
          buffer: attachment.buffer,
          mimeType: attachment.contentType || 'application/pdf',
          originalFileName: attachment.name || `repaired-${r.id}.pdf`,
          actor,
          reason: `repair-from-mailbox${usedFallback ? ' (force fallback)' : ''}: ${message.mailboxId} / ${message.messageKey || message.graphMessageId}`,
        });

        if (usedFallback && receiptStore.transitionStatus) {
          await receiptStore.transitionStatus({
            id: r.id,
            newStatus: 'needs_review',
            reason: 'repair-from-mailbox: bilagan kunde inte valideras, kräver manuell granskning',
            actor,
          });
        }

        res.json({
          ok: true,
          receipt: receiptStore.getById(r.id),
          usedFallback,
          transaction: {
            id: tx.id,
            description: tx.description,
            date: tx.date,
            amountSek: tx.amountSek,
          },
          message: {
            mailboxId: message.mailboxId,
            messageKey: message.messageKey || message.graphMessageId,
          },
        });
      } catch (err) {
        console.error('[cfoReceiptRepair] error:', err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/receipts/:id/repair-from-cm
  // Återhämtar rätt bilaga ur de lokalt lagrade CM-dokumenten (IMAP-importen
  // från info@fazli.se m.fl. — bilagorna ligger redan i secure storage).
  // Matchningen (belopp + strikt datum + leverantör) är samma som ORD-102:s
  // auto-fetch, så träffen är i sig valideringen.
  router.post(
    '/cco-cf/receipts/:id/repair-from-cm',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    async (req, res) => {
      try {
        if (!receiptStore) return res.status(503).json({ error: 'receipt store not ready' });
        if (!receiptStore.repairStorageKey) {
          return res.status(503).json({ error: 'receipt store saknar repairStorageKey' });
        }
        if (!cmStore || !secureStorage) {
          return res.status(503).json({ error: 'reparation kräver cmStore och secureStorage' });
        }

        const r = receiptStore.getById(req.params.id);
        if (!r) return res.status(404).json({ error: 'receipt finns ej' });

        const parsed = parseCardTransactionFromNotes(r.notes);
        if (!parsed) {
          return res.status(400).json({ error: 'kunde inte parsa korttransaktion ur notes' });
        }

        const tx = {
          description: parsed.description,
          date: parsed.date,
          amountSek: Number(r.amountSek) || null,
        };
        if (!tx.amountSek) {
          return res.status(400).json({ error: 'kvittot saknar belopp — kan inte matcha säkert' });
        }

        const record = findCmRecord({ tx, cmStore });
        if (!record) {
          return res.status(404).json({ error: 'ingen CM-träff för transaktionen' });
        }

        const buffer = await loadCmDocumentBuffer({ record, cmStore, secureStorage });
        if (!buffer) {
          return res
            .status(404)
            .json({ error: 'CM-dokumentet kunde inte läsas ur secure storage' });
        }

        const actor = getActor(req);
        const repaired = await receiptStore.repairStorageKey({
          id: r.id,
          buffer,
          mimeType: 'application/pdf',
          originalFileName: `cm-${record.id || 'dokument'}.pdf`,
          actor,
          reason: `repair-from-cm: CM-dokument ${record.id} (${record.supplierName || 'okänd'})`,
        });

        res.json({
          ok: true,
          receipt: repaired,
          source: 'cm',
          cmRecord: {
            id: record.id,
            supplierName: record.supplierName,
            amountIncVat: record.amountIncVat,
            date: record.date || record.dueDate || null,
          },
        });
      } catch (err) {
        console.error('[cfoReceiptRepair] repair-from-cm error:', err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  // POST /api/v1/cco-cf/receipts/repair-from-vendors
  // Reparerar kvitton med delade (felkopplade) storageKeys genom att hämta
  // riktiga faktura-PDF:er direkt från leverantörs-API:er (Google Ads, Meta m.fl.).
  // dryRun=true som standard — skicka dryRun=false för skarp körning.
  router.post(
    '/cco-cf/receipts/repair-from-vendors',
    attachRole,
    requireAnyRole(cfMutateRBAC),
    async (req, res) => {
      try {
        if (!receiptStore) return res.status(503).json({ error: 'receipt store not ready' });
        const {
          createVendorRegistry,
          repairReceiptsFromVendorInvoices,
        } = require('../cfo/cfoVendorInvoiceFetch');
        const registry = createVendorRegistry(config?.vendorInvoiceFetch || config?.vendors || {}, {
          googleAdsConnectorStore,
          metaAdsConnectorStore,
        });
        const dryRun = !['false', '0', 'no'].includes(
          String(req.query?.dryRun ?? req.body?.dryRun ?? 'true').toLowerCase()
        );
        const limit = Number(req.query?.limit ?? req.body?.limit ?? 0) || 0;
        const fromDate = req.query?.fromDate || req.body?.fromDate || '2026-01-01';
        const toDate =
          req.query?.toDate || req.body?.toDate || new Date().toISOString().slice(0, 10);
        const actor = getActor(req);
        const result = await repairReceiptsFromVendorInvoices({
          receiptStore,
          registry,
          fromDate,
          toDate,
          actor,
          dryRun,
          limit,
        });
        res.json(result);
      } catch (err) {
        console.error('[cfoReceiptRepair] repair-from-vendors error:', err);
        res.status(500).json({ error: err.message });
      }
    }
  );

  return router;
}

module.exports = { createCfoReceiptRepairRouter };
