const fs = require('node:fs/promises');
const path = require('node:path');
const { config } = require('../config');

const cache = new Map();

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return '';
    throw error;
  }
}

async function getClinicSystemPrompt(brand) {
  const resolvedBrand =
    typeof brand === 'string' && brand.trim() ? brand.trim() : config.brand;
  if (cache.has(resolvedBrand)) return cache.get(resolvedBrand);

  const baseDir = path.join(process.cwd(), 'prompts', resolvedBrand);
  const system = await readIfExists(path.join(baseDir, 'system.md'));
  const style = await readIfExists(path.join(baseDir, 'style.md'));

  const prompt = [system, style].filter(Boolean).join('\n\n').trim();
  cache.set(resolvedBrand, prompt);
  return prompt;
}

module.exports = { getClinicSystemPrompt };
