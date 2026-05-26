'use strict';

/**
 * Staff Onboarding Wizard.
 *
 * Guidar ny personal genom:
 * 1. Första inloggning + lösenordsbyte
 * 2. Profil-setup (namn, roll, foto)
 * 3. Första patient-sökning
 * 4. Ta bild / journal-demo
 * 5. Signera test-journal
 * 6. Klart!
 *
 * Progress sparas per user. Wizard visas tills alla steg är klara.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

const ONBOARDING_STEPS = Object.freeze([
  {
    stepId: 'welcome',
    order: 1,
    title: 'Välkommen till Arcana',
    description: 'Du är nu registrerad. Låt oss komma igång!',
    action: 'Klicka Nästa för att börja',
    autoComplete: true,
  },
  {
    stepId: 'change_password',
    order: 2,
    title: 'Byt lösenord',
    description: 'Välj ett eget lösenord som du kommer ihåg.',
    action: 'Byt lösenord i profilen',
    verifyField: 'passwordChanged',
  },
  {
    stepId: 'profile_setup',
    order: 3,
    title: 'Fyll i din profil',
    description: 'Lägg till ditt namn och vilken roll du har på kliniken.',
    action: 'Spara namn och roll',
    verifyField: 'profileCompleted',
  },
  {
    stepId: 'find_patient',
    order: 4,
    title: 'Hitta en patient',
    description: 'Sök på ett namn i kundlistan. Prova att öppna ett kundkort.',
    action: 'Sök och öppna ett kundkort',
    verifyField: 'patientViewed',
  },
  {
    stepId: 'take_photo',
    order: 5,
    title: 'Ta en bild',
    description: 'Använd kameran för att ta en testbild. Bilden kopplas till patienten.',
    action: 'Ta bild med mobilen',
    verifyField: 'photoTaken',
  },
  {
    stepId: 'sign_journal',
    order: 6,
    title: 'Signera journal',
    description: 'Öppna en behandlingsplan och signera den. Det här är samma flöde som vid riktiga konsultationer.',
    action: 'Öppna journal → Signera',
    verifyField: 'journalSigned',
  },
  {
    stepId: 'complete',
    order: 7,
    title: 'Klart! 🎉',
    description: 'Du har genomfört alla steg. Systemet är redo att användas.',
    action: null,
    autoComplete: true,
  },
]);

function createOnboardingStore({ filePath }) {
  let state = { users: {} };

  async function load() {
    try { state = JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { /* first run */ }
    if (!state.users) state.users = {};
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  function getProgress(userId) {
    const uid = normalizeText(userId);
    if (!state.users[uid]) {
      state.users[uid] = {
        userId: uid,
        startedAt: nowIso(),
        completedAt: null,
        currentStep: 'welcome',
        completedSteps: [],
        verifications: {},
      };
    }
    return state.users[uid];
  }

  function getStatus(userId) {
    const progress = getProgress(userId);
    const currentStepDef = ONBOARDING_STEPS.find((s) => s.stepId === progress.currentStep) || ONBOARDING_STEPS[0];
    const totalSteps = ONBOARDING_STEPS.length;
    const completedCount = progress.completedSteps.length;
    const isComplete = progress.completedAt !== null || progress.currentStep === 'complete';

    return {
      userId: progress.userId,
      isComplete,
      currentStep: currentStepDef,
      completedSteps: progress.completedSteps,
      progress: Math.round((completedCount / totalSteps) * 100),
      totalSteps,
      completedCount,
      startedAt: progress.startedAt,
      completedAt: progress.completedAt,
      allSteps: ONBOARDING_STEPS.map((step) => ({
        ...step,
        completed: progress.completedSteps.includes(step.stepId),
        current: step.stepId === progress.currentStep,
      })),
    };
  }

  async function completeStep(userId, stepId, verification = {}) {
    const progress = getProgress(userId);
    const stepDef = ONBOARDING_STEPS.find((s) => s.stepId === stepId);
    if (!stepDef) return { ok: false, error: 'invalid_step' };

    if (!progress.completedSteps.includes(stepId)) {
      progress.completedSteps.push(stepId);
    }

    if (verification && typeof verification === 'object') {
      Object.assign(progress.verifications, verification);
    }

    const currentIdx = ONBOARDING_STEPS.findIndex((s) => s.stepId === stepId);
    const nextStep = ONBOARDING_STEPS[currentIdx + 1];

    if (nextStep) {
      progress.currentStep = nextStep.stepId;
      if (nextStep.autoComplete) {
        progress.completedSteps.push(nextStep.stepId);
        const afterNext = ONBOARDING_STEPS[currentIdx + 2];
        if (afterNext) progress.currentStep = afterNext.stepId;
        else { progress.currentStep = 'complete'; progress.completedAt = nowIso(); }
      }
    } else {
      progress.currentStep = 'complete';
      progress.completedAt = nowIso();
    }

    await persist();
    return { ok: true, status: getStatus(userId) };
  }

  async function resetProgress(userId) {
    const uid = normalizeText(userId);
    delete state.users[uid];
    await persist();
    return { ok: true };
  }

  function listIncomplete() {
    return Object.values(state.users).filter((u) => !u.completedAt).map((u) => ({
      userId: u.userId,
      currentStep: u.currentStep,
      progress: Math.round((u.completedSteps.length / ONBOARDING_STEPS.length) * 100),
      startedAt: u.startedAt,
    }));
  }

  return { load, persist, getProgress, getStatus, completeStep, resetProgress, listIncomplete, ONBOARDING_STEPS };
}

module.exports = { createOnboardingStore, ONBOARDING_STEPS };
