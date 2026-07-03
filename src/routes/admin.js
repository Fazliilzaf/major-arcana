const express = require('express');

// Admin-shell entrypoints + alias-redirects. Mounted at "/" by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// sendAdminHtml bor kvar i server.js (drar in uiBuildId/renderAdminHtml) och injiceras.
function createAdminRouter({ sendAdminHtml }) {
  const router = express.Router();

  // Bevarar originalets beteende: /admin + ev. query-sträng + hash-fragment.
  const redirectToAdmin = (req, res, hash) => {
    const url = String(req.url || '');
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    res.redirect(302, `/admin${query}${hash}`);
  };

  router.get('/admin.html', (_req, res) => sendAdminHtml(res));

  router.get(['/admin', '/admin/'], (_req, res) => sendAdminHtml(res));

  router.get('/admin/cmo/connectors', (_req, res) => res.redirect(302, '/admin#cmo-connectors'));

  router.get('/admin/cmo', (_req, res) => res.redirect(302, '/admin#cmo'));

  router.get('/cco', (req, res) => redirectToAdmin(req, res, '#cco'));

  router.get('/unanswered', (_req, res) => sendAdminHtml(res));

  router.get(['/ccp', '/admin/cco'], (req, res) => redirectToAdmin(req, res, '#cco'));

  router.get('/admin/unanswered', (_req, res) => res.redirect(302, '/unanswered'));

  return router;
}

module.exports = { createAdminRouter };
