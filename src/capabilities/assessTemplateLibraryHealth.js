'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function daysSince(isoValue) {
  const parsed = Date.parse(normalizeText(isoValue));
  if (!Number.isFinite(parsed)) return null;
  return Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000));
}

class AssessTemplateLibraryHealthCapability extends BaseCapability {
  static name = 'AssessTemplateLibraryHealth';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      staleDays: { type: 'integer', minimum: 7, maximum: 365 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input =
      safeContext.input && typeof safeContext.input === 'object' ? safeContext.input : {};
    const snapshot =
      safeContext.systemStateSnapshot && typeof safeContext.systemStateSnapshot === 'object'
        ? safeContext.systemStateSnapshot
        : {};

    const templates = asArray(snapshot.templates);
    const staleDays = Math.max(7, Math.min(365, Number(input.staleDays) || 30));
    const warnings = [];
    const flags = [];

    if (templates.length === 0) {
      warnings.push('Inga mallar i snapshot — kör CAO med tenant-scope.');
    }

    let staleCount = 0;
    let missingActiveVersion = 0;
    let draftOnlyCount = 0;

    for (const template of templates) {
      const templateId = normalizeText(template.id);
      const name = normalizeText(template.name) || templateId || 'okänd mall';
      const state = normalizeText(template.state || template.status).toLowerCase();
      const activeVersionId = normalizeText(
        template.currentActiveVersionId || template.activeVersionId
      );
      const ageDays = daysSince(template.updatedAt);

      if (!activeVersionId && state !== 'active') {
        missingActiveVersion += 1;
        flags.push({
          templateId,
          templateName: name,
          issue: 'missing_active_version',
          label: 'Saknar aktiv version',
          severity: 'medium',
        });
      }

      if (state === 'draft') {
        draftOnlyCount += 1;
      }

      if (ageDays !== null && ageDays >= staleDays) {
        staleCount += 1;
        flags.push({
          templateId,
          templateName: name,
          issue: 'stale_template',
          label: `Ej uppdaterad på ${ageDays} dagar`,
          severity: ageDays >= staleDays * 2 ? 'high' : 'medium',
        });
      }
    }

    const healthScore = Math.max(
      0,
      Math.round(
        100 -
          (staleCount / Math.max(1, templates.length)) * 35 -
          (missingActiveVersion / Math.max(1, templates.length)) * 40 -
          (draftOnlyCount / Math.max(1, templates.length)) * 15
      )
    );

    const summary = [
      `Mallbibliotek: ${templates.length} mallar.`,
      `${staleCount} inaktuella (>${staleDays}d), ${missingActiveVersion} utan aktiv version, ${draftOnlyCount} endast utkast.`,
      `Hälsopoäng: ${healthScore}/100.`,
    ].join(' ');

    return {
      data: {
        totalTemplates: templates.length,
        staleCount,
        missingActiveVersion,
        draftOnlyCount,
        healthScore,
        flags: flags.slice(0, 25),
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: AssessTemplateLibraryHealthCapability.name,
        version: AssessTemplateLibraryHealthCapability.version,
        staleDays,
      },
      warnings,
    };
  }
}

module.exports = {
  AssessTemplateLibraryHealthCapability,
};
