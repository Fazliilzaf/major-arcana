'use strict';

/**
 * Read-only arbetspass-status för Journalpilot (ingen journal-write-logik).
 */

const SHIFT_LABELS = Object.freeze({
  redo_att_borja: 'Redo att börja',
  pagar: 'Pågår',
  fel_upptackt: 'Fel upptäckt',
  pausad: 'Pausad',
  klar_for_dagen: 'Klar för dagen',
});

function pilotsAllPass(pilot1, pilot2, pilot3) {
  return pilot1 === 'PASS' && pilot2 === 'PASS' && pilot3 === 'PASS';
}

function computeJournalPilotShiftStatus({
  presentationGate = 'UNKNOWN',
  journalE2E = 'UNKNOWN',
  demoLinks = 'UNKNOWN',
  pilot1 = 'UNKNOWN',
  pilot2 = 'UNKNOWN',
  pilot3 = 'UNKNOWN',
  journalLive = null,
} = {}) {
  const last = journalLive?.last24h || {};
  const errors = Number(last.errorsCount ?? 0);
  const route5xx = Number(journalLive?.route5xxCount ?? 0);
  const activity = Number(last.journalEntriesActivity ?? 0);
  const signed = Number(last.signedCount ?? 0);
  const corrections = Number(last.correctionsCount ?? 0);
  const personalJa = journalLive?.personalCanContinueJournaling === 'JA';
  const livePass = journalLive?.overall === 'PASS';
  const gatePass = presentationGate === 'PASS';
  const e2ePass = journalE2E === 'PASS';
  const linksPass = demoLinks === 'PASS';
  const pilotsPass = pilotsAllPass(pilot1, pilot2, pilot3);

  const systemReady = gatePass && e2ePass && linksPass && pilotsPass && livePass && personalJa;
  const hasFault = errors > 0 || route5xx > 0 || !livePass || !gatePass || !e2ePass || !pilotsPass;
  const hasWork = activity > 0 || signed > 0 || corrections > 0;

  let shiftStatus = 'redo_att_borja';
  let reason = 'System grönt — inget journalförande registrerat senaste 24h.';

  if (hasFault) {
    shiftStatus = 'fel_upptackt';
    if (errors > 0) reason = `Journal errors senaste 24h: ${errors}.`;
    else if (route5xx > 0) reason = `Route 5xx: ${route5xx}.`;
    else if (!gatePass || !e2ePass || !pilotsPass)
      reason = 'Presentation-gate eller pilot/E2E ej PASS.';
    else reason = 'Live monitor eller routes ej gröna.';
  } else if (!systemReady) {
    shiftStatus = 'pausad';
    reason = personalJa
      ? 'Väntar på grönt system (gate/demo/piloter).'
      : 'Personal bör pausa journalföring tills live monitor är JA.';
  } else if (hasWork) {
    shiftStatus = 'pagar';
    reason = `Aktivitet senaste 24h: ${activity} · signerade ${signed} · rättelser ${corrections}.`;
  } else {
    shiftStatus = 'redo_att_borja';
    reason = 'Allt grönt — personal kan starta arbetspass.';
  }

  return {
    shiftStatus,
    shiftStatusLabel: SHIFT_LABELS[shiftStatus] || shiftStatus,
    reason,
    systemReady,
    hasFault,
    hasWork,
    allShiftStates: Object.keys(SHIFT_LABELS).map((id) => ({
      id,
      label: SHIFT_LABELS[id],
      active: id === shiftStatus,
    })),
  };
}

module.exports = {
  SHIFT_LABELS,
  computeJournalPilotShiftStatus,
};
