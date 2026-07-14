#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const sshKey = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
const sshHost =
  process.env.RENDER_SSH_HOST ||
  `${process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng'}@ssh.frankfurt.render.com`;

function sshNode(script, { timeout = 120000 } = {}) {
  return execFileSync(
    'ssh',
    [
      '-i',
      sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=180',
      sshHost,
      `node -e ${JSON.stringify(script)}`,
    ],
    { encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 }
  ).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const plan = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../data/reports/pipedrive-final91-plan.json'), 'utf8')
  );
  const purgeSet = new Set(plan.plan.purge.map((row) => row.id));
  const fetchScript = `
const fs=require('fs');
const s=JSON.parse(fs.readFileSync('/var/data/cco-patient-assets.json','utf8'));
const out=[];
for (const [id,a] of Object.entries(s.items||{})) {
  if (a?.sourceSystem==='pipedrive_import' && a?.status==='REJECTED') out.push(id);
}
process.stdout.write(JSON.stringify(out));
`;

  let ids = [];
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      ids = JSON.parse(sshNode(fetchScript));
      break;
    } catch (error) {
      if (attempt === 6) throw error;
      await sleep(3000 * attempt);
    }
  }

  const toPurge = ids.filter((id) => purgeSet.has(id));
  const patientLeft = ids.filter((id) => !purgeSet.has(id));
  console.log(
    JSON.stringify({ remainingRejected: ids.length, toPurge: toPurge.length, patientLeft }, null, 2)
  );
  if (patientLeft.length) console.log('WARN patientLeft', patientLeft);

  let total = 0;
  for (let i = 0; i < toPurge.length; i += 4) {
    const batch = toPurge.slice(i, i + 4);
    const script = `
const fs=require('fs');
const ids=new Set(${JSON.stringify(batch)});
const p='/var/data/cco-patient-assets.json';
const s=JSON.parse(fs.readFileSync(p,'utf8'));
let purged=0;
for (const id of ids) {
  const a=s.items?.[id];
  if (!a) continue;
  if (a.sourceSystem!=='pipedrive_import' || a.status!=='REJECTED') continue;
  if (a.isJournalRelevant===true) continue;
  delete s.items[id];
  purged+=1;
}
fs.writeFileSync(p, JSON.stringify(s,null,2)+'\\n');
process.stdout.write(JSON.stringify({ purged }));
`;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        const result = JSON.parse(sshNode(script));
        total += result.purged;
        console.log(`batch ${i} purged ${result.purged}`);
        break;
      } catch (error) {
        if (attempt === 6) console.error(`batch ${i} failed`);
        await sleep(4000 * attempt);
      }
    }
    await sleep(2500);
  }

  console.log(JSON.stringify({ totalPurged: total }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
