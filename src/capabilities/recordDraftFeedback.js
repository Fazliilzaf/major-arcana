'use strict';

/**
 * RecordDraftFeedback — capability som tar emot AI-utkast vs slutgiltigt
 * skickad text och returnerar en strukturerad feedback-rapport.
 *
 * Används av Smart Drafting Feedback-loop (Fas 4).
 *
 * I framtida iterationer ska feedback aggregeras per writing-identity för att
 * förbättra prompt-tuning åt nästa AI-utkast. För nu returnerar capability
 * en analys per anrop, och loggar via standard auditStrategy.
 */

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { buildDiffReport } = require('../risk/draftDiffer');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function capText(value, maxLength) {
  const s = normalizeText(value).replace(/\s+/g, ' ');
  if (!s) return '';
  if (s.length <= maxLength) return s;
  return `${s.slice(0, maxLength - 1)}…`;
}

class RecordDraftFeedbackCapability extends BaseCapability {
  static name = 'RecordDraftFeedback';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['originalDraft', 'editedDraft'],
    properties: {
      conversationId: { type: 'string', maxLength: 1024 },
      writingIdentityId: { type: 'string', maxLength: 200 },
      threadSubject: { type: 'string', maxLength: 220 },
      customerEmail: { type: 'string', maxLength: 200 },
      originalDraft: { type: 'string', minLength: 0, maxLength: 12000 },
      editedDraft: { type: 'string', minLength: 0, maxLength: 12000 },
      sentAt: { type: 'string', maxLength: 64 },
      tone: { type: 'string', maxLength: 60 },
      track: { type: 'string', maxLength: 60 },
    },
  };

  static outputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['data', 'metadata', 'warnings'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: [
          'conversationId',
          'classifications',
          'learnings',
          'identicalDraft',
          'wordDelta',
          'formalityShift',
          'recordedAt',
        ],
        properties: {
          conversationId: { type: 'string', maxLength: 1024 },
          writingIdentityId: { type: 'string', maxLength: 200 },
          classifications: {
            type: 'array',
            maxItems: 12,
            items: { type: 'string', minLength: 1, maxLength: 60 },
          },
          learnings: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 280 },
          },
          identicalDraft: { type: 'boolean' },
          wordDelta: { type: 'integer', minimum: -10000, maximum: 10000 },
          lengthChangeRatio: { type: 'number', minimum: 0, maximum: 100 },
          formalityShift: { type: 'string', enum: ['more_formal', 'more_casual', 'unchanged'] },
          factChanges: {
            type: 'object',
            additionalProperties: false,
            properties: {
              addedTimes: { type: 'array', items: { type: 'string', maxLength: 40 } },
              removedTimes: { type: 'array', items: { type: 'string', maxLength: 40 } },
              addedDates: { type: 'array', items: { type: 'string', maxLength: 40 } },
              removedDates: { type: 'array', items: { type: 'string', maxLength: 40 } },
              addedPrices: { type: 'array', items: { type: 'string', maxLength: 40 } },
              removedPrices: { type: 'array', items: { type: 'string', maxLength: 40 } },
            },
          },
          recordedAt: { type: 'string', minLength: 1, maxLength: 64 },
        },
      },
      metadata: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'version', 'channel', 'tenantId'],
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          version: { type: 'string', minLength: 1, maxLength: 40 },
          channel: { type: 'string', minLength: 1, maxLength: 40 },
          tenantId: { type: 'string', minLength: 1, maxLength: 120 },
          requestId: { type: 'string', maxLength: 120 },
          correlationId: { type: 'string', maxLength: 120 },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', minLength: 1, maxLength: 200 },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);

    const originalDraft = normalizeText(input.originalDraft);
    const editedDraft = normalizeText(input.editedDraft);
    const conversationId = capText(input.conversationId, 1024);
    const writingIdentityId = capText(input.writingIdentityId, 200);

    const report = buildDiffReport({ originalDraft, editedDraft });

    const warnings = [];
    if (!originalDraft && !editedDraft) {
      warnings.push('Båda utkasten var tomma — ingen meningsfull feedback.');
    } else if (!originalDraft) {
      warnings.push('Originalutkastet saknades — bara editedDraft analyseras.');
    }

    return {
      data: {
        conversationId,
        writingIdentityId,
        classifications: report.classifications,
        learnings: report.learnings,
        identicalDraft: report.identicalDraft,
        wordDelta: report.wordCounts.delta,
        lengthChangeRatio: report.diffStats.lengthChangeRatio,
        formalityShift: report.formalityShift,
        factChanges: {
          addedTimes: report.factChanges.addedTimes,
          removedTimes: report.factChanges.removedTimes,
          addedDates: report.factChanges.addedDates,
          removedDates: report.factChanges.removedDates,
          addedPrices: report.factChanges.addedPrices,
          removedPrices: report.factChanges.removedPrices,
        },
        recordedAt: new Date().toISOString(),
      },
      metadata: {
        capability: RecordDraftFeedbackCapability.name,
        version: RecordDraftFeedbackCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'okand',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings,
    };
  }
}

module.exports = {
  RecordDraftFeedbackCapability,
  recordDraftFeedbackCapability: RecordDraftFeedbackCapability,
};
