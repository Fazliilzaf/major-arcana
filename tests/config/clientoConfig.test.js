const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getClientoConfigForBrand,
  getClientoApiConfigForBrand,
  inferClientoPartnerIdFromBookingUrl,
} = require('../../src/brand/runtimeConfig');

function withEnv(envPatch, run) {
  const previous = { ...process.env };
  for (const key of Object.keys(envPatch)) {
    const value = envPatch[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    process.env = previous;
  }
}

test('runtimeConfig kan tolka Hair TP Clinics partner-id från Cliento booking-url', () => {
  assert.equal(
    inferClientoPartnerIdFromBookingUrl('https://cliento.com/business/hair-tp-clinic-1650/'),
    '1650'
  );
  assert.equal(inferClientoPartnerIdFromBookingUrl('https://cliento.com/business/example'), '');
});

test('runtimeConfig returnerar brand-specifik widget v3-konfiguration inklusive serviceFilter', () => {
  withEnv(
    {
      CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC: '4yPQXQy6WMgoZnCAOylVjx',
      CLIENTO_SERVICE_FILTERS_HAIR_TP_CLINIC: 'Hair TP Clinic',
      CLIENTO_WIDGET_SRC_HAIR_TP_CLINIC: 'https://cliento.com/widget-v3/cliento.js',
      CLIENTO_BOOKING_URL_HAIR_TP_CLINIC: 'https://cliento.com/business/hair-tp-clinic-1650/',
      CLIENTO_MERGE_LOCATIONS_HAIR_TP_CLINIC: 'false',
      CLIENTO_LOCALE_HAIR_TP_CLINIC: 'sv',
    },
    () => {
      const cliento = getClientoConfigForBrand('hair-tp-clinic', {});

      assert.deepEqual(cliento.accountIds, ['4yPQXQy6WMgoZnCAOylVjx']);
      assert.deepEqual(cliento.serviceFilters, ['Hair TP Clinic']);
      assert.equal(cliento.widgetSrc, 'https://cliento.com/widget-v3/cliento.js');
      assert.equal(cliento.bookingUrl, 'https://cliento.com/business/hair-tp-clinic-1650/');
      assert.equal(cliento.locale, 'sv');
      assert.equal(cliento.mergeLocations, false);
    }
  );
});

test('runtimeConfig bygger REST-konfig och använder widgetens account id som partner-id-fallback', () => {
  withEnv(
    {
      CLIENTO_PARTNER_ID_HAIR_TP_CLINIC: undefined,
      CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC: '4yPQXQy6WMgoZnCAOylVjx',
      CLIENTO_BOOKING_URL_HAIR_TP_CLINIC: 'https://cliento.com/business/hair-tp-clinic-1650/',
      CLIENTO_API_BASE_URL_HAIR_TP_CLINIC: 'https://cliento.com/api/v2/partner/cliento',
      CLIENTO_API_KEY_HAIR_TP_CLINIC: 'secret-token',
      CLIENTO_API_AUTH_HEADER_HAIR_TP_CLINIC: 'Authorization',
      CLIENTO_API_AUTH_SCHEME_HAIR_TP_CLINIC: 'Bearer',
      CLIENTO_API_TIMEOUT_MS_HAIR_TP_CLINIC: '12000',
    },
    () => {
      const clientoApi = getClientoApiConfigForBrand('hair-tp-clinic', {});

      assert.equal(clientoApi.partnerId, '4yPQXQy6WMgoZnCAOylVjx');
      assert.equal(clientoApi.apiBaseUrl, 'https://cliento.com/api/v2/partner/cliento');
      assert.equal(clientoApi.apiKey, 'secret-token');
      assert.equal(clientoApi.authHeader, 'Authorization');
      assert.equal(clientoApi.authScheme, 'Bearer');
      assert.equal(clientoApi.timeoutMs, 12000);
    }
  );
});
