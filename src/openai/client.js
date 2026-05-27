const OpenAI = require('openai');
const { config } = require('../config');
const { redactChatCompletionParams } = require('../ops/ccoJournalAiGuard');

const openai =
  config.aiProvider === 'openai'
    ? new OpenAI({
        apiKey: config.openaiApiKey,
      })
    : null;

// Defense in depth (PDL / clinic policy: no journal content to external AI).
// Wrap the single SDK choke point so EVERY outgoing chat completion — from any
// caller, including tool results fed back into the model — has journal/clinical
// content redacted first. Fail-safe: redacts the message content, never throws
// or drops the call.
if (openai && openai.chat && openai.chat.completions) {
  const completions = openai.chat.completions;
  const originalCreate = completions.create.bind(completions);
  completions.create = (params, ...rest) =>
    originalCreate(redactChatCompletionParams(params), ...rest);
}

module.exports = { openai };
