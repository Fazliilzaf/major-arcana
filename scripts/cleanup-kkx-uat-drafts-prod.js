#!/usr/bin/env node
'use strict';

/**
 * Städar öppna journal-utkast (dubbletter) för UAT-testpatient i prod.
 * Behåller senaste utkast per journalType+formVariant; raderar äldre.
 *
 * Usage: npm run cleanup:kkx-uat-drafts-prod
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');

const PATIENT_ID = process.env.KKX_UAT_PATIENT_ID || 'cco-kkx-uat-del3-a';

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function api(token, route, options = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function draftKey(entry) {
  return `${entry.journalType || ''}::${entry.formVariant || ''}`;
}

async function main() {
  const token = getToken();
  const list = await api(
    token,
    `/api/v1/cco-journal/entries?patientId=${encodeURIComponent(PATIENT_ID)}&limit=120`
  );
  if (list.status !== 200) {
    throw new Error(`Kunde inte lista journal (${list.status})`);
  }

  const entries = Array.isArray(list.body?.entries) ? list.body.entries : [];
  const drafts = entries.filter((entry) => !entry.locked && entry.status === 'draft');
  const keep = new Map();

  for (const entry of drafts) {
    const key = draftKey(entry);
    const prev = keep.get(key);
    const prevTs = Date.parse(prev?.updatedAt || prev?.createdAt || 0) || 0;
    const curTs = Date.parse(entry.updatedAt || entry.createdAt || 0) || 0;
    if (!prev || curTs >= prevTs) keep.set(key, entry);
  }

  let removed = 0;
  for (const entry of drafts) {
    const key = draftKey(entry);
    if (keep.get(key)?.entryId === entry.entryId) continue;
    const del = await api(
      token,
      `/api/v1/cco-journal/entry?patientId=${encodeURIComponent(PATIENT_ID)}&entryId=${encodeURIComponent(entry.entryId)}`,
      { method: 'DELETE' }
    );
    if (del.status === 200) {
      removed += 1;
      console.log(`OK: raderade utkast ${entry.entryId} (${entry.journalType})`);
    } else {
      console.warn(
        `WARN: kunde inte radera ${entry.entryId} (${del.status}: ${del.body?.error || 'fel'})`
      );
    }
  }

  console.log(`\nPatient: ${PATIENT_ID}`);
  console.log(`Drafts före: ${drafts.length}, behållna: ${keep.size}, raderade: ${removed}`);
}

main().catch((err) => {
  console.error('cleanup-kkx-uat-drafts-prod:', err.message || err);
  process.exit(1);
});
