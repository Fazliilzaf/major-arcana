const { normalizeCategory } = require('./constants');
const { VARIABLE_WHITELIST_BY_CATEGORY } = require('./variables');

function fallbackContent({
  name,
  category,
  instruction,
  allowedVariables,
}) {
  const friendlyCategory = normalizeCategory(category) || 'MALL';
  const variableHints = allowedVariables.slice(0, 5).map((v) => `{{${v}}}`).join(', ');
  return [
    `Ämne: ${name || 'Ny mall'} (${friendlyCategory})`,
    '',
    'Hej {{first_name}},',
    '',
    instruction || 'Tack för din kontakt med {{clinic_name}}.',
    '',
    'Nästa steg:',
    '- Vi återkopplar med mer information inom kort.',
    '- Vid frågor, kontakta oss via {{clinic_phone}} eller {{clinic_email}}.',
    '',
    `Förslag på variabler: ${variableHints || '{{clinic_name}}'}`,
    '',
    'Vänliga hälsningar,',
    '{{clinic_name}}',
  ].join('\n');
}

async function generateTemplateDraft({
  openai,
  model,
  tenantName = '',
  category,
  name,
  instruction = '',
}) {
  const normalizedCategory = normalizeCategory(category);
  const allowedVariables = VARIABLE_WHITELIST_BY_CATEGORY[normalizedCategory] || [];

  if (!openai || !model) {
    return {
      content: fallbackContent({ name, category, instruction, allowedVariables }),
      provider: 'fallback',
    };
  }

  const systemPrompt = [
    'Du skriver mallutkast på svenska för intern klinikadministration.',
    'Svara endast med själva malltexten, ingen markdown och inga kommentarer.',
    `Kategori: ${normalizedCategory}`,
    `Klinik/tenant: ${tenantName || 'Kliniken'}`,
    `Tillåtna variabler: ${allowedVariables.map((v) => `{{${v}}}`).join(', ') || '{{clinic_name}}'}.`,
    'Använd endast variabler som finns i listan.',
    'Undvik diagnoser, medicinska garantier och riskabla löften.',
  ].join('\n');

  const userPrompt = [
    `Mallnamn: ${name || 'Ny mall'}`,
    `Instruktion: ${instruction || 'Skapa ett professionellt utkast.'}`,
  ].join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = String(completion?.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      return {
        content: fallbackContent({ name, category, instruction, allowedVariables }),
        provider: 'fallback_empty',
      };
    }

    return {
      content,
      provider: 'openai',
    };
  } catch {
    return {
      content: fallbackContent({ name, category, instruction, allowedVariables }),
      provider: 'fallback_error',
    };
  }
}

module.exports = {
  generateTemplateDraft,
};
