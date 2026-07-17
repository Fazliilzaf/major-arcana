'use strict';

// ORD-75b: Ägar-styrd Cliento-CSV-import via API.
//
// Bakgrund: import-scriptet (scripts/import-cliento-bookings-to-store.js)
// kräver serverkörning; ssh/one-off når inte persistenta disken maskinellt.
// Ägaren POST:ar CSV-texten (Clientos "Exportera bokningar", alla kolumner)
// hit; servern sparar den temporärt UTANFÖR repot, kör befintliga
// importClientoBookingsFromCsv och raderar tempfilen direkt (PII-minimering).
//   POST /api/v1/ops/cliento/bookings-import?commit=true|false  (default dry-run)
// Endast owner-rollen. Svar = importstatistik, aldrig radinnehåll.

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { importClientoBookingsFromCsv } = require('../ops/clientoBookingCsvImport');

function createOpsClientoBookingsImportRouter({
  config,
  requireCcoAuthenticated,
  attachRole,
  requireAnyRole,
  auditLog = null,
  logger = console,
}) {
  const router = express.Router();
  router.use(requireCcoAuthenticated, attachRole, requireAnyRole(['owner']));

  router.post(
    '/cliento/bookings-import',
    express.text({ type: () => true, limit: '30mb' }),
    async (req, res) => {
      const csvText = typeof req.body === 'string' ? req.body : '';
      if (!csvText.trim() || !csvText.includes(',')) {
        return res.status(400).json({ ok: false, error: 'Tom eller ogiltig CSV-kropp.' });
      }
      const commit = String(req.query.commit || '') === 'true';
      const tenantId = String(req.query.tenant || 'hair_tp');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliento-import-'));
      const csvPath = path.join(tmpDir, 'bookings.csv');
      try {
        fs.writeFileSync(csvPath, csvText);
        const result = await importClientoBookingsFromCsv({
          csvPath,
          tenantId,
          storePath: config.clientoBookingStorePath,
          patientMasterPath: config.ccoPatientMasterStorePath,
          dryRun: !commit,
        });
        logger.warn(
          `[ops/cliento-import] ${commit ? 'COMMIT' : 'dry-run'} klar: ${JSON.stringify({
            ...result,
            csvPath: undefined,
          })}`
        );
        if (auditLog?.append) {
          try {
            auditLog.append({
              action: 'cliento_bookings_import',
              actor: { role: 'owner', userId: req.ccoUser?.id || null, ip: req.ip || null },
              detail: { commit, tenantId, bytes: csvText.length },
            });
          } catch (err) {
            logger.warn(`[ops/cliento-import] audit misslyckades: ${err.message}`);
          }
        }
        return res.json({ ok: true, commit, ...result, csvPath: undefined });
      } catch (err) {
        logger.error(`[ops/cliento-import] fel: ${err.message}`);
        return res.status(500).json({ ok: false, error: err.message });
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (_) {
          /* tempstädning får inte fälla svaret */
        }
      }
    }
  );

  return router;
}

module.exports = { createOpsClientoBookingsImportRouter };
