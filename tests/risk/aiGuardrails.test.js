'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractFacts,
  unionFacts,
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

test('extractFacts normaliserar pris med mellanslag som tusentalsseparator', () => {
  const facts = extractFacts('Totalt 1 500 kr inklusive moms.');
  assert.ok(facts.prices.has('1500'));
});

test('extractFacts plockar kortdatum och tid i samma sträng', () => {
  const facts = extractFacts('Kom gärna 15/6 kl 14:00.');
  assert.ok(facts.dates.has('15/6'));
  assert.ok(facts.times.has('14:00'));
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

test('extractFacts flaggar 911 och plockar http(s)-URL normaliserat', () => {
  const facts = extractFacts('Se https://Example.COM/path/, och ring 911 vid behov.');
  assert.equal(facts.urgent, true);
  assert.ok(facts.urls.has('https://example.com/path/'));
});

test('extractFacts med icke-sträng ger tomma fakta-mängder', () => {
  const facts = extractFacts(null);
  assert.equal(facts.times.size, 0);
  assert.equal(facts.medical, false);
  assert.equal(facts.urgent, false);
});

test('unionFacts slår ihop tider och medicinsk flagga över källor', () => {
  const a = extractFacts('Kl 09:00');
  const b = extractFacts('Patienten har symptom.');
  const merged = unionFacts([a, b]);
  assert.ok(merged.times.has('09:00'));
  assert.equal(merged.medical, true);
});

test('unionFacts ignorerar null och undefined i listan', () => {
  const a = extractFacts('Mötet 11:15');
  const merged = unionFacts([a, null, undefined]);
  assert.ok(merged.times.has('11:15'));
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

test('detectFabricatedFacts: tid i output matchar källa med punktnotation', () => {
  const result = detectFabricatedFacts({
    outputText: 'Vi ses 14:30 vid receptionen.',
    sourceTexts: ['Bekräftar mötet kl 14.30.'],
  });
  assert.equal(result.passed, true);
});

test('detectFabricatedFacts: AI hittar på mejl som inte finns i källan', () => {
  const result = detectFabricatedFacts({
    outputText: 'Skicka kvittot till fake@example.com tack.',
    sourceTexts: ['Hej, jag behöver hjälp med min bokning.'],
  });
  assert.equal(result.passed, false);
  assert.ok(result.violations.some((v) => v.type === 'email' && v.severity === 'high'));
});

test('detectFabricatedFacts: AI lägger till akutspråk som saknas i källan', () => {
  const result = detectFabricatedFacts({
    outputText: 'Detta är akut, vänligen återkom omedelbart.',
    sourceTexts: ['Hej, jag undrar om ni har tid nästa vecka?'],
  });
  assert.equal(result.passed, false);
  const urgent = result.violations.find((v) => v.type === 'urgent');
  assert.ok(urgent);
  assert.equal(urgent.severity, 'critical');
});

test('detectFabricatedFacts: AI hittar på ISO-datum som inte finns i källan', () => {
  const result = detectFabricatedFacts({
    outputText: 'Din tid är 2026-06-01 kl 10:00.',
    sourceTexts: ['Vi återkommer med förslag på datum.'],
  });
  assert.equal(result.passed, false);
  assert.ok(result.violations.some((v) => v.type === 'date' && v.value === '2026-06-01'));
  assert.ok(result.violations.some((v) => v.type === 'time' && v.value === '10:00'));
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

test('buildGuardrailReport: högsta allvar endast high när endast påhittat pris', () => {
  const report = buildGuardrailReport({
    outputText: 'Priset är 8888 kr.',
    sourceTexts: ['Hej, vad kostar det?'],
  });
  assert.equal(report.verified, false);
  assert.equal(report.severity, 'high');
});

test('annotateUnverifiedFacts markerar misstänkta tokens i texten', () => {
  const annotated = annotateUnverifiedFacts({
    outputText: 'Vi bokar 14:30 imorgon, det kostar 5000 kr.',
    sourceTexts: ['Hej, jag undrar om bokning.'],
  });
  assert.match(annotated, /14:30 \[⚠ ej verifierat\]/);
  assert.match(annotated, /5000 kr \[⚠ ej verifierat\]/);
});

test('annotateUnverifiedFacts returnerar oförändrad text vid godkänd källa', () => {
  const text = 'Bekräftar priset 1500 kr.';
  const out = annotateUnverifiedFacts({
    outputText: text,
    sourceTexts: ['Vi nämner 1500 kr i offerten.'],
  });
  assert.equal(out, text);
});

test('detectFabricatedFacts: tom output passerar', () => {
  const result = detectFabricatedFacts({ outputText: '', sourceTexts: ['anything'] });
  assert.equal(result.passed, true);
});

test('detectFabricatedFacts: default tom payload utan violations', () => {
  const result = detectFabricatedFacts();
  assert.equal(result.passed, true);
  assert.equal(result.violations.length, 0);
});

test('extractFacts blank eller whitespace ger tomma mängder', () => {
  const a = extractFacts('   \n');
  assert.equal(a.times.size, 0);
  assert.equal(a.prices.size, 0);
  assert.equal(a.medical, false);
  const b = extractFacts('');
  assert.equal(b.emails.size, 0);
});

test('unionFacts tom lista ger tom union', () => {
  const merged = unionFacts([]);
  assert.equal(merged.times.size, 0);
  assert.equal(merged.urls.size, 0);
  assert.equal(merged.medical, false);
  assert.equal(merged.urgent, false);
});

test('unionFacts slår ihop flera tomma källor utan crash', () => {
  const merged = unionFacts([extractFacts(''), extractFacts('  '), null]);
  assert.equal(merged.times.size, 0);
});

test('buildGuardrailReport verifierar identisk output mot källa', () => {
  const text = 'Mötet 2026-07-01 kl 16:00. Pris 2500 kr.';
  const report = buildGuardrailReport({
    outputText: text,
    sourceTexts: [text],
  });
  assert.equal(report.verified, true);
  assert.equal(report.severity, 'none');
  assert.equal(report.violationCount, 0);
});

test('extractFacts normaliserar tid med en siffra i timme och punktseparator', () => {
  const facts = extractFacts('Kom 9:05 eller 09.15.');
  assert.ok(facts.times.has('9:05'));
  assert.ok(facts.times.has('09:15'));
});

test('detectFabricatedFacts tillater medicinsk terminologi nar kallan redan innehaller samma signal', () => {
  const result = detectFabricatedFacts({
    outputText: 'Vi följer upp behandling enligt överenskommelse.',
    sourceTexts: ['Tidigare skrev ni om behandling och uppföljning.'],
  });
  assert.equal(result.passed, true);
  assert.equal(result.violations.filter((v) => v.type === 'medical').length, 0);
});

test('annotateUnverifiedFacts returnerar null oförändrat när outputText är null', () => {
  assert.equal(
    annotateUnverifiedFacts({ outputText: null, sourceTexts: ['källa'] }),
    null
  );
});

test('buildGuardrailReport behandlar undefined outputText som tom sträng', () => {
  const report = buildGuardrailReport({
    outputText: undefined,
    sourceTexts: ['Hej från kund'],
  });
  assert.equal(report.verified, true);
  assert.equal(report.violationCount, 0);
});

test('extractFacts normaliserar pris med tusentals punkt (29.000 kr)', () => {
  const facts = extractFacts('Paketpris 29.000 kr totalt.');
  assert.ok(facts.prices.has('29000'));
});

test('buildGuardrailReport sätter severity high när endast tid saknas i källa', () => {
  const report = buildGuardrailReport({
    outputText: 'Vi ses kl 08:00.',
    sourceTexts: ['Hej, välkommen till oss.'],
  });
  assert.equal(report.verified, false);
  assert.equal(report.severity, 'high');
  assert.equal(report.shortLabel, 'Ej verifierad');
});

test('annotateUnverifiedFacts returnerar undefined oförändrat när output saknar fabrications', () => {
  assert.equal(
    annotateUnverifiedFacts({ outputText: undefined, sourceTexts: [] }),
    undefined
  );
});

test('extractFacts plockar pris med SEK-suffix', () => {
  const facts = extractFacts('Offert 2 500 SEK inklusive moms.');
  assert.ok(facts.prices.has('2500'));
});

test('unionFacts sammanslår url-mängder från flera källor', () => {
  const a = extractFacts('Läs https://Example.COM/a');
  const b = extractFacts('Mer på http://b.se/path');
  const merged = unionFacts([a, b]);
  assert.ok(merged.urls.has('https://example.com/a'));
  assert.ok(merged.urls.has('http://b.se/path'));
});

test('detectFabricatedFacts behandlar icke-array sourceTexts som tom källa', () => {
  const result = detectFabricatedFacts({
    outputText: 'Priset är 1500 kr.',
    sourceTexts: 'Vi nämnde 1500 kr i mejlet.',
  });
  assert.equal(result.passed, false);
  assert.ok(result.violations.some((v) => v.type === 'price'));
});
