const test = require('node:test');
const assert = require('node:assert/strict');

const { runChatWithTools } = require('../../src/openai/runChatWithTools');

test('runChatWithTools returns offline copy when openai or model missing', async () => {
  const a = await runChatWithTools({
    openai: null,
    model: 'gpt',
    messages: [{ role: 'user', content: 'Hej' }],
  });
  assert.match(a, /begränsat AI-läge/i);

  const b = await runChatWithTools({
    openai: { chat: { completions: { create: async () => ({}) } } },
    model: '',
    messages: [],
  });
  assert.match(b, /begränsat AI-läge/i);
});

test('runChatWithTools returns assistant text when no tool calls', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '  Svar  ' } }],
        }),
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'q' }],
  });
  assert.equal(out, 'Svar');
});

test('runChatWithTools runs tool handler then final assistant message', async () => {
  let calls = 0;
  const openai = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          calls += 1;
          if (calls === 1) {
            assert.equal(messages.length, 1);
            return {
              choices: [
                {
                  message: {
                    content: '',
                    tool_calls: [
                      {
                        id: 'call-1',
                        function: { name: 'ping', arguments: '{"x":1}' },
                      },
                    ],
                  },
                },
              ],
            };
          }
          assert.ok(messages.some((m) => m.role === 'tool'));
          return { choices: [{ message: { content: 'klar' } }] };
        },
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'go' }],
    tools: [{ type: 'function', function: { name: 'ping' } }],
    toolHandlers: {
      ping: async (args) => {
        assert.deepEqual(args, { x: 1 });
        return { ok: true };
      },
    },
  });
  assert.equal(out, 'klar');
  assert.equal(calls, 2);
});

test('runChatWithTools records unknown tool error in tool message', async () => {
  let calls = 0;
  const openai = {
    chat: {
      completions: {
        create: async () => {
          calls += 1;
          if (calls === 1) {
            return {
              choices: [
                {
                  message: {
                    content: '',
                    tool_calls: [
                      {
                        id: 'c2',
                        function: { name: 'missing', arguments: '{}' },
                      },
                    ],
                  },
                },
              ],
            };
          }
          return { choices: [{ message: { content: 'fortsatt' } }] };
        },
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'x' }],
    tools: [{ type: 'function', function: { name: 'missing' } }],
    toolHandlers: {},
    maxTurns: 3,
  });
  assert.equal(out, 'fortsatt');
});

test('runChatWithTools yields stuck message when maxTurns exhausted with tools', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'id-loop',
                    function: { name: 'noop', arguments: '{}' },
                  },
                ],
              },
            },
          ],
        }),
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'y' }],
    tools: [{ type: 'function', function: { name: 'noop' } }],
    toolHandlers: { noop: async () => ({ ok: true }) },
    maxTurns: 2,
  });
  assert.match(out, /fastnade/);
});

test('runChatWithTools returns fallback when completion has no message', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({ choices: [] }),
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'hej' }],
  });
  assert.match(out, /inget svar/i);
});

test('runChatWithTools passes empty object to handler when tool args JSON is invalid', async () => {
  let calls = 0;
  const openai = {
    chat: {
      completions: {
        create: async () => {
          calls += 1;
          if (calls === 1) {
            return {
              choices: [
                {
                  message: {
                    content: '',
                    tool_calls: [
                      { id: 'bad-json', function: { name: 'toolA', arguments: '{not-json' } },
                    ],
                  },
                },
              ],
            };
          }
          return { choices: [{ message: { content: 'ok' } }] };
        },
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'q' }],
    tools: [{ type: 'function', function: { name: 'toolA' } }],
    toolHandlers: {
      toolA: async (args) => {
        assert.deepEqual(args, {});
        return { ok: true };
      },
    },
  });
  assert.equal(out, 'ok');
});

test('runChatWithTools behandlar icke-array messages som tom historik', async () => {
  const openai = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          assert.deepEqual(messages, []);
          return { choices: [{ message: { content: 'utan historik' } }] };
        },
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: 'not-an-array',
  });
  assert.equal(out, 'utan historik');
});

test('runChatWithTools fallback när assistent-svar bara är blanksteg', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '   \n  ' } }],
        }),
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'hej' }],
  });
  assert.match(out, /inget svar/i);
});

test('runChatWithTools skickar objekt-arguments direkt till handler', async () => {
  let calls = 0;
  const openai = {
    chat: {
      completions: {
        create: async () => {
          calls += 1;
          if (calls === 1) {
            return {
              choices: [
                {
                  message: {
                    content: '',
                    tool_calls: [
                      {
                        id: 'obj-args',
                        function: { name: 'shape', arguments: { k: 2, nested: { a: true } } },
                      },
                    ],
                  },
                },
              ],
            };
          }
          return { choices: [{ message: { content: 'done' } }] };
        },
      },
    },
  };
  const out = await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'q' }],
    tools: [{ type: 'function', function: { name: 'shape' } }],
    toolHandlers: {
      shape: async (args) => {
        assert.deepEqual(args, { k: 2, nested: { a: true } });
        return { ok: true };
      },
    },
  });
  assert.equal(out, 'done');
});

test('runChatWithTools sätter inte tool_choice när tools saknas eller är tom', async () => {
  const seen = [];
  const openai = {
    chat: {
      completions: {
        create: async (params) => {
          seen.push(params);
          return { choices: [{ message: { content: 'plain' } }] };
        },
      },
    },
  };

  await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'a' }],
  });
  assert.strictEqual(seen[0].tool_choice, undefined);

  await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'b' }],
    tools: [],
  });
  assert.strictEqual(seen[1].tool_choice, undefined);

  await runChatWithTools({
    openai,
    model: 'm',
    messages: [{ role: 'user', content: 'c' }],
    tools: [{ type: 'function', function: { name: 'x' } }],
  });
  assert.strictEqual(seen[2].tool_choice, 'auto');
});
