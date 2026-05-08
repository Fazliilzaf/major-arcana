const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildClientoPartnerBaseUrl,
  buildClientoHeaders,
  normalizeClientoRefDataPayload,
  normalizeClientoSlotsPayload,
  normalizeCsvParam,
  createClientoApi,
} = require('../../src/infra/clientoApi');

test('clientoApi bygger partner-base-url korrekt', () => {
  assert.equal(
    buildClientoPartnerBaseUrl({
      apiBaseUrl: 'https://cliento.com/api/v2/partner/cliento',
      partnerId: '1650',
    }),
    'https://cliento.com/api/v2/partner/cliento/1650/'
  );
});

test('clientoApi bygger auth-header endast när apiKey finns', () => {
  assert.deepEqual(buildClientoHeaders({}), {
    Accept: 'application/json',
  });

  assert.deepEqual(
    buildClientoHeaders({
      apiKey: 'secret-token',
      authHeader: 'Authorization',
      authScheme: 'Bearer',
    }),
    {
      Accept: 'application/json',
      Authorization: 'Bearer secret-token',
    }
  );
});

test('clientoApi normaliserar csv-parametrar från strängar och arrayer', () => {
  assert.equal(normalizeCsvParam('1, 2,3'), '1,2,3');
  assert.equal(normalizeCsvParam(['1', '2, 3', '', null]), '1,2,3');
});

test('clientoApi normaliserar slots från platta och resursnästlade payloads', () => {
  assert.deepEqual(
    normalizeClientoSlotsPayload({
      resources: [
        {
          id: 'res-1',
          name: 'Dr. Eriksson',
          slots: [
            {
              id: 'slot-1',
              start: '2026-05-08T09:30:00.000Z',
              end: '2026-05-08T10:30:00.000Z',
            },
          ],
        },
      ],
    }),
    [
      {
        slotId: 'slot-1',
        startsAt: '2026-05-08T09:30:00.000Z',
        endsAt: '2026-05-08T10:30:00.000Z',
        resourceId: 'res-1',
        resourceLabel: 'Dr. Eriksson',
        serviceId: '',
        serviceLabel: '',
        locationLabel: '',
        source: 'cliento',
      },
    ]
  );
});

test('clientoApi normaliserar ref-data för resurser och tjänster', () => {
  assert.deepEqual(
    normalizeClientoRefDataPayload({
      resources: [{ id: 'res-1', name: 'Dr. Eriksson' }],
      services: [{ id: 'srv-1', title: 'Konsultation', duration: 45 }],
    }),
    {
      resources: [
        {
          id: 'res-1',
          label: 'Dr. Eriksson',
          type: 'resource',
          durationMinutes: null,
          raw: { id: 'res-1', name: 'Dr. Eriksson' },
        },
      ],
      services: [
        {
          id: 'srv-1',
          label: 'Konsultation',
          type: 'service',
          durationMinutes: 45,
          raw: { id: 'srv-1', title: 'Konsultation', duration: 45 },
        },
      ],
    }
  );
});

test('clientoApi skickar slots-request med query-parametrar och auth-header', async () => {
  let capturedUrl = null;
  let capturedHeaders = null;

  const api = createClientoApi(
    {
      partnerId: '1650',
      apiKey: 'secret-token',
      authHeader: 'Authorization',
      authScheme: 'Bearer',
      timeoutMs: 1000,
    },
    {
      fetchImpl: async (url, options) => {
        capturedUrl = String(url);
        capturedHeaders = options.headers;
        return {
          ok: true,
          text: async () => JSON.stringify({ ok: true }),
        };
      },
    }
  );

  const payload = await api.getSlots({
    fromDate: '2026-05-01',
    toDate: '2026-05-07',
    resIds: ['4575'],
    srvIds: ['28232'],
  });

  assert.deepEqual(payload, { ok: true });
  assert.equal(
    capturedUrl,
    'https://cliento.com/api/v2/partner/cliento/1650/resources/slots?fromDate=2026-05-01&toDate=2026-05-07&resIds=4575&srvIds=28232'
  );
  assert.deepEqual(capturedHeaders, {
    Accept: 'application/json',
    Authorization: 'Bearer secret-token',
  });
});

test('clientoApi ytar upp vendor-fel med statuskod och payload', async () => {
  const api = createClientoApi(
    {
      partnerId: '1650',
      timeoutMs: 1000,
    },
    {
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Unauthorized' }),
      }),
    }
  );

  await assert.rejects(
    () => api.getSettings(),
    (error) =>
      error &&
      error.statusCode === 401 &&
      error.details &&
      error.details.message === 'Unauthorized'
  );
});
