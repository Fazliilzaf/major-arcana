const express = require('express');

const {
  getDocContent,
  getDocsForSection,
  getAllSections,
  getDocumentLibrary,
  isAllowedDocPath,
} = require('../ops/contextualDocs');

// Document/knowledge-library endpoints. Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
function createDocsRouter() {
  const router = express.Router();

  router.get('/docs/sections', (req, res) => {
    return res.json({ ok: true, sections: getAllSections() });
  });

  // Complete document library — every doc in the repo, grouped by segment.
  router.get('/docs/library', async (req, res) => {
    try {
      const library = await getDocumentLibrary();
      return res.json({ ok: true, ...library });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || 'library_failed' });
    }
  });

  router.get('/docs/section/:sectionId', (req, res) => {
    const docs = getDocsForSection(req.params.sectionId);
    if (!docs.length) return res.status(404).json({ ok: false, error: 'section_not_found' });
    return res.json({ ok: true, sectionId: req.params.sectionId, documents: docs });
  });

  router.get('/docs/content', async (req, res) => {
    const docPath = (req.query?.path || '').trim();
    if (!isAllowedDocPath(docPath)) {
      return res.status(400).json({ ok: false, error: 'invalid_path' });
    }
    const result = await getDocContent(docPath);
    if (!result.ok) return res.status(404).json(result);
    return res.json(result);
  });

  return router;
}

module.exports = { createDocsRouter };
