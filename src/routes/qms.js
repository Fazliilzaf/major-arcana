'use strict';

const express = require('express');
const { CHECKLIST_TEMPLATES, PROCESS_TEMPLATES } = require('../qms/qmsTemplates');

function createQmsRouter({ authStore, qmsStore }) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';
  const ROLE_STAFF = 'STAFF';

  // --- Dashboard ---
  router.get('/qms/dashboard', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const dashboard = qmsStore.getDashboard(req.query?.tenantId);
    return res.json({ ok: true, ...dashboard });
  });

  // --- Templates (read-only) ---
  router.get(
    '/qms/templates/checklists',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      return res.json({ ok: true, templates: CHECKLIST_TEMPLATES });
    }
  );

  router.get(
    '/qms/templates/processes',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      return res.json({ ok: true, templates: PROCESS_TEMPLATES });
    }
  );

  // --- Checklists ---
  router.get('/qms/checklists', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const list = qmsStore.listChecklists({
      tenantId: req.query?.tenantId,
      status: req.query?.status,
      category: req.query?.category,
    });
    return res.json({ ok: true, checklists: list });
  });

  router.post('/qms/checklists', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const checklist = qmsStore.createChecklist({ ...req.body, createdBy: req.user?.id });
    await qmsStore.persist();
    return res.json({ ok: true, checklist });
  });

  router.post(
    '/qms/checklists/from-template',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const template = CHECKLIST_TEMPLATES.find((t) => t.templateId === req.body?.templateId);
      if (!template) return res.status(404).json({ ok: false, error: 'template_not_found' });
      const checklist = qmsStore.createChecklist({
        ...template,
        tenantId: req.body?.tenantId,
        createdBy: req.user?.id,
      });
      await qmsStore.persist();
      return res.json({ ok: true, checklist });
    }
  );

  // --- Inspections ---
  router.get('/qms/inspections', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const list = qmsStore.listInspections({
      tenantId: req.query?.tenantId,
      status: req.query?.status,
      checklistId: req.query?.checklistId,
    });
    return res.json({ ok: true, inspections: list });
  });

  router.post(
    '/qms/inspections',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const inspection = qmsStore.createInspection({ ...req.body, createdBy: req.user?.id });
      await qmsStore.persist();
      return res.json({ ok: true, inspection });
    }
  );

  router.post(
    '/qms/inspections/:id/complete',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const inspection = qmsStore.completeInspection(req.params.id, {
        ...req.body,
        completedBy: req.user?.id,
      });
      if (!inspection) return res.status(404).json({ ok: false, error: 'inspection_not_found' });
      await qmsStore.persist();
      return res.json({ ok: true, inspection });
    }
  );

  // --- Deviations ---
  router.get('/qms/deviations', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const list = qmsStore.listDeviations({
      tenantId: req.query?.tenantId,
      status: req.query?.status,
      severity: req.query?.severity,
    });
    return res.json({ ok: true, deviations: list });
  });

  router.post(
    '/qms/deviations',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const deviation = qmsStore.reportDeviation({ ...req.body, reportedBy: req.user?.id });
      await qmsStore.persist();
      return res.json({ ok: true, deviation });
    }
  );

  router.patch('/qms/deviations/:id', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const deviation = qmsStore.updateDeviation(req.params.id, {
      ...req.body,
      updatedBy: req.user?.id,
    });
    if (!deviation) return res.status(404).json({ ok: false, error: 'deviation_not_found' });
    await qmsStore.persist();
    return res.json({ ok: true, deviation });
  });

  // --- CAPA ---
  router.get('/qms/capas', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const list = qmsStore.listCapas({
      tenantId: req.query?.tenantId,
      status: req.query?.status,
      deviationId: req.query?.deviationId,
    });
    return res.json({ ok: true, capas: list });
  });

  router.post('/qms/capas', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const capa = qmsStore.createCapa({ ...req.body, createdBy: req.user?.id });
    await qmsStore.persist();
    return res.json({ ok: true, capa });
  });

  router.patch('/qms/capas/:id', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const capa = qmsStore.updateCapa(req.params.id, { ...req.body, updatedBy: req.user?.id });
    if (!capa) return res.status(404).json({ ok: false, error: 'capa_not_found' });
    await qmsStore.persist();
    return res.json({ ok: true, capa });
  });

  // --- Documents ---
  router.get('/qms/documents', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const list = qmsStore.listDocuments({
      tenantId: req.query?.tenantId,
      status: req.query?.status,
      category: req.query?.category,
    });
    return res.json({ ok: true, documents: list });
  });

  router.post('/qms/documents', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const doc = qmsStore.createDocument({ ...req.body, createdBy: req.user?.id });
    await qmsStore.persist();
    return res.json({ ok: true, document: doc });
  });

  router.patch('/qms/documents/:id', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const doc = qmsStore.updateDocument(req.params.id, { ...req.body, updatedBy: req.user?.id });
    if (!doc) return res.status(404).json({ ok: false, error: 'document_not_found' });
    await qmsStore.persist();
    return res.json({ ok: true, document: doc });
  });

  // --- Processes ---
  router.get('/qms/processes', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const list = qmsStore.listProcesses({
      tenantId: req.query?.tenantId,
      status: req.query?.status,
      category: req.query?.category,
    });
    return res.json({ ok: true, processes: list });
  });

  router.post('/qms/processes', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const proc = qmsStore.createProcess({ ...req.body, createdBy: req.user?.id });
    await qmsStore.persist();
    return res.json({ ok: true, process: proc });
  });

  router.post(
    '/qms/processes/from-template',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const template = PROCESS_TEMPLATES.find((t) => t.templateId === req.body?.templateId);
      if (!template) return res.status(404).json({ ok: false, error: 'template_not_found' });
      const proc = qmsStore.createProcess({
        ...template,
        tenantId: req.body?.tenantId,
        owner: req.body?.owner,
        createdBy: req.user?.id,
      });
      await qmsStore.persist();
      return res.json({ ok: true, process: proc });
    }
  );

  return router;
}

module.exports = { createQmsRouter };
