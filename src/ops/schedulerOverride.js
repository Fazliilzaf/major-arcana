'use strict';

// ORD-74b: Ägar-styrd scheduler-override från persistenta disken.
//
// Bakgrund: Renders Blueprint-sync är pausad och env-editorn i dashboarden
// kräver mänsklig hand — ARCANA_SCHEDULER_ENABLED kan inte nås maskinellt.
// Ägaren (via `render ssh`) skriver /var/data/scheduler-override.json:
//   {"schedulerEnabled": true, "schedulerJobs": ""}
// Filen läses vid boot och vinner över env för exakt tre nycklar.
// Radera filen för att återgå till ren env-styrning. Prod safe-mode
// (ARCANA_SCHEDULER_PROD_SAFE_MODE) appliceras EFTER overriden i server.js
// och vinner alltid — guardrails försvagas inte härifrån.

const fs = require('fs');
const path = require('path');

function resolveOverridePath(env = process.env) {
  if (env.ARCANA_SCHEDULER_OVERRIDE_PATH) return env.ARCANA_SCHEDULER_OVERRIDE_PATH;
  const root = env.ARCANA_STATE_ROOT || '/var/data';
  return path.join(root, 'scheduler-override.json');
}

function applySchedulerOverride(schedulerConfig, { env = process.env, logger = console } = {}) {
  const overridePath = resolveOverridePath(env);
  let raw;
  try {
    raw = fs.readFileSync(overridePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`[scheduler] override-fil oläsbar (${overridePath}): ${err.message}`);
    }
    return { applied: false, path: overridePath };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error(
      `[scheduler] override-fil ogiltig JSON, ignorerad (${overridePath}): ${err.message}`
    );
    return { applied: false, path: overridePath, error: 'invalid_json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    logger.error(`[scheduler] override-fil måste vara ett objekt, ignorerad (${overridePath})`);
    return { applied: false, path: overridePath, error: 'invalid_shape' };
  }
  const applied = {};
  if (typeof parsed.schedulerEnabled === 'boolean') {
    schedulerConfig.schedulerEnabled = parsed.schedulerEnabled;
    applied.schedulerEnabled = parsed.schedulerEnabled;
  }
  if (typeof parsed.schedulerJobs === 'string') {
    schedulerConfig.schedulerJobsAllowlist = parsed.schedulerJobs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    applied.schedulerJobs = parsed.schedulerJobs;
  }
  if (typeof parsed.schedulerRunOnStartup === 'boolean') {
    schedulerConfig.schedulerRunOnStartup = parsed.schedulerRunOnStartup;
    applied.schedulerRunOnStartup = parsed.schedulerRunOnStartup;
  }
  if (Object.keys(applied).length === 0) {
    return { applied: false, path: overridePath };
  }
  logger.warn(`[scheduler] override-fil aktiv (${overridePath}): ${JSON.stringify(applied)}`);
  return { applied: true, path: overridePath, values: applied };
}

module.exports = { applySchedulerOverride, resolveOverridePath };
