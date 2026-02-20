const POLICY_VERSION = '1.0.0';

const RAW_RULES = Object.freeze([
  {
    id: 'NO_DIAGNOSIS_POLICY',
    label: 'Diagnosuttryck förbjudet',
    description: 'Systemet får inte ställa diagnos eller diagnostisera patienter.',
    floor: 4,
    severity: 'high',
    pattern: /\b(diagnos|diagnostiser[a-z]*|du har sjukdomen|du lider av)\b/i,
    appliesTo: ['templates', 'patient_response', 'orchestrator'],
  },
  {
    id: 'NO_GUARANTEE_POLICY',
    label: 'Medicinska garantier förbjudna',
    description: 'Systemet får inte ge garanti om resultat eller säker effekt.',
    floor: 4,
    severity: 'high',
    pattern: /\b(garanti|garanterar|100\s*%|helt säker effekt)\b/i,
    appliesTo: ['templates', 'patient_response', 'orchestrator'],
  },
  {
    id: 'ACUTE_ESCALATION_REQUIRED',
    label: 'Akut ärende kräver eskalering',
    description: 'Om akut/alarmerande symptom nämns ska eskalering till 112/akutvård finnas.',
    floor: 5,
    severity: 'critical',
    pattern: /\b(akut|svår smärta|andningssvårigheter|ring 112)\b/i,
    requiresEscalationPhrase: true,
    appliesTo: ['templates', 'patient_response', 'orchestrator'],
  },
  {
    id: 'UNSAFE_MEDICAL_CLAIM',
    label: 'Osäkra medicinska påståenden',
    description: 'Systemet får inte lova bot, riskfri behandling eller avsaknad av biverkningar.',
    floor: 4,
    severity: 'high',
    pattern: /\b(läkande garanti|botar|riskfri behandling|utan biverkningar)\b/i,
    appliesTo: ['templates', 'patient_response', 'orchestrator'],
  },
]);

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function getPolicyFloorDefinition() {
  return {
    version: POLICY_VERSION,
    immutable: true,
    rules: RAW_RULES.map((rule) => ({
      id: rule.id,
      label: rule.label,
      description: rule.description,
      floor: rule.floor,
      severity: rule.severity,
      appliesTo: [...rule.appliesTo],
      requiresEscalationPhrase: Boolean(rule.requiresEscalationPhrase),
    })),
  };
}

function evaluatePolicyFloorText({ text = '', context = '' } = {}) {
  const normalizedText = normalizeText(text);
  const lowerText = normalizedText.toLowerCase();
  const normalizedContext = normalizeText(context).toLowerCase();

  const hits = [];

  for (const rule of RAW_RULES) {
    if (normalizedContext && Array.isArray(rule.appliesTo) && !rule.appliesTo.includes(normalizedContext)) {
      continue;
    }

    const matched = rule.pattern.test(normalizedText);
    if (!matched) continue;

    let triggered = true;
    if (rule.requiresEscalationPhrase) {
      const hasAcute = /akut|svår smärta|andningssvårigheter/i.test(normalizedText);
      const hasEscalation = /ring\s*112|kontakta\s*akut/i.test(lowerText);
      triggered = hasAcute && !hasEscalation;
    }

    if (!triggered) continue;
    hits.push({
      id: rule.id,
      label: rule.label,
      floor: rule.floor,
      severity: rule.severity,
    });
  }

  const maxFloor = hits.reduce((max, hit) => Math.max(max, Number(hit.floor) || 1), 1);

  return {
    policyVersion: POLICY_VERSION,
    immutable: true,
    hits,
    maxFloor,
    blocked: maxFloor >= 4,
  };
}

module.exports = {
  getPolicyFloorDefinition,
  evaluatePolicyFloorText,
};
