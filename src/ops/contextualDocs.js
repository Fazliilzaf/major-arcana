'use strict';

/**
 * Contextual Documentation Service.
 *
 * Maps admin sections to relevant documentation files.
 * Serves markdown content per section for inline display.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }

const SECTION_DOCS = Object.freeze({
  overview: [
    { path: 'docs/strategy/MASTER-TODO.md', title: 'Master TODO', description: 'Huvudchecklista — all progress' },
    { path: 'docs/strategy/CCO-SYSTEM-SCOPE.md', title: 'Systemomfång', description: 'Vad CCO ska kunna göra' },
    { path: 'docs/strategy/ROLLOUT-PLAN.md', title: 'Utrullningsplan', description: '6-fas go-live plan' },
    { path: 'docs/strategy/PROJECT-CHECKLIST.md', title: 'Projektchecklista', description: 'Operativ checklista' },
  ],
  booking: [
    { path: 'docs/strategy/cco-booking-mvp-spec.md', title: 'Bokningsmotor MVP', description: 'Specifikation bokningsmotor' },
    { path: 'docs/strategy/cco-booking-plan-a-go-live.md', title: 'Plan A Go-Live', description: 'Bokning go-live checklista' },
    { path: 'docs/strategy/cco-booking-sprint-0-checklist.md', title: 'Sprint 0', description: 'Första sprinten checklista' },
    { path: 'docs/ops/runbooks/cco-booking-operator-runbook.md', title: 'Operatör-runbook', description: 'Hur man hanterar bokningar' },
  ],
  journal: [
    { path: 'docs/strategy/JOURNAL-DATAMODELL.md', title: 'Journaldatamodell', description: 'Fältlistor, PDL-krav, schemas' },
    { path: 'docs/strategy/cco-patient-journal-build-plan.md', title: 'Journal-byggplan', description: 'Fas 0–10 teknisk roadmap' },
    { path: 'docs/strategy/CCO-UNIFIED-SYSTEM-PLAN.md', title: 'Unified System Plan', description: 'Migrering formulärmatris' },
    { path: 'docs/strategy/MERIDIQ-INVENTORY.md', title: 'Meridiq-inventering', description: '82 tjänster, 16 formulär, 39 samtycken' },
  ],
  customers: [
    { path: 'docs/strategy/pilot-patients-fas-b.md', title: 'Pilotkunder', description: '5 pilotkunder + data' },
    { path: 'docs/ops/migration-drive-sharepoint-runbook.md', title: 'Migration-runbook', description: 'Drive + SharePoint migration' },
    { path: 'docs/strategy/cco-mobile-staff-instructions.md', title: 'Personalinstruktion', description: '1-sida för personal' },
  ],
  agreements: [
    { path: 'docs/strategy/cco-treatment-agreement-spec.md', title: 'Behandlingsavtal', description: 'Spec: avtal + betänketid' },
    { path: 'docs/strategy/ma-document-placement-plan.md', title: 'Dokumentplacering', description: 'Fas A–D + avtalsgate' },
  ],
  coo: [
    { path: 'docs/strategy/arcana-master-plan-punktvis.md', title: 'Masterplan', description: 'Executive OS punktvis' },
    { path: 'docs/strategy/arcana-phase-2-masterplan.md', title: 'Phase 2', description: 'Expansion masterplan' },
    { path: 'docs/ops/runbooks/incident-runbook.md', title: 'Incident-runbook', description: 'Hantera incidenter' },
  ],
  cao: [
    { path: 'docs/strategy/cao-arcana-admin-operator-implementation-plan.md', title: 'CAO Implementation', description: 'Admin operator plan' },
    { path: 'docs/ops/runbooks/cao-admin-operator-runbook.md', title: 'CAO Runbook', description: 'Operatörsguide' },
    { path: 'docs/strategy/cao-capability-risk-matrix.md', title: 'Riskmatris', description: 'CAO capability-risker' },
  ],
  cfo: [
    { path: 'docs/strategy/business-model.md', title: 'Affärsmodell', description: 'Intäktsmodell + kostnader' },
  ],
  cmo: [
    { path: 'docs/strategy/cmo-v3-rollout-plan.md', title: 'CMO Rollout', description: 'Marketing connectors plan' },
    { path: 'docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md', title: 'CMO Implementation', description: 'Marketing Copilot plan' },
    { path: 'docs/ops/runbooks/cmo-marketing-copilot-runbook.md', title: 'CMO Runbook', description: 'Operatörsguide marketing' },
    { path: 'docs/strategy/cmo-capability-risk-matrix.md', title: 'CMO Riskmatris', description: 'Marketing capability-risker' },
  ],
  compliance: [
    { path: 'docs/legal/gdpr-dpa-template.md', title: 'GDPR DPA', description: 'Personuppgiftsbiträdesavtal' },
    { path: 'docs/legal/data-retention-policy.md', title: 'Datalagring', description: '10-års retention policy' },
    { path: 'docs/legal/pdl-mdr-assessment.md', title: 'PDL/MDR', description: 'Patientdatalagen + MDR' },
    { path: 'docs/legal/iso27001-soc2-readiness.md', title: 'ISO 27001 / SOC 2', description: 'Säkerhetsreadiness' },
    { path: 'docs/legal/personuppgiftspolicy-pub-maj-arcana.md', title: 'PUB', description: 'Personuppgiftspolicy' },
    { path: 'docs/legal/art-30-register-maj-arcana.md', title: 'Art. 30', description: 'Behandlingsregister' },
  ],
  ops: [
    { path: 'docs/ops/tenant-onboarding-playbook.md', title: 'Tenant Onboarding', description: 'Ny tenant-setup' },
    { path: 'docs/ops/secrets-rotation-runbook.md', title: 'Hemlighetsrotation', description: 'Secrets rotation guide' },
    { path: 'docs/ops/release-governance-runbook.md', title: 'Release Governance', description: 'Deploy-process' },
    { path: 'docs/ops/runbooks/rollback-runbook.md', title: 'Rollback', description: 'Hur man rullar tillbaka' },
    { path: 'docs/ops/runbooks/failover-runbook.md', title: 'Failover', description: 'Failover-process' },
    { path: 'docs/ops/runbooks/auth-go-live-rollback-runbook.md', title: 'Auth Go-Live', description: 'MFA enforcement runbook' },
  ],
  mobile: [
    { path: 'docs/strategy/cco-mobile-staff-instructions.md', title: 'Personalinstruktion', description: '1-sida mobilguide' },
    { path: 'docs/strategy/cco-mobile-ux-sweep-plan.md', title: 'UX Sweep', description: 'Mobil UX-förbättringar' },
    { path: 'docs/strategy/cco-mobile-staff-journal-plan.md', title: 'Mobil Journal', description: 'Journalplan för mobil' },
    { path: 'docs/strategy/cco-mobile-staff-pilot-checklist.md', title: 'Pilot-checklista', description: 'Enhetstest per konsultation' },
  ],
  migration: [
    { path: 'docs/strategy/CCO-UNIFIED-SYSTEM-PLAN.md', title: 'Unified System Plan', description: 'Cliento+Meridiq+Drive migrering' },
    { path: 'docs/strategy/MERIDIQ-INVENTORY.md', title: 'Meridiq-inventering', description: 'Legacy-system inventering' },
    { path: 'docs/strategy/CLIENTO-INVENTORY.md', title: 'Cliento-inventering', description: 'Legacy bokning/kassa' },
    { path: 'docs/ops/cco-fas-j-full-enrichment-backfill-plan.md', title: 'Enrichment Plan', description: 'Drive enrich backfill' },
  ],
  qms: [
    { path: 'docs/ops/runbooks/patient-safety-incident-runbook.md', title: 'Patientsäkerhet', description: 'Incident-hantering patient' },
    { path: 'docs/a11y/wcag-aa-audit.md', title: 'Tillgänglighet', description: 'WCAG 2.2 AA audit' },
    { path: 'docs/ops/support-sla-framework.md', title: 'SLA Framework', description: 'Support-SLA regler' },
  ],
  security: [
    { path: 'docs/security/pentest-latest.md', title: 'Senaste pentest', description: 'Säkerhetstest-rapport' },
    { path: 'docs/ops/runbooks/secret-incident-runbook.md', title: 'Secret Incident', description: 'Läckta hemligheter' },
  ],
  postop: [
    { path: 'docs/strategy/post-op-review-photo-flow.md', title: 'Post-op Foto', description: 'Uppföljningsfoto-flöde' },
    { path: 'docs/ops/runbooks/post-op-review-runbook.md', title: 'Post-op Runbook', description: 'Operatörsguide uppföljning' },
    { path: 'docs/strategy/u4-post-op-decisions.md', title: 'Post-op Beslut', description: '4 beslut (kanal, avsändare, retention, UI)' },
  ],
  web: [
    { path: 'docs/strategy/web-hairtpclinic-com-masterplan.md', title: 'Webbstrategi', description: 'hairtpclinic.com plan' },
    { path: 'docs/strategy/web-to-arcana-bridge.md', title: 'Webb → Arcana', description: 'Ingest-bridge från webb' },
  ],
  architecture: [
    { path: 'docs/architecture/execution-gateway-contract.md', title: 'Gateway-kontrakt', description: 'Execution pipeline' },
    { path: 'docs/architecture/capability-framework-contract-v1.md', title: 'Capability Framework', description: 'Capability-mönster' },
    { path: 'docs/architecture/knowledge-base-rag-design.md', title: 'RAG Design', description: 'Kunskapsbas-arkitektur' },
  ],
});

const ALL_SECTIONS = Object.keys(SECTION_DOCS);

async function getDocContent(docPath, repoRoot = process.cwd()) {
  const fullPath = path.resolve(repoRoot, docPath);
  try {
    const content = await fs.readFile(fullPath, 'utf8');
    return { ok: true, path: docPath, content };
  } catch {
    return { ok: false, path: docPath, error: 'File not found' };
  }
}

function getDocsForSection(section) {
  const normalized = normalizeText(section).toLowerCase();
  return SECTION_DOCS[normalized] || [];
}

function getAllSections() {
  return ALL_SECTIONS.map((key) => ({
    sectionId: key,
    documentCount: SECTION_DOCS[key].length,
    documents: SECTION_DOCS[key].map((d) => ({ path: d.path, title: d.title, description: d.description })),
  }));
}

module.exports = { SECTION_DOCS, ALL_SECTIONS, getDocContent, getDocsForSection, getAllSections };
