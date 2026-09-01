'use strict';

/**
 * Svarar Konsumentverkets ångerblankett fortfarande?
 *
 * Avtalen hänvisar till blanketten som "bilaga 3", och länken ligger i
 * dokumentet patienten får. Den gamla adressen svarade 404 i minst en okänd tid
 * innan någon mätte den — en patient som ville utöva sin ångerrätt fick en
 * felsida. Ingenting i systemet hade en åsikt om det.
 *
 * Kör:  node scripts/check-angerblankett-link.js
 *
 * På schema, inte vid varje commit: Konsumentverkets driftstopp ska inte kunna
 * stoppa en deploy. Exit 1 när adressen slutar svara 200, exit 2 när den inte
 * går att nå alls — samma skillnad som verify-render-env-count gör mellan
 * "bevisat fel" och "kunde inte kontrolleras".
 */

const { ANGER_BLANKET_URL } = require('../src/ops/ccoAngerblankett');

async function main() {
  let svar;
  try {
    svar = await fetch(ANGER_BLANKET_URL, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.log(`ÖVERHOPPAD  ${ANGER_BLANKET_URL}`);
    console.log(`            gick inte att nå: ${err.name} ${err.message}`);
    console.log('            Nätverksfel är inte samma sak som en död länk. Kör om.');
    return 2;
  }

  if (svar.status === 200) {
    console.log(`PASS  ${ANGER_BLANKET_URL}`);
    console.log(`      HTTP 200${svar.redirected ? ` (via omdirigering → ${svar.url})` : ''}`);
    return 0;
  }

  console.log(`FAIL  ${ANGER_BLANKET_URL}`);
  console.log(`      HTTP ${svar.status}`);
  console.log('');
  console.log('      Länken ligger i behandlingsavtalen som "bilaga 3". En patient som');
  console.log('      klickar för att utöva sin ångerrätt får den här statuskoden.');
  console.log('      Adressen bor i src/ops/ccoAngerblankett.js — rätta den där,');
  console.log('      och bekräfta den nya med Nordbro innan den går ut i ett avtal.');
  return 1;
}

main()
  .then((kod) => process.exit(kod))
  .catch((err) => {
    console.error(`::error::${err.message || err}`);
    process.exit(1);
  });
