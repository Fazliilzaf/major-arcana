const OpenAI = require('openai');
const { config } = require('../config');

const openai =
  config.aiProvider === 'openai'
    ? new OpenAI({
        apiKey: config.openaiApiKey,
      })
    : null;

module.exports = { openai };
