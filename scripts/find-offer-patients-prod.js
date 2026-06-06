#!/usr/bin/env node
'use strict';

/**
 * Hitta patienter med offert/behandlingsplan i prod (stickprov för UAT).
 * Usage: npm run find:offer-patients-prod
 *        npm run find:offer-patients-prod -- --query "Robin"
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const LIMIT = Number(process.env.OFFER_FIND_LIMIT || 5000);

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function api(token, route) {
  const res = await fetch(`${BASE}${route}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function hasOfferSignal(row) {
  if (!row) return false;
  if (row.missingTreatmentPlan === false) return true;
  const status = String(row.treatmentPlanStatus || '').toLowerCase();
  if (status && !['missing', 'draft', ''].includes(status)) return true;
  if (row.agreementSigned === true) return true;
  const signals = row.automationSignals || [];
  return signals.some(
    (s) =>
      s?.status === 'active' &&
      String(s.ruleId || '').includes('treatment_plan') &&
      !String(s.ruleId || '').includes('missing')
  );
}

async function main() {
  const queryArg = process.argv.find((a) => a.startsWith('--query='));
  const query = queryArg ? decodeURIComponent(queryArg.slice(8)) : '';

  let token;
  try {
    token = getToken();
  } catch (err) {
    console.error('Auth failed:', err.message || err);
    process.exit(1);
  }

  const qParam = query ? `&q=${encodeURIComponent(query)}` : '';
  const shell = await api(
    token,
    `/api/v1/cco/staff/customers-shell?limit=${LIMIT}&offset=0&includeAutomation=1${qParam}`
  );
  if (shell.status !== 200) {
    console.error('customers-shell failed:', shell.status);
    process.exit(1);
  }

  const rows = shell.body?.patients?.patients || [];
  const offers = rows.filter(hasOfferSignal).slice(0, 20);

  console.log(`Offer-patienter @ ${BASE}${query ? ` (filter: "${query}")` : ''}\n`);
  console.log(`Scannade: ${rows.length} · Träffar med offert-signal: ${offers.length}\n`);

  if (!offers.length) {
    console.log(
      'Inga träffar. Prova: --query=Offertnamn eller segment Saknar journal + manuell dossier.'
    );
    process.exit(0);
  }

  offers.slice(0, 5).forEach((row, idx) => {
    console.log(
      `${idx + 1}. ${row.displayName || '—'} · ${row.patientId} · plan=${row.treatmentPlanStatus || '—'} · next=${row.nextStep || '—'}`
    );
  });

  if (offers.length > 5) {
    console.log(`… +${offers.length - 5} till`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
