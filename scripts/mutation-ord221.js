'use strict';

/**
 * ORD-221 — mutationskörning.
 *
 * Ett grönt test bevisar ingenting förrän det setts rött av rätt skäl. Varje
 * mutation nedan bryter EN egenskap som testerna påstår sig mäta; överlever
 * mutationen mäter testerna något annat än de säger.
 *
 * `split/join` används i stället för String.replace: replace tolkar `$&` och
 * `$1` i ersättningssträngen, och en mutation som tyst blir en annan mutation
 * är värre än ingen mutation alls.
 *
 * APPLICERADES ALDRIG rapporteras separat från ÖVERLEVDE. En mutation som inte
 * gick att applicera säger ingenting om testerna — den säger att den här filen
 * har blivit inaktuell.
 *
 *   node scripts/mutation-ord221.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROT = path.join(__dirname, '..');

const TESTER = [
  'tests/infra/graphVagenTillKunden.test.js',
  'tests/routes/diag.test.js',
  'tests/infra/microsoftGraphSendConnector.test.js',
];

const MUTATIONER = [
  {
    id: 'M1',
    fil: 'src/infra/microsoftGraphSendConnector.js',
    fran: 'if (kundgrind.blockerat) {',
    till: 'if (false) {',
    bryter: 'spärren släpper igenom allt — kundpost når Graph',
  },
  {
    id: 'M2',
    fil: 'src/infra/microsoftGraphSendConnector.js',
    fran: '      composeDocument.audience !== undefined ? composeDocument.audience : audience\n',
    till: '      audience\n',
    bryter: 'audience i compose-dokumentet läses inte — personalpost blockeras',
  },
  {
    id: 'M3',
    fil: 'src/infra/microsoftGraphSendConnector.js',
    fran: "    return sendComposeDocument({\n      audience,\n      composeDocument: {\n        version: 'phase_5',\n        kind: 'mail_compose_document',\n        mode: 'compose',",
    till: "    return sendComposeDocument({\n      composeDocument: {\n        version: 'phase_5',\n        kind: 'mail_compose_document',\n        mode: 'compose',",
    bryter: 'sendNewMessage bär inte vidare mottagargruppen',
  },
  {
    id: 'M4',
    fil: 'src/infra/microsoftGraphSendConnector.js',
    fran: "    return sendComposeDocument({\n      audience,\n      composeDocument: {\n        version: 'phase_5',\n        kind: 'mail_compose_document',\n        mode: 'reply',",
    till: "    return sendComposeDocument({\n      composeDocument: {\n        version: 'phase_5',\n        kind: 'mail_compose_document',\n        mode: 'reply',",
    bryter: 'sendReply bär inte vidare mottagargruppen — konversationsvyns väg',
  },
  {
    id: 'M5',
    fil: 'src/infra/graphSandvagar.js',
    fran: "`[\\\\w$)\\\\]]\\\\s*\\\\.\\\\s*(${SANDMETODER.join('|')})\\\\s*\\\\(`",
    till: "`[\\\\w$)\\\\]]\\\\s*\\\\.\\\\s*(${SANDMETODER.join('|')})`",
    bryter: 'typeof-kontroller räknas som utskick — facit får påhittade rader',
  },
  {
    id: 'M6',
    fil: 'src/infra/graphSandvagar.js',
    fran: '    if (a.audienceDeklaration !== d.deklaration) {',
    till: '    if (false) {',
    bryter: 'en kundväg som säger staff går igenom mätningen',
  },
  {
    id: 'M7',
    fil: 'src/infra/graphSandvagar.js',
    fran: '      odeklarerade.push(`${a.fil}:${a.rad} (${a.metod} #${a.ordning})`);',
    till: '      /* muterad */',
    bryter: 'en ny ogrindad sändväg rapporteras inte',
  },
  {
    id: 'M8',
    fil: 'src/infra/graphSandvagar.js',
    fran: "    if (c === '\"' || c === \"'\" || c === '`') {",
    till: '    if (false) {',
    bryter: 'strängar hoppas inte över — apostrof i kommentar bryter läsningen',
  },
  {
    id: 'M9',
    fil: 'src/routes/diag.js',
    fran: '        kundutskickPa: arKundutskickPa(),',
    till: '        kundutskickPa: false,',
    bryter: 'diag visar alltid AV — en öppnad grind syns inte utifrån',
  },
  {
    id: 'M10',
    fil: 'src/routes/diag.js',
    // ANKARET ÄR KORT MED FLIT. Första versionen matchade hela uttrycket på en
    // rad, och `prettier --write` bröt raden i tre — mutationen gick från DÖDAD
    // till EJ APPLICERAD utan att någonting i beteendet ändrats. En mutation
    // som är bunden till radbrytning mäter formatering, inte kod. Det är femte
    // gången samma fälla dyker upp i det här arbetet.
    fran: 'testmottagareSatt: Boolean(',
    till: 'testmottagareSatt: false && Boolean(',
    bryter: 'omstyrning till testadress syns inte i diag',
  },
  {
    id: 'M11',
    fil: 'src/routes/ccoConversation.js',
    fran: "          audience: 'customer',\n          mailboxId: senderMailboxId,",
    till: '          mailboxId: senderMailboxId,',
    bryter: 'konversationsvyns svar deklarerar ingen mottagargrupp',
  },
  {
    id: 'M12',
    fil: 'src/ops/ccoBookingStaffNotify.js',
    fran: "    audience: 'staff',",
    till: "    audience: 'customer',",
    // BÅDA träffarna muteras med flit. Filen har två identiska notisfunktioner
    // (bekräftad och avbokad), och det finns ingen text som skiljer just den
    // här raden åt. Att mutera båda är en giltig mutation — den frågar om
    // facit märker att personalvägarna påstår sig vara kundpost.
    alla: true,
    bryter: 'personalnotiserna påstås vara kundpost — och blockeras därmed i drift',
  },
  {
    id: 'M13',
    fil: 'src/ops/dailyDigestRunner.js',
    fran: "      audience: 'staff',",
    till: '      /* muterad */',
    bryter: 'det dagliga sammandraget deklarerar ingen mottagargrupp',
  },
];

function kor() {
  const overlevde = [];
  const applicerades_aldrig = [];
  const dodade = [];

  for (const m of MUTATIONER) {
    const filvag = path.join(ROT, m.fil);
    const original = fs.readFileSync(filvag, 'utf8');

    const bitar = original.split(m.fran);
    if (bitar.length < 2) {
      applicerades_aldrig.push(m);
      continue;
    }
    if (bitar.length > 2 && !m.alla) {
      // Fler än en träff utan `alla: true`: mutationen är tvetydig och skulle
      // ändra mer än den säger. Rapporteras som "gick inte att applicera", inte
      // som dödad — en tvetydig mutation säger ingenting om testerna.
      applicerades_aldrig.push({ ...m, bryter: m.bryter + ' [FLERA TRÄFFAR]' });
      continue;
    }

    fs.writeFileSync(filvag, bitar.join(m.till));
    let rott = false;
    try {
      execFileSync('node', ['--test', ...TESTER], {
        cwd: ROT,
        stdio: 'pipe',
        timeout: 300000,
      });
    } catch {
      rott = true;
    } finally {
      fs.writeFileSync(filvag, original);
    }

    if (rott) dodade.push(m);
    else overlevde.push(m);
    console.log(`${rott ? 'DÖDAD    ' : 'ÖVERLEVDE'} ${m.id}  ${m.bryter}`);
  }

  console.log('\n────────────────────────────────────────');
  console.log(`Dödade:              ${dodade.length}/${MUTATIONER.length}`);
  console.log(`Överlevde:           ${overlevde.length}`);
  console.log(`Applicerades aldrig: ${applicerades_aldrig.length}`);
  for (const m of overlevde) console.log(`  ÖVERLEVDE  ${m.id}  ${m.bryter}`);
  for (const m of applicerades_aldrig) console.log(`  EJ APPLICERAD  ${m.id}  ${m.fil}`);

  if (overlevde.length || applicerades_aldrig.length) process.exitCode = 1;
}

kor();
