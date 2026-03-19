(function initArcanaCcoNextCustomerIntelligence(global) {
  'use strict';

  function asText(value, fallback = '') {
    const safeValue = String(value == null ? '' : value).trim();
    return safeValue || fallback;
  }

  function asNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function cloneTextArray(value) {
    return Array.isArray(value)
      ? value
          .map((entry) => asText(entry))
          .filter(Boolean)
          .slice(0, 12)
      : [];
  }

  function cloneConsentStatus(value) {
    const safeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalizeBoolean = (entry) => (entry === true ? true : entry === false ? false : null);
    return {
      gdpr: normalizeBoolean(safeValue.gdpr),
      photos: normalizeBoolean(safeValue.photos),
      marketing: normalizeBoolean(safeValue.marketing),
    };
  }

  function cloneJourneyEvents(value) {
    return Array.isArray(value)
      ? value
          .map((entry, index) => {
            const safeEntry = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
            const label = asText(safeEntry.label || safeEntry.title || safeEntry.type || `Händelse ${index + 1}`);
            return {
              id: asText(safeEntry.id, `journey-${index + 1}`),
              type: asText(safeEntry.type),
              label,
              date: asText(safeEntry.date),
              note: asText(safeEntry.note || safeEntry.description),
              tone: asText(safeEntry.tone, 'neutral'),
            };
          })
          .filter((entry) => entry.label)
          .slice(0, 8)
      : [];
  }

  function formatCurrencySek(value) {
    const numeric = asNumber(value, 0);
    if (numeric <= 0) return '';
    return `${new Intl.NumberFormat('sv-SE').format(Math.round(numeric))} kr`;
  }

  function formatJourneyStageLabel(value = '') {
    const normalized = asText(value).toLowerCase();
    const map = {
      lead: 'Lead',
      consultation: 'Konsultation',
      booked: 'Bokad',
      treatment: 'Behandling',
      follow_up: 'Uppföljning',
      return_visit: 'Återbesök',
      returning: 'Återkommande',
      vip: 'VIP-relation',
      admin: 'Adminspår',
    };
    return map[normalized] || asText(value, 'Kundresa');
  }

  function formatVipLabel(value = '') {
    const normalized = asText(value).toLowerCase();
    const map = {
      vip: 'VIP',
      high_value: 'Högt värde',
      loyal: 'Lojal kund',
      standard: 'Standardkund',
      new: 'Ny relation',
    };
    return map[normalized] || asText(value, 'Standardkund');
  }

  function formatRelationshipSensitivity(value = '') {
    const normalized = asText(value).toLowerCase();
    if (normalized === 'high') return 'Hög relationskänslighet';
    if (normalized === 'medium') return 'Normal relationskänslighet';
    if (normalized === 'low') return 'Låg relationskänslighet';
    return asText(value, 'Relationssignal okänd');
  }

  function formatDuplicateLabel(value = '') {
    const normalized = asText(value).toLowerCase();
    if (normalized === 'confirmed') return 'Dublett att slå ihop';
    if (normalized === 'possible') return 'Möjlig dubbelprofil';
    return 'Ingen dubblettsignal';
  }

  function formatConsentValue(value) {
    if (value === true) return 'ok';
    if (value === false) return 'saknas';
    return 'inte markerat';
  }

  function buildConsentSummary(consentStatus) {
    const consent = cloneConsentStatus(consentStatus);
    return `GDPR ${formatConsentValue(consent.gdpr)} · Foto ${formatConsentValue(consent.photos)} · Marknad ${formatConsentValue(
      consent.marketing
    )}`;
  }

  function buildFallbackJourneyEvents(conversation = {}) {
    const customerSince = asText(conversation?.previewSummary?.customerSince || conversation?.customerSince);
    const lifecycleStage = asText(conversation?.lifecycleStage || conversation?.returnVisitState || 'Aktiv');
    const plannedTreatment = asText(conversation?.plannedTreatment || conversation?.caseType);
    const events = [];
    if (customerSince) {
      events.push({
        id: 'journey-contact',
        type: 'contact',
        label: 'Första kontakt',
        date: customerSince,
        note: asText(conversation?.customerContext || 'Relation etablerad.'),
        tone: 'neutral',
      });
    }
    if (plannedTreatment) {
      events.push({
        id: 'journey-treatment',
        type: 'treatment',
        label: plannedTreatment,
        date: asText(conversation?.previewSummary?.customerSince || customerSince, 'Nuvarande spår'),
        note: asText(conversation?.treatmentContext || conversation?.medicalContext),
        tone: 'success',
      });
    }
    events.push({
      id: 'journey-now',
      type: 'follow_up',
      label: lifecycleStage,
      date: asText(conversation?.followUpDeadline || conversation?.lifecycleStage || 'Nu'),
      note: asText(conversation?.nextActionSummary || conversation?.queueReason),
      tone: 'warn',
    });
    return events.slice(0, 4);
  }

  function buildJourneyItems(conversation = {}) {
    const explicit = cloneJourneyEvents(conversation?.journeyEvents);
    const items = explicit.length ? explicit : buildFallbackJourneyEvents(conversation);
    return items.slice(0, 4);
  }

  function buildRelationshipCard(conversation = {}) {
    const vipStatus = asText(conversation?.vipStatus || 'standard');
    const lifetimeValue = formatCurrencySek(conversation?.lifetimeValue);
    const relationshipSensitivity = formatRelationshipSensitivity(conversation?.relationshipSensitivity);
    const duplicateState = asText(conversation?.duplicateState || 'clear');
    const duplicateLabel = formatDuplicateLabel(duplicateState);
    const badges = [];
    if (vipStatus && vipStatus !== 'standard') {
      badges.push({ label: formatVipLabel(vipStatus), tone: vipStatus === 'vip' ? 'success' : 'neutral' });
    }
    if (duplicateState === 'possible') badges.push({ label: duplicateLabel, tone: 'warn' });
    if (duplicateState === 'confirmed') badges.push({ label: duplicateLabel, tone: 'danger' });
    if (conversation?.returnVisitState) badges.push({ label: asText(conversation.returnVisitState), tone: 'neutral' });

    const detailParts = [formatVipLabel(vipStatus)];
    if (lifetimeValue) detailParts.push(lifetimeValue);
    const detail = detailParts.join(' · ');
    let note = relationshipSensitivity;
    if (vipStatus === 'vip') {
      note = `${relationshipSensitivity}. Håll tonen varsam och samma ägare genom nästa steg.`;
    } else if (duplicateState === 'possible' || duplicateState === 'confirmed') {
      note = `${relationshipSensitivity}. ${duplicateLabel} bör granskas innan flera parallella svar går ut.`;
    }

    return {
      title: 'Relationssignal',
      detail,
      note,
      badges,
    };
  }

  function buildIdentityCard(conversation = {}) {
    const duplicateLabel = formatDuplicateLabel(conversation?.duplicateState);
    const consentSummary = buildConsentSummary(conversation?.consentStatus);
    const insuranceContext = asText(conversation?.insuranceContext, 'Inget försäkringsspår markerat.');
    const lines = [
      { label: 'Samtycke', value: consentSummary },
      { label: 'Försäkring', value: insuranceContext },
    ];
    const duplicateNote = asText(conversation?.duplicateNote);

    return {
      title: 'Identitet & underlag',
      detail: duplicateLabel,
      note:
        duplicateNote ||
        (String(conversation?.duplicateState || '').trim().toLowerCase() === 'clear'
          ? 'Ingen identitetskonflikt synlig i detta läge.'
          : 'Kontrollera innan flera aktiva trådar eller svar hålls öppna samtidigt.'),
      lines,
      badges: [
        {
          label:
            String(conversation?.duplicateState || '').trim().toLowerCase() === 'confirmed'
              ? 'Dublett'
              : String(conversation?.duplicateState || '').trim().toLowerCase() === 'possible'
              ? 'Matcha profil'
              : 'Identitet ok',
          tone:
            String(conversation?.duplicateState || '').trim().toLowerCase() === 'confirmed'
              ? 'danger'
              : String(conversation?.duplicateState || '').trim().toLowerCase() === 'possible'
              ? 'warn'
              : 'success',
        },
      ],
    };
  }

  function buildTreatmentCard(conversation = {}) {
    const plannedTreatment = asText(conversation?.plannedTreatment || conversation?.treatmentContext || conversation?.medicalContext);
    const returnVisitState = asText(conversation?.returnVisitState || conversation?.lifecycleStage);
    const recentTreatments = cloneTextArray(conversation?.recentTreatments).slice(0, 2);
    const lines = [];
    if (recentTreatments[0]) lines.push({ label: 'Senaste', value: recentTreatments[0] });
    if (recentTreatments[1]) lines.push({ label: 'Före det', value: recentTreatments[1] });
    if (plannedTreatment) lines.push({ label: 'Planerat', value: plannedTreatment });
    if (returnVisitState) lines.push({ label: 'Återbesök', value: returnVisitState });

    return {
      title: 'Behandlingskontext',
      detail: plannedTreatment || 'Ingen aktiv behandling markerad',
      note:
        asText(conversation?.treatmentContext || conversation?.medicalContext) ||
        'Visar behandlingsspåret så att ton, bokning och nästa steg blir rätt.',
      lines,
      badges: cloneTextArray(conversation?.medicalFlags).slice(0, 2).map((label) => ({ label, tone: 'danger' })),
    };
  }

  function buildJourneyCard(conversation = {}) {
    const journeyStage = asText(conversation?.journeyStage);
    const items = buildJourneyItems(conversation);
    return {
      title: 'Kundresa',
      detail: formatJourneyStageLabel(journeyStage || items[items.length - 1]?.label || 'Kundresa'),
      note: 'Visar var i relationen kunden befinner sig nu utan att konkurrera med nästa operativa steg.',
      timeline: items,
    };
  }

  function buildModel(conversation = {}) {
    const safeConversation = conversation && typeof conversation === 'object' ? conversation : {};
    return {
      relationshipCard: buildRelationshipCard(safeConversation),
      identityCard: buildIdentityCard(safeConversation),
      treatmentCard: buildTreatmentCard(safeConversation),
      journeyCard: buildJourneyCard(safeConversation),
    };
  }

  global.ArcanaCcoNextCustomerIntelligence = {
    cloneConsentStatus,
    cloneJourneyEvents,
    formatCurrencySek,
    formatJourneyStageLabel,
    buildModel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
