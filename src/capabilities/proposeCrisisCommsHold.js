'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { evaluateCooIncidentCampaignPause } = require('../ops/cmoOrchestrationGate');
const { normalizeText, asObject, asArray, brandLabel, capabilityMeta } = require('./cmoCapabilityHelpers');

class ProposeCrisisCommsHoldCapability extends BaseCapability {
  static name = 'ProposeCrisisCommsHold';
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
      scenario: { type: 'string', maxLength: 120 },
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
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const warnings = [];
    const brand = brandLabel(snapshot);
    const scenario = normalizeText(input.scenario) || 'operational_incident';
    const incidentPause = evaluateCooIncidentCampaignPause(snapshot.incidentSummary);

    const holdingStatement = [
      `${brand} arbetar aktivt med att hantera en operativ händelse.`,
      'Vi pausar extern marknadskommunikation tills situationen är under kontroll.',
      'Ingen klinisk rådgivning ges i detta utkast.',
      'All publicering kräver OWNER-godkännande.',
    ].join(' ');

    const actions = [
      { id: 'pause_external_campaigns', label: 'Pausa externa kampanjer', required: incidentPause.required },
      { id: 'notify_owner', label: 'Notifiera OWNER för godkännande av holding statement', required: true },
      { id: 'review_claims', label: 'Kör claims/compliance review innan eventuell publicering', required: true },
    ];

    if (incidentPause.required) {
      warnings.push('Öppna P0/P1-incidenter — crisis hold rekommenderas.');
    }
    warnings.push('Crisis comms är utkast only — auto-send är blockerad i v1.');

    return {
      data: {
        outputType: 'CrisisCommsHold',
        scenario,
        status: incidentPause.required ? 'recommended' : 'standby',
        holdingStatement,
        channelsToPause: incidentPause.required ? ['social', 'ads', 'email', 'web'] : [],
        pauseAllExternalCampaigns: incidentPause.required,
        actions,
        incidentPause,
        summary: incidentPause.required
          ? 'Crisis comms-hold rekommenderas p.g.a. öppna P0/P1-incidenter.'
          : 'Crisis comms-hold utkast redo som standby.',
        generatedAt: new Date().toISOString(),
        requiresOwnerApproval: true,
        autoSend: false,
        autoPublish: false,
      },
      metadata: capabilityMeta(ProposeCrisisCommsHoldCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  ProposeCrisisCommsHoldCapability,
};
