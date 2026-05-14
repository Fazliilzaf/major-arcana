'use strict';

const express = require('express');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createKnowledgeRouter({ knowledgeStore, requireAuth, requireRole } = {}) {
  const router = express.Router();

  router.get('/knowledge/documents', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const documents = knowledgeStore.listDocuments({
        tenantId: req.auth?.activeTenantId,
        category: normalizeText(req.query?.category) || undefined,
        limit: Math.min(100, Math.max(1, Number(req.query?.limit) || 50)),
      });
      return res.json({ ok: true, documents, count: documents.length });
    } catch (error) {
      return res.status(500).json({ error: normalizeText(error?.message) || 'Kunde inte lista dokument.' });
    }
  });

  router.get('/knowledge/documents/:documentId', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const doc = knowledgeStore.getDocument({
        tenantId: req.auth?.activeTenantId,
        documentId: normalizeText(req.params?.documentId),
      });
      if (!doc) return res.status(404).json({ error: 'Dokument hittades inte.' });
      return res.json({ ok: true, document: doc });
    } catch (error) {
      return res.status(500).json({ error: normalizeText(error?.message) || 'Kunde inte hämta dokument.' });
    }
  });

  router.post('/knowledge/documents', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const doc = await knowledgeStore.upsertDocument({
        tenantId: req.auth?.activeTenantId,
        document: req.body,
      });
      return res.status(201).json({ ok: true, document: doc });
    } catch (error) {
      return res.status(400).json({ error: normalizeText(error?.message) || 'Kunde inte spara dokument.' });
    }
  });

  router.delete('/knowledge/documents/:documentId', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const deleted = await knowledgeStore.deleteDocument({
        tenantId: req.auth?.activeTenantId,
        documentId: normalizeText(req.params?.documentId),
      });
      if (!deleted) return res.status(404).json({ error: 'Dokument hittades inte.' });
      return res.json({ ok: true, deleted: true });
    } catch (error) {
      return res.status(500).json({ error: normalizeText(error?.message) || 'Kunde inte radera.' });
    }
  });

  router.post('/knowledge/search', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const results = knowledgeStore.search({
        tenantId: req.auth?.activeTenantId,
        query: normalizeText(req.body?.query),
        maxResults: Math.min(20, Math.max(1, Number(req.body?.maxResults) || 5)),
        category: normalizeText(req.body?.category) || undefined,
      });
      return res.json({ ok: true, results, count: results.length });
    } catch (error) {
      return res.status(500).json({ error: normalizeText(error?.message) || 'Sökning misslyckades.' });
    }
  });

  router.get('/knowledge/stats', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const stats = knowledgeStore.getStats({ tenantId: req.auth?.activeTenantId });
      return res.json({ ok: true, ...stats });
    } catch (error) {
      return res.status(500).json({ error: normalizeText(error?.message) || 'Kunde inte hämta statistik.' });
    }
  });

  return router;
}

module.exports = {
  createKnowledgeRouter,
};
