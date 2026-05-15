const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDefaultPublicSiteProfile,
  clonePublicSiteProfile,
  normalizePublicSiteProfile,
} = require('../../src/tenant/publicSiteProfile');

test('buildDefaultPublicSiteProfile returns Hair TP preset for tenant slug', () => {
  const p = buildDefaultPublicSiteProfile({ tenantId: 'hair-tp-clinic' });
  assert.equal(p.clinicName, 'Hair TP Clinic');
  assert.ok(p.services.length > 0);
  assert.equal(p.primaryCtaUrl.startsWith('https://'), true);
});

test('buildDefaultPublicSiteProfile returns Curatiio preset', () => {
  const p = buildDefaultPublicSiteProfile({ tenantId: 'curatiio' });
  assert.equal(p.clinicName, 'Curatiio');
  assert.deepEqual(p.services, []);
});

test('buildDefaultPublicSiteProfile titles unknown tenant from slug', () => {
  const p = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  assert.equal(p.clinicName, 'Acme Clinic');
});

test('normalizePublicSiteProfile strict rejects non-object payload', () => {
  assert.throws(
    () => normalizePublicSiteProfile('nope', { fallback: {}, strict: true }),
    /publicSite must be an object/
  );
});

test('normalizePublicSiteProfile merges fallback and dedupes services by id', () => {
  const fallback = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  const merged = normalizePublicSiteProfile(
    {
      clinicName: 'Acme HQ',
      services: [
        { title: 'Cut', id: 'cut', durationMinutes: 45, fromPriceSek: 100 },
        { title: 'Cut duplicate', id: 'cut', durationMinutes: 90, fromPriceSek: 200 },
      ],
    },
    { fallback }
  );
  assert.equal(merged.clinicName, 'Acme HQ');
  assert.equal(merged.services.length, 1);
  assert.equal(merged.services[0].id, 'cut');
});

test('clonePublicSiteProfile returns defaults for non-object input', () => {
  const p = clonePublicSiteProfile(null);
  assert.equal(typeof p.clinicName, 'string');
  assert.ok(Array.isArray(p.services));
});

test('normalizePublicSiteProfile clamps trust rating to band 0–5', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  const high = normalizePublicSiteProfile({ trustRating: 99 }, { fallback: base });
  assert.equal(high.trustRating, 5);
  const low = normalizePublicSiteProfile({ trustRating: -1 }, { fallback: base });
  assert.equal(low.trustRating, 0);
});

test('normalizePublicSiteProfile strict rejects invalid URL field format', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  assert.throws(
    () =>
      normalizePublicSiteProfile(
        { primaryCtaUrl: 'www.example.com/book' },
        { fallback: base, strict: true }
      ),
    /publicSite\.primaryCtaUrl must start with http\(s\):\/\/ or \//
  );
});

test('normalizePublicSiteProfile strict rejects invalid hex color', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  assert.throws(
    () =>
      normalizePublicSiteProfile(
        { themeAccent: 'blue' },
        { fallback: base, strict: true }
      ),
    /publicSite\.themeAccent must be a valid hex color/
  );
});

test('normalizePublicSiteProfile caps services to MAX_SERVICES=24', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  const services = Array.from({ length: 30 }, (_, i) => ({
    title: `Service ${i + 1}`,
    id: `service-${i + 1}`,
  }));
  const out = normalizePublicSiteProfile({ services }, { fallback: base });
  assert.equal(out.services.length, 24);
});

test('buildDefaultPublicSiteProfile tom tenantId normaliseras till clinic-slug', () => {
  const p = buildDefaultPublicSiteProfile({ tenantId: '' });
  assert.equal(p.clinicName, 'Clinic');
});

test('buildDefaultPublicSiteProfile defaultBrand hair-tp ger Hair TP preset oavsett tenantId', () => {
  const p = buildDefaultPublicSiteProfile({
    tenantId: 'unknown-tenant',
    defaultBrand: 'hair-tp-clinic',
  });
  assert.equal(p.clinicName, 'Hair TP Clinic');
  assert.ok(p.services.length > 0);
});

test('normalizePublicSiteProfile non-strict ersatter ogiltig primaryCtaUrl med fallback', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  const out = normalizePublicSiteProfile(
    { primaryCtaUrl: 'ftp://example.com/no' },
    { fallback: base }
  );
  assert.equal(out.primaryCtaUrl, base.primaryCtaUrl);
});

test('normalizePublicSiteProfile med undefined payload returnerar klon av fallback', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'curatiio' });
  const out = normalizePublicSiteProfile(undefined, { fallback: base });
  assert.equal(out.clinicName, base.clinicName);
  assert.deepEqual(out.services, base.services);
});

test('buildDefaultPublicSiteProfile hair-to-clinic slug anvander Hair TP preset', () => {
  const p = buildDefaultPublicSiteProfile({ tenantId: 'hair-to-clinic' });
  assert.equal(p.clinicName, 'Hair TP Clinic');
  assert.equal(p.services.length, 3);
});

test('normalizePublicSiteProfile strict tillater relativ primaryCtaUrl med inledande slash', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  const out = normalizePublicSiteProfile({ primaryCtaUrl: '/boka-nu' }, { fallback: base, strict: true });
  assert.equal(out.primaryCtaUrl, '/boka-nu');
});

test('normalizePublicSiteProfile strict kastar nar services inte ar en array', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  assert.throws(
    () => normalizePublicSiteProfile({ services: 'not-array' }, { fallback: base, strict: true }),
    /publicSite\.services must be an array/,
  );
});

test('normalizePublicSiteProfile strict kastar nar services innehaller icke-objekt', () => {
  const base = buildDefaultPublicSiteProfile({ tenantId: 'acme-clinic' });
  assert.throws(
    () =>
      normalizePublicSiteProfile({ services: [{ title: 'Ok' }, 'bad'] }, { fallback: base, strict: true }),
    /publicSite\.services contains an invalid item/,
  );
});
