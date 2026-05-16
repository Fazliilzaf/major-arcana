'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const PATIENT_AGENT_NAME = 'Patient';

const patientAgentInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    conversationId: { type: 'string', maxLength: 120 },
    message: { type: 'string', maxLength: 2000 },
    turnNumber: { type: 'integer', minimum: 1 },
    language: { type: 'string', enum: ['sv', 'en'] },
  },
  required: ['message'],
});

const patientAgentOutputSchema = Object.freeze({
  type: 'object',
  required: ['data', 'metadata', 'warnings'],
  additionalProperties: false,
  properties: {
    data: {
      type: 'object',
      required: ['response', 'handoff', 'safetyFlags', 'generatedAt'],
      additionalProperties: true,
    },
    metadata: {
      type: 'object',
      required: ['agent', 'version', 'channel'],
      additionalProperties: true,
    },
    warnings: { type: 'array', maxItems: 20 },
  },
});

module.exports = {
  PATIENT_AGENT_NAME,
  patientAgentInputSchema,
  patientAgentOutputSchema,
};
