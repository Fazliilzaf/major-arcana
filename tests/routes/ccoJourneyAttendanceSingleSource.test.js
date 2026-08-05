'use strict';

/**
 * "GENOMFÖRD BOKNING" FÅR BARA DEFINIERAS PÅ ETT STÄLLE.
 *
 * ccoClientoLedJourneyAudit äger definitionen och exporterar `isAttended`.
 * Den gör två saker: matchar statuslistan ['completed','show','klar'] OCH
 * filtrerar bort källan cliento_web_mail — en notis till kliniken är inte
 * bevis för att kunden kom.
 *
 * Kundrese-bevisen i ccoPatientMaster hade en egen kopia av statuslistan utan
 * källfiltret. Två definitioner av samma sak driftar isär, och kopian var
 * dessutom den svagare: återanvänd på ett annat ställe hade den räknat ett
 * bokningsmejl som ett genomfört besök.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isAttended } = require('../../src/ops/ccoClientoLedJourneyAudit');

const ROUTE = path.join(__dirname, '..', '..', 'src', 'routes', 'ccoPatientMaster.js');

test('isAttended kräver både godkänd status och rätt källa', () => {
  assert.equal(isAttended({ status: 'completed', source: 'cliento_csv' }), true);
  assert.equal(isAttended({ status: 'show', source: 'cliento_api' }), true);
  assert.equal(isAttended({ status: 'klar', source: 'cliento_csv' }), true);

  assert.equal(isAttended({ status: 'cancelled', source: 'cliento_csv' }), false);
  assert.equal(isAttended({ status: 'upcoming', source: 'cliento_csv' }), false);

  // Kärnan: rätt status men fel källa räknas INTE som genomfört besök.
  assert.equal(isAttended({ status: 'completed', source: 'cliento_web_mail' }), false);
});

test('rutten definierar inte om statuslistan lokalt', () => {
  const source = fs.readFileSync(ROUTE, 'utf8');

  assert.doesNotMatch(
    source,
    /function isCompletedClientoBooking/,
    'den lokala kopian ska vara borta'
  );
  assert.doesNotMatch(
    source,
    /\[\s*'completed'\s*,\s*'show'\s*,\s*'klar'\s*\]/,
    'statuslistan får inte upprepas i rutten'
  );
});

test('rutten importerar isAttended och använder den', () => {
  const source = fs.readFileSync(ROUTE, 'utf8');

  assert.match(
    source,
    /require\('\.\.\/ops\/ccoClientoLedJourneyAudit'\)/,
    'audit-modulen ska importeras'
  );
  assert.match(source, /isAttended/, 'isAttended ska användas i rutten');
});
