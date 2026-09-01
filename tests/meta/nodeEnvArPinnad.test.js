'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * `NODE_ENV` måste vara något annat än `production` när testerna körs.
 *
 * `getRoleFromRequest` i src/security/ccoRbac.js läser `x-cco-role` bara när
 * NODE_ENV inte är production — helt riktigt, en header ska inte kunna sätta
 * roll i skarp drift. Trettio testfiler använder den headern för att simulera
 * inloggad personal. Tjugosju av dem pinnar inte NODE_ENV själva.
 *
 * `npm test` sätter `NODE_ENV=test` innan sviten startar, så allt är grönt.
 * `node --test tests/routes/nagot.test.js` gör det inte. På en maskin där
 * skalet exporterar NODE_ENV=production faller alla trettio, med 403 där
 * testet väntade 200.
 *
 * Mätt 2026-09-01:
 *
 *   staffPortalOrdinationWrite   ensam 1/5 · npm test 5/5
 *   ccoAudit                     ensam 11/13 · med NODE_ENV=test 13/13
 *
 * Det såg ut som ordningsberoende — som om ett testfile satte upp något ett
 * annat behövde. Det gjorde det inte. Skillnaden låg i hur sviten startades.
 *
 * Den här filen rättar ingenting. Den byter ut trettio förvirrande 403:or mot
 * en mening som säger vad som är fel. Att jaga ett spöke i en halvtimme är
 * dyrare än att läsa en rad.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');

test('NODE_ENV är inte production under testkörningen', () => {
  assert.notEqual(
    process.env.NODE_ENV,
    'production',
    'NODE_ENV=production stänger av x-cco-role i ccoRbac, och ~27 testfiler ' +
      'använder den headern för att sätta roll. Du får 403 där testet väntar ' +
      '200, i tester som inte är trasiga.\n\n' +
      '  Kör:  npm test                     (pinnar NODE_ENV=test)\n' +
      '  Eller: NODE_ENV=test node --test <fil>\n\n' +
      'Sitter production i ditt skal? Kolla `echo $NODE_ENV` — den hör inte ' +
      'hemma i en utvecklingsmiljö.'
  );
});

test('npm test pinnar NODE_ENV så sviten inte beror på skalet', () => {
  // Skyddar raden som gör hela sviten deterministisk. Försvinner den blir
  // resultatet beroende av vem som kör och var.
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const unit = String(pkg.scripts?.['test:unit'] || '');
  assert.match(
    unit,
    /NODE_ENV=test/,
    'test:unit måste sätta NODE_ENV=test. Utan det ärver sviten skalets värde, ' +
      'och två maskiner ger olika svar om samma commit.'
  );
});
