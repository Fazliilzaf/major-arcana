const OpenAI = require('openai');
const { config } = require('../config');
const { guardOpenAiChatCompletions } = require('../ops/ccoJournalAiGuard');

const openai =
  config.aiProvider === 'openai'
    ? new OpenAI({
        apiKey: config.openaiApiKey,
      })
    : null;

// Defense in depth (PDL / clinic policy: no journal content to external AI).
// Guard the single SDK choke point so EVERY outgoing chat completion — from any
// caller, including tool results fed back into the model — has journal/clinical
// content redacted first. Fail-safe: redacts the message content, never throws
// or drops the call. (Logic lives in ccoJournalAiGuard so it stays unit-tested.)
guardOpenAiChatCompletions(openai);

module.exports = { openai };
