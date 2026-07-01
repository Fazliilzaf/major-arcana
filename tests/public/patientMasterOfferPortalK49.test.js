const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'patient-master-ui.js'
);

const cssPath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'cco-polish.css'
);

test('patient master offer panel renders K49 live verification before sharing portal', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(
    source,
    /function renderCustomerPortalLiveVerification\(\s*linkedOffer,\s*customerPortalUrl,\s*planEntry,\s*photos,\s*values = \{\}\s*\)/
  );
  assert.match(source, /data-customer-portal-live-verification/);
  assert.match(source, /data-customer-portal-live-verification-count/);
  assert.match(
    source,
    /data-customer-portal-live-verification-item="\$\{escapeHtml\(item\.key\)\}"/
  );
  assert.match(source, /Livekontroll \$\{readyCount\}\/\$\{liveItems\.length\}/);
  assert.match(source, /Portalpreview/);
  assert.match(source, /Kundlänk/);
  assert.match(source, /Offertdokument/);
  assert.match(source, /Pris/);
  assert.match(source, /Hårsäckar\/zoner/);
  assert.match(source, /Konsultationsbilder/);
  assert.match(source, /Kundmeddelande/);
  assert.match(
    source,
    /Livekontroll klar: portal, offert, pris, zoner, bilder och meddelande är verifierade innan kunddelning\./
  );
  assert.match(
    source,
    /renderCustomerPortalLiveVerification\(\s*linkedOffer,\s*customerPortalUrl,\s*planEntry,\s*photos,\s*shareChecklistValues\s*\)/
  );
  assert.match(css, /\.patient-master-live-verification/);
  assert.match(css, /\.patient-master-live-verification\.is-ready/);
  assert.match(css, /\.patient-master-live-verification-items/);
});
