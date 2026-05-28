'use strict';

/**
 * Contextual Documentation Service.
 *
 * Maps admin sections to relevant documentation files.
 * Serves markdown content per section for inline display.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

const SECTION_DOCS = Object.freeze({
  overview: [
    {
      path: 'docs/strategy/MASTER-TODO.md',
      title: 'Master TODO',
      description: 'Huvudchecklista — all progress',
    },
    {
      path: 'docs/strategy/CCO-SYSTEM-SCOPE.md',
      title: 'Systemomfång',
      description: 'Vad CCO ska kunna göra',
    },
    {
      path: 'docs/strategy/ROLLOUT-PLAN.md',
      title: 'Utrullningsplan',
      description: '6-fas go-live plan',
    },
    {
      path: 'docs/strategy/PROJECT-CHECKLIST.md',
      title: 'Projektchecklista',
      description: 'Operativ checklista',
    },
  ],
  booking: [
    {
      path: 'docs/strategy/cco-booking-mvp-spec.md',
      title: 'Bokningsmotor MVP',
      description: 'Specifikation bokningsmotor',
    },
    {
      path: 'docs/strategy/cco-booking-plan-a-go-live.md',
      title: 'Plan A Go-Live',
      description: 'Bokning go-live checklista',
    },
    {
      path: 'docs/strategy/cco-booking-sprint-0-checklist.md',
      title: 'Sprint 0',
      description: 'Första sprinten checklista',
    },
    {
      path: 'docs/ops/runbooks/cco-booking-operator-runbook.md',
      title: 'Operatör-runbook',
      description: 'Hur man hanterar bokningar',
    },
  ],
  journal: [
    {
      path: 'docs/strategy/JOURNAL-DATAMODELL.md',
      title: 'Journaldatamodell',
      description: 'Fältlistor, PDL-krav, schemas',
    },
    {
      path: 'docs/strategy/cco-patient-journal-build-plan.md',
      title: 'Journal-byggplan',
      description: 'Fas 0–10 teknisk roadmap',
    },
    {
      path: 'docs/strategy/CCO-UNIFIED-SYSTEM-PLAN.md',
      title: 'Unified System Plan',
      description: 'Migrering formulärmatris',
    },
    {
      path: 'docs/strategy/MERIDIQ-INVENTORY.md',
      title: 'Meridiq-inventering',
      description: '82 tjänster, 16 formulär, 39 samtycken',
    },
  ],
  customers: [
    {
      path: 'docs/strategy/pilot-patients-fas-b.md',
      title: 'Pilotkunder',
      description: '5 pilotkunder + data',
    },
    {
      path: 'docs/ops/migration-drive-sharepoint-runbook.md',
      title: 'Migration-runbook',
      description: 'Drive + SharePoint migration',
    },
    {
      path: 'docs/strategy/cco-mobile-staff-instructions.md',
      title: 'Personalinstruktion',
      description: '1-sida för personal',
    },
  ],
  agreements: [
    {
      path: 'docs/strategy/cco-treatment-agreement-spec.md',
      title: 'Behandlingsavtal',
      description: 'Spec: avtal + betänketid',
    },
    {
      path: 'docs/strategy/ma-document-placement-plan.md',
      title: 'Dokumentplacering',
      description: 'Fas A–D + avtalsgate',
    },
  ],
  coo: [
    {
      path: 'docs/strategy/arcana-master-plan-punktvis.md',
      title: 'Masterplan',
      description: 'Executive OS punktvis',
    },
    {
      path: 'docs/strategy/arcana-phase-2-masterplan.md',
      title: 'Phase 2',
      description: 'Expansion masterplan',
    },
    {
      path: 'docs/ops/runbooks/incident-runbook.md',
      title: 'Incident-runbook',
      description: 'Hantera incidenter',
    },
  ],
  cao: [
    {
      path: 'docs/strategy/cao-arcana-admin-operator-implementation-plan.md',
      title: 'CAO Implementation',
      description: 'Admin operator plan',
    },
    {
      path: 'docs/ops/runbooks/cao-admin-operator-runbook.md',
      title: 'CAO Runbook',
      description: 'Operatörsguide',
    },
    {
      path: 'docs/strategy/cao-capability-risk-matrix.md',
      title: 'Riskmatris',
      description: 'CAO capability-risker',
    },
  ],
  cfo: [
    {
      path: 'docs/strategy/business-model.md',
      title: 'Affärsmodell',
      description: 'Intäktsmodell + kostnader',
    },
  ],
  cmo: [
    {
      path: 'docs/strategy/cmo-v3-rollout-plan.md',
      title: 'CMO Rollout',
      description: 'Marketing connectors plan',
    },
    {
      path: 'docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md',
      title: 'CMO Implementation',
      description: 'Marketing Copilot plan',
    },
    {
      path: 'docs/ops/runbooks/cmo-marketing-copilot-runbook.md',
      title: 'CMO Runbook',
      description: 'Operatörsguide marketing',
    },
    {
      path: 'docs/strategy/cmo-capability-risk-matrix.md',
      title: 'CMO Riskmatris',
      description: 'Marketing capability-risker',
    },
  ],
  compliance: [
    {
      path: 'docs/legal/gdpr-dpa-template.md',
      title: 'GDPR DPA',
      description: 'Personuppgiftsbiträdesavtal',
    },
    {
      path: 'docs/legal/data-retention-policy.md',
      title: 'Datalagring',
      description: '10-års retention policy',
    },
    {
      path: 'docs/legal/pdl-mdr-assessment.md',
      title: 'PDL/MDR',
      description: 'Patientdatalagen + MDR',
    },
    {
      path: 'docs/legal/iso27001-soc2-readiness.md',
      title: 'ISO 27001 / SOC 2',
      description: 'Säkerhetsreadiness',
    },
    {
      path: 'docs/legal/personuppgiftspolicy-pub-maj-arcana.md',
      title: 'PUB',
      description: 'Personuppgiftspolicy',
    },
    {
      path: 'docs/legal/art-30-register-maj-arcana.md',
      title: 'Art. 30',
      description: 'Behandlingsregister',
    },
  ],
  ops: [
    {
      path: 'docs/ops/tenant-onboarding-playbook.md',
      title: 'Tenant Onboarding',
      description: 'Ny tenant-setup',
    },
    {
      path: 'docs/ops/secrets-rotation-runbook.md',
      title: 'Hemlighetsrotation',
      description: 'Secrets rotation guide',
    },
    {
      path: 'docs/ops/release-governance-runbook.md',
      title: 'Release Governance',
      description: 'Deploy-process',
    },
    {
      path: 'docs/ops/runbooks/rollback-runbook.md',
      title: 'Rollback',
      description: 'Hur man rullar tillbaka',
    },
    {
      path: 'docs/ops/runbooks/failover-runbook.md',
      title: 'Failover',
      description: 'Failover-process',
    },
    {
      path: 'docs/ops/runbooks/auth-go-live-rollback-runbook.md',
      title: 'Auth Go-Live',
      description: 'MFA enforcement runbook',
    },
  ],
  mobile: [
    {
      path: 'docs/strategy/cco-mobile-staff-instructions.md',
      title: 'Personalinstruktion',
      description: '1-sida mobilguide',
    },
    {
      path: 'docs/strategy/cco-mobile-ux-sweep-plan.md',
      title: 'UX Sweep',
      description: 'Mobil UX-förbättringar',
    },
    {
      path: 'docs/strategy/cco-mobile-staff-journal-plan.md',
      title: 'Mobil Journal',
      description: 'Journalplan för mobil',
    },
    {
      path: 'docs/strategy/cco-mobile-staff-pilot-checklist.md',
      title: 'Pilot-checklista',
      description: 'Enhetstest per konsultation',
    },
  ],
  migration: [
    {
      path: 'docs/strategy/CCO-UNIFIED-SYSTEM-PLAN.md',
      title: 'Unified System Plan',
      description: 'Cliento+Meridiq+Drive migrering',
    },
    {
      path: 'docs/strategy/MERIDIQ-INVENTORY.md',
      title: 'Meridiq-inventering',
      description: 'Legacy-system inventering',
    },
    {
      path: 'docs/strategy/CLIENTO-INVENTORY.md',
      title: 'Cliento-inventering',
      description: 'Legacy bokning/kassa',
    },
    {
      path: 'docs/ops/cco-fas-j-full-enrichment-backfill-plan.md',
      title: 'Enrichment Plan',
      description: 'Drive enrich backfill',
    },
  ],
  qms: [
    {
      path: 'docs/ops/runbooks/patient-safety-incident-runbook.md',
      title: 'Patientsäkerhet',
      description: 'Incident-hantering patient',
    },
    {
      path: 'docs/a11y/wcag-aa-audit.md',
      title: 'Tillgänglighet',
      description: 'WCAG 2.2 AA audit',
    },
    {
      path: 'docs/ops/support-sla-framework.md',
      title: 'SLA Framework',
      description: 'Support-SLA regler',
    },
  ],
  security: [
    {
      path: 'docs/security/pentest-latest.md',
      title: 'Senaste pentest',
      description: 'Säkerhetstest-rapport',
    },
    {
      path: 'docs/ops/runbooks/secret-incident-runbook.md',
      title: 'Secret Incident',
      description: 'Läckta hemligheter',
    },
  ],
  postop: [
    {
      path: 'docs/strategy/post-op-review-photo-flow.md',
      title: 'Post-op Foto',
      description: 'Uppföljningsfoto-flöde',
    },
    {
      path: 'docs/ops/runbooks/post-op-review-runbook.md',
      title: 'Post-op Runbook',
      description: 'Operatörsguide uppföljning',
    },
    {
      path: 'docs/strategy/u4-post-op-decisions.md',
      title: 'Post-op Beslut',
      description: '4 beslut (kanal, avsändare, retention, UI)',
    },
  ],
  web: [
    {
      path: 'docs/strategy/web-hairtpclinic-com-masterplan.md',
      title: 'Webbstrategi',
      description: 'hairtpclinic.com plan',
    },
    {
      path: 'docs/strategy/web-to-arcana-bridge.md',
      title: 'Webb → Arcana',
      description: 'Ingest-bridge från webb',
    },
  ],
  architecture: [
    {
      path: 'docs/architecture/execution-gateway-contract.md',
      title: 'Gateway-kontrakt',
      description: 'Execution pipeline',
    },
    {
      path: 'docs/architecture/capability-framework-contract-v1.md',
      title: 'Capability Framework',
      description: 'Capability-mönster',
    },
    {
      path: 'docs/architecture/knowledge-base-rag-design.md',
      title: 'RAG Design',
      description: 'Kunskapsbas-arkitektur',
    },
  ],
});

const ALL_SECTIONS = Object.keys(SECTION_DOCS);

// ---- Complete document library (every doc in the repo, grouped by folder) ----
// "ALLT måste med" — surfaces the full docs/ tree + top-level *.md so the admin
// workspace can reach every document, and new docs appear automatically.

const SEGMENT_TITLES = Object.freeze({
  strategy: 'Strategi',
  ops: 'Drift & Runbooks',
  legal: 'Juridik & GDPR',
  adr: 'Arkitekturbeslut (ADR)',
  uiux: 'UI/UX',
  architecture: 'Arkitektur',
  security: 'Säkerhet',
  a11y: 'Tillgänglighet',
  risk: 'Risk',
  wordpress: 'WordPress',
  'design-specs': 'Designspecar',
  archives: 'Arkiv',
  docs: 'Allmänt',
  rot: 'Repo-rot',
});

function humanizeTitle(filePath) {
  const base = path.basename(filePath).replace(/\.md$/i, '');
  const cleaned = base.replace(/[-_]+/g, ' ').trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : base;
}

function segmentForPath(relPath) {
  if (!relPath.includes('/')) return 'rot'; // top-level *.md in repo root
  const parts = relPath.split('/'); // docs/<segment>/...
  if (parts[0] === 'docs') {
    return parts.length > 2 ? parts[1] : 'docs'; // docs/x.md → 'docs'
  }
  return parts[0];
}

// Only .md, only inside docs/ or a top-level repo *.md, no traversal.
function isAllowedDocPath(docPath) {
  const rel = normalizeText(docPath).replace(/\\/g, '/');
  if (!rel || rel.includes('..') || !/\.md$/i.test(rel)) return false;
  if (rel.startsWith('/')) return false;
  if (rel.startsWith('docs/')) return true;
  return !rel.includes('/'); // top-level *.md
}

async function walkMarkdown(dir, repoRoot, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdown(full, repoRoot, out);
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      out.push(path.relative(repoRoot, full).split(path.sep).join('/'));
    }
  }
}

async function getDocumentLibrary(repoRoot = process.cwd()) {
  const paths = [];
  await walkMarkdown(path.join(repoRoot, 'docs'), repoRoot, paths);
  // Top-level *.md (README, CCO-STATUS, AGENTS, …).
  try {
    const rootEntries = await fs.readdir(repoRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isFile() && /\.md$/i.test(entry.name)) paths.push(entry.name);
    }
  } catch {
    /* ignore */
  }

  const groups = new Map();
  for (const rel of paths.sort()) {
    const seg = segmentForPath(rel);
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg).push({
      path: rel,
      title: humanizeTitle(rel),
      description: rel,
    });
  }

  const segments = [...groups.entries()]
    .map(([id, documents]) => ({
      sectionId: id,
      title: SEGMENT_TITLES[id] || id,
      documentCount: documents.length,
      documents,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'sv'));

  return {
    totalDocuments: paths.length,
    totalSegments: segments.length,
    segments,
  };
}

async function getDocContent(docPath, repoRoot = process.cwd()) {
  if (!isAllowedDocPath(docPath)) {
    return { ok: false, path: docPath, error: 'Otillåten sökväg' };
  }
  const fullPath = path.resolve(repoRoot, docPath);
  // Defence-in-depth: resolved path must stay inside the repo.
  if (!fullPath.startsWith(path.resolve(repoRoot) + path.sep)) {
    return { ok: false, path: docPath, error: 'Otillåten sökväg' };
  }
  try {
    const content = await fs.readFile(fullPath, 'utf8');
    return { ok: true, path: docPath, content };
  } catch {
    return { ok: false, path: docPath, error: 'File not found' };
  }
}

// ---- Frontmatter-driven section placement -------------------------------
// A doc can place itself in one or more admin sections via frontmatter:
//   ---
//   section: ops               # single
//   sections: [booking, ops]   # or a list (also "booking, ops")
//   title: …                   # optional override
//   description: …             # optional override
//   ---
// These are MERGED with the curated SECTION_DOCS so the map is self-
// maintaining: a new doc just declares its section(s) — no edit here.

function parseFrontmatter(content) {
  const text = typeof content === 'string' ? content : '';
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return {};
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return {};
  const meta = {};
  for (let i = 1; i < end; i += 1) {
    const match = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match) meta[match[1].toLowerCase()] = match[2].trim();
  }
  return meta;
}

function sectionsFromMeta(meta) {
  const raw = meta.sections || meta.section || '';
  return String(raw)
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/^['"]|['"]$/g, '')
    )
    .filter(Boolean);
}

async function buildSectionIndex(repoRoot = process.cwd()) {
  const map = {};
  for (const [section, docs] of Object.entries(SECTION_DOCS)) {
    map[section] = docs.map((d) => ({ ...d }));
  }
  const library = await getDocumentLibrary(repoRoot);
  for (const segment of library.segments) {
    for (const doc of segment.documents) {
      const res = await getDocContent(doc.path, repoRoot);
      if (!res.ok) continue;
      const meta = parseFrontmatter(res.content);
      for (const section of sectionsFromMeta(meta)) {
        if (!map[section]) map[section] = [];
        if (map[section].some((d) => d.path === doc.path)) continue;
        map[section].push({
          path: doc.path,
          title: meta.title || doc.title,
          description: meta.description || doc.description || doc.path,
        });
      }
    }
  }
  return map;
}

let sectionIndexPromise = null;
function getSectionIndex(repoRoot = process.cwd()) {
  // Cache only for the live repo (rebuilt on restart); always fresh for
  // explicit roots so tests stay isolated.
  if (repoRoot === process.cwd()) {
    if (!sectionIndexPromise) sectionIndexPromise = buildSectionIndex(repoRoot);
    return sectionIndexPromise;
  }
  return buildSectionIndex(repoRoot);
}

// Curated docs for a section PLUS any doc that declared it via frontmatter.
async function getSectionDocs(section, repoRoot = process.cwd()) {
  const normalized = normalizeText(section).toLowerCase();
  const index = await getSectionIndex(repoRoot);
  return index[normalized] || [];
}

function getAllSections() {
  return ALL_SECTIONS.map((key) => ({
    sectionId: key,
    documentCount: SECTION_DOCS[key].length,
    documents: SECTION_DOCS[key].map((d) => ({
      path: d.path,
      title: d.title,
      description: d.description,
    })),
  }));
}

module.exports = {
  SECTION_DOCS,
  ALL_SECTIONS,
  getDocContent,
  getSectionDocs,
  parseFrontmatter,
  getAllSections,
  getDocumentLibrary,
  isAllowedDocPath,
};
