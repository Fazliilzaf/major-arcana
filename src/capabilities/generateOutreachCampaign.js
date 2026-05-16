'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const CAMPAIGN_TEMPLATES = Object.freeze([
  {
    id: 'reactivation',
    name: 'Reaktivering av inaktiva leads',
    trigger: 'leads_inactive_30d',
    channel: 'email',
    subject: 'Vi har inte glömt dig — här är vad som hänt sedan sist',
    bodyOutline: 'Personlig hälsning → nyheter/uppdateringar → erbjudande/CTA → signatur',
    targetSegment: 'consultation_ready',
    estimatedImpact: 'medium',
  },
  {
    id: 'aftercare_followup',
    name: 'Eftervårdsuppföljning',
    trigger: 'treatment_completed_7d',
    channel: 'email',
    subject: 'Hur mår du efter behandlingen? — Hair TP Clinic',
    bodyOutline: 'Personlig fråga → vanliga frågor vecka 1 → kontaktinfo → nästa steg',
    targetSegment: 'hair_transplant',
    estimatedImpact: 'high',
  },
  {
    id: 'seasonal_promo',
    name: 'Säsongskampanj',
    trigger: 'quarterly',
    channel: 'email',
    subject: 'Sommarerbjudande — boka din konsultation idag',
    bodyOutline: 'Säsongsvinkel → erbjudande → begränsad tid → CTA',
    targetSegment: 'price_sensitive',
    estimatedImpact: 'medium',
  },
  {
    id: 'referral_program',
    name: 'Rekommendationsprogram',
    trigger: 'treatment_completed_30d',
    channel: 'email',
    subject: 'Tipsa en vän — ni får båda rabatt',
    bodyOutline: 'Tack för förtroendet → rekommendationsrabatt → enkel delning → villkor',
    targetSegment: 'hair_transplant',
    estimatedImpact: 'high',
  },
  {
    id: 'educational_series',
    name: 'Utbildningsserie (drip)',
    trigger: 'new_lead',
    channel: 'email',
    subject: 'Del {{n}} av 5: Allt du behöver veta om hårtransplantation',
    bodyOutline: 'Edukativt innehåll → expertcitat → CTA till konsultation',
    targetSegment: 'hair_loss_info',
    estimatedImpact: 'medium',
  },
]);

class GenerateOutreachCampaignCapability extends BaseCapability {
  static name = 'GenerateOutreachCampaign';
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
      maxCampaigns: { type: 'integer', minimum: 1, maximum: 10 },
      targetSegment: { type: 'string', maxLength: 50 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', required: ['campaigns', 'summary', 'generatedAt'], additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input = asObject(safeContext.input);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const maxCampaigns = Math.max(1, Math.min(10, toNumber(input.maxCampaigns, 5)));
    const targetSegment = normalizeText(input.targetSegment).toLowerCase();
    const warnings = [];

    const templates = asArray(snapshot.templates);
    const segments = asArray(snapshot.audienceSegments);
    const mailInsights = asObject(snapshot.mailInsights);

    let candidates = [...CAMPAIGN_TEMPLATES];
    if (targetSegment) {
      const filtered = candidates.filter((c) => c.targetSegment === targetSegment);
      if (filtered.length > 0) candidates = filtered;
      else warnings.push(`Segment "${targetSegment}" matchade inga kampanjmallar — visar alla.`);
    }

    const existingCategories = new Set(
      templates.map((t) => normalizeText(t?.category).toUpperCase()).filter(Boolean)
    );

    const campaigns = candidates.slice(0, maxCampaigns).map((template) => {
      const hasMatchingTemplate = existingCategories.has('LEAD') || existingCategories.has('AFTERCARE');
      const matchingSegment = segments.find((s) => s.id === template.targetSegment);

      return {
        id: template.id,
        name: template.name,
        channel: template.channel,
        trigger: template.trigger,
        targetSegment: template.targetSegment,
        segmentSize: matchingSegment?.mentionCount || 0,
        subject: template.subject,
        bodyOutline: template.bodyOutline,
        estimatedImpact: template.estimatedImpact,
        readiness: hasMatchingTemplate ? 'ready' : 'needs_template',
        suggestedActions: [
          !hasMatchingTemplate ? `Skapa en ${template.targetSegment}-mall fore lansering.` : '',
          `Granska amnesrad och body-outline med CAO-agenten.`,
          `Satt upp trigger: ${template.trigger}.`,
        ].filter(Boolean),
      };
    });

    const readyCount = campaigns.filter((c) => c.readiness === 'ready').length;
    const summary = `${campaigns.length} kampanjforslag genererade. ` +
      `${readyCount} redo att lansera, ${campaigns.length - readyCount} behover mallar. ` +
      `Hogst impact: ${campaigns.find((c) => c.estimatedImpact === 'high')?.name || 'ingen'}.`;

    return {
      data: {
        campaigns,
        readyCount,
        totalCount: campaigns.length,
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: GenerateOutreachCampaignCapability.name,
        version: GenerateOutreachCampaignCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  GenerateOutreachCampaignCapability,
};
