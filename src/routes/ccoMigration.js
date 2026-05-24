const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const {
  discoverClientoCsv,
  discoverMigrationZips,
  walkFolderEntries,
} = require('../../scripts/migration/lib/migrationUtils');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const PUSH_STATE_FILES = new Set([
  'migration-index.json',
  'cco-patient-master.json',
  'cco-journal.json',
]);

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function createCcoMigrationRouter({
  patientMasterStore,
  migrationIndexStore,
  journalStore = null,
  authStore,
  config,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  async function handle(req, res, run) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      if (actor.role !== ROLE_OWNER) {
        return res.status(403).json({ error: 'Endast OWNER får köra migration.' });
      }
      return await run(actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res
          .status(statusCode)
          .json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hantera migration.' });
    }
  }

  router.get('/cco-migration/status', requireAuth, requireRole(ROLE_OWNER), async (req, res) =>
    handle(req, res, async (actor) => {
      const migrationRoot = config.migrationDataRoot;
      const zips = discoverMigrationZips(migrationRoot);
      const csvPath = discoverClientoCsv(migrationRoot);
      const crdownloads = require('node:fs')
        .readdirSync(migrationRoot)
        .filter((name) => name.endsWith('.crdownload'));
      const driveMirrorRoot =
        process.env.ARCANA_DRIVE_MIRROR_ROOT || process.env.ARCANA_MIGRATION_DRIVE_ROOT || '';
      const driveMirrorReady = driveMirrorRoot ? walkFolderEntries(driveMirrorRoot).ok : false;
      const indexStats = migrationIndexStore ? await migrationIndexStore.getStats() : {};
      const patientStats = await patientMasterStore.getTenantStats({ tenantId: actor.tenantId });
      const journalImportStats =
        journalStore && typeof journalStore.getImportSummary === 'function'
          ? await journalStore.getImportSummary({ tenantId: actor.tenantId })
          : null;
      return res.json({
        migrationRoot,
        recommendedPath: 'drive_api_or_folder_mirror',
        zipCount: zips.length,
        incompleteDownloads: crdownloads.length,
        driveMirrorRoot: driveMirrorRoot || null,
        driveMirrorReady,
        driveApiConfigured: Boolean(
          process.env.ARCANA_GOOGLE_DRIVE_FOLDER_ID &&
          (process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON ||
            process.env.GOOGLE_APPLICATION_CREDENTIALS)
        ),
        clientoCsv: csvPath ? path.basename(csvPath) : null,
        indexStats,
        patientStats,
        journalImportStats,
      });
    })
  );

  router.post(
    '/cco-migration/import-drive-profiles',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!migrationIndexStore) {
          return res.status(503).json({ error: 'Migration-index saknas.' });
        }
        const { profiles } = await migrationIndexStore.listProfiles({ limit: 5000, offset: 0 });
        const result = await patientMasterStore.mergeDriveProfiles({
          tenantId: actor.tenantId,
          profiles: profiles.profiles,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.migration.import_drive_profiles',
          outcome: 'success',
          targetType: 'cco_migration',
          targetId: actor.tenantId,
        });
        return res.json({ result });
      })
  );

  router.post(
    '/cco-migration/push-state-file',
    express.json({ limit: '8mb' }),
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const fileName = normalizeText(body.fileName);
        const encoding = normalizeText(body.encoding);
        const data = normalizeText(body.data);
        const confirmText = normalizeText(body.confirmText);

        if (!PUSH_STATE_FILES.has(fileName)) {
          return res.status(400).json({ error: 'Ogiltigt fileName.' });
        }
        if (encoding !== 'gzip-base64') {
          return res.status(400).json({ error: 'encoding måste vara gzip-base64.' });
        }
        if (!data) {
          return res.status(400).json({ error: 'data saknas.' });
        }
        const expectedConfirm = `PUSH ${fileName}`;
        if (confirmText !== expectedConfirm) {
          return res.status(400).json({
            error: `Bekräftelse saknas. Sätt confirmText till exakt "${expectedConfirm}".`,
          });
        }

        let parsed;
        try {
          const raw = zlib.gunzipSync(Buffer.from(data, 'base64'));
          parsed = JSON.parse(raw.toString('utf8'));
        } catch {
          return res.status(400).json({ error: 'Kunde inte avkoda gzip-base64 JSON.' });
        }

        const targetPath = path.join(config.stateRoot, fileName);
        await writeJsonAtomic(targetPath, parsed);

        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.migration.push_state_file',
          outcome: 'success',
          targetType: 'cco_migration',
          targetId: fileName,
          metadata: {
            fileName,
            bytes: Buffer.byteLength(JSON.stringify(parsed)),
          },
        });

        return res.json({
          ok: true,
          fileName,
          targetPath,
          requiresRestart: true,
        });
      })
  );

  router.post(
    '/cco-migration/import-historical-journals',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!migrationIndexStore || !journalStore) {
          return res.status(503).json({ error: 'Journal- eller migration-index saknas.' });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const includeImages = Boolean(body.includeImages);
        const limitPatients = Number(body.limitPatients) || 0;
        const listed = await patientMasterStore.listPatients({
          tenantId: actor.tenantId,
          limit: 20000,
          offset: 0,
        });
        let patients = listed.patients.filter((patient) => patient.personnummer);
        if (limitPatients > 0) {
          patients = patients.slice(0, limitPatients);
        }
        const filesByPersonnummer = {};
        for (const patient of patients) {
          const pnr = String(patient.personnummer || '').trim();
          if (!pnr) continue;
          let files = await migrationIndexStore.getFilesForPersonnummer(pnr);
          if (!includeImages) {
            files = files.filter((file) => file.fileType === 'journal_pdf');
          }
          if (files.length) filesByPersonnummer[pnr] = files;
        }
        const result = await journalStore.importHistoricalForPatients({
          tenantId: actor.tenantId,
          patients,
          filesByPersonnummer,
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.migration.import_historical_journals',
          outcome: 'success',
          targetType: 'cco_migration',
          targetId: actor.tenantId,
        });
        return res.json({ result });
      })
  );

  return router;
}

module.exports = {
  createCcoMigrationRouter,
};
