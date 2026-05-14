const test = require('node:test');
const assert = require('node:assert/strict');

const { computeReplyConfidence, detectSensitivity } = require('../../src/ops/replyConfidencePanel');

test('computeReplyConfidence ger hog konfidens med template-match och historik', () => {
  const result = computeReplyConfidence({
    thread: { customerName: 'Anna Svensson', detectedIntent: 'booking', latestInboundBody: 'Hej, jag vill boka en konsultation for hartransplantation. Har ni tider nasta vecka?' },
    draft: { body: 'Hej Anna, tack for ditt meddelande. Jag aterkommet med tider for din konsultation.' },
    templateMatched: true,
    conversationHistory: [{ id: '1' }, { id: '2' }, { id: '3' }],
    riskEvaluation: { riskLevel: 1, decision: 'allow' },
  });

  assert.ok(result.confidence >= 70);
  assert.ok(result.confidenceLabel === 'Hög' || result.confidenceLabel === 'Medel');
  assert.equal(result.risk, 'low');
  assert.equal(result.requiresOwnerApproval, false);
  assert.equal(result.suggestedTone, 'professional');
  assert.equal(result.draftSource, 'template_match');
});

test('computeReplyConfidence ger lag konfidens vid hog risk + saknad kontext', () => {
  const result = computeReplyConfidence({
    thread: {},
    draft: { body: 'Kort' },
    templateMatched: false,
    conversationHistory: [],
    riskEvaluation: { riskLevel: 4, decision: 'review_required' },
  });

  assert.ok(result.confidence < 40);
  assert.equal(result.confidenceLabel, 'Låg');
  assert.equal(result.risk, 'high');
  assert.equal(result.requiresOwnerApproval, true);
  assert.ok(result.missingContext.length > 0);
});

test('computeReplyConfidence detekterar kansligt innehall', () => {
  const result = computeReplyConfidence({
    thread: { latestInboundBody: 'Jag vill anmäla er och prata med min advokat om skadestånd.' },
    draft: { body: 'Vi beklagar. Lat oss diskutera detta narmare.' },
    templateMatched: false,
    conversationHistory: [{ id: '1' }],
    riskEvaluation: { riskLevel: 2, decision: 'allow' },
  });

  assert.ok(result.sensitivity.hits.includes('complaint'));
  assert.ok(result.sensitivity.hits.includes('legal'));
  assert.ok(result.confidence < 70);
  assert.ok(result.rationale.some((r) => r.includes('Känsligt')));
});

test('computeReplyConfidence foreslar varm ton for aftercare', () => {
  const result = computeReplyConfidence({
    thread: { customerName: 'Erik', detectedIntent: 'aftercare' },
    draft: { body: 'Hej Erik, vi hoppas att allt gar bra efter behandlingen.' },
    templateMatched: true,
    conversationHistory: [{ id: '1' }, { id: '2' }],
    riskEvaluation: { riskLevel: 1, decision: 'allow' },
  });

  assert.equal(result.suggestedTone, 'warm');
});

test('detectSensitivity hittar medicinska termer', () => {
  const result = detectSensitivity('Patienten har diagnos och symptom som kraver blodprov.');
  assert.ok(result.hits.includes('medical_detail'));
  assert.ok(result.totalWeight > 0);
});

test('detectSensitivity returnerar tomt for neutral text', () => {
  const result = detectSensitivity('Tack for ditt meddelande. Vi aterkommet snart.');
  assert.equal(result.hits.length, 0);
  assert.equal(result.totalWeight, 0);
});
