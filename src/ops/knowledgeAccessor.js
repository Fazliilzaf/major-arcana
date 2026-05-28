'use strict';

/**
 * Knowledge Accessor (Fas 1 — enat kunskapslager).
 *
 * Ett ställe som ALLA ytor (admin + agenter/capabilities) läser dokument från,
 * så att "allt är överallt"-problemet löses: dokumenten definieras en gång och
 * får metadata (segment + roller + taggar) härifrån.
 *
 * Bygger på contextualDocs:
 *  - getDocumentLibrary() → alla docs grupperade per mapp (segment)
 *  - SECTION_DOCS         → den kurerade roll-/sektions-mappningen (återanvänds
 *                           som "roller" så vi slipper tagga 150 filer för hand)
 */

const path = require('node:path');
const {
  getDocumentLibrary,
  getDocContent,
  SECTION_DOCS,
} = require('./contextualDocs');
const { createKnowledgeRetriever } = require('../knowledge/retriever');

// Taggar härleds ur sökväg/filnamn — billig, deterministisk berikning.
const TAG_KEYWORDS = Object.freeze([
  'booking', 'journal', 'gdpr', 'pdl', 'mdr', 'migration', 'mobile', 'postop',
  'post-op', 'security', 'pentest', 'compliance', 'consent', 'samtycke',
  'avtal', 'agreement', 'retention', 'rollout', 'incident', 'runbook',
  'onboarding', 'tenant', 'pilot', 'cmo', 'cao', 'cfo', 'coo', 'marketing',
  'meridiq', 'cliento', 'drive', 'web', 'architecture', 'adr',
]);

function rolesForPath(relPath) {
  const roles = [];
  for (const [section, docs] of Object.entries(SECTION_DOCS)) {
    if (docs.some((d) => d.path === relPath)) roles.push(section);
  }
  return roles;
}

function tagsForPath(relPath) {
  const lower = String(relPath || '').toLowerCase();
  return TAG_KEYWORDS.filter((tag) => lower.includes(tag));
}

// Komplett index: varje dokument + segment + roller + taggar.
async function buildKnowledgeIndex(repoRoot = process.cwd()) {
  const library = await getDocumentLibrary(repoRoot);
  const documents = [];
  for (const segment of library.segments) {
    for (const doc of segment.documents) {
      documents.push({
        path: doc.path,
        title: doc.title,
        segment: segment.sectionId,
        segmentTitle: segment.title,
        roles: rolesForPath(doc.path),
        tags: tagsForPath(doc.path),
      });
    }
  }
  const curatedCount = documents.filter((d) => d.roles.length > 0).length;
  return {
    totalDocuments: documents.length,
    curatedCount,
    uncuratedCount: documents.length - curatedCount,
    roles: Object.keys(SECTION_DOCS),
    segments: library.segments.map((s) => ({ id: s.sectionId, title: s.title, count: s.documentCount })),
    documents,
  };
}

// Vad en agent/roll (eller en admin-sektion) ska se. Matchar på kurerad roll
// ELLER segment-id (så även otaggade docs blir nåbara via sin mapp).
async function docsForRole(role, repoRoot = process.cwd()) {
  const key = String(role || '').trim().toLowerCase();
  if (!key) return [];
  const index = await buildKnowledgeIndex(repoRoot);
  return index.documents.filter((d) => d.roles.includes(key) || d.segment === key);
}

async function docsForTag(tag, repoRoot = process.cwd()) {
  const key = String(tag || '').trim().toLowerCase();
  if (!key) return [];
  const index = await buildKnowledgeIndex(repoRoot);
  return index.documents.filter((d) => d.tags.includes(key));
}

function availableRoles() {
  return Object.keys(SECTION_DOCS);
}

// Shared docs retriever (keyword search over docs/) — a lazy singleton, SEPARATE
// from the patient-chat retriever so internal ops/strategy docs never leak into
// patient-facing answers. This is what agents call to ground themselves.
let docsRetrieverPromise = null;
function getDocsRetriever(repoRoot = process.cwd()) {
  if (!docsRetrieverPromise) {
    docsRetrieverPromise = createKnowledgeRetriever({
      knowledgeDir: path.join(repoRoot, 'docs'),
    });
  }
  return docsRetrieverPromise;
}

function toRepoDocPath(source) {
  const raw = String(source || '');
  const idx = raw.lastIndexOf('docs/');
  return idx >= 0 ? raw.slice(idx) : `docs/${raw}`;
}

// Grounding for an agent/role: keyword search across ALL docs, annotated with
// role/tags, optionally narrowed to the agent's role.
async function searchKnowledge(query, { limit = 6, role = '', repoRoot = process.cwd() } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const retriever = await getDocsRetriever(repoRoot);
  const hits = await retriever.search(q, { limit: role ? limit * 2 : limit });
  const annotated = hits.map((hit) => {
    const docPath = toRepoDocPath(hit.source);
    return {
      path: docPath,
      content: hit.content,
      score: hit.score,
      roles: rolesForPath(docPath),
      tags: tagsForPath(docPath),
    };
  });
  if (role) {
    const key = String(role).toLowerCase();
    const matched = annotated.filter((h) => h.roles.includes(key) || h.path.includes(`/${key}/`));
    return (matched.length ? matched : annotated).slice(0, limit);
  }
  return annotated.slice(0, limit);
}

module.exports = {
  buildKnowledgeIndex,
  docsForRole,
  docsForTag,
  searchKnowledge,
  availableRoles,
  rolesForPath,
  tagsForPath,
  getDoc: getDocContent,
};
