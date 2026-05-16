const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeHost,
  resolveBrandFromMap,
  resolveBrandForHost,
} = require('../../src/brand/resolveBrand');

test('normalizeHost trims lowercases and strips trailing dot', () => {
  assert.equal(normalizeHost('  WWW.Example.COM. '), 'www.example.com');
  assert.equal(normalizeHost('Host.Name.'), 'host.name');
});

test('normalizeHost hanterar null/undefined som tom sträng', () => {
  assert.equal(normalizeHost(null), '');
  assert.equal(normalizeHost(undefined), '');
});

test('resolveBrandFromMap matches direct host and www variants', () => {
  const map = {
    'app.example.com': 'tenant-a',
    'other.se': 'tenant-b',
  };
  assert.equal(resolveBrandFromMap('app.example.com', map), 'tenant-a');
  assert.equal(resolveBrandFromMap('www.app.example.com', map), 'tenant-a');
  assert.equal(resolveBrandFromMap('OTHER.SE', map), 'tenant-b');
});

test('resolveBrandFromMap supports wildcard patterns', () => {
  const map = { '*.preview.example.com': 'preview-brand' };
  assert.equal(resolveBrandFromMap('foo.preview.example.com', map), 'preview-brand');
  assert.equal(resolveBrandFromMap('preview.example.com', map), 'preview-brand');
  assert.equal(resolveBrandFromMap('evil.example.com', map), null);
});

test('resolveBrandFromMap wildcard matchar flernivå subdomän', () => {
  const map = { '*.preview.example.com': 'deep-brand' };
  assert.equal(resolveBrandFromMap('a.b.preview.example.com', map), 'deep-brand');
});

test('resolveBrandFromMap returns null for tom host eller ogiltig map', () => {
  assert.equal(resolveBrandFromMap('  ', { 'x.com': 'a' }), null);
  assert.equal(resolveBrandFromMap('ok.example.com', null), null);
  assert.equal(resolveBrandFromMap('ok.example.com', 'not-object'), null);
});

test('resolveBrandFromMap ignorerar tom sträng som brand-värde', () => {
  const map = { 'a.example.com': '   ', '*.b.example.com': '  ' };
  assert.equal(resolveBrandFromMap('a.example.com', map), null);
  assert.equal(resolveBrandFromMap('z.b.example.com', map), null);
});

test('resolveBrandForHost uses default when host empty', () => {
  assert.equal(resolveBrandForHost('', { defaultBrand: 'x' }), 'x');
  assert.equal(resolveBrandForHost('   ', {}), 'hair-tp-clinic');
});

test('resolveBrandForHost nullish host ger defaultBrand eller inbyggd fallback', () => {
  assert.equal(resolveBrandForHost(null, { defaultBrand: 'acme' }), 'acme');
  assert.equal(resolveBrandForHost(undefined, {}), 'hair-tp-clinic');
});

test('resolveBrandForHost maps curatiio and hair-tp hosts without map', () => {
  assert.equal(resolveBrandForHost('app.curatiio.se', {}), 'curatiio');
  assert.equal(resolveBrandForHost('WWW.HairTpClinic.SE', {}), 'hair-tp-clinic');
  assert.equal(resolveBrandForHost('hair-tp.example.com', {}), 'hair-tp-clinic');
});

test('resolveBrandForHost prioriterar brandByHost framför inbyggda host-regler', () => {
  const custom = resolveBrandForHost('app.curatiio.se', {
    brandByHost: { 'app.curatiio.se': 'tenant-custom' },
  });
  assert.equal(custom, 'tenant-custom');
});

test('resolveBrandForHost använder defaultBrand för okänd host', () => {
  assert.equal(
    resolveBrandForHost('unknown-brand.example', { defaultBrand: 'acme-clinic' }),
    'acme-clinic'
  );
});

test('resolveBrandFromMap trims brand value from direct and wildcard entries', () => {
  const map = {
    'tenant.example.com': '  tenant-one  ',
    '*.preview.example.com': '  preview-tenant ',
  };
  assert.equal(resolveBrandFromMap('tenant.example.com', map), 'tenant-one');
  assert.equal(resolveBrandFromMap('foo.preview.example.com', map), 'preview-tenant');
});

test('resolveBrandFromMap ignores non-wildcard pattern lookalikes', () => {
  const map = {
    '*preview.example.com': 'bad-pattern',
    '.preview.example.com': 'also-bad',
  };
  assert.equal(resolveBrandFromMap('x.preview.example.com', map), null);
});

test('resolveBrandForHost falls back to hardcoded default when defaultBrand is empty', () => {
  assert.equal(resolveBrandForHost('unknown.example', { defaultBrand: '' }), 'hair-tp-clinic');
  assert.equal(resolveBrandForHost('unknown.example', { defaultBrand: null }), 'hair-tp-clinic');
});

test('normalizeHost stringifierar icke-sträng host', () => {
  assert.equal(normalizeHost(8080), '8080');
});

test('resolveBrandFromMap foredrar direkt nyckel fore wildcard', () => {
  const map = {
    'foo.preview.example.com': 'explicit-brand',
    '*.preview.example.com': 'wildcard-brand',
  };
  assert.equal(resolveBrandFromMap('foo.preview.example.com', map), 'explicit-brand');
  assert.equal(resolveBrandFromMap('bar.preview.example.com', map), 'wildcard-brand');
});

test('resolveBrandFromMap hoppar wildcard nar brand inte ar strang', () => {
  assert.equal(resolveBrandFromMap('a.x.com', { '*.x.com': { id: 1 } }), null);
});

test('resolveBrandFromMap hoppar wildcard med tomt root efter star punkt', () => {
  assert.equal(resolveBrandFromMap('any.example.com', { '*.': 'nope' }), null);
});
