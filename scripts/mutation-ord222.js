'use strict';

/**
 * ORD-222 + ORD-223 — mutationskörning.
 *
 * Samma regler som scripts/mutation-ord221.js: split/join i stället för
 * String.replace, APPLICERADES ALDRIG rapporteras skilt från ÖVERLEVDE, och
 * ankarena hålls KORTA — ett ankare som spänner över flera rader slutar matcha
 * så fort prettier bryter om dem, och mäter då formatering i stället för kod.
 *
 *   node scripts/mutation-ord222.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROT = path.join(__dirname, '..');

const TESTER = [
  'tests/public/tradanteckningOchVidarebefordran.test.js',
  'tests/ops/ccoConversationNotesStore.test.js',
  'tests/routes/ccoCustomerComm.test.js',
];

const MUTATIONER = [
  // ── Storen: tenant ────────────────────────────────────────────────────────
  {
    id: 'M1',
    fil: 'src/ops/ccoConversationNotesStore.js',
    fran: "if (!tenant) throw new Error('tenantId krävs",
    till: "if (false) throw new Error('tenantId krävs",
    bryter: 'skrivning utan tenant tillåts — anteckningen kan inte knytas till klinik',
  },
  {
    id: 'M2',
    fil: 'src/ops/ccoConversationNotesStore.js',
    fran: 'return `${kanonisk.toLowerCase()}::${normalizeText(conversationKey)}`;',
    till: 'return `${normalizeText(conversationKey)}`;',
    bryter: 'tenanten faller ur nyckeln — två kliniker delar hink igen',
  },
  {
    id: 'M3',
    fil: 'src/ops/ccoConversationNotesStore.js',
    fran: 'const kanonisk = canonicalTenantId(tenantId);',
    till: 'const kanonisk = normalizeText(tenantId);',
    bryter: 'hair_tp och hair-tp-clinic blir två hinkar; en typo blir en egen klinik',
  },
  {
    id: 'M4',
    fil: 'src/ops/ccoConversationNotesStore.js',
    fran: "if (nyckel.includes('::')) continue;",
    till: 'continue;',
    bryter: 'version 1-rader flyttas inte till karantän',
  },
  {
    id: 'M5',
    fil: 'src/ops/ccoConversationNotesStore.js',
    fran: 'state.omigreradeUtanTenant[nyckel] = rader;',
    till: '/* muterad */',
    bryter: 'karantänen tappar raden — data försvinner i stället för att flyttas',
  },
  {
    id: 'M6',
    fil: 'src/ops/ccoConversationNotesStore.js',
    fran: 'if (!tenant || !key) return [];',
    till: 'if (!key) return [];',
    bryter: 'läsning utan tenant kastar i stället för att ge tomt',
  },

  // ── ccoCustomerComm: nyckelform och tenant ────────────────────────────────
  {
    id: 'M7',
    fil: 'src/routes/ccoCustomerComm.js',
    fran: "          conversationKey: 'customer:' + customerId,\n          body,",
    till: '          conversationKey: customerId,\n          body,',
    bryter: 'notisen skrivs under bar nyckel — trådvyn hittar den aldrig',
  },
  {
    id: 'M8',
    fil: 'src/routes/ccoCustomerComm.js',
    fran: '          tenantId: noteTenantId,',
    till: '          /* muterad */',
    bryter: 'routen skickar ingen tenant till storen',
  },

  // ── Klienten: kedjan och grinden ──────────────────────────────────────────
  {
    id: 'M9',
    fil: 'public/konversationer-bottom-actions.js',
    fran: "else if (action === 'anteckning') openTradanteckningar(presetContext);",
    till: '/* muterad */',
    bryter: 'menyvalet Anteckning når ingen handlare',
  },
  {
    id: 'M10',
    fil: 'public/konversationer-bottom-actions.js',
    fran: "else if (action === 'vidarebefordra') openVidarebefordra(presetContext);",
    till: '/* muterad */',
    bryter: 'menyvalet Vidarebefordra når ingen handlare',
  },
  {
    id: 'M11',
    fil: 'public/konversationer-bottom-actions.js',
    fran: 'forwardToMessageId: messageId,',
    till: '/* muterad */',
    bryter: 'forward-anropet saknar det fält motorn kräver',
  },
  {
    id: 'M12',
    fil: 'public/konversationer-bottom-actions.js',
    fran: "mode: 'forward',",
    till: "mode: 'compose',",
    bryter: 'anropet vidarebefordrar inte utan skriver ett nytt brev',
  },
  {
    id: 'M13',
    fil: 'public/konversationer-bottom-actions.js',
    fran: 'if (/KUNDUTSKICK|kundutskick/i.test(kod',
    till: 'if (false && /KUNDUTSKICK|kundutskick/i.test(kod',
    bryter: 'grinden visas som HTTP 500 i stället för som avstängt utskick',
  },
  {
    id: 'M14',
    fil: 'public/konversationer-bottom-actions.js',
    fran: "toast('Anteckningarna kunde inte hämtas (' + (err.message || 'fel') + ').', 'err');",
    till: '/* muterad */',
    bryter: 'ett trasigt anrop ritas som en tråd utan anteckningar',
  },
  {
    id: 'M15',
    fil: 'public/major-arcana-preview/app/cco-conversations-v2-shell.js',
    fran: "{ action: 'vidarebefordra', ico: '↪', label: 'Vidarebefordra' },",
    till: '/* muterad */',
    bryter: 'ingången i Mer-menyn försvinner — funktionen blir onåbar igen',
  },
  {
    id: 'M16',
    fil: 'public/major-arcana-preview/app.js',
    fran: '    anteckning: "anteckning",',
    till: '    /* muterad */',
    bryter: 'routingen från menyn till launchern bryts',
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
      console.log(`EJ APPL.  ${m.id}  ${m.bryter}`);
      continue;
    }
    if (bitar.length > 2 && !m.alla) {
      applicerades_aldrig.push({ ...m, bryter: m.bryter + ' [FLERA TRÄFFAR]' });
      console.log(`EJ APPL.  ${m.id}  ${m.bryter} [FLERA TRÄFFAR]`);
      continue;
    }

    fs.writeFileSync(filvag, bitar.join(m.till));
    let rott = false;
    try {
      execFileSync('node', ['--test', ...TESTER], { cwd: ROT, stdio: 'pipe', timeout: 300000 });
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
