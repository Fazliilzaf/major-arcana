'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

let cachedTemplates = null;

async function loadJournalTextTemplates({ filePath } = {}) {
  if (cachedTemplates) return cachedTemplates;
  const resolved =
    filePath || path.join(__dirname, '../../migration/journal-text-templates.json');
  const raw = await fs.readFile(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  cachedTemplates = Array.isArray(parsed.templates) ? parsed.templates : [];
  return cachedTemplates;
}

async function listJournalTextTemplates({ journalType = '' } = {}) {
  const templates = await loadJournalTextTemplates();
  const filter = String(journalType || '')
    .trim()
    .toLowerCase();
  if (!filter) return templates;
  return templates.filter((item) =>
    (item.journalTypes || []).some((type) => String(type).toLowerCase() === filter)
  );
}

module.exports = {
  listJournalTextTemplates,
  loadJournalTextTemplates,
};
