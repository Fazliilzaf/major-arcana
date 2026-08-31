#!/usr/bin/env node
'use strict';

/**
 * Rapporterar om CLIENTO_API_KEY finns på Frankfurt-prod (utan att skriva ut värdet).
 */
const fs = require('fs');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';

async function main() {
  const cliPath = `${process.env.HOME}/.render/cli.yaml`;
  const cliYaml = fs.readFileSync(cliPath, 'utf8');
  const apiKey = (cliYaml.match(/key: (rnd_\S+)/) || [])[1];
  if (!apiKey) {
    console.error('❌ Saknar Render API key i ~/.render/cli.yaml');
    process.exit(1);
  }

  // ORD-156: paginerad läsning. Med ?limit=100 mot 122 nycklar kunde en satt
  // Cliento-nyckel bortom första sidan rapporteras som saknad.
  const { fetchAllRenderEnvMap } = require('./lib/renderEnvApi');
  const keys = [...(await fetchAllRenderEnvMap(serviceId, apiKey)).keys()];
  const hasGlobal = keys.includes('CLIENTO_API_KEY');
  const hasBrand = keys.includes('CLIENTO_API_KEY_HAIR_TP_CLINIC');
  const present = hasGlobal || hasBrand;

  console.log(`CLIENTO_API_KEY på Frankfurt (${serviceId}): ${present ? 'JA' : 'NEJ'}`);
  if (!present) {
    console.log('→ Fazli behöver hämta nyckel från Cliento och köra apply:cliento-prod-env.');
  }
  const clientoKeys = keys.filter((key) => /CLIENTO/i.test(key));
  console.log(`Cliento-relaterade env (${clientoKeys.length}): ${clientoKeys.join(', ')}`);
}

main().catch((error) => {
  console.error(`❌ ${error.message || String(error)}`);
  process.exit(1);
});
