const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveCcoSignatureProfile,
  resolveCcoSignatureSelection,
  buildCcoSignatureHtml,
  applyCcoSignatureHtml,
} = require('../../src/capabilities/executionService');

test('resolveCcoSignatureProfile maps known keys to frozen profiles', () => {
  const fazli = resolveCcoSignatureProfile('fazli');
  assert.equal(fazli.key, 'fazli');
  const egzona = resolveCcoSignatureProfile('egzona@hairtpclinic.com');
  assert.equal(egzona.key, 'egzona');
  const fallback = resolveCcoSignatureProfile('');
  assert.ok(['fazli', 'egzona'].includes(fallback.key));
});

test('resolveCcoSignatureSelection honors explicit signatureProfile', () => {
  const picked = resolveCcoSignatureSelection(
    { signatureProfile: 'egzona' },
    { fallbackMailboxIds: [], actorEmail: '' },
  );
  assert.equal(picked.key, 'egzona');
});

test('buildCcoSignatureHtml returns non-empty approved HTML for Fazli profile', () => {
  const html = buildCcoSignatureHtml({ profile: resolveCcoSignatureProfile('fazli') });
  assert.ok(html.length > 20);
  assert.ok(/Fazli|fazli|hairtpclinic|031/i.test(html));
});

test('applyCcoSignatureHtml combines escaped plain body with HTML signature', () => {
  const combined = applyCcoSignatureHtml({
    body: 'Rad ett\nRad två',
    bodyHtml: '',
    profile: resolveCcoSignatureProfile('fazli'),
  });
  assert.ok(combined.includes('<br />'));
  assert.ok(combined.includes('Rad ett'));
  assert.ok(combined.includes('<br /><br />'));
});

test('applyCcoSignatureHtml preserves bodyHtml and appends signature block', () => {
  const combined = applyCcoSignatureHtml({
    bodyHtml: '<p>Innehåll</p>',
    profile: resolveCcoSignatureProfile('egzona'),
  });
  assert.ok(combined.startsWith('<p>Innehåll</p>'));
  assert.ok(combined.includes('<br /><br />'));
  assert.ok(combined.length > '<p>Innehåll</p>'.length + 20);
});

test('resolveCcoSignatureProfile matches fazli and egzona case-insensitively', () => {
  assert.equal(resolveCcoSignatureProfile('FAZLI').key, 'fazli');
  assert.equal(resolveCcoSignatureProfile('Egzona').key, 'egzona');
});

test('resolveCcoSignatureSelection reads signature_profile snake_case alias', () => {
  const picked = resolveCcoSignatureSelection(
    { signature_profile: 'fazli' },
    { fallbackMailboxIds: [], actorEmail: '' },
  );
  assert.equal(picked.key, 'fazli');
});

test('resolveCcoSignatureSelection reads profile camel alias', () => {
  const picked = resolveCcoSignatureSelection(
    { profile: 'egzona' },
    { fallbackMailboxIds: [], actorEmail: '' },
  );
  assert.equal(picked.key, 'egzona');
});

test('applyCcoSignatureHtml returns only signature when body and bodyHtml empty', () => {
  const sigOnly = applyCcoSignatureHtml({
    body: '',
    bodyHtml: '',
    profile: resolveCcoSignatureProfile('fazli'),
  });
  assert.ok(sigOnly.length > 20);
  assert.equal(sigOnly.includes('<br /><br />'), false);
});

test('applyCcoSignatureHtml prefers bodyHtml over plain body when both set', () => {
  const combined = applyCcoSignatureHtml({
    body: 'Plain som ignoreras',
    bodyHtml: '<p>Html version</p>',
    profile: resolveCcoSignatureProfile('fazli'),
  });
  assert.ok(combined.startsWith('<p>Html version</p>'));
  assert.equal(combined.includes('Plain som ignoreras'), false);
});
