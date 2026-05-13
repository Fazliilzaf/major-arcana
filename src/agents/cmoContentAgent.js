'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const CMO_AGENT_NAME = 'CMO';

const cmoContentInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    maxTopics: { type: 'integer', minimum: 1, maximum: 10 },
    targetAudience: { type: 'string', maxLength: 100 },
  },
});

const cmoContentOutputSchema = Object.freeze({
  type: 'object',
  required: ['data', 'metadata', 'warnings'],
  additionalProperties: false,
  properties: {
    data: {
      type: 'object',
      required: ['contentBrief', 'executiveSummary', 'generatedAt'],
      additionalProperties: true,
    },
    metadata: {
      type: 'object',
      required: ['agent', 'version', 'channel'],
      additionalProperties: true,
    },
    warnings: { type: 'array', maxItems: 20 },
  },
});

function composeCmoContentAdvisor({
  contentBriefOutput = null,
  audienceOutput = null,
  campaignOutput = null,
  channel = 'admin',
  tenantId = '',
  correlationId = '',
} = {}) {
  const briefData = asObject(asObject(contentBriefOutput).data);
  const audienceData = asObject(asObject(audienceOutput).data);
  const campaignData = asObject(asObject(campaignOutput).data);
  const briefWarnings = asArray(asObject(contentBriefOutput).warnings);
  const audienceWarnings = asArray(asObject(audienceOutput).warnings);
  const campaignWarnings = asArray(asObject(campaignOutput).warnings);

  const topics = asArray(briefData.topics);
  const calendar = asArray(briefData.contentCalendar);
  const segments = asArray(audienceData.segments);
  const campaigns = asArray(campaignData.campaigns);

  const executiveSummary = [
    `CMO Content Advisor.`,
    normalizeText(briefData.summary) || 'Ingen content-data tillganglig.',
    segments.length > 0
      ? `${segments.length} malgruppssegment identifierade (hogst: ${segments[0]?.label || '-'}).`
      : '',
    campaigns.length > 0
      ? `${campaigns.length} kampanjforslag (${campaigns.filter((c) => c.readiness === 'ready').length} redo att lansera).`
      : '',
    calendar.length > 0
      ? `Content-kalender: ${calendar.length} planerade inlagg.`
      : '',
  ].filter(Boolean).join(' ');

  return {
    data: {
      contentBrief: briefData,
      topics,
      contentCalendar: calendar,
      audienceSegments: segments,
      campaigns,
      campaignReadyCount: campaigns.filter((c) => c.readiness === 'ready').length,
      executiveSummary,
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      agent: CMO_AGENT_NAME,
      version: '1.0.0',
      channel: normalizeText(channel) || 'admin',
      tenantId: normalizeText(tenantId) || 'unknown',
      correlationId: normalizeText(correlationId) || '',
      sources: ['GenerateContentBrief', 'AnalyzeAudienceSegments', 'GenerateOutreachCampaign'],
    },
    warnings: Array.from(
      new Set(
        [...briefWarnings, ...audienceWarnings, ...campaignWarnings]
          .map((w) => normalizeText(w))
          .filter(Boolean)
      )
    ).slice(0, 20),
  };
}

module.exports = {
  CMO_AGENT_NAME,
  cmoContentInputSchema,
  cmoContentOutputSchema,
  composeCmoContentAdvisor,
};
