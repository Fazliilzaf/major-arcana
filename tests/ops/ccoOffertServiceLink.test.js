'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveServicePricesInHtml } = require('../../src/routes/patientDocumentLive');
const { resolveServicePrice, getServiceSpec } = require('../../src/ops/ccoTjanstespecifikationStore');

const PREVIEW = path.join(__dirname, '../../public/major-arcana-preview');

const OFFERT_SERVICE_IDS = {
  'steg5-offert-botox-final-demo.html': '7382',
  'steg5-offert-filler-final-demo.html': '7377',
  'steg5-offert-op-final-demo.html': '7085',
  'steg5-offert-ortopedi-final-demo.html': '7109',
};

test('varje ny offert refererar en serviceId som har ett pris i tjänstespecen', () => {
  for (const [file, serviceId] of Object.entries(OFFERT_SERVICE_IDS)) {
    const html = fs.readFileSync(path.join(PREVIEW, file), 'utf8');
    assert.ok(
      html.includes(`data-service-id="${serviceId}"`),
      `${file} ska bära data-service-id="${serviceId}"`
    );
    const price = resolveServicePrice(serviceId);
    assert.ok(price, `${serviceId} ska ha ett pris i tjänstespecen`);
    assert.ok(getServiceSpec(serviceId), `${serviceId} ska finnas som tjänst`);
  }
});

test('resolveServicePricesInHtml ersätter inklistrat pris med resolverat pris', () => {
  const html =
    '<span class="demo-value" data-service-id="7382">999 999 kr</span>' +
    '<span class="demo-value">12 800 kr</span>';
  const out = resolveServicePricesInHtml(html);
  assert.ok(out.includes('2 300 kr'), 'priset ska resolveras ur tjänstespecen');
  assert.ok(!out.includes('999 999 kr'), 'det inklistrade priset ska bytas ut');
  assert.ok(out.includes('12 800 kr'), 'span utan data-service-id lämnas orörd');
});

test('resolveServicePricesInHtml är no-op utan data-service-id', () => {
  const html = '<span class="demo-value">12 800 kr</span>';
  assert.equal(resolveServicePricesInHtml(html), html);
  assert.equal(resolveServicePricesInHtml(null), null);
});
