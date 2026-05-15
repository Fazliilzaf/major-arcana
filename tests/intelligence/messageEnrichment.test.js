const test = require('node:test');
const assert = require('node:assert/strict');

const {
  enrichMessage,
  pickMessageText,
  detectLanguageHeuristic,
  detectAnomalyFlags,
  ENGINE_VERSION,
} = require('../../src/intelligence/messageEnrichment');

test('pickMessageText prefers subject and body preview fields', () => {
  const text = pickMessageText({
    subject: 'Bokning',
    bodyPreview: 'Jag vill boka nästa vecka.',
  });
  assert.match(text, /Bokning/);
  assert.match(text, /nästa vecka/i);
});

test('detectLanguageHeuristic picks Swedish when Swedish markers dominate', () => {
  const r = detectLanguageHeuristic('Hej och tack för att du hjälper mig med detta ärende.');
  assert.equal(r.language, 'sv');
  assert.ok(r.confidence >= 0.3);
});

test('enrichMessage stamps engineVersion and structured tone and intent', () => {
  const out = enrichMessage(
    {
      subject: 'Reklamation',
      bodyPreview: 'Jag är mycket missnöjd och vill ha pengarna tillbaka.',
    },
    { slaStatus: 'within', isVip: false },
  );
  assert.equal(out.engineVersion, ENGINE_VERSION);
  assert.ok(out.tone?.tone);
  assert.ok(out.intent?.intent);
  assert.ok(Array.isArray(out.anomalyFlags));
  assert.ok(out.priority?.priorityLevel);
});

test('detectAnomalyFlags flags legal keywords and many question marks', () => {
  const flags = detectAnomalyFlags('Vi kräver advokat och stämning nu???', 'neutral', 'complaint');
  assert.ok(flags.includes('legal_or_complaint_keywords'));
  assert.ok(flags.includes('many_questions'));
  assert.ok(flags.includes('high_risk_intent'));
});

test('pickMessageText falls back across body fields and caps payload length', () => {
  const longBody = 'A'.repeat(5000);
  const text = pickMessageText({
    normalizedSubject: '  SubjectX  ',
    bodyContent: longBody,
  });
  assert.ok(text.startsWith('SubjectX'));
  assert.equal(text.length, 4000);
});

test('detectLanguageHeuristic defaults to sv with low confidence on markerless text', () => {
  const r = detectLanguageHeuristic('zxqv qwepoi asdfgh');
  assert.equal(r.language, 'sv');
  assert.equal(r.confidence, 0.3);
});

test('detectAnomalyFlags detects all_caps and many_exclamations', () => {
  const flags = detectAnomalyFlags(
    'DETTA ÄR ETT MYCKET LÅNGT MEDDELANDE SOM ÄR SKRIVET I VERSALER OCH JÄTTEUPPRÖRT!!!',
    'frustrated',
    'cancel'
  );
  assert.ok(flags.includes('all_caps'));
  assert.ok(flags.includes('many_exclamations'));
  assert.ok(flags.includes('negative_tone'));
  assert.ok(flags.includes('high_risk_intent'));
});

test('detectLanguageHeuristic väljer engelska när engelska markörer dominerar', () => {
  const r = detectLanguageHeuristic(
    'Hello and thank you for the update. I would like to know when this will be done.'
  );
  assert.equal(r.language, 'en');
  assert.ok(r.confidence > 0.4);
});

test('detectAnomalyFlags flaggar mycket långa meddelanden', () => {
  const long = 'word '.repeat(400);
  const flags = detectAnomalyFlags(long, 'neutral', 'follow_up');
  assert.ok(flags.includes('long_message'));
});

test('pickMessageText använder body när subject och preview saknas', () => {
  const text = pickMessageText({
    body: 'Endast kropp utan ämne.',
  });
  assert.match(text, /Endast kropp/);
});

test('enrichMessage tolererar tomt meddelandeobjekt', () => {
  const out = enrichMessage({}, {});
  assert.equal(out.engineVersion, ENGINE_VERSION);
  assert.ok(typeof out.tone?.tone === 'string');
  assert.ok(typeof out.intent?.intent === 'string');
  assert.equal(Array.isArray(out.anomalyFlags), true);
  assert.ok(out.priority?.priorityLevel);
});

test('detectLanguageHeuristic väljer tyska när tyska markörer dominerar', () => {
  const r = detectLanguageHeuristic(
    'Guten Tag und danke. Wir sind sehr besorgt und bitten um eine Rückmeldung bitte.'
  );
  assert.equal(r.language, 'de');
  assert.ok(r.confidence > 0.4);
});

test('pickMessageText använder bodyPlain när body och preview saknas', () => {
  const text = pickMessageText({ bodyPlain: 'Ren plaintext utan annat fält.' });
  assert.match(text, /Ren plaintext/);
});

test('enrichMessage härleder timmar från receivedDateTime när options saknar hoursSinceInbound', () => {
  const past = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
  const out = enrichMessage(
    { subject: 'Hej', bodyPreview: 'Kort text.', receivedDateTime: past },
    { slaStatus: 'within' }
  );
  assert.ok(out.priority.priorityReasons.some((row) => row.startsWith('SLA_AGE:+30')));
});

test('detectLanguageHeuristic väljer danska när danska markörer dominerar utan svenska stoppord', () => {
  const r = detectLanguageHeuristic('jeg skal ikke og hvad nu ærø østersøen');
  assert.equal(r.language, 'dk');
  assert.ok(r.confidence > 0.9);
});

test('detectAnomalyFlags lägger bara high_risk_intent för complaint eller exakt cancel', () => {
  assert.ok(detectAnomalyFlags('kort', 'neutral', 'complaint').includes('high_risk_intent'));
  assert.ok(detectAnomalyFlags('kort', 'neutral', 'cancel').includes('high_risk_intent'));
  assert.equal(detectAnomalyFlags('kort', 'neutral', 'cancellation').includes('high_risk_intent'), false);
});

test('enrichMessage prioriterar hoursSinceInbound från options över meddelandets tidsstämpel', () => {
  const recent = new Date().toISOString();
  const out = enrichMessage(
    { subject: 'X', bodyPreview: 'Y', receivedDateTime: recent },
    { hoursSinceInbound: 72, slaStatus: 'within' }
  );
  assert.ok(out.priority.priorityReasons.some((row) => row === 'SLA_AGE:+40'));
});
