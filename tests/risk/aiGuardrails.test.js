'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractFacts,
  detectFabricatedFacts,
  buildGuardrailReport,
  annotateUnverifiedFacts,
} = require('../../src/risk/aiGuardrails');

test('extractFacts plockar tider, datum, priser från text', () => {
  const facts = extractFacts(
    'Hej, jag kan komma 14:30 på fredag 2026-05-02. Konsultationen kostar 1500 kr.'
  );
  assert.ok(facts.times.has('14:30'));
  assert.ok(facts.dates.has('2026-05-02'));
  assert.ok(facts.prices.has('1500'));
});

test('extractFacts hittar telefonnummer och mejladresser', () => {
  const facts = extractFacts(
    'Ring oss på 031-88 11 66 eller mejla contact@hairtpclinic.com.'
  );
  assert.ok([...facts.phones].some((p) => p.includes('031881166')));
  assert.ok(facts.emails.has('contact@hairtpclinic.com'));
});

test('extractFacts flaggar medicinska termer', () => {
  const facts = extractFacts('Patienten har en infektion och behöver behandling.');
  assert.equal(facts.medical, true);
});

test('extractFacts flaggar akut-formulering', () => {
  const facts = extractFacts('Detta är akut, jag behöver hjälp omedelbart.');
  assert.equal(facts.urgent, true);
});

test('detectFabricatedFacts: AI som hittar på pris fångas', () => {
  const result = detectFabricatedFacts({
    outputText: 'Konsultationen kostar 9999 kr.',
    sourceTexts: ['Hej, jag undrar vad det kostar?'],
  });
  assert.equal(result.passed, false);
  assert.ok(result.violations.some((v) => v.type === 'price' && v.severity === 'high'));
});

test('detectFabricatedFacts: pris från källan tillåts', () => {
  const result = detectFabricatedFacts({
    outputText: 'Konsultationen kostar 1500 kr.',
    sourceTexts: ['Vi tar 1500 kr för konsultation, är det OK?'],
  });
  assert.equal(result.passed, true);
  assert.equal(result.violations.length, 0);
});

test('detectFabricatedFacts: AI hittar på en tid → blockeras', () => {
  const result = detectFabricatedFacts({
    outputText: 'Jag bokar in dig på 09:00 imorgon.',
    sourceTexts: ['Hej, jag vill boka tid imorgon, helst på eftermiddagen.'],
  });
  assert.equal(result.passed, false);
  assert.ok(result.violations.some((v) => v.type === 'time' && v.value === '09:00'));
});

test('detectFabricatedFacts: AI hittar på telefonnummer → CRITICAL', () => {
  const result = detectFabricatedFacts({
    outputText: 'Ring oss på 070-555 12 34.',
    sourceTexts: ['Hej, hur kan jag nå er?'],
  });
  assert.equal(result.passed, false);
  const phoneViolation = result.violations.find((v) => v.type === 'phone');
  assert.ok(phoneViolation, 'phone violation expected');
  assert.equal(phoneViolation.severity, 'critical');
});

test('detectFabricatedFacts: AI introducerar medicinsk terminologi → CRITICAL', () => {
  const result = detectFabricatedFacts({
    outputText: 'Vi rekommenderar att börja med en behandling och recept.',
    sourceTexts: ['Hej, jag undrar om jag kan boka en tid hos er?'],
  });
  assert.equal(result.passed, false);
  const medicalViolation = result.violations.find((v) => v.type === 'medical');
  assert.ok(medicalViolation);
  assert.equal(medicalViolation.severity, 'critical');
});

test('buildGuardrailReport returnerar lämplig UI-status', () => {
  const ok = buildGuardrailReport({
    outputText: 'Jag bekräftar tiden.',
    sourceTexts: ['Hej, jag bekräftar tiden 14:00.'],
  });
  assert.equal(ok.verified, true);
  assert.equal(ok.severity, 'none');
  assert.equal(ok.shortLabel, 'Verifierad');

  const bad = buildGuardrailReport({
    outputText: 'Vi tar 9999 kr och du behöver recept.',
    sourceTexts: ['Hej, jag undrar om bokning?'],
  });
  assert.equal(bad.verified, false);
  assert.equal(bad.severity, 'critical'); // medical är critical
  assert.equal(bad.shortLabel, 'Ej verifierad');
});

test('annotateUnverifiedFacts markerar misstänkta tokens i texten', () => {
  const annotated = annotateUnverifiedFacts({
    outputText: 'Vi bokar 14:30 imorgon, det kostar 5000 kr.',
    sourceTexts: ['Hej, jag undrar om bokning.'],
  });
  assert.match(annotated, /14:30 \[⚠ ej verifierat\]/);
  assert.match(annotated, /5000 kr \[⚠ ej verifierat\]/);
});

test('detectFabricatedFacts: tom output passerar', () => {
  const result = detectFabricatedFacts({ outputText: '', sourceTexts: ['anything'] });
  assert.equal(result.passed, true);
});
