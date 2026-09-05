'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-222 + ORD-223 — två färdiga backend-vägar som saknade ingång.
 *
 * Uppmätt 2026-09-05:
 *
 *   /cco/runtime/conversation/:key/notes   fanns, ingen vy anropade den.
 *                                          Personalen kunde anteckna om en
 *                                          KUND (komm-panelen) men inte om den
 *                                          TRÅD de faktiskt stod i.
 *
 *   POST /cco/send mode:'forward'          fanns helt färdig — connectorn
 *                                          anropar Graphs createForward — men
 *                                          ingen vy satte forwardToMessageId.
 *
 * BÅDA ÄR NU KOPPLADE. Vidarebefordran är dessutom grindad av ORD-221:s
 * kundutskicksspärr, så knappen kan tryckas utan att något går till kund
 * medan ARCANA_KUNDUTSKICK_ENABLED är av.
 *
 * TESTERNA LÄSER KÄLLAN, inte en webbläsare. Det är samma metod som ORD-214
 * och ORD-220 använde för panelerna, och den fångar det som faktiskt gick fel
 * där: en sökväg utan /api/v1, en catch som ritade tomt, en knapp utan
 * handlare.
 */

const ROT = path.join(__dirname, '..', '..');
const LAUNCHER = fs.readFileSync(
  path.join(ROT, 'public', 'konversationer-bottom-actions.js'),
  'utf8'
);
const APP = fs.readFileSync(path.join(ROT, 'public', 'major-arcana-preview', 'app.js'), 'utf8');
const SHELL = fs.readFileSync(
  path.join(ROT, 'public', 'major-arcana-preview', 'app', 'cco-conversations-v2-shell.js'),
  'utf8'
);

// ── Kedjan knapp → routing → handlare ───────────────────────────────────────

test('BÅDA ÅTGÄRDERNA HAR EN HEL KEDJA från meny till handlare', () => {
  /**
   * Tre led, och ett brutet led ger en knapp som inte gör något — vilket är
   * exakt vad de här två funktionerna led av innan. Kedjan mäts därför i sin
   * helhet, inte led för led.
   */
  for (const [menyval, launcherAction, handlare] of [
    ['anteckning', 'anteckning', 'openTradanteckningar'],
    ['vidarebefordra', 'vidarebefordra', 'openVidarebefordra'],
  ]) {
    assert.match(
      SHELL,
      new RegExp(`action: '${menyval}'`),
      `${menyval}: menyvalet saknas i "Mer"-menyn`
    );
    assert.match(
      APP,
      new RegExp(`${menyval}: "${launcherAction}"`),
      `${menyval}: routingen till launchern saknas`
    );
    assert.match(
      LAUNCHER,
      new RegExp(`action === '${launcherAction}'\\) ${handlare}\\(`),
      `${menyval}: launchern kopplar inte åtgärden till sin handlare`
    );
    assert.match(
      LAUNCHER,
      new RegExp(`async function ${handlare}\\(`),
      `${menyval}: handlaren finns inte`
    );
  }
});

// ── ORD-222 · anteckning på tråden ──────────────────────────────────────────

test('ANTECKNINGEN anropar trådrutten med /api/v1-prefix', () => {
  // ORD-214: en panel som anropar API:t utan /api/v1 404:ar tyst, och 404:an
  // ritades som "inget att visa". Prefixet mäts därför explicit.
  assert.match(
    LAUNCHER,
    /'\/api\/v1\/cco\/runtime\/conversation\/' \+ encodeURIComponent\(ctx\.conversationKey\) \+ '\/notes'/,
    'anteckningsrutten saknar prefix eller kodar inte nyckeln'
  );
});

test('ANTECKNINGEN skiljer TOMT från TRASIGT', () => {
  /**
   * Regressionsspärren mot det fel som återkommit tre gånger i den här
   * kodbasen: `catch { visa tomt }`. En tråd utan anteckningar och en tråd där
   * hämtningen gick sönder får inte se likadana ut.
   */
  const block = (LAUNCHER.match(/async function openTradanteckningar\([\s\S]*?\n {2}\}/) || [
    '',
  ])[0];
  assert.ok(block.length > 200, 'hittade inte funktionen — mät om');
  assert.match(block, /kunde inte hämtas/i, 'ett trasigt anrop rapporteras inte');
  assert.match(block, /inga anteckningar på den här tråden ännu/i, 'tomt tillstånd förklaras inte');
  // Och den avbryter vid fel i stället för att visa en tom lista att skriva i.
  assert.match(block, /toast\([^)]*kunde inte hämtas[\s\S]{0,120}?return;/i, 'fel avbryter inte');
});

test('ANTECKNINGEN skickar INTE tenant från klienten', () => {
  /**
   * ORD-222 — tenanten tas ur den verifierade sessionen på servern. Skickade
   * klienten den i kroppen vore klinikgränsen något anroparen bestämmer, och
   * hela poängen med nyckeln vore borta.
   *
   * `x-cco-tenant` är en annan sak: den headern finns på alla anrop i filen och
   * används för rollupplösning, inte för att välja lagringshink.
   */
  const block = (LAUNCHER.match(/async function openTradanteckningar\([\s\S]*?\n {2}\}/) || [
    '',
  ])[0];
  const kropp = (block.match(/body: JSON\.stringify\(\{[\s\S]*?\}\)/) || [''])[0];
  assert.ok(kropp.length > 0, 'hittade ingen POST-kropp — mät om');
  assert.ok(
    !/tenantId/.test(kropp),
    'klienten skickar tenantId i kroppen — servern ska ta den ur sessionen'
  );
});

// ── ORD-223 · vidarebefordran ───────────────────────────────────────────────

test('VIDAREBEFORDRAN sätter de fält motorn faktiskt kräver', () => {
  /**
   * Mätt i ccoMailComposeDocument.js och microsoftGraphSendConnector.js:
   * forward-läget kräver `forwardToMessageId` OCH minst en mottagare. Saknas
   * något av dem kastar connectorn innan Graph nås.
   *
   * Det var också hela skälet till att vägen inte gick att nå: ingen vy satte
   * forwardToMessageId.
   */
  const block = (LAUNCHER.match(/async function openVidarebefordra\([\s\S]*?\n {2}\}/) || [''])[0];
  assert.ok(block.length > 200, 'hittade inte funktionen — mät om');
  assert.match(block, /mode: 'forward'/, "mode: 'forward' saknas");
  assert.match(block, /forwardToMessageId: messageId/, 'forwardToMessageId sätts inte');
  assert.match(block, /to: \[mottagare\]/, 'ingen mottagare skickas');
  assert.match(block, /'\/api\/v1\/cco\/send'/, 'fel sökväg till sändrutten');
});

test('VIDAREBEFORDRAN vägrar när tråden saknar meddelande-ID', () => {
  // Utan messageId har Graph ingenting att bygga forward-utkastet av. Att säga
  // det här är bättre än att skicka ett anrop som säkert misslyckas och sedan
  // visa serverns felkod för personalen.
  const block = (LAUNCHER.match(/async function openVidarebefordra\([\s\S]*?\n {2}\}/) || [''])[0];
  assert.match(
    block,
    /if \(!messageId\) \{[\s\S]{0,200}?return;/,
    'saknat meddelande-ID stoppar inte anropet'
  );
  assert.match(block, /saknar meddelande-ID/i, 'orsaken förklaras inte');
});

test('KUNDUTSKICKSGRINDEN visas som grind, inte som tekniskt fel', () => {
  /**
   * Det viktigaste i ORD-223. Grinden från ORD-221 är AV i prod, så det första
   * personalen möter när de trycker på knappen ÄR blockeringen.
   *
   * Utan den här grenen läser de "HTTP 500" och felanmäler något som fungerar
   * precis som ägaren bestämt. Ett korrekt nej som ser ut som ett fel kostar
   * lika mycket förtroende som ett riktigt fel.
   */
  const block = (LAUNCHER.match(/async function openVidarebefordra\([\s\S]*?\n {2}\}/) || [''])[0];

  /**
   * BUNDET TILL VAKTEN, inte till texten — och det är mätt fram.
   *
   * Första versionen skrev `assert.match(block, /KUNDUTSKICK|kundutskick/)`.
   * Mutationen som ändrade `if (/KUNDUTSKICK.../.test(...))` till
   * `if (false && /KUNDUTSKICK.../.test(...))` ÖVERLEVDE: mönstret stod kvar i
   * källan, grinden gjorde det inte. Exakt samma fälla som ORD-219 M7.
   *
   * Nu krävs att `if (` följs direkt av testet, utan något som kortsluter det.
   */
  assert.match(
    block,
    /if \(\/KUNDUTSKICK\|kundutskick\/i\.test\(/,
    'grindens felkod känns inte igen — eller villkoret är kortslutet'
  );
  assert.match(
    block,
    /Utskick till kund är avstängt/,
    'grinden förklaras inte på svenska för personalen'
  );
  assert.match(block, /ARCANA_KUNDUTSKICK_ENABLED/, 'flaggan som styr det namnges inte');
  assert.match(block, /Inget brev gick iväg/, 'det sägs inte rent ut att inget skickades');
});

test('VIDAREBEFORDRAN deklarerar inte sin egen mottagargrupp', () => {
  /**
   * Klienten får INTE skicka `audience`. Sätter den `'staff'` för att komma
   * förbi grinden är det precis den lögn ORD-221:s facit finns för att fånga —
   * och den skulle fungera, eftersom servern läser fältet.
   *
   * Servern sätter `audience: 'customer'` på /cco/send-vägen. Det ska förbli
   * serverns beslut.
   */
  const block = (LAUNCHER.match(/async function openVidarebefordra\([\s\S]*?\n {2}\}/) || [''])[0];
  assert.ok(!/audience/.test(block), 'klienten deklarerar mottagargrupp — det får bara servern');
});
