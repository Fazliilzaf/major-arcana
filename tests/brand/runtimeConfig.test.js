const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  brandEnvKey,
  getKnowledgeDirForBrand,
  getClientoConfigForBrand,
  getClientoApiConfigForBrand,
  inferClientoPartnerIdFromBookingUrl,
} = require('../../src/brand/runtimeConfig');

test('brandEnvKey uppercases and collapses non-alphanumeric runs', () => {
  assert.equal(brandEnvKey(''), '');
  assert.equal(brandEnvKey('  hair-tp-clinic  '), 'HAIR_TP_CLINIC');
  assert.equal(brandEnvKey('My Brand!'), 'MY_BRAND');
});

test('inferClientoPartnerIdFromBookingUrl reads trailing numeric segment', () => {
  assert.equal(inferClientoPartnerIdFromBookingUrl(''), '');
  assert.equal(inferClientoPartnerIdFromBookingUrl('https://host/path-42'), '42');
  assert.equal(inferClientoPartnerIdFromBookingUrl('https://host/path-42/'), '42');
});

test('inferClientoPartnerIdFromBookingUrl returns empty without trailing segment', () => {
  assert.equal(inferClientoPartnerIdFromBookingUrl('https://booking.example.com/page'), '');
  assert.equal(inferClientoPartnerIdFromBookingUrl('https://host/foo-99/extra'), '');
});

test('getClientoConfigForBrand applies defaults when env and baseConfig omit Cliento', () => {
  const cfg = getClientoConfigForBrand('any-brand', {});
  assert.equal(cfg.accountIds.length, 0);
  assert.equal(cfg.bookingUrl, null);
  assert.equal(cfg.widgetSrc, 'https://cliento.com/widget-v2/cliento.js');
  assert.deepEqual(cfg.serviceFilters, []);
  assert.equal(cfg.locale, 'sv');
  assert.equal(cfg.mergeLocations, false);
});

test('getKnowledgeDirForBrand uses KNOWLEDGE_DIR_<BRANDKEY> when set', (t) => {
  const brand = 'unit-test-brand';
  const suffix = brandEnvKey(brand);
  assert.ok(suffix);
  const envName = `KNOWLEDGE_DIR_${suffix}`;
  const prev = process.env[envName];
  const tmp = path.join(path.sep, 'tmp', 'arcana-knowledge-test');
  process.env[envName] = tmp;
  t.after(() => {
    if (prev === undefined) delete process.env[envName];
    else process.env[envName] = prev;
  });
  assert.equal(getKnowledgeDirForBrand(brand), path.resolve(tmp));
});

test('getClientoApiConfigForBrand infers partner id from booking URL and API defaults', (t) => {
  const keys = [
    'CLIENTO_ACCOUNT_IDS',
    'CLIENTO_BOOKING_URL',
    'CLIENTO_PARTNER_ID',
    'CLIENTO_API_BASE_URL',
    'CLIENTO_API_KEY',
    'CLIENTO_API_AUTH_HEADER',
    'CLIENTO_API_AUTH_SCHEME',
    'CLIENTO_API_TIMEOUT_MS',
  ];
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  t.after(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
  process.env.CLIENTO_BOOKING_URL = 'https://booking.example.com/slot-777';
  const cfg = getClientoApiConfigForBrand('b', {});
  assert.equal(cfg.partnerId, '777');
  assert.equal(cfg.apiBaseUrl, 'https://cliento.com/api/v2/partner/cliento');
  assert.equal(cfg.apiKey, '');
  assert.equal(cfg.authHeader, 'Authorization');
  assert.equal(cfg.authScheme, 'Bearer');
  assert.equal(cfg.timeoutMs, 10000);
});

test('getKnowledgeDirForBrand faller tillbaka pa cwd/knowledge/<brand> utan env', (t) => {
  const brand = 'zz-default-knowledge-brand';
  const suffix = brandEnvKey(brand);
  assert.ok(suffix);
  const envBrandSpecific = `KNOWLEDGE_DIR_${suffix}`;
  const prev = {
    [envBrandSpecific]: process.env[envBrandSpecific],
    ARCANA_BRAND: process.env.ARCANA_BRAND,
    KNOWLEDGE_DIR: process.env.KNOWLEDGE_DIR,
  };
  delete process.env[envBrandSpecific];
  delete process.env.ARCANA_BRAND;
  delete process.env.KNOWLEDGE_DIR;
  t.after(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  assert.equal(getKnowledgeDirForBrand(brand), path.join(process.cwd(), 'knowledge', brand));
});

test('brandEnvKey trims leading/trailing separators after normalization', () => {
  assert.equal(brandEnvKey('__my.brand__'), 'MY_BRAND');
  assert.equal(brandEnvKey('---x---'), 'X');
});

test('getClientoConfigForBrand reads and parses env overrides', (t) => {
  const keys = [
    'CLIENTO_ACCOUNT_IDS',
    'CLIENTO_BOOKING_URL',
    'CLIENTO_WIDGET_SRC',
    'CLIENTO_SERVICE_FILTERS',
    'CLIENTO_LOCALE',
    'CLIENTO_MERGE_LOCATIONS',
  ];
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  t.after(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  process.env.CLIENTO_ACCOUNT_IDS = 'acc-1, acc-2';
  process.env.CLIENTO_BOOKING_URL = 'https://booking.example.com/x-123';
  process.env.CLIENTO_WIDGET_SRC = 'https://cdn.example.com/widget.js';
  process.env.CLIENTO_SERVICE_FILTERS = 'hair, beard';
  process.env.CLIENTO_LOCALE = 'en';
  process.env.CLIENTO_MERGE_LOCATIONS = 'true';

  const cfg = getClientoConfigForBrand('brand-a', {});
  assert.deepEqual(cfg.accountIds, ['acc-1', 'acc-2']);
  assert.equal(cfg.bookingUrl, 'https://booking.example.com/x-123');
  assert.equal(cfg.widgetSrc, 'https://cdn.example.com/widget.js');
  assert.deepEqual(cfg.serviceFilters, ['hair', 'beard']);
  assert.equal(cfg.locale, 'en');
  assert.equal(cfg.mergeLocations, true);
});

test('getClientoApiConfigForBrand anvander enskilt account id som partnerId nar partner saknas', (t) => {
  const keys = ['CLIENTO_ACCOUNT_IDS', 'CLIENTO_BOOKING_URL', 'CLIENTO_PARTNER_ID'];
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  t.after(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
  process.env.CLIENTO_ACCOUNT_IDS = 'single-acc';
  const cfg = getClientoApiConfigForBrand('b', {});
  assert.equal(cfg.partnerId, 'single-acc');
});

test('getClientoApiConfigForBrand prioriterar explicit partnerId fore bookingUrl-inferens', (t) => {
  const keys = ['CLIENTO_ACCOUNT_IDS', 'CLIENTO_BOOKING_URL', 'CLIENTO_PARTNER_ID'];
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  t.after(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
  process.env.CLIENTO_BOOKING_URL = 'https://booking.example.com/slot-999';
  process.env.CLIENTO_PARTNER_ID = 'fixed-pid';
  const cfg = getClientoApiConfigForBrand('b', {});
  assert.equal(cfg.partnerId, 'fixed-pid');
});

test('getClientoApiConfigForBrand baseConfig fyller api-falt och timeoutMs faller tillbaka vid ogiltig int', (t) => {
  const keys = [
    'CLIENTO_ACCOUNT_IDS',
    'CLIENTO_BOOKING_URL',
    'CLIENTO_PARTNER_ID',
    'CLIENTO_API_BASE_URL',
    'CLIENTO_API_KEY',
    'CLIENTO_API_AUTH_HEADER',
    'CLIENTO_API_AUTH_SCHEME',
    'CLIENTO_API_TIMEOUT_MS',
  ];
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  t.after(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
  const cfg = getClientoApiConfigForBrand('b', {
    clientoPartnerId: 'from-base',
    clientoApiBaseUrl: 'https://api.example/partner',
    clientoApiKey: 'k',
    clientoApiAuthHeader: 'X-Auth',
    clientoApiAuthScheme: 'Token',
    clientoApiTimeoutMs: 'not-a-number',
  });
  assert.equal(cfg.partnerId, 'from-base');
  assert.equal(cfg.apiBaseUrl, 'https://api.example/partner');
  assert.equal(cfg.apiKey, 'k');
  assert.equal(cfg.authHeader, 'X-Auth');
  assert.equal(cfg.authScheme, 'Token');
  assert.equal(cfg.timeoutMs, 10000);
});

test('getClientoApiConfigForBrand läser timeoutMs från env när satt', (t) => {
  const keys = [
    'CLIENTO_ACCOUNT_IDS',
    'CLIENTO_BOOKING_URL',
    'CLIENTO_PARTNER_ID',
    'CLIENTO_API_BASE_URL',
    'CLIENTO_API_KEY',
    'CLIENTO_API_AUTH_HEADER',
    'CLIENTO_API_AUTH_SCHEME',
    'CLIENTO_API_TIMEOUT_MS',
  ];
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  t.after(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
  process.env.CLIENTO_PARTNER_ID = 'pid-env';
  process.env.CLIENTO_API_KEY = 'secret';
  process.env.CLIENTO_API_TIMEOUT_MS = '7500';
  const cfg = getClientoApiConfigForBrand('unit-timeout', {});
  assert.equal(cfg.timeoutMs, 7500);
  assert.equal(cfg.partnerId, 'pid-env');
});

test('getKnowledgeDirForBrand anvander global KNOWLEDGE_DIR nar ARCANA_BRAND matchar', (t) => {
  const brand = 'global-fallback-brand';
  const suffix = brandEnvKey(brand);
  const envBrandSpecific = `KNOWLEDGE_DIR_${suffix}`;
  const prev = {
    [envBrandSpecific]: process.env[envBrandSpecific],
    ARCANA_BRAND: process.env.ARCANA_BRAND,
    KNOWLEDGE_DIR: process.env.KNOWLEDGE_DIR,
  };
  delete process.env[envBrandSpecific];
  process.env.ARCANA_BRAND = brand;
  process.env.KNOWLEDGE_DIR = path.join(path.sep, 'var', 'arcana-knowledge-global');
  t.after(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  assert.equal(getKnowledgeDirForBrand(brand), path.resolve(process.env.KNOWLEDGE_DIR));
});

test('getClientoConfigForBrand mergeLocations tolkar false-strangar och baseConfig serviceFilters', (t) => {
  const key = 'CLIENTO_MERGE_LOCATIONS';
  const prev = process.env[key];
  process.env[key] = 'off';
  t.after(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });
  const cfg = getClientoConfigForBrand('x', {
    clientoServiceFilters: ['  a  ', 42, 'b'],
  });
  assert.equal(cfg.mergeLocations, false);
  assert.deepEqual(cfg.serviceFilters, ['a', 'b']);
});

test('inferClientoPartnerIdFromBookingUrl returnerar tom for icke-strang', () => {
  assert.equal(inferClientoPartnerIdFromBookingUrl(null), '');
  assert.equal(inferClientoPartnerIdFromBookingUrl(undefined), '');
});

test('brandEnvKey nullish ger tom sträng', () => {
  assert.equal(brandEnvKey(null), '');
  assert.equal(brandEnvKey(undefined), '');
});

test('brandEnvKey kodar siffror och blandade separatorer', () => {
  assert.equal(brandEnvKey('123'), '123');
  assert.equal(brandEnvKey('  brand 42 '), 'BRAND_42');
});

test('brandEnvKey stringifierar numeriska värden', () => {
  assert.equal(brandEnvKey(42), '42');
});

test('inferClientoPartnerIdFromBookingUrl blank eller whitespace', () => {
  assert.equal(inferClientoPartnerIdFromBookingUrl('   '), '');
  assert.equal(inferClientoPartnerIdFromBookingUrl('\t\n'), '');
});
