'use strict';

const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { loadDocumentationIndex } = require('../capabilities/caoCapabilityKit');
const { buildCaoReadinessSnapshot } = require('../ops/readinessEvaluator');
const { loadAdminIncidentAdminView } = require('../ops/adminIncidentReadModel');
const { parseSimpleFrontmatter } = require('../ops/docFrontmatter');
const { resolveAdminChecklistsForRole } = require('../ops/adminTemplateSeeds');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createAdminWorkspaceRouter({
  authStore,
  templateStore,
  adminTasksStore,
  scheduler = null,
  config = null,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();
  const appConfig = config || require('../config');

  router.patch(
    '/admin/tasks/:taskId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (!adminTasksStore || typeof adminTasksStore.upsertTask !== 'function') {
          return res.status(503).json({ error: 'Admin tasks store saknas.' });
        }
        const taskId = normalizeText(req.params?.taskId);
        if (!taskId) {
          return res.status(400).json({ error: 'taskId saknas.' });
        }
        const tenantId = req.auth.tenantId;
        const existingItems = await adminTasksStore.listTasks({ tenantId, limit: 500 });
        const existing = (Array.isArray(existingItems) ? existingItems : []).find(
          (task) => normalizeText(task.id) === taskId
        );
        if (!existing) {
          return res.status(404).json({ error: 'Admin task hittades inte.' });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const updatedFields = [];
        const next = { ...existing };
        if (Object.prototype.hasOwnProperty.call(body, 'owner')) {
          next.owner = normalizeText(body.owner);
          updatedFields.push('owner');
        }
        if (Object.prototype.hasOwnProperty.call(body, 'status')) {
          next.status = normalizeText(body.status).toLowerCase() || existing.status;
          updatedFields.push('status');
        }
        if (Object.prototype.hasOwnProperty.call(body, 'dod')) {
          next.dod = normalizeText(body.dod);
          updatedFields.push('dod');
        }
        if (Object.prototype.hasOwnProperty.call(body, 'nextStep')) {
          next.nextStep = normalizeText(body.nextStep);
          updatedFields.push('nextStep');
        }
        if (Object.prototype.hasOwnProperty.call(body, 'deadline')) {
          next.deadline = normalizeText(body.deadline);
          updatedFields.push('deadline');
        }
        if (!updatedFields.length) {
          return res.status(400).json({ error: 'Inga fält att uppdatera (owner, status, dod, nextStep, deadline).' });
        }

        const item = await adminTasksStore.upsertTask(next);
        if (authStore && typeof authStore.addAuditEvent === 'function') {
          await authStore.addAuditEvent({
            tenantId,
            actorUserId: req.auth.userId,
            action: 'admin.task.update',
            outcome: 'success',
            targetType: 'admin_task',
            targetId: taskId,
            metadata: {
              fields: updatedFields,
              owner: item.owner || null,
              status: item.status || null,
            },
          });
        }
        return res.json({ item, updatedFields });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte uppdatera admin task.' });
      }
    }
  );

  router.get(
    '/admin/tasks',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (!adminTasksStore || typeof adminTasksStore.listTasks !== 'function') {
          return res.status(503).json({ error: 'Admin tasks store saknas.' });
        }
        const items = await adminTasksStore.listTasks({
          tenantId: req.auth.tenantId,
          status: normalizeText(req.query?.status),
          owner: normalizeText(req.query?.owner),
          riskLevel: normalizeText(req.query?.riskLevel),
          workstream: normalizeText(req.query?.workstream),
          deadlineBefore: normalizeText(req.query?.deadlineBefore),
          limit: Number(req.query?.limit) || 200,
        });
        return res.json({
          items,
          summary: {
            total: items.length,
            missingOwner: items.filter((task) => !normalizeText(task.owner)).length,
            overdue: items.filter((task) => {
              const ts = Date.parse(normalizeText(task.deadline));
              return Number.isFinite(ts) && ts < Date.now();
            }).length,
          },
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa admin tasks.' });
      }
    }
  );

  router.get(
    '/admin/incidents/admin-view',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const view = await loadAdminIncidentAdminView({
          templateStore,
          tenantId: req.auth.tenantId,
          filters: {
            owner: normalizeText(req.query?.owner),
            severity: normalizeText(req.query?.severity),
            slaRisk: normalizeText(req.query?.slaRisk),
            status: normalizeText(req.query?.status) || 'open',
          },
          limit: Number(req.query?.limit) || 200,
        });
        return res.json({
          items: view.items,
          summary: view.summary,
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa incident admin-vy.' });
      }
    }
  );

  router.get(
    '/admin/documentation/gaps',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const fs = require('node:fs/promises');
        const path = require('node:path');
        const ownerFilter = normalizeText(req.query?.owner).toLowerCase();
        const statusFilter = normalizeText(req.query?.status).toLowerCase();
        const index = await loadDocumentationIndex(process.cwd());
        const repoRoot = process.cwd();
        const documents = [];
        for (const link of (index.links || []).slice(0, 60)) {
          const relPath = normalizeText(link);
          if (!relPath) continue;
          const fullPath = path.join(repoRoot, 'docs', relPath);
          let owner = null;
          let status = 'indexed';
          let nextStep = null;
          const issues = [];
          try {
            const raw = await fs.readFile(fullPath, 'utf8');
            const parsed = parseSimpleFrontmatter(raw);
            owner = normalizeText(parsed.attributes.owner) || null;
            status = normalizeText(parsed.attributes.status).toLowerCase() || status;
            nextStep =
              normalizeText(parsed.attributes.next_step) ||
              normalizeText(parsed.attributes.nextstep) ||
              null;
          } catch {
            issues.push('unreadable');
          }
          if (!owner) issues.push('missing_owner');
          if (!nextStep) issues.push('missing_next_step');
          documents.push({ path: relPath, owner, status, nextStep, issues });
        }
        let items = documents;
        if (ownerFilter) {
          items = items.filter((doc) => normalizeText(doc.owner).toLowerCase().includes(ownerFilter));
        }
        if (statusFilter) {
          items = items.filter((doc) => normalizeText(doc.status).toLowerCase() === statusFilter);
        }
        return res.json({
          items,
          summary: { total: items.length, missingOwner: items.filter((d) => !d.owner).length },
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa dokumentgaps.' });
      }
    }
  );

  router.get(
    '/admin/audit/trace',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (!authStore || typeof authStore.listAuditEvents !== 'function') {
          return res.status(503).json({ error: 'Audit store saknas.' });
        }
        const actionFilter = normalizeText(req.query?.action);
        const outcomeFilter = normalizeText(req.query?.outcome).toLowerCase();
        const since = normalizeText(req.query?.since);
        const sinceTs = since ? Date.parse(since) : NaN;
        const events = await authStore.listAuditEvents({
          tenantId: req.auth.tenantId,
          limit: Number(req.query?.limit) || 200,
        });
        let items = Array.isArray(events) ? events : [];
        if (actionFilter) {
          items = items.filter((event) =>
            normalizeText(event?.action).toLowerCase().includes(actionFilter.toLowerCase())
          );
        }
        if (outcomeFilter) {
          items = items.filter(
            (event) => normalizeText(event?.outcome).toLowerCase() === outcomeFilter
          );
        }
        if (Number.isFinite(sinceTs)) {
          items = items.filter((event) => {
            const ts = Date.parse(normalizeText(event?.ts || event?.createdAt));
            return Number.isFinite(ts) && ts >= sinceTs;
          });
        }
        return res.json({
          items: items.slice(0, 200),
          summary: { total: items.length },
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa audit-spårning.' });
      }
    }
  );

  router.get(
    '/admin/checklists',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const role = normalizeText(req.query?.role) || req.auth.role || ROLE_STAFF;
        const checklist = await resolveAdminChecklistsForRole({
          templateStore,
          tenantId: req.auth.tenantId,
          role,
        });
        return res.json(checklist);
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa checklistor.' });
      }
    }
  );

  router.get(
    '/admin/readiness/snapshot',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const readiness = await buildCaoReadinessSnapshot({
          tenantId: req.auth.tenantId,
          templateStore,
          authStore,
          scheduler,
          adminTasksStore,
          config: appConfig,
        });
        return res.json(readiness);
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Kunde inte läsa readiness snapshot.' });
      }
    }
  );

  return router;
}

module.exports = {
  createAdminWorkspaceRouter,
};
