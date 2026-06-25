const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFortnoxCustomerPayload,
  extractCustomerNumber,
  linkPatientFortnoxCustomer,
  syncPatientToFortnox,
} = require('../../src/cfo/cfoFortnoxPatientSync');

test('buildFortnoxCustomerPayload maps patient demographics', () => {
  const payload = buildFortnoxCustomerPayload({
    displayName: 'Anna Andersson',
    primaryEmail: 'anna@example.com',
    primaryPhone: '0701234567',
    personnummer: '19900101-1234',
  });

  assert.equal(payload.Customer.Name, 'Anna Andersson');
  assert.equal(payload.Customer.Email, 'anna@example.com');
  assert.equal(payload.Customer.Phone1, '0701234567');
  assert.equal(payload.Customer.OrganisationNumber, '199001011234');
  assert.equal(payload.Customer.Type, 'PRIVATE');
});

test('extractCustomerNumber reads nested Fortnox payload', () => {
  assert.equal(
    extractCustomerNumber({ Customer: { CustomerNumber: '10042' } }),
    '10042'
  );
});

test('syncPatientToFortnox creates customer and stores customer number', async () => {
  const patients = new Map();
  const patientMasterStore = {
    async upsertPatient({ tenantId, id, fortnox }) {
      const key = `${tenantId}:${id}`;
      const existing = patients.get(key) || { id, tenantId };
      const next = { ...existing, fortnox };
      patients.set(key, next);
      return next;
    },
  };
  const calls = [];
  const fortnoxClient = {
    async createCustomer(payload) {
      calls.push(['create', payload]);
      return { Customer: { CustomerNumber: '9001' } };
    },
    async updateCustomer() {
      throw new Error('updateCustomer should not be called');
    },
    async listCustomers() {
      return { Customers: [] };
    },
  };

  const result = await syncPatientToFortnox({
    patient: {
      id: 'patient-1',
      displayName: 'Erik Eriksson',
      primaryEmail: 'erik@example.com',
    },
    patientMasterStore,
    fortnoxClient,
    tenantId: 'tenant-a',
  });

  assert.equal(result.action, 'linked');
  assert.equal(result.customerNumber, '9001');
  assert.equal(result.patient.fortnox.customerNumber, '9001');
  assert.equal(calls.length, 1);
});

test('syncPatientToFortnox updates existing linked customer', async () => {
  const patients = new Map([
    [
      'tenant-a:patient-2',
      {
        id: 'patient-2',
        tenantId: 'tenant-a',
        fortnox: { customerNumber: '8008' },
      },
    ],
  ]);
  const patientMasterStore = {
    async upsertPatient({ tenantId, id, fortnox }) {
      const key = `${tenantId}:${id}`;
      const existing = patients.get(key) || { id, tenantId };
      const next = { ...existing, fortnox };
      patients.set(key, next);
      return next;
    },
  };
  const fortnoxClient = {
    async updateCustomer(customerNumber, payload) {
      assert.equal(customerNumber, '8008');
      assert.equal(payload.Customer.CustomerNumber, '8008');
      return { Customer: { CustomerNumber: '8008' } };
    },
    async createCustomer() {
      throw new Error('createCustomer should not be called');
    },
    async listCustomers() {
      throw new Error('listCustomers should not be called');
    },
  };

  const result = await syncPatientToFortnox({
    patient: patients.get('tenant-a:patient-2'),
    patientMasterStore,
    fortnoxClient,
    tenantId: 'tenant-a',
  });

  assert.equal(result.action, 'updated');
  assert.equal(result.customerNumber, '8008');
});

test('linkPatientFortnoxCustomer stores manual customer number', async () => {
  const patients = new Map([
    ['tenant-a:patient-3', { id: 'patient-3', tenantId: 'tenant-a' }],
  ]);
  const patientMasterStore = {
    async getPatient({ tenantId, patientId }) {
      return patients.get(`${tenantId}:${patientId}`) || null;
    },
    async upsertPatient({ tenantId, id, fortnox }) {
      const key = `${tenantId}:${id}`;
      const existing = patients.get(key) || { id, tenantId };
      const next = { ...existing, fortnox };
      patients.set(key, next);
      return next;
    },
  };

  const patient = await linkPatientFortnoxCustomer({
    patientMasterStore,
    tenantId: 'tenant-a',
    patientId: 'patient-3',
    customerNumber: '7007',
  });

  assert.equal(patient.fortnox.customerNumber, '7007');
  assert.equal(patient.fortnox.source, 'manual_link');
});
