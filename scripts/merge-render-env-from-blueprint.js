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
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
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

/**
 * ORD-156 §3 — nycklarna Blueprinten ALDRIG bär värdet för (`sync: false`).
 *
 * De sätts för hand i dashboarden: Graph-credentials, Resend, Cliento, BankID,
 * OpenAI. En återställning ur render.yaml fyller alltså inte i dem, och en
 * env-räkning som bara ser antalet blir grön medan de är tomma. Det inträffade
 * 2026-08-31: 97 nycklar (över golvet) med 28 hemligheter saknade.
 *
 * Antalet får aldrig dölja en tom hemlighet — därför räknas de här separat.
 */
function parseRenderYamlSecretKeys(yamlText) {
  const secrets = [];
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
    if (/^\s*value:\s*/.test(line)) {
      currentKey = null;
      continue;
    }
    if (/^\s*sync:\s*false\s*$/.test(line) && currentKey) {
      secrets.push(currentKey);
      currentKey = null;
    }
  }
  return secrets;
}

/**
 * ORD-156 §6 — YAML-dubbletter. Samma `key:` får inte deklareras flera gånger;
 * render.yaml-autosync blir annars tvetydig (vilken deklaration vinner?).
 * Returnerar [key, antal] för nycklar som förekommer mer än en gång.
 */
function parseRenderYamlDuplicateKeys(yamlText) {
  const counts = new Map();
  const lines = yamlText.split(/\r?\n/);
  let inEnvVars = false;

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
      const key = keyMatch[1].trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
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

module.exports = {
  parseRenderYamlEnvDefaults,
  parseRenderYamlSecretKeys,
  parseRenderYamlDuplicateKeys,
  mergeEnv,
};
