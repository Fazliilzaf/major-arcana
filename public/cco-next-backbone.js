(function initArcanaCcoNextBackbone(global) {
  'use strict';

  const SCENARIOS = ['all', 'action_now', 'booking_ready', 'follow_up_today', 'waiting_reply', 'medical_review', 'admin_low'];
  const CENTER_TABS = ['conversation', 'customer', 'history', 'notes'];
  const SIDEBAR_TABS = ['overview', 'ai', 'medical', 'team'];
  const SAVED_VIEWS = ['all', 'unowned', 'booking_now', 'high_risk', 'waiting_customer'];
  const FOLLOW_UP_FILTERS = ['all', 'overdue', 'today', 'tomorrow', 'waiting_reply'];
  const WORKLIST_DENSITIES = ['regular', 'compact'];
  const DISCLOSURE_MODES = ['progressive', 'expanded'];

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function asText(value, fallback = '') {
    const safeValue = String(value == null ? '' : value).trim();
    return safeValue || fallback;
  }

  function asBoolean(value) {
    return value === true;
  }

  function cloneTextArray(value) {
    return Array.isArray(value)
      ? value
          .map((entry) => asText(entry))
          .filter(Boolean)
      : [];
  }

  function cloneConsentStatus(value) {
    const safeValue = isPlainObject(value) ? value : {};
    const normalizeFlag = (entry) => (entry === true ? true : entry === false ? false : null);
    return {
      gdpr: normalizeFlag(safeValue.gdpr),
      photos: normalizeFlag(safeValue.photos),
      marketing: normalizeFlag(safeValue.marketing),
    };
  }

  function cloneJourneyEvents(value) {
    return Array.isArray(value)
      ? value
          .filter((entry) => isPlainObject(entry))
          .map((entry, index) => ({
            id: asText(entry.id, `journey-${index + 1}`),
            type: asText(entry.type),
            label: asText(entry.label || entry.title || entry.type, `Händelse ${index + 1}`),
            date: asText(entry.date),
            note: asText(entry.note || entry.description),
            tone: asText(entry.tone, 'neutral'),
          }))
          .filter((entry) => entry.label)
      : [];
  }

  function cloneCollaborators(value) {
    return Array.isArray(value)
      ? value
          .filter((entry) => isPlainObject(entry))
          .map((entry, index) => ({
            id: asText(entry.id, `collab-${index + 1}`),
            name: asText(entry.name || entry.label, `Kollega ${index + 1}`),
            action: asText(entry.action || entry.status, 'viewing'),
            location: asText(entry.location || entry.context),
            duration_seconds:
              Number(
                entry.duration_seconds != null ? entry.duration_seconds : entry.durationSeconds || 0
              ) || 0,
          }))
          .filter((entry) => entry.name)
          .slice(0, 6)
      : [];
  }

  function cloneIdArray(value) {
    return Array.isArray(value)
      ? value
          .map((entry) => asText(entry))
          .filter(Boolean)
      : [];
  }

  function cloneMessages(value) {
    return Array.isArray(value)
      ? value
          .filter((entry) => isPlainObject(entry))
          .map((entry) => ({
            author: asText(entry.author),
            role: asText(entry.role || 'agent', 'agent'),
            timestamp: asText(entry.timestamp),
            body: asText(entry.body),
          }))
      : [];
  }

  function cloneHistory(value) {
    return Array.isArray(value)
      ? value
          .filter((entry) => isPlainObject(entry))
          .map((entry) => ({
            label: asText(entry.label),
            timestamp: asText(entry.timestamp),
            excerpt: asText(entry.excerpt),
          }))
      : [];
  }

  function cloneSignatureProfiles(value) {
    return Array.isArray(value)
      ? value
          .filter((entry) => isPlainObject(entry))
          .map((entry) => ({
            id: asText(entry.id),
            ownerKey: asText(entry.ownerKey),
            name: asText(entry.name),
            title: asText(entry.title),
            greeting: asText(entry.greeting),
            contact: asText(entry.contact),
            email: asText(entry.email),
            phone: asText(entry.phone),
          }))
          .filter((entry) => entry.id)
      : [];
  }

  function cloneSignatureEditorDraft(value) {
    const safeValue = isPlainObject(value) ? value : {};
    return {
      id: asText(safeValue.id),
      ownerKey: asText(safeValue.ownerKey),
      name: asText(safeValue.name),
      title: asText(safeValue.title),
      greeting: asText(safeValue.greeting),
      contact: asText(safeValue.contact),
      email: asText(safeValue.email),
      phone: asText(safeValue.phone),
    };
  }

  function cloneSummary(value) {
    const safeValue = isPlainObject(value) ? value : {};
    return {
      assignedTo: asText(safeValue.assignedTo),
      lifecycleStatus: asText(safeValue.lifecycleStatus),
      lastCaseSummary: asText(safeValue.lastCaseSummary),
      customerSince: asText(safeValue.customerSince),
      interactionCount: Number(safeValue.interactionCount || 0) || 0,
      engagementScore: Number(safeValue.engagementScore || 0) || 0,
      keyNote: asText(safeValue.keyNote),
      customerContext: asText(safeValue.customerContext),
      internalNote: asText(safeValue.internalNote),
      responseAngle: asText(safeValue.responseAngle),
      escalationRule: asText(safeValue.escalationRule),
      medicalContext: asText(safeValue.medicalContext),
      operatorCue: asText(safeValue.operatorCue),
      situationSummary: asText(safeValue.situationSummary),
      medicalFlags: cloneTextArray(safeValue.medicalFlags),
    };
  }

  function cloneCustomerIntelligence(value) {
    const safeValue = isPlainObject(value) ? value : {};
    return {
      journey_stage: asText(safeValue.journey_stage || safeValue.journeyStage),
      vip_status: asText(safeValue.vip_status || safeValue.vipStatus),
      lifetime_value: Number(safeValue.lifetime_value != null ? safeValue.lifetime_value : safeValue.lifetimeValue || 0) || 0,
      relationship_sensitivity: asText(
        safeValue.relationship_sensitivity || safeValue.relationshipSensitivity
      ),
      duplicate_state: asText(safeValue.duplicate_state || safeValue.duplicateState),
      duplicate_note: asText(safeValue.duplicate_note || safeValue.duplicateNote),
      consent_status: cloneConsentStatus(safeValue.consent_status || safeValue.consentStatus),
      insurance_context: asText(safeValue.insurance_context || safeValue.insuranceContext),
      treatment_context: asText(safeValue.treatment_context || safeValue.treatmentContext),
      planned_treatment: asText(safeValue.planned_treatment || safeValue.plannedTreatment),
      recent_treatments: cloneTextArray(safeValue.recent_treatments || safeValue.recentTreatments),
      return_visit_state: asText(safeValue.return_visit_state || safeValue.returnVisitState),
      journey_events: cloneJourneyEvents(safeValue.journey_events || safeValue.journeyEvents),
    };
  }

  function cloneCollaborationState(value) {
    const safeValue = isPlainObject(value) ? value : {};
    return {
      active_viewers: cloneCollaborators(safeValue.active_viewers || safeValue.activeViewers),
      active_editor: asText(safeValue.active_editor || safeValue.activeEditor),
      draft_owner: asText(safeValue.draft_owner || safeValue.draftOwner),
      draft_updated_at: asText(safeValue.draft_updated_at || safeValue.draftUpdatedAt),
      collision_state: asText(safeValue.collision_state || safeValue.collisionState),
      handoff_request: asText(safeValue.handoff_request || safeValue.handoffRequest),
      handoff_target: asText(safeValue.handoff_target || safeValue.handoffTarget),
      handoff_note: asText(safeValue.handoff_note || safeValue.handoffNote),
      handoff_status_detail: asText(
        safeValue.handoff_status_detail || safeValue.handoffStatusDetail
      ),
    };
  }

  function deriveCollaborationStatusDetail(collaboration) {
    const safeCollaboration = cloneCollaborationState(collaboration);
    const request = asText(safeCollaboration.handoff_request).toLowerCase();
    const target = asText(safeCollaboration.handoff_target);
    const note = asText(safeCollaboration.handoff_note);
    if (request === 'pending' && target) {
      return note ? `Väntar på ${target} · ${note}` : `Väntar på ${target}`;
    }
    if (request === 'accepted' && target) {
      return note ? `${target} tog över · ${note}` : `${target} tog över`;
    }
    if (request === 'reclaimed') {
      return note ? `Återtagen · ${note}` : 'Återtagen av nuvarande ägare';
    }
    if (request === 'draft') {
      return note ? `Handoff förbereds · ${note}` : 'Handoff förbereds';
    }
    if (note) return note;
    return '';
  }

  function normalizeCollaborationState(value, dependencies) {
    const collaboration = cloneCollaborationState(value);
    const actorLabel = asText(
      dependencies && typeof dependencies.getActorLabel === 'function'
        ? dependencies.getActorLabel()
        : ''
    ).toLowerCase();
    const activeEditor = asText(collaboration.active_editor);
    let viewers = cloneCollaborators(collaboration.active_viewers);
    if (
      activeEditor &&
      !viewers.some((entry) => asText(entry.name).toLowerCase() === activeEditor.toLowerCase())
    ) {
      viewers = [
        {
          id: `collab-${activeEditor.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'editor'}`,
          name: activeEditor,
          action: 'editing',
          location: 'Svarsstudio',
          duration_seconds: 0,
        },
        ...viewers,
      ].slice(0, 6);
    }
    collaboration.active_viewers = viewers;
    if (!collaboration.draft_owner && activeEditor) {
      collaboration.draft_owner = activeEditor;
    }
    const explicitCollision = asText(collaboration.collision_state).toLowerCase();
    if (!explicitCollision || explicitCollision === 'auto') {
      if (activeEditor && activeEditor.toLowerCase() !== actorLabel) {
        collaboration.collision_state = 'editing';
      } else if (
        viewers.some((entry) => asText(entry.name).toLowerCase() !== actorLabel)
      ) {
        collaboration.collision_state = 'viewing';
      } else {
        collaboration.collision_state = 'none';
      }
    } else if (
      !['none', 'viewing', 'editing', 'typing', 'pending_handoff'].includes(explicitCollision)
    ) {
      collaboration.collision_state = 'none';
    } else {
      collaboration.collision_state = explicitCollision;
    }
    if (!collaboration.handoff_status_detail) {
      collaboration.handoff_status_detail = deriveCollaborationStatusDetail(collaboration);
    }
    return collaboration;
  }

  function cloneStudioState(value) {
    const safeValue = isPlainObject(value) ? value : {};
    return {
      isOpen: safeValue.isOpen === true,
      activeDialog: asText(safeValue.activeDialog),
      strategyKey: asText(safeValue.strategyKey),
      strategyLabel: asText(safeValue.strategyLabel),
      strategyReason: asText(safeValue.strategyReason),
      objective: asText(safeValue.objective),
      desiredOutcome: asText(safeValue.desiredOutcome),
      guardrail: asText(safeValue.guardrail),
      postSendState: asText(safeValue.postSendState),
      postSendQueue: asText(safeValue.postSendQueue),
      postSendWaitingOn: asText(safeValue.postSendWaitingOn),
      postSendOwner: asText(safeValue.postSendOwner),
      postSendFollowUpDueAt: asText(safeValue.postSendFollowUpDueAt),
      recommendedTool: asText(safeValue.recommendedTool),
      templateKey: asText(safeValue.templateKey),
      templateLabel: asText(safeValue.templateLabel),
      templateSummary: asText(safeValue.templateSummary),
      templateDraftBody: asText(safeValue.templateDraftBody),
      currentDraftBody: asText(safeValue.currentDraftBody),
      editedDraftBody: asText(safeValue.editedDraftBody),
      draftSource: asText(safeValue.draftSource),
      sendReady: safeValue.sendReady === true,
      readinessTone: asText(safeValue.readinessTone),
      readinessLabel: asText(safeValue.readinessLabel),
      readinessSummary: asText(safeValue.readinessSummary),
      readinessState: asText(safeValue.readinessState),
      policyStatus: asText(safeValue.policyStatus),
      wordCount: Number(safeValue.wordCount || 0) || 0,
      selectedSignatureId: asText(safeValue.selectedSignatureId),
      signatureLabel: asText(safeValue.signatureLabel),
      signatureGreeting: asText(safeValue.signatureGreeting),
      signatureProfiles: cloneSignatureProfiles(safeValue.signatureProfiles),
      signatureEditorProfileId: asText(safeValue.signatureEditorProfileId),
      signatureEditorDraft: cloneSignatureEditorDraft(safeValue.signatureEditorDraft),
      toneFilters: cloneTextArray(safeValue.toneFilters),
      aiVersion: Number(safeValue.aiVersion || 0) || 0,
      aiConfidence: Number(safeValue.aiConfidence || 0) || 0,
      aiContextSummary: asText(safeValue.aiContextSummary),
      aiContextUsed: cloneTextArray(safeValue.aiContextUsed),
      aiSuggestionLabel: asText(safeValue.aiSuggestionLabel),
      aiSuggestionReason: asText(safeValue.aiSuggestionReason),
      aiSuggestionBody: asText(safeValue.aiSuggestionBody),
      aiLastGeneratedAt: asText(safeValue.aiLastGeneratedAt),
      aiAppliedAt: asText(safeValue.aiAppliedAt),
      snoozePresetKey: asText(safeValue.snoozePresetKey),
      snoozeUntilAt: asText(safeValue.snoozeUntilAt),
      followUpMode: asText(safeValue.followUpMode),
      waitUntilReply: safeValue.waitUntilReply === true,
      recurringCadence: asText(safeValue.recurringCadence),
      followUpSequenceKey: asText(safeValue.followUpSequenceKey),
      followUpSequenceStep: Number(safeValue.followUpSequenceStep || 0) || 0,
      followUpSequenceLabel: asText(safeValue.followUpSequenceLabel),
      followUpFallbackAction: asText(safeValue.followUpFallbackAction),
      slaGuardStatus: asText(safeValue.slaGuardStatus),
      slaGuardMessage: asText(safeValue.slaGuardMessage),
      scheduledSendAt: asText(safeValue.scheduledSendAt),
      deleteRequestedAt: asText(safeValue.deleteRequestedAt),
      deletedAt: asText(safeValue.deletedAt),
      deletedReason: asText(safeValue.deletedReason),
      isDeleted: safeValue.isDeleted === true,
      lastRewriteAction: asText(safeValue.lastRewriteAction),
      lastRewriteAt: asText(safeValue.lastRewriteAt),
      lastAppliedTemplateKey: asText(safeValue.lastAppliedTemplateKey),
      lastAppliedTemplateAt: asText(safeValue.lastAppliedTemplateAt),
      lastEditedAt: asText(safeValue.lastEditedAt),
      lastSentAt: asText(safeValue.lastSentAt),
    };
  }

  function hasActiveStudioState(value) {
    const safeValue = cloneStudioState(value);
    return Boolean(
      safeValue.isOpen === true ||
        safeValue.strategyKey ||
      safeValue.currentDraftBody ||
        safeValue.templateDraftBody ||
        safeValue.lastSentAt ||
        safeValue.selectedSignatureId ||
        safeValue.lastRewriteAction ||
        safeValue.aiSuggestionBody ||
        safeValue.activeDialog ||
        safeValue.snoozeUntilAt ||
        safeValue.scheduledSendAt ||
        safeValue.deletedAt
    );
  }

  function clonePresentation(seed = {}) {
    const safeSeed = isPlainObject(seed) ? seed : {};
    return {
      ...safeSeed,
      previewMessages: cloneMessages(safeSeed.previewMessages),
      previewHistory: cloneHistory(safeSeed.previewHistory),
      previewSummary: cloneSummary(safeSeed.previewSummary),
      previewStudio: cloneStudioState(safeSeed.previewStudio),
      medicalFlags: cloneTextArray(safeSeed.medicalFlags),
      suggestedSlots: cloneTextArray(safeSeed.suggestedSlots),
      consentStatus: cloneConsentStatus(safeSeed.consentStatus),
      recentTreatments: cloneTextArray(safeSeed.recentTreatments),
      journeyEvents: cloneJourneyEvents(safeSeed.journeyEvents),
      activeViewers: cloneCollaborators(safeSeed.activeViewers),
    };
  }

  function sanitizeScenario(value, dependencies) {
    if (dependencies && typeof dependencies.sanitizeScenario === 'function') {
      return dependencies.sanitizeScenario(value);
    }
    const normalized = asText(value).toLowerCase();
    return SCENARIOS.includes(normalized) ? normalized : 'all';
  }

  function sanitizeCenterTab(value) {
    const normalized = asText(value, 'conversation').toLowerCase();
    return CENTER_TABS.includes(normalized) ? normalized : 'conversation';
  }

  function sanitizeSidebarTab(value) {
    const normalized = asText(value, 'overview').toLowerCase();
    return SIDEBAR_TABS.includes(normalized) ? normalized : 'overview';
  }

  function sanitizeSavedView(value) {
    const normalized = asText(value, 'all').toLowerCase();
    return SAVED_VIEWS.includes(normalized) ? normalized : 'all';
  }

  function sanitizeFollowUpFilter(value) {
    const normalized = asText(value, 'all').toLowerCase();
    return FOLLOW_UP_FILTERS.includes(normalized) ? normalized : 'all';
  }

  function sanitizeWorklistDensity(value) {
    const normalized = asText(value, 'regular').toLowerCase();
    return WORKLIST_DENSITIES.includes(normalized) ? normalized : 'regular';
  }

  function sanitizeDisclosureMode(value) {
    const normalized = asText(value, 'progressive').toLowerCase();
    return DISCLOSURE_MODES.includes(normalized) ? normalized : 'progressive';
  }

  function sanitizeSearchQuery(value, dependencies) {
    if (dependencies && typeof dependencies.sanitizeSearchQuery === 'function') {
      return dependencies.sanitizeSearchQuery(value);
    }
    return asText(value);
  }

  function getTimestampOffset(hours, minutes, dependencies) {
    if (dependencies && typeof dependencies.getTimestampOffset === 'function') {
      return dependencies.getTimestampOffset(hours, minutes);
    }
    return new Date().toISOString();
  }

  function createThreadCase(seed = {}, dependencies) {
    const presentation = clonePresentation(seed);
    const customerIntelligence = cloneCustomerIntelligence({
      journeyStage: presentation.journeyStage,
      vipStatus: presentation.vipStatus,
      lifetimeValue: presentation.lifetimeValue,
      relationshipSensitivity: presentation.relationshipSensitivity,
      duplicateState: presentation.duplicateState,
      duplicateNote: presentation.duplicateNote,
      consentStatus: presentation.consentStatus,
      insuranceContext: presentation.insuranceContext,
      treatmentContext: presentation.treatmentContext,
      plannedTreatment: presentation.plannedTreatment,
      recentTreatments: presentation.recentTreatments,
      returnVisitState: presentation.returnVisitState,
      journeyEvents: presentation.journeyEvents,
    });
    const collaboration = normalizeCollaborationState(
      {
        activeViewers: presentation.activeViewers,
        activeEditor: presentation.activeEditor,
        draftOwner: presentation.draftOwner,
        draftUpdatedAt: presentation.draftUpdatedAt,
        collisionState: presentation.collisionState,
        handoffRequest: presentation.handoffRequest,
        handoffTarget: presentation.handoffTarget,
        handoffNote: presentation.handoffNote,
        handoffStatusDetail: presentation.handoffStatusDetail,
      },
      dependencies
    );
    return {
      id: asText(presentation.conversationId),
      patient: {
        name: asText(presentation.sender, 'Okänd kund'),
        customer_since: asText(presentation.previewSummary.customerSince),
        engagement_score: Number(presentation.previewSummary.engagementScore || 0) || 0,
      },
      thread: {
        subject: asText(presentation.subject, '(utan ämne)'),
        latest_inbound_preview: asText(presentation.latestInboundPreview),
        last_inbound_at: asText(presentation.lastInboundAt),
        priority_level: asText(presentation.priorityLevel),
        tone: asText(presentation.tone),
        confidence_level: asText(presentation.confidenceLevel),
        preview_draft_body: asText(presentation.previewDraftBody),
        messages: cloneMessages(presentation.previewMessages),
        suggested_slots: cloneTextArray(presentation.suggestedSlots),
      },
      intent: asText(presentation.intent),
      case_type: asText(presentation.caseType),
      queue: sanitizeScenario(presentation.workflowLane || 'all', dependencies),
      stage: asText(presentation.lifecycleStage),
      owner: asText(presentation.owner),
      handoff_status: asText(presentation.handoffStatus || (presentation.owner ? 'assigned' : 'unassigned')),
      waiting_on: asText(presentation.waitingOn || 'none', 'none'),
      blocker_type: presentation.needsMedicalReview === true ? 'medical_review' : asText(presentation.medicalBlocker),
      follow_up_due_at: asText(presentation.followUpDueAt),
      follow_up_mode: asText(presentation.followUpMode),
      wait_until_reply: presentation.waitUntilReply === true,
      recurring_cadence: asText(presentation.recurringCadence),
      follow_up_sequence_key: asText(presentation.followUpSequenceKey),
      follow_up_sequence_step: Number(presentation.followUpSequenceStep || 0) || 0,
      follow_up_sequence_label: asText(presentation.followUpSequenceLabel),
      follow_up_fallback_action: asText(presentation.followUpFallbackAction),
      sla_guard_status: asText(presentation.slaGuardStatus),
      sla_guard_message: asText(presentation.slaGuardMessage),
      booking_state: asText(presentation.bookingState || 'not_relevant', 'not_relevant'),
      medical_review_state: presentation.needsMedicalReview === true ? 'pending' : 'clear',
      urgency_score: Number(presentation.urgencyScore || 0) || 0,
      risk_level: asText(presentation.escalationRisk || 'low', 'low'),
      next_best_action: {
        label: asText(presentation.nextActionLabel),
        summary: asText(presentation.nextActionSummary),
      },
      recommended_tool: asText(presentation.recommendedTool),
      last_action: {
        label: asText(presentation.lastActionTakenLabel),
        at: asText(presentation.lastActionTakenAt),
      },
      draft_state: {
        label: asText(presentation.draftStateLabel),
        body: asText(presentation.previewDraftBody),
      },
      summary: {
        ...presentation.previewSummary,
        keyNote: asText(presentation.keyNote),
        customerContext: asText(presentation.customerContext),
        internalNote: asText(presentation.internalNote),
        responseAngle: asText(presentation.responseAngle),
        escalationRule: asText(presentation.escalationRule),
        medicalContext: asText(presentation.medicalContext),
        operatorCue: asText(presentation.operatorCue),
        situationSummary: asText(presentation.situationSummary),
        medicalFlags: cloneTextArray(presentation.medicalFlags),
      },
      customer_intelligence: customerIntelligence,
      collaboration,
      history: cloneHistory(presentation.previewHistory),
      studio: cloneStudioState(presentation.previewStudio),
      presentation,
    };
  }

  function cloneThreadCase(record) {
    const safeRecord = isPlainObject(record) ? record : {};
    const preferredStudioState = hasActiveStudioState(safeRecord.studio)
      ? safeRecord.studio
      : safeRecord.presentation?.previewStudio;
    return {
      ...safeRecord,
      patient: { ...(safeRecord.patient || {}) },
      thread: {
        ...(safeRecord.thread || {}),
        messages: cloneMessages(safeRecord.thread?.messages),
        suggested_slots: cloneTextArray(safeRecord.thread?.suggested_slots),
      },
      next_best_action: { ...(safeRecord.next_best_action || {}) },
      last_action: { ...(safeRecord.last_action || {}) },
      draft_state: { ...(safeRecord.draft_state || {}) },
      summary: cloneSummary(safeRecord.summary),
      customer_intelligence: cloneCustomerIntelligence(safeRecord.customer_intelligence),
      collaboration: cloneCollaborationState(safeRecord.collaboration),
      history: cloneHistory(safeRecord.history),
      studio: cloneStudioState(preferredStudioState),
      presentation: clonePresentation(safeRecord.presentation),
    };
  }

  function legacyRowFromThreadCase(record) {
    const safeRecord = cloneThreadCase(record);
    const summary = cloneSummary(safeRecord.summary);
    const customerIntelligence = cloneCustomerIntelligence(safeRecord.customer_intelligence);
    const collaboration = normalizeCollaborationState(safeRecord.collaboration);
    const preferredStudioState = hasActiveStudioState(safeRecord.studio)
      ? safeRecord.studio
      : safeRecord.presentation?.previewStudio;
    return {
      ...safeRecord.presentation,
      conversationId: safeRecord.id,
      sender: asText(safeRecord.patient.name, 'Okänd kund'),
      subject: asText(safeRecord.thread.subject, '(utan ämne)'),
      latestInboundPreview: asText(safeRecord.thread.latest_inbound_preview),
      lastInboundAt: asText(safeRecord.thread.last_inbound_at),
      priorityLevel: asText(safeRecord.thread.priority_level),
      tone: asText(safeRecord.thread.tone),
      confidenceLevel: asText(safeRecord.thread.confidence_level),
      previewDraftBody: asText(safeRecord.draft_state.body || safeRecord.thread.preview_draft_body),
      previewMessages: cloneMessages(safeRecord.thread.messages),
      suggestedSlots: cloneTextArray(safeRecord.thread.suggested_slots),
      intent: asText(safeRecord.intent),
      caseType: asText(safeRecord.case_type),
      workflowLane: sanitizeScenario(safeRecord.queue || 'all'),
      lifecycleStage: asText(safeRecord.stage),
      owner: asText(safeRecord.owner),
      handoffStatus: asText(safeRecord.handoff_status),
      waitingOn: asText(safeRecord.waiting_on, 'none'),
      medicalBlocker: asText(safeRecord.blocker_type),
      followUpDueAt: asText(safeRecord.follow_up_due_at),
      followUpMode: asText(safeRecord.follow_up_mode),
      waitUntilReply: safeRecord.wait_until_reply === true,
      recurringCadence: asText(safeRecord.recurring_cadence),
      followUpSequenceKey: asText(safeRecord.follow_up_sequence_key),
      followUpSequenceStep: Number(safeRecord.follow_up_sequence_step || 0) || 0,
      followUpSequenceLabel: asText(safeRecord.follow_up_sequence_label),
      followUpFallbackAction: asText(safeRecord.follow_up_fallback_action),
      slaGuardStatus: asText(safeRecord.sla_guard_status),
      slaGuardMessage: asText(safeRecord.sla_guard_message),
      bookingState: asText(safeRecord.booking_state, 'not_relevant'),
      needsMedicalReview: safeRecord.medical_review_state === 'pending',
      urgencyScore: Number(safeRecord.urgency_score || 0) || 0,
      escalationRisk: asText(safeRecord.risk_level || 'low', 'low'),
      nextActionLabel: asText(safeRecord.next_best_action?.label),
      nextActionSummary: asText(safeRecord.next_best_action?.summary),
      recommendedTool: asText(safeRecord.recommended_tool),
      lastActionTakenLabel: asText(safeRecord.last_action?.label),
      lastActionTakenAt: asText(safeRecord.last_action?.at),
      draftStateLabel: asText(safeRecord.draft_state?.label),
      previewStudio: cloneStudioState(preferredStudioState),
      keyNote: asText(summary.keyNote),
      customerContext: asText(summary.customerContext),
      internalNote: asText(summary.internalNote),
      responseAngle: asText(summary.responseAngle),
      escalationRule: asText(summary.escalationRule),
      medicalContext: asText(summary.medicalContext),
      operatorCue: asText(summary.operatorCue),
      situationSummary: asText(summary.situationSummary),
      medicalFlags: cloneTextArray(summary.medicalFlags),
      journeyStage: asText(customerIntelligence.journey_stage),
      vipStatus: asText(customerIntelligence.vip_status),
      lifetimeValue: Number(customerIntelligence.lifetime_value || 0) || 0,
      relationshipSensitivity: asText(customerIntelligence.relationship_sensitivity),
      duplicateState: asText(customerIntelligence.duplicate_state),
      duplicateNote: asText(customerIntelligence.duplicate_note),
      consentStatus: cloneConsentStatus(customerIntelligence.consent_status),
      insuranceContext: asText(customerIntelligence.insurance_context),
      treatmentContext: asText(customerIntelligence.treatment_context),
      plannedTreatment: asText(customerIntelligence.planned_treatment),
      recentTreatments: cloneTextArray(customerIntelligence.recent_treatments),
      returnVisitState: asText(customerIntelligence.return_visit_state),
      journeyEvents: cloneJourneyEvents(customerIntelligence.journey_events),
      activeViewers: cloneCollaborators(collaboration.active_viewers),
      activeEditor: asText(collaboration.active_editor),
      draftOwner: asText(collaboration.draft_owner),
      draftUpdatedAt: asText(collaboration.draft_updated_at),
      collisionState: asText(collaboration.collision_state),
      handoffRequest: asText(collaboration.handoff_request),
      handoffTarget: asText(collaboration.handoff_target),
      handoffNote: asText(collaboration.handoff_note),
      handoffStatusDetail: asText(collaboration.handoff_status_detail),
      previewHistory: cloneHistory(safeRecord.history),
      previewSummary: {
        ...summary,
        assignedTo: asText(summary.assignedTo || safeRecord.owner),
        customerSince: asText(summary.customerSince || safeRecord.patient.customer_since),
        engagementScore:
          Number(summary.engagementScore || safeRecord.patient.engagement_score || 0) || 0,
      },
    };
  }

  function deriveBlockerTypeFromLegacyRow(row) {
    const waitingOn = asText(row.waitingOn).toLowerCase();
    if (row.needsMedicalReview === true || waitingOn === 'clinic') return 'medical_review';
    if (waitingOn === 'customer') return 'waiting_customer';
    if (waitingOn === 'slots') return 'waiting_slots';
    if (!asText(row.owner)) return 'waiting_owner';
    return asText(row.medicalBlocker || row.blockerSummary);
  }

  function syncThreadCaseFromDerivedRow(record, row, dependencies) {
    const nextRecord = cloneThreadCase(record);
    const summary = cloneSummary(nextRecord.summary);
    const customerIntelligence = cloneCustomerIntelligence(nextRecord.customer_intelligence);
    const collaboration = cloneCollaborationState(nextRecord.collaboration);
    nextRecord.queue = sanitizeScenario(row.workflowLane || nextRecord.queue);
    nextRecord.stage = asText(row.lifecycleStage || row.lifecycleStageLabel || nextRecord.stage);
    nextRecord.owner = asText(row.owner || nextRecord.owner);
    nextRecord.handoff_status = asText(row.handoffStatus || nextRecord.handoff_status);
    nextRecord.waiting_on = asText(row.waitingOn || nextRecord.waiting_on, 'none');
    nextRecord.blocker_type = deriveBlockerTypeFromLegacyRow(row);
    nextRecord.follow_up_due_at = asText(row.followUpDueAt || nextRecord.follow_up_due_at);
    nextRecord.follow_up_mode = asText(row.followUpMode || nextRecord.follow_up_mode);
    nextRecord.wait_until_reply = row.waitUntilReply === true;
    nextRecord.recurring_cadence = asText(row.recurringCadence || nextRecord.recurring_cadence);
    nextRecord.follow_up_sequence_key = asText(row.followUpSequenceKey || nextRecord.follow_up_sequence_key);
    nextRecord.follow_up_sequence_step =
      Number(row.followUpSequenceStep != null ? row.followUpSequenceStep : nextRecord.follow_up_sequence_step || 0) || 0;
    nextRecord.follow_up_sequence_label = asText(row.followUpSequenceLabel || nextRecord.follow_up_sequence_label);
    nextRecord.follow_up_fallback_action = asText(
      row.followUpFallbackAction || nextRecord.follow_up_fallback_action
    );
    nextRecord.sla_guard_status = asText(row.slaGuardStatus || nextRecord.sla_guard_status);
    nextRecord.sla_guard_message = asText(row.slaGuardMessage || nextRecord.sla_guard_message);
    nextRecord.booking_state = asText(row.bookingState || nextRecord.booking_state, 'not_relevant');
    nextRecord.medical_review_state = row.needsMedicalReview === true ? 'pending' : 'clear';
    nextRecord.urgency_score = Number(row.urgencyScore || nextRecord.urgency_score || 0) || 0;
    nextRecord.risk_level = asText(row.escalationRisk || nextRecord.risk_level, 'low');
    nextRecord.next_best_action = {
      label: asText(row.nextActionLabel || nextRecord.next_best_action?.label),
      summary: asText(row.nextActionSummary || nextRecord.next_best_action?.summary),
    };
    nextRecord.recommended_tool = asText(row.recommendedTool || nextRecord.recommended_tool);
    nextRecord.last_action = {
      label: asText(row.lastActionTakenLabel || nextRecord.last_action?.label),
      at: asText(row.lastActionTakenAt || nextRecord.last_action?.at),
    };
    nextRecord.draft_state = {
      ...nextRecord.draft_state,
      label: asText(row.draftStateLabel || nextRecord.draft_state?.label),
      body: asText(nextRecord.draft_state?.body || row.previewDraftBody || nextRecord.thread.preview_draft_body),
    };
    nextRecord.studio = {
      ...cloneStudioState(nextRecord.studio),
      ...cloneStudioState(row.previewStudio),
    };
    nextRecord.case_type = asText(row.caseType || nextRecord.case_type);
    nextRecord.intent = asText(row.intent || nextRecord.intent);
    nextRecord.thread = {
      ...nextRecord.thread,
      subject: asText(row.subject || nextRecord.thread.subject, '(utan ämne)'),
      latest_inbound_preview: asText(row.latestInboundPreview || nextRecord.thread.latest_inbound_preview),
      last_inbound_at: asText(row.lastInboundAt || nextRecord.thread.last_inbound_at),
      priority_level: asText(row.priorityLevel || nextRecord.thread.priority_level),
      tone: asText(row.tone || nextRecord.thread.tone),
      confidence_level: asText(row.confidenceLevel || nextRecord.thread.confidence_level),
      preview_draft_body: asText(nextRecord.draft_state.body || row.previewDraftBody || nextRecord.thread.preview_draft_body),
      messages: cloneMessages(row.previewMessages || nextRecord.thread.messages),
      suggested_slots: cloneTextArray(row.suggestedSlots || nextRecord.thread.suggested_slots),
    };
    nextRecord.history = cloneHistory(row.previewHistory || nextRecord.history);
    nextRecord.summary = {
      ...summary,
      ...cloneSummary(row.previewSummary || summary),
      assignedTo: asText(row.previewSummary?.assignedTo || row.ownerDisplay || nextRecord.owner),
      lastCaseSummary: asText(row.previewSummary?.lastCaseSummary || row.situationSummary || summary.lastCaseSummary),
      customerSince: asText(row.previewSummary?.customerSince || summary.customerSince || nextRecord.patient.customer_since),
      engagementScore:
        Number(
          row.previewSummary?.engagementScore != null
            ? row.previewSummary.engagementScore
            : summary.engagementScore || nextRecord.patient.engagement_score || 0
        ) || 0,
      keyNote: asText(row.keyNote || summary.keyNote),
      customerContext: asText(row.customerContext || summary.customerContext),
      internalNote: asText(row.internalNote || summary.internalNote),
      responseAngle: asText(row.responseAngle || summary.responseAngle),
      escalationRule: asText(row.escalationRule || summary.escalationRule),
      medicalContext: asText(row.medicalContext || summary.medicalContext),
      operatorCue: asText(row.operatorCue || summary.operatorCue),
      situationSummary: asText(row.situationSummary || summary.situationSummary),
      medicalFlags: cloneTextArray(row.medicalFlags || summary.medicalFlags),
      interactionCount:
        Number(
          row.previewSummary?.interactionCount != null
            ? row.previewSummary.interactionCount
            : summary.interactionCount || 0
        ) || 0,
      lifecycleStatus: asText(row.previewSummary?.lifecycleStatus || summary.lifecycleStatus),
    };
    nextRecord.customer_intelligence = {
      ...customerIntelligence,
      journey_stage: asText(row.journeyStage || customerIntelligence.journey_stage),
      vip_status: asText(row.vipStatus || customerIntelligence.vip_status),
      lifetime_value:
        Number(row.lifetimeValue != null ? row.lifetimeValue : customerIntelligence.lifetime_value || 0) || 0,
      relationship_sensitivity: asText(
        row.relationshipSensitivity || customerIntelligence.relationship_sensitivity
      ),
      duplicate_state: asText(row.duplicateState || customerIntelligence.duplicate_state),
      duplicate_note: asText(row.duplicateNote || customerIntelligence.duplicate_note),
      consent_status: cloneConsentStatus(row.consentStatus || customerIntelligence.consent_status),
      insurance_context: asText(row.insuranceContext || customerIntelligence.insurance_context),
      treatment_context: asText(row.treatmentContext || customerIntelligence.treatment_context),
      planned_treatment: asText(row.plannedTreatment || customerIntelligence.planned_treatment),
      recent_treatments: cloneTextArray(row.recentTreatments || customerIntelligence.recent_treatments),
      return_visit_state: asText(row.returnVisitState || customerIntelligence.return_visit_state),
      journey_events: cloneJourneyEvents(row.journeyEvents || customerIntelligence.journey_events),
    };
    nextRecord.collaboration = normalizeCollaborationState(
      {
        ...collaboration,
        activeViewers: row.activeViewers || collaboration.active_viewers,
        activeEditor: row.activeEditor || collaboration.active_editor,
        draftOwner: row.draftOwner || collaboration.draft_owner,
        draftUpdatedAt: row.draftUpdatedAt || collaboration.draft_updated_at,
        collisionState: row.collisionState || collaboration.collision_state,
        handoffRequest: row.handoffRequest || collaboration.handoff_request,
        handoffTarget: row.handoffTarget || collaboration.handoff_target,
        handoffNote: row.handoffNote || collaboration.handoff_note,
        handoffStatusDetail:
          row.handoffStatusDetail || collaboration.handoff_status_detail,
      },
      dependencies
    );
    nextRecord.patient = {
      ...nextRecord.patient,
      name: asText(row.sender || nextRecord.patient.name, 'Okänd kund'),
      customer_since: asText(nextRecord.summary.customerSince || nextRecord.patient.customer_since),
      engagement_score: Number(nextRecord.summary.engagementScore || nextRecord.patient.engagement_score || 0) || 0,
    };
    nextRecord.presentation = {
      ...clonePresentation(nextRecord.presentation),
      ...clonePresentation(row),
      conversationId: nextRecord.id,
      sender: nextRecord.patient.name,
      subject: nextRecord.thread.subject,
      caseType: nextRecord.case_type,
      intent: nextRecord.intent,
      owner: nextRecord.owner,
      handoffStatus: nextRecord.handoff_status,
      waitingOn: nextRecord.waiting_on,
      medicalBlocker: asText(row.medicalBlocker || nextRecord.blocker_type),
      workflowLane: nextRecord.queue,
      lifecycleStage: nextRecord.stage,
      followUpDueAt: nextRecord.follow_up_due_at,
      followUpMode: nextRecord.follow_up_mode,
      waitUntilReply: nextRecord.wait_until_reply === true,
      recurringCadence: nextRecord.recurring_cadence,
      followUpSequenceKey: nextRecord.follow_up_sequence_key,
      followUpSequenceStep: nextRecord.follow_up_sequence_step,
      followUpSequenceLabel: nextRecord.follow_up_sequence_label,
      followUpFallbackAction: nextRecord.follow_up_fallback_action,
      slaGuardStatus: nextRecord.sla_guard_status,
      slaGuardMessage: nextRecord.sla_guard_message,
      bookingState: nextRecord.booking_state,
      needsMedicalReview: nextRecord.medical_review_state === 'pending',
      urgencyScore: nextRecord.urgency_score,
      escalationRisk: nextRecord.risk_level,
      nextActionLabel: nextRecord.next_best_action.label,
      nextActionSummary: nextRecord.next_best_action.summary,
      recommendedTool: nextRecord.recommended_tool,
      lastActionTakenLabel: nextRecord.last_action.label,
      lastActionTakenAt: nextRecord.last_action.at,
      draftStateLabel: nextRecord.draft_state.label,
      previewDraftBody: nextRecord.draft_state.body,
      journeyStage: nextRecord.customer_intelligence.journey_stage,
      vipStatus: nextRecord.customer_intelligence.vip_status,
      lifetimeValue: nextRecord.customer_intelligence.lifetime_value,
      relationshipSensitivity: nextRecord.customer_intelligence.relationship_sensitivity,
      duplicateState: nextRecord.customer_intelligence.duplicate_state,
      duplicateNote: nextRecord.customer_intelligence.duplicate_note,
      consentStatus: cloneConsentStatus(nextRecord.customer_intelligence.consent_status),
      insuranceContext: nextRecord.customer_intelligence.insurance_context,
      treatmentContext: nextRecord.customer_intelligence.treatment_context,
      plannedTreatment: nextRecord.customer_intelligence.planned_treatment,
      recentTreatments: cloneTextArray(nextRecord.customer_intelligence.recent_treatments),
      returnVisitState: nextRecord.customer_intelligence.return_visit_state,
      journeyEvents: cloneJourneyEvents(nextRecord.customer_intelligence.journey_events),
      activeViewers: cloneCollaborators(nextRecord.collaboration.active_viewers),
      activeEditor: nextRecord.collaboration.active_editor,
      draftOwner: nextRecord.collaboration.draft_owner,
      draftUpdatedAt: nextRecord.collaboration.draft_updated_at,
      collisionState: nextRecord.collaboration.collision_state,
      handoffRequest: nextRecord.collaboration.handoff_request,
      handoffTarget: nextRecord.collaboration.handoff_target,
      handoffNote: nextRecord.collaboration.handoff_note,
      handoffStatusDetail: nextRecord.collaboration.handoff_status_detail,
      previewStudio: cloneStudioState(nextRecord.studio),
      previewMessages: cloneMessages(nextRecord.thread.messages),
      previewHistory: cloneHistory(nextRecord.history),
      suggestedSlots: cloneTextArray(nextRecord.thread.suggested_slots),
      previewSummary: cloneSummary(nextRecord.summary),
    };
    return nextRecord;
  }

  function applyLegacyPatchToThreadCase(record, patch, dependencies) {
    const nextRecord = cloneThreadCase(record);
    const safePatch = isPlainObject(patch) ? patch : {};
    const summaryPatch = cloneSummary(safePatch.previewSummary);
    const nextSummary = cloneSummary(nextRecord.summary);
    const nextPresentation = clonePresentation(nextRecord.presentation);
    const nextCustomerIntelligence = cloneCustomerIntelligence(nextRecord.customer_intelligence);
    const nextCollaboration = cloneCollaborationState(nextRecord.collaboration);
    const studioPatch = cloneStudioState(safePatch.previewStudio);

    nextPresentation.conversationId = nextRecord.id;
    Object.keys(safePatch).forEach((key) => {
      if (key === 'previewSummary') return;
      if (key === 'previewStudio') return;
      if (key === 'previewMessages') {
        nextPresentation.previewMessages = cloneMessages(safePatch.previewMessages);
        nextRecord.thread.messages = cloneMessages(safePatch.previewMessages);
        return;
      }
      if (key === 'previewHistory') {
        nextPresentation.previewHistory = cloneHistory(safePatch.previewHistory);
        nextRecord.history = cloneHistory(safePatch.previewHistory);
        return;
      }
      if (key === 'medicalFlags') {
        nextPresentation.medicalFlags = cloneTextArray(safePatch.medicalFlags);
        nextSummary.medicalFlags = cloneTextArray(safePatch.medicalFlags);
        return;
      }
      if (key === 'suggestedSlots') {
        nextPresentation.suggestedSlots = cloneTextArray(safePatch.suggestedSlots);
        nextRecord.thread.suggested_slots = cloneTextArray(safePatch.suggestedSlots);
        return;
      }
      if (key === 'consentStatus') {
        nextPresentation.consentStatus = cloneConsentStatus(safePatch.consentStatus);
        nextCustomerIntelligence.consent_status = cloneConsentStatus(safePatch.consentStatus);
        return;
      }
      if (key === 'recentTreatments') {
        nextPresentation.recentTreatments = cloneTextArray(safePatch.recentTreatments);
        nextCustomerIntelligence.recent_treatments = cloneTextArray(safePatch.recentTreatments);
        return;
      }
      if (key === 'journeyEvents') {
        nextPresentation.journeyEvents = cloneJourneyEvents(safePatch.journeyEvents);
        nextCustomerIntelligence.journey_events = cloneJourneyEvents(safePatch.journeyEvents);
        return;
      }
      if (key === 'activeViewers') {
        nextPresentation.activeViewers = cloneCollaborators(safePatch.activeViewers);
        nextCollaboration.active_viewers = cloneCollaborators(safePatch.activeViewers);
        return;
      }
      nextPresentation[key] = safePatch[key];
    });

    if (Object.keys(summaryPatch).length) {
      nextPresentation.previewSummary = {
        ...nextPresentation.previewSummary,
        ...summaryPatch,
      };
      Object.assign(nextSummary, summaryPatch);
    }
    if (Object.keys(studioPatch).length) {
      nextRecord.studio = {
        ...cloneStudioState(nextRecord.studio),
        ...studioPatch,
      };
      nextPresentation.previewStudio = cloneStudioState(nextRecord.studio);
    }

    if (Object.prototype.hasOwnProperty.call(safePatch, 'subject')) {
      nextRecord.thread.subject = asText(safePatch.subject, nextRecord.thread.subject);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'latestInboundPreview')) {
      nextRecord.thread.latest_inbound_preview = asText(
        safePatch.latestInboundPreview,
        nextRecord.thread.latest_inbound_preview
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'lastInboundAt')) {
      nextRecord.thread.last_inbound_at = asText(safePatch.lastInboundAt, nextRecord.thread.last_inbound_at);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'previewDraftBody')) {
      nextRecord.thread.preview_draft_body = asText(safePatch.previewDraftBody, nextRecord.thread.preview_draft_body);
      nextRecord.draft_state.body = asText(safePatch.previewDraftBody, nextRecord.draft_state.body);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'intent')) {
      nextRecord.intent = asText(safePatch.intent, nextRecord.intent);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'caseType')) {
      nextRecord.case_type = asText(safePatch.caseType, nextRecord.case_type);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'workflowLane')) {
      nextRecord.queue = sanitizeScenario(safePatch.workflowLane, null);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'lifecycleStage')) {
      nextRecord.stage = asText(safePatch.lifecycleStage, nextRecord.stage);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'owner')) {
      nextRecord.owner = asText(safePatch.owner, nextRecord.owner);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'handoffStatus')) {
      nextRecord.handoff_status = asText(safePatch.handoffStatus, nextRecord.handoff_status);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'waitingOn')) {
      nextRecord.waiting_on = asText(safePatch.waitingOn, nextRecord.waiting_on || 'none');
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'medicalBlocker')) {
      nextRecord.blocker_type = asText(safePatch.medicalBlocker, nextRecord.blocker_type);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'followUpDueAt')) {
      nextRecord.follow_up_due_at = asText(safePatch.followUpDueAt, nextRecord.follow_up_due_at);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'followUpMode')) {
      nextRecord.follow_up_mode = asText(safePatch.followUpMode, nextRecord.follow_up_mode);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'waitUntilReply')) {
      nextRecord.wait_until_reply = safePatch.waitUntilReply === true;
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'recurringCadence')) {
      nextRecord.recurring_cadence = asText(safePatch.recurringCadence, nextRecord.recurring_cadence);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'followUpSequenceKey')) {
      nextRecord.follow_up_sequence_key = asText(
        safePatch.followUpSequenceKey,
        nextRecord.follow_up_sequence_key
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'followUpSequenceStep')) {
      nextRecord.follow_up_sequence_step = Number(safePatch.followUpSequenceStep || 0) || 0;
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'followUpSequenceLabel')) {
      nextRecord.follow_up_sequence_label = asText(
        safePatch.followUpSequenceLabel,
        nextRecord.follow_up_sequence_label
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'followUpFallbackAction')) {
      nextRecord.follow_up_fallback_action = asText(
        safePatch.followUpFallbackAction,
        nextRecord.follow_up_fallback_action
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'slaGuardStatus')) {
      nextRecord.sla_guard_status = asText(safePatch.slaGuardStatus, nextRecord.sla_guard_status);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'slaGuardMessage')) {
      nextRecord.sla_guard_message = asText(safePatch.slaGuardMessage, nextRecord.sla_guard_message);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'bookingState')) {
      nextRecord.booking_state = asText(safePatch.bookingState, nextRecord.booking_state);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'needsMedicalReview')) {
      nextRecord.medical_review_state = safePatch.needsMedicalReview === true ? 'pending' : 'clear';
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'urgencyScore')) {
      nextRecord.urgency_score = Number(safePatch.urgencyScore || 0) || 0;
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'escalationRisk')) {
      nextRecord.risk_level = asText(safePatch.escalationRisk, nextRecord.risk_level);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'nextActionLabel')) {
      nextRecord.next_best_action.label = asText(safePatch.nextActionLabel, nextRecord.next_best_action.label);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'nextActionSummary')) {
      nextRecord.next_best_action.summary = asText(
        safePatch.nextActionSummary,
        nextRecord.next_best_action.summary
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'recommendedTool')) {
      nextRecord.recommended_tool = asText(safePatch.recommendedTool, nextRecord.recommended_tool);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'lastActionTakenLabel')) {
      nextRecord.last_action.label = asText(safePatch.lastActionTakenLabel, nextRecord.last_action.label);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'lastActionTakenAt')) {
      nextRecord.last_action.at = asText(safePatch.lastActionTakenAt, nextRecord.last_action.at);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'draftStateLabel')) {
      nextRecord.draft_state.label = asText(safePatch.draftStateLabel, nextRecord.draft_state.label);
    }

    if (Object.prototype.hasOwnProperty.call(safePatch, 'keyNote')) nextSummary.keyNote = asText(safePatch.keyNote, nextSummary.keyNote);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'customerContext')) nextSummary.customerContext = asText(safePatch.customerContext, nextSummary.customerContext);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'internalNote')) nextSummary.internalNote = asText(safePatch.internalNote, nextSummary.internalNote);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'responseAngle')) nextSummary.responseAngle = asText(safePatch.responseAngle, nextSummary.responseAngle);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'escalationRule')) nextSummary.escalationRule = asText(safePatch.escalationRule, nextSummary.escalationRule);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'medicalContext')) nextSummary.medicalContext = asText(safePatch.medicalContext, nextSummary.medicalContext);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'operatorCue')) nextSummary.operatorCue = asText(safePatch.operatorCue, nextSummary.operatorCue);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'situationSummary')) nextSummary.situationSummary = asText(safePatch.situationSummary, nextSummary.situationSummary);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'journeyStage')) nextCustomerIntelligence.journey_stage = asText(safePatch.journeyStage, nextCustomerIntelligence.journey_stage);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'vipStatus')) nextCustomerIntelligence.vip_status = asText(safePatch.vipStatus, nextCustomerIntelligence.vip_status);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'lifetimeValue')) {
      nextCustomerIntelligence.lifetime_value = Number(safePatch.lifetimeValue || 0) || 0;
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'relationshipSensitivity')) {
      nextCustomerIntelligence.relationship_sensitivity = asText(
        safePatch.relationshipSensitivity,
        nextCustomerIntelligence.relationship_sensitivity
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'duplicateState')) {
      nextCustomerIntelligence.duplicate_state = asText(safePatch.duplicateState, nextCustomerIntelligence.duplicate_state);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'duplicateNote')) {
      nextCustomerIntelligence.duplicate_note = asText(safePatch.duplicateNote, nextCustomerIntelligence.duplicate_note);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'insuranceContext')) {
      nextCustomerIntelligence.insurance_context = asText(
        safePatch.insuranceContext,
        nextCustomerIntelligence.insurance_context
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'treatmentContext')) {
      nextCustomerIntelligence.treatment_context = asText(
        safePatch.treatmentContext,
        nextCustomerIntelligence.treatment_context
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'plannedTreatment')) {
      nextCustomerIntelligence.planned_treatment = asText(
        safePatch.plannedTreatment,
        nextCustomerIntelligence.planned_treatment
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'returnVisitState')) {
      nextCustomerIntelligence.return_visit_state = asText(
        safePatch.returnVisitState,
        nextCustomerIntelligence.return_visit_state
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'activeEditor')) {
      nextCollaboration.active_editor = asText(safePatch.activeEditor, nextCollaboration.active_editor);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'draftOwner')) {
      nextCollaboration.draft_owner = asText(safePatch.draftOwner, nextCollaboration.draft_owner);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'draftUpdatedAt')) {
      nextCollaboration.draft_updated_at = asText(
        safePatch.draftUpdatedAt,
        nextCollaboration.draft_updated_at
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'collisionState')) {
      nextCollaboration.collision_state = asText(
        safePatch.collisionState,
        nextCollaboration.collision_state
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'handoffRequest')) {
      nextCollaboration.handoff_request = asText(
        safePatch.handoffRequest,
        nextCollaboration.handoff_request
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'handoffTarget')) {
      nextCollaboration.handoff_target = asText(
        safePatch.handoffTarget,
        nextCollaboration.handoff_target
      );
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'handoffNote')) {
      nextCollaboration.handoff_note = asText(safePatch.handoffNote, nextCollaboration.handoff_note);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'handoffStatusDetail')) {
      nextCollaboration.handoff_status_detail = asText(
        safePatch.handoffStatusDetail,
        nextCollaboration.handoff_status_detail
      );
    }

    nextRecord.summary = {
      ...nextSummary,
      assignedTo: asText(nextSummary.assignedTo || nextRecord.owner),
    };
    nextRecord.customer_intelligence = cloneCustomerIntelligence(nextCustomerIntelligence);
    nextRecord.collaboration = normalizeCollaborationState(nextCollaboration, dependencies);
    nextRecord.presentation = {
      ...nextPresentation,
      conversationId: nextRecord.id,
      previewSummary: cloneSummary(nextRecord.summary),
      previewMessages: cloneMessages(nextRecord.thread.messages),
      previewHistory: cloneHistory(nextRecord.history),
      previewStudio: cloneStudioState(nextRecord.studio),
      previewDraftBody: asText(nextRecord.draft_state.body || nextRecord.thread.preview_draft_body),
      subject: nextRecord.thread.subject,
      sender: nextRecord.patient.name,
      owner: nextRecord.owner,
      handoffStatus: nextRecord.handoff_status,
      waitingOn: nextRecord.waiting_on,
      medicalBlocker: nextRecord.blocker_type,
      followUpDueAt: nextRecord.follow_up_due_at,
      followUpMode: nextRecord.follow_up_mode,
      waitUntilReply: nextRecord.wait_until_reply === true,
      recurringCadence: nextRecord.recurring_cadence,
      followUpSequenceKey: nextRecord.follow_up_sequence_key,
      followUpSequenceStep: nextRecord.follow_up_sequence_step,
      followUpSequenceLabel: nextRecord.follow_up_sequence_label,
      followUpFallbackAction: nextRecord.follow_up_fallback_action,
      slaGuardStatus: nextRecord.sla_guard_status,
      slaGuardMessage: nextRecord.sla_guard_message,
      bookingState: nextRecord.booking_state,
      needsMedicalReview: nextRecord.medical_review_state === 'pending',
      draftStateLabel: nextRecord.draft_state.label,
      nextActionLabel: nextRecord.next_best_action.label,
      nextActionSummary: nextRecord.next_best_action.summary,
      lastActionTakenLabel: nextRecord.last_action.label,
      lastActionTakenAt: nextRecord.last_action.at,
      caseType: nextRecord.case_type,
      intent: nextRecord.intent,
      journeyStage: nextRecord.customer_intelligence.journey_stage,
      vipStatus: nextRecord.customer_intelligence.vip_status,
      lifetimeValue: nextRecord.customer_intelligence.lifetime_value,
      relationshipSensitivity: nextRecord.customer_intelligence.relationship_sensitivity,
      duplicateState: nextRecord.customer_intelligence.duplicate_state,
      duplicateNote: nextRecord.customer_intelligence.duplicate_note,
      consentStatus: cloneConsentStatus(nextRecord.customer_intelligence.consent_status),
      insuranceContext: nextRecord.customer_intelligence.insurance_context,
      treatmentContext: nextRecord.customer_intelligence.treatment_context,
      plannedTreatment: nextRecord.customer_intelligence.planned_treatment,
      recentTreatments: cloneTextArray(nextRecord.customer_intelligence.recent_treatments),
      returnVisitState: nextRecord.customer_intelligence.return_visit_state,
      journeyEvents: cloneJourneyEvents(nextRecord.customer_intelligence.journey_events),
      activeViewers: cloneCollaborators(nextRecord.collaboration.active_viewers),
      activeEditor: nextRecord.collaboration.active_editor,
      draftOwner: nextRecord.collaboration.draft_owner,
      draftUpdatedAt: nextRecord.collaboration.draft_updated_at,
      collisionState: nextRecord.collaboration.collision_state,
      handoffRequest: nextRecord.collaboration.handoff_request,
      handoffTarget: nextRecord.collaboration.handoff_target,
      handoffNote: nextRecord.collaboration.handoff_note,
      handoffStatusDetail: nextRecord.collaboration.handoff_status_detail,
      medicalFlags: cloneTextArray(nextRecord.summary.medicalFlags),
      suggestedSlots: cloneTextArray(nextRecord.thread.suggested_slots),
    };
    return nextRecord;
  }

  function createStore(config = {}) {
    const dependencies = isPlainObject(config.dependencies) ? config.dependencies : {};
    const previewSeed = isPlainObject(config.previewSeed) ? { ...config.previewSeed } : { rows: [] };
    const seedRows = Array.isArray(previewSeed.rows) ? previewSeed.rows : [];
    const seedRecordMap = {};
    const recordOrder = [];
    seedRows.forEach((row) => {
      const record = createThreadCase(row, dependencies);
      if (!record.id) return;
      seedRecordMap[record.id] = clonePresentation(row);
      recordOrder.push(record.id);
    });
    const validRecordIdSet = new Set(recordOrder);

    function sanitizeSelectedRowIds(value) {
      const selectedIds = cloneIdArray(value);
      const seen = new Set();
      const safe = [];
      selectedIds.forEach((id) => {
        if (!validRecordIdSet.has(id)) return;
        if (seen.has(id)) return;
        seen.add(id);
        safe.push(id);
      });
      return safe;
    }

    let draftById = isPlainObject(config.sessionState?.draftsByConversationId)
      ? { ...config.sessionState.draftsByConversationId }
      : {};
    let legacyThreadStateById = isPlainObject(config.sessionState?.threadStateByConversationId)
      ? { ...config.sessionState.threadStateByConversationId }
      : {};
    let uiState = {
      searchQuery: sanitizeSearchQuery(config.sessionState?.searchQuery || '', dependencies),
      scenario: sanitizeScenario(config.sessionState?.scenario || 'all', dependencies),
      selectedThreadId: asText(config.sessionState?.selectedThreadId),
      centerTab: sanitizeCenterTab(config.sessionState?.centerTab || 'conversation'),
      sidebarTab: sanitizeSidebarTab(config.sessionState?.sidebarTab || 'overview'),
      historyCollapsed:
        config.sessionState && Object.prototype.hasOwnProperty.call(config.sessionState, 'historyCollapsed')
          ? asBoolean(config.sessionState.historyCollapsed)
          : true,
      savedView: sanitizeSavedView(config.sessionState?.savedView || 'all'),
      followUpFilter: sanitizeFollowUpFilter(config.sessionState?.followUpFilter || 'all'),
      worklistDensity: sanitizeWorklistDensity(config.sessionState?.worklistDensity || 'regular'),
      disclosureMode: sanitizeDisclosureMode(config.sessionState?.disclosureMode || 'progressive'),
      selectionMode: asBoolean(config.sessionState?.selectionMode),
      selectedRowIds: sanitizeSelectedRowIds(config.sessionState?.selectedRowIds),
      commandPaletteOpen: false,
      commandQuery: '',
      commandSelectedIndex: 0,
    };
    let threadCasesById = {};

    function clearSelectionState() {
      uiState.selectionMode = false;
      uiState.selectedRowIds = [];
    }

    function closeCommandPaletteState() {
      uiState.commandPaletteOpen = false;
      uiState.commandQuery = '';
      uiState.commandSelectedIndex = 0;
    }

    function rebuildThreadCases() {
      const nextCases = {};
      recordOrder.forEach((id) => {
        let record = createThreadCase(seedRecordMap[id], dependencies);
        const persistedDraft = asText(draftById[id]);
        if (persistedDraft) {
          record.draft_state.body = persistedDraft;
          record.thread.preview_draft_body = persistedDraft;
          record.presentation.previewDraftBody = persistedDraft;
        }
        const persistedPatch = legacyThreadStateById[id];
        if (isPlainObject(persistedPatch)) {
          record = applyLegacyPatchToThreadCase(record, persistedPatch, dependencies);
        }
        nextCases[id] = record;
      });
      threadCasesById = nextCases;
      computeAllRows();
    }

    function computeRowForId(id) {
      const record = threadCasesById[id];
      if (!record) return null;
      if (draftById[id]) {
        record.draft_state.body = asText(draftById[id], record.draft_state.body);
        record.thread.preview_draft_body = record.draft_state.body;
        record.presentation.previewDraftBody = record.draft_state.body;
      }
      const legacyRow = legacyRowFromThreadCase(record);
      const derivedRow =
        typeof dependencies.buildRowModel === 'function'
          ? dependencies.buildRowModel(legacyRow)
          : legacyRow;
      let synchronized = syncThreadCaseFromDerivedRow(record, derivedRow, dependencies);
      const persistedPatch = legacyThreadStateById[id];
      if (isPlainObject(persistedPatch)) {
        synchronized = applyLegacyPatchToThreadCase(synchronized, persistedPatch, dependencies);
      }
      threadCasesById[id] = synchronized;
      return legacyRowFromThreadCase(synchronized);
    }

    function computeAllRows() {
      return recordOrder.map((id) => computeRowForId(id)).filter(Boolean);
    }

    function getScenarioCounts(rows) {
      const safeRows = Array.isArray(rows)
        ? rows.filter((row) => row?.previewStudio?.isDeleted !== true)
        : [];
      const counts = {
        all: safeRows.length,
        action_now: 0,
        booking_ready: 0,
        follow_up_today: 0,
        waiting_reply: 0,
        medical_review: 0,
        admin_low: 0,
      };
      safeRows.forEach((row) => {
        const lane = sanitizeScenario(row?.workflowLane || 'all', dependencies);
        if (lane !== 'all') counts[lane] += 1;
      });
      return counts;
    }

    function matchesScenario(row, scenario) {
      const safeScenario = sanitizeScenario(scenario || 'all', dependencies);
      if (safeScenario === 'all') return true;
      return asText(row?.workflowLane).toLowerCase() === safeScenario;
    }

    function getNowTimestampMs() {
      const nowMs = Date.parse(getTimestampOffset(0, 0, dependencies));
      return Number.isFinite(nowMs) ? nowMs : Date.now();
    }

    function getStartOfDayMs(timestampMs) {
      const date = new Date(timestampMs);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    }

    function isBookingReadyRow(row) {
      const bookingState = asText(row?.bookingState).toLowerCase();
      return (
        bookingState === 'ready_now' ||
        bookingState === 'slots_ready' ||
        asText(row?.recommendedTool).toLowerCase() === 'book'
      );
    }

    function isHighRiskRow(row) {
      const riskLevel = asText(row?.escalationRisk || row?.risk_level).toLowerCase();
      const slaStatus = asText(row?.slaStatus).toLowerCase();
      const urgencyScore = Number(row?.urgencyScore || 0) || 0;
      return (
        riskLevel === 'high' ||
        riskLevel === 'critical' ||
        riskLevel === 'danger' ||
        slaStatus === 'breach' ||
        urgencyScore >= 90
      );
    }

    function matchesSavedView(row, savedView) {
      const safeSavedView = sanitizeSavedView(savedView || 'all');
      if (safeSavedView === 'all') return true;
      if (safeSavedView === 'unowned') return !asText(row?.owner).trim();
      if (safeSavedView === 'booking_now') return isBookingReadyRow(row);
      if (safeSavedView === 'high_risk') return isHighRiskRow(row);
      if (safeSavedView === 'waiting_customer') {
        return asText(row?.waitingOn).toLowerCase() === 'customer' || asText(row?.workflowLane).toLowerCase() === 'waiting_reply';
      }
      return true;
    }

    function matchesFollowUpFilter(row, followUpFilter) {
      const safeFollowUpFilter = sanitizeFollowUpFilter(followUpFilter || 'all');
      if (safeFollowUpFilter === 'all') return true;
      if (safeFollowUpFilter === 'waiting_reply') {
        return asText(row?.waitingOn).toLowerCase() === 'customer' || asText(row?.workflowLane).toLowerCase() === 'waiting_reply';
      }
      const dueAtMs = Date.parse(asText(row?.followUpDueAt));
      if (!Number.isFinite(dueAtMs)) return false;
      const nowMs = getNowTimestampMs();
      const todayStartMs = getStartOfDayMs(nowMs);
      const tomorrowStartMs = todayStartMs + 86400000;
      const dayAfterTomorrowStartMs = tomorrowStartMs + 86400000;
      if (safeFollowUpFilter === 'overdue') return dueAtMs < nowMs;
      if (safeFollowUpFilter === 'today') return dueAtMs >= todayStartMs && dueAtMs < tomorrowStartMs;
      if (safeFollowUpFilter === 'tomorrow') return dueAtMs >= tomorrowStartMs && dueAtMs < dayAfterTomorrowStartMs;
      return true;
    }

    function countMatches(rows, values, matcher) {
      return values.reduce((accumulator, value) => {
        accumulator[value] = rows.filter((row) => matcher(row, value)).length;
        return accumulator;
      }, {});
    }

    function getFilteredRows(searchQueryOverride) {
      const allRows = computeAllRows().filter((row) => row?.previewStudio?.isDeleted !== true);
      const scenario = sanitizeScenario(uiState.scenario || 'all', dependencies);
      const counts = getScenarioCounts(allRows);
      const scenarioRows = allRows.filter((row) => matchesScenario(row, scenario));
      const rowsForScenario = scenarioRows.length || scenario === 'all' ? scenarioRows : allRows;
      const savedView = sanitizeSavedView(uiState.savedView || 'all');
      const savedViewCounts = countMatches(rowsForScenario, SAVED_VIEWS, matchesSavedView);
      const rowsForSavedView = rowsForScenario.filter((row) => matchesSavedView(row, savedView));
      const followUpFilter = sanitizeFollowUpFilter(uiState.followUpFilter || 'all');
      const followUpCounts = countMatches(rowsForSavedView, FOLLOW_UP_FILTERS, matchesFollowUpFilter);
      const rowsForFilters = rowsForSavedView.filter((row) => matchesFollowUpFilter(row, followUpFilter));
      const searchValue = sanitizeSearchQuery(
        searchQueryOverride != null ? searchQueryOverride : uiState.searchQuery,
        dependencies
      );
      if (!searchValue) {
        return {
          previewSeed,
          rows: rowsForFilters,
          searchValue: '',
          scenario,
          savedView,
          followUpFilter,
          counts,
          savedViewCounts,
          followUpCounts,
          allRows,
        };
      }
      const loweredQuery = searchValue.toLowerCase();
      const filteredRows = rowsForFilters.filter((row) => {
        const haystack = [
          row?.sender,
          row?.subject,
          row?.latestInboundPreview,
          row?.previewDraftBody,
          row?.operatorCue,
          row?.nextActionLabel,
          row?.keyNote,
          row?.owner,
          row?.queueReason,
          row?.bookingReadinessLabel,
          row?.blockerSummary,
          row?.lifecycleStageLabel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(loweredQuery);
      });
      if (!filteredRows.length) {
        return {
          previewSeed,
          rows: rowsForFilters,
          searchValue,
          scenario,
          savedView,
          followUpFilter,
          counts,
          savedViewCounts,
          followUpCounts,
          allRows,
        };
      }
      return {
        previewSeed,
        rows: filteredRows,
        searchValue,
        scenario,
        savedView,
        followUpFilter,
        counts,
        savedViewCounts,
        followUpCounts,
        allRows,
      };
    }

    function getScenarioCommandMeta() {
      return [
        { value: 'all', label: 'Alla trådar', shortcut: '⌥⇧1', description: 'Visa hela inkorgen.' },
        { value: 'action_now', label: 'Agera nu', shortcut: '⌥⇧2', description: 'Fokusera på de trådar som kräver beslut nu.' },
        { value: 'booking_ready', label: 'Bokningsklar', shortcut: '⌥⇧3', description: 'Visa trådar som kan bokas eller skickas vidare direkt.' },
        { value: 'follow_up_today', label: 'Följ upp idag', shortcut: '⌥⇧4', description: 'Visa trådar som ska återupptas eller nudgas idag.' },
        { value: 'waiting_reply', label: 'Väntar på patient', shortcut: '⌥⇧5', description: 'Visa trådar där nästa steg är kundens svar.' },
        { value: 'medical_review', label: 'Medicinsk granskning', shortcut: '⌥⇧6', description: 'Visa trådar som hålls av medicinsk review.' },
        { value: 'admin_low', label: 'Admin / låg', shortcut: '⌥⇧7', description: 'Visa admin- och lågprioriterade trådar.' },
      ];
    }

    function getSavedViewCommandMeta() {
      return [
        { value: 'all', label: 'Alla vyer', description: 'Nollställ smart vy och visa hela den valda kön.' },
        { value: 'unowned', label: 'Oägda', description: 'Visa bara trådar som saknar aktiv ägare.' },
        { value: 'booking_now', label: 'Bokningsbara', description: 'Visa bara trådar som kan bokas eller få tider nu.' },
        { value: 'high_risk', label: 'Hög risk', description: 'Visa trådar med hög risk, SLA-tryck eller stark churnrisk.' },
        { value: 'waiting_customer', label: 'Väntar svar', description: 'Visa trådar där vi väntar på kunden.' },
      ];
    }

    function getFollowUpCommandMeta() {
      return [
        { value: 'all', label: 'Alla uppföljningar', description: 'Visa alla uppföljningslägen i den aktiva kön.' },
        { value: 'overdue', label: 'Förfallen', description: 'Visa bara uppföljningar som redan borde ha tagits.' },
        { value: 'today', label: 'Idag', description: 'Visa uppföljningar som ska fångas idag.' },
        { value: 'tomorrow', label: 'Imorgon', description: 'Visa uppföljningar som ligger till imorgon.' },
        { value: 'waiting_reply', label: 'Väntar svar', description: 'Visa bara trådar där vi inväntar kunden.' },
      ];
    }

    function buildCommandItems(context = {}) {
      const rowState = isPlainObject(context.rowState) ? context.rowState : getFilteredRows();
      const selectedConversation =
        context.selectedConversation || ensureSelectedThread(Array.isArray(rowState.rows) ? rowState.rows : []);
      const selectedStudio = context.selectedStudio || null;
      const items = [];

      getScenarioCommandMeta().forEach((entry) => {
        items.push({
          id: `scenario:${entry.value}`,
          category: 'Köer',
          label: `Visa ${entry.label}`,
          description: `${entry.description} ${Number(rowState.counts?.[entry.value] || 0)} trådar i denna vy just nu.`,
          shortcut: entry.shortcut,
          active: rowState.scenario === entry.value,
          keywords: [entry.label, 'kö', 'queue', entry.value],
        });
      });

      getSavedViewCommandMeta().forEach((entry) => {
        items.push({
          id: `saved-view:${entry.value}`,
          category: 'Smarta vyer',
          label: entry.label,
          description: `${entry.description} ${Number(rowState.savedViewCounts?.[entry.value] || 0)} träffar just nu.`,
          active: rowState.savedView === entry.value,
          keywords: [entry.label, 'vy', 'filter', entry.value],
        });
      });

      getFollowUpCommandMeta().forEach((entry) => {
        items.push({
          id: `follow-up-filter:${entry.value}`,
          category: 'Follow-up',
          label: entry.label,
          description: `${entry.description} ${Number(rowState.followUpCounts?.[entry.value] || 0)} träffar just nu.`,
          active: rowState.followUpFilter === entry.value,
          keywords: [entry.label, 'follow-up', 'uppföljning', entry.value],
        });
      });

      items.push({
        id: 'density:regular',
        category: 'Visning',
        label: 'Densitet: Normal',
        description: 'Visa worklisten med nuvarande standardtäthet.',
        active: sanitizeWorklistDensity(uiState.worklistDensity) === 'regular',
        keywords: ['densitet', 'normal', 'visning'],
      });
      items.push({
        id: 'density:compact',
        category: 'Visning',
        label: 'Densitet: Kompakt',
        description: 'Visa fler trådar samtidigt med tätare rader.',
        active: sanitizeWorklistDensity(uiState.worklistDensity) === 'compact',
        keywords: ['densitet', 'kompakt', 'visning'],
      });
      items.push({
        id: 'disclosure:progressive',
        category: 'Visning',
        label: 'Detaljnivå: Progressiv',
        description: 'Visa full detalj bara för vald eller aktivt expanderad rad.',
        active: sanitizeDisclosureMode(uiState.disclosureMode) === 'progressive',
        keywords: ['detaljnivå', 'progressiv', 'lista'],
      });
      items.push({
        id: 'disclosure:expanded',
        category: 'Visning',
        label: 'Detaljnivå: Öppen',
        description: 'Visa fler worklist-detaljer direkt i varje rad.',
        active: sanitizeDisclosureMode(uiState.disclosureMode) === 'expanded',
        keywords: ['detaljnivå', 'öppen', 'lista'],
      });
      items.push({
        id: `selection-mode:${uiState.selectionMode === true ? 'off' : 'on'}`,
        category: 'Visning',
        label: uiState.selectionMode === true ? 'Avsluta markering' : 'Starta markering',
        description:
          uiState.selectionMode === true
            ? 'Stäng av multiselect och återgå till vanlig worklist.'
            : 'Markera flera trådar för bulkhantering.',
        keywords: ['markering', 'bulk', 'multiselect'],
      });

      if (selectedConversation) {
        items.push({
          id: 'action:book',
          category: 'Snabbåtgärder',
          label: 'Boka nu',
          description: 'Försök skicka bokningsförslag eller ta nästa bokningssteg direkt från vald tråd.',
          shortcut: 'B',
          keywords: ['boka', 'booking', 'tider'],
        });
        items.push({
          id: 'action:template',
          category: 'Snabbåtgärder',
          label: 'Lägg in mall',
          description: 'Fyll utkastet med Hair TP-anpassad mall för vald tråd.',
          shortcut: 'M',
          keywords: ['mall', 'template', 'utkast'],
        });
        items.push({
          id: 'action:open-studio',
          category: 'Snabbåtgärder',
          label: 'Öppna Svarsstudion',
          description: 'Flytta arbetet till studion när ton, strategi eller omdöme behövs.',
          shortcut: 'S',
          keywords: ['studio', 'svar', 'compose'],
        });
        if (!asText(selectedConversation.owner)) {
          items.push({
            id: 'action:take-ownership',
            category: 'Snabbåtgärder',
            label: 'Ta ansvar',
            description: 'Sätt dig själv som ägare för vald tråd.',
            shortcut: 'O',
            keywords: ['ägare', 'ownership', 'ta ansvar'],
          });
        }
        items.push({
          id: 'action:studio-return-later',
          category: 'Snabbåtgärder',
          label: 'Återkom senare',
          description: 'Parkera tråden till nästa follow-up-block direkt från tangentbordet.',
          shortcut: 'L',
          keywords: ['senare', 'snooze', 'follow-up'],
        });
        items.push({
          id: 'action:studio-mark-handled',
          category: 'Snabbåtgärder',
          label: 'Markera hanterad',
          description: 'Flytta tråden ur aktiv kö när den är klar för nu.',
          shortcut: 'H',
          keywords: ['handled', 'klar', 'stäng'],
        });
        if (selectedConversation.needsMedicalReview === true) {
          items.push({
            id: 'action:clear-medical-review',
            category: 'Snabbåtgärder',
            label: 'Markera review klar',
            description: 'Avsluta medicinsk review och flytta ärendet vidare.',
            keywords: ['review', 'medical', 'klar'],
          });
        }
        if (
          asText(selectedConversation.waitingOn).toLowerCase() === 'customer' ||
          asText(selectedConversation.bookingState).toLowerCase() === 'awaiting_confirmation'
        ) {
          items.push({
            id: 'action:simulate-reply',
            category: 'Snabbåtgärder',
            label: 'Simulera kundsvar',
            description: 'Testa nästa steg när kunden svarar eller bekräftar.',
            keywords: ['reply', 'kundsvar', 'simulera'],
          });
        }
      }

      if (selectedStudio?.isOpen === true) {
        items.push({
          id: 'action:studio-apply-template',
          category: 'Svarsstudio',
          label: 'Applicera studiomall',
          description: 'Lägg in strategianpassat utkast i studion.',
          keywords: ['studiomall', 'template', 'studio'],
        });
        items.push({
          id: 'action:studio-send',
          category: 'Svarsstudio',
          label: 'Skicka från studion',
          description: 'Slutför svaret och uppdatera nästa operativa state.',
          keywords: ['skicka', 'send', 'studio'],
        });
        const strategies = Array.isArray(selectedStudio.strategies) ? selectedStudio.strategies : [];
        strategies.slice(0, 6).forEach((strategy) => {
          const strategyAction = asText(strategy?.action);
          if (!strategyAction) return;
          items.push({
            id: `action:${strategyAction}`,
            category: 'Svarsstudio',
            label: `Byt till ${asText(strategy?.label, 'strategi')}`,
            description: asText(strategy?.description, 'Byt responsspår för vald tråd.'),
            active: strategy?.isSelected === true,
            keywords: [strategy?.label, strategy?.description, 'strategi', 'studio'],
          });
        });
      }

      rowState.rows.slice(0, 8).forEach((row, index) => {
        const conversationId = asText(row?.conversationId);
        if (!conversationId) return;
        items.push({
          id: `thread:${conversationId}`,
          category: 'Trådar',
          label: asText(row?.sender, 'Okänd kund'),
          description: `${asText(row?.workflowLabel, 'Tråd')} · ${asText(row?.subject || row?.caseType || 'Ingen ämnesrad')}`,
          active: asText(selectedConversation?.conversationId) === conversationId,
          badge: index === 0 ? 'Överst' : '',
          keywords: [
            row?.sender,
            row?.subject,
            row?.workflowLabel,
            row?.queueReason,
            row?.nextActionLabel,
            row?.latestInboundPreview,
          ],
        });
      });

      return items;
    }

    function filterCommandItems(items, query) {
      const safeItems = Array.isArray(items) ? items : [];
      const safeQuery = asText(query).toLowerCase();
      if (!safeQuery) return safeItems;
      return safeItems.filter((item) => {
        const haystack = [
          item?.category,
          item?.label,
          item?.description,
          ...(Array.isArray(item?.keywords) ? item.keywords : []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(safeQuery);
      });
    }

    function getCommandPaletteState(context = {}) {
      const rowState = isPlainObject(context.rowState) ? context.rowState : getFilteredRows();
      const selectedConversation =
        context.selectedConversation || ensureSelectedThread(Array.isArray(rowState.rows) ? rowState.rows : []);
      const selectedStudio = context.selectedStudio || null;
      const query =
        context.queryOverride != null ? asText(context.queryOverride) : asText(uiState.commandQuery);
      const items = filterCommandItems(
        buildCommandItems({
          rowState,
          selectedConversation,
          selectedStudio,
        }),
        query
      );
      const selectedIndex = items.length
        ? Math.max(0, Math.min(items.length - 1, Number(uiState.commandSelectedIndex || 0) || 0))
        : 0;
      return {
        isOpen: uiState.commandPaletteOpen === true,
        query,
        selectedIndex,
        totalCount: items.length,
        activeItem: items[selectedIndex] || null,
        items,
      };
    }

    function syncSelectedThreadToScenario(threadId) {
      const safeThreadId = asText(threadId);
      if (!safeThreadId) return null;
      const row = computeRowForId(safeThreadId);
      if (!row) return null;
      const activeScenario = sanitizeScenario(uiState.scenario || 'all', dependencies);
      if (activeScenario !== 'all' && !matchesScenario(row, activeScenario)) {
        uiState.scenario = sanitizeScenario(row.workflowLane || 'all', dependencies);
      }
      uiState.selectedThreadId = safeThreadId;
      uiState.centerTab = 'conversation';
      uiState.sidebarTab = 'overview';
      uiState.historyCollapsed = true;
      return row;
    }

    function ensureSelectedThread(rows) {
      const safeRows = Array.isArray(rows) ? rows : [];
      const selectedThreadId = asText(uiState.selectedThreadId);
      const existingRow =
        safeRows.find((row) => asText(row?.conversationId) === selectedThreadId) || safeRows[0] || null;
      uiState.selectedThreadId = asText(existingRow?.conversationId);
      return existingRow;
    }

    function getDraftValueById(threadId) {
      const safeThreadId = asText(threadId);
      if (!safeThreadId) return '';
      const record = threadCasesById[safeThreadId];
      if (!record) return '';
      const overrideValue = asText(draftById[safeThreadId]);
      return overrideValue || asText(record.draft_state.body || record.thread.preview_draft_body);
    }

    function appendHistory(threadId, entry) {
      const safeThreadId = asText(threadId);
      const record = threadCasesById[safeThreadId];
      if (!record) return;
      const nextEntry = {
        label: asText(entry?.label, 'Preview-åtgärd'),
        timestamp: asText(entry?.timestamp, getTimestampOffset(0, 0, dependencies)),
        excerpt: asText(entry?.excerpt),
      };
      applyLegacyPatch(safeThreadId, {
        previewHistory: [nextEntry, ...cloneHistory(record.history)],
      });
    }

    function appendMessage(threadId, message) {
      const safeThreadId = asText(threadId);
      const record = threadCasesById[safeThreadId];
      if (!record) return;
      const nextMessage = {
        author: asText(message?.author, dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO'),
        role: asText(message?.role || 'agent', 'agent'),
        timestamp: asText(message?.timestamp, getTimestampOffset(0, 0, dependencies)),
        body: asText(message?.body),
      };
      applyLegacyPatch(safeThreadId, {
        previewMessages: [...cloneMessages(record.thread.messages), nextMessage],
      });
    }

    function applyLegacyPatch(threadId, patch) {
      const safeThreadId = asText(threadId);
      if (!safeThreadId || !isPlainObject(patch)) return null;
      const currentRecord = threadCasesById[safeThreadId];
      if (!currentRecord) return null;
      const mergedPatch = {
        ...(legacyThreadStateById[safeThreadId] || {}),
        ...patch,
        previewSummary: {
          ...((legacyThreadStateById[safeThreadId] || {}).previewSummary || {}),
          ...(patch.previewSummary || {}),
        },
      };
      legacyThreadStateById[safeThreadId] = mergedPatch;
      const nextRecord = applyLegacyPatchToThreadCase(currentRecord, patch, dependencies);
      threadCasesById[safeThreadId] = nextRecord;
      return computeRowForId(safeThreadId);
    }

    function setDraftValue(threadId, value) {
      const safeThreadId = asText(threadId);
      if (!safeThreadId) return;
      const safeValue = String(value == null ? '' : value);
      if (safeValue.trim()) draftById[safeThreadId] = safeValue;
      else delete draftById[safeThreadId];
      const record = threadCasesById[safeThreadId];
      if (!record) return;
      record.draft_state.body = safeValue;
      record.thread.preview_draft_body = safeValue;
      record.presentation.previewDraftBody = safeValue;
      record.studio = {
        ...cloneStudioState(record.studio),
        currentDraftBody: safeValue,
      };
      record.presentation.previewStudio = cloneStudioState(record.studio);
      computeRowForId(safeThreadId);
    }

    function updateStudioState(threadId, patch) {
      const safeThreadId = asText(threadId);
      if (!safeThreadId || !isPlainObject(patch)) return null;
      const record = threadCasesById[safeThreadId];
      if (!record) return null;
      return applyLegacyPatch(safeThreadId, {
        previewStudio: {
          ...cloneStudioState(record.studio),
          ...cloneStudioState(patch),
        },
      });
    }

    function updateCollaborationState(threadId, patch) {
      const safeThreadId = asText(threadId);
      if (!safeThreadId || !isPlainObject(patch)) return null;
      const record = threadCasesById[safeThreadId];
      if (!record) return null;
      return applyLegacyPatch(safeThreadId, {
        activeViewers:
          Object.prototype.hasOwnProperty.call(patch, 'activeViewers')
            ? cloneCollaborators(patch.activeViewers)
            : cloneCollaborators(record.collaboration?.active_viewers),
        activeEditor:
          Object.prototype.hasOwnProperty.call(patch, 'activeEditor')
            ? asText(patch.activeEditor)
            : asText(record.collaboration?.active_editor),
        draftOwner:
          Object.prototype.hasOwnProperty.call(patch, 'draftOwner')
            ? asText(patch.draftOwner)
            : asText(record.collaboration?.draft_owner),
        draftUpdatedAt:
          Object.prototype.hasOwnProperty.call(patch, 'draftUpdatedAt')
            ? asText(patch.draftUpdatedAt)
            : asText(record.collaboration?.draft_updated_at),
        collisionState:
          Object.prototype.hasOwnProperty.call(patch, 'collisionState')
            ? asText(patch.collisionState)
            : asText(record.collaboration?.collision_state),
        handoffRequest:
          Object.prototype.hasOwnProperty.call(patch, 'handoffRequest')
            ? asText(patch.handoffRequest)
            : asText(record.collaboration?.handoff_request),
        handoffTarget:
          Object.prototype.hasOwnProperty.call(patch, 'handoffTarget')
            ? asText(patch.handoffTarget)
            : asText(record.collaboration?.handoff_target),
        handoffNote:
          Object.prototype.hasOwnProperty.call(patch, 'handoffNote')
            ? asText(patch.handoffNote)
            : asText(record.collaboration?.handoff_note),
        handoffStatusDetail:
          Object.prototype.hasOwnProperty.call(patch, 'handoffStatusDetail')
            ? asText(patch.handoffStatusDetail)
            : asText(record.collaboration?.handoff_status_detail),
      });
    }

    function getSelectedRow() {
      const snapshot = getSnapshot();
      return snapshot.selectedConversation;
    }

    function dispatchAction(action) {
      const safeAction = asText(action).toLowerCase();
      const conversation = getSelectedRow();
      if (!conversation && safeAction !== 'refresh' && safeAction !== 'sprint') {
        return {
          toast: { title: 'CCO Next', tone: 'warning', message: 'Välj en tråd först.' },
        };
      }
      const conversationId = asText(conversation?.conversationId);
      if (safeAction === 'book') {
        const ownerPatch =
          typeof dependencies.getOwnerPatch === 'function' ? dependencies.getOwnerPatch(conversation) : {};
        if (conversation.needsMedicalReview === true) {
          applyLegacyPatch(conversationId, {
            ...ownerPatch,
            lastActionTakenLabel: 'Bokning blockerad',
            lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
            draftStateLabel: 'Avvakta review',
            previewSummary: {
              assignedTo:
                ownerPatch.owner || conversation.owner || conversation.previewSummary?.assignedTo || '',
              lastCaseSummary:
                'Bokningsförsök stoppades i previewn eftersom klinisk review fortfarande saknas.',
            },
          });
          appendHistory(conversationId, {
            label: 'Bokning blockerad',
            excerpt: 'Previewn stoppade bokning eftersom klinisk review fortfarande krävs.',
          });
          syncSelectedThreadToScenario(conversationId);
          return {
            toast: {
              title: `CCO Next · ${conversation.sender}`,
              tone: 'warning',
              message: 'Boka inte ännu. Klinisk review måste bli klar först.',
            },
          };
        }
        if (conversation.bookingState === 'ready_now' || conversation.bookingState === 'slots_ready') {
          const draftBody =
            getDraftValueById(conversationId) ||
            (typeof dependencies.buildTemplateDraft === 'function'
              ? dependencies.buildTemplateDraft(conversation)
              : '');
          setDraftValue(conversationId, draftBody);
          const transition =
            typeof dependencies.buildSendStatePatch === 'function'
              ? dependencies.buildSendStatePatch(conversation, draftBody)
              : null;
          if (transition?.patch) {
            applyLegacyPatch(conversationId, transition.patch);
            appendHistory(conversationId, {
              label: transition.historyLabel,
              excerpt: transition.historyExcerpt,
            });
            appendMessage(conversationId, {
              author: transition.patch.owner || conversation.owner || (dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO'),
              role: 'agent',
              body: draftBody,
              timestamp: getTimestampOffset(0, 0, dependencies),
            });
          }
          syncSelectedThreadToScenario(conversationId);
          return {
            toast: {
              title: `CCO Next · ${conversation.sender}`,
              tone: transition?.toastTone || 'success',
              message:
                transition?.toastMessage ||
                'Bokningsförslag skickat i previewn. Tråden flyttas nu till väntar på patient.',
            },
          };
        }
        applyLegacyPatch(conversationId, {
          ...ownerPatch,
          lastActionTakenLabel: 'Bokning avvaktad',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
          previewSummary: {
            assignedTo: ownerPatch.owner || conversation.owner || conversation.previewSummary?.assignedTo || '',
            lastCaseSummary:
              'Operatören öppnade bokningsflödet men ärendet var ännu inte redo för kalenderbeslut.',
          },
        });
        appendHistory(conversationId, {
          label: 'Bokning avvaktad',
          excerpt: 'Previewn lät tråden ligga kvar eftersom den ännu inte är bokningsklar.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: `Boka först när tråden är ${asText(
              conversation.bookingReadinessLabel || 'redo att boka'
            ).toLowerCase()}.`,
          },
        };
      }
      if (safeAction === 'template') {
        const draftBody =
          typeof dependencies.buildTemplateDraft === 'function'
            ? dependencies.buildTemplateDraft(conversation)
            : '';
        setDraftValue(conversationId, draftBody);
        if (typeof dependencies.buildTemplateAppliedPatch === 'function') {
          applyLegacyPatch(conversationId, dependencies.buildTemplateAppliedPatch(conversation));
        }
        appendHistory(conversationId, {
          label: 'Mall förberedd',
          excerpt: 'Previewn lade in ett Hair TP-anpassat mallutkast som nu kan skickas eller finjusteras vidare.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: conversation.recommendedTool === 'template' ? 'success' : 'info',
            message:
              conversation.actionGuidance?.template ||
              'Mallen är nu anpassad till tråden och redo för nästa steg.',
          },
        };
      }
      if (safeAction.startsWith('studio-strategy:')) {
        const strategyKey = asText(safeAction.slice('studio-strategy:'.length));
        if (!strategyKey) return null;
        let strategyPatch = null;
        if (typeof dependencies.buildStudioStrategyPatch === 'function') {
          strategyPatch = dependencies.buildStudioStrategyPatch(
            conversation,
            strategyKey,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (strategyPatch?.draftBody != null) {
          setDraftValue(conversationId, strategyPatch.draftBody);
        }
        if (strategyPatch?.patch) {
          applyLegacyPatch(conversationId, strategyPatch.patch);
        } else {
          applyLegacyPatch(conversationId, {
            previewStudio: {
              ...cloneStudioState(conversation.previewStudio),
              isOpen: true,
              strategyKey,
            },
          });
        }
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: strategyPatch?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: 'Svarsstudion uppdaterades till valt responspår.',
          },
        };
      }
      if (safeAction === 'studio-apply-template') {
        let templateResult = null;
        if (typeof dependencies.buildStudioTemplateState === 'function') {
          templateResult = dependencies.buildStudioTemplateState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        const nextDraftBody = asText(templateResult?.draftBody);
        if (nextDraftBody) setDraftValue(conversationId, nextDraftBody);
        if (templateResult?.patch) applyLegacyPatch(conversationId, templateResult.patch);
        appendHistory(conversationId, {
          label: 'Studiomall applicerad',
          excerpt:
            'Svarsstudion lade in ett strategianpassat utkast för fortsatt granskning eller direkt utskick.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: templateResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Studiomallen är nu applicerad på vald tråd.',
          },
        };
      }
      if (safeAction.startsWith('studio-rewrite:')) {
        const rewriteKey = asText(safeAction.slice('studio-rewrite:'.length));
        if (!rewriteKey) return null;
        let rewriteResult = null;
        if (typeof dependencies.buildStudioRewriteState === 'function') {
          rewriteResult = dependencies.buildStudioRewriteState(
            conversation,
            rewriteKey,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (rewriteResult?.draftBody != null) {
          setDraftValue(conversationId, rewriteResult.draftBody);
        }
        if (rewriteResult?.patch) {
          applyLegacyPatch(conversationId, rewriteResult.patch);
        }
        appendHistory(conversationId, {
          label: rewriteResult?.historyLabel || 'Studioomskrivning',
          excerpt:
            rewriteResult?.historyExcerpt ||
            'Svarsstudion finjusterade utkastet för att passa vald ton och nästa steg bättre.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: rewriteResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Utkastet uppdaterades i Svarsstudion.',
          },
        };
      }
      if (safeAction.startsWith('studio-signature:')) {
        const signatureId = asText(safeAction.slice('studio-signature:'.length));
        if (!signatureId) return null;
        let signatureResult = null;
        if (typeof dependencies.buildStudioSignatureState === 'function') {
          signatureResult = dependencies.buildStudioSignatureState(
            conversation,
            signatureId,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (signatureResult?.draftBody != null) {
          setDraftValue(conversationId, signatureResult.draftBody);
        }
        if (signatureResult?.patch) {
          applyLegacyPatch(conversationId, signatureResult.patch);
        }
        appendHistory(conversationId, {
          label: signatureResult?.historyLabel || 'Studiosignatur vald',
          excerpt:
            signatureResult?.historyExcerpt ||
            'Svarsstudion bytte signatur så att utskicket matchar rätt ägare och ton.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: signatureResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Signaturen uppdaterades i Svarsstudion.',
          },
        };
      }
      if (safeAction === 'studio-open-signature-editor') {
        let signatureEditorResult = null;
        if (typeof dependencies.buildStudioSignatureEditorState === 'function') {
          signatureEditorResult = dependencies.buildStudioSignatureEditorState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (signatureEditorResult?.patch) {
          applyLegacyPatch(conversationId, signatureEditorResult.patch);
        }
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: signatureEditorResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: 'Signaturredigeringen öppnades i Svarsstudion.',
          },
        };
      }
      if (safeAction === 'studio-close-signature-editor') {
        updateStudioState(conversationId, { activeDialog: '', signatureEditorProfileId: '', signatureEditorDraft: {} });
        syncSelectedThreadToScenario(conversationId);
        return null;
      }
      if (safeAction === 'studio-save-signature-profile') {
        let signatureSaveResult = null;
        if (typeof dependencies.buildStudioSignatureProfileSaveState === 'function') {
          signatureSaveResult = dependencies.buildStudioSignatureProfileSaveState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (signatureSaveResult?.draftBody != null) {
          setDraftValue(conversationId, signatureSaveResult.draftBody);
        }
        if (signatureSaveResult?.patch) {
          applyLegacyPatch(conversationId, signatureSaveResult.patch);
        }
        appendHistory(conversationId, {
          label: signatureSaveResult?.historyLabel || 'Signaturprofil sparad',
          excerpt:
            signatureSaveResult?.historyExcerpt ||
            'Svarsstudion uppdaterade signaturprofilen och höll samma avsändare konsekvent i utkastet.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: signatureSaveResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Signaturprofilen sparades i previewn.',
          },
        };
      }
      if (safeAction.startsWith('studio-toggle-tone:')) {
        const toneKey = asText(safeAction.slice('studio-toggle-tone:'.length));
        if (!toneKey) return null;
        let toneResult = null;
        if (typeof dependencies.buildStudioToneToggleState === 'function') {
          toneResult = dependencies.buildStudioToneToggleState(
            conversation,
            toneKey,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (toneResult?.patch) {
          applyLegacyPatch(conversationId, toneResult.patch);
        }
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: toneResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: 'AI-filtret uppdaterades för utkastet.',
          },
        };
      }
      if (safeAction === 'studio-regenerate-suggestion') {
        let suggestionResult = null;
        if (typeof dependencies.buildStudioSuggestionState === 'function') {
          suggestionResult = dependencies.buildStudioSuggestionState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId),
            'regenerate'
          );
        }
        if (suggestionResult?.patch) {
          applyLegacyPatch(conversationId, suggestionResult.patch);
        }
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: suggestionResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: 'AI-förslaget uppdaterades i Svarsstudion.',
          },
        };
      }
      if (safeAction === 'studio-use-suggestion') {
        let suggestionUseResult = null;
        if (typeof dependencies.buildStudioSuggestionState === 'function') {
          suggestionUseResult = dependencies.buildStudioSuggestionState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId),
            'apply'
          );
        }
        if (suggestionUseResult?.draftBody != null) {
          setDraftValue(conversationId, suggestionUseResult.draftBody);
        }
        if (suggestionUseResult?.patch) {
          applyLegacyPatch(conversationId, suggestionUseResult.patch);
        }
        appendHistory(conversationId, {
          label: suggestionUseResult?.historyLabel || 'AI-förslag applicerat',
          excerpt:
            suggestionUseResult?.historyExcerpt ||
            'Svarsstudion applicerade det föreslagna svaret som nytt utkast.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: suggestionUseResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'AI-förslaget lades in som nytt utkast.',
          },
        };
      }
      if (safeAction === 'studio-open-snooze') {
        updateStudioState(conversationId, { activeDialog: 'snooze' });
        syncSelectedThreadToScenario(conversationId);
        return null;
      }
      if (safeAction === 'studio-close-snooze') {
        updateStudioState(conversationId, { activeDialog: '' });
        syncSelectedThreadToScenario(conversationId);
        return null;
      }
      if (safeAction.startsWith('studio-snooze:')) {
        const presetKey = asText(safeAction.slice('studio-snooze:'.length));
        if (!presetKey) return null;
        let snoozeResult = null;
        if (typeof dependencies.buildStudioSnoozeState === 'function') {
          snoozeResult = dependencies.buildStudioSnoozeState(
            conversation,
            presetKey,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (snoozeResult?.patch) {
          applyLegacyPatch(conversationId, snoozeResult.patch);
        }
        appendHistory(conversationId, {
          label: snoozeResult?.historyLabel || 'Tråd parkerad',
          excerpt:
            snoozeResult?.historyExcerpt ||
            'Svarsstudion parkerade tråden till nästa uppföljningsfönster.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: snoozeResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: 'Tråden parkerades till ett senare fönster i previewn.',
          },
        };
      }
      if (safeAction === 'studio-open-schedule') {
        updateStudioState(conversationId, { activeDialog: 'schedule' });
        syncSelectedThreadToScenario(conversationId);
        return null;
      }
      if (safeAction === 'studio-close-schedule') {
        updateStudioState(conversationId, { activeDialog: '' });
        syncSelectedThreadToScenario(conversationId);
        return null;
      }
      if (safeAction.startsWith('studio-schedule:')) {
        const presetKey = asText(safeAction.slice('studio-schedule:'.length));
        if (!presetKey) return null;
        let scheduleResult = null;
        if (typeof dependencies.buildStudioScheduleState === 'function') {
          scheduleResult = dependencies.buildStudioScheduleState(
            conversation,
            presetKey,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (scheduleResult?.patch) {
          applyLegacyPatch(conversationId, scheduleResult.patch);
        }
        appendHistory(conversationId, {
          label: scheduleResult?.historyLabel || 'Utskick planerat',
          excerpt:
            scheduleResult?.historyExcerpt ||
            'Svarsstudion planerade utskicket till ett senare tidsfönster.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: scheduleResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: 'Utskicket planerades i previewn.',
          },
        };
      }
      if (safeAction === 'studio-open-delete') {
        updateStudioState(conversationId, {
          activeDialog: 'delete',
          deleteRequestedAt: getTimestampOffset(0, 0, dependencies),
        });
        syncSelectedThreadToScenario(conversationId);
        return null;
      }
      if (safeAction === 'studio-cancel-delete') {
        updateStudioState(conversationId, { activeDialog: '', deleteRequestedAt: '' });
        syncSelectedThreadToScenario(conversationId);
        return null;
      }
      if (safeAction === 'studio-confirm-delete') {
        let deleteResult = null;
        if (typeof dependencies.buildStudioDeleteState === 'function') {
          deleteResult = dependencies.buildStudioDeleteState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (deleteResult?.patch) {
          applyLegacyPatch(conversationId, deleteResult.patch);
        }
        appendHistory(conversationId, {
          label: deleteResult?.historyLabel || 'Tråd borttagen',
          excerpt:
            deleteResult?.historyExcerpt ||
            'Previewn tog bort tråden från den aktiva inkorgen efter säker bekräftelse.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: deleteResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Tråden togs bort från preview-inkorgen.',
          },
        };
      }
      if (safeAction === 'save-draft') {
        const ownerPatch =
          typeof dependencies.getOwnerPatch === 'function' ? dependencies.getOwnerPatch(conversation) : {};
        applyLegacyPatch(conversationId, {
          ...ownerPatch,
          lastActionTakenLabel: 'Utkast sparat',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
          draftStateLabel: 'Utkast sparat lokalt',
          previewStudio: {
            ...cloneStudioState(conversation.previewStudio),
            isOpen: true,
            currentDraftBody: getDraftValueById(conversationId),
            editedDraftBody: getDraftValueById(conversationId),
            draftSource: 'edited',
            sendReady: Boolean(getDraftValueById(conversationId).trim()),
            lastEditedAt: getTimestampOffset(0, 0, dependencies),
          },
          nextActionLabel: 'Återuppta och skicka när du är redo',
          nextActionSummary:
            'Utkastet ligger kvar lokalt i denna session. Välj rätt verktyg när du vill driva tråden vidare.',
          previewSummary: {
            assignedTo: ownerPatch.owner || conversation.owner || conversation.previewSummary?.assignedTo || '',
            lastCaseSummary:
              'Lokalt utkast sparat i previewn så att operatören kan fortsätta där den slutade.',
          },
        });
        appendHistory(conversationId, {
          label: 'Utkast sparat',
          excerpt: 'Previewn sparade utkastet lokalt för fortsatt arbete i denna session.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Utkastet sparas lokalt i previewytan under denna session.',
          },
        };
      }
      if (safeAction === 'take-ownership') {
        const actor = dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO';
        applyLegacyPatch(conversationId, {
          owner: actor,
          handoffStatus: 'assigned',
          activeEditor: '',
          collisionState: 'none',
          handoffRequest: '',
          handoffTarget: '',
          handoffNote: '',
          handoffStatusDetail: `${actor} tog ägarskap och driver tråden vidare.`,
          lastActionTakenLabel: 'Ägarskap taget',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
          previewSummary: {
            assignedTo: actor,
            lastCaseSummary: `${actor} tog ägarskap i previewn för att driva tråden vidare utan väntetid.`,
          },
        });
        appendHistory(conversationId, {
          label: 'Ägarskap taget',
          excerpt: `${actor} tog ansvar för tråden i previewn.`,
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: `${actor} är nu ägare av tråden i previewn.`,
          },
        };
      }
      if (safeAction === 'handoff-open') {
        const currentTarget = asText(conversation?.handoffTarget);
        applyLegacyPatch(conversationId, {
          handoffRequest: 'draft',
          handoffTarget: currentTarget,
          handoffStatusDetail: currentTarget
            ? `Förbereder handoff till ${currentTarget}`
            : 'Förbered handoff till rätt kollega',
          lastActionTakenLabel: 'Handoff förbereds',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: 'Handoff-läget öppnades i previewn. Lägg till mottagare och kontext.',
          },
        };
      }
      if (safeAction === 'simulate-peer-viewing' || safeAction === 'simulate-peer-editing' || safeAction === 'simulate-peer-clear') {
        const actor = dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO';
        const configuredTarget = asText(conversation?.handoffTarget);
        const peerName =
          configuredTarget && configuredTarget.toLowerCase() !== asText(actor).toLowerCase()
            ? configuredTarget
            : asText(conversation?.owner) && asText(conversation?.owner).toLowerCase() !== asText(actor).toLowerCase()
            ? asText(conversation.owner)
            : actor === 'Sara'
            ? 'Egzona'
            : 'Sara';
        if (safeAction === 'simulate-peer-clear') {
          applyLegacyPatch(conversationId, {
            activeViewers: [],
            activeEditor: '',
            collisionState: 'none',
            handoffStatusDetail:
              asText(conversation?.handoffStatusDetail) || 'Previewn visar nu ingen aktiv kolleganärvaro.',
            lastActionTakenLabel: 'Previewn rensad',
            lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
          });
          syncSelectedThreadToScenario(conversationId);
          return {
            toast: {
              title: `CCO Next · ${conversation.sender}`,
              tone: 'success',
              message: 'Simulerad kolleganärvaro rensades från previewn.',
            },
          };
        }
        const actionLabel = safeAction === 'simulate-peer-editing' ? 'editing' : 'viewing';
        applyLegacyPatch(conversationId, {
          activeViewers: [
            {
              id: `collab-${peerName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'peer'}`,
              name: peerName,
              action: actionLabel,
              location: safeAction === 'simulate-peer-editing' ? 'Svarsstudio' : 'Konversation',
              durationSeconds: 180,
            },
          ],
          activeEditor: safeAction === 'simulate-peer-editing' ? peerName : '',
          draftOwner: safeAction === 'simulate-peer-editing' ? peerName : asText(conversation?.draftOwner),
          draftUpdatedAt:
            safeAction === 'simulate-peer-editing'
              ? getTimestampOffset(0, 0, dependencies)
              : asText(conversation?.draftUpdatedAt),
          collisionState: safeAction === 'simulate-peer-editing' ? 'editing' : 'viewing',
          handoffStatusDetail:
            safeAction === 'simulate-peer-editing'
              ? `${peerName} skriver i utkastet just nu.`
              : `${peerName} tittar i tråden just nu.`,
          lastActionTakenLabel:
            safeAction === 'simulate-peer-editing'
              ? 'Kollega skriver'
              : 'Kollega tittar',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: safeAction === 'simulate-peer-editing' ? 'warning' : 'info',
            message:
              safeAction === 'simulate-peer-editing'
                ? `${peerName} simuleras nu som aktiv i utkastet.`
                : `${peerName} simuleras nu som tittande kollega.`,
          },
        };
      }
      if (safeAction === 'handoff-request') {
        const actor = dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO';
        const target =
          asText(conversation?.handoffTarget) ||
          (actor === 'Sara' ? 'Egzona' : 'Sara');
        const note =
          asText(conversation?.handoffNote) ||
          'Ta över nästa steg och svara med samma kontext som redan finns i tråden.';
        applyLegacyPatch(conversationId, {
          queueOverride: 'follow_up_today',
          waitingOn: 'colleague',
          handoffStatus: 'handoff_pending',
          handoffRequest: 'pending',
          handoffTarget: target,
          handoffNote: note,
          handoffStatusDetail: `Väntar på ${target} · ${note}`,
          followUpSuggested: true,
          followUpDueAt: getTimestampOffset(1, 0, dependencies),
          nextActionLabel: `Invänta ${target}`,
          nextActionSummary: `${target} behöver ta över nästa steg. ${note}`,
          lastActionTakenLabel: 'Handoff skickad',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
          previewSummary: {
            assignedTo: asText(conversation?.owner || actor),
            lastCaseSummary: `Handoff skickad till ${target}. ${note}`,
          },
        });
        appendHistory(conversationId, {
          label: 'Handoff skickad',
          excerpt: `${actor} skickade handoff till ${target} med tydlig kontext för nästa steg.`,
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: `Handoff skickad till ${target} i previewn.`,
          },
        };
      }
      if (safeAction === 'handoff-accept') {
        const actor = dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO';
        const target = asText(conversation?.handoffTarget) || actor;
        const note = asText(conversation?.handoffNote);
        applyLegacyPatch(conversationId, {
          queueOverride: 'action_now',
          owner: target,
          waitingOn: 'none',
          handoffStatus: 'assigned',
          handoffRequest: 'accepted',
          handoffStatusDetail: note ? `${target} tog över · ${note}` : `${target} tog över nästa steg`,
          activeViewers: [
            {
              id: `collab-${target.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'owner'}`,
              name: target,
              action: 'viewing',
              location: 'Konversation',
              durationSeconds: 60,
            },
          ],
          activeEditor: '',
          collisionState: 'none',
          draftOwner: target,
          draftUpdatedAt: getTimestampOffset(0, 0, dependencies),
          nextActionLabel: `${target} tar nästa steg`,
          nextActionSummary: note || 'Tråden är nu åter aktiv och har tydlig ägare.',
          lastActionTakenLabel: 'Handoff accepterad',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
          previewSummary: {
            assignedTo: target,
            lastCaseSummary: note
              ? `${target} tog över tråden. ${note}`
              : `${target} tog över tråden och driver nästa steg.`,
          },
        });
        appendHistory(conversationId, {
          label: 'Handoff accepterad',
          excerpt: `${target} tog över tråden i previewn.`,
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: `${target} är nu markerad som ägare för nästa steg.`,
          },
        };
      }
      if (safeAction === 'handoff-reclaim') {
        const actor = dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO';
        applyLegacyPatch(conversationId, {
          queueOverride: 'action_now',
          owner: actor,
          waitingOn: 'none',
          handoffStatus: 'assigned',
          handoffRequest: 'reclaimed',
          handoffStatusDetail: `${actor} tog tillbaka tråden`,
          activeEditor: '',
          collisionState: 'none',
          draftOwner: actor,
          draftUpdatedAt: getTimestampOffset(0, 0, dependencies),
          nextActionLabel: 'Fortsätt härifrån',
          nextActionSummary: 'Handoff återtogs och tråden är tillbaka i aktivt arbete.',
          lastActionTakenLabel: 'Handoff återtagen',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
          previewSummary: {
            assignedTo: actor,
            lastCaseSummary: `${actor} tog tillbaka handoffen och driver tråden vidare själv.`,
          },
        });
        appendHistory(conversationId, {
          label: 'Handoff återtagen',
          excerpt: `${actor} tog tillbaka ansvaret för tråden.`,
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Tråden togs tillbaka till aktivt eget arbete.',
          },
        };
      }
      if (safeAction === 'handoff-wait-on-colleague') {
        const target = asText(conversation?.handoffTarget) || 'kollega';
        applyLegacyPatch(conversationId, {
          queueOverride: 'follow_up_today',
          waitingOn: 'colleague',
          handoffStatus: 'waiting_colleague',
          handoffRequest: asText(conversation?.handoffRequest) || 'pending',
          handoffStatusDetail: `Väntar på ${target} innan nästa kundsteg`,
          followUpSuggested: true,
          followUpDueAt: getTimestampOffset(2, 0, dependencies),
          nextActionLabel: `Vänta på ${target}`,
          nextActionSummary: `Nästa steg öppnas igen när ${target} har återkopplat internt.`,
          lastActionTakenLabel: 'Väntar på kollega',
          lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
        });
        appendHistory(conversationId, {
          label: 'Väntar på kollega',
          excerpt: `Previewn markerade tråden som intern väntan på ${target}.`,
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: `Tråden väntar nu på intern återkoppling från ${target}.`,
          },
        };
      }
      if (safeAction === 'studio-mark-handled') {
        let handledResult = null;
        if (typeof dependencies.buildStudioHandledState === 'function') {
          handledResult = dependencies.buildStudioHandledState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (handledResult?.patch) {
          applyLegacyPatch(conversationId, handledResult.patch);
        }
        appendHistory(conversationId, {
          label: handledResult?.historyLabel || 'Markerad som hanterad',
          excerpt:
            handledResult?.historyExcerpt ||
            'Svarsstudion markerade tråden som klar för nu och flyttade den till låg prioritet.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: handledResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Tråden markerades som hanterad i previewn.',
          },
        };
      }
      if (safeAction === 'studio-return-later') {
        let laterResult = null;
        if (typeof dependencies.buildStudioReturnLaterState === 'function') {
          laterResult = dependencies.buildStudioReturnLaterState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            getDraftValueById(conversationId)
          );
        }
        if (laterResult?.patch) {
          applyLegacyPatch(conversationId, laterResult.patch);
        }
        appendHistory(conversationId, {
          label: laterResult?.historyLabel || 'Återuppta senare',
          excerpt:
            laterResult?.historyExcerpt ||
            'Svarsstudion parkerade tråden till nästa uppföljningsfönster.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: laterResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'info',
            message: 'Tråden parkerades till ett senare uppföljningsfönster i previewn.',
          },
        };
      }
      if (safeAction === 'clear-medical-review') {
        if (typeof dependencies.buildMedicalClearPatch === 'function') {
          applyLegacyPatch(conversationId, dependencies.buildMedicalClearPatch(conversation));
        }
        appendHistory(conversationId, {
          label: 'Review klar',
          excerpt: 'Previewn markerade medicinsk review som klar och flyttade tråden till bokningsklar.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Medicinsk review markerad som klar. Tråden är nu bokningsklar i previewn.',
          },
        };
      }
      if (safeAction === 'simulate-reply') {
        const replyBody =
          typeof dependencies.buildSimulatedReply === 'function'
            ? dependencies.buildSimulatedReply(conversation)
            : 'Tack, det låter bra.';
        if (typeof dependencies.buildReplyPatch === 'function') {
          applyLegacyPatch(conversationId, dependencies.buildReplyPatch(conversation, replyBody));
        }
        appendMessage(conversationId, {
          author: conversation.sender || 'Kund',
          role: 'customer',
          body: replyBody,
          timestamp: getTimestampOffset(0, 6, dependencies),
        });
        appendHistory(conversationId, {
          label: 'Kundsvar simulerat',
          excerpt: 'Previewn simulerade ett nytt kundsvar och öppnade nästa operativa steg.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Kundsvar simulerat i previewn. Tråden flyttas nu till nästa arbetssteg.',
          },
        };
      }
      if (safeAction === 'send-preview') {
        const draftBody = getDraftValueById(conversationId).trim();
        if (!draftBody) {
          return {
            toast: {
              title: `CCO Next · ${conversation.sender}`,
              tone: 'warning',
              message: 'Skriv eller applicera ett utkast först.',
            },
          };
        }
        const transition =
          typeof dependencies.buildSendStatePatch === 'function'
            ? dependencies.buildSendStatePatch(conversation, draftBody)
            : null;
        if (transition?.patch) {
          applyLegacyPatch(conversationId, transition.patch);
          appendMessage(conversationId, {
            author: transition.patch.owner || conversation.owner || (dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO'),
            role: 'agent',
            body: draftBody,
            timestamp: getTimestampOffset(0, 0, dependencies),
          });
          appendHistory(conversationId, {
            label: transition.historyLabel,
            excerpt: transition.historyExcerpt,
          });
        }
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: {
            title: `CCO Next · ${conversation.sender}`,
            tone: transition?.toastTone || 'success',
            message:
              transition?.toastMessage ||
              'Svar skickat i previewn. Tråden flyttas nu till nästa arbetsläge.',
          },
        };
      }
      if (safeAction === 'studio-send') {
        const draftBody = getDraftValueById(conversationId).trim();
        if (!draftBody) {
          return {
            toast: {
              title: `CCO Next · ${conversation.sender}`,
              tone: 'warning',
              message: 'Lägg in eller skriv ett utkast i Svarsstudion först.',
            },
          };
        }
        const transition =
          typeof dependencies.buildStudioSendStatePatch === 'function'
            ? dependencies.buildStudioSendStatePatch(
                conversation,
                draftBody,
                cloneStudioState(conversation.previewStudio)
              )
            : typeof dependencies.buildSendStatePatch === 'function'
            ? dependencies.buildSendStatePatch(conversation, draftBody)
            : null;
        if (transition?.patch) {
          applyLegacyPatch(conversationId, transition.patch);
          appendMessage(conversationId, {
            author:
              transition.patch.owner ||
              conversation.owner ||
              (dependencies.getActorLabel ? dependencies.getActorLabel() : 'CCO'),
            role: 'agent',
            body: draftBody,
            timestamp: getTimestampOffset(0, 0, dependencies),
          });
          appendHistory(conversationId, {
            label: transition.historyLabel || 'Studiosvar skickat',
            excerpt:
              transition.historyExcerpt ||
              'Svarsstudion skickade svaret och uppdaterade nästa operativa tillstånd i previewn.',
          });
        }
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: transition?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: transition?.toastTone || 'success',
            message:
              transition?.toastMessage ||
              'Svar skickat från Svarsstudion. Tråden har uppdaterats till sitt nästa arbetsläge.',
          },
        };
      }
      if (safeAction === 'open-studio') {
        const existingDraft = getDraftValueById(conversationId);
        let studioResult = null;
        if (typeof dependencies.buildStudioOpenState === 'function') {
          studioResult = dependencies.buildStudioOpenState(
            conversation,
            cloneStudioState(conversation.previewStudio),
            existingDraft
          );
        }
        const previewBody =
          asText(studioResult?.draftBody) ||
          existingDraft ||
          (typeof dependencies.buildTemplateDraft === 'function'
            ? dependencies.buildTemplateDraft(conversation)
            : '');
        if (!existingDraft && previewBody) setDraftValue(conversationId, previewBody);
        if (studioResult?.patch) {
          applyLegacyPatch(conversationId, studioResult.patch);
        } else if (typeof dependencies.buildStudioPatch === 'function') {
          applyLegacyPatch(
            conversationId,
            dependencies.buildStudioPatch(conversation, Boolean(previewBody))
          );
        }
        appendHistory(conversationId, {
          label: 'Svarsstudio öppnad',
          excerpt:
            'Previewn öppnade utkastet i svarsstudion för tonal finjustering och tydligare nästa steg.',
        });
        syncSelectedThreadToScenario(conversationId);
        return {
          toast: studioResult?.toast || {
            title: `CCO Next · ${conversation.sender}`,
            tone: 'success',
            message: 'Svarsstudion öppnades för fortsatt bearbetning av tråden.',
          },
        };
      }
      return null;
    }

    function markDraftCopied(threadId) {
      applyLegacyPatch(threadId, {
        lastActionTakenLabel: 'Utkast kopierat',
        lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
        draftStateLabel: 'Utkast kopierat',
        previewStudio: {
          ...(cloneStudioState(threadCasesById[asText(threadId)]?.studio)),
          currentDraftBody: getDraftValueById(threadId),
          sendReady: Boolean(getDraftValueById(threadId).trim()),
        },
      });
      syncSelectedThreadToScenario(threadId);
    }

    function getSnapshot(searchQueryOverride) {
      const rowState = getFilteredRows(searchQueryOverride);
      uiState.selectedRowIds = uiState.selectedRowIds.filter((id) =>
        rowState.allRows.some((row) => asText(row?.conversationId) === id)
      );
      if (uiState.selectionMode !== true) uiState.selectedRowIds = [];
      const selectedConversation = ensureSelectedThread(rowState.rows);
      const historyEntries = Array.isArray(selectedConversation?.previewHistory)
        ? selectedConversation.previewHistory
        : [];
      const historyCollapsed = uiState.historyCollapsed === true;
      const visibleHistoryEntries =
        historyCollapsed && historyEntries.length > 2 ? historyEntries.slice(0, 2) : historyEntries;
      const conversationMessages = Array.isArray(selectedConversation?.previewMessages)
        ? selectedConversation.previewMessages
        : [];
      const selectedDraftValue = selectedConversation
        ? getDraftValueById(selectedConversation.conversationId)
        : '';
      const draftStats = {
        words: selectedDraftValue.trim()
          ? selectedDraftValue
              .trim()
              .split(/\s+/)
              .filter(Boolean).length
          : 0,
        characters: selectedDraftValue.length,
        paragraphs: selectedDraftValue.trim()
          ? selectedDraftValue.split(/\n\s*\n/).filter(Boolean).length
          : 0,
      };
      const projectedOutcome =
        selectedConversation && typeof dependencies.buildProjectedOutcome === 'function'
          ? dependencies.buildProjectedOutcome(
              selectedConversation,
              selectedDraftValue ||
                (typeof dependencies.buildTemplateDraft === 'function'
                  ? dependencies.buildTemplateDraft(selectedConversation)
                  : '')
            )
          : null;
      const primaryActionPlan =
        selectedConversation && typeof dependencies.buildPrimaryActionPlan === 'function'
          ? dependencies.buildPrimaryActionPlan(
              selectedConversation,
              selectedDraftValue ||
                (typeof dependencies.buildTemplateDraft === 'function'
                  ? dependencies.buildTemplateDraft(selectedConversation)
                  : ''),
              projectedOutcome,
              cloneStudioState(selectedConversation?.previewStudio)
            )
          : null;
      const selectedStudio =
        selectedConversation && typeof dependencies.buildStudioViewModel === 'function'
          ? dependencies.buildStudioViewModel(selectedConversation, {
              draftBody: selectedDraftValue,
              draftStats,
              projectedOutcome,
              primaryActionPlan,
              studioState: cloneStudioState(selectedConversation?.previewStudio),
            })
          : null;
      const commandPalette = getCommandPaletteState({
        rowState,
        selectedConversation,
        selectedStudio,
      });
      const selectedFollowThrough =
        selectedConversation && typeof dependencies.buildFollowThroughMeta === 'function'
          ? dependencies.buildFollowThroughMeta(selectedConversation)
          : null;
      return {
        ...rowState,
        selectedConversation,
        selectedSummary: selectedConversation?.previewSummary || null,
        selectedFollowThrough,
        centerTab: sanitizeCenterTab(uiState.centerTab),
        sidebarTab: sanitizeSidebarTab(uiState.sidebarTab),
        historyCollapsed,
        historyEntries,
        visibleHistoryEntries,
        conversationMessages,
        selectedDraftValue,
        draftStats,
        projectedOutcome,
        projectedRow: projectedOutcome?.projected || null,
        primaryActionPlan,
        selectedStudio,
        savedView: rowState.savedView,
        savedViewCounts: rowState.savedViewCounts,
        followUpFilter: rowState.followUpFilter,
        followUpCounts: rowState.followUpCounts,
        worklistDensity: sanitizeWorklistDensity(uiState.worklistDensity),
        disclosureMode: sanitizeDisclosureMode(uiState.disclosureMode),
        selectionMode: uiState.selectionMode === true,
        selectedRowIds: cloneIdArray(uiState.selectedRowIds),
        selectedCount: uiState.selectedRowIds.length,
        commandPalette,
        allVisibleSelected:
          rowState.rows.length > 0 &&
          rowState.rows.every((row) => uiState.selectedRowIds.includes(asText(row?.conversationId))),
        uiState: {
          ...uiState,
          selectedThreadId: uiState.selectedThreadId,
        },
      };
    }

    function exportSessionState() {
      return {
        searchQuery: sanitizeSearchQuery(uiState.searchQuery, dependencies),
        scenario: sanitizeScenario(uiState.scenario, dependencies),
        selectedThreadId: asText(uiState.selectedThreadId),
        centerTab: sanitizeCenterTab(uiState.centerTab),
        sidebarTab: sanitizeSidebarTab(uiState.sidebarTab),
        historyCollapsed: uiState.historyCollapsed === true,
        savedView: sanitizeSavedView(uiState.savedView),
        followUpFilter: sanitizeFollowUpFilter(uiState.followUpFilter),
        worklistDensity: sanitizeWorklistDensity(uiState.worklistDensity),
        disclosureMode: sanitizeDisclosureMode(uiState.disclosureMode),
        selectionMode: uiState.selectionMode === true,
        selectedRowIds: cloneIdArray(uiState.selectedRowIds),
        draftsByConversationId: { ...draftById },
        threadStateByConversationId: { ...legacyThreadStateById },
      };
    }

    function getThreadCase(threadId) {
      const safeThreadId = asText(threadId);
      if (!safeThreadId) return null;
      computeRowForId(safeThreadId);
      return cloneThreadCase(threadCasesById[safeThreadId]);
    }

    rebuildThreadCases();

    return {
      getSnapshot,
      getThreadCase,
      getThreadViewModelById(threadId) {
        return computeRowForId(threadId);
      },
      getDraftValueById,
      getThreadStateById(threadId) {
        return { ...(legacyThreadStateById[asText(threadId)] || {}) };
      },
      applyLegacyPatch,
      setDraftValue,
      markDraftCopied,
      exportSessionState,
      selectThread(threadId) {
        return syncSelectedThreadToScenario(threadId);
      },
      setScenario(value) {
        uiState.scenario = sanitizeScenario(value || 'all', dependencies);
        uiState.searchQuery = '';
        uiState.selectedThreadId = '';
        uiState.centerTab = 'conversation';
        uiState.sidebarTab = 'overview';
        uiState.historyCollapsed = true;
        clearSelectionState();
        return getSnapshot();
      },
      resetPreview() {
        draftById = {};
        legacyThreadStateById = {};
        uiState = {
          searchQuery: '',
          scenario: 'all',
          selectedThreadId: '',
          centerTab: 'conversation',
          sidebarTab: 'overview',
          historyCollapsed: true,
          savedView: 'all',
          followUpFilter: 'all',
          worklistDensity: 'regular',
          disclosureMode: 'progressive',
          selectionMode: false,
          selectedRowIds: [],
          commandPaletteOpen: false,
          commandQuery: '',
          commandSelectedIndex: 0,
        };
        rebuildThreadCases();
        return getSnapshot();
      },
      focusSprint() {
        uiState.scenario = 'action_now';
        uiState.selectedThreadId = '';
        uiState.centerTab = 'conversation';
        uiState.sidebarTab = 'overview';
        uiState.historyCollapsed = true;
        uiState.savedView = 'all';
        uiState.followUpFilter = 'all';
        clearSelectionState();
        closeCommandPaletteState();
        return getSnapshot();
      },
      setCenterTab(value) {
        uiState.centerTab = sanitizeCenterTab(value);
        return getSnapshot();
      },
      setSidebarTab(value) {
        uiState.sidebarTab = sanitizeSidebarTab(value);
        return getSnapshot();
      },
      toggleHistoryCollapsed() {
        uiState.historyCollapsed = !(uiState.historyCollapsed === true);
        return getSnapshot();
      },
      setSearchQuery(value) {
        uiState.searchQuery = sanitizeSearchQuery(value || '', dependencies);
        uiState.selectedThreadId = '';
        clearSelectionState();
        return getSnapshot();
      },
      setSavedView(value) {
        uiState.savedView = sanitizeSavedView(value || 'all');
        uiState.selectedThreadId = '';
        clearSelectionState();
        return getSnapshot();
      },
      setFollowUpFilter(value) {
        uiState.followUpFilter = sanitizeFollowUpFilter(value || 'all');
        uiState.selectedThreadId = '';
        clearSelectionState();
        return getSnapshot();
      },
      setWorklistDensity(value) {
        uiState.worklistDensity = sanitizeWorklistDensity(value || 'regular');
        return getSnapshot();
      },
      setDisclosureMode(value) {
        uiState.disclosureMode = sanitizeDisclosureMode(value || 'progressive');
        return getSnapshot();
      },
      toggleSelectionMode(forceValue) {
        const nextValue =
          typeof forceValue === 'boolean' ? forceValue : !(uiState.selectionMode === true);
        uiState.selectionMode = nextValue === true;
        if (uiState.selectionMode !== true) uiState.selectedRowIds = [];
        return getSnapshot();
      },
      toggleRowSelection(threadId) {
        const safeThreadId = asText(threadId);
        if (!safeThreadId || !validRecordIdSet.has(safeThreadId)) return getSnapshot();
        uiState.selectionMode = true;
        if (uiState.selectedRowIds.includes(safeThreadId)) {
          uiState.selectedRowIds = uiState.selectedRowIds.filter((id) => id !== safeThreadId);
        } else {
          uiState.selectedRowIds = [...uiState.selectedRowIds, safeThreadId];
        }
        return getSnapshot();
      },
      selectAllVisible() {
        const rowState = getFilteredRows();
        uiState.selectionMode = true;
        uiState.selectedRowIds = rowState.rows.map((row) => asText(row?.conversationId)).filter(Boolean);
        return getSnapshot();
      },
      clearSelectedRows() {
        uiState.selectedRowIds = [];
        return getSnapshot();
      },
      setCommandPaletteOpen(forceValue) {
        const shouldOpen = forceValue !== false;
        if (shouldOpen) {
          uiState.commandPaletteOpen = true;
          uiState.commandSelectedIndex = 0;
        } else {
          closeCommandPaletteState();
        }
        return getSnapshot();
      },
      setCommandQuery(value) {
        uiState.commandPaletteOpen = true;
        uiState.commandQuery = asText(value);
        uiState.commandSelectedIndex = 0;
        return getSnapshot();
      },
      moveCommandSelection(delta) {
        const paletteState = getCommandPaletteState();
        const total = Number(paletteState.totalCount || 0) || 0;
        if (!total) return getSnapshot();
        const direction = Number(delta || 0) || 0;
        const nextIndex = (paletteState.selectedIndex + direction + total) % total;
        uiState.commandSelectedIndex = nextIndex;
        return getSnapshot();
      },
      setCommandSelectedIndex(index) {
        const paletteState = getCommandPaletteState();
        const total = Number(paletteState.totalCount || 0) || 0;
        if (!total) return getSnapshot();
        uiState.commandSelectedIndex = Math.max(0, Math.min(total - 1, Number(index || 0) || 0));
        return getSnapshot();
      },
      selectRelativeThread(step) {
        const rowState = getFilteredRows();
        const safeRows = Array.isArray(rowState.rows) ? rowState.rows : [];
        if (!safeRows.length) return getSnapshot();
        const currentId = asText(uiState.selectedThreadId);
        const currentIndex = Math.max(
          0,
          safeRows.findIndex((row) => asText(row?.conversationId) === currentId)
        );
        const delta = Number(step || 0) || 0;
        const nextIndex = (currentIndex + delta + safeRows.length) % safeRows.length;
        syncSelectedThreadToScenario(asText(safeRows[nextIndex]?.conversationId));
        return getSnapshot();
      },
      runCommand(commandId) {
        const resolvedCommandId =
          asText(commandId) || asText(getCommandPaletteState().activeItem?.id);
        if (!resolvedCommandId) {
          return {
            toast: { title: 'CCO Next', tone: 'warning', message: 'Det finns inget kommando att köra just nu.' },
          };
        }
        let result = null;
        if (resolvedCommandId.startsWith('scenario:')) {
          this.setScenario(resolvedCommandId.slice('scenario:'.length));
        } else if (resolvedCommandId.startsWith('saved-view:')) {
          this.setSavedView(resolvedCommandId.slice('saved-view:'.length));
        } else if (resolvedCommandId.startsWith('follow-up-filter:')) {
          this.setFollowUpFilter(resolvedCommandId.slice('follow-up-filter:'.length));
        } else if (resolvedCommandId.startsWith('density:')) {
          this.setWorklistDensity(resolvedCommandId.slice('density:'.length));
        } else if (resolvedCommandId.startsWith('disclosure:')) {
          this.setDisclosureMode(resolvedCommandId.slice('disclosure:'.length));
        } else if (resolvedCommandId.startsWith('selection-mode:')) {
          const nextMode = asText(resolvedCommandId.slice('selection-mode:'.length)).toLowerCase();
          this.toggleSelectionMode(nextMode === 'on');
        } else if (resolvedCommandId.startsWith('thread:')) {
          this.selectThread(resolvedCommandId.slice('thread:'.length));
        } else if (resolvedCommandId.startsWith('action:')) {
          result = this.dispatchAction(resolvedCommandId.slice('action:'.length));
        }
        closeCommandPaletteState();
        return result;
      },
      applyBulkAction(action) {
        const safeAction = asText(action).toLowerCase();
        const selectedRowIds = cloneIdArray(uiState.selectedRowIds);
        if (!selectedRowIds.length) {
          return {
            toast: { title: 'CCO Next', tone: 'warning', message: 'Markera minst en tråd först.' },
          };
        }
        const actorLabel =
          typeof dependencies.getActorLabel === 'function' ? dependencies.getActorLabel() : 'CCO';
        const changedRows = [];
        selectedRowIds.forEach((threadId) => {
          const conversation = computeRowForId(threadId);
          if (!conversation) return;
          const ownerPatch =
            typeof dependencies.getOwnerPatch === 'function' ? dependencies.getOwnerPatch(conversation) : {};
          let patch = null;
          let historyLabel = '';
          let historyExcerpt = '';
          if (safeAction === 'assign_self') {
            patch = {
              ...ownerPatch,
              owner: actorLabel,
              handoffStatus: 'assigned',
              waitingOn: asText(conversation.waitingOn).toLowerCase() === 'owner' ? 'none' : conversation.waitingOn,
              lastActionTakenLabel: 'Bulk: ägare satt',
              lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
              previewSummary: {
                assignedTo: actorLabel,
                lastCaseSummary: 'Ägare satt via bulkhantering. Tråden har nu en tydlig operativ ägare.',
              },
            };
            historyLabel = 'Bulk: ägare satt';
            historyExcerpt = `${actorLabel} tog ansvar för tråden via bulkfältet.`;
          } else if (safeAction === 'snooze_tomorrow') {
            patch = {
              ...ownerPatch,
              queueOverride: 'follow_up_today',
              waitingOn: 'owner',
              handoffStatus: 'assigned',
              followUpSuggested: true,
              followUpDueAt: getTimestampOffset(21, 0, dependencies),
              lifecycleStage: 'Återuppta imorgon',
              nextActionLabel: 'Återuppta imorgon',
              nextActionSummary: 'Tråden är parkerad till nästa uppföljningsblock. Gå bara tillbaka tidigare om kunden svarar innan dess.',
              lastActionTakenLabel: 'Bulk: återuppta imorgon',
              lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
              previewSummary: {
                assignedTo: ownerPatch.owner || conversation.owner || actorLabel,
                lastCaseSummary: 'Bulkhantering parkerade tråden till nästa morgonblock för kontrollerad uppföljning.',
              },
            };
            historyLabel = 'Bulk: återuppta imorgon';
            historyExcerpt = 'Tråden parkerades i bulkhanteringen till nästa uppföljningsfönster.';
          } else if (safeAction === 'mark_handled') {
            patch = {
              ...ownerPatch,
              queueOverride: 'admin_low',
              waitingOn: 'none',
              handoffStatus: 'resolved',
              followUpSuggested: false,
              followUpDueAt: '',
              lifecycleStage: 'Hanterad',
              nextActionLabel: 'Ingen aktiv åtgärd',
              nextActionSummary: 'Tråden är klar för nu och ligger inte längre i den aktiva arbetskön.',
              lastActionTakenLabel: 'Bulk: markerad hanterad',
              lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
              draftStateLabel: 'Hanterad',
              previewSummary: {
                assignedTo: ownerPatch.owner || conversation.owner || actorLabel,
                lifecycleStatus: 'handled',
                lastCaseSummary: 'Tråden markerades som hanterad via bulkhantering och flyttades ur den aktiva arbetskön.',
              },
            };
            historyLabel = 'Bulk: markerad hanterad';
            historyExcerpt = 'Tråden markerades som hanterad via bulkhantering.';
          } else if (safeAction === 'move_admin') {
            patch = {
              ...ownerPatch,
              queueOverride: 'admin_low',
              waitingOn: 'owner',
              handoffStatus: 'assigned',
              followUpSuggested: true,
              followUpDueAt: getTimestampOffset(28, 0, dependencies),
              lifecycleStage: 'Adminblock',
              nextActionLabel: 'Återuppta adminspåret senare',
              nextActionSummary: 'Tråden kräver inget omedelbart beslut och ligger nu i admin-/lågprioritetsblocket.',
              lastActionTakenLabel: 'Bulk: flyttad till admin',
              lastActionTakenAt: getTimestampOffset(0, 0, dependencies),
              previewSummary: {
                assignedTo: ownerPatch.owner || conversation.owner || actorLabel,
                lastCaseSummary: 'Tråden flyttades via bulkhantering till admin-/lågprioritetsblocket.',
              },
            };
            historyLabel = 'Bulk: flyttad till admin';
            historyExcerpt = 'Tråden flyttades via bulkhanteringen till admin-/lågprioritetsblocket.';
          }
          if (!patch) return;
          applyLegacyPatch(threadId, patch);
          appendHistory(threadId, {
            label: historyLabel,
            excerpt: historyExcerpt,
          });
          changedRows.push(threadId);
        });
        clearSelectionState();
        return {
          toast: {
            title: 'CCO Next',
            tone: changedRows.length ? 'success' : 'warning',
            message: changedRows.length
              ? `${changedRows.length} trådar uppdaterades via bulkhantering.`
              : 'Ingen bulkåtgärd genomfördes.',
          },
        };
      },
      updateDraft(threadId, value) {
        setDraftValue(threadId, value);
        const actorLabel =
          typeof dependencies.getActorLabel === 'function' ? dependencies.getActorLabel() : 'CCO';
        updateCollaborationState(threadId, {
          draftOwner: actorLabel,
          draftUpdatedAt: getTimestampOffset(0, 0, dependencies),
          handoffRequest: '',
          handoffStatusDetail: `${actorLabel} redigerar senaste utkastet`,
        });
        const conversation = computeRowForId(asText(threadId));
        let draftPatch = null;
        if (conversation && typeof dependencies.buildStudioDraftPatch === 'function') {
          draftPatch = dependencies.buildStudioDraftPatch(
            conversation,
            cloneStudioState(conversation?.previewStudio),
            String(value == null ? '' : value)
          );
        }
        applyLegacyPatch(threadId, {
          draftStateLabel: 'Redigeras i studio',
          previewStudio: draftPatch?.previewStudio || {
            ...cloneStudioState(threadCasesById[asText(threadId)]?.studio),
            isOpen: true,
            currentDraftBody: String(value == null ? '' : value),
            editedDraftBody: String(value == null ? '' : value),
            draftSource: 'edited',
            sendReady: Boolean(String(value == null ? '' : value).trim()),
            lastEditedAt: getTimestampOffset(0, 0, dependencies),
          },
        });
        return getSnapshot();
      },
      updateStudioState,
      updateCollaborationState,
      dispatchAction,
    };
  }

  global.ArcanaCcoNextBackbone = {
    createStore,
    sanitizeScenario,
    sanitizeCenterTab,
    sanitizeSidebarTab,
    sanitizeSavedView,
    sanitizeFollowUpFilter,
    sanitizeWorklistDensity,
    sanitizeDisclosureMode,
  };
})(window);
