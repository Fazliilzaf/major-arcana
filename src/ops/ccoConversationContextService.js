'use strict';

/**
 * ccoConversationContextService — bygger konversationskontext för en kund.
 *
 * Använder ccoConversationThreadStore för att hämta trådar och berikar med
 * SLA, risk och temperatur från intelligensmotorerna. AI-summary är valfritt
 * och styrs av includeAiSummary.
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toTimestampMs(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function sortByTsDesc(items) {
  return [...items].sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
}

function latestTs(items) {
  return sortByTsDesc(items)[0]?.ts || null;
}

function deriveHistorySignals(targetThreads, nowMs) {
  const cutoffMs = nowMs - 30 * 24 * 60 * 60 * 1000;
  const recentThreads = targetThreads.filter((t) => {
    const ms = toTimestampMs(t.ts);
    return Number.isFinite(ms) && ms >= cutoffMs;
  });
  const recentMessageCount = recentThreads.length;
  const mailboxCount = new Set(recentThreads.map((t) => t.mailboxId).filter(Boolean)).size;

  let pattern = 'none';
  const text = recentThreads
    .map((t) => [t.subject, t.preview, t.body].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();
  // Matcha stammar med ordgräns före, men tillåt svensk böjning efteråt
  // (t.ex. "klagomål", "reklamation", "bokning", "behandlingar").
  if (/\b(klag|reklam|missnöjd|arg|frustrerad|besviken)/i.test(text)) {
    pattern = 'complaint';
  } else if (/\b(bok|tid|behandling|konsultation)/i.test(text)) {
    pattern = 'booking';
  } else if (recentMessageCount > 2) {
    pattern = 'mixed';
  }

  return {
    pattern,
    summary: '',
    actionCue: '',
    mailboxCount,
    recentMessageCount,
    outcomeCode: '',
    outcomeSummary: '',
    outcomeActionCue: '',
    calibrationSummary: '',
    calibrationActionCue: '',
    preferredMode: '',
    positiveOutcomeCount: 0,
    negativeOutcomeCount: 0,
    dominantFailureOutcome: '',
    dominantFailureRisk: '',
  };
}

function createCcoConversationContextService({
  threadStore,
  slaMonitor,
  riskStackEngine,
  customerTemperatureEngine,
  aiSummaryResolver = null,
  tenantConfig = null,
} = {}) {
  if (!threadStore || typeof threadStore.buildThreadsForCustomer !== 'function') {
    throw new Error('threadStore with buildThreadsForCustomer required');
  }
  if (!slaMonitor || typeof slaMonitor.evaluateSlaMonitor !== 'function') {
    throw new Error('slaMonitor with evaluateSlaMonitor required');
  }
  if (!riskStackEngine || typeof riskStackEngine.evaluateRiskStack !== 'function') {
    throw new Error('riskStackEngine with evaluateRiskStack required');
  }
  if (
    !customerTemperatureEngine ||
    typeof customerTemperatureEngine.evaluateCustomerTemperature !== 'function'
  ) {
    throw new Error('customerTemperatureEngine with evaluateCustomerTemperature required');
  }

  async function buildContextForCustomer(
    customerId,
    {
      tenantId = '',
      conversationKey = '',
      nowMs = Date.now(),
      includeAiSummary = false,
      includeMailTruth = true,
    } = {}
  ) {
    const safeCustomerId = normalizeText(customerId);
    const safeTenantId = normalizeText(tenantId);
    if (!safeTenantId) throw new Error('tenantId required');
    const safeKey = normalizeText(conversationKey);
    const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();

    const built = await threadStore.buildThreadsForCustomer(safeCustomerId, {
      tenantId: safeTenantId,
      includeMailTruth,
    });
    const threads = asArray(built.threads);
    const counts = built.counts || {};

    const targetThreads = safeKey
      ? threads.filter((t) => t.threadId === safeKey || t.conversationId === safeKey)
      : threads.filter((t) => !t.systemMail && t.threadStatus !== 'system');

    const inbound = targetThreads.filter((t) => t.direction === 'inbound' && !t.systemMail);
    const outbound = targetThreads.filter((t) => t.direction === 'outbound');
    const latestInboundAt = latestTs(inbound);
    const latestOutboundAt = latestTs(outbound);

    const unansweredThreads = targetThreads.filter((t) => t.threadStatus === 'unanswered');
    const unanswered = {
      count: unansweredThreads.length,
      latestAt: latestTs(unansweredThreads),
    };

    const needsActionCount = (counts.unanswered || 0) + (counts.needs_approval || 0);
    const activeThreadCount = targetThreads.filter((t) => !t.handled && !t.systemMail).length;

    let aiSummary = null;
    if (safeKey && typeof aiSummaryResolver === 'function' && includeAiSummary) {
      try {
        aiSummary = await aiSummaryResolver(safeKey, safeTenantId);
      } catch {
        aiSummary = null;
      }
    }

    const aiIntent = normalizeText(aiSummary?.intent?.code) || 'unclear';
    const aiTone = normalizeText(aiSummary?.sentiment?.tone) || 'neutral';

    const lastInboundForSla = unanswered.latestAt || latestInboundAt;
    const slaStatus = slaMonitor.evaluateSlaMonitor({
      lastInboundAt: lastInboundForSla,
      lastOutboundAt: latestOutboundAt,
      priorityLevel: 'Low',
      intent: aiIntent,
      openingHours: tenantConfig?.openingHours,
      nowMs: safeNowMs,
    });

    const historySignals = deriveHistorySignals(targetThreads, safeNowMs);
    const isUnanswered = unanswered.count > 0;
    const interactionCount = activeThreadCount;

    const riskResult = riskStackEngine.evaluateRiskStack({
      isUnanswered,
      slaStatus: slaStatus.slaStatus,
      hoursSinceInbound: slaStatus.hoursSinceInbound,
      tone: aiTone,
      intent: aiIntent,
      interactionCount,
      historySignals,
    });

    const recencyDays = latestInboundAt
      ? Math.max(
          0,
          Math.floor((safeNowMs - toTimestampMs(latestInboundAt)) / (24 * 60 * 60 * 1000))
        )
      : 999;
    const lifecycleStatus = activeThreadCount > 0 ? 'active_dialogue' : 'dormant';
    const engagementScore = Math.min(1, activeThreadCount / 5);

    const temperatureResult = customerTemperatureEngine.evaluateCustomerTemperature({
      slaStatus: slaStatus.slaStatus,
      engagementScore,
      toneHistory: [aiTone],
      recencyDays,
      lifecycleStatus,
    });

    return {
      customerId: safeCustomerId,
      tenantId: safeTenantId,
      conversationKey: safeKey || null,
      generatedAt: new Date(safeNowMs).toISOString(),
      latestInboundAt,
      latestOutboundAt,
      unanswered,
      activeThreadCount,
      needsActionCount,
      slaStatus,
      dominantRisk: riskResult.dominantRisk,
      risk: {
        explanation: riskResult.explanation,
        recommendedAction: riskResult.recommendedAction,
        breakdown: riskResult.breakdown,
      },
      temperature: {
        temperature: temperatureResult.temperature,
        drivers: temperatureResult.drivers,
        score: temperatureResult.score,
      },
      sentiment: aiSummary?.sentiment || null,
      intent: aiSummary?.intent || null,
    };
  }

  return {
    buildContextForCustomer,
  };
}

module.exports = {
  createCcoConversationContextService,
  deriveHistorySignals,
};
