/**
 * Hämta ett giltigt patientId för prod-smoke (default-ID kan vara borttaget efter migration).
 */
async function resolveSmokePatientId({ base, token, preferredId = '' }) {
  const root = String(base || '').replace(/\/+$/, '');
  const auth = String(token || '').trim();
  if (!auth) throw new Error('Saknar token för resolveSmokePatientId');

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${auth}`,
    'x-arcana-client': 'major_arcana_admin',
  };

  if (preferredId) {
    const probe = await fetch(
      `${root}/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(preferredId)}`,
      { headers }
    );
    if (probe.ok) return preferredId;
  }

  const search = await fetch(`${root}/api/v1/cco-patient-master/patients?q=Andersson&limit=5`, { headers });
  if (search.ok) {
    const body = await search.json();
    const hit = body?.patients?.[0]?.patientId;
    if (hit) return hit;
  }

  const list = await fetch(`${root}/api/v1/cco-patient-master/patients?limit=5&offset=0`, { headers });
  if (!list.ok) {
    throw new Error(`Kunde inte hämta kundlista (HTTP ${list.status})`);
  }
  const body = await list.json();
  const id = body?.patients?.[0]?.patientId;
  if (!id) throw new Error('Kundlista tom — inget smoke patientId');
  return id;
}

module.exports = { resolveSmokePatientId };
