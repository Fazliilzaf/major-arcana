const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeClientoCustomersPayload,
  createClientoApi,
} = require('../../src/infra/clientoApi');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildClientoPatientLookup,
  findClientoDeltaCandidates,
  runClientoCustomerDeltaSync,
  runClientoCustomerCsvDeltaSync,
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

test('runClientoCustomerCsvDeltaSync berikar sourceId från bokningsexport', async () => {
  const customerCsv = [
    '"Namn","E-post","Telefon","Skapad"',
    '"Anna Test","anna@example.com","0701234567","2024-01-01 10:00"',
  ].join('\n');
  const bookingCsv = [
    '"Boknings-id","Bokningsreferens","Skapad tid","Starttid","Sluttid","Bokningens längd","Pris","Resurs-id","Resursnamn","Beskrivning","Paus efter","Bokningsanteckning","Bokningens pris","Pris från","Kund-id","Kundnamn","Bokad som","Kund (mobilnummer)","Kund (annat telefonnummer)","Kund e-post","Personnummer","Kund borttagen","Meddelande från kund","Kund skapad","Status","Källa","Källa (Avbokning)","Avbokad tid","Typ","Reservationstyp","Tidszon","Tjänste-id","Tjänstens namn","Tjänster (pris)","Tjänsten är pris från","Tjänst (Längd på tjänst)","Betalningsleverantör","Betalningsstatus","Betalt belopp","Betalningsreferens","Betald tid","Återbetalad tid","Anpassade fält","Attribut","Konto","Partner-id"',
    '1,ref,2024-01-01 10:00,2024-01-02 10:00,2024-01-02 11:00,60,,1,X,,0,,,false,4041234,Anna Test,,+46701234567,,anna@example.com,,false,,2024-01-01 10:00,Booked,,,,SimpleBooking,,Europe/Stockholm,,,,,,,,,,,,,,{},Hair TP Clinic,',
  ].join('\n');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cliento-csv-test-'));
  const customerPath = path.join(dir, 'customers.csv');
  const bookingPath = path.join(dir, 'bookings.csv');
  fs.writeFileSync(customerPath, customerCsv);
  fs.writeFileSync(bookingPath, bookingCsv);

  try {
    let upserted = null;
    const patientMasterStore = {
      async listPatients() {
        return { patients: [], total: 0 };
      },
      async upsertPatient(payload) {
        upserted = payload;
        return { id: 'p-new', ...payload };
      },
    };

    const report = await runClientoCustomerCsvDeltaSync({
      patientMasterStore,
      tenantId: 'hair-tp-clinic',
      csvPath: customerPath,
      bookingExportCsvPath: bookingPath,
      dryRun: false,
    });

    assert.equal(report.created, 1);
    assert.equal(report.stats.enrichedSourceId, 1);
    assert.equal(upserted.cliento.sourceId, '4041234');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
