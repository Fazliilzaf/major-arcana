#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { getProdToken } = require('../lib/halsoHdProdClient');

const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const REPORT = path.join(__dirname, '../../data/reports/pipedrive-final91-plan.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const plan = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const token = getProdToken();
  const ids = plan.plan.purge.map((row) => row.id);
  let purged = 0;
  let failed = 0;

  for (const assetId of ids) {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const res = await fetch(
        `${BASE}/api/v1/cco/assets/${encodeURIComponent(assetId)}/migration-purge-non-patient`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-arcana-client': 'major_arcana_admin',
          },
          body: JSON.stringify({ reason: 'pipedrive_non_patient_orphan_final91' }),
        }
      );
      const text = await res.text();
      if (res.ok) {
        purged += 1;
        break;
      }
      if (res.status === 409) break;
      if (res.status === 404 && text.includes('Cannot POST')) {
        console.error('migration-purge-non-patient saknas på prod — deploya server.js först');
        process.exit(2);
      }
      if (res.status >= 500 && attempt < 6) {
        await sleep(1500 * attempt);
        continue;
      }
      failed += 1;
      if (failed <= 3) console.error(assetId, res.status, text.slice(0, 120));
      break;
    }
    await sleep(250);
  }

  console.log(JSON.stringify({ purged, failed, total: ids.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
