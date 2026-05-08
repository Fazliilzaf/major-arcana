const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLES_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'styles.css'
);

test('booking operator panel är en intern scrollzon och låter statuschips vara läsbara', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.booking-operator-surface\s*\{[\s\S]*max-height:\s*min\(760px,\s*calc\(100vh - 168px\)\);[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*\}/,
    'Bookingpanelen ska ha egen scrollhöjd så den inte trycker arbetsytan till flera tusen pixlar.'
  );

  assert.match(
    stylesSource,
    /\.booking-status-flow\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(86px,\s*1fr\)\);[\s\S]*\}/,
    'Statusflödet ska använda auto-fit så sju steg kan radbrytas i den smala högerpanelen.'
  );

  assert.match(
    stylesSource,
    /\.booking-status-step span\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*white-space:\s*normal;[\s\S]*\}/,
    'Statusetiketter ska få radbrytas i stället för att trunkeras till enstaka bokstäver.'
  );

  assert.match(
    stylesSource,
    /\.booking-handoff-summary\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(142px,\s*1fr\)\);[\s\S]*\}/,
    'Handoff-korten ska reflowa i smal bookingpanel i stället för att pressas till fyra mikrokolumner.'
  );
});
