'use strict';

/* ─── ccoCustomerJourneyStore — Komm Sprint 5 ────────────────────────────
 *
 * Tracka per (customerId, tenantId): currentStep, completedSteps,
 * stepHistory. 12 kanonska kundrese-steg (sammankopplade med Sprint 2
 * templates och Sprint 3 cron-triggers).
 *
 * Owner-mandat:
 *  - Ingen extern AI på journal
 *  - Inga auto-utskick
 *  - Audit på varje advance/rollback
 *  - PII-mask i audit (bara stepId + reason, ingen patientdata)
 *
 * State machine (12 steg, linear-ish):
 *   1.  lead_first_contact
 *   2.  consultation_booked
 *   3.  consultation_done
 *   4.  treatment_offered
 *   5.  agreement_signed
 *   6.  pre_treatment_documents
 *   7.  treatment_booked
 *   8.  treatment_done
 *   9.  aftercare_d7
 *   10. aftercare_d30
 *   11. follow_up_3m
 *   12. completed
 *
 * Sidovägar: cancelled / no_show / on_hold (kan sättas från vilket steg som helst).
 * ────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const STEPS = [
  { id: 'lead_first_contact', label: 'Lead välkomnande', order: 1 },
  { id: 'consultation_booked', label: 'Konsultation bokad', order: 2 },
  { id: 'consultation_done', label: 'Konsultation klar', order: 3 },
  { id: 'treatment_offered', label: 'Behandlingsförslag', order: 4 },
  { id: 'agreement_signed', label: 'Avtal signerat', order: 5 },
  { id: 'pre_treatment_documents', label: 'Dokument inskickade', order: 6 },
  { id: 'treatment_booked', label: 'Behandling bokad', order: 7 },
  { id: 'treatment_done', label: 'Behandling klar', order: 8 },
  { id: 'aftercare_d7', label: 'Eftervård vecka 1', order: 9 },
  { id: 'aftercare_d30', label: 'Eftervård 30 dagar', order: 10 },
  { id: 'follow_up_3m', label: 'Uppföljning 3 mån', order: 11 },
  { id: 'completed', label: 'Avslutat', order: 12 },
];

const SIDE_STATES = ['cancelled', 'no_show', 'on_hold'];

const STEP_IDS = STEPS.map((s) => s.id);
const VALID_STATES = STEP_IDS.concat(SIDE_STATES);

function nowIso() {
  return new Date().toISOString();
}

function loadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function getStepDef(stepId) {
  return STEPS.find((s) => s.id === stepId) || null;
}

async function createCcoCustomerJourneyStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath required');

  const state = loadJson(filePath) || { journeys: {}, lastSavedAt: null };
  if (!state.journeys) state.journeys = {};

  function persist() {
    state.lastSavedAt = nowIso();
    saveJson(filePath, state);
  }

  function key(tenantId, customerId) {
    return String(tenantId || 'hair_tp') + '::' + String(customerId || '');
  }

  function logAudit(eventKind, detail = {}) {
    try {
      if (auditLog?.logEvent) {
        auditLog.logEvent({
          kind: eventKind,
          tenantId: detail.tenantId || 'hair_tp',
          actor: detail.actor || 'staff',
          entityKind: 'customer_journey',
          entityId: detail.customerId,
          detail: {
            previousStep: detail.previousStep,
            newStep: detail.newStep,
            reason: detail.reason,
            triggerSource: detail.triggerSource,
          },
        });
      }
    } catch {
      /* audit bind fail ignored */
    }
  }

  function getJourney(customerId, { tenantId = 'hair_tp' } = {}) {
    const k = key(tenantId, customerId);
    const j = state.journeys[k];
    if (!j) {
      return {
        customerId,
        tenantId,
        currentStep: 'lead_first_contact',
        completedSteps: [],
        stepHistory: [],
        sideState: null,
        createdAt: null,
        updatedAt: null,
        steps: STEPS.map((s) => ({
          ...s,
          state: s.id === 'lead_first_contact' ? 'current' : 'pending',
        })),
        sideStates: SIDE_STATES,
      };
    }
    // Build derived steps view
    const completed = new Set(j.completedSteps || []);
    const cur = j.currentStep;
    const steps = STEPS.map((s) => ({
      ...s,
      state: completed.has(s.id) ? 'completed' : s.id === cur ? 'current' : 'pending',
    }));
    return {
      ...j,
      steps,
      sideStates: SIDE_STATES,
    };
  }

  function ensureJourney(customerId, tenantId = 'hair_tp') {
    const k = key(tenantId, customerId);
    if (!state.journeys[k]) {
      state.journeys[k] = {
        customerId,
        tenantId,
        currentStep: 'lead_first_contact',
        completedSteps: [],
        stepHistory: [],
        sideState: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }
    return state.journeys[k];
  }

  function advanceTo({
    customerId,
    tenantId = 'hair_tp',
    targetStep,
    reason = '',
    triggerSource = 'manual',
    actor = 'staff',
  } = {}) {
    if (!customerId) throw new Error('customerId krävs');
    if (!VALID_STATES.includes(targetStep)) {
      throw new Error('invalid step: ' + targetStep);
    }
    const j = ensureJourney(customerId, tenantId);
    const previousStep = j.currentStep;
    const previousSide = j.sideState;

    if (SIDE_STATES.includes(targetStep)) {
      j.sideState = targetStep;
    } else {
      j.sideState = null;
      // Lägg tidigare currentStep till completed
      if (j.currentStep && j.currentStep !== targetStep) {
        if (!j.completedSteps.includes(j.currentStep)) {
          j.completedSteps.push(j.currentStep);
        }
        // Markera alla steg < targetStep.order som completed
        const targetOrder = getStepDef(targetStep)?.order || 0;
        for (const s of STEPS) {
          if (s.order < targetOrder && !j.completedSteps.includes(s.id)) {
            j.completedSteps.push(s.id);
          }
        }
      }
      j.currentStep = targetStep;
    }

    j.stepHistory.push({
      ts: nowIso(),
      actor,
      triggerSource,
      previousStep,
      newStep: targetStep,
      previousSide,
      newSide: j.sideState,
      reason: reason || null,
    });
    if (j.stepHistory.length > 200) j.stepHistory = j.stepHistory.slice(-200);
    j.updatedAt = nowIso();

    persist();
    logAudit('journey.advance', {
      tenantId,
      actor,
      customerId,
      previousStep,
      newStep: targetStep,
      reason,
      triggerSource,
    });
    return getJourney(customerId, { tenantId });
  }

  function rollback({ customerId, tenantId = 'hair_tp', actor = 'staff', reason = '' } = {}) {
    if (!customerId) throw new Error('customerId krävs');
    const k = key(tenantId, customerId);
    const j = state.journeys[k];
    if (!j) throw new Error('no journey för kund');
    const last = j.stepHistory[j.stepHistory.length - 1];
    if (!last) throw new Error('no history att rolla tillbaka');

    const previousStep = j.currentStep;
    j.currentStep = last.previousStep;
    j.sideState = last.previousSide;
    // Ta bort newStep från completed om finns
    j.completedSteps = j.completedSteps.filter((s) => s !== last.newStep);
    j.stepHistory.push({
      ts: nowIso(),
      actor,
      triggerSource: 'rollback',
      previousStep,
      newStep: j.currentStep,
      previousSide: j.sideState,
      newSide: j.sideState,
      reason: reason || 'rollback to previous',
    });
    j.updatedAt = nowIso();
    persist();
    logAudit('journey.rollback', {
      tenantId,
      actor,
      customerId,
      previousStep,
      newStep: j.currentStep,
      reason,
    });
    return getJourney(customerId, { tenantId });
  }

  function listAtStep(stepId, { tenantId = null, limit = 100 } = {}) {
    let entries = Object.values(state.journeys);
    if (tenantId) entries = entries.filter((j) => j.tenantId === tenantId);
    entries = entries.filter((j) => j.currentStep === stepId);
    return entries.slice(0, limit);
  }

  function stats({ tenantId = null } = {}) {
    let entries = Object.values(state.journeys);
    if (tenantId) entries = entries.filter((j) => j.tenantId === tenantId);
    const byStep = {};
    for (const id of STEP_IDS) byStep[id] = 0;
    const bySide = { cancelled: 0, no_show: 0, on_hold: 0 };
    let total = 0;
    for (const j of entries) {
      total += 1;
      if (j.sideState && bySide[j.sideState] != null) bySide[j.sideState] += 1;
      if (j.currentStep && byStep[j.currentStep] != null) byStep[j.currentStep] += 1;
    }
    return { total, byStep, bySide, lastSavedAt: state.lastSavedAt };
  }

  return {
    STEPS,
    STEP_IDS,
    SIDE_STATES,
    VALID_STATES,
    getJourney,
    advanceTo,
    rollback,
    listAtStep,
    stats,
  };
}

module.exports = {
  createCcoCustomerJourneyStore,
  STEPS,
  STEP_IDS,
  SIDE_STATES,
  VALID_STATES,
};
