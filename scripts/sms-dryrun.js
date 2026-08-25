'use strict';

/**
 * Dryrun mot 46elks — validerar autentisering, avsändare och format UTAN att
 * skicka ett riktigt SMS.
 *
 * 46elks `dryrun=yes` returnerar ett svar med ett dryrun-id men skickar och
 * debiterar ingenting. Det är det enda sättet att bekräfta att
 * ELKS_API_USERNAME + ELKS_API_PASSWORD faktiskt fungerar (portal-readiness
 * bekräftar bara att de är satta, inte att de är giltiga).
 *
 * Körs i Render web-shell där miljövariablerna redan finns:
 *   node scripts/sms-dryrun.js
 *
 * Exit 0 = dryrun OK. Exit 1 = nycklar saknas eller 46elks avvisade anropet.
 */

const { sendSms, resolveProvider, isConfigured } = require('../src/sms/smsConnector');

function redact(v) {
  return v ? `${String(v).slice(0, 3)}… (${String(v).length} tecken)` : '(saknas)';
}

async function main() {
  const provider = resolveProvider();
  const from = process.env.SMS_FROM_NUMBER || 'HairTP';
  const to = process.env.SMS_DRYRUN_TO || '+4631881166';

  console.log(`provider       : ${provider}`);
  console.log(`isConfigured   : ${isConfigured()}`);
  console.log(`ELKS_USERNAME  : ${redact(process.env.ELKS_API_USERNAME)}`);
  console.log(`ELKS_PASSWORD  : ${redact(process.env.ELKS_API_PASSWORD)}`);
  console.log(`avsändare (from): ${from}`);
  console.log(`mottagare (to)  : ${to}  (dryrun skickar inget)`);
  console.log('--------------------------------------------------');

  if (!process.env.ELKS_API_USERNAME || !process.env.ELKS_API_PASSWORD) {
    console.error('\n✗ ELKS_API_USERNAME/ELKS_API_PASSWORD saknas i miljön.');
    console.error('  Kör i Render web-shell (där nycklarna redan finns), inte lokalt.');
    process.exit(1);
  }

  const result = await sendSms({
    to,
    from,
    message: 'Dryrun-test från Hair TP Clinic (skickas inte på riktigt).',
    dryrun: true,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.ok) {
    console.log('\n✓ DRYRUN OK — autentisering + avsändare + format accepterades av 46elks.');
    if (result.messageId && String(result.messageId).startsWith('dryrun')) {
      console.log('  dryrun-id bekräftat: inget SMS skickades.');
    }
    process.exit(0);
  }

  console.error(
    '\n✗ DRYRUN MISSYCKADES:',
    result.error,
    result.status ? `(HTTP ${result.status})` : ''
  );
  if (result.details) {
    console.error('  svar från 46elks:', JSON.stringify(result.details));
  }
  process.exit(1);
}

main();
