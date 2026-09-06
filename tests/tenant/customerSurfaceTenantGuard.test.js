'use strict';

/**
 * P1-003/004 — snäv statisk regressionsvakt: de härdade route-filerna får inte
 * tyst återgå till client-first tenant-mönster av typen
 *   normalizeText(req.query.tenantId) || normalizeText(req.auth?.tenantId)
 *   normalizeText(req.body?.tenantId) || normalizeText(req.auth?.tenantId)
 * Vakten är MEDVETET smal (enbart de två filer som hör till den här frozen
 * scopet) — ingen repo-global vakt.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GUARDED_FILES = [
  'src/routes/ccoCustomerDossier.js',
  'src/routes/ccoCustomerComm.js',
];

// Precis de gamla client-first-formerna (alla var inlindade i normalizeText(...)
// och föll tillbaka på req.auth — den auktoritetsinvertering vi just tagit bort).
const FORBIDDEN_PATTERNS = [
  /normalizeText\(req\.query\.tenantId\)/,
  /normalizeText\(req\.body\?\.tenantId\)/,
  /normalizeText\(body\.tenantId\s*\|\|\s*req\.query\.tenantId\)/,
  /text\(req\.query\?\.tenantId\)\s*\|\|\s*text\(req\.auth/,
];

test('static guard: dossier/comm-rutter använder canonical tenant-resolver, inte client-first', () => {
  for (const rel of GUARDED_FILES) {
    const filePath = path.join(__dirname, '..', '..', rel);
    const src = fs.readFileSync(filePath, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.doesNotMatch(
        src,
        pattern,
        `${rel} innehåller ett förbjudet client-first tenant-mönster: ${pattern}`
      );
    }
    assert.match(
      src,
      /resolveTenantScope/,
      `${rel} använder inte den canonical tenant-scopen (resolveTenantScope)`
    );
  }
});
