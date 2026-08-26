'use strict';

/**
 * Seeder för ORD-125: registrerar portal-notis-mallen (`portal_reply_notify`)
 * i ccoTemplateRegistry via `upsert` (samma väg som POST /api/v1/cco-templates).
 * Skriver till data/cco-templates.json — ingen hand-redigering av JSON.
 *
 * `upsert` sätter legalReviewStatus:'pending' som standard. Det är rätt: notisen
 * ligger still tills juridik godkänner. Godkänn INTE här.
 *
 * Idempotent: kör igen med samma ämne/kropp → ingen ny revision, ingen status-
 * ändring (den gamla legal-statusen bevaras).
 *
 *   node scripts/seed-portal-reply-template.js
 */

const path = require('node:path');
const { createCcoTemplateRegistry } = require('../src/ops/ccoTemplateRegistry');

const FILE_PATH = path.join(__dirname, '..', 'data', 'cco-templates.json');

// ORDAGRANT kopierad från dagens hårdkodade text i ccoPortalReplyNotification.js
// (den flyttas, den skrivs inte om). Variabler enligt ccoMessageRenderer:
//   {{firstName}}  — kundens tilltalsnamn
//   {{portalUrl}}  — portal-länken (magisk token)
const PORTAL_REPLY_TEMPLATE = {
  id: 'portal_reply_notify',
  name: 'Portal-notis vid klinik-svar',
  type: 'notification',
  lang: 'sv',
  subject: 'Du har ett nytt svar i din portal',
  body:
    'Hej {{firstName}},\n\n' +
    'Kliniken har svarat dig i din trygga portal.\n\n' +
    '{{portalUrl}}\n\n' +
    'Hair TP Clinic',
};

(async () => {
  const registry = await createCcoTemplateRegistry({ filePath: FILE_PATH });
  const existing = registry.get(PORTAL_REPLY_TEMPLATE.id);
  const record = await registry.upsert(PORTAL_REPLY_TEMPLATE, { role: 'system' });

  console.log('Seed portal_reply_notify →', FILE_PATH);
  console.log('  id              :', record.id);
  console.log('  type            :', record.type);
  console.log('  currentVersion  :', record.currentVersion);
  console.log('  legalReviewStatus:', record.legalReviewStatus, '(rätt utgångsläge: pending)');
  console.log('  revisions       :', record.revisions.length);
  if (existing) {
    console.log('  (fanns redan, upsert var idempotent; ingen status-ändring)');
  }
})().catch((err) => {
  console.error('Seeder misslyckades:', err && err.message);
  process.exit(1);
});
