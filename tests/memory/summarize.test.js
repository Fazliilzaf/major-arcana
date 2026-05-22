const test = require('node:test');
const assert = require('node:assert/strict');

const { maybeSummarizeConversation } = require('../../src/memory/summarize');

test('maybeSummarizeConversation returns summarized false without OpenAI client', async () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `line-${i}`,
  }));
  const result = await maybeSummarizeConversation({
    openai: null,
    model: 'gpt-test',
    conversation: { messages, summary: '' },
    brand: 'hair-tp-clinic',
  });
  assert.deepEqual(result, { summarized: false });
});

test('maybeSummarizeConversation returns summarized false when model saknas', async () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `m${i}` }));
  const result = await maybeSummarizeConversation({
    openai: { chat: { completions: { create: async () => ({ choices: [] }) } } },
    model: '',
    conversation: { messages },
  });
  assert.deepEqual(result, { summarized: false });
});

test('maybeSummarizeConversation returns summarized false utan conversation', async () => {
  const result = await maybeSummarizeConversation({
    openai: { chat: { completions: { create: async () => ({ choices: [] }) } } },
    model: 'gpt-test',
    conversation: null,
  });
  assert.deepEqual(result, { summarized: false });
});

test('maybeSummarizeConversation skips när för få meddelanden ligger före keepLast (toSummarize < 6)', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('should not call OpenAI');
        },
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `m${i}` }));
  const result = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
    triggerMessages: 24,
    keepLast: 25,
  });
  assert.equal(result.summarized, false);
});

test('maybeSummarizeConversation skips when thread shorter than trigger threshold', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('should not call OpenAI');
        },
      },
    },
  };
  const messages = Array.from({ length: 10 }, (_, i) => ({
    role: 'user',
    content: `m${i}`,
  }));
  const result = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
    triggerMessages: 24,
  });
  assert.equal(result.summarized, false);
});

test('maybeSummarizeConversation calls model and returns trimmed summary', async () => {
  let captured = null;
  const openai = {
    chat: {
      completions: {
        create: async (opts) => {
          captured = opts;
          return { choices: [{ message: { content: '  Ny punktlista  ' } }] };
        },
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `body-${i}`,
  }));
  const result = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages, summary: 'Gammal' },
    brand: 'curatiio',
    triggerMessages: 24,
    keepLast: 12,
  });
  assert.equal(result.summarized, true);
  assert.equal(result.summary, 'Ny punktlista');
  assert.equal(result.remainingMessages.length, 12);
  assert.ok(
    captured.messages.some(
      (m) => m.role === 'system' && String(m.content).includes('Curatiio')
    )
  );
  const userMsg = captured.messages.find((m) => m.role === 'user');
  assert.ok(String(userMsg.content).includes('Patient:'));
  assert.ok(String(userMsg.content).includes('Arcana:'));
});

test('maybeSummarizeConversation treats empty completion as not summarized', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: '   ' } }] }),
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: 'user',
    content: `x${i}`,
  }));
  const result = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
  });
  assert.equal(result.summarized, false);
});

test('maybeSummarizeConversation uses okänt brand-namn i systemprompten', async () => {
  let systemContent = '';
  const openai = {
    chat: {
      completions: {
        create: async (opts) => {
          const sys = opts.messages.find((m) => m.role === 'system');
          systemContent = String(sys?.content || '');
          return { choices: [{ message: { content: 'Kort punkt.' } }] };
        },
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `body-${i}`,
  }));
  const result = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages, summary: '' },
    brand: 'NordicSkinLab',
    triggerMessages: 24,
    keepLast: 12,
  });
  assert.equal(result.summarized, true);
  assert.match(systemContent, /NordicSkinLab/);
});

test('maybeSummarizeConversation treats saknade choices som not summarized', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({ choices: [] }),
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `z${i}` }));
  const result = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
  });
  assert.equal(result.summarized, false);
});

test('maybeSummarizeConversation med messages som inte ar array avbryter fore OpenAI', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('should not call OpenAI');
        },
      },
    },
  };
  const result = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages: 'not-array' },
  });
  assert.equal(result.summarized, false);
});

test('maybeSummarizeConversation tom eller saknad messages-array avbryter före OpenAI', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('should not call OpenAI');
        },
      },
    },
  };
  const empty = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages: [] },
  });
  assert.equal(empty.summarized, false);

  const missing = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: {},
  });
  assert.equal(missing.summarized, false);
});

test('maybeSummarizeConversation tom brand ger kliniken i systemprompt', async () => {
  let systemContent = '';
  const openai = {
    chat: {
      completions: {
        create: async (opts) => {
          const sys = opts.messages.find((m) => m.role === 'system');
          systemContent = String(sys?.content || '');
          return { choices: [{ message: { content: 'Kort.' } }] };
        },
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: 'user',
    content: `body-${i}`,
  }));
  await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
    brand: '   ',
    triggerMessages: 24,
    keepLast: 12,
  });
  assert.match(systemContent, /kliniken/);
});

test('maybeSummarizeConversation hair-tp brand ger Hair TP Clinic i systemprompt', async () => {
  let systemContent = '';
  const openai = {
    chat: {
      completions: {
        create: async (opts) => {
          const sys = opts.messages.find((m) => m.role === 'system');
          systemContent = String(sys?.content || '');
          return { choices: [{ message: { content: 'Kort.' } }] };
        },
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: 'user',
    content: `body-${i}`,
  }));
  await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
    brand: 'HAIR-TP-CLINIC',
    triggerMessages: 24,
    keepLast: 12,
  });
  assert.match(systemContent, /Hair TP Clinic/);
});

test('maybeSummarizeConversation saknad brand ger kliniken i systemprompt', async () => {
  let systemContent = '';
  const openai = {
    chat: {
      completions: {
        create: async (opts) => {
          const sys = opts.messages.find((m) => m.role === 'system');
          systemContent = String(sys?.content || '');
          return { choices: [{ message: { content: 'Kort.' } }] };
        },
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: 'user',
    content: `body-${i}`,
  }));
  await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
    triggerMessages: 24,
    keepLast: 12,
  });
  assert.match(systemContent, /kliniken/);
});

test('maybeSummarizeConversation blank summary visar ingen i user-prompt', async () => {
  let userContent = '';
  const openai = {
    chat: {
      completions: {
        create: async (opts) => {
          const user = opts.messages.find((m) => m.role === 'user');
          userContent = String(user?.content || '');
          return { choices: [{ message: { content: 'Kort.' } }] };
        },
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: 'user',
    content: `body-${i}`,
  }));
  await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages, summary: '   \t  ' },
    triggerMessages: 24,
    keepLast: 12,
  });
  assert.ok(userContent.includes('(ingen)'));
});

test('maybeSummarizeConversation mappar icke-assistant roller till Patient i utdrag', async () => {
  let userContent = '';
  const openai = {
    chat: {
      completions: {
        create: async (opts) => {
          const user = opts.messages.find((m) => m.role === 'user');
          userContent = String(user?.content || '');
          return { choices: [{ message: { content: 'Kort.' } }] };
        },
      },
    },
  };
  const head = Array.from({ length: 18 }, (_, i) => ({
    role: i % 3 === 0 ? 'user' : i % 3 === 1 ? 'assistant' : 'tool',
    content: i % 3 === 0 ? `u${i}` : i % 3 === 1 ? `a${i}` : `verktyg-${i}`,
  }));
  const tail = Array.from({ length: 12 }, (_, i) => ({
    role: 'user',
    content: `tail-${i}`,
  }));
  const messages = [...head, ...tail];
  await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
    triggerMessages: 24,
    keepLast: 12,
  });
  assert.ok(userContent.includes('Patient: verktyg-2'));
  assert.ok(userContent.includes('Arcana: a1'));
});

test('maybeSummarizeConversation saknat choice message content ger not summarized', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: {} }] }),
      },
    },
  };
  const messages = Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `z${i}` }));
  const result = await maybeSummarizeConversation({
    openai,
    model: 'gpt-test',
    conversation: { messages },
  });
  assert.equal(result.summarized, false);
});
