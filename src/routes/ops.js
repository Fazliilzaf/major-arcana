const express = require('express');

const { ROLE_OWNER } = require('../security/roles');
const {
  getStateFileMap,
  buildStateManifest,
  createStateBackup,
  listBackups,
  pruneBackups,
  resolveBackupFilePath,
  inspectBackupRestore,
  restoreFromBackup,
} = require('../ops/stateBackup');

function parseLimit(value, fallback = 20) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createOpsRouter({
  config,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get(
    '/ops/state/manifest',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const stateFileMap = getStateFileMap(config);
        const manifest = await buildStateManifest({ stateFileMap });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.state.manifest.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'state_manifest',
        });

        return res.json({
          backupDir: config.backupDir,
          retention: {
            maxFiles: config.backupRetentionMaxFiles,
            maxAgeDays: config.backupRetentionMaxAgeDays,
          },
          ...manifest,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa state manifest.' });
      }
    }
  );

  router.get(
    '/ops/state/backups',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const limit = parseLimit(req.query?.limit, 20);
        const backups = await listBackups({
          backupDir: config.backupDir,
          limit,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.state.backups.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'state_backups',
          metadata: { count: backups.length, limit },
        });

        return res.json({
          backupDir: config.backupDir,
          retention: {
            maxFiles: config.backupRetentionMaxFiles,
            maxAgeDays: config.backupRetentionMaxAgeDays,
          },
          count: backups.length,
          backups,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa backups.' });
      }
    }
  );

  router.post(
    '/ops/state/backup',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const stateFileMap = getStateFileMap(config);
        const backup = await createStateBackup({
          stateFileMap,
          backupDir: config.backupDir,
          createdBy: req.currentUser?.email || req.auth.userId || 'owner',
        });

        const pruneResult = await pruneBackups({
          backupDir: config.backupDir,
          maxFiles: config.backupRetentionMaxFiles,
          maxAgeDays: config.backupRetentionMaxAgeDays,
          dryRun: false,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.state.backup.create',
          outcome: 'success',
          targetType: 'backup',
          targetId: backup.fileName,
          metadata: {
            filePath: backup.filePath,
            sizeBytes: backup.sizeBytes,
            stores: backup.stores.length,
            pruneDeletedCount: pruneResult.deletedCount,
          },
        });

        return res.status(201).json({
          ok: true,
          backup,
          prune: pruneResult,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte skapa backup.' });
      }
    }
  );

  router.post(
    '/ops/state/backups/prune',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const dryRun = parseBoolean(req.body?.dryRun, true);
        const result = await pruneBackups({
          backupDir: config.backupDir,
          maxFiles: config.backupRetentionMaxFiles,
          maxAgeDays: config.backupRetentionMaxAgeDays,
          dryRun,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: dryRun ? 'ops.state.backups.prune.preview' : 'ops.state.backups.prune.run',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'state_backups',
          metadata: {
            deletedCount: result.deletedCount,
            scannedCount: result.scannedCount,
            maxFiles: result.settings.maxFiles,
            maxAgeDays: result.settings.maxAgeDays,
          },
        });

        return res.json({
          ok: true,
          ...result,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte pruna backups.' });
      }
    }
  );

  router.post(
    '/ops/state/restore',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const fileName = normalizeText(req.body?.fileName);
        const dryRun = parseBoolean(req.body?.dryRun, false);
        const confirmText = normalizeText(req.body?.confirmText);

        if (!fileName) {
          return res.status(400).json({ error: 'fileName krävs.' });
        }

        const backupFilePath = resolveBackupFilePath({
          backupDir: config.backupDir,
          fileName,
        });
        const stateFileMap = getStateFileMap(config);
        const preview = await inspectBackupRestore({
          backupFilePath,
          stateFileMap,
        });

        if (dryRun) {
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'ops.state.restore.preview',
            outcome: 'success',
            targetType: 'backup',
            targetId: fileName,
            metadata: {
              willRestoreCount: preview.stores.filter((store) => store.willRestore).length,
              missingCount: preview.stores.filter((store) => !store.existsInBackup).length,
              unknownStores: preview.unknownStores.length,
            },
          });

          return res.json({
            ok: true,
            dryRun: true,
            fileName,
            preview,
          });
        }

        const expectedConfirm = `RESTORE ${fileName}`;
        if (confirmText !== expectedConfirm) {
          return res.status(400).json({
            error: `Bekräftelse saknas. Sätt confirmText till exakt "${expectedConfirm}".`,
          });
        }

        const restore = await restoreFromBackup({
          backupFilePath,
          stateFileMap,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.state.restore.run',
          outcome: 'success',
          targetType: 'backup',
          targetId: fileName,
          metadata: {
            restoredCount: restore.stores.filter((store) => store.restored).length,
            skippedCount: restore.stores.filter((store) => !store.restored).length,
          },
        });

        return res.json({
          ok: true,
          dryRun: false,
          fileName,
          preview,
          restore,
        });
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return res.status(404).json({ error: 'Backupfilen hittades inte.' });
        }
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte återställa backup.' });
      }
    }
  );

  return router;
}

module.exports = {
  createOpsRouter,
};
