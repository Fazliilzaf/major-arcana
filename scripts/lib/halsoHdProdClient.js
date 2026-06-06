'use strict';

/**
 * Prod patient-master HTTP-klient (PUT-modell som Cliento delta / stickprov).
 */
require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';

function getProdToken() {
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
  return execSync(`node "${path.join(ROOT, 'scripts/get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ARCANA_PROD_URL: BASE, BASE_URL: BASE },
  }).trim();
}

function normalizeProdPatientRow(row = {}) {
  return {
    ...row,
    id: row.id || row.patientId || '',
    personnummer: row.personnummer || '',
    primaryEmail: row.primaryEmail || '',
    primaryPhone: row.primaryPhone || '',
    emails: row.emails || [],
    phones: row.phones || [],
  };
}

async function fetchProdPatients(token, { maxPatients = 20000 } = {}) {
  const patients = [];
  let offset = 0;
  const pageSize = 500;
  while (patients.length < maxPatients) {
    const res = await fetch(
      `${BASE}/api/v1/cco-patient-master/patients?limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      }
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `${res.status} patient list`);
    const batch = Array.isArray(payload.patients) ? payload.patients : [];
    patients.push(...batch.map(normalizeProdPatientRow));
    const total = Number(payload.total || 0);
    offset += batch.length;
    if (!batch.length || (total && offset >= total)) break;
  }
  return patients;
}

async function fetchPatient(token, patientId) {
  const res = await fetch(
    `${BASE}/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-arcana-client': 'major_arcana_admin',
      },
    }
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `${res.status} get patient ${patientId}`);
  const patient = payload.patient || {};
  return { ...patient, id: patient.id || patient.patientId || patientId };
}

async function putPatient(token, body) {
  const res = await fetch(`${BASE}/api/v1/cco-patient-master/patient`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `${res.status} PUT patient ${body.id}`);
  return payload;
}

async function fetchAssetBuffer(token, assetId) {
  const res = await fetch(`${BASE}/api/v1/cco/assets/${encodeURIComponent(assetId)}/download`, {
    headers: {
      Accept: 'application/pdf,application/octet-stream,*/*',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `${res.status} asset download ${assetId}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  BASE,
  TENANT_ID,
  getProdToken,
  normalizeProdPatientRow,
  fetchProdPatients,
  fetchPatient,
  putPatient,
  fetchAssetBuffer,
};
