'use strict';

/**
 * Compliance Command Center — levande status per compliance-område.
 *
 * Inte bara dokument — utan mätbar status med gap, owner, next action.
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function computeComplianceStatus({
  auditIntegrity = null,
  mfaStatus = null,
  corsStrict = false,
  backupAge = null,
  restoreDrillAge = null,
  readinessScore = 0,
  tenantCount = 0,
  patientChatEnabled = false,
} = {}) {
  const areas = [];

  areas.push({
    id: 'gdpr',
    name: 'GDPR',
    status: 'green',
    evidence: 'DPA-mall, retention policy, GDPR endpoints (export/anonymize).',
    gap: null,
    owner: 'ops',
    nextAction: null,
    lastReviewed: '2026-05-14',
    riskSeverity: 'low',
  });

  areas.push({
    id: 'pdl',
    name: 'Patientdatalagen (PDL)',
    status: patientChatEnabled ? 'yellow' : 'green',
    evidence: 'PDL/MDR bedömning klar. Arcana = administrativt verktyg, ej journal.',
    gap: patientChatEnabled ? 'Patientchatt aktiv — verifiera att hälsodeklaration inte journalförs.' : null,
    owner: 'clinical',
    nextAction: patientChatEnabled ? 'Juridisk granskning av patientchattens datainsamling.' : null,
    lastReviewed: '2026-05-14',
    riskSeverity: patientChatEnabled ? 'medium' : 'low',
  });

  areas.push({
    id: 'mdr',
    name: 'Medical Device Regulation (MDR)',
    status: 'green',
    evidence: 'Arcana klassificeras ej som medicinteknisk produkt. Policy floor blockerar CDS.',
    gap: null,
    owner: 'clinical',
    nextAction: null,
    lastReviewed: '2026-05-14',
    riskSeverity: 'low',
  });

  areas.push({
    id: 'iso27001',
    name: 'ISO 27001',
    status: 'yellow',
    evidence: 'Gap-analys klar: 58/93 kontroller uppfyllda. Tekniskt starkt, organisatoriska gap.',
    gap: '6 dokument i Fas 1 saknas (infosäkerhetspolicy, AUP, BCP, etc.)',
    owner: 'ops',
    nextAction: 'Skriv 6 Fas 1-dokument + engagera extern ISMS-konsult.',
    lastReviewed: '2026-05-14',
    riskSeverity: 'medium',
  });

  areas.push({
    id: 'soc2',
    name: 'SOC 2',
    status: 'yellow',
    evidence: 'Gap-analys klar: 42/65 kriterier uppfyllda.',
    gap: 'Extern revision ej genomförd. Availability SLA ej kontraktuellt.',
    owner: 'ops',
    nextAction: 'Slutför ISO-dokument + boka SOC 2 Type I assessment.',
    lastReviewed: '2026-05-14',
    riskSeverity: 'medium',
  });

  areas.push({
    id: 'wcag',
    name: 'WCAG 2.2 AA',
    status: 'yellow',
    evidence: 'Audit klar: 35/54 uppfyllda. Skip-link + focus-ring implementerade.',
    gap: '6 gap kvar (kontrast, ARIA-roller, lang-attribut, reflow).',
    owner: 'frontend',
    nextAction: 'Implementera 6 kvarvarande fixar i lokal UI-tråd.',
    lastReviewed: '2026-05-14',
    riskSeverity: 'low',
  });

  areas.push({
    id: 'patient_safety',
    name: 'Patientsäkerhet',
    status: 'green',
    evidence: 'Kill-switch, human handoff, PII-redaction, policy floor, patient safety runbook.',
    gap: null,
    owner: 'clinical',
    nextAction: null,
    lastReviewed: '2026-05-14',
    riskSeverity: 'low',
  });

  areas.push({
    id: 'retention',
    name: 'Datalagring & retention',
    status: 'green',
    evidence: 'Retention policy dokumenterad. Scheduler kör daglig prune.',
    gap: null,
    owner: 'ops',
    nextAction: null,
    lastReviewed: '2026-05-14',
    riskSeverity: 'low',
  });

  areas.push({
    id: 'audit_integrity',
    name: 'Audit-integritet',
    status: auditIntegrity?.issues > 0 ? 'red' : 'green',
    evidence: 'Append-only hash-chain med daglig integrity-check.',
    gap: auditIntegrity?.issues > 0 ? `${auditIntegrity.issues} integrity-problem detekterade.` : null,
    owner: 'ops',
    nextAction: auditIntegrity?.issues > 0 ? 'Kör audit:repair och verifiera kedjan.' : null,
    lastReviewed: new Date().toISOString().split('T')[0],
    riskSeverity: auditIntegrity?.issues > 0 ? 'critical' : 'low',
  });

  areas.push({
    id: 'mfa',
    name: 'MFA Enforcement',
    status: mfaStatus?.allOwnersCompliant ? 'green' : 'red',
    evidence: 'MFA obligatoriskt för OWNER. Recovery codes + TOTP.',
    gap: mfaStatus?.allOwnersCompliant ? null : 'Inte alla OWNER-konton har MFA konfigurerat.',
    owner: 'ops',
    nextAction: mfaStatus?.allOwnersCompliant ? null : 'Kör owner:mfa:setup för non-compliant konton.',
    lastReviewed: new Date().toISOString().split('T')[0],
    riskSeverity: mfaStatus?.allOwnersCompliant ? 'low' : 'high',
  });

  const greenCount = areas.filter((a) => a.status === 'green').length;
  const yellowCount = areas.filter((a) => a.status === 'yellow').length;
  const redCount = areas.filter((a) => a.status === 'red').length;
  const overallStatus = redCount > 0 ? 'red' : yellowCount > 0 ? 'yellow' : 'green';

  return {
    overall: {
      status: overallStatus,
      green: greenCount,
      yellow: yellowCount,
      red: redCount,
      total: areas.length,
      score: Math.round((greenCount / areas.length) * 100),
    },
    areas,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  computeComplianceStatus,
};
