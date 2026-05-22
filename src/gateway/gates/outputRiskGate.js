const { toDecisionFromRiskEvaluation } = require('./inputRiskGate');

function outputRiskGate({ evaluation = {} } = {}) {
  const decision = toDecisionFromRiskEvaluation(evaluation);
  return {
    gate: 'outputRisk',
    decision,
    blocked: decision === 'blocked' || decision === 'critical_escalate',
    riskLevel: Math.max(1, Math.min(5, Number(evaluation?.riskLevel) || 1)),
    riskScore: Number(evaluation?.riskScore || 0),
    reasonCodes: Array.isArray(evaluation?.reasonCodes) ? evaluation.reasonCodes : [],
    evaluation,
  };
}

module.exports = {
  outputRiskGate,
};
