'use strict';

/**
 * Uppföljningarna är 4, 8 och 12 månader från operationsdagen.
 *
 * Bakgrund 2026-08-26. Fyra källor sa tre olika saker:
 *
 *   cco-workflow-v13.md · .html · dokumentinventeringen   4 / 8 / 12
 *   Figma Flow 26 · cco-end-to-end-kundresa.md            4 / 6 / 12
 *   ccoJournalSchemas.js · ccoFollowupDraftPlanner.js     4 / 6 / 12
 *   aftercare-kadensen för fue och dhi                    1 / 3 / 6 / 12
 *
 * Följden var att systemet mailade enligt en kalender och journalförde
 * enligt en annan. Fazli avgjorde 4/8/12 och dokumentet är nu utpekad
 * källa.
 *
 * Testet håller ihop de tre ändarna — planeraren, journalvarianterna och
 * mailkadensen. Glider någon isär igen ska det här gå sönder.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { FOLLOWUP_MONTHS } = require('../../src/ops/ccoFollowupDraftPlanner');
const { FORM_VARIANTS, getSchema } = require('../../src/ops/ccoJournalSchemas');

test('planeraren planerar 4, 8 och 12 månader', () => {
  assert.deepEqual([...FOLLOWUP_MONTHS], [4, 8, 12]);
});

test('journalvarianterna täcker 4, 8 och 12', () => {
  for (const variant of ['4_manader', '8_manader', '12_manader']) {
    assert.ok(
      FORM_VARIANTS.follow_up.includes(variant),
      `${variant} saknas i FORM_VARIANTS.follow_up`
    );
    assert.ok(getSchema('follow_up', variant), `inget schema för follow_up:${variant}`);
  }
});

test('6_manader finns kvar som legacy men är inte förstahandsval', () => {
  // Tas den bort skriver normalizeFormVariant om varje befintlig
  // sexmånadersjournal till defaultFormVariant, alltså 4_manader. Det är
  // journaldata — den får inte etiketteras om av en normalisering.
  assert.ok(FORM_VARIANTS.follow_up.includes('6_manader'), 'legacy-varianten togs bort');
  assert.notEqual(
    FORM_VARIANTS.follow_up[0],
    '6_manader',
    '6_manader får inte vara default — nya uppföljningar ska vara 4/8/12'
  );
  assert.ok(getSchema('follow_up', '6_manader'), 'gamla sexmånadersjournaler måste kunna läsas');
});

test('aftercare-kadensen för fue och dhi följer journalen', () => {
  const config = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '../../config/cco-treatment-document-requirements.json'),
      'utf8'
    )
  );

  for (const key of ['fue', 'dhi']) {
    const cadence = config.treatments[key].followupCadence;
    assert.deepEqual(
      cadence,
      ['4m', '8m', '12m'],
      `${key} mailar enligt ${JSON.stringify(cadence)} men journalförs enligt 4/8/12`
    );
  }
});

test('kadenstokens går att tolka av schemaläggaren', () => {
  // Samma regex som parseCadenceOffset i ccoAftercareSchedulerStore.
  // Ett token som inte matchar loggas som okänt och hoppas över tyst.
  for (const token of ['4m', '8m', '12m']) {
    const match = token.match(/^(\d+)\s*(h|d|w|m)/);
    assert.ok(match, `${token} tolkas inte av parseCadenceOffset`);
    assert.equal(match[2], 'm');
  }
});
