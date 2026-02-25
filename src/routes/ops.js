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
const {
  listSchedulerPilotReports,
  pruneSchedulerPilotReports,
} = require('../ops/pilotReports');
const {
  validateTemplateVariables,
  applyChannelSignature,
} = require('../templates/variables');
const { evaluateTemplateRisk } = require('../risk/templateRisk');

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

function parseDays(value, fallback = 90) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(7, Math.min(3650, parsed));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function getTenantTemplateRuntime(tenantConfigStore, tenantId) {
  if (!tenantConfigStore || typeof tenantConfigStore.getTenantConfig !== 'function') {
    return {
      riskSensitivityModifier: 0,
      templateVariableAllowlistByCategory: {},
      templateRequiredVariablesByCategory: {},
      templateSignaturesByChannel: {},
    };
  }
  try {
    const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);
    const modifier = Number(tenantConfig?.riskSensitivityModifier ?? 0);
    return {
      riskSensitivityModifier: Number.isFinite(modifier)
        ? Math.max(-10, Math.min(10, modifier))
        : 0,
      templateVariableAllowlistByCategory:
        tenantConfig?.templateVariableAllowlistByCategory || {},
      templateRequiredVariablesByCategory:
        tenantConfig?.templateRequiredVariablesByCategory || {},
      templateSignaturesByChannel: tenantConfig?.templateSignaturesByChannel || {},
    };
  } catch {
    return {
      riskSensitivityModifier: 0,
      templateVariableAllowlistByCategory: {},
      templateRequiredVariablesByCategory: {},
      templateSignaturesByChannel: {},
    };
  }
}

function analyzeOutputGate(snapshot = null) {
  const risk = snapshot?.risk && typeof snapshot.risk === 'object' ? snapshot.risk : null;
  const decision = normalizeText(risk?.decision).toLowerCase();
  const ownerDecision = normalizeText(risk?.ownerDecision).toLowerCase();
  const outputEvaluation =
    risk?.output && typeof risk.output === 'object' ? risk.output : null;
  const hasOutputEvaluation =
    Boolean(outputEvaluation) &&
    normalizeText(outputEvaluation?.scope).toLowerCase() === 'output';
  const hasPolicyMetadata =
    hasOutputEvaluation &&
    Array.isArray(outputEvaluation?.policyHits) &&
    Array.isArray(outputEvaluation?.policyAdjustments);
  const requiresOwnerOverride = decision === 'review_required' || decision === 'blocked';
  const hasOwnerOverride =
    ownerDecision === 'approved_exception' || ownerDecision === 'false_positive';

  const issues = [];
  if (!risk) issues.push('risk_missing');
  if (!hasOutputEvaluation) issues.push('output_evaluation_missing');
  if (hasOutputEvaluation && !hasPolicyMetadata) issues.push('policy_metadata_missing');
  if (!decision) issues.push('decision_missing');
  if (requiresOwnerOverride && !hasOwnerOverride) issues.push('owner_override_missing');

  return {
    decision: decision || null,
    ownerDecision: ownerDecision || null,
    hasOutputEvaluation,
    hasPolicyMetadata,
    issues,
    fixableIssues: issues.filter((item) => item !== 'owner_override_missing'),
  };
}

function createOpsRouter({
  config,
  authStore,
  secretRotationStore = null,
  scheduler = null,
  templateStore = null,
  tenantConfigStore = null,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();
  const REQUIRED_SCHEDULER_SUITE_JOB_IDS = Object.freeze([
    'alert_probe',
    'nightly_pilot_report',
    'backup_prune',
    'restore_drill_preview',
  ]);

  router.get(
    '/ops/scheduler/status',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!scheduler || typeof scheduler.getStatus !== 'function') {
        return res.status(503).json({ error: 'Scheduler är inte tillgänglig.' });
      }
      try {
        const status = scheduler.getStatus();

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.scheduler.status.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'scheduler_status',
          metadata: {
            enabled: Boolean(status?.enabled),
            started: Boolean(status?.started),
            jobs: Array.isArray(status?.jobs) ? status.jobs.length : 0,
          },
        });

        return res.json({
          ok: true,
          generatedAt: new Date().toISOString(),
          scheduler: status,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa scheduler-status.' });
      }
    }
  );

  router.post(
    '/ops/scheduler/run',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!scheduler || typeof scheduler.runJob !== 'function') {
        return res.status(503).json({ error: 'Scheduler är inte tillgänglig.' });
      }

      const jobId = normalizeText(req.body?.jobId);
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      if (!jobId) {
        return res.status(400).json({ error: 'jobId krävs.' });
      }

      try {
        const runSuite = jobId === 'required_suite';
        let payload = null;
        let success = false;
        let statusCode = 200;

        if (runSuite) {
          const suiteResults = [];
          for (const suiteJobId of REQUIRED_SCHEDULER_SUITE_JOB_IDS) {
            const suiteResult = await scheduler.runJob(suiteJobId, {
              trigger: 'manual_api_suite',
              actorUserId: req.auth.userId,
              tenantId,
            });
            suiteResults.push({
              requestedJobId: suiteJobId,
              ...suiteResult,
            });
          }
          const failed = suiteResults.filter((item) => item?.ok !== true);
          const succeeded = suiteResults.length - failed.length;
          success = failed.length === 0;
          statusCode = success ? 200 : 409;
          payload = {
            ok: success,
            jobId: 'required_suite',
            trigger: 'manual_api_suite',
            suite: {
              total: suiteResults.length,
              succeeded,
              failed: failed.length,
              results: suiteResults,
            },
          };
        } else {
          const result = await scheduler.runJob(jobId, {
            trigger: 'manual_api',
            actorUserId: req.auth.userId,
            tenantId,
          });
          success = result?.ok === true;
          const errorCode = String(result?.error || '');
          statusCode =
            success ? 200 : errorCode === 'job_running' || errorCode === 'disabled_job' ? 409 : 400;
          payload = {
            ok: success,
            ...result,
          };
        }

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.scheduler.run',
          outcome: success ? 'success' : 'failure',
          targetType: 'scheduler_job',
          targetId: jobId,
          metadata: {
            requestedTenantId: tenantId,
            result: payload,
          },
        });

        return res.status(statusCode).json(payload);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte köra scheduler-jobb.' });
      }
    }
  );

  router.get(
    '/ops/secrets/status',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!secretRotationStore || typeof secretRotationStore.getSecretsStatus !== 'function') {
        return res.status(503).json({ error: 'Secret rotation store är inte tillgänglig.' });
      }
      try {
        const maxAgeDays = parseDays(
          req.query?.maxAgeDays,
          parseDays(config?.secretRotationMaxAgeDays, 90)
        );
        const status = await secretRotationStore.getSecretsStatus({ maxAgeDays });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.secrets.status.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'secrets_status',
          metadata: {
            tracked: Number(status?.totals?.tracked || 0),
            required: Number(status?.totals?.required || 0),
            staleRequired: Number(status?.totals?.staleRequired || 0),
            pendingRotation: Number(status?.totals?.pendingRotation || 0),
            maxAgeDays,
          },
        });

        return res.json({
          ok: true,
          maxAgeDays,
          ...status,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa secret-rotation status.' });
      }
    }
  );

  router.post(
    '/ops/readiness/remediate-output-gates',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (
        !templateStore ||
        typeof templateStore.listActiveVersionSnapshots !== 'function' ||
        typeof templateStore.getTemplate !== 'function' ||
        typeof templateStore.getTemplateVersion !== 'function' ||
        typeof templateStore.evaluateVersion !== 'function'
      ) {
        return res.status(503).json({ error: 'Template store saknas för readiness-remediation.' });
      }

      try {
        const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
        const dryRun = parseBoolean(req.body?.dryRun, true);
        const limit = parseLimit(req.body?.limit, 50);
        const detailsLimit = parseLimit(req.body?.detailsLimit, 3);

        const activeVersions = await templateStore.listActiveVersionSnapshots({ tenantId });
        const candidates = [];

        for (const snapshot of Array.isArray(activeVersions) ? activeVersions : []) {
          const analysis = analyzeOutputGate(snapshot);
          if (analysis.issues.length === 0) continue;
          candidates.push({
            templateId: normalizeText(snapshot?.templateId),
            templateName: normalizeText(snapshot?.templateName) || null,
            category: normalizeText(snapshot?.category) || null,
            versionId: normalizeText(snapshot?.versionId),
            versionNo: Number(snapshot?.versionNo || 0),
            activatedAt: normalizeText(snapshot?.activatedAt) || null,
            updatedAt: normalizeText(snapshot?.updatedAt) || null,
            ...analysis,
          });
        }

        const limitedCandidates = candidates.slice(0, limit);
        const fixableCandidates = limitedCandidates.filter((item) => item.fixableIssues.length > 0);
        const manualCandidates = limitedCandidates.filter((item) => item.fixableIssues.length === 0);

        const fixed = [];
        const skipped = [];

        if (!dryRun) {
          const tenantRuntime = await getTenantTemplateRuntime(tenantConfigStore, tenantId);

          for (const candidate of limitedCandidates) {
            if (!candidate.templateId || !candidate.versionId) {
              skipped.push({
                templateId: candidate.templateId,
                versionId: candidate.versionId,
                reason: 'missing_template_or_version_id',
              });
              continue;
            }
            if (candidate.fixableIssues.length === 0) {
              skipped.push({
                templateId: candidate.templateId,
                versionId: candidate.versionId,
                reason: 'manual_owner_override_required',
                issues: candidate.issues,
              });
              continue;
            }

            const template = await templateStore.getTemplate(candidate.templateId);
            const version = await templateStore.getTemplateVersion(
              candidate.templateId,
              candidate.versionId
            );
            if (!template || !version) {
              skipped.push({
                templateId: candidate.templateId,
                versionId: candidate.versionId,
                reason: 'template_or_version_not_found',
              });
              continue;
            }

            const contentForEvaluation = applyChannelSignature({
              content: version.content,
              channel: template.channel,
              signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
            });
            const variableValidation = validateTemplateVariables({
              category: template.category,
              content: contentForEvaluation,
              variables: version.variablesUsed,
              allowlistOverridesByCategory:
                tenantRuntime.templateVariableAllowlistByCategory,
              requiredOverridesByCategory:
                tenantRuntime.templateRequiredVariablesByCategory,
            });
            const inputEvaluation = evaluateTemplateRisk({
              scope: 'input',
              category: template.category,
              content: contentForEvaluation,
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              variableValidation,
            });
            const outputEvaluation = evaluateTemplateRisk({
              scope: 'output',
              category: template.category,
              content: contentForEvaluation,
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              variableValidation,
            });

            const repaired = await templateStore.evaluateVersion({
              templateId: candidate.templateId,
              versionId: candidate.versionId,
              inputEvaluation,
              outputEvaluation,
              persistEvaluation: false,
              ownerDecisionOverride: candidate.ownerDecision || '',
            });
            const postAnalysis = analyzeOutputGate({ risk: repaired?.risk });

            fixed.push({
              templateId: candidate.templateId,
              versionId: candidate.versionId,
              versionNo: candidate.versionNo,
              beforeIssues: candidate.issues,
              afterIssues: postAnalysis.issues,
              beforeDecision: candidate.decision,
              afterDecision: postAnalysis.decision,
              beforeOwnerDecision: candidate.ownerDecision,
              afterOwnerDecision: postAnalysis.ownerDecision,
              unknownVariables: Number(variableValidation?.unknownVariables?.length || 0),
              missingRequiredVariables: Number(
                variableValidation?.missingRequiredVariables?.length || 0
              ),
            });
          }
        }

        const remainingFixableAfterApply = dryRun
          ? fixableCandidates.length
          : fixed.filter((item) =>
              (Array.isArray(item.afterIssues) ? item.afterIssues : []).some(
                (issue) => issue !== 'owner_override_missing'
              )
            ).length;
        const resolvedFixableCount = dryRun
          ? 0
          : fixed.length - remainingFixableAfterApply;

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: dryRun
            ? 'ops.readiness.remediate_output_gates.preview'
            : 'ops.readiness.remediate_output_gates.run',
          outcome: 'success',
          targetType: 'ops',
          targetId: tenantId,
          metadata: {
            tenantId,
            dryRun,
            limit,
            scanned: activeVersions.length,
            candidates: candidates.length,
            fixableCandidates: fixableCandidates.length,
            manualCandidates: manualCandidates.length,
            fixedCount: fixed.length,
            resolvedFixableCount,
            remainingFixableAfterApply,
            skippedCount: skipped.length,
          },
        });

        return res.json({
          ok: true,
          tenantId,
          dryRun,
          limit,
          scanned: activeVersions.length,
          candidates: candidates.length,
          fixableCandidates: fixableCandidates.length,
          manualCandidates: manualCandidates.length,
          fixedCount: fixed.length,
          resolvedFixableCount,
          remainingFixableAfterApply,
          skippedCount: skipped.length,
          candidatesPreview: limitedCandidates.slice(0, detailsLimit),
          fixedPreview: fixed.slice(0, detailsLimit),
          skippedPreview: skipped.slice(0, detailsLimit),
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(error);
        return res
          .status(500)
          .json({ error: 'Kunde inte köra readiness remediation för output gates.' });
      }
    }
  );

  router.post(
    '/ops/secrets/snapshot',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!secretRotationStore || typeof secretRotationStore.captureSnapshot !== 'function') {
        return res.status(503).json({ error: 'Secret rotation store är inte tillgänglig.' });
      }
      try {
        const dryRun = parseBoolean(req.body?.dryRun, true);
        const force = parseBoolean(req.body?.force, false);
        const note = normalizeText(req.body?.note || '');
        const source = dryRun ? 'ops_snapshot_preview' : 'ops_snapshot_commit';
        const snapshot = await secretRotationStore.captureSnapshot({
          actorUserId: req.auth.userId,
          source,
          note,
          dryRun,
          force,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: dryRun ? 'ops.secrets.snapshot.preview' : 'ops.secrets.snapshot.run',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'secrets_snapshot',
          metadata: {
            dryRun,
            force,
            changedCount: Number(snapshot?.totals?.changedCount || 0),
            staleRequired: Number(snapshot?.totals?.staleRequired || 0),
            pendingRotation: Number(snapshot?.totals?.pendingRotation || 0),
          },
        });

        return res.json({
          ok: true,
          ...snapshot,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte skapa secret-rotation snapshot.' });
      }
    }
  );

  router.get(
    '/ops/secrets/history',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!secretRotationStore || typeof secretRotationStore.listSecretHistory !== 'function') {
        return res.status(503).json({ error: 'Secret rotation store är inte tillgänglig.' });
      }
      try {
        const secretId = normalizeText(req.query?.secretId || '');
        const limit = parseLimit(req.query?.limit, 50);
        const history = await secretRotationStore.listSecretHistory({
          secretId,
          limit,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.secrets.history.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: secretId || 'all',
          metadata: {
            limit,
            count: Number(history?.count || 0),
          },
        });

        return res.json({
          secretId: secretId || null,
          limit,
          ...history,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa secret-rotation historik.' });
      }
    }
  );

  router.get(
    '/ops/reports',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const limit = parseLimit(req.query?.limit, 20);
        const reports = await listSchedulerPilotReports({
          reportsDir: config.reportsDir,
          limit,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.reports.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'scheduler_reports',
          metadata: {
            count: reports.length,
            limit,
          },
        });

        return res.json({
          reportsDir: config.reportsDir,
          retention: {
            maxFiles: config.reportRetentionMaxFiles,
            maxAgeDays: config.reportRetentionMaxAgeDays,
          },
          count: reports.length,
          reports,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa scheduler-rapporter.' });
      }
    }
  );

  router.post(
    '/ops/reports/prune',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const dryRun = parseBoolean(req.body?.dryRun, true);
        const result = await pruneSchedulerPilotReports({
          reportsDir: config.reportsDir,
          maxFiles: config.reportRetentionMaxFiles,
          maxAgeDays: config.reportRetentionMaxAgeDays,
          dryRun,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: dryRun ? 'ops.reports.prune.preview' : 'ops.reports.prune.run',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'scheduler_reports',
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
        return res.status(500).json({ error: 'Kunde inte pruna scheduler-rapporter.' });
      }
    }
  );

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
