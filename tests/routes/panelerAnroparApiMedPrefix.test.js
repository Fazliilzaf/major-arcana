'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-214 — en panel som anropar API:t utan /api/v1 404:ar tyst.
 *
 * `cco-skickat-v3.html` anropade `/cco-comm/drafts` i stället för
 * `/api/v1/cco-comm/drafts`. Rutten fanns; sökvägen gjorde det inte. Panelen
 * hade 404:at varje gång sedan den byggdes.
 *
 * DET SOM GJORDE DET OSYNLIGT var inte 404:an utan felhanteringen: `catch`
 * ritade "Inga meddelanden i den här vyn" — exakt vad en FUNGERANDE panel
 * visar när det inte finns några utkast. Ingen kunde se skillnad på tom och
 * trasig.
 *
 * De flesta paneler använder omslag som lägger på prefixet. Den som skriver
 * sökvägen för hand har inget som räddar den, och det syns inte i granskning
 * eftersom `/cco-comm/drafts` ser fullt rimligt ut.
 */

const ROT = path.join(__dirname, '..', '..');
const PUBLIC = path.join(ROT, 'public');

/**
 * Prefix som hör till API:t — alltså rutter i routrar MONTERADE UNDER /api/v1.
 *
 * FÖRSTA VERSIONEN TOG ALLA rutter i src/routes/, och rapporterade fem brott
 * som var korrekt kod: `/chat`, `/config` och `/conversation/:id` ligger i
 * routrar som monteras på ROTEN (`app.use(createConversationRouter(...))` utan
 * prefix, `app.get('/config', ...)`). De SKA anropas utan /api/v1.
 *
 * En kontroll som underkänner rätt kod slutar man lyssna på, och då fångar den
 * inte det äkta felet heller. Monteringen måste alltså läsas, inte antas.
 */
function apiPrefix() {
  const srv = fs.readFileSync(path.join(ROT, 'server.js'), 'utf8');

  // 1. Vilka fabriksnamn monteras under /api/v1?
  const underApi = new Set();
  for (const m of srv.matchAll(/app\.use\(\s*['"`]\/api\/v1['"`]\s*,\s*(\w+)/g)) underApi.add(m[1]);

  // 2. Vilken fil exporterar vilket fabriksnamn?
  const set = new Set();
  const rDir = path.join(ROT, 'src', 'routes');
  for (const f of fs.readdirSync(rDir)) {
    if (!f.endsWith('.js')) continue;
    const txt = fs.readFileSync(path.join(rDir, f), 'utf8');
    const fabriker = [...txt.matchAll(/function\s+(create\w*Router)\s*\(/g)].map((m) => m[1]);
    if (!fabriker.some((namn) => underApi.has(namn))) continue; // rotmonterad → hoppa
    for (const m of txt.matchAll(
      /router\.(?:get|post|put|patch|delete)\(\s*['"`]\/([a-z0-9][a-z0-9-]*)/gi
    ))
      set.add(m[1].toLowerCase());
  }

  // 3. Rutter som server.js registrerar direkt med full /api/v1-sökväg.
  for (const m of srv.matchAll(/['"`]\/api\/v1\/([a-z0-9][a-z0-9-]*)/gi))
    set.add(m[1].toLowerCase());

  set.delete('api');
  return set;
}

const PREFIX = apiPrefix();

function htmlOchJs(dir, ut = []) {
  for (const namn of fs.readdirSync(dir)) {
    const p = path.join(dir, namn);
    const st = fs.statSync(p);
    if (st.isDirectory()) htmlOchJs(p, ut);
    else if (/\.(html|js)$/.test(namn) && !namn.endsWith('.bak')) ut.push(p);
  }
  return ut;
}

test('mätningen har något att mäta MOT — API-prefixen hittades', () => {
  // Utan den här kontrollen blir testet grönt av att PREFIX är tom, alltså av
  // att mätningen slutade fungera. Samma fälla som en tom allowlist.
  assert.ok(PREFIX.size > 20, `hittade bara ${PREFIX.size} API-prefix — mät om`);
  for (const p of ['cco-comm', 'cco-journal', 'staff-portal-does-not-exist']) {
    if (p === 'staff-portal-does-not-exist') assert.ok(!PREFIX.has(p));
    else assert.ok(PREFIX.has(p), `${p} saknas bland prefixen`);
  }
});

test('INGEN fil i public/ anropar ett API-prefix utan /api/v1', () => {
  const brott = [];
  for (const fil of htmlOchJs(PUBLIC)) {
    const txt = fs.readFileSync(fil, 'utf8');
    const rader = txt.split('\n');
    rader.forEach((rad, i) => {
      /**
       * `fetch('/nagot…')` — men INTE `apiFetch('/nagot…')`.
       *
       * Första versionen av mönstret var `/fetch\(/` rakt av, och matchade
       * svansen i `apiFetch(` — omslaget som lägger på prefixet. Testet
       * rapporterade 20 falska brott, alltså precis de anrop som gör rätt.
       *
       * `(?<![\w$])` kräver att tecknet före `fetch` inte är en
       * identifierardel. Då träffas `fetch(` och `window.fetch(` men inte
       * `apiFetch(` eller `safeFetch(`.
       */
      for (const m of rad.matchAll(
        /(?<![\w$])((?:[\w$]+)\.)?fetch\(\s*[`'"]\/([a-z0-9][a-z0-9-]*)/gi
      )) {
        /**
         * ANDRA RÄTTELSEN AV DET HÄR MÖNSTRET, och samma sorts fel som den
         * första: det underkände korrekt kod.
         *
         * `(?<![\w$])` utesluter `apiFetch(` men INTE `D.fetch(` — punkten är
         * inget ordtecken. ORD-220 införde en delad hjälpare (`CCOPanelData`)
         * vars `fetch` lägger på prefixet själv, och varje anrop via den
         * flaggades som ett rått anrop utan prefix.
         *
         * Regeln nu: ett anrop på ett OBJEKT är ett omslag och hoppas över —
         * utom på de globala (`window`, `globalThis`, `self`), som ÄR den råa
         * webbläsarfunktionen.
         */
        const mottagare = (m[1] || '').replace(/\.$/, '');
        const arGlobal = ['', 'window', 'globalThis', 'self'].includes(mottagare);
        if (!arGlobal) continue;

        const prefix = m[2].toLowerCase();
        if (prefix === 'api') continue;
        if (!PREFIX.has(prefix)) continue; // statisk fil eller publik sida
        brott.push(`${path.relative(ROT, fil)}:${i + 1}  fetch('/${prefix}…') saknar /api/v1`);
      }
    });
  }
  assert.deepEqual(brott, [], `\n${brott.join('\n')}\n`);
});

test('SKICKAT-PANELEN skiljer tom lista från trasigt anrop', () => {
  /**
   * Regressionsspärren mot det som gjorde felet osynligt. Går anropet fel ska
   * panelen säga det, inte rita samma tomstatus som en fungerande panel utan
   * utkast.
   */
  const p = path.join(PUBLIC, 'major-arcana-preview', 'cco-skickat-v3.html');
  const txt = fs.readFileSync(p, 'utf8');

  assert.match(txt, /fetch\(`\/api\/v1\/cco-comm\/drafts/, 'prefixet är borta igen');
  assert.match(txt, /function renderFel\(/, 'felvisningen saknas');

  // Catch-grenen får INTE rita tomstatus i produktion.
  const catchBlock = (txt.match(/\} catch \(err\) \{[\s\S]*?\n {8}\}/) || [''])[0];
  assert.ok(catchBlock.length > 0, 'hittade inte catch-grenen — mät om');
  assert.match(catchBlock, /renderFel\(/, 'catch ritar inte fel');
  assert.ok(
    !/renderList\(DEMO \? SENT : \[\]\)/.test(catchBlock),
    'catch ritar fortfarande tomstatus vid fel — tomt och trasigt ser lika ut igen'
  );
});
