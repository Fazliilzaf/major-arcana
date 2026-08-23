'use strict';

/**
 * V11-railen mot facit HOGERSPALT-v11-komplett-2026-06-18.
 *
 * Två avvikelser stängs här:
 *
 *  G · Smart nästa steg — facit visar EN `.next-row` per aktiv signal, första
 *      CTA:n primär och resten `.btn-action secondary`. Railen läste tidigare
 *      bara `active[0]` och dolde varje signal utom den högst prioriterade.
 *
 *  S · Sticky footer — facit skriver "✓ Bekräfta incheckning (N)". N är antalet
 *      kommande bokningar ur buildStickyActions. Railen skrev "✓ Checka in"
 *      helt utan siffra.
 *
 * Testerna är mutationsprövade: byt tillbaka till `active[0]` respektive
 * "✓ Checka in" och de faller.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RK = path.join(__dirname, '../../public/major-arcana-preview/app/cco-v11-rk.js');

function render(adapters, ctx) {
  const sandbox = { window: { CcoV11RailAdapters: adapters }, console };
  vm.runInNewContext(
    `${fs.readFileSync(RK, 'utf8')}\n;this.renderer = window.CcoV11RailKomplett;`,
    sandbox
  );
  return sandbox.renderer.render(Object.assign({ card: { displayName: 'Testkund' } }, ctx || {}));
}

const SMART_ROWS = [
  {
    ruleId: 'health.declaration_missing',
    what: 'Friskförsäkran saknas inför 20 maj',
    ctaLabel: 'Skicka SMS',
  },
  { ruleId: 'photo.consent_missing', what: 'Foto-samtycke ej markerat', ctaLabel: 'Kolla' },
];

test('G · varje aktiv signal får en egen rad med egen CTA', () => {
  const html = render({
    buildSmartNextSteps: () => SMART_ROWS,
    buildSmartNextStep: () => SMART_ROWS[0],
  });

  assert.match(html, /Friskförsäkran saknas inför 20 maj/);
  assert.match(html, /Foto-samtycke ej markerat/, 'signal 2 får inte tappas bort');
  assert.match(html, /data-kk-sig="health\.declaration_missing"[^>]*>Skicka SMS</);
  assert.match(html, /data-kk-sig="photo\.consent_missing"[^>]*>Kolla</);
  // data-kk-sig sätts bara i smart-sektionen. `.next-row` återanvänds av
  // tomtillstånden för Bokningar och Offertor och duger inte som räknare.
  assert.equal((html.match(/data-kk-sig=/g) || []).length, 2);
});

test('G · första CTA:n är primär, resten sekundära', () => {
  const html = render({
    buildSmartNextSteps: () => SMART_ROWS,
    buildSmartNextStep: () => SMART_ROWS[0],
  });

  assert.match(html, /class="btn-action" data-kk-sig="health\.declaration_missing"/);
  assert.match(html, /class="btn-action secondary" data-kk-sig="photo\.consent_missing"/);
  assert.equal((html.match(/btn-action secondary/g) || []).length, 1);
});

test('G · faller tillbaka på enskild signal när adaptern saknar buildSmartNextSteps', () => {
  const html = render({ buildSmartNextStep: () => SMART_ROWS[0] });

  assert.match(html, /Friskförsäkran saknas inför 20 maj/);
  assert.equal((html.match(/data-kk-sig=/g) || []).length, 1);
  assert.doesNotMatch(html, /btn-action secondary/);
});

test('S · incheckningsknappen bär antalet kommande bokningar', () => {
  const html = render({
    buildActiveVisitFromBundle: () => ({ state: 'scheduled_today' }),
    buildStickyActions: () => ({ patientId: 'p1', bookCount: 12, ready: true }),
  });

  assert.match(html, /data-v11-active-visit-action="checkin">✓ Bekräfta incheckning \(12\)</);
  assert.doesNotMatch(
    html,
    />✓ Checka in</,
    'facit säger "Bekräfta incheckning", inte "Checka in"'
  );
});

test('S · ingen parentes när antalet saknas — aldrig en påhittad nolla', () => {
  for (const sticky of [null, { bookCount: 0 }, { bookCount: NaN }, {}]) {
    const html = render({
      buildActiveVisitFromBundle: () => ({ state: 'scheduled_today' }),
      buildStickyActions: () => sticky,
    });
    assert.match(html, /data-v11-active-visit-action="checkin">✓ Bekräfta incheckning</);
    assert.doesNotMatch(html, /Bekräfta incheckning \(/, `bookCount=${JSON.stringify(sticky)}`);
  }
});

test('S · de andra livscykel-knapparna är orörda', () => {
  const complete = render({
    buildActiveVisitFromBundle: () => ({ state: 'in_progress' }),
    buildStickyActions: () => ({ bookCount: 12 }),
  });
  assert.match(complete, />✓ Avsluta besök</);
  assert.doesNotMatch(complete, /Bekräfta incheckning/);

  const followup = render({
    buildActiveVisitFromBundle: () => ({ state: 'completed_today' }),
    buildStickyActions: () => ({ bookCount: 12 }),
  });
  assert.match(followup, />📅 Boka uppföljning</);
});
