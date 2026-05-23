#!/usr/bin/env node
'use strict';

/**
 * Merge Render env-vars: behåll befintliga värden, fyll saknade från render.yaml (value:).
 * Används av scripts/restore-render-env-from-blueprint.sh och CI post-deploy.
 */
const fs = require('fs');
const path = require('path');

function parseRenderYamlEnvDefaults(yamlText) {
  const defaults = new Map();
  const lines = yamlText.split(/\r?\n/);
  let inEnvVars = false;
  let currentKey = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (/^\s*envVars:\s*$/.test(line)) {
      inEnvVars = true;
      continue;
    }
    if (!inEnvVars) continue;
    if (/^\S/.test(line) && !/^\s/.test(rawLine)) break;

    const keyMatch = line.match(/^\s*-\s*key:\s*(.+)\s*$/);
    if (keyMatch) {
      currentKey = keyMatch[1].trim();
      continue;
    }
    const valueMatch = line.match(/^\s*value:\s*(.+)\s*$/);
    if (valueMatch && currentKey) {
      let value = valueMatch[1].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      defaults.set(currentKey, value);
      currentKey = null;
    }
    if (/^\s*sync:\s*false\s*$/.test(line)) {
      currentKey = null;
    }
  }
  return defaults;
}

function mergeEnv(existingRows, yamlDefaults) {
  const map = new Map();
  for (const row of existingRows) {
    const ev = row.envVar || row;
    if (ev?.key) map.set(ev.key, ev.value ?? '');
  }
  for (const [key, value] of yamlDefaults.entries()) {
    if (!map.has(key) || map.get(key) === '') map.set(key, value);
  }
  return [...map.entries()].map(([key, value]) => ({ key, value }));
}

function main() {
  const yamlPath = process.argv[2] || path.join(process.cwd(), 'render.yaml');
  const existingRaw = process.argv[3] || '[]';
  const yaml = fs.readFileSync(yamlPath, 'utf8');
  const existing = JSON.parse(existingRaw);
  const yamlDefaults = parseRenderYamlEnvDefaults(yaml);
  const merged = mergeEnv(existing, yamlDefaults);
  process.stdout.write(JSON.stringify(merged));
}

if (require.main === module) main();

module.exports = { parseRenderYamlEnvDefaults, mergeEnv };
