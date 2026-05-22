const test = require('node:test');
const assert = require('node:assert/strict');

const { buildClinicMessages } = require('../../src/clinic/buildMessages');

test('buildClinicMessages loads brand system prompt and appends user turn', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [], summary: '' },
    knowledge: [],
    currentUserMessage: ' Hej ',
  });
  assert.equal(messages[0].role, 'system');
  assert.ok(String(messages[0].content).includes('Hair TP Clinic'));
  assert.equal(messages[messages.length - 1].role, 'user');
  assert.equal(messages[messages.length - 1].content, 'Hej');
});

test('buildClinicMessages adds summary and knowledge system blocks', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: {
      summary: 'Patient vill boka.',
      messages: [{ role: 'user', content: 'Tidigare fråga' }],
    },
    knowledge: [{ content: 'Öppet vardagar', attribution: 'FAQ' }],
    currentUserMessage: '',
  });
  const blocks = messages.map((m) => m.content).join('\n');
  assert.ok(blocks.includes('Konversationsminne'));
  assert.ok(blocks.includes('Patient vill boka.'));
  assert.ok(blocks.includes('Klinikfakta'));
  assert.ok(blocks.includes('Källa: FAQ'));
  assert.ok(blocks.includes('Öppet vardagar'));
});

test('buildClinicMessages ignores non user assistant history roles', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: {
      messages: [
        { role: 'system', content: 'ignored' },
        { role: 'user', content: 'U1' },
        { role: 'tool', content: 'ignored' },
        { role: 'assistant', content: 'A1' },
      ],
    },
    knowledge: [],
    currentUserMessage: 'Ny',
  });
  const roles = messages.map((m) => `${m.role}:${m.content}`);
  assert.equal(roles.includes('system:ignored'), false);
  assert.ok(roles.some((r) => r === 'user:U1'));
  assert.ok(roles.some((r) => r === 'assistant:A1'));
});

test('buildClinicMessages knowledge utan attribution men med source markerar internt underlag', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [], summary: '' },
    knowledge: [{ content: '  Fakta rad  ', source: 'internal-doc' }],
    currentUserMessage: '',
  });
  const joined = messages.map((m) => m.content).join('\n');
  assert.ok(joined.includes('Källa: internt underlag'));
  assert.ok(joined.includes('Fakta rad'));
});

test('buildClinicMessages lagger inte till user-turn for tom eller icke-sträng currentUserMessage', async () => {
  const empty = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [{ role: 'user', content: 'Endast historik' }] },
    knowledge: [],
    currentUserMessage: '   ',
  });
  assert.equal(empty[empty.length - 1].content, 'Endast historik');

  const notString = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [] },
    knowledge: [],
    currentUserMessage: null,
  });
  assert.notEqual(notString[notString.length - 1].role, 'user');
});

test('buildClinicMessages tolererar conversation utan messages-array', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { summary: '' },
    knowledge: [],
    currentUserMessage: 'Hej',
  });
  assert.equal(messages[messages.length - 1].role, 'user');
  assert.equal(messages[messages.length - 1].content, 'Hej');
});

test('buildClinicMessages knowledge utan source och attribution markerar okänd källa', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [], summary: '' },
    knowledge: [{ content: 'Lös info' }],
    currentUserMessage: '',
  });
  const joined = messages.map((m) => m.content).join('\n');
  assert.ok(joined.includes('Källa: okänd'));
  assert.ok(joined.includes('Lös info'));
});

test('buildClinicMessages hoppar dedikerad knowledge-systemrad när knowledge inte är en array', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [], summary: '' },
    knowledge: null,
    currentUserMessage: 'Hej',
  });
  const knowledgeSystemBlocks = messages.filter(
    (m) => m.role === 'system' && String(m.content).startsWith('Klinikfakta (använd endast om relevant')
  );
  assert.equal(knowledgeSystemBlocks.length, 0);
  assert.equal(messages[messages.length - 1].content, 'Hej');
});

test('buildClinicMessages staplar flera knowledge-poster i ordning', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [], summary: '' },
    knowledge: [
      { content: 'Första', attribution: 'A' },
      { content: 'Andra', attribution: 'B' },
    ],
    currentUserMessage: '',
  });
  const joined = messages.map((m) => m.content).join('\n');
  const first = joined.indexOf('Källa: A');
  const second = joined.indexOf('Källa: B');
  assert.ok(first >= 0 && second > first);
  assert.ok(joined.indexOf('Första') < joined.indexOf('Andra'));
});

test('buildClinicMessages tom knowledge-array lägger inte till klinikfakta-block', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [], summary: '' },
    knowledge: [],
    currentUserMessage: 'Hej',
  });
  assert.equal(
    messages.filter((m) => m.role === 'system' && String(m.content).startsWith('Klinikfakta')).length,
    0
  );
});

test('buildClinicMessages undefined knowledge ger inget klinikfakta-block', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [] },
    knowledge: undefined,
    currentUserMessage: 'Hej',
  });
  assert.equal(
    messages.filter((m) => m.role === 'system' && String(m.content).startsWith('Klinikfakta')).length,
    0
  );
});

test('buildClinicMessages knowledge prioriterar attribution framför source', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [], summary: '' },
    knowledge: [{ content: 'Faktarad', attribution: 'Primär källa', source: 'internal-wiki' }],
    currentUserMessage: '',
  });
  const joined = messages.map((m) => m.content).join('\n');
  assert.ok(joined.includes('Källa: Primär källa'));
  assert.equal(joined.includes('internt underlag'), false);
});

test('buildClinicMessages tolererar saknad conversation', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    knowledge: [],
    currentUserMessage: 'Nytt',
  });
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[messages.length - 1].role, 'user');
  assert.equal(messages[messages.length - 1].content, 'Nytt');
});

test('buildClinicMessages tolererar null conversation', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: null,
    knowledge: [],
    currentUserMessage: 'Hej',
  });
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[messages.length - 1].role, 'user');
  assert.equal(messages[messages.length - 1].content, 'Hej');
});

test('buildClinicMessages knowledge-poster med tom content ger fortfarande Klinikfakta-block', async () => {
  const messages = await buildClinicMessages({
    brand: 'hair-tp-clinic',
    conversation: { messages: [], summary: '' },
    knowledge: [{ content: '   ' }],
    currentUserMessage: '',
  });
  const knowledgeBlocks = messages.filter(
    (m) => m.role === 'system' && String(m.content).startsWith('Klinikfakta (använd endast om relevant')
  );
  assert.equal(knowledgeBlocks.length, 1);
  assert.ok(knowledgeBlocks[0].content.includes('Källa: okänd'));
});
