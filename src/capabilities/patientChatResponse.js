'use strict';

const { ROLE_OWNER } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const HUMAN_HANDOFF_TRIGGERS = Object.freeze([
  { id: 'explicit_request', pattern: /prata med (en |)(manniska|person|lakare|nagot riktigt|nagon annan)/i, label: 'Patient begarde mansklig kontakt' },
  { id: 'medical_emergency', pattern: /akut|nodsituation|ambulans|bloder mycket|svimmar|medvetslos/i, label: 'Mojlig medicinsk akutsituation' },
  { id: 'complaint', pattern: /klagomal|reklamation|missnojd|anmala|advokat|juridisk/i, label: 'Klagomal detekterat' },
  { id: 'mental_health', pattern: /sjalvmord|suicid|vill inte leva|skadar mig sjalv|angest.*akut/i, label: 'Psykisk ohalsa — omedelbar eskalering' },
]);

const PII_PATTERNS = [
  { id: 'personnummer', pattern: /\b\d{6}[-]?\d{4}\b/g, replacement: '[PERSONNUMMER]' },
  { id: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  { id: 'phone', pattern: /(?:\+46|0)[\s-]?\d{1,3}[\s-]?\d{2,4}[\s-]?\d{2,4}/g, replacement: '[TELEFON]' },
];

function redactPii(text) {
  let redacted = normalizeText(text);
  for (const pattern of PII_PATTERNS) {
    redacted = redacted.replace(pattern.pattern, pattern.replacement);
  }
  return redacted;
}

function detectHandoffTriggers(text) {
  const normalized = normalizeText(text).toLowerCase();
  return HUMAN_HANDOFF_TRIGGERS.filter((trigger) => trigger.pattern.test(normalized));
}

class PatientChatResponseCapability extends BaseCapability {
  static name = 'PatientChatResponse';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER];
  static allowedChannels = ['patient', 'admin'];

  static requiresInputRisk = true;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      conversationId: { type: 'string', maxLength: 120 },
      message: { type: 'string', maxLength: 2000 },
      turnNumber: { type: 'integer', minimum: 1 },
      language: { type: 'string', enum: ['sv', 'en'] },
    },
    required: ['message'],
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: ['response', 'handoff', 'safetyFlags', 'generatedAt'],
        additionalProperties: true,
      },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input = asObject(safeContext.input);
    const config = asObject(safeContext.tenantConfig);
    const warnings = [];

    const killSwitch = config.patientChatKillSwitch === true ||
      normalizeText(process.env.ARCANA_PUBLIC_CHAT_KILL_SWITCH) === 'true';
    const maxTurns = toNumber(config.patientChatMaxTurns || process.env.ARCANA_PUBLIC_CHAT_MAX_TURNS, 12);
    const turnNumber = toNumber(input.turnNumber, 1);
    const message = normalizeText(input.message);
    const redactedMessage = redactPii(message);

    if (killSwitch) {
      return {
        data: {
          response: normalizeText(config.patientChatKillSwitchMessage) ||
            'Patientchatten ar tillfalligt pausad. Kontakta kliniken via telefon eller e-post.',
          handoff: { required: false, reason: 'kill_switch' },
          safetyFlags: { killSwitch: true },
          blocked: true,
          generatedAt: new Date().toISOString(),
        },
        metadata: this._buildMetadata(safeContext),
        warnings: ['Kill switch aktiverad — patientchatten ar pausad.'],
      };
    }

    const handoffTriggers = detectHandoffTriggers(message);
    if (handoffTriggers.length > 0) {
      const primaryTrigger = handoffTriggers[0];
      return {
        data: {
          response: primaryTrigger.id === 'mental_health'
            ? 'Jag forstar att du har det svargt. Ring 112 vid akut fara, eller kontakta Mind pa 90101. Jag kopplar dig till en riktig person nu.'
            : 'Jag kopplar dig till en av vara medarbetare som kan hjalpa dig vidare. Du hors av oss inom kort.',
          handoff: {
            required: true,
            reason: primaryTrigger.id,
            label: primaryTrigger.label,
            triggers: handoffTriggers.map((t) => ({ id: t.id, label: t.label })),
          },
          safetyFlags: {
            handoffTriggered: true,
            triggerIds: handoffTriggers.map((t) => t.id),
          },
          generatedAt: new Date().toISOString(),
        },
        metadata: this._buildMetadata(safeContext),
        warnings: [`Human handoff triggered: ${primaryTrigger.label}`],
      };
    }

    if (turnNumber >= maxTurns) {
      return {
        data: {
          response: 'For att ge dig basta mojliga hjalp vill jag koppla dig till en av vara medarbetare. Du kan ocksa boka en kostnadsfri konsultation direkt.',
          handoff: { required: true, reason: 'max_turns_reached', turnNumber, maxTurns },
          safetyFlags: { maxTurnsReached: true },
          generatedAt: new Date().toISOString(),
        },
        metadata: this._buildMetadata(safeContext),
        warnings: [`Max turns (${maxTurns}) natt — handoff kraves.`],
      };
    }

    return {
      data: {
        response: '',
        responseSource: 'pending_ai_generation',
        inputRedacted: redactedMessage,
        handoff: { required: false },
        safetyFlags: {
          killSwitch: false,
          handoffTriggered: false,
          maxTurnsReached: false,
          piiRedacted: redactedMessage !== message,
        },
        turnNumber,
        generatedAt: new Date().toISOString(),
      },
      metadata: this._buildMetadata(safeContext),
      warnings,
    };
  }

  _buildMetadata(context) {
    return {
      capability: PatientChatResponseCapability.name,
      version: PatientChatResponseCapability.version,
      channel: 'patient',
      tenantId: normalizeText(context?.tenantId) || 'unknown',
    };
  }
}

module.exports = {
  PatientChatResponseCapability,
  detectHandoffTriggers,
  redactPii,
  HUMAN_HANDOFF_TRIGGERS,
};
