const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const patientMasterUiPath = path.join(
  repoRoot,
  'public/major-arcana-preview/app/patient-master-ui.js'
);
const polishCssPath = path.join(repoRoot, 'public/major-arcana-preview/cco-polish.css');

test('patient master offer panel renders K12 follow-up signal from portal activity', () => {
  const source = fs.readFileSync(patientMasterUiPath, 'utf8');

  assert.match(source, /function getOfferPortalActivitySummary\(linkedOffer\)/);
  assert.match(source, /function renderOfferFollowupSignal\(linkedOffer\)/);
  assert.match(source, /renderOfferFollowupSignal\(linkedOffer\)/);
  assert.match(source, /Läst under betänketid/);
  assert.match(source, /Följ upp efter betänketiden/);
  assert.match(source, /Följ upp nu/);
  assert.match(source, /Kunden har öppnat underlag men inte signerat/);
  assert.match(source, /quoteStatus === 'accepted' \|\| esignStatus === 'accepted' \|\| signedAt/);
});

test('K12 follow-up styling is scoped to patient master offer card', () => {
  const css = fs.readFileSync(polishCssPath, 'utf8');

  assert.match(css, /\.patient-master-offer-followup/);
  assert.match(css, /\.patient-master-offer-followup\.is-waiting/);
  assert.match(css, /\.patient-master-offer-followup\.is-action/);
});
