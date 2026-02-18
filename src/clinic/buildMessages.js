const { getClinicSystemPrompt } = require('./prompt');

function formatKnowledge(knowledge) {
  if (!Array.isArray(knowledge) || knowledge.length === 0) return '';
  return knowledge
    .map((k) => {
      const source =
        k.attribution
          ? `Källa: ${k.attribution}`
          : k.source
            ? 'Källa: internt underlag'
            : 'Källa: okänd';
      const content = String(k.content ?? '').trim();
      return `---\n${source}\n${content}`;
    })
    .join('\n');
}

async function buildClinicMessages({
  brand,
  conversation,
  knowledge,
  currentUserMessage,
}) {
  const systemPrompt = await getClinicSystemPrompt(brand);

  const messages = [
    {
      role: 'system',
      content:
        systemPrompt ||
        'Du är Arcana, en hjälpsam assistent. Svara på svenska.',
    },
  ];

  if (conversation?.summary) {
    messages.push({
      role: 'system',
      content: `Konversationsminne (sammanfattning):\n${conversation.summary}`,
    });
  }

  const knowledgeBlock = formatKnowledge(knowledge);
  if (knowledgeBlock) {
    messages.push({
      role: 'system',
      content:
        'Klinikfakta (använd endast om relevant; om info saknas, säg att du behöver dubbelkolla):\n' +
        knowledgeBlock,
    });
  }

  const history = Array.isArray(conversation?.messages)
    ? conversation.messages
    : [];
  for (const m of history) {
    if (m?.role !== 'user' && m?.role !== 'assistant') continue;
    messages.push({ role: m.role, content: String(m.content ?? '') });
  }

  if (typeof currentUserMessage === 'string' && currentUserMessage.trim()) {
    messages.push({ role: 'user', content: currentUserMessage.trim() });
  }

  return messages;
}

module.exports = { buildClinicMessages };
