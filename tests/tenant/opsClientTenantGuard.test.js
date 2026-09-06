'use strict';

/**
 * P1-005 — snäv statisk regressionsvakt: de härdade route-filerna får inte
 * tyst återgå till client-first tenant-mönster av typen
 *   normalizeText(req.query.tenantId) || req.auth.tenantId
 *   normalizeText(req.body?.tenantId) || req.auth.tenantId
 *   text(req.body?.tenantId) || text(req.auth?.tenantId)
 * Vakten är MEDVETET smal (enbart de två filer som hör till P1-005-scopet) —
 * ingen repo-global vakt.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GUARDED_FILES = ['src/routes/ops.js', 'src/routes/ccoCommDraft.js'];

// De gamla client-first-formerna — auktoritetsinversionen P1-005 tagit bort.
const FORBIDDEN_PATTERNS = [
  /normalizeText\(req\.query\?\.tenantId\)\s*\|\|\s*req\.auth/,
  /normalizeText\(req\.body\?\.tenantId\)\s*\|\|\s*req\.auth/,
  /normalizeText\(body\.tenantId\)\s*\|\|\s*req\.auth/,
  /String\(body\.tenantId\)\.trim\(\)\)\s*\|\|\s*req\.auth/,
  /text\(req\.body\?\.tenantId\)\s*\|\|\s*text\(req\.auth/,
  /text\(req\.query\?\.tenantId\)\s*\|\|\s*null/,
];

test('T-023: static guard — ops/draft-rutter använder canonical tenant-resolver, inte client-first', () => {
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
