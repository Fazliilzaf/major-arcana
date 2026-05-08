'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  recordDraftFeedbackCapability,
} = require('../../src/capabilities/recordDraftFeedback');
const {
  buildDiffReport,
  diffTokens,
  detectFormalityShift,
} = require('../../src/risk/draftDiffer');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

const baseContext = {
  tenantId: 'tenant-a',
  actor: { id: 'owner-a', role: 'OWNER' },
  channel: 'admin',
  requestId: 'req-feedback-1',
  correlationId: 'corr-feedback-1',
};

test('buildDiffReport: identiskt utkast klassas som accepted_unchanged', () => {
  const r = buildDiffReport({
    originalDraft: 'Hej Anna, fredag 14:00 funkar bra.',
    editedDraft: 'Hej Anna, fredag 14:00 funkar bra.',
  });
  assert.equal(r.identicalDraft, true);
  assert.ok(r.classifications.includes('accepted_unchanged'));
});

test('buildDiffReport: förkortning detekteras', () => {
  const r = buildDiffReport({
    originalDraft:
      'Hej Anna, tack för ditt mejl. Vi har full tillgänglighet på fredag och kan boka in dig på 14:00 om det passar.',
    editedDraft: 'Hej Anna, fredag 14:00 funkar bra.',
  });
  assert.ok(r.classifications.includes('shortened'));
});

test('buildDiffReport: utvidgning detekteras', () => {
  const r = buildDiffReport({
    originalDraft: 'Hej Anna, fredag 14:00 funkar.',
    editedDraft:
      'Hej Anna, tack för ditt mejl. Fredag 14:00 funkar utmärkt. Vi har förberett konsultationsrummet och du får en påminnelse på sms dagen innan.',
  });
  assert.ok(r.classifications.includes('lengthened'));
});

test('buildDiffReport: tonbyte mer formell detekteras', () => {
  const r = buildDiffReport({
    originalDraft: 'Hej hej! Tack! Kul att du hörde av dig.',
    editedDraft:
      'Bästa Anna, vi tar gärna emot dig som ny kund. Med vänliga hälsningar.',
  });
  assert.equal(r.formalityShift, 'more_formal');
  assert.ok(r.classifications.some((c) => c.includes('more_formal')));
});

test('buildDiffReport: tonbyte mer informell detekteras', () => {
  const r = buildDiffReport({
    originalDraft:
      'Bästa Anna, med vänliga hälsningar och tack på förhand.',
    editedDraft: 'Hej hej! Tack! Vi ses!',
  });
  assert.equal(r.formalityShift, 'more_casual');
});

test('buildDiffReport: faktatillägg av tid detekteras', () => {
  const r = buildDiffReport({
    originalDraft: 'Hej, vi bokar gärna in dig på fredag.',
    editedDraft: 'Hej, vi bokar gärna in dig fredag 14:30.',
  });
  assert.ok(r.factChanges.addedTimes.includes('14:30'));
  assert.ok(r.classifications.includes('added_time'));
});

test('buildDiffReport: faktatillägg av pris detekteras', () => {
  const r = buildDiffReport({
    originalDraft: 'Konsultation finns tillgänglig.',
    editedDraft: 'Konsultation kostar 1500 kr.',
  });
  assert.ok(r.factChanges.addedPrices.length > 0);
  assert.ok(r.classifications.includes('added_price'));
});

test('diffTokens: hittar additions och removals korrekt', () => {
  const d = diffTokens('the cat sat', 'the dog sat');
  // 'cat' borttagen, 'dog' tillagd
  assert.ok(d.removed.some((t) => t.toLowerCase().includes('cat')));
  assert.ok(d.added.some((t) => t.toLowerCase().includes('dog')));
});

test('detectFormalityShift: unchanged om ingen markör finns', () => {
  const r = detectFormalityShift('Vi bokar tiden.', 'Vi bokar tid.');
  assert.equal(r, 'unchanged');
});

test('RecordDraftFeedback capability: full execute med schema-validering', async () => {
  const output = await new recordDraftFeedbackCapability().execute({
    ...baseContext,
    input: {
      conversationId: 'conv-1',
      writingIdentityId: 'fazli',
      threadSubject: 'Bokning',
      originalDraft: 'Hej Anna, vi har plats på fredag och kan boka in dig då.',
      editedDraft: 'Hej Anna, fredag 14:30 funkar perfekt.',
      tone: 'professional',
      track: 'booking',
    },
  });

  const schemaResult = validateJsonSchema({
    schema: recordDraftFeedbackCapability.outputSchema,
    value: output,
  });
  assert.equal(schemaResult.ok, true, JSON.stringify(schemaResult.errors));
  assert.equal(output.data.identicalDraft, false);
  assert.ok(output.data.factChanges.addedTimes.includes('14:30'));
  assert.ok(output.data.classifications.length > 0);
});

test('RecordDraftFeedback: tomma drafts → warning', async () => {
  const output = await new recordDraftFeedbackCapability().execute({
    ...baseContext,
    input: {
      conversationId: 'conv-empty',
      originalDraft: '',
      editedDraft: '',
    },
  });
  assert.ok(output.warnings.length > 0);
  assert.match(output.warnings[0], /tomma/);
});

test('RecordDraftFeedback: oförändrat utkast → accepted_unchanged', async () => {
  const text = 'Hej, vi ses fredag 14:00. Trevlig dag!';
  const output = await new recordDraftFeedbackCapability().execute({
    ...baseContext,
    input: {
      conversationId: 'conv-2',
      originalDraft: text,
      editedDraft: text,
    },
  });
  assert.equal(output.data.identicalDraft, true);
  assert.ok(output.data.classifications.includes('accepted_unchanged'));
});
