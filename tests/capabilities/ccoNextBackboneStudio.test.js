const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBackboneModule() {
  const filePath = path.join(__dirname, '../../public/cco-next-backbone.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = {
    console,
    Date,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: filePath });
  return context.ArcanaCcoNextBackbone;
}

function loadFollowUpEngineModule() {
  const filePath = path.join(__dirname, '../../public/cco-next-follow-up-engine.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = {
    console,
    Date,
    Intl,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: filePath });
  return context.ArcanaCcoNextFollowUpEngine;
}

function loadCustomerIntelligenceModule() {
  const filePath = path.join(__dirname, '../../public/cco-next-customer-intelligence.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = {
    console,
    Date,
    Intl,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: filePath });
  return context.ArcanaCcoNextCustomerIntelligence;
}

function loadCollaborationModule() {
  const filePath = path.join(__dirname, '../../public/cco-next-collaboration.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = {
    console,
    Date,
    Intl,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: filePath });
  return context.ArcanaCcoNextCollaboration;
}

function createTimestampOffset(hours = 0, minutes = 0) {
  const baseMs = Date.parse('2026-04-22T12:00:00.000Z');
  return new Date(baseMs + Number(hours || 0) * 3600000 + Number(minutes || 0) * 60000).toISOString();
}

function createPreviewSeed() {
  return {
    mailboxLabel: 'Hair TP Clinic · contact',
    rows: [
      {
        conversationId: 'thread-anna',
        sender: 'Anna Karlsson',
        subject: 'Akut ombokning idag',
        caseType: 'Ombokning',
        latestInboundPreview: 'Jag behöver flytta tiden och vill få besked idag.',
        lastInboundAt: '2026-04-22T11:42:00.000Z',
        priorityLevel: 'Critical',
        slaStatus: 'breach',
        intent: 'booking',
        bookingState: 'ready_now',
        waitingOn: 'none',
        followUpDueAt: '2026-04-22T15:15:00.000Z',
        lifecycleStage: 'Återbesök väntar',
        escalationRisk: 'medium',
        owner: 'Sara',
        handoffStatus: 'assigned',
        nextActionLabel: 'Erbjud två tider',
        nextActionSummary: 'Skicka konkreta tider direkt.',
        journeyStage: 'return_visit',
        vipStatus: 'vip',
        lifetimeValue: 126000,
        relationshipSensitivity: 'high',
        duplicateState: 'clear',
        consentStatus: {
          gdpr: true,
          photos: true,
          marketing: false,
        },
        insuranceContext: 'Ingen försäkring. Egenbetalare med tidigare fullföljda behandlingar.',
        treatmentContext: 'Återkommande PRP-patient som vill hålla samma behandlingsrytm.',
        plannedTreatment: 'PRP återbesök',
        recentTreatments: ['PRP · jan 2026', 'PRP · okt 2025'],
        returnVisitState: 'Återkommande patient',
        journeyEvents: [
          {
            id: 'anna-contact',
            type: 'contact',
            label: 'Första kontakt',
            date: '2024',
            note: 'Kom in via rekommendation.',
          },
          {
            id: 'anna-treatment',
            type: 'treatment',
            label: 'Senaste PRP',
            date: '2026-01-18',
            note: 'Stabil uppföljning.',
            tone: 'success',
          },
        ],
        activeViewers: [
          {
            id: 'collab-egzona',
            name: 'Egzona',
            action: 'viewing',
            location: 'Kalender',
            durationSeconds: 240,
          },
        ],
        activeEditor: '',
        draftOwner: 'Sara',
        draftUpdatedAt: '2026-04-22T11:54:00.000Z',
        collisionState: 'none',
        handoffRequest: '',
        handoffTarget: '',
        handoffNote: '',
        handoffStatusDetail: 'Sara håller tråden tills kunden väljer tid.',
        previewDraftBody: '',
        previewMessages: [
          {
            author: 'Anna Karlsson',
            role: 'customer',
            timestamp: '2026-04-22T11:42:00.000Z',
            body: 'Jag behöver flytta tiden och vill få besked idag.',
          },
        ],
        previewHistory: [],
        previewSummary: {
          assignedTo: 'Sara',
          lifecycleStatus: 'active_dialogue',
          interactionCount: 2,
          engagementScore: 0.82,
          lastCaseSummary: 'Akut ombokning med tydlig möjlighet att boka om direkt.',
        },
      },
    ],
  };
}

function createInboxPreviewSeed() {
  return {
    mailboxLabel: 'Hair TP Clinic · contact',
    rows: [
      {
        conversationId: 'thread-anna',
        sender: 'Anna Karlsson',
        subject: 'Akut ombokning idag',
        caseType: 'Ombokning',
        latestInboundPreview: 'Jag behöver flytta tiden idag.',
        lastInboundAt: '2026-04-22T11:42:00.000Z',
        priorityLevel: 'Critical',
        slaStatus: 'breach',
        intent: 'booking',
        bookingState: 'not_relevant',
        waitingOn: 'none',
        followUpDueAt: '2026-04-22T15:15:00.000Z',
        lifecycleStage: 'Återbesök väntar',
        escalationRisk: 'high',
        owner: 'Sara',
        handoffStatus: 'assigned',
        activeViewers: [
          {
            id: 'collab-egzona',
            name: 'Egzona',
            action: 'viewing',
            location: 'Kalender',
            durationSeconds: 240,
          },
        ],
        activeEditor: '',
        draftOwner: 'Sara',
        draftUpdatedAt: '2026-04-22T11:54:00.000Z',
        collisionState: 'none',
        handoffRequest: '',
        handoffTarget: '',
        handoffNote: '',
        handoffStatusDetail: 'Sara håller tråden tills kunden väljer tid.',
        nextActionLabel: 'Erbjud två tider',
        nextActionSummary: 'Skicka konkreta tider direkt.',
        previewDraftBody: '',
        previewMessages: [],
        previewHistory: [],
        previewSummary: {
          assignedTo: 'Sara',
          lifecycleStatus: 'active_dialogue',
          interactionCount: 2,
          engagementScore: 0.82,
          lastCaseSummary: 'Akut ombokning med tydligt nästa steg.',
        },
      },
      {
        conversationId: 'thread-erik',
        sender: 'Erik Holm',
        subject: 'Prisjämförelse',
        caseType: 'Prisjämförelse',
        latestInboundPreview: 'Jag jämför er med en annan klinik.',
        lastInboundAt: '2026-04-22T12:05:00.000Z',
        priorityLevel: 'High',
        slaStatus: 'warning',
        intent: 'price',
        bookingState: 'not_relevant',
        waitingOn: 'owner',
        followUpDueAt: '2026-04-22T16:00:00.000Z',
        lifecycleStage: 'Aktiv dialog',
        escalationRisk: 'high',
        owner: '',
        handoffStatus: 'unassigned',
        nextActionLabel: 'Ta ägarskap idag',
        nextActionSummary: 'Ge ett tryggt nästa steg innan kunden lämnar tråden.',
        previewDraftBody: '',
        previewMessages: [],
        previewHistory: [],
        previewSummary: {
          assignedTo: '',
          lifecycleStatus: 'active_dialogue',
          interactionCount: 1,
          engagementScore: 0.43,
          lastCaseSummary: 'Oägd prisdialog med risk att kunden tappar fart.',
        },
      },
      {
        conversationId: 'thread-johan',
        sender: 'Johan Lagerström',
        subject: 'Bekräfta bokningsförslag',
        caseType: 'Bokning',
        latestInboundPreview: 'Jag återkommer om tiderna.',
        lastInboundAt: '2026-04-22T10:12:00.000Z',
        priorityLevel: 'Medium',
        slaStatus: 'safe',
        intent: 'booking',
        bookingState: 'awaiting_confirmation',
        waitingOn: 'customer',
        followUpDueAt: '2026-04-23T10:00:00.000Z',
        lifecycleStage: 'Väntar svar',
        escalationRisk: 'medium',
        owner: 'Egzona',
        handoffStatus: 'awaiting_reply',
        nextActionLabel: 'Följ upp imorgon',
        nextActionSummary: 'Invänta svar först och nudga om inget svar kommer.',
        previewDraftBody: '',
        previewMessages: [],
        previewHistory: [],
        previewSummary: {
          assignedTo: 'Egzona',
          lifecycleStatus: 'awaiting_reply',
          interactionCount: 4,
          engagementScore: 0.67,
          lastCaseSummary: 'Kunden väntar på att bekräfta ett tidigare bokningsförslag.',
        },
      },
      {
        conversationId: 'thread-mia',
        sender: 'Mia Svensson',
        subject: 'Redo att boka PRP',
        caseType: 'Bokning',
        latestInboundPreview: 'Jag kan nästa vecka.',
        lastInboundAt: '2026-04-22T09:40:00.000Z',
        priorityLevel: 'Medium',
        slaStatus: 'safe',
        intent: 'booking',
        bookingState: 'ready_now',
        waitingOn: 'none',
        followUpDueAt: '2026-04-22T17:00:00.000Z',
        lifecycleStage: 'Klar för bokning',
        escalationRisk: 'low',
        owner: 'Sara',
        handoffStatus: 'assigned',
        nextActionLabel: 'Boka direkt',
        nextActionSummary: 'Erbjud konkret tid innan dagen är slut.',
        previewDraftBody: '',
        previewMessages: [],
        previewHistory: [],
        previewSummary: {
          assignedTo: 'Sara',
          lifecycleStatus: 'active_dialogue',
          interactionCount: 5,
          engagementScore: 0.78,
          lastCaseSummary: 'Kunden är bokningsklar och behöver bara ett tydligt förslag.',
        },
      },
    ],
  };
}

function createDependencies() {
  const followUpEngine = loadFollowUpEngineModule();
  const laneLabels = {
    action_now: 'Agera nu',
    booking_ready: 'Bokningsklar',
    follow_up_today: 'Följ upp idag',
    waiting_reply: 'Väntar på patient',
    medical_review: 'Medicinsk granskning',
    admin_low: 'Admin / låg prioritet',
    all: 'Alla trådar',
  };

  function formatDueLabel(value = '') {
    const timestamp = Date.parse(String(value || ''));
    const baseMs = Date.parse('2026-04-22T12:00:00.000Z');
    if (!Number.isFinite(timestamp)) return '-';
    const time = new Date(timestamp).toISOString().slice(11, 16);
    const baseDate = new Date(baseMs).toISOString().slice(0, 10);
    const nextDate = new Date(baseMs + 86400000).toISOString().slice(0, 10);
    const currentDate = new Date(timestamp).toISOString().slice(0, 10);
    if (currentDate === baseDate) return `Idag ${time}`;
    if (currentDate === nextDate) return `Imorgon ${time}`;
    return `${currentDate} ${time}`;
  }

  function buildRowModel(row = {}) {
    const waitingOn = String(row.waitingOn || 'none').trim().toLowerCase();
    const bookingState = String(row.bookingState || '').trim().toLowerCase();
    const queueOverride = String(row.queueOverride || '').trim().toLowerCase();
    const recurringCadence = String(row.recurringCadence || '').trim().toLowerCase();
    const sequenceLabel = String(row.followUpSequenceLabel || '').trim();
    const sequenceStep = Number(row.followUpSequenceStep || 0) || 0;
    const waitUntilReply = row.waitUntilReply === true;
    const slaGuardMessage = String(row.slaGuardMessage || '').trim();
    let workflowLane = 'action_now';
    if (queueOverride && laneLabels[queueOverride]) workflowLane = queueOverride;
    else if (row.needsMedicalReview === true || waitingOn === 'clinic') workflowLane = 'medical_review';
    else if (waitingOn === 'customer') workflowLane = 'waiting_reply';
    else if (bookingState === 'ready_now' || bookingState === 'slots_ready') workflowLane = 'booking_ready';
    else if (String(row.intent || '').trim().toLowerCase() === 'admin') workflowLane = 'admin_low';
    const followUpDeadline = row.followUpDueAt ? formatDueLabel(row.followUpDueAt) : '-';
    const waitingStateLabel =
      waitingOn === 'customer'
        ? sequenceLabel
          ? `${sequenceLabel} · steg ${sequenceStep || 1}`
          : waitUntilReply
          ? `Väntar på kund till ${followUpDeadline}`
          : 'Väntar på kund till Imorgon 10:00'
        : waitingOn === 'owner'
        ? recurringCadence
          ? `Återkommer ${followUpEngine.formatCadenceLabel(recurringCadence)}`
          : String(row.followUpMode || '').trim().toLowerCase() === 'scheduled_send'
          ? `Skicka ${followUpDeadline}`
          : 'Återuppta Imorgon 09:00'
        : waitingOn === 'clinic'
        ? 'Väntar på klinik'
        : waitingOn === 'colleague'
        ? 'Väntar på kollega'
        : workflowLane === 'booking_ready'
        ? 'Redo att boka nu'
        : 'Redo för åtgärd';
    const bookingReadinessLabel =
      bookingState === 'awaiting_confirmation'
        ? 'Väntar bekräftelse'
        : bookingState === 'ready_now' || bookingState === 'slots_ready'
        ? 'Kan erbjudas nu'
        : bookingState || 'Inte relevant';
    return {
      ...row,
      workflowLane,
      workflowLabel: laneLabels[workflowLane],
      queueReason:
        workflowLane === 'waiting_reply'
          ? `${sequenceLabel ? `${sequenceLabel} aktiv.` : 'Väntar på kund efter utskick.'}${slaGuardMessage ? ` ${slaGuardMessage}` : ''}`.trim()
          : recurringCadence
          ? `Återkommande uppföljning aktiv.${slaGuardMessage ? ` ${slaGuardMessage}` : ''}`.trim()
          : `Kräver aktivt nästa steg.${slaGuardMessage ? ` ${slaGuardMessage}` : ''}`.trim(),
      ownerDisplay: String(row.owner || '').trim() || 'Oägd',
      waitingStateLabel,
      followUpDeadline,
      bookingReadinessLabel,
      previewSummary: {
        ...(row.previewSummary || {}),
        assignedTo: String(row.owner || '').trim() || '',
      },
      recommendedTool: row.recommendedTool || 'open_studio',
      actionChoices: [],
      listBadges: [],
      topBadges: [],
      dueTone: waitingOn === 'customer' ? 'warn' : 'neutral',
      urgencyScore: Number(row.urgencyScore || 87),
      urgencyScoreTone: 'warn',
      escalationLabel: 'Bevaka risk',
      escalationTone: 'warn',
    };
  }

  function buildStudioOpenState(conversation, currentStudio, existingDraft) {
    const draftBody = String(existingDraft || '').trim() || 'TEMPLATE:booking_proposal';
    return {
      draftBody,
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          isOpen: true,
          strategyKey: 'booking_proposal',
          strategyLabel: 'Bokningsförslag',
          objective: 'Få kunden att välja en konkret tid.',
          desiredOutcome: 'Kunden väljer en tid direkt.',
          guardrail: 'Lämna inte nästa steg öppet.',
          postSendState: 'Väntar på kunds bekräftelse',
          postSendQueue: 'waiting_reply',
          postSendWaitingOn: 'customer',
          postSendOwner: 'Sara',
          postSendFollowUpDueAt: createTimestampOffset(22, 0),
          templateKey: 'booking_proposal',
          templateLabel: 'Bokningsförslag',
          templateSummary: 'Skicka två tydliga tider.',
          templateDraftBody: 'TEMPLATE:booking_proposal',
          currentDraftBody: draftBody,
          draftSource: 'template',
          sendReady: true,
          selectedSignatureId: 'sara',
          signatureLabel: 'Sara',
          signatureProfiles: [
            {
              id: 'sara',
              ownerKey: 'sara',
              name: 'Sara',
              title: 'Patientkoordinator',
              greeting: 'Vänliga hälsningar,',
              contact: 'Hair TP Clinic · contact@hairtpclinic.com · 031-881166',
            },
            {
              id: 'egzona',
              ownerKey: 'egzona',
              name: 'Egzona',
              title: 'Bokningsansvarig',
              greeting: 'Vänliga hälsningar,',
              contact: 'Hair TP Clinic · contact@hairtpclinic.com · 031-881166',
            },
          ],
          toneFilters: ['warm', 'clear_next_step'],
          aiVersion: 0,
          aiSuggestionBody: 'AI-SUGGESTION:booking_proposal:v0',
          aiSuggestionLabel: 'AI-förslag',
          aiSuggestionReason: 'Bokningsförslag med tydligt nästa steg.',
          aiContextSummary: 'Bygger på kö, väntestatus och bokningsläge.',
          aiContextUsed: ['Agera nu', 'Redo att boka nu'],
          aiConfidence: 0.91,
          readinessTone: 'success',
          readinessLabel: 'Redo att skicka',
          readinessSummary: 'Utkastet är redo att skickas.',
          readinessState: 'ready',
          policyStatus: 'clear',
          wordCount: 12,
        },
        draftStateLabel: 'Studion laddad',
        nextActionLabel: 'Skicka från studion',
        nextActionSummary: 'Väntar på kunds bekräftelse',
      },
    };
  }

  function buildStudioStrategyPatch(_conversation, strategyKey, currentStudio, currentDraft) {
    const nextDraft = String(currentDraft || '').trim()
      ? String(currentDraft || '')
      : `TEMPLATE:${strategyKey}`;
    const labelMap = {
      booking_proposal: 'Bokningsförslag',
      follow_up_nudge: 'Uppföljning',
      medical_review_hold: 'Medicinsk vänt',
    };
    return {
      draftBody: nextDraft,
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          isOpen: true,
          strategyKey,
          strategyLabel: labelMap[strategyKey] || strategyKey,
          objective: `Objective:${strategyKey}`,
          desiredOutcome: `Outcome:${strategyKey}`,
          guardrail: `Guardrail:${strategyKey}`,
          postSendState: strategyKey === 'medical_review_hold' ? 'Väntar på klinikens granskning' : 'Väntar på kund till Imorgon 10:00',
          postSendQueue: strategyKey === 'medical_review_hold' ? 'medical_review' : 'waiting_reply',
          postSendWaitingOn: strategyKey === 'medical_review_hold' ? 'clinic' : 'customer',
          postSendOwner: 'Sara',
          postSendFollowUpDueAt: createTimestampOffset(22, 0),
          templateKey: strategyKey,
          templateLabel: labelMap[strategyKey] || strategyKey,
          templateSummary: `Summary:${strategyKey}`,
          templateDraftBody: `TEMPLATE:${strategyKey}`,
          currentDraftBody: nextDraft,
          draftSource: 'template',
          sendReady: true,
          selectedSignatureId: 'sara',
          signatureLabel: 'Sara',
        },
        draftStateLabel: 'Strategi vald',
      },
    };
  }

  function buildStudioTemplateState(_conversation, currentStudio) {
    const strategyKey = String(currentStudio?.strategyKey || 'booking_proposal');
    return {
      draftBody: `TEMPLATE:${strategyKey}`,
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          isOpen: true,
          templateKey: strategyKey,
          templateLabel: strategyKey,
          templateSummary: `Summary:${strategyKey}`,
          templateDraftBody: `TEMPLATE:${strategyKey}`,
          currentDraftBody: `TEMPLATE:${strategyKey}`,
          draftSource: 'template',
          sendReady: true,
          selectedSignatureId: 'sara',
          signatureLabel: 'Sara',
          lastAppliedTemplateKey: strategyKey,
          lastAppliedTemplateAt: createTimestampOffset(0, 0),
          aiSuggestionBody: `AI-SUGGESTION:${strategyKey}:v0`,
        },
        draftStateLabel: 'Studio-utkast klart',
      },
    };
  }

  function buildStudioSendStatePatch(conversation, draftBody, currentStudio) {
    const strategyKey = String(currentStudio?.strategyKey || 'booking_proposal');
    const waitingOn = strategyKey === 'medical_review_hold' ? 'clinic' : 'customer';
    const bookingState = strategyKey === 'medical_review_hold' ? 'blocked_medical' : 'awaiting_confirmation';
    const lifecycleStage =
      strategyKey === 'medical_review_hold' ? 'Medicinsk review aktiv' : 'Väntar bekräftelse';
    const nextActionSummary =
      strategyKey === 'medical_review_hold'
        ? 'Kliniken måste granska ärendet före bokning.'
        : 'Invänta kundens svar och följ upp om inget svar kommer i tid.';
    return {
      patch: {
        owner: 'Sara',
        queueOverride: waitingOn === 'clinic' ? 'medical_review' : 'waiting_reply',
        handoffStatus: waitingOn === 'clinic' ? 'waiting_review' : 'awaiting_reply',
        waitingOn,
        bookingState,
        needsMedicalReview: waitingOn === 'clinic',
        followUpSuggested: true,
        followUpDueAt: createTimestampOffset(22, 0),
        lifecycleStage,
        nextActionLabel: waitingOn === 'clinic' ? 'Invänta klinikens klartecken' : 'Invänta kundens svar',
        nextActionSummary,
        lastActionTakenLabel: 'Studiosvar skickat',
        lastActionTakenAt: createTimestampOffset(0, 0),
        draftStateLabel: 'Senast skickat från studion',
        previewSummary: {
          assignedTo: 'Sara',
          interactionCount: Number(conversation?.previewSummary?.interactionCount || 0) + 1,
          lifecycleStatus: 'awaiting_reply',
          lastCaseSummary: `Svar skickat via studio (${strategyKey}).`,
        },
        previewStudio: {
          ...(currentStudio || {}),
          currentDraftBody: draftBody,
          editedDraftBody: draftBody,
          draftSource: 'sent',
          sendReady: false,
          selectedSignatureId: 'sara',
          signatureLabel: 'Sara',
          lastSentAt: createTimestampOffset(0, 0),
        },
      },
      historyLabel: 'Studiosvar skickat',
      historyExcerpt: `Studion skickade svar för ${strategyKey}.`,
      toastMessage: 'Svar skickat från studion.',
      toastTone: 'success',
    };
  }

  function buildProjectedOutcome(conversation, draftBody) {
    const transition = buildStudioSendStatePatch(conversation, draftBody, conversation?.previewStudio || {});
    return {
      transition,
      projected: buildRowModel({
        ...conversation,
        ...transition.patch,
        previewSummary: {
          ...(conversation?.previewSummary || {}),
          ...(transition.patch?.previewSummary || {}),
        },
      }),
    };
  }

  function buildStudioViewModel(conversation, options = {}) {
    const studioState = options.studioState || conversation?.previewStudio || {};
    return {
      title: studioState.strategyLabel || 'Svarsstudio',
      draft: {
        body: String(options.draftBody || studioState.currentDraftBody || ''),
        sendReady: studioState.sendReady === true,
      },
      primaryAction: {
        action: 'studio-send',
        cta: 'Skicka från studion',
      },
      signature: {
        label: studioState.signatureLabel || 'Sara',
      },
      postSend: {
        queueLabel: options?.projectedOutcome?.projected?.workflowLabel || '-',
      },
    };
  }

  function buildStudioRewriteState(_conversation, rewriteKey, currentStudio) {
    return {
      draftBody: `REWRITE:${rewriteKey}`,
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          isOpen: true,
          currentDraftBody: `REWRITE:${rewriteKey}`,
          editedDraftBody: `REWRITE:${rewriteKey}`,
          draftSource: 'edited',
          sendReady: true,
          lastRewriteAction: rewriteKey,
        },
        draftStateLabel: 'Omskrivet i studio',
      },
    };
  }

  function buildStudioSignatureState(_conversation, signatureId, currentStudio) {
    return {
      draftBody: `SIGNATURE:${signatureId}`,
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          isOpen: true,
          currentDraftBody: `SIGNATURE:${signatureId}`,
          editedDraftBody: `SIGNATURE:${signatureId}`,
          draftSource: 'edited',
          sendReady: true,
          selectedSignatureId: signatureId,
          signatureLabel: signatureId === 'egzona' ? 'Egzona' : 'Sara',
        },
        draftStateLabel: 'Signatur säkrad',
      },
    };
  }

  function buildStudioDraftPatch(_conversation, currentStudio, draftBody) {
    return {
      previewStudio: {
        ...(currentStudio || {}),
        isOpen: true,
        currentDraftBody: String(draftBody || ''),
        editedDraftBody: String(draftBody || ''),
        draftSource: 'edited',
        sendReady: Boolean(String(draftBody || '').trim()),
      },
    };
  }

  function buildStudioSignatureEditorState(_conversation, currentStudio) {
    return {
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          activeDialog: 'signature_editor',
          signatureEditorProfileId: String(currentStudio?.selectedSignatureId || 'sara'),
          signatureEditorDraft: {
            id: String(currentStudio?.selectedSignatureId || 'sara'),
            ownerKey: String(currentStudio?.selectedSignatureId || 'sara'),
            name: currentStudio?.signatureLabel || 'Sara',
            title: 'Patientkoordinator',
            greeting: 'Vänliga hälsningar,',
            email: 'contact@hairtpclinic.com',
            phone: '031-881166',
            contact: 'Hair TP Clinic · contact@hairtpclinic.com · 031-881166',
          },
        },
      },
    };
  }

  function buildStudioSignatureProfileSaveState(_conversation, currentStudio, currentDraft) {
    const editorDraft = currentStudio?.signatureEditorDraft || {};
    const name = String(editorDraft.name || 'Sara');
    return {
      draftBody: `SIGNATURE-PROFILE:${name}`,
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          activeDialog: '',
          selectedSignatureId: String(editorDraft.id || 'sara'),
          signatureLabel: name,
          signatureProfiles: [
            {
              id: String(editorDraft.id || 'sara'),
              ownerKey: String(editorDraft.id || 'sara'),
              name,
              title: String(editorDraft.title || 'Patientkoordinator'),
              greeting: String(editorDraft.greeting || 'Vänliga hälsningar,'),
              contact: String(editorDraft.contact || 'Hair TP Clinic · contact@hairtpclinic.com · 031-881166'),
            },
            {
              id: 'egzona',
              ownerKey: 'egzona',
              name: 'Egzona',
              title: 'Bokningsansvarig',
              greeting: 'Vänliga hälsningar,',
              contact: 'Hair TP Clinic · contact@hairtpclinic.com · 031-881166',
            },
          ],
          currentDraftBody: `SIGNATURE-PROFILE:${name}`,
          editedDraftBody: `SIGNATURE-PROFILE:${name}`,
          draftSource: 'edited',
        },
        draftStateLabel: 'Signatur uppdaterad',
        previewSummary: {
          assignedTo: name,
          lastCaseSummary: `Signaturprofil sparad för ${name}.`,
        },
      },
    };
  }

  function buildStudioToneToggleState(_conversation, toneKey, currentStudio) {
    const existing = Array.isArray(currentStudio?.toneFilters) ? currentStudio.toneFilters : [];
    const hasTone = existing.includes(toneKey);
    return {
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          toneFilters: hasTone ? existing.filter((entry) => entry !== toneKey) : [...existing, toneKey],
          aiVersion: Number(currentStudio?.aiVersion || 0) + 1,
        },
      },
    };
  }

  function buildStudioSuggestionState(_conversation, currentStudio, currentDraft, mode) {
    const nextVersion = mode === 'regenerate' ? Number(currentStudio?.aiVersion || 0) + 1 : Number(currentStudio?.aiVersion || 0);
    if (mode === 'apply') {
      return {
        draftBody: `AI-SUGGESTION:${currentStudio?.strategyKey || 'booking_proposal'}:v${nextVersion}`,
        patch: {
          previewStudio: {
            ...(currentStudio || {}),
            aiVersion: nextVersion,
            aiAppliedAt: createTimestampOffset(0, 0),
            aiSuggestionBody: `AI-SUGGESTION:${currentStudio?.strategyKey || 'booking_proposal'}:v${nextVersion}`,
            currentDraftBody: `AI-SUGGESTION:${currentStudio?.strategyKey || 'booking_proposal'}:v${nextVersion}`,
            editedDraftBody: `AI-SUGGESTION:${currentStudio?.strategyKey || 'booking_proposal'}:v${nextVersion}`,
            draftSource: 'ai',
          },
        },
      };
    }
    return {
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          aiVersion: nextVersion,
          aiSuggestionBody: `AI-SUGGESTION:${currentStudio?.strategyKey || 'booking_proposal'}:v${nextVersion}`,
        },
      },
    };
  }

  function buildStudioSnoozeState(_conversation, presetKey, currentStudio, draftBody) {
    const plan = followUpEngine.buildSnoozePlan({
      presetKey,
      conversation: _conversation,
      nowTimestamp: Date.parse('2026-04-22T12:00:00.000Z'),
    });
    return {
      patch: {
        queueOverride: plan.queueOverride,
        waitingOn: plan.waitingOn,
        followUpDueAt: plan.targetAt,
        followUpMode: plan.followUpMode,
        waitUntilReply: plan.waitUntilReply,
        recurringCadence: plan.recurringCadence,
        followUpSequenceKey: plan.followUpSequenceKey,
        followUpSequenceStep: plan.followUpSequenceStep,
        followUpSequenceLabel: plan.followUpSequenceLabel,
        followUpFallbackAction: plan.followUpFallbackAction,
        slaGuardStatus: plan.slaGuardStatus,
        slaGuardMessage: plan.slaGuardMessage,
        nextActionLabel: plan.nextActionLabel,
        nextActionSummary: plan.nextActionSummary,
        lastActionTakenLabel: 'Snoozad i studio',
        previewStudio: {
          ...(currentStudio || {}),
          snoozePresetKey: plan.key,
          snoozeUntilAt: plan.targetAt,
          followUpMode: plan.followUpMode,
          waitUntilReply: plan.waitUntilReply,
          recurringCadence: plan.recurringCadence,
          followUpSequenceKey: plan.followUpSequenceKey,
          followUpSequenceStep: plan.followUpSequenceStep,
          followUpSequenceLabel: plan.followUpSequenceLabel,
          followUpFallbackAction: plan.followUpFallbackAction,
          slaGuardStatus: plan.slaGuardStatus,
          slaGuardMessage: plan.slaGuardMessage,
          activeDialog: '',
          currentDraftBody: String(draftBody || ''),
        },
      },
    };
  }

  function buildStudioScheduleState(_conversation, presetKey, currentStudio, draftBody) {
    const plan = followUpEngine.buildSchedulePlan({
      presetKey,
      conversation: _conversation,
      nowTimestamp: Date.parse('2026-04-22T12:00:00.000Z'),
    });
    return {
      patch: {
        queueOverride: plan.queueOverride,
        waitingOn: plan.waitingOn,
        followUpDueAt: plan.targetAt,
        followUpMode: plan.followUpMode,
        waitUntilReply: false,
        recurringCadence: plan.recurringCadence,
        followUpSequenceKey: '',
        followUpSequenceStep: 0,
        followUpSequenceLabel: '',
        followUpFallbackAction: '',
        slaGuardStatus: plan.slaGuardStatus,
        slaGuardMessage: plan.slaGuardMessage,
        nextActionLabel: plan.nextActionLabel,
        nextActionSummary: plan.nextActionSummary,
        lastActionTakenLabel: 'Utskick schemalagt',
        previewStudio: {
          ...(currentStudio || {}),
          scheduledSendAt: plan.targetAt,
          followUpMode: plan.followUpMode,
          recurringCadence: plan.recurringCadence,
          slaGuardStatus: plan.slaGuardStatus,
          slaGuardMessage: plan.slaGuardMessage,
          activeDialog: '',
          currentDraftBody: String(draftBody || ''),
        },
      },
    };
  }

  function buildStudioDeleteState(_conversation, currentStudio, draftBody) {
    return {
      patch: {
        previewStudio: {
          ...(currentStudio || {}),
          activeDialog: '',
          isDeleted: true,
          deletedAt: createTimestampOffset(0, 0),
          currentDraftBody: String(draftBody || ''),
        },
      },
    };
  }

  function buildStudioHandledState(_conversation, currentStudio, draftBody) {
    return {
      patch: {
        queueOverride: 'admin_low',
        waitingOn: 'none',
        lifecycleStage: 'Hanterad i preview',
        nextActionLabel: 'Ingen åtgärd just nu',
        nextActionSummary: 'Tråden är hanterad för nu.',
        lastActionTakenLabel: 'Markerad som hanterad',
        previewStudio: {
          ...(currentStudio || {}),
          currentDraftBody: draftBody,
          editedDraftBody: draftBody,
          draftSource: 'handled',
        },
      },
    };
  }

  function buildStudioReturnLaterState(_conversation, currentStudio, draftBody) {
    const plan = followUpEngine.buildReturnLaterPlan({
      conversation: _conversation,
      nowTimestamp: Date.parse('2026-04-22T12:00:00.000Z'),
    });
    return {
      patch: {
        queueOverride: plan.queueOverride,
        waitingOn: plan.waitingOn,
        followUpDueAt: plan.targetAt,
        followUpMode: plan.followUpMode,
        waitUntilReply: plan.waitUntilReply,
        recurringCadence: plan.recurringCadence,
        followUpSequenceKey: plan.followUpSequenceKey,
        followUpSequenceStep: plan.followUpSequenceStep,
        followUpSequenceLabel: plan.followUpSequenceLabel,
        followUpFallbackAction: plan.followUpFallbackAction,
        slaGuardStatus: plan.slaGuardStatus,
        slaGuardMessage: plan.slaGuardMessage,
        nextActionLabel: plan.nextActionLabel,
        nextActionSummary: plan.nextActionSummary,
        lastActionTakenLabel: 'Återuppta senare',
        previewStudio: {
          ...(currentStudio || {}),
          currentDraftBody: draftBody,
          editedDraftBody: draftBody,
          draftSource: 'saved',
          snoozePresetKey: plan.key,
          snoozeUntilAt: plan.targetAt,
          followUpMode: plan.followUpMode,
          waitUntilReply: plan.waitUntilReply,
          recurringCadence: plan.recurringCadence,
          followUpSequenceKey: plan.followUpSequenceKey,
          followUpSequenceStep: plan.followUpSequenceStep,
          followUpSequenceLabel: plan.followUpSequenceLabel,
          followUpFallbackAction: plan.followUpFallbackAction,
          slaGuardStatus: plan.slaGuardStatus,
          slaGuardMessage: plan.slaGuardMessage,
        },
      },
    };
  }

  return {
    sanitizeScenario: (value) => String(value || '').trim() || 'all',
    sanitizeSearchQuery: (value) => String(value || '').trim(),
    getTimestampOffset: createTimestampOffset,
    getActorLabel: () => 'Sara',
    getOwnerPatch: (conversation) =>
      String(conversation?.owner || '').trim() ? {} : { owner: 'Sara', handoffStatus: 'assigned' },
    buildRowModel,
    buildFollowThroughMeta: (row) => ({
      changeLabel: `Nu i ${row?.workflowLabel || '-'}`,
      changeSummary: row?.waitingStateLabel || '-',
      waitingLabel: row?.waitingStateLabel || '-',
      followUpLabel: row?.followUpDeadline || '-',
      ownerLabel: row?.ownerDisplay || '-',
      bookingLabel: row?.bookingReadinessLabel || '-',
      nextStepSummary: row?.nextActionSummary || '-',
      tone: 'neutral',
    }),
    buildTemplateDraft: () => 'TEMPLATE:booking_proposal',
    buildTemplateAppliedPatch: () => ({
      draftStateLabel: 'Mall applicerad',
    }),
    buildStudioPatch: () => ({
      draftStateLabel: 'Studion laddad',
    }),
    buildStudioOpenState,
    buildStudioStrategyPatch,
    buildStudioTemplateState,
    buildStudioDraftPatch,
    buildStudioRewriteState,
    buildStudioSignatureState,
    buildStudioSignatureEditorState,
    buildStudioSignatureProfileSaveState,
    buildStudioToneToggleState,
    buildStudioSuggestionState,
    buildStudioHandledState,
    buildStudioReturnLaterState,
    buildStudioSnoozeState,
    buildStudioScheduleState,
    buildStudioDeleteState,
    buildStudioSendStatePatch,
    buildStudioViewModel,
    buildProjectedOutcome,
    buildPrimaryActionPlan: () => ({
      action: 'studio-send',
      cta: 'Skicka från studion',
    }),
    buildSendStatePatch: buildStudioSendStatePatch,
    buildMedicalClearPatch: () => ({
      needsMedicalReview: false,
      queueOverride: 'booking_ready',
      bookingState: 'ready_now',
      waitingOn: 'none',
    }),
    buildReplyPatch: () => ({
      waitingOn: 'none',
      queueOverride: 'booking_ready',
      bookingState: 'ready_now',
    }),
    buildSimulatedReply: () => 'Tack, det fungerar.',
  };
}

function createStoreForStudioTests() {
  const backbone = loadBackboneModule();
  return backbone.createStore({
    previewSeed: createPreviewSeed(),
    sessionState: {},
    dependencies: createDependencies(),
  });
}

function createStoreForInboxTests(sessionState = {}) {
  const backbone = loadBackboneModule();
  return backbone.createStore({
    previewSeed: createInboxPreviewSeed(),
    sessionState,
    dependencies: createDependencies(),
  });
}

test('customer intelligence helper builds compact relationship, identity, treatment and journey cards', () => {
  const helper = loadCustomerIntelligenceModule();
  const model = helper.buildModel(createPreviewSeed().rows[0]);

  assert.equal(model.relationshipCard.title, 'Relationssignal');
  assert.match(model.relationshipCard.detail, /VIP/i);
  assert.equal(model.identityCard.title, 'Identitet & underlag');
  assert.match(model.identityCard.lines[0].value, /GDPR ok/i);
  assert.equal(model.treatmentCard.title, 'Behandlingskontext');
  assert.match(model.treatmentCard.detail, /PRP/i);
  assert.equal(model.journeyCard.title, 'Kundresa');
  assert.equal(model.journeyCard.timeline.length >= 2, true);
});

test('collaboration helper builds presence, handoff and draft cards from preview state', () => {
  const helper = loadCollaborationModule();
  const model = helper.buildModel(createPreviewSeed().rows[0], { actorLabel: 'Fazli' });

  assert.equal(model.presenceCard.title, 'Närvaro');
  assert.match(model.presenceCard.detail, /1 i tråden|Egzona/i);
  assert.equal(model.handoffCard.title, 'Handoff');
  assert.equal(model.draftCard.title, 'Utkast');
});

test('customer intelligence fields round-trip through the shared backbone state', () => {
  const store = createStoreForStudioTests();
  const record = store.getThreadCase('thread-anna');
  const snapshot = store.getSnapshot();

  assert.equal(record.customer_intelligence.vip_status, 'vip');
  assert.equal(record.customer_intelligence.lifetime_value, 126000);
  assert.equal(record.customer_intelligence.consent_status.gdpr, true);
  assert.equal(record.customer_intelligence.recent_treatments[0], 'PRP · jan 2026');
  assert.equal(record.customer_intelligence.journey_events[0].label, 'Första kontakt');

  assert.equal(snapshot.selectedConversation.vipStatus, 'vip');
  assert.equal(snapshot.selectedConversation.plannedTreatment, 'PRP återbesök');
  assert.equal(snapshot.selectedConversation.journeyEvents.length, 2);
});

test('collaboration fields round-trip through the shared backbone state', () => {
  const store = createStoreForStudioTests();
  const record = store.getThreadCase('thread-anna');
  const snapshot = store.getSnapshot();

  assert.equal(record.collaboration.active_viewers.length, 1);
  assert.equal(record.collaboration.active_viewers[0].name, 'Egzona');
  assert.equal(record.collaboration.draft_owner, 'Sara');
  assert.equal(snapshot.selectedConversation.activeViewers.length, 1);
  assert.equal(snapshot.selectedConversation.handoffStatusDetail, 'Sara håller tråden tills kunden väljer tid.');
});

test('open-studio stores strategy and objective in shared backbone state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  const snapshot = store.getSnapshot();
  const exported = store.exportSessionState();
  const threadState = exported.threadStateByConversationId['thread-anna'] || {};

  assert.equal(threadState.previewStudio?.isOpen, true);
  assert.equal(threadState.previewStudio?.strategyKey, 'booking_proposal');
  assert.equal(threadState.previewStudio?.objective, 'Få kunden att välja en konkret tid.');
  assert.equal(Boolean(snapshot.selectedStudio), true);
  assert.equal(snapshot.selectedStudio.primaryAction.action, 'studio-send');
});

test('studio strategy switch updates shared studio strategy state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-strategy:follow_up_nudge');

  const record = store.getThreadCase('thread-anna');
  const snapshot = store.getSnapshot();

  assert.equal(record.studio.strategyKey, 'follow_up_nudge');
  assert.equal(record.studio.strategyLabel, 'Uppföljning');
  assert.equal(snapshot.selectedStudio.title, 'Uppföljning');
  assert.match(store.getDraftValueById('thread-anna'), /^TEMPLATE:/);
});

test('studio-apply-template updates current draft and applied template state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-strategy:medical_review_hold');
  store.dispatchAction('studio-apply-template');

  const draftValue = store.getDraftValueById('thread-anna');
  const exported = store.exportSessionState();
  const threadState = exported.threadStateByConversationId['thread-anna'] || {};

  assert.equal(threadState.previewStudio?.lastAppliedTemplateKey, 'medical_review_hold');
  assert.equal(threadState.previewStudio?.templateDraftBody, 'TEMPLATE:medical_review_hold');
  assert.equal(draftValue, 'TEMPLATE:medical_review_hold');
});

test('studio-send updates queue and waiting state through shared snapshot', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-apply-template');
  store.dispatchAction('studio-send');

  const record = store.getThreadCase('thread-anna');
  const snapshot = store.getSnapshot();
  const exported = store.exportSessionState();
  const threadState = exported.threadStateByConversationId['thread-anna'] || {};

  assert.equal(record.waiting_on, 'customer');
  assert.equal(record.booking_state, 'awaiting_confirmation');
  assert.equal(record.last_action.label, 'Studiosvar skickat');
  assert.equal(threadState.previewStudio?.lastSentAt, '2026-04-22T12:00:00.000Z');
  assert.equal(snapshot.selectedConversation.workflowLane, 'waiting_reply');
  assert.equal(snapshot.counts.waiting_reply, 1);
  assert.equal(snapshot.counts.action_now, 0);
});

test('studio rewrite updates shared draft and rewrite state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-rewrite:professional');

  const record = store.getThreadCase('thread-anna');
  const draftValue = store.getDraftValueById('thread-anna');

  assert.equal(draftValue, 'REWRITE:professional');
  assert.equal(record.studio.lastRewriteAction, 'professional');
  assert.equal(record.draft_state.label, 'Omskrivet i studio');
});

test('studio signature switch updates shared signature state and draft', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-signature:egzona');

  const record = store.getThreadCase('thread-anna');
  const snapshot = store.getSnapshot();

  assert.equal(record.studio.selectedSignatureId, 'egzona');
  assert.equal(record.studio.signatureLabel, 'Egzona');
  assert.equal(snapshot.selectedStudio.signature.label, 'Egzona');
  assert.equal(store.getDraftValueById('thread-anna'), 'SIGNATURE:egzona');
});

test('studio mark handled moves thread into handled low-priority state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-mark-handled');

  const snapshot = store.getSnapshot();
  const record = store.getThreadCase('thread-anna');

  assert.equal(record.presentation.queueOverride, 'admin_low');
  assert.equal(snapshot.selectedConversation.workflowLane, 'admin_low');
  assert.equal(record.last_action.label, 'Markerad som hanterad');
});

test('studio return later parks thread in follow-up queue with owner wait state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-return-later');

  const snapshot = store.getSnapshot();
  const record = store.getThreadCase('thread-anna');

  assert.equal(record.presentation.queueOverride, 'follow_up_today');
  assert.equal(record.waiting_on, 'owner');
  assert.equal(snapshot.selectedConversation.workflowLane, 'follow_up_today');
  assert.match(snapshot.selectedConversation.waitingStateLabel, /Återuppta/i);
});

test('studio signature editor saves profile into shared backbone state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-open-signature-editor');
  store.updateStudioState('thread-anna', {
    signatureEditorDraft: {
      id: 'sara',
      ownerKey: 'sara',
      name: 'Sara Lind',
      title: 'Lead coordinator',
      greeting: 'Vänliga hälsningar,',
      email: 'sara@hairtpclinic.com',
      phone: '031-881100',
      contact: 'Hair TP Clinic · sara@hairtpclinic.com · 031-881100',
    },
  });
  store.dispatchAction('studio-save-signature-profile');

  const record = store.getThreadCase('thread-anna');
  const draftValue = store.getDraftValueById('thread-anna');

  assert.equal(record.studio.signatureLabel, 'Sara Lind');
  assert.equal(record.summary.assignedTo, 'Sara Lind');
  assert.equal(record.studio.activeDialog, '');
  assert.equal(draftValue, 'SIGNATURE-PROFILE:Sara Lind');
});

test('studio regenerate and use suggestion update shared draft state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-regenerate-suggestion');
  store.dispatchAction('studio-use-suggestion');

  const record = store.getThreadCase('thread-anna');

  assert.equal(record.studio.aiVersion, 1);
  assert.equal(record.studio.aiAppliedAt, '2026-04-22T12:00:00.000Z');
  assert.equal(store.getDraftValueById('thread-anna'), 'AI-SUGGESTION:booking_proposal:v1');
});

test('studio snooze parks thread with explicit later state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-snooze:tomorrow_morning');

  const snapshot = store.getSnapshot();
  const record = store.getThreadCase('thread-anna');

  assert.equal(record.presentation.queueOverride, 'follow_up_today');
  assert.equal(record.waiting_on, 'owner');
  assert.equal(record.studio.snoozePresetKey, 'tomorrow_morning');
  assert.equal(record.follow_up_mode, 'one_off');
  assert.equal(record.sla_guard_status, 'adjusted');
  assert.equal(snapshot.selectedConversation.workflowLane, 'follow_up_today');
});

test('follow-up engine exposes recurring and sequence presets', () => {
  const engine = loadFollowUpEngineModule();
  const presets = engine.getSnoozePresets({
    nowTimestamp: Date.parse('2026-04-22T12:00:00.000Z'),
    conversation: createPreviewSeed().rows[0],
  });

  assert.equal(presets.some((entry) => entry.key === 'weekly_checkin'), true);
  assert.equal(presets.some((entry) => entry.key === 'three_step_nudge'), true);
});

test('follow-up engine preserves a concrete due label when SLA guard adjusts the target', () => {
  const engine = loadFollowUpEngineModule();
  const plan = engine.buildSnoozePlan({
    presetKey: 'weekly_checkin',
    nowTimestamp: Date.parse('2026-04-22T12:00:00.000Z'),
    conversation: createPreviewSeed().rows[0],
  });

  assert.notEqual(plan.dueLabel, 'Ingen deadline');
  assert.equal(plan.slaGuardStatus, 'adjusted');
});

test('studio snooze stores recurring cadence in shared backbone state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-snooze:weekly_checkin');

  const snapshot = store.getSnapshot();
  const record = store.getThreadCase('thread-anna');

  assert.equal(record.follow_up_mode, 'recurring');
  assert.equal(record.recurring_cadence, 'weekly');
  assert.equal(record.sla_guard_status, 'adjusted');
  assert.match(snapshot.selectedConversation.waitingStateLabel, /Återkommer/i);
});

test('studio snooze stores sequence metadata in shared backbone state', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-snooze:three_step_nudge');

  const snapshot = store.getSnapshot();
  const record = store.getThreadCase('thread-anna');

  assert.equal(record.follow_up_mode, 'sequence');
  assert.equal(record.follow_up_sequence_key, 'three_step_nudge');
  assert.equal(record.follow_up_sequence_step, 1);
  assert.equal(record.follow_up_sequence_label, 'Mjuk nudgesekvens');
  assert.equal(record.follow_up_fallback_action, 'mark_dormant');
  assert.equal(snapshot.selectedConversation.workflowLane, 'waiting_reply');
  assert.match(snapshot.selectedConversation.waitingStateLabel, /Mjuk nudgesekvens/i);
});

test('studio schedule stores scheduled send state on the shared backbone', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-schedule:today_1700');

  const record = store.getThreadCase('thread-anna');

  assert.equal(record.presentation.queueOverride, 'follow_up_today');
  assert.equal(record.waiting_on, 'owner');
  assert.equal(record.studio.scheduledSendAt, '2026-04-22T17:00:00.000Z');
  assert.equal(record.follow_up_mode, 'scheduled_send');
  assert.equal(record.last_action.label, 'Utskick schemalagt');
});

test('studio confirm delete removes thread from visible queue counts', () => {
  const store = createStoreForStudioTests();
  store.dispatchAction('open-studio');
  store.dispatchAction('studio-confirm-delete');

  const snapshot = store.getSnapshot();
  const record = store.getThreadCase('thread-anna');

  assert.equal(record.studio.isDeleted, true);
  assert.equal(snapshot.rows.length, 0);
  assert.equal(snapshot.counts.all, 0);
});

test('handoff request updates waiting state, follow-up and next action in shared backbone', () => {
  const store = createStoreForInboxTests();

  store.selectThread('thread-anna');
  store.updateCollaborationState('thread-anna', {
    handoffTarget: 'Egzona',
    handoffNote: 'Ta över ombokningen och skicka två tider idag.',
  });
  store.dispatchAction('handoff-request');

  const record = store.getThreadCase('thread-anna');
  const snapshot = store.getSnapshot();

  assert.equal(record.collaboration.handoff_request, 'pending');
  assert.equal(record.waiting_on, 'colleague');
  assert.equal(record.presentation.queueOverride, 'follow_up_today');
  assert.match(record.next_best_action.label, /Invänta Egzona/i);
  assert.match(snapshot.selectedConversation.waitingStateLabel, /kollega/i);
});

test('handoff accept and reclaim keep owner and queue state deterministic', () => {
  const store = createStoreForInboxTests();

  store.selectThread('thread-anna');
  store.updateCollaborationState('thread-anna', {
    handoffTarget: 'Egzona',
    handoffNote: 'Ta nästa steg med kunden idag.',
  });
  store.dispatchAction('handoff-request');
  store.dispatchAction('handoff-accept');

  let record = store.getThreadCase('thread-anna');
  assert.equal(record.owner, 'Egzona');
  assert.equal(record.collaboration.handoff_request, 'accepted');
  assert.equal(record.waiting_on, 'none');
  assert.equal(record.presentation.queueOverride, 'action_now');

  store.dispatchAction('handoff-reclaim');
  record = store.getThreadCase('thread-anna');
  assert.equal(record.owner, 'Sara');
  assert.equal(record.collaboration.handoff_request, 'reclaimed');
  assert.equal(record.waiting_on, 'none');
});

test('simulated peer editing derives collision and draft owner metadata', () => {
  const store = createStoreForInboxTests();

  store.selectThread('thread-anna');
  store.updateCollaborationState('thread-anna', {
    handoffTarget: 'Egzona',
  });
  store.dispatchAction('simulate-peer-editing');

  const record = store.getThreadCase('thread-anna');

  assert.equal(record.collaboration.active_editor, 'Egzona');
  assert.equal(record.collaboration.collision_state, 'editing');
  assert.equal(record.collaboration.draft_owner, 'Egzona');
});

test('saved views and follow-up filters derive visible inbox rows from shared store state', () => {
  const store = createStoreForInboxTests();

  store.setSavedView('unowned');
  let snapshot = store.getSnapshot();
  assert.equal(snapshot.rows.map((row) => row.conversationId).join(','), 'thread-erik');
  assert.equal(snapshot.savedViewCounts.unowned, 1);

  store.setSavedView('all');
  store.setFollowUpFilter('waiting_reply');
  snapshot = store.getSnapshot();
  assert.equal(snapshot.rows.map((row) => row.conversationId).join(','), 'thread-johan');
  assert.equal(snapshot.followUpCounts.waiting_reply, 1);
});

test('multiselect state tracks selected rows and can select all visible rows', () => {
  const store = createStoreForInboxTests();

  store.toggleSelectionMode(true);
  store.toggleRowSelection('thread-anna');
  store.toggleRowSelection('thread-erik');
  let snapshot = store.getSnapshot();
  assert.equal(snapshot.selectionMode, true);
  assert.equal(snapshot.selectedCount, 2);
  assert.equal(snapshot.allVisibleSelected, false);

  store.selectAllVisible();
  snapshot = store.getSnapshot();
  assert.equal(snapshot.selectedCount, 4);
  assert.equal(snapshot.allVisibleSelected, true);
});

test('bulk assign and snooze update shared inbox state deterministically', () => {
  const store = createStoreForInboxTests();

  store.toggleSelectionMode(true);
  store.toggleRowSelection('thread-erik');
  store.applyBulkAction('assign_self');

  let record = store.getThreadCase('thread-erik');
  assert.equal(record.owner, 'Sara');
  assert.equal(record.last_action.label, 'Bulk: ägare satt');

  store.toggleSelectionMode(true);
  store.toggleRowSelection('thread-anna');
  store.applyBulkAction('snooze_tomorrow');

  record = store.getThreadCase('thread-anna');
  const snapshot = store.getSnapshot();
  assert.equal(record.waiting_on, 'owner');
  assert.equal(record.presentation.queueOverride, 'follow_up_today');
  assert.equal(snapshot.counts.follow_up_today >= 1, true);
});

test('density and disclosure state export through shared session state', () => {
  const store = createStoreForInboxTests();

  store.setWorklistDensity('compact');
  store.setDisclosureMode('expanded');

  const snapshot = store.getSnapshot();
  const exported = store.exportSessionState();

  assert.equal(snapshot.worklistDensity, 'compact');
  assert.equal(snapshot.disclosureMode, 'expanded');
  assert.equal(exported.worklistDensity, 'compact');
  assert.equal(exported.disclosureMode, 'expanded');
});

test('command palette derives searchable commands from the shared inbox context', () => {
  const store = createStoreForInboxTests();

  store.setCommandPaletteOpen(true);
  let snapshot = store.getSnapshot();
  assert.equal(snapshot.commandPalette.isOpen, true);
  assert.equal(snapshot.commandPalette.items[0].id, 'scenario:all');

  store.setCommandQuery('oägda');
  snapshot = store.getSnapshot();
  assert.equal(snapshot.commandPalette.query, 'oägda');
  assert.equal(snapshot.commandPalette.items[0].id, 'saved-view:unowned');
});

test('command execution switches queue and selected thread through the shared backbone', () => {
  const store = createStoreForInboxTests();

  store.runCommand('scenario:waiting_reply');
  let snapshot = store.getSnapshot();
  assert.equal(snapshot.scenario, 'waiting_reply');
  assert.equal(snapshot.rows.map((row) => row.conversationId).join(','), 'thread-johan');

  store.runCommand('thread:thread-johan');
  snapshot = store.getSnapshot();
  assert.equal(snapshot.selectedConversation.conversationId, 'thread-johan');
});

test('command actions reuse the shared action engine for thread consequences', () => {
  const store = createStoreForInboxTests();

  store.selectThread('thread-erik');
  store.runCommand('action:take-ownership');
  let record = store.getThreadCase('thread-erik');
  assert.equal(record.owner, 'Sara');
  assert.equal(record.last_action.label, 'Ägarskap taget');

  store.selectThread('thread-anna');
  store.runCommand('action:studio-return-later');
  record = store.getThreadCase('thread-anna');
  assert.equal(record.presentation.queueOverride, 'follow_up_today');
  assert.equal(record.waiting_on, 'owner');
});

test('relative thread navigation moves through visible inbox rows deterministically', () => {
  const store = createStoreForInboxTests();

  let snapshot = store.getSnapshot();
  assert.equal(snapshot.selectedConversation.conversationId, 'thread-anna');

  store.selectRelativeThread(1);
  snapshot = store.getSnapshot();
  assert.equal(snapshot.selectedConversation.conversationId, 'thread-erik');

  store.selectRelativeThread(-1);
  snapshot = store.getSnapshot();
  assert.equal(snapshot.selectedConversation.conversationId, 'thread-anna');
});
