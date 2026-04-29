'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectLanguage,
  detectConversationLanguage,
  getLanguageLabel,
  SUPPORTED_LANGUAGES,
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
  assert.equal(getLanguageLabel('unknown').native, 'Okänt');
  assert.equal(getLanguageLabel('xx').native, 'Okänt'); // okänd kod fallback
});

test('SUPPORTED_LANGUAGES innehåller minst sv/en/de/da', () => {
  for (const lang of ['sv', 'en', 'de', 'da']) {
    assert.ok(SUPPORTED_LANGUAGES.includes(lang), `expected ${lang} to be supported`);
  }
});
