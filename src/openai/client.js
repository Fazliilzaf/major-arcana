const OpenAI = require('openai');
const { config } = require('../config');

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

module.exports = { openai };
