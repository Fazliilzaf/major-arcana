'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// T-003 — inga aktiva 'cco'-tenant-skrivningar får finnas kvar i konversations-
// domänens skriv/läs-vägar. Statisk vakt som skannar de aktuella filerna radvis,
// hoppar över kommentar-rader, och avvisar 'cco' i tenant-position.

const REPO_ROOT = path.join(__dirname, '..', '..');
const GUARDED_FILES = [
  'server.js',
  'src/routes/ccoConversation.js',
  'src/ops/ccoAiThreadSummary.js',
  'src/routes/ccoCustomerComm.js',
  'src/routes/ccoCustomerDossier.js',
];

// `|| 'cco'`-fallet är bara relevant i konversationsfilerna; server.js har
// legitima icke-tenant-`|| 'cco'` (t.ex. importedBy/source), som inte är tenant.
const TENANT_FIELD_PATTERNS = [
  /defaultTenantId\s*[:=]\s*['"]cco['"]/,
  /tenantId\s*[:=]\s*['"]cco['"]/,
];
const FALLBACK_PATTERN = /\|\|\s*['"]cco['"]/;

const FILE_PATTERNS = {
  'server.js': TENANT_FIELD_PATTERNS,
  'src/routes/ccoConversation.js': [...TENANT_FIELD_PATTERNS, FALLBACK_PATTERN],
  'src/ops/ccoAiThreadSummary.js': [...TENANT_FIELD_PATTERNS, FALLBACK_PATTERN],
  'src/routes/ccoCustomerComm.js': [...TENANT_FIELD_PATTERNS, FALLBACK_PATTERN],
  'src/routes/ccoCustomerDossier.js': [...TENANT_FIELD_PATTERNS, FALLBACK_PATTERN],
};

function isCommentLine(line) {
  const t = line.trim();
  return (
    t.startsWith('//') ||
    t.startsWith('/*') ||
    t.startsWith('*') ||
    t.startsWith('*/') ||
    t.startsWith('#')
  );
}

test('T-003: ingen aktiv cco-tenant-skrivning kvar i konversationsdomänen', () => {
  const violations = [];
  for (const rel of GUARDED_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const patterns = FILE_PATTERNS[rel] || TENANT_FIELD_PATTERNS;
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    for (let idx = 0; idx < lines.length; idx += 1) {
      if (isCommentLine(lines[idx])) continue;
      for (const pattern of patterns) {
        if (pattern.test(lines[idx])) {
          violations.push(`${rel}:${idx + 1} — ${pattern.source}`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], `Aktiva cco-tenant-mönster kvar i: ${violations.join('; ')}`);
});
