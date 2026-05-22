'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  toNumber,
  asObject,
  asArray,
  pickTopics,
  brandLabel,
  targetAudienceLabel,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');

const CHANNEL_ROTATION = Object.freeze(['linkedin', 'email', 'instagram', 'seo', 'facebook']);

function addDays(baseDate, days) {
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
}

function toDateKey(date) {
  return date.toISOString().split('T')[0];
}

class ProposeContentCalendarCapability extends BaseCapability {
  static name = 'ProposeContentCalendar';
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
      horizonWeeks: { type: 'integer', minimum: 1, maximum: 12 },
      includeMonthView: { type: 'boolean' },
      targetAudience: { type: 'string', maxLength: 100 },
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
    const horizonWeeks = Math.max(1, Math.min(12, toNumber(input.horizonWeeks, 4)));
    const includeMonthView = input.includeMonthView !== false;
    const audience = targetAudienceLabel(snapshot, input);
    const brand = brandLabel(snapshot);

    const existingCalendar = asArray(snapshot.contentCalendar);
    const topics = pickTopics(snapshot, Math.max(horizonWeeks, 5));
    const now = new Date();

    const weeklyPlan = [];
    for (let week = 1; week <= horizonWeeks; week += 1) {
      const topicItem = topics[(week - 1) % topics.length] || topics[0];
      const channel = CHANNEL_ROTATION[(week - 1) % CHANNEL_ROTATION.length];
      const publishDate = addDays(now, week * 7);
      weeklyPlan.push({
        week,
        topic: normalizeText(topicItem?.topic) || `Vecka ${week} fokus`,
        format: normalizeText(topicItem?.format) || 'artikel',
        channel,
        targetDate: toDateKey(publishDate),
        status: 'proposed',
        ownerAction: 'review_and_approve',
        rationale:
          normalizeText(topicItem?.rationale) ||
          `Förslag för ${audience} — ${brand} (${channel}).`,
      });
    }

    if (existingCalendar.length && existingCalendar.length !== weeklyPlan.length) {
      warnings.push(
        `Befintlig kalender (${existingCalendar.length} rader) ersattes av veckoplan (${weeklyPlan.length}).`
      );
    }

    const monthOverview = includeMonthView
      ? {
          month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
          slots: weeklyPlan.map((slot) => ({
            date: slot.targetDate,
            topic: slot.topic,
            channel: slot.channel,
            status: slot.status,
          })),
        }
      : null;

    const summary =
      `${weeklyPlan.length}-veckors content-kalender föreslagen för ${audience}. ` +
      `Kanaler: ${[...new Set(weeklyPlan.map((slot) => slot.channel))].join(', ')}. ` +
      CMO_DRAFT_DISCLAIMER;

    return {
      data: {
        weeklyPlan,
        monthOverview,
        horizonWeeks,
        targetAudience: audience,
        summary,
        generatedAt: new Date().toISOString(),
        mode: 'proposal_only',
        autoPublish: false,
      },
      metadata: capabilityMeta(ProposeContentCalendarCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  ProposeContentCalendarCapability,
};
