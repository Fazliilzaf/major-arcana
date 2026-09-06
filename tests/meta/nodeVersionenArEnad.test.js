'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Node-versionen får deklareras på EN plats.
 *
 * MÄTNINGEN som ledde hit (2026-09-06):
 *
 *   engines    >=20.0.0 <23.0.0
 *   prod       v22.23.2      (Render, ingen version i render.yaml)
 *   CI         v20.x         (26 hårdkodade rader i 19 workflow-filer)
 *   utvecklare v26.8.1       (utanför engines)
 *
 * Tre miljöer, tre versioner, och den som kör i drift — 22 — var den enda
 * ingen svit rörde. Det är precis så "funkar hos mig" uppstår: koden bevisas
 * på en version och körs på en annan.
 *
 * Samma duplikationsfel som --cc-rgb, kortreceptet, färgtripletterna och
 * testhjälparen: ETT faktum fanns i 26 kopior, i tre olika citatstilar
 * (`20`, `"20"`, `'20'`). En sådan lista blir aldrig färdig — nästa workflow
 * kopierar från grannen och ingen märker om grannen har fel.
 *
 * Fixen är inte att sätta 22 på 26 ställen. Den är att ta bort de 26 och låta
 * dem läsa .nvmrc, som setup-node@v4 stöder via `node-version-file`. Då finns
 * versionen på ett ställe och kan bara vara fel på ett ställe.
 *
 * VAD SOM INTE ÄR BEVISAT. Att prod landar på 22.23.2 — högsta tillåtna under
 * `<23` — tyder på att Render läser `engines` ur package.json. Det är en
 * slutsats av ett sammanträffande, inte något jag verifierat i Renders
 * konfiguration. render.yaml säger bara `runtime: node`. Skulle Render i
 * stället använda en egen default kan prod glida till en version utanför
 * engines utan att något här fångar det, för det här testet läser repot och
 * inte driftmiljön. Den luckan är känd och orapporterad-i-kod med avsikt:
 * att pinna prod är en driftändring och hör hemma i en egen, medveten deploy.
 *
 * Sviten är körd på 22.23.2 innan CI flyttades dit: 8433/8433, 0 fel.
 */

const ROT = path.join(__dirname, '..', '..');
const WORKFLOWS = path.join(ROT, '.github', 'workflows');

/**
 * YAML-kommentarer bort före mätning. Tionde gången regeln behövs i den här
 * kodbasen.
 *
 * VAR DEN FAKTISKT BÄR — och jag hade fel först. Jag motiverade maskningen
 * med T-103, alltså att en bortkommenterad `node-version: 20` annars skulle
 * ge falskt larm. Mutationskörningen visade att det argumentet var fel:
 * `^\s*node-version:` kan aldrig matcha en kommenterad rad, för `#` bryter
 * prefixet. T-103 är immun av sig själv.
 *
 * Maskningen bär i stället T-104, som räknar förekomster var som helst i
 * filen. Ett bortkommenterat setup-node-block ger då 2 steg mot 1 läsare och
 * sviten blir röd på ett fel som inte finns. Se T-105, som numera provar
 * exakt det fallet i stället för det jag inbillade mig.
 *
 * Begränsning, medvetet vald: `#` inuti en citerad sträng maskas också. För
 * det vi mäter spelar det ingen roll, och en regel som går att läsa är här
 * värd mer än en fullständig YAML-parser vi inte har som deklarerat beroende.
 */
function utanKommentarer(yaml) {
  return yaml
    .split('\n')
    .map((rad) => rad.replace(/(^|\s)#.*$/, '$1'))
    .join('\n');
}

function workflowfiler() {
  if (!fs.existsSync(WORKFLOWS)) return [];
  return fs
    .readdirSync(WORKFLOWS)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => path.join(WORKFLOWS, f));
}

function nvmrcMajor() {
  const rad = fs.readFileSync(path.join(ROT, '.nvmrc'), 'utf8').trim();
  const m = rad.match(/^v?(\d+)/);
  assert.ok(m, `.nvmrc innehåller "${rad}" — förväntade en version som 22`);
  return Number(m[1]);
}

/* ── §1 Källan finns ──────────────────────────────────────────────────── */

test('T-101: .nvmrc finns och pekar ut en major-version', () => {
  const p = path.join(ROT, '.nvmrc');
  assert.ok(
    fs.existsSync(p),
    '.nvmrc saknas. Den är den enda platsen Node-versionen får stå på — ' +
      'CI läser den via node-version-file och utvecklare via `nvm use`.'
  );
  assert.ok(nvmrcMajor() >= 20, 'orimligt låg major i .nvmrc');
});

/* ── §2 engines säger samma sak ───────────────────────────────────────── */

test('T-102: engines i package.json omsluter exakt .nvmrc:s major', () => {
  // engines är den mekanism som troligen pinnar Render (se filhuvudet). Går
  // den isär med .nvmrc kan CI och drift hamna på olika majors utan att något
  // säger ifrån.
  const major = nvmrcMajor();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROT, 'package.json'), 'utf8'));
  const range = String(pkg.engines?.node || '');
  assert.equal(
    range,
    `>=${major}.0.0 <${major + 1}.0.0`,
    `.nvmrc säger ${major} men engines säger "${range}". ` +
      'Ändra båda, eller låt bli att ändra någon.'
  );
});

/* ── §3 Ingen workflow har en egen åsikt ──────────────────────────────── */

test('T-103: ingen workflow hårdkodar node-version', () => {
  // Det var det här som gav 26 kopior. Regeln är formulerad som ett förbud
  // mot literalen, inte som "alla ska säga 22" — en lista över tillåtna
  // värden hade behövt uppdateras vid varje bump och blivit fel igen.
  const brister = [];
  for (const fil of workflowfiler()) {
    const yaml = utanKommentarer(fs.readFileSync(fil, 'utf8'));
    yaml.split('\n').forEach((rad, i) => {
      if (/^\s*node-version:\s*\S/.test(rad)) {
        brister.push(`${path.basename(fil)}:${i + 1}  ${rad.trim()}`);
      }
    });
  }
  assert.deepEqual(
    brister,
    [],
    `${brister.length} hårdkodad(e) node-version. Använd i stället:\n` +
      '    node-version-file: .nvmrc\n\n  ' +
      brister.join('\n  ')
  );
});

test('T-104: varje setup-node-steg läser .nvmrc', () => {
  // Motsatsen till T-103. Utan det här testet skulle man kunna ta bort
  // node-version helt — då väljer setup-node sin egen default, vilket är
  // samma drift som vi just tog bort, fast tystare.
  const brister = [];
  for (const fil of workflowfiler()) {
    const yaml = utanKommentarer(fs.readFileSync(fil, 'utf8'));
    const steg = (yaml.match(/actions\/setup-node@/g) || []).length;
    const laser = (yaml.match(/node-version-file:\s*\.nvmrc/g) || []).length;
    if (steg !== laser) {
      brister.push(`${path.basename(fil)}: ${steg} setup-node men ${laser} som läser .nvmrc`);
    }
  }
  assert.deepEqual(brister, [], brister.join('\n  '));
});

/* ── §4 Motprov ───────────────────────────────────────────────────────── */

test('T-105: MOTPROV — ett bortkommenterat setup-node-steg fäller inte T-104', () => {
  // FÖRSTA VERSIONEN AV DET HÄR TESTET VAR VÄRDELÖS, och mutationskörningen
  // visade det: jag tog bort maskningen och testet förblev grönt.
  //
  // Skälet är att T-103:s regex är immun av sig själv. `^\s*node-version:`
  // kan aldrig matcha en bortkommenterad rad, för `#` bryter prefixet. Jag
  // hade alltså skrivit ett motprov för ett problem som inte fanns, och
  // motiverat maskningen med fel argument.
  //
  // Där maskningen FAKTISKT bär är T-104, som räknar förekomster var som
  // helst i filen. Mätt:
  //
  //   ett bortkommenterat setup-node-block, utan maskning
  //       setup-node: 2   läser .nvmrc: 1   → T-104 RÖD, falskt larm
  //   samma, med maskning
  //       setup-node: 1   läser .nvmrc: 1   → T-104 grön
  //
  // Utan maskningen kan man alltså inte kommentera bort ett gammalt steg utan
  // att sviten blir röd på ett fel som inte finns.
  const prov = [
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version-file: .nvmrc',
    '      # - uses: actions/setup-node@v4      (gammalt steg, ersatt)',
    '      #   with:',
    '      #     node-version: 20',
    '',
  ].join('\n');
  const rent = utanKommentarer(prov);
  const steg = (rent.match(/actions\/setup-node@/g) || []).length;
  const laser = (rent.match(/node-version-file:\s*\.nvmrc/g) || []).length;
  assert.equal(steg, 1, 'maskningen räknar bortkommenterade setup-node-steg');
  assert.equal(steg, laser, 'T-104 skulle ge falskt larm på ett bortkommenterat steg');
});

test('T-106: MOTPROV — maskningen döljer inte RIKTIG kod', () => {
  // Åt andra hållet: en mask som tar för mycket gör både T-103 och T-104
  // blinda. Ett grönt och värdelöst test är sämre än inget test alls, för det
  // ser ut som skydd.
  const prov = [
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 20',
    '',
  ].join('\n');
  const rent = utanKommentarer(prov);
  assert.match(rent, /actions\/setup-node@/, 'maskningen åt upp ett riktigt setup-node-steg');
  assert.ok(
    /^\s*node-version:\s*\S/m.test(rent),
    'maskningen åt för mycket — T-103 skulle inte upptäcka en riktig rad'
  );
});
