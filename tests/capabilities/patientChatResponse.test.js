const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PatientChatResponseCapability,
  detectHandoffTriggers,
  redactPii,
} = require('../../src/capabilities/patientChatResponse');

test('redactPii maskerar personnummer, email och telefon', () => {
  const input = 'Hej, mitt personnummer ar 900101-1234 och min email ar test@example.com. Ring 070 123 4567.';
  const redacted = redactPii(input);

  assert.ok(!redacted.includes('900101-1234'));
  assert.ok(!redacted.includes('test@example.com'));
  assert.ok(!redacted.includes('070 123 4567'));
  assert.ok(redacted.includes('[PERSONNUMMER]'));
  assert.ok(redacted.includes('[EMAIL]'));
  assert.ok(redacted.includes('[TELEFON]'));
});

test('redactPii bevarar text utan PII', () => {
  const input = 'Hej, jag vill boka en konsultation for hartransplantation.';
  const redacted = redactPii(input);
  assert.equal(redacted, input);
});

test('detectHandoffTriggers hittar explicit mansklig kontakt', () => {
  const triggers = detectHandoffTriggers('Jag vill prata med en manniska');
  assert.ok(triggers.length > 0);
  assert.equal(triggers[0].id, 'explicit_request');
});

test('detectHandoffTriggers hittar medicinsk akutsituation', () => {
  const triggers = detectHandoffTriggers('Det ar akut, jag bloder mycket');
  assert.ok(triggers.length > 0);
  assert.ok(triggers.some((t) => t.id === 'medical_emergency'));
});

test('detectHandoffTriggers hittar mental ohalsa', () => {
  const triggers = detectHandoffTriggers('Jag vill inte leva langre');
  assert.ok(triggers.length > 0);
  assert.equal(triggers[0].id, 'mental_health');
});

test('detectHandoffTriggers hittar klagomal', () => {
  const triggers = detectHandoffTriggers('Jag ar mycket missnojd och vill anmala');
  assert.ok(triggers.length > 0);
  assert.ok(triggers.some((t) => t.id === 'complaint'));
});

test('detectHandoffTriggers returnerar tom array for vanlig fraga', () => {
  const triggers = detectHandoffTriggers('Vad kostar en hartransplantation?');
  assert.equal(triggers.length, 0);
});

test('PatientChatResponseCapability blockerar vid kill switch', async () => {
  const capability = new PatientChatResponseCapability();
  const result = await capability.execute({
    input: { message: 'Hej' },
    tenantConfig: { patientChatKillSwitch: true },
  });

  assert.equal(result.data.blocked, true);
  assert.ok(result.data.response.includes('pausad'));
  assert.equal(result.data.safetyFlags.killSwitch, true);
});

test('PatientChatResponseCapability triggar handoff vid akut', async () => {
  const capability = new PatientChatResponseCapability();
  const result = await capability.execute({
    input: { message: 'Det ar akut jag bloder mycket', turnNumber: 1 },
    tenantConfig: {},
  });

  assert.equal(result.data.handoff.required, true);
  assert.equal(result.data.handoff.reason, 'medical_emergency');
});

test('PatientChatResponseCapability triggar handoff vid mental ohalsa med Mind-nummer', async () => {
  const capability = new PatientChatResponseCapability();
  const result = await capability.execute({
    input: { message: 'Jag vill inte leva langre', turnNumber: 1 },
    tenantConfig: {},
  });

  assert.equal(result.data.handoff.required, true);
  assert.equal(result.data.handoff.reason, 'mental_health');
  assert.ok(result.data.response.includes('90101'));
});

test('PatientChatResponseCapability triggar handoff vid max turns', async () => {
  const capability = new PatientChatResponseCapability();
  const result = await capability.execute({
    input: { message: 'Beraetta mer', turnNumber: 12 },
    tenantConfig: { patientChatMaxTurns: 12 },
  });

  assert.equal(result.data.handoff.required, true);
  assert.equal(result.data.handoff.reason, 'max_turns_reached');
});

test('PatientChatResponseCapability redaktar PII i input', async () => {
  const capability = new PatientChatResponseCapability();
  const result = await capability.execute({
    input: { message: 'Mitt personnummer ar 900101-1234', turnNumber: 1 },
    tenantConfig: {},
  });

  assert.ok(result.data.inputRedacted.includes('[PERSONNUMMER]'));
  assert.ok(!result.data.inputRedacted.includes('900101-1234'));
  assert.equal(result.data.safetyFlags.piiRedacted, true);
});

test('PatientChatResponseCapability returnerar pending for vanlig fraga', async () => {
  const capability = new PatientChatResponseCapability();
  const result = await capability.execute({
    input: { message: 'Vad kostar en hartransplantation?', turnNumber: 1 },
    tenantConfig: {},
  });

  assert.equal(result.data.handoff.required, false);
  assert.equal(result.data.responseSource, 'pending_ai_generation');
  assert.equal(result.data.safetyFlags.killSwitch, false);
  assert.equal(result.data.safetyFlags.handoffTriggered, false);
});
