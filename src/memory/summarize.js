function formatForSummary(messages) {
  return messages
    .map((m) => {
      const role = m.role === 'assistant' ? 'Arcana' : 'Patient';
      const content = String(m.content ?? '').trim();
      return `${role}: ${content}`;
    })
    .join('\n');
}

function clinicLabelFromBrand(brand) {
  const normalized = String(brand ?? '').trim().toLowerCase();
  if (normalized === 'hair-tp-clinic') return 'Hair TP Clinic';
  if (normalized === 'curatiio') return 'Curatiio';
  return normalized ? brand : 'kliniken';
}

async function maybeSummarizeConversation({
  openai,
  model,
  conversation,
  brand,
  triggerMessages = 24,
  keepLast = 12,
}) {
  if (!conversation) return { summarized: false };
  const allMessages = Array.isArray(conversation.messages)
    ? conversation.messages
    : [];
  if (allMessages.length < triggerMessages) return { summarized: false };

  const splitIndex = Math.max(0, allMessages.length - keepLast);
  const toSummarize = allMessages.slice(0, splitIndex);
  if (toSummarize.length < 6) return { summarized: false };

  const remainingMessages = allMessages.slice(splitIndex);
  const existingSummary = String(conversation.summary ?? '').trim();

  const prompt = [
    {
      role: 'system',
      content:
        `Du uppdaterar en kort sammanfattning av en chat mellan en patient och Arcana (${clinicLabelFromBrand(brand)}). Skriv på svenska.`,
    },
    {
      role: 'user',
      content: [
        'Uppgift:',
        '- Uppdatera sammanfattningen med ny info.',
        '- Fokusera på patientens mål, relevanta bakgrundsfakta, frågor, och status för ev. bokning.',
        '- Ta INTE med telefon/e-post/personnummer i klartext. Skriv t.ex. "kontaktuppgifter insamlade".',
        '- Max 8 korta punkter.',
        '',
        'Befintlig sammanfattning:',
        existingSummary || '(ingen)',
        '',
        'Nya meddelanden att sammanfatta:',
        formatForSummary(toSummarize),
      ].join('\n'),
    },
  ];

  const result = await openai.chat.completions.create({
    model,
    messages: prompt,
    temperature: 0.2,
  });

  const summary = result.choices?.[0]?.message?.content?.trim();
  if (!summary) return { summarized: false };

  return { summarized: true, summary, remainingMessages };
}

module.exports = { maybeSummarizeConversation };
