'use strict';

/* CCO-panelernas kundkontext-kort (höger "operatörsstöd") band tidigare bara
 * ctx-baren/söket och visade därför hårdkodad demo-kund ("Anna Karlsson") på en
 * riktig tråd. Panelerna är v3-prototyper (ännu ej datakopplade), men identiteten
 * i kundkortet MÅSTE följa vald tråds kund. De här testerna låser att varje panels
 * applyContext binder kk-card-namnet till kontextens customerName och döljer de
 * fabricerade demo-attributen (chips/stat-rad/AI-råd) i stället för att tillskriva
 * vald kund Annas påhittade fakta. Rent surfacing — ingen ny datakoppling. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PREVIEW = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview');

function applyContextBody(source) {
  const start = source.indexOf('function applyContext(context)');
  assert.ok(start > -1, 'applyContext ska finnas');
  // Ta ett generöst fönster som täcker hela applyContext-kroppen.
  return source.slice(start, start + 3800);
}

for (const file of [
  'cco-smart-anteckning-v3.html',
  'cco-signaturer-v3.html',
  'cco-skickat-v3.html',
]) {
  test(`${file}: kundkontext-kortet binds till vald kund och döljer fabricerade demo-attribut`, () => {
    const source = fs.readFileSync(path.join(PREVIEW, file), 'utf8');
    const body = applyContextBody(source);

    // Binder kk-card-namnet till kontextens kund (#kkName eller .kk-card .kk-name).
    assert.match(
      body,
      /(getElementById\('kkName'\)|querySelector\('\.kk-card \.kk-name'\))/,
      `${file}: applyContext ska binda kundkortets namn`
    );
    // Kundkortets namn binds till löst kund-namn (annars neutral platshållare).
    assert.match(
      body,
      /textContent = resolved \? name/,
      `${file}: kundkortets namn ska sättas till vald kund (löst namn)`
    );
    // Fabricerade demo-widgets döljs ÄVEN utan löst namn (Bugbot #81c5c888) —
    // dölj-loopen får aldrig sitta bakom en tidig retur på platshållar-namnet.
    assert.doesNotMatch(
      body,
      /=== 'Vald kund'\) return;[\s\S]*\.kk-card \.kk-ai/,
      `${file}: demo-attribut får inte döljas efter en tidig retur på "Vald kund"`
    );
    const earlyReturnIdx = body.indexOf('if (!resolved) return');
    const hideIdx = body.indexOf('.kk-card .kk-ai');
    if (earlyReturnIdx > -1) {
      assert.ok(
        hideIdx > -1 && hideIdx < earlyReturnIdx,
        `${file}: demo-attribut ska döljas före den namn-gated returen`
      );
    }

    // Döljer de fabricerade demo-widgetsen (kan inte härledas ur trådkontexten).
    assert.match(
      body,
      /\.kk-card \.kk-ai/,
      `${file}: fabricerat AI-råd i kundkortet ska döljas vid riktig kontext`
    );
    assert.match(body, /style\.display = 'none'/, `${file}: demo-attribut ska döljas`);
  });
}

test('cco-smart-anteckning-v3.html: neutraliserar demo-listan av tidigare anteckningar', () => {
  const source = fs.readFileSync(path.join(PREVIEW, 'cco-smart-anteckning-v3.html'), 'utf8');
  const body = applyContextBody(source);
  assert.match(
    body,
    /getElementById\('notesList'\)/,
    'demo-noterna (Anna m.fl.) ska ersättas med en ärlig tomstatus vid riktig kontext'
  );
});
