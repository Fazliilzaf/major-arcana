const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveCcoNextPreviewPath } = require('../../src/brand/resolveCcoNextPreviewRedirect');

test('resolveCcoNextPreviewPath maps /cco-next root to preview', () => {
  assert.equal(resolveCcoNextPreviewPath('/cco-next'), '/major-arcana-preview/');
  assert.equal(resolveCcoNextPreviewPath('/cco-next/'), '/major-arcana-preview/');
});

test('resolveCcoNextPreviewPath preserves query string', () => {
  assert.equal(
    resolveCcoNextPreviewPath('/cco-next', '?conversationId=conv-1'),
    '/major-arcana-preview/?conversationId=conv-1'
  );
});

test('resolveCcoNextPreviewPath maps customers route to preview view=customers', () => {
  assert.equal(
    resolveCcoNextPreviewPath('/cco-next/customers'),
    '/major-arcana-preview/?view=customers'
  );
  const withPatient = resolveCcoNextPreviewPath('/cco-next/customers', '?patientId=abc');
  assert.match(withPatient, /^\/major-arcana-preview\/\?/);
  const params = new URLSearchParams(withPatient.slice(withPatient.indexOf('?')));
  assert.equal(params.get('view'), 'customers');
  assert.equal(params.get('patientId'), 'abc');
});

test('resolveCcoNextPreviewPath ignores legacy React nested routes', () => {
  assert.equal(resolveCcoNextPreviewPath('/cco-next/inbox'), '/major-arcana-preview/');
  assert.equal(
    resolveCcoNextPreviewPath('/cco-next/inbox', '?tab=queue'),
    '/major-arcana-preview/?tab=queue'
  );
});

test('resolveCcoNextPreviewPath returns null for legacy PWA assets', () => {
  assert.equal(resolveCcoNextPreviewPath('/cco-next/assets/js/index.js'), null);
  assert.equal(resolveCcoNextPreviewPath('/cco-next/manifest.json'), null);
  assert.equal(resolveCcoNextPreviewPath('/cco-next/sw.js'), null);
  assert.equal(resolveCcoNextPreviewPath('/cco-next/icon.svg'), null);
});

test('resolveCcoNextPreviewPath returns null outside /cco-next', () => {
  assert.equal(resolveCcoNextPreviewPath('/major-arcana-preview/'), null);
  assert.equal(resolveCcoNextPreviewPath('/admin'), null);
});
