function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function runChatWithTools({
  openai,
  model,
  messages,
  tools,
  toolHandlers,
  maxTurns = 4,
}) {
  const workingMessages = Array.isArray(messages) ? [...messages] : [];

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const completion = await openai.chat.completions.create({
      model,
      messages: workingMessages,
      tools,
      tool_choice: tools?.length ? 'auto' : undefined,
      temperature: 0.4,
    });

    const msg = completion.choices?.[0]?.message;
    if (!msg) return 'Jag fick inget svar. Vill du försöka igen?';

    const toolCalls = msg.tool_calls || [];
    const content = typeof msg.content === 'string' ? msg.content : '';

    if (!toolCalls.length) {
      return content.trim() || 'Jag fick inget svar. Vill du försöka igen?';
    }

    workingMessages.push({
      role: 'assistant',
      content,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call?.function?.name;
      const rawArgs = call?.function?.arguments;
      const handler = name ? toolHandlers?.[name] : null;

      let toolResult;
      if (!handler) {
        toolResult = { ok: false, error: `Okänt verktyg: ${name}` };
      } else {
        const args = typeof rawArgs === 'string' ? safeJsonParse(rawArgs) : rawArgs;
        toolResult = await handler(args ?? {});
      }

      workingMessages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return 'Jag fastnade när jag försökte utföra en åtgärd. Vill du beskriva vad du vill göra en gång till?';
}

module.exports = { runChatWithTools };
