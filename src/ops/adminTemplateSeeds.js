'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const ADMIN_TEMPLATE_SEEDS = Object.freeze([
  {
    seedKey: 'admin-onboarding-checklist',
    name: 'Admin — Onboarding checklist',
    title: 'Onboarding checklist (utkast)',
    content: [
      '# Onboarding checklist',
      '',
      '## Owner',
      '- [ ] Tilldela tenant-owner',
      '',
      '## Definition of Done',
      '- [ ] Staff-inbjudan skickad',
      '- [ ] Mallbibliotek granskat',
      '- [ ] Risk/profil dokumenterad',
      '',
      '## Nästa steg',
      'Kör Arcana Admin Operator quality gate.',
    ].join('\n'),
  },
  {
    seedKey: 'admin-incident-report',
    name: 'Admin — Incident rapport',
    title: 'Incident rapport (utkast)',
    content: [
      '# Incident rapport',
      '',
      'Severity: L_',
      'Owner: ',
      'Deadline: ',
      '',
      '## Tidslinje',
      '- Upptäckt:',
      '- Eskalerad:',
      '',
      '## SLA-risk',
      '- Breach: ja/nej',
      '- Nästa steg:',
    ].join('\n'),
  },
  {
    seedKey: 'admin-sla-followup',
    name: 'Admin — SLA-uppföljning',
    title: 'SLA-uppföljning (utkast)',
    content: [
      '# SLA-uppföljning',
      '',
      'Incident-ID:',
      'Deadline:',
      'Status:',
      '',
      '## Åtgärder',
      '1. Verifiera ägare',
      '2. Uppdatera deadline',
      '3. Logga owner-beslut',
    ].join('\n'),
  },
  {
    seedKey: 'admin-definition-of-done',
    name: 'Admin — Definition of Done',
    title: 'Definition of Done (utkast)',
    content: [
      '# Definition of Done',
      '',
      '- [ ] Owner tilldelad',
      '- [ ] Acceptanskriterier dokumenterade',
      '- [ ] Risknivå satt',
      '- [ ] Audit-spårbarhet verifierad',
      '- [ ] Owner sign-off',
    ].join('\n'),
  },
  {
    seedKey: 'admin-meeting-notes',
    name: 'Admin — Mötesanteckningar',
    title: 'Mötesanteckningar (utkast)',
    content: [
      '# Mötesanteckningar',
      '',
      'Datum:',
      'Deltagare:',
      '',
      '## Beslut',
      '- ',
      '',
      '## Actions',
      '- Owner / deadline / status',
    ].join('\n'),
  },
  {
    seedKey: 'admin-release-notes',
    name: 'Admin — Release notes',
    title: 'Release notes (utkast)',
    content: [
      '# Release notes',
      '',
      'Version:',
      'Datum:',
      '',
      '## Ändringar',
      '- ',
      '',
      '## Risk & rollback',
      '- Risknivå:',
      '- Rollback-plan:',
    ].join('\n'),
  },
  {
    seedKey: 'admin-runbook-ops',
    name: 'Admin — Runbook (drift)',
    title: 'Runbook drift (utkast)',
    content: [
      '# Runbook — drift',
      '',
      '## Trigger',
      '- Alert / incident / manuell',
      '',
      '## Steg',
      '1. Verifiera scope',
      '2. Kör säkra read-only checks',
      '3. Eskalera till OWNER vid L4+',
      '',
      '## Eskalering',
      'OWNER + COO vid patient-safety.',
    ].join('\n'),
  },
  {
    seedKey: 'admin-owner-weekly-checklist',
    name: 'Admin — OWNER veckochecklista',
    title: 'OWNER veckochecklista (utkast)',
    targetRoles: ['OWNER'],
    content: [
      '# OWNER veckochecklista',
      '',
      '## Go/No-Go',
      '- [ ] Läs CAO Go/No-Go brief',
      '- [ ] Verifiera monitor readiness (/monitor/readiness)',
      '- [ ] Signera eller eskalera blockers',
      '',
      '## Drift',
      '- [ ] Granska öppna incidenter utan ägare',
      '- [ ] Bekräfta scheduler/CAO-jobb färska',
      '- [ ] Godkänn eller avvisa L3+ orchestrator-planer',
    ].join('\n'),
  },
  {
    seedKey: 'admin-staff-daily-checklist',
    name: 'Admin — STAFF daglig checklista',
    title: 'STAFF daglig checklista (utkast)',
    targetRoles: ['STAFF'],
    content: [
      '# STAFF daglig checklista',
      '',
      '## Admin tasks',
      '- [ ] Uppdatera owner/status på tilldelade tasks',
      '- [ ] Dokumentera nästa steg + DoD',
      '',
      '## Kvalitet',
      '- [ ] Kör CAO quality gate vid behov',
      '- [ ] Flagga mallar/docs utan metadata',
      '',
      '## Eskalering',
      '- [ ] Eskalera L4+ till OWNER (ingen auto-exekvering)',
    ].join('\n'),
  },
]);

const ADMIN_ROLE_CHECKLIST_SETS = Object.freeze({
  OWNER: Object.freeze([
    'admin-owner-weekly-checklist',
    'admin-definition-of-done',
    'admin-release-notes',
    'admin-runbook-ops',
  ]),
  STAFF: Object.freeze([
    'admin-staff-daily-checklist',
    'admin-definition-of-done',
    'admin-meeting-notes',
  ]),
});

function isAdminSeedTemplate(template = {}) {
  return normalizeText(template.name).startsWith('Admin —');
}

async function ensureAdminTemplateDrafts({
  templateStore,
  tenantId,
  createdBy = 'cao-seed',
} = {}) {
  if (!templateStore || typeof templateStore.listTemplates !== 'function') {
    throw new Error('templateStore saknas för admin template seeds.');
  }
  const normalizedTenantId = normalizeText(tenantId) || 'default';
  const existing = await templateStore.listTemplates({
    tenantId: normalizedTenantId,
    category: 'INTERNAL',
    includeVersions: true,
  });
  const byName = new Map();
  for (const template of existing) {
    byName.set(normalizeText(template.name).toLowerCase(), template);
  }

  const created = [];
  const skipped = [];

  for (const seed of ADMIN_TEMPLATE_SEEDS) {
    const existingTemplate = byName.get(seed.name.toLowerCase()) || null;
    if (existingTemplate) {
      skipped.push({ seedKey: seed.seedKey, templateId: existingTemplate.id, reason: 'exists' });
      continue;
    }

    const template = await templateStore.createTemplate({
      tenantId: normalizedTenantId,
      category: 'INTERNAL',
      name: seed.name,
      channel: 'internal',
      locale: 'sv-SE',
      createdBy,
    });

    const version = await templateStore.createDraftVersion({
      templateId: template.id,
      title: seed.title,
      content: seed.content,
      source: 'cao_admin_seed',
      variablesUsed: [],
      createdBy,
      risk: { riskLevel: 1, category: 'INTERNAL' },
    });

    created.push({
      seedKey: seed.seedKey,
      templateId: template.id,
      versionId: version?.id || null,
      name: seed.name,
    });
  }

  return { created, skipped, totalSeeds: ADMIN_TEMPLATE_SEEDS.length };
}

function listAdminChecklistSeedsForRole(role = 'STAFF') {
  const normalizedRole = normalizeText(role).toUpperCase();
  const keys =
    ADMIN_ROLE_CHECKLIST_SETS[normalizedRole] || ADMIN_ROLE_CHECKLIST_SETS.STAFF;
  const byKey = new Map(ADMIN_TEMPLATE_SEEDS.map((seed) => [seed.seedKey, seed]));
  return keys.map((key) => byKey.get(key)).filter(Boolean);
}

async function resolveAdminChecklistsForRole({
  templateStore,
  tenantId,
  role = 'STAFF',
} = {}) {
  if (!templateStore || typeof templateStore.listTemplates !== 'function') {
    return { role: normalizeText(role).toUpperCase() || 'STAFF', items: [] };
  }
  const normalizedTenantId = normalizeText(tenantId) || 'default';
  const normalizedRole = normalizeText(role).toUpperCase() || 'STAFF';
  const seeds = listAdminChecklistSeedsForRole(normalizedRole);
  const templates = await templateStore.listTemplates({
    tenantId: normalizedTenantId,
    category: 'INTERNAL',
    includeVersions: true,
  });
  const byName = new Map(
    (Array.isArray(templates) ? templates : []).map((template) => [
      normalizeText(template.name).toLowerCase(),
      template,
    ])
  );
  const items = seeds.map((seed) => {
    const template = byName.get(seed.name.toLowerCase()) || null;
    return {
      seedKey: seed.seedKey,
      name: seed.name,
      targetRoles: seed.targetRoles || [],
      templateId: template?.id || null,
      state: template?.state || 'missing',
      seeded: Boolean(template),
    };
  });
  return {
    role: normalizedRole,
    items,
    summary: {
      total: items.length,
      seeded: items.filter((item) => item.seeded).length,
      missing: items.filter((item) => !item.seeded).length,
    },
  };
}

module.exports = {
  ADMIN_TEMPLATE_SEEDS,
  ADMIN_ROLE_CHECKLIST_SETS,
  isAdminSeedTemplate,
  ensureAdminTemplateDrafts,
  listAdminChecklistSeedsForRole,
  resolveAdminChecklistsForRole,
};
