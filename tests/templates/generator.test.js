const test = require('node:test');
const assert = require('node:assert/strict');

const { generateTemplateDraft } = require('../../src/templates/generator');

test('generateTemplateDraft returns Swedish fallback when OpenAI is unavailable', async () => {
  const out = await generateTemplateDraft({
    openai: null,
    model: '',
    tenantName: 'Test Clinic',
    category: 'BOOKING',
    name: 'Bokningsbekräftelse',
    instruction: 'Bekräfta tiden tydligt.',
  });
  assert.equal(out.provider, 'fallback');
  assert.match(out.content, /Bokningsbekräftelse/);
  assert.match(out.content, /Bekräfta tiden tydligt/);
  assert.match(out.content, /\{\{first_name\}\}/);
  assert.match(out.content, /\{\{clinic_name\}\}/);
});

test('generateTemplateDraft fallback nar openai finns men model saknas', async () => {
  const out = await generateTemplateDraft({
    openai: { chat: { completions: { create: async () => ({ choices: [] }) } } },
    model: '',
    category: 'BOOKING',
    name: 'N',
  });
  assert.equal(out.provider, 'fallback');
});

test('generateTemplateDraft fallback for okand kategori anvander MALL och minst clinic_name', async () => {
  const out = await generateTemplateDraft({
    openai: null,
    model: '',
    category: '   ',
    name: 'Test',
    instruction: '',
  });
  assert.match(out.content, /\(MALL\)/);
  assert.match(out.content, /\{\{clinic_name\}\}/);
});

test('generateTemplateDraft uses fallback_empty when model returns blank content', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: '   ' } }] }),
      },
    },
  };
  const out = await generateTemplateDraft({
    openai,
    model: 'gpt-test',
    category: 'BOOKING',
    name: 'X',
    instruction: '',
  });
  assert.equal(out.provider, 'fallback_empty');
  assert.match(out.content, /Ämne: X/);
});

test('generateTemplateDraft uses fallback_empty nar choices saknas', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({ choices: [] }),
      },
    },
  };
  const out = await generateTemplateDraft({
    openai,
    model: 'gpt-test',
    category: 'BOOKING',
    name: 'Q',
  });
  assert.equal(out.provider, 'fallback_empty');
  assert.match(out.content, /Ämne: Q/);
});

test('generateTemplateDraft uses fallback_error when OpenAI throws', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('network');
        },
      },
    },
  };
  const out = await generateTemplateDraft({
    openai,
    model: 'gpt-test',
    category: 'BOOKING',
    name: 'Y',
  });
  assert.equal(out.provider, 'fallback_error');
  assert.match(out.content, /Y/);
});

test('generateTemplateDraft returns OpenAI content when present', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '  Mallrader utan markdown  ' } }],
        }),
      },
    },
  };
  const out = await generateTemplateDraft({
    openai,
    model: 'gpt-test',
    category: 'BOOKING',
    name: 'Z',
  });
  assert.equal(out.provider, 'openai');
  assert.equal(out.content, 'Mallrader utan markdown');
});

test('generateTemplateDraft builds system prompt with tenant fallback and allowed vars', async () => {
  let capturedMessages = null;
  const openai = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          capturedMessages = messages;
          return { choices: [{ message: { content: 'ok' } }] };
        },
      },
    },
  };
  const out = await generateTemplateDraft({
    openai,
    model: 'gpt-test',
    tenantName: '',
    category: 'BOOKING',
    name: 'Promptcheck',
  });
  assert.equal(out.provider, 'openai');
  assert.ok(Array.isArray(capturedMessages));
  const system = capturedMessages.find((m) => m.role === 'system')?.content || '';
  assert.match(system, /Klinik\/tenant: Kliniken/);
  assert.match(system, /\{\{first_name\}\}/);
  assert.match(system, /\{\{clinic_name\}\}/);
});

test('generateTemplateDraft fallback uses default instruction when instruction missing', async () => {
  const out = await generateTemplateDraft({
    openai: null,
    model: '',
    category: 'BOOKING',
    name: 'Instruktionslös',
    instruction: '',
  });
  assert.equal(out.provider, 'fallback');
  assert.match(out.content, /Tack för din kontakt med \{\{clinic_name\}\}/);
});

test('generateTemplateDraft fallback_empty nar choice message saknar content', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: {} }] }),
      },
    },
  };
  const out = await generateTemplateDraft({
    openai,
    model: 'gpt-test',
    category: 'BOOKING',
    name: 'NoContent',
  });
  assert.equal(out.provider, 'fallback_empty');
  assert.match(out.content, /Ämne: NoContent/);
});

test('generateTemplateDraft icke-sträng category faller tillbaka till MALL i ämnesrad', async () => {
  const out = await generateTemplateDraft({
    openai: null,
    model: '',
    category: 123,
    name: 'WeirdCat',
    instruction: 'Hej.',
  });
  assert.equal(out.provider, 'fallback');
  assert.match(out.content, /Ämne: WeirdCat \(MALL\)/);
});

test('generateTemplateDraft fallback for INTERNAL inkluderar staff_name i variabelrader', async () => {
  const out = await generateTemplateDraft({
    openai: null,
    model: '',
    category: 'INTERNAL',
    name: 'Intern notis',
    instruction: 'Kort intern uppdatering.',
  });
  assert.equal(out.provider, 'fallback');
  assert.match(out.content, /\(INTERNAL\)/);
  assert.match(out.content, /\{\{staff_name\}\}/);
  assert.match(out.content, /Kort intern uppdatering/);
});

test('generateTemplateDraft fallback begränsar variabelrader till fem första nycklarna', async () => {
  const out = await generateTemplateDraft({
    openai: null,
    model: '',
    category: 'BOOKING',
    name: 'Bokning',
    instruction: 'Hej.',
  });
  const line = out.content.split('\n').find((l) => l.startsWith('Förslag på variabler:'));
  assert.ok(line);
  const hints = line.replace(/^Förslag på variabler:\s*/, '');
  assert.equal(hints.split(', ').length, 5);
  assert.match(hints, /\{\{first_name\}\}/);
  assert.match(hints, /\{\{clinic_email\}\}/);
  assert.equal(hints.includes('{{booking_link}}'), false);
});

test('generateTemplateDraft fallback använder Ny mall när name saknas eller är tom sträng', async () => {
  const a = await generateTemplateDraft({
    openai: null,
    model: '',
    category: 'LEAD',
    name: null,
    instruction: 'X',
  });
  assert.match(a.content, /Ämne: Ny mall \(LEAD\)/);

  const b = await generateTemplateDraft({
    openai: null,
    model: '',
    category: 'LEAD',
    name: '',
    instruction: 'X',
  });
  assert.match(b.content, /Ämne: Ny mall \(LEAD\)/);
});
