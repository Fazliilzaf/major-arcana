(function initArcanaCcoNextFollowUpEngine(global) {
  'use strict';

  const SNOOZE_PRESETS = Object.freeze([
    {
      key: 'later_today',
      label: 'Senare idag',
      category: 'Snabbval',
      mode: 'one_off',
      target: { type: 'offset', hours: 2, minutes: 0 },
      waitingOn: 'owner',
      queueOverride: 'follow_up_today',
      handoffStatus: 'scheduled_follow_up',
      lifecycleStage: 'Återupptas senare',
      dialogSummary: 'Parkera tråden kort och ta tillbaka den senare samma dag.',
    },
    {
      key: 'tomorrow_morning',
      label: 'Imorgon 09:00',
      category: 'Snabbval',
      mode: 'one_off',
      target: { type: 'exact', dayOffset: 1, hour: 9, minute: 0 },
      waitingOn: 'owner',
      queueOverride: 'follow_up_today',
      handoffStatus: 'scheduled_follow_up',
      lifecycleStage: 'Återupptas senare',
      dialogSummary: 'Flytta nästa aktiva steg till morgondagens första arbetsblock.',
    },
    {
      key: 'next_week',
      label: 'Nästa vecka',
      category: 'Snabbval',
      mode: 'one_off',
      target: { type: 'exact', dayOffset: 7, hour: 9, minute: 0 },
      waitingOn: 'owner',
      queueOverride: 'follow_up_today',
      handoffStatus: 'scheduled_follow_up',
      lifecycleStage: 'Återupptas senare',
      dialogSummary: 'Pausa tråden till nästa vecka men behåll tydligt ägarskap.',
    },
    {
      key: 'until_customer_replies',
      label: 'Tills kunden svarar',
      category: 'Vänta',
      mode: 'wait_until_reply',
      target: { type: 'exact', dayOffset: 2, hour: 11, minute: 0 },
      waitingOn: 'customer',
      queueOverride: 'waiting_reply',
      handoffStatus: 'awaiting_reply',
      lifecycleStage: 'Väntar på kunds svar',
      fallbackAction: 'soft_nudge',
      dialogSummary: 'Håll tråden i vänteläge tills kunden svarar eller nytt follow-up-fönster öppnas.',
    },
    {
      key: 'weekly_checkin',
      label: 'Varje vecka',
      category: 'Återkommande',
      mode: 'recurring',
      target: { type: 'exact', dayOffset: 7, hour: 9, minute: 0 },
      waitingOn: 'owner',
      queueOverride: 'follow_up_today',
      handoffStatus: 'scheduled_follow_up',
      lifecycleStage: 'Återkommande uppföljning',
      recurringCadence: 'weekly',
      dialogSummary: 'Återöppna tråden veckovis tills läget ändras eller kunden svarar.',
    },
    {
      key: 'three_step_nudge',
      label: 'Nudgesekvens i 3 steg',
      category: 'Sekvens',
      mode: 'sequence',
      target: { type: 'exact', dayOffset: 1, hour: 10, minute: 0 },
      waitingOn: 'customer',
      queueOverride: 'waiting_reply',
      handoffStatus: 'awaiting_reply',
      lifecycleStage: 'Sekvens aktiv',
      sequenceKey: 'three_step_nudge',
      sequenceLabel: 'Mjuk nudgesekvens',
      sequenceStep: 1,
      sequenceTotalSteps: 3,
      fallbackAction: 'mark_dormant',
      dialogSummary: 'Starta en mjuk sekvens som påminner kunden i tre tydliga steg.',
    },
  ]);

  const SCHEDULE_PRESETS = Object.freeze([
    {
      key: 'today_1700',
      label: 'Idag 17:00',
      category: 'Utskick',
      mode: 'scheduled_send',
      target: { type: 'exact', dayOffset: 0, hour: 17, minute: 0 },
      waitingOn: 'owner',
      queueOverride: 'follow_up_today',
      handoffStatus: 'scheduled_follow_up',
      lifecycleStage: 'Schemalagt utskick',
      dialogSummary: 'Planera nästa utskick innan dagen är slut.',
    },
    {
      key: 'tomorrow_0900',
      label: 'Imorgon 09:00',
      category: 'Utskick',
      mode: 'scheduled_send',
      target: { type: 'exact', dayOffset: 1, hour: 9, minute: 0 },
      waitingOn: 'owner',
      queueOverride: 'follow_up_today',
      handoffStatus: 'scheduled_follow_up',
      lifecycleStage: 'Schemalagt utskick',
      dialogSummary: 'Lägg utskicket i morgondagens första block utan att tappa draft eller ägare.',
    },
    {
      key: 'next_week',
      label: 'Nästa vecka',
      category: 'Utskick',
      mode: 'scheduled_send',
      target: { type: 'exact', dayOffset: 7, hour: 9, minute: 0 },
      waitingOn: 'owner',
      queueOverride: 'follow_up_today',
      handoffStatus: 'scheduled_follow_up',
      lifecycleStage: 'Schemalagt utskick',
      dialogSummary: 'Planera nästa utskick till nästa vecka men låt systemet bevaka om det är för långt bort.',
    },
  ]);

  function asText(value, fallback = '') {
    const safeValue = String(value == null ? '' : value).trim();
    return safeValue || fallback;
  }

  function asLower(value, fallback = '') {
    return asText(value, fallback).toLowerCase();
  }

  function describeDue(timestampValue, nowTimestamp) {
    const numericTimestamp = Number(timestampValue);
    const timestamp = Number.isFinite(numericTimestamp)
      ? numericTimestamp
      : Date.parse(String(timestampValue || ''));
    if (!Number.isFinite(timestamp)) {
      return {
        label: 'Ingen deadline',
        isToday: false,
        isTomorrow: false,
        isDueSoon: false,
        isOverdue: false,
      };
    }
    const safeNow = Number.isFinite(Number(nowTimestamp)) ? Number(nowTimestamp) : Date.now();
    const diffMs = timestamp - safeNow;
    const diffHours = diffMs / 3600000;
    const now = new Date(safeNow);
    const dueDate = new Date(timestamp);
    const sameDay =
      now.getFullYear() === dueDate.getFullYear() &&
      now.getMonth() === dueDate.getMonth() &&
      now.getDate() === dueDate.getDate();
    const tomorrow = new Date(safeNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      tomorrow.getFullYear() === dueDate.getFullYear() &&
      tomorrow.getMonth() === dueDate.getMonth() &&
      tomorrow.getDate() === dueDate.getDate();
    const timeLabel = new Intl.DateTimeFormat('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(dueDate);
    let label = new Intl.DateTimeFormat('sv-SE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dueDate);
    if (sameDay) label = `Idag ${timeLabel}`;
    else if (isTomorrow) label = `Imorgon ${timeLabel}`;
    return {
      label,
      isToday: sameDay,
      isTomorrow,
      isDueSoon: diffMs >= 0 && diffHours <= 2,
      isOverdue: diffMs < 0,
    };
  }

  function buildExactTimestamp(nowTimestamp, dayOffset, hour, minute) {
    const now = new Date(nowTimestamp);
    const targetMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + Number(dayOffset || 0),
      Number(hour || 0),
      Number(minute || 0),
      0,
      0
    );
    return targetMs;
  }

  function resolveTargetTimestamp(definition, nowTimestamp) {
    if (!definition || !definition.target) return Number(nowTimestamp) || Date.now();
    if (definition.target.type === 'offset') {
      return Number(nowTimestamp) + Number(definition.target.hours || 0) * 3600000 + Number(definition.target.minutes || 0) * 60000;
    }
    let targetMs = buildExactTimestamp(
      nowTimestamp,
      definition.target.dayOffset,
      definition.target.hour,
      definition.target.minute
    );
    if (targetMs <= Number(nowTimestamp) && Number(definition.target.dayOffset || 0) === 0) {
      targetMs = Number(nowTimestamp) + 2 * 3600000;
    }
    return targetMs;
  }

  function formatCadenceLabel(cadence = '') {
    const normalized = asLower(cadence);
    if (normalized === 'daily') return 'varje dag';
    if (normalized === 'weekly') return 'varje vecka';
    if (normalized === 'biweekly') return 'varannan vecka';
    if (normalized === 'monthly') return 'varje månad';
    return asText(cadence);
  }

  function getSlaGuardWindow(conversation, nowTimestamp) {
    const slaState = asLower(conversation?.slaStatus);
    const riskLevel = asLower(conversation?.escalationRisk);
    if (slaState === 'breach' || riskLevel === 'high') {
      return {
        severity: 'critical',
        latestTimestamp: buildExactTimestamp(nowTimestamp, 0, 17, 0),
      };
    }
    if (slaState === 'warning' || riskLevel === 'medium') {
      return {
        severity: 'watch',
        latestTimestamp: buildExactTimestamp(nowTimestamp, 1, 9, 0),
      };
    }
    return null;
  }

  function applySlaGuard(conversation, definition, targetTimestamp, nowTimestamp) {
    const guard = getSlaGuardWindow(conversation, nowTimestamp);
    if (!guard) {
      return {
        targetTimestamp,
        slaGuardStatus: 'clear',
        slaGuardMessage: '',
      };
    }
    if (targetTimestamp > guard.latestTimestamp) {
      const adjustedLabel = describeDue(guard.latestTimestamp, nowTimestamp).label;
      return {
        targetTimestamp: guard.latestTimestamp,
        slaGuardStatus: 'adjusted',
        slaGuardMessage:
          guard.severity === 'critical'
            ? `SLA-vakten kortade första uppföljningen till ${adjustedLabel.toLowerCase()} så att tråden inte lämnar aktivt läge för länge.`
            : `SLA-vakten flyttade första uppföljningen till ${adjustedLabel.toLowerCase()} eftersom tråden redan ligger nära dagens riskfönster.`,
      };
    }
    return {
      targetTimestamp,
      slaGuardStatus: guard.severity === 'critical' ? 'watch' : 'watch',
      slaGuardMessage:
        guard.severity === 'critical'
          ? 'SLA-vakten bevakar detta upplägg extra noga eftersom tråden redan ligger i högriskläge.'
          : 'SLA-vakten bevakar att uppföljningen inte glider för långt från nästa säkra arbetsfönster.',
    };
  }

  function buildPresetBadges(plan) {
    const badges = [];
    if (plan.waitUntilReply) badges.push({ label: 'Tills svar', tone: 'neutral' });
    if (plan.recurringCadence) badges.push({ label: formatCadenceLabel(plan.recurringCadence), tone: 'neutral' });
    if (plan.followUpSequenceLabel) badges.push({ label: `Steg ${plan.followUpSequenceStep}/${plan.followUpSequenceTotalSteps}`, tone: 'warn' });
    if (plan.slaGuardStatus === 'adjusted') badges.push({ label: 'SLA-vakt', tone: 'danger' });
    else if (plan.slaGuardStatus === 'watch') badges.push({ label: 'SLA-bevakning', tone: 'warn' });
    return badges;
  }

  function buildPlanSummary(plan) {
    if (plan.followUpMode === 'wait_until_reply') {
      return `Vänta på kundens svar. Om inget svar kommer före ${plan.dueLabel.toLowerCase()} öppnas tråden igen för en mjuk nudge.`;
    }
    if (plan.followUpMode === 'sequence') {
      return `${plan.followUpSequenceLabel} startar nu. Steg ${plan.followUpSequenceStep} följs upp ${plan.dueLabel.toLowerCase()} om kunden fortfarande är tyst.`;
    }
    if (plan.followUpMode === 'recurring') {
      return `Första återtag sker ${plan.dueLabel.toLowerCase()}. Därefter återkommer tråden ${formatCadenceLabel(
        plan.recurringCadence
      )}.`;
    }
    if (plan.followUpMode === 'scheduled_send') {
      return `Nästa utskick ligger ${plan.dueLabel.toLowerCase()} och samma ägare behåller kontrollen fram till dess.`;
    }
    return `Tråden tas tillbaka ${plan.dueLabel.toLowerCase()} av samma ägare.`;
  }

  function createPlan(definition, options = {}) {
    const safeDefinition = definition || {};
    const conversation = options.conversation || {};
    const nowTimestamp = Number.isFinite(Number(options.nowTimestamp))
      ? Number(options.nowTimestamp)
      : Date.now();
    const initialTargetTimestamp = resolveTargetTimestamp(safeDefinition, nowTimestamp);
    const guard = applySlaGuard(conversation, safeDefinition, initialTargetTimestamp, nowTimestamp);
    const due = describeDue(guard.targetTimestamp, nowTimestamp);
    const followUpMode = asText(safeDefinition.mode || 'one_off');
    const plan = {
      key: asText(safeDefinition.key),
      label: asText(safeDefinition.label || 'Preset'),
      category: asText(safeDefinition.category || 'Snabbval'),
      followUpMode,
      targetTimestamp: guard.targetTimestamp,
      targetAt: new Date(guard.targetTimestamp).toISOString(),
      dueLabel: due.label,
      waitingOn: asText(safeDefinition.waitingOn || 'owner', 'owner'),
      queueOverride: asText(safeDefinition.queueOverride || 'follow_up_today', 'follow_up_today'),
      handoffStatus: asText(safeDefinition.handoffStatus || 'scheduled_follow_up', 'scheduled_follow_up'),
      lifecycleStage: asText(safeDefinition.lifecycleStage || 'Återupptas senare', 'Återupptas senare'),
      waitUntilReply: safeDefinition.mode === 'wait_until_reply',
      recurringCadence: asText(safeDefinition.recurringCadence),
      followUpSequenceKey: asText(safeDefinition.sequenceKey),
      followUpSequenceLabel: asText(safeDefinition.sequenceLabel),
      followUpSequenceStep: Number(safeDefinition.sequenceStep || 0) || 0,
      followUpSequenceTotalSteps: Number(safeDefinition.sequenceTotalSteps || 0) || 0,
      followUpFallbackAction: asText(safeDefinition.fallbackAction),
      slaGuardStatus: asText(guard.slaGuardStatus, 'clear'),
      slaGuardMessage: asText(guard.slaGuardMessage),
    };
    plan.badges = buildPresetBadges(plan);
    plan.dialogSummary = asText(safeDefinition.dialogSummary || buildPlanSummary(plan));
    plan.dialogSupport = plan.slaGuardMessage || buildPlanSummary(plan);
    plan.nextActionLabel =
      followUpMode === 'wait_until_reply'
        ? `Följ upp om inget svar innan ${plan.dueLabel}`
        : followUpMode === 'sequence'
        ? `Starta steg ${plan.followUpSequenceStep} före ${plan.dueLabel}`
        : followUpMode === 'recurring'
        ? `Återuppta ${plan.dueLabel} och sedan ${formatCadenceLabel(plan.recurringCadence)}`
        : followUpMode === 'scheduled_send'
        ? `Skicka ${plan.dueLabel}`
        : `Återuppta ${plan.dueLabel}`;
    plan.nextActionSummary =
      plan.slaGuardMessage && plan.slaGuardStatus === 'adjusted'
        ? `${buildPlanSummary(plan)} ${plan.slaGuardMessage}`.trim()
        : buildPlanSummary(plan);
    return plan;
  }

  function findPreset(definitions, presetKey) {
    const safeKey = asText(presetKey);
    return definitions.find((entry) => entry.key === safeKey) || definitions[0];
  }

  function buildSnoozePlan(options = {}) {
    return createPlan(findPreset(SNOOZE_PRESETS, options.presetKey), options);
  }

  function buildSchedulePlan(options = {}) {
    return createPlan(findPreset(SCHEDULE_PRESETS, options.presetKey), options);
  }

  function buildReturnLaterPlan(options = {}) {
    return createPlan(
      {
        key: 'return_later',
        label: 'Återuppta senare',
        category: 'Snabbval',
        mode: 'one_off',
        target: { type: 'exact', dayOffset: 1, hour: 11, minute: 15 },
        waitingOn: 'owner',
        queueOverride: 'follow_up_today',
        handoffStatus: 'scheduled_follow_up',
        lifecycleStage: 'Återupptas senare',
        dialogSummary: 'Parkera tråden till nästa tydliga arbetsblock utan att tappa ägarskap.',
      },
      options
    );
  }

  function getSnoozePresets(options = {}) {
    return SNOOZE_PRESETS.map((definition) => createPlan(definition, options));
  }

  function getSchedulePresets(options = {}) {
    return SCHEDULE_PRESETS.map((definition) => createPlan(definition, options));
  }

  global.ArcanaCcoNextFollowUpEngine = {
    describeDue,
    formatCadenceLabel,
    getSnoozePresets,
    getSchedulePresets,
    buildSnoozePlan,
    buildSchedulePlan,
    buildReturnLaterPlan,
  };
})(typeof window !== 'undefined' ? window : globalThis);
