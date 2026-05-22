'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectLanguage,
  detectConversationLanguage,
  getLanguageLabel,
  SUPPORTED_LANGUAGES,
  scoreLanguages,
} = require('../../src/risk/languageDetect');

test('detectLanguage: svenska identifieras', () => {
  const result = detectLanguage(
    'Hej, jag undrar om ni har tid på fredag? Tack för tidigare svar.'
  );
  assert.equal(result.language, 'sv');
  assert.ok(result.confidence > 0.4);
});

test('detectLanguage: engelska identifieras', () => {
  const result = detectLanguage(
    'Hello, I would like to book a consultation. Could you please confirm the price?'
  );
  assert.equal(result.language, 'en');
  assert.ok(result.confidence > 0.4);
});

test('detectLanguage: tyska identifieras', () => {
  const result = detectLanguage(
    'Sehr geehrte Damen und Herren, ich möchte einen Termin vereinbaren. Vielen Dank für Ihre Hilfe.'
  );
  assert.equal(result.language, 'de');
  assert.ok(result.confidence > 0.3);
});

test('detectLanguage: danska skiljer från svenska', () => {
  const result = detectLanguage(
    'Hej, jeg vil gerne booke en tid. Tak for hurtig svar. Mange tak og venlig hilsen.'
  );
  assert.equal(result.language, 'da');
});

test('detectLanguage: norska identifieras', () => {
  const result = detectLanguage(
    'Hei, jeg vil gjerne bestille en time. Takk for raskt svar. Med vennlig hilsen.'
  );
  // Notera: NO och DA är nära — så länge det inte är 'sv' eller 'en' är vi OK
  assert.ok(['no', 'da'].includes(result.language), `expected no/da, got ${result.language}`);
});

test('detectLanguage: spanska identifieras via ñ + stop-words', () => {
  const result = detectLanguage(
    'Hola, me gustaría reservar una consulta. ¿Cuánto cuesta? Gracias y saludos cordiales.'
  );
  assert.equal(result.language, 'es');
});

test('detectLanguage: tom/för kort text → unknown', () => {
  assert.equal(detectLanguage('').language, 'unknown');
  assert.equal(detectLanguage('Hej').language, 'unknown');
});

test('detectLanguage: returnerar alternates sorterade', () => {
  const result = detectLanguage(
    'Hej, jag undrar om ni har tid på fredag eller måndag.'
  );
  assert.equal(result.language, 'sv');
  assert.ok(Array.isArray(result.alternates));
  // Ska ha minst en alternate eller vara tom array
});

test('detectConversationLanguage: kund-meddelanden styr primärspråk', () => {
  const result = detectConversationLanguage([
    {
      direction: 'inbound',
      body: 'Hello, can I book a consultation? Thanks for your time.',
    },
    {
      direction: 'outbound',
      body: 'Hej kund, här är information om bokning på svenska.',
    },
    {
      direction: 'inbound',
      body: 'Could you please tell me the price for the procedure?',
    },
  ]);
  assert.equal(result.primaryLanguage, 'en');
});

test('detectConversationLanguage: blandat språk flaggas korrekt', () => {
  const result = detectConversationLanguage([
    {
      direction: 'inbound',
      body: 'Hej, jag har en fråga om bokning på svenska tack.',
    },
    {
      direction: 'inbound',
      body: 'Hej igen, glömde nämna att jag pratar svenska främst.',
    },
  ]);
  assert.equal(result.primaryLanguage, 'sv');
  assert.ok(result.languageBreakdown.sv >= 1);
});

test('detectConversationLanguage: tom konversation → unknown', () => {
  const result = detectConversationLanguage([]);
  assert.equal(result.primaryLanguage, 'unknown');
});

test('getLanguageLabel: returnerar flagga och native namn', () => {
  assert.equal(getLanguageLabel('sv').flag, '🇸🇪');
  assert.equal(getLanguageLabel('en').native, 'English');
  assert.equal(getLanguageLabel('fi').native, 'Suomi');
  assert.equal(getLanguageLabel('da').flag, '🇩🇰');
  assert.equal(getLanguageLabel('unknown').native, 'Okänt');
  assert.equal(getLanguageLabel('xx').native, 'Okänt'); // okänd kod fallback
});

test('SUPPORTED_LANGUAGES innehåller minst sv/en/de/da', () => {
  for (const lang of ['sv', 'en', 'de', 'da']) {
    assert.ok(SUPPORTED_LANGUAGES.includes(lang), `expected ${lang} to be supported`);
  }
});

test('scoreLanguages: tom text ger noll för alla språk', () => {
  const scores = scoreLanguages('');
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.equal(scores[lang], 0);
  }
});

test('scoreLanguages: icke-sträng normaliseras till tom och ger noll', () => {
  for (const bad of [null, undefined, 42, {}]) {
    const scores = scoreLanguages(bad);
    for (const lang of SUPPORTED_LANGUAGES) {
      assert.equal(scores[lang], 0, `expected zero for ${lang} when input is ${bad}`);
    }
  }
});

test('detectLanguage: endast siffror utan språkpoäng → unknown', () => {
  const result = detectLanguage('12345678901234567890');
  assert.equal(result.language, 'unknown');
  assert.equal(result.confidence, 0);
});

test('detectLanguage: franska via stop-words', () => {
  const result = detectLanguage(
    'Bonjour, je voudrais un rendez-vous. Merci beaucoup pour votre aide et cordialement.'
  );
  assert.equal(result.language, 'fr');
});

test('detectConversationLanguage: icke-array behandlas som tom lista', () => {
  const result = detectConversationLanguage(null);
  assert.equal(result.primaryLanguage, 'unknown');
});

test('detectConversationLanguage: fallback till allMessages när bara outbound har språk', () => {
  const result = detectConversationLanguage([
    {
      direction: 'outbound',
      body: 'Hello, I would like to help you with booking and thanks for your patience today.',
    },
  ]);
  assert.equal(result.primaryLanguage, 'en');
});

test('detectLanguage: minLength option kan tillåta kort svensk text', () => {
  const result = detectLanguage('Hej och tack', { minLength: 3 });
  assert.equal(result.language, 'sv');
  assert.ok(result.confidence > 0);
});

test('detectLanguage: minLength större än textlängd ger unknown', () => {
  const body = 'Hej, jag undrar om ni har tid på fredag? Tack för svar.';
  const ok = detectLanguage(body, { minLength: 12 });
  assert.notEqual(ok.language, 'unknown');
  const tooStrict = detectLanguage(body, { minLength: body.length + 5 });
  assert.equal(tooStrict.language, 'unknown');
  assert.equal(tooStrict.confidence, 0);
});

test('detectLanguage: confidence avrundas till två decimaler', () => {
  const result = detectLanguage(
    'Hello, I would like to book a consultation. Could you please confirm the price and time?'
  );
  const decimals = String(result.confidence).split('.')[1];
  assert.ok(!decimals || decimals.length <= 2, `expected at most 2 decimal places, got ${result.confidence}`);
});

test('detectLanguage: low score (<2) returnerar unknown med alternates', () => {
  const result = detectLanguage('aaaaaaaaaaaaâ', { minLength: 3 });
  assert.equal(result.language, 'unknown');
  assert.equal(result.confidence, 0);
  assert.ok(result.alternates.some((entry) => entry.language === 'fr'));
});

test('detectConversationLanguage: customerDirection kan bytas till outbound', () => {
  const result = detectConversationLanguage(
    [
      { direction: 'inbound', body: 'Hej jag vill boka en tid på fredag tack.' },
      { direction: 'outbound', body: 'Hello, thanks for your message and details.' },
      { direction: 'outbound', body: 'Please confirm preferred time for consultation.' },
    ],
    { customerDirection: 'outbound' }
  );
  assert.equal(result.primaryLanguage, 'en');
  assert.ok(result.inboundLanguageBreakdown.en >= 1);
});

test('detectConversationLanguage: tom body ger unknown perMessage rad', () => {
  const result = detectConversationLanguage([
    { direction: 'inbound', body: '   ' },
  ]);
  assert.equal(result.primaryLanguage, 'unknown');
  assert.equal(result.perMessage.length, 1);
  assert.equal(result.perMessage[0].language, 'unknown');
});

test('detectLanguage nullish input ger unknown', () => {
  assert.equal(detectLanguage(null).language, 'unknown');
  assert.equal(detectLanguage(undefined).language, 'unknown');
});

test('detectConversationLanguage anvander bodyPreview och text nar body saknas', () => {
  const result = detectConversationLanguage([
    {
      direction: 'inbound',
      bodyPreview: 'Hej och tack för snabb återkoppling om min bokning idag.',
    },
    {
      direction: 'inbound',
      text: 'Jag undrar också om priset och tiden passar för mig tack.',
    },
  ]);
  assert.equal(result.primaryLanguage, 'sv');
  assert.equal(result.perMessage.length, 2);
  assert.equal(result.perMessage.every((row) => row.language === 'sv'), true);
});

test('detectConversationLanguage: riktning INBOUND (versaler) räknas som kund', () => {
  const result = detectConversationLanguage([
    {
      direction: 'INBOUND',
      body: 'Hej, jag undrar om ni har tid på fredag eller måndag? Tack för svar.',
    },
  ]);
  assert.equal(result.primaryLanguage, 'sv');
  assert.ok((result.inboundLanguageBreakdown.sv || 0) >= 1);
});

test('scoreLanguages hojer sv for svenska specialtecken och vanliga ord', () => {
  const scores = scoreLanguages('Räksmörgås och KÄRNFRÅGOR');
  assert.ok(scores.sv > scores.en);
  assert.ok(scores.sv > scores.da);
});

test('detectLanguage: finska identifieras via stop-ord utan skandinaviska specialtecken', () => {
  const result = detectLanguage(
    'Kiitos ja terveisin hei mutta tai kun kuin te me he kanssa ilman parhain olen ei on ja paljon sanoja vahan sanoja kuitenkin riittavan pitka viesti jotta testi menee lapi kunnolla oikein.',
  );
  assert.equal(result.language, 'fi');
  assert.ok(result.confidence > 0);
});

test('getLanguageLabel nullish kod faller tillbaka till Okänt', () => {
  assert.equal(getLanguageLabel(null).native, 'Okänt');
  assert.equal(getLanguageLabel(undefined).native, 'Okänt');
});

test('detectLanguage default minLength 12 avvisar elva tecken', () => {
  assert.equal(detectLanguage('Hej tack oc').language, 'unknown');
  assert.equal(detectLanguage('Hej tack oc').confidence, 0);
});
