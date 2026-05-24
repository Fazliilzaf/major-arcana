const express = require('express');
const path = require('node:path');
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
