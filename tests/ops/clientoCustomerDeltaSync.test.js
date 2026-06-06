const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeClientoCustomersPayload,
  createClientoApi,
} = require('../../src/infra/clientoApi');
const {
  buildClientoPatientLookup,
  findClientoDeltaCandidates,
  runClientoCustomerDeltaSync,
} = require('../../src/ops/clientoCustomerDeltaSync');

test('normalizeClientoCustomersPayload plockar kunder från nested payload', () => {
  const rows = normalizeClientoCustomersPayload(
    {
      customers: [
        {
          id: 'cust-1',
          name: 'Anna Test',
          email: 'anna@example.com',
          phone: '0701234567',
          personnummer: '199001011234',
        },
      ],
    },
    'acc-1'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clientoId, 'cust-1');
  assert.equal(rows[0].accountId, 'acc-1');
  assert.equal(rows[0].primaryEmail, 'anna@example.com');
});

test('findClientoDeltaCandidates prioriterar cliento_id och personnummer', () => {
  const lookup = buildClientoPatientLookup([
    {
      id: 'p1',
      displayName: 'Anna Test',
      personnummer: '199001011234',
      primaryEmail: 'anna@example.com',
      cliento: { clientoId: 'cust-1' },
    },
    {
      id: 'p2',
      displayName: 'Anna Andersson',
      primaryEmail: 'anna@example.com',
    },
  ]);
  const byId = findClientoDeltaCandidates(lookup, {
    clientoId: 'cust-1',
    name: 'Anna Test',
    emails: ['anna@example.com'],
    phones: [],
    personnummer: '199001011234',
  });
  assert.equal(byId[0].patient.id, 'p1');
  assert.equal(byId[0].method, 'cliento_id');
});

test('runClientoCustomerDeltaSync sätter review vid flera kandidater', async () => {
  const patients = [
    {
      id: 'p1',
      displayName: 'Anna A',
      primaryEmail: 'anna@example.com',
      emails: ['anna@example.com'],
      phones: [],
      matchStatus: 'cliento_only',
    },
    {
      id: 'p2',
      displayName: 'Anna B',
      primaryPhone: '0701234567',
      phones: ['0701234567'],
      emails: [],
      matchStatus: 'drive_only',
    },
  ];
  const patientMasterStore = {
    async listPatients() {
      return { patients, total: patients.length };
    },
    async upsertPatient() {
      throw new Error('should not upsert ambiguous match');
    },
  };

  const report = await runClientoCustomerDeltaSync({
    patientMasterStore,
    tenantId: 'hair-tp-clinic',
    config: {
      clientoApiKey: 'secret',
      clientoAccountIds: ['acc-1'],
    },
    dryRun: true,
    fetchImpl: async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          customers: [
            {
              id: 'cust-new',
              name: 'Anna Example',
              email: 'anna@example.com',
              phone: '0701234567',
            },
          ],
        }),
    }),
  });

  assert.equal(report.reviewQueued, 1);
  assert.equal(report.created, 0);
  assert.equal(report.updated, 0);
});

test('clientoApi getCustomers anropar /customers/ med paging', async () => {
  let capturedUrl = null;
  const api = createClientoApi(
    {
      partnerId: 'acc-1',
      apiKey: 'secret-token',
    },
    {
      fetchImpl: async (url) => {
        capturedUrl = String(url);
        return {
          ok: true,
          text: async () => JSON.stringify({ customers: [{ id: 'c1', name: 'X' }] }),
        };
      },
    }
  );
  const payload = await api.getCustomers({ offset: 0, limit: 50 });
  assert.ok(Array.isArray(payload.customers));
  assert.match(capturedUrl, /\/customers\/\?offset=0&limit=50/);
});
