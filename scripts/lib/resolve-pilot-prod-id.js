'use strict';

/**
 * Resolve pilot patientId on prod (by stored id, else primaryEmail lookup).
 * Returns { patientId, displayName } or null.
 */
async function resolvePilotProdId({ base, token, pilotRow }) {
  const headers = {
    Accept: 'application/json',
    'x-arcana-client': 'major_arcana_admin',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function get(path) {
    const res = await fetch(new URL(path, base), { headers });
    if (!res.ok) return null;
    return res.json();
  }

  const byId = await get(
    `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(pilotRow.patientId)}`
  );
  if (byId?.patient?.patientId) {
    return {
      patientId: byId.patient.patientId,
      displayName: byId.patient.displayName || pilotRow.displayName,
    };
  }

  if (!pilotRow.primaryEmail) return null;
  const list = await get(
    `/api/v1/cco-patient-master/patients?query=${encodeURIComponent(pilotRow.primaryEmail)}&limit=5`
  );
  const match = (list?.patients || []).find(
    (row) =>
      row.primaryEmail === pilotRow.primaryEmail ||
      row.personnummer === pilotRow.personnummer ||
      row.displayName === pilotRow.displayName
  );
  if (!match?.patientId) return null;
  return { patientId: match.patientId, displayName: match.displayName || pilotRow.displayName };
}

module.exports = { resolvePilotProdId };
