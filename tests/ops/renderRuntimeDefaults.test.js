'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('applyRenderRuntimeDefaults fyller saknade nycklar på Render', () => {
  const original = { ...process.env };
  try {
    process.env.RENDER = 'true';
    process.env.NODE_ENV = 'production';
    delete process.env.ARCANA_STATE_ROOT;
    delete process.env.ARCANA_AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;

    delete require.cache[require.resolve('../../src/config')];
    const { config, renderRuntimeDefaults } = require('../../src/config');

    assert.equal(config.stateRoot, '/var/data');
    assert.equal(config.aiProvider, 'fallback');
    assert.ok(renderRuntimeDefaults.applied.includes('ARCANA_STATE_ROOT'));
  } finally {
    process.env = original;
    delete require.cache[require.resolve('../../src/config')];
  }
});

test('applyRenderRuntimeDefaults körs inte lokalt utan RENDER', () => {
  const original = { ...process.env };
  try {
    delete process.env.RENDER;
    delete process.env.ARCANA_STATE_ROOT;

    delete require.cache[require.resolve('../../src/config')];
    const { renderRuntimeDefaults, config } = require('../../src/config');

    assert.equal(renderRuntimeDefaults.skipped, true);
    assert.notEqual(config.stateRoot, '/var/data');
  } finally {
    process.env = original;
    delete require.cache[require.resolve('../../src/config')];
  }
});
