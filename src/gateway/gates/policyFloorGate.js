function policyFloorGate({ evaluation = {} } = {}) {
  const blocked = Boolean(evaluation?.blocked);
  const maxFloor = Math.max(1, Math.min(5, Number(evaluation?.maxFloor) || 1));
  const hits = Array.isArray(evaluation?.hits) ? evaluation.hits : [];
  const reasonCodes = hits
    .map((hit) => String(hit?.id || '').trim())
    .filter(Boolean);

  let decision = 'allow';
  if (blocked && maxFloor >= 5) decision = 'critical_escalate';
  else if (blocked) decision = 'blocked';
  else if (maxFloor >= 3 || reasonCodes.length > 0) decision = 'allow_flag';

  return {
    gate: 'policyFloor',
    decision,
    blocked: decision === 'blocked' || decision === 'critical_escalate',
    maxFloor,
    reasonCodes,
    evaluation,
  };
}

module.exports = {
  policyFloorGate,
};
