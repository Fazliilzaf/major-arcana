#!/usr/bin/env node
'use strict';

/**
 * Owner-taggning (första omgången).
 *
 * CAO:s AuditDocumentationMetadata visade att ~99% av docs saknar `owner:` i
 * frontmatter. Detta skript lägger till en frontmatter-block (owner + status)
 * på docs som saknar den, med en roll-/segment-härledd DEFAULT-owner att
 * förfina för hand. Befintlig frontmatter lämnas orörd.
 *
 *   node scripts/tag-doc-owners.js            # dry-run (visar vad som skulle ändras)
 *   node scripts/tag-doc-owners.js --apply    # skriv ändringarna
 */

const fs = require('node:fs');
const path = require('node:path');

const { rolesForPath } = require('../src/ops/knowledgeAccessor');

const APPLY = process.argv.includes('--apply');
const DOCS_DIR = path.join(process.cwd(), 'docs');

// Kurerad roll → ägar-etikett (rolesForPath ger SECTION_DOCS-sektioner).
const ROLE_OWNER = {
  cmo: 'CMO', cao: 'CAO', cfo: 'CFO', coo: 'COO', web: 'CMO',
  compliance: 'Compliance', security: 'Security', qms: 'Compliance',
  ops: 'Ops', architecture: 'Arkitektur',
  overview: 'CCO', booking: 'CCO', journal: 'CCO', customers: 'CCO',
  agreements: 'CCO', migration: 'CCO', mobile: 'CCO', postop: 'CCO',
};
// Fallback per mapp-segment.
const SEGMENT_OWNER = {
  strategy: 'CCO', ops: 'Ops', legal: 'Compliance', adr: 'Arkitektur',
  architecture: 'Arkitektur', uiux: 'Design', security: 'Security',
  a11y: 'Compliance', risk: 'Compliance', 'design-specs': 'Design',
  wordpress: 'CMO', docs: 'CCO',
};

function segmentOf(relPath) {
  const parts = relPath.split('/');
  if (parts[0] !== 'docs') return 'docs';
  return parts.length > 2 ? parts[1] : 'docs';
}

function ownerFor(relPath) {
  for (const role of rolesForPath(relPath)) {
    if (ROLE_OWNER[role]) return ROLE_OWNER[role];
  }
  return SEGMENT_OWNER[segmentOf(relPath)] || 'OWNER';
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'archives') continue; // arkiv-dumpar taggas inte
      walk(full, out);
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      out.push(full);
    }
  }
}

function main() {
  const files = [];
  walk(DOCS_DIR, files);
  let tagged = 0;
  let skipped = 0;
  const byOwner = {};

  for (const fullPath of files.sort()) {
    const relPath = path.relative(process.cwd(), fullPath).split(path.sep).join('/');
    const raw = fs.readFileSync(fullPath, 'utf8');
    if (raw.startsWith('---')) {
      skipped += 1; // har redan frontmatter — rör inte
      continue;
    }
    const owner = ownerFor(relPath);
    byOwner[owner] = (byOwner[owner] || 0) + 1;
    const frontmatter = `---\nowner: ${owner}\nstatus: active\n---\n\n`;
    if (APPLY) fs.writeFileSync(fullPath, frontmatter + raw, 'utf8');
    tagged += 1;
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — taggade ${tagged} docs, hoppade ${skipped} (redan frontmatter).`);
  console.log('owner-fördelning:', JSON.stringify(byOwner));
  if (!APPLY) console.log('Dry-run — inga filer skrivna. Kör med --apply för att skriva.');
}

main();
