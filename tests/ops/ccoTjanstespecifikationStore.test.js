'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  listServiceSpecs,
  getServiceSpec,
  resolveServicePrice,
  resolveVatRatePercent,
  computeVatFromPrice,
  computePriceVatBreakdown,
  resolveServiceVatBreakdown,
  resolveTjanstespecVersion,
  getRequiredUnderlag,
  parsePriceKr,
  resolveServiceCatalogPath,
  SERVICE_CATALOG_PATH,
} = require('../../src/ops/ccoTjanstespecifikationStore');

test('listar 84 tjänster ur meridiq-katalogen med stabil serviceId', () => {
  const all = listServiceSpecs();
  assert.equal(all.length, 84);
  for (const spec of all) {
    assert.ok(spec.serviceId, 'serviceId ska finnas');
    assert.equal(typeof spec.priceKr, 'number');
  }
});

test('getServiceSpec resolverar en tjänst via serviceId (apiId)', () => {
  const botox = getServiceSpec(7382);
  assert.ok(botox);
  assert.equal(botox.brand, 'Curatiio');
  assert.equal(botox.category, 'Estetiska injektioner · Curatiio');
  assert.match(botox.name, /Botox/);
  assert.equal(botox.priceKr, 2300);
  assert.equal(botox.priceLabel, '2 300 kr');
  assert.equal(botox.durationMin, 60);
});

test('resolveServicePrice returnerar priset, aldrig null för känd tjänst', () => {
  assert.equal(resolveServicePrice(7085), '24 000 kr');
  assert.equal(resolveServicePrice('saknas'), null);
});

// Testet hette tidigare "…är tom tills Fazlis arbetsblad fyllt serviceIds" och
// assertade tom lista. Det var en platshållare som vaktade ett obyggt läge.
// Svaren gavs 2026-08-30 (ORD-148) och byggdes in 2026-09-01, så premissen
// föll. Ersatt, inte struket — en tom assertion hade blivit tyst grön för alltid.
test('getRequiredUnderlag ger tjänstens dokument, och tomt bara för okänd tjänst', () => {
  const botox = getRequiredUnderlag(7382); // Botox: 1 område
  assert.ok(botox.includes('journal_estetik_botox'), 'botoxraden ska bära sin journal');
  assert.ok(botox.includes('id_verifiering'), 'grunddokumenten gäller överallt');
  assert.equal(
    botox.filter((d) => d.startsWith('journal_estetik_')).length,
    1,
    'exakt en estetikjournal — ORD-148 §3'
  );

  const dhi = getRequiredUnderlag(7097); // DHI Hårtransplantation: 1000 grafts
  assert.ok(dhi.includes('journal_tp') && dhi.includes('ordination_tp'));

  // Kirurgins papper hör inte hemma på en injektion, och tvärtom.
  assert.ok(!botox.includes('journal_tp'));
  assert.ok(!dhi.includes('journal_estetik_botox'));

  // Tomt betyder fortfarande "känner inte tjänsten" — inte "kräver inget".
  assert.deepEqual(getRequiredUnderlag('saknas'), []);
});

test('parsePriceKr tolkar "28 000 kr" -> 28000 och "0 kr" -> 0', () => {
  assert.equal(parsePriceKr('28 000 kr'), 28000);
  assert.equal(parsePriceKr('0 kr'), 0);
  assert.equal(parsePriceKr(3900), 3900);
});

test('ORD-149: alla 84 rader bär momsfältet explicit — noll rader utan', () => {
  const all = listServiceSpecs();
  assert.equal(all.length, 84);
  assert.deepEqual(
    all.filter((s) => s.vatRatePercent == null).map((s) => s.serviceId),
    []
  );
  assert.ok(all.every((s) => s.vatRatePercent === 25));
});

test('ORD-149 §9: 52 000 kr (inkl) räknas bakåt → 41 600 exkl + 10 400 moms', () => {
  const b = computePriceVatBreakdown(52000, 25);
  assert.equal(b.grossKr, 52000);
  assert.equal(b.netKr, 41600);
  assert.equal(b.vatKr, 10400);
  assert.equal(b.netKr + b.vatKr, 52000);
  // Framåt (pris × 0.25) skulle ge 13 000 — fel riktning.
  assert.notEqual(b.vatKr, 13000);
  // Per tjänst.
  assert.equal(resolveServiceVatBreakdown(7097).vatKr, 10400);
});

test('ORD-149: computeVatFromPrice är bakåt, inte pris × sats', () => {
  assert.equal(computeVatFromPrice(52000, 25), 10400);
  assert.equal(computeVatFromPrice(2300, 25), 460);
  assert.equal(computeVatFromPrice(0, 25), 0);
});

test('ORD-149 §4: de 21 nollkroneraderna ger ingen momsrad', () => {
  const zero = listServiceSpecs().filter((s) => s.priceKr === 0);
  assert.equal(zero.length, 21);
  for (const s of zero) {
    assert.equal(s.vatRatePercent, 25, `${s.serviceId} ska bära satsen`);
    const b = computePriceVatBreakdown(s.priceKr, s.vatRatePercent);
    assert.equal(b.zeroPrice, true);
    assert.equal(b.vatKr, 0);
    assert.equal(b.netKr, 0);
  }
});

test('ORD-149 §3: 7414 (från-pris) är ett spann — inget exakt belopp', () => {
  const spec = getServiceSpec(7414);
  assert.equal(spec.fromPrice, true);
  const b = resolveServiceVatBreakdown(7414);
  assert.equal(b.fromPrice, true);
  assert.equal(b.vatRatePercent, 25);
  assert.equal(b.netKr, null);
  assert.equal(b.vatKr, null);
});

test('ORD-149 §8: avrundning på ett ställe — belopp som inte går jämnt ut', () => {
  const b = computePriceVatBreakdown(1001, 25);
  assert.equal(b.netKr, 801); // 1001/1.25 = 800.8 → 801
  assert.equal(b.vatKr, 200); // 1001 − 801
  assert.equal(b.netKr + b.vatKr, 1001); // summan bevaras alltid
});

test('ORD-149 §6: ändras satsen följer uträkningen med (ingen hårdkodad 25:a)', () => {
  // Per rad: 25 % läses ur katalogen.
  assert.equal(resolveVatRatePercent(7097), 25);
  // Samma belopp med en annan sats ger ett annat momsbelopp — satsen är en
  // parameter/fält, inte en konstant.
  const b12 = computePriceVatBreakdown(52000, 12);
  assert.equal(b12.vatRatePercent, 12);
  assert.notEqual(b12.vatKr, 10400);
});

test('ORD-149 §7: saknad/okänd sats ger null — inte en tyst 25:a', () => {
  assert.equal(resolveVatRatePercent('saknas-ingen-rad'), null);
  const b = computePriceVatBreakdown(52000, null);
  assert.equal(b.vatRatePercent, null);
  assert.equal(b.netKr, null);
  assert.equal(b.vatKr, null);
});

test('ORD-143: tjänstespecifikationens version hämtas från katalogen', () => {
  assert.equal(resolveTjanstespecVersion(), '2026.03');
});

test('ORD-158 väg A: repofilen är enda källa — data/-kopia ignoreras', () => {
  // Repofilen, alltid.
  assert.equal(resolveServiceCatalogPath(), SERVICE_CATALOG_PATH);

  // Lägg en felaktig data/-kopia (noll tjänster) och bevisa att den INTE vinner.
  // Mutationstest: återinför existsSync(LIVE)-grenen → denna assertion blir röd.
  const dataPath = path.join(__dirname, '..', '..', 'data', 'cco-service-catalog.json');
  const existed = fs.existsSync(dataPath);
  const original = existed ? fs.readFileSync(dataPath, 'utf8') : null;
  try {
    fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    fs.writeFileSync(dataPath, JSON.stringify({ services: [] }), 'utf8');
    assert.equal(
      resolveServiceCatalogPath(),
      SERVICE_CATALOG_PATH,
      'ska inte föredra en fil utanför repot'
    );
  } finally {
    if (existed) fs.writeFileSync(dataPath, original, 'utf8');
    else fs.rmSync(dataPath, { force: true });
  }
});
