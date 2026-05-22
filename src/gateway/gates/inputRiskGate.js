function toDecisionFromRiskEvaluation(evaluation = {}) {
  const riskLevel = Math.max(1, Math.min(5, Number(evaluation?.riskLevel) || 1));
  const rawDecision = String(evaluation?.decision || '').toLowerCase();

  if (rawDecision === 'blocked' && riskLevel >= 5) return 'critical_escalate';
  if (rawDecision === 'blocked') return 'blocked';
  if (rawDecision === 'review_required') return 'review_required';
  if (riskLevel >= 2) return 'allow_flag';
  return 'allow';
}

function inputRiskGate({ evaluation = {} } = {}) {
  const decision = toDecisionFromRiskEvaluation(evaluation);
  return {
    gate: 'inputRisk',
    decision,
    blocked: decision === 'blocked' || decision === 'critical_escalate',
    riskLevel: Math.max(1, Math.min(5, Number(evaluation?.riskLevel) || 1)),
    riskScore: Number(evaluation?.riskScore || 0),
    reasonCodes: Array.isArray(evaluation?.reasonCodes) ? evaluation.reasonCodes : [],
    evaluation,
  };
}

module.exports = {
  inputRiskGate,
  toDecisionFromRiskEvaluation,
};
