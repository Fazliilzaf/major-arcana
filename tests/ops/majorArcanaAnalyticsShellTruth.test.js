const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

test('analytics coaching action ar datadriven och inte hardkodad till en malljump', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.ok(
    appSource.includes('function handleAnalyticsCoachingAction() {'),
    'Analytics-shellen ska ha en separat handler for coaching-actionen.'
  );

  assert.ok(
    appSource.includes('handleAnalyticsCoachingAction();'),
    'Analytics coaching-knappen ska ga via en dedikerad handler.'
  );

  assert.ok(
    !appSource.includes(
      'analyticsCoachingAction.addEventListener("click", () => {\n      handleAnalyticsTemplateJump("payment_reminder");'
    ),
    'Coaching-knappen far inte langre vara hardkodad till payment_reminder oavsett live-state.'
  );
});

test('analytics leaderboard och template performance arligare fallback utan falska minima', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.ok(
    !appSource.includes('booking_confirmation: Math.max(1, bookingCount)'),
    'Template performance far inte tvinga minst 1 traff nar scope saknar riktiga traffar.'
  );

  assert.ok(
    appSource.includes('name: "Ingen aktiv ranking ännu"'),
    'Leaderboarden ska visa en arlig placeholder nar aktiv ranking saknas.'
  );

  assert.ok(
    !appSource.includes(
      '(leaderboardCandidates.length ? leaderboardCandidates : fallback.leaderboard)'
    ),
    'Leaderboarden far inte falla tillbaka till statiska personnamn och poang som om de vore live-data.'
  );

  assert.ok(
    appSource.includes('row.hidden = !item;'),
    'Leaderboard-rader utan live-data ska dolas sa att placeholdern inte blandas med gamla fallback-rader.'
  );
});
