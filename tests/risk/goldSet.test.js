const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  GOLD_BANDS,
  levelToBand,
  readGoldSetFile,
  evaluateGoldSetCases,
  evaluateGoldSetFile,
} = require('../../src/risk/goldSet');

test('levelToBand maps risk levels to gold bands', () => {
  assert.equal(levelToBand(1), 'safe');
  assert.equal(levelToBand(2), 'safe');
  assert.equal(levelToBand(3), 'borderline');
  assert.equal(levelToBand(4), 'critical');
  assert.equal(levelToBand(5), 'critical');
});

test('levelToBand klämmer utanför 1–5 och accepterar siffersträng', () => {
  assert.equal(levelToBand(0), 'safe');
  assert.equal(levelToBand(99), 'critical');
  assert.equal(levelToBand('3'), 'borderline');
  assert.equal(levelToBand(NaN), 'safe');
});

test('levelToBand nullish risknivå faller tillbaka till safe', () => {
  assert.equal(levelToBand(null), 'safe');
  assert.equal(levelToBand(undefined), 'safe');
});

test('GOLD_BANDS is frozen trio of labels', () => {
  assert.deepEqual([...GOLD_BANDS].sort(), ['borderline', 'critical', 'safe']);
});

test('readGoldSetFile parses cases and counts by expected band', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold-'));
  const fp = path.join(dir, 'gold.json');
  await fs.writeFile(
    fp,
    JSON.stringify({
      version: 'test-1',
      generatedAt: '2026-01-01T00:00:00.000Z',
      source: 'unit',
      cases: [
        {
          id: 'a',
          category: 'BOOKING',
          content: 'Tack, vi bekräftar tiden.',
          expectedBand: 'safe',
        },
        {
          id: 'b',
          category: 'CONSULTATION',
          content: 'Vi garanterar permanent resultat utan komplikationer.',
          expectedBand: 'critical',
        },
      ],
    }),
    'utf8',
  );

  const dataset = await readGoldSetFile(fp);
  assert.equal(dataset.version, 'test-1');
  assert.equal(dataset.count, 2);
  assert.equal(dataset.byBand.safe, 1);
  assert.equal(dataset.byBand.critical, 1);
  assert.equal(dataset.cases[0].expectedBand, 'safe');

  await fs.rm(dir, { recursive: true, force: true });
});

test('readGoldSetFile saknad eller icke-array cases ger count noll', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold-no-cases-'));
  const missing = path.join(dir, 'missing-cases.json');
  await fs.writeFile(missing, JSON.stringify({ version: 'v-empty' }), 'utf8');
  const a = await readGoldSetFile(missing);
  assert.equal(a.count, 0);
  assert.equal(a.byBand.safe, 0);

  const wrongType = path.join(dir, 'cases-not-array.json');
  await fs.writeFile(
    wrongType,
    JSON.stringify({ version: 'v2', cases: { oops: true } }),
    'utf8'
  );
  const b = await readGoldSetFile(wrongType);
  assert.equal(b.count, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('readGoldSetFile härleder expectedBand från expectedRiskLevel när band saknas', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold-band-'));
  const fp = path.join(dir, 'gold.json');
  await fs.writeFile(
    fp,
    JSON.stringify({
      version: 'v2',
      cases: [
        {
          id: 'lvl-only',
          category: 'BOOKING',
          content: 'Bekräftar tid.',
          expectedRiskLevel: 3,
        },
      ],
    }),
    'utf8',
  );
  const dataset = await readGoldSetFile(fp);
  assert.equal(dataset.count, 1);
  assert.equal(dataset.cases[0].expectedBand, 'borderline');
  assert.equal(dataset.cases[0].expectedRiskLevel, 3);
  await fs.rm(dir, { recursive: true, force: true });
});

test('readGoldSetFile hoppar ogiltig kategori, tomt innehåll och ogiltigt band', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold-skip-'));
  const fp = path.join(dir, 'gold.json');
  await fs.writeFile(
    fp,
    JSON.stringify({
      version: 'v-skip',
      cases: [
        { id: 'bad-cat', category: 'NOT_A_REAL_CATEGORY', content: 'x', expectedBand: 'safe' },
        { id: 'empty', category: 'BOOKING', content: '  ', expectedBand: 'safe' },
        { id: 'bad-band', category: 'BOOKING', content: 'Hej.', expectedBand: 'nope' },
        null,
        { id: 'ok', category: 'LEAD', content: 'Hej!', expectedBand: 'safe' },
      ],
    }),
    'utf8',
  );
  const dataset = await readGoldSetFile(fp);
  assert.equal(dataset.count, 1);
  assert.equal(dataset.cases[0].id, 'ok');
  await fs.rm(dir, { recursive: true, force: true });
});

test('evaluateGoldSetCases hanterar tom lista och ogiltig riskThresholdVersion', () => {
  const empty = evaluateGoldSetCases({ cases: [] });
  assert.equal(empty.totals.cases, 0);
  assert.equal(empty.totals.bandAccuracyPercent, 0);

  const one = evaluateGoldSetCases({
    cases: [
      {
        id: 'z',
        category: 'BOOKING',
        content: 'Tack för visat intresse.',
        expectedBand: 'safe',
      },
    ],
    riskThresholdVersion: NaN,
  });
  assert.equal(one.riskThresholdVersion, 1);
  assert.equal(one.totals.cases, 1);
});

test('evaluateGoldSetCases icke-array cases behandlas som tom lista', () => {
  const nullCases = evaluateGoldSetCases({ cases: null });
  assert.equal(nullCases.totals.cases, 0);

  const objectCases = evaluateGoldSetCases({ cases: { not: 'array' } });
  assert.equal(objectCases.totals.cases, 0);
});

test('evaluateGoldSetCases ogiltig tenantRiskModifier blir noll', () => {
  const report = evaluateGoldSetCases({
    cases: [
      {
        id: 'mod-test',
        category: 'LEAD',
        content: 'Hej och välkommen.',
        expectedBand: 'safe',
      },
    ],
    tenantRiskModifier: 'not-a-number',
  });
  assert.equal(report.tenantRiskModifier, 0);
  assert.equal(report.totals.cases, 1);
});

test('evaluateGoldSetCases produces totals and confusion matrix', () => {
  const report = evaluateGoldSetCases({
    cases: [
      {
        id: 'x1',
        category: 'INTERNAL',
        content: 'Kort intern notis.',
        expectedBand: 'safe',
      },
      {
        id: 'x2',
        category: 'AFTERCARE',
        content: 'Vi garanterar 100% bot utan biverkningar.',
        expectedBand: 'critical',
        expectedRiskLevel: 5,
      },
    ],
    tenantRiskModifier: 0,
    riskThresholdVersion: 1,
  });

  assert.equal(report.totals.cases, 2);
  assert.ok(report.totals.correctBand >= 0);
  assert.ok(typeof report.bandConfusionMatrix.safe.safe === 'number');
  assert.equal(report.totals.withExpectedLevel, 1);
});

test('evaluateGoldSetFile wires readGoldSetFile to evaluateGoldSetCases', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold2-'));
  const fp = path.join(dir, 'gold.json');
  await fs.writeFile(
    fp,
    JSON.stringify({
      version: 'v',
      cases: [
        {
          id: 'only',
          category: 'LEAD',
          content: 'Hej, jag vill veta mer om er klinik.',
          expectedBand: 'safe',
        },
      ],
    }),
    'utf8',
  );

  const out = await evaluateGoldSetFile({ filePath: fp });
  assert.equal(out.dataset.count, 1);
  assert.equal(out.report.totals.cases, 1);
  assert.equal(out.dataset.filePath, fp);

  await fs.rm(dir, { recursive: true, force: true });
});

test('readGoldSetFile normaliserar variableValidation och auto-id för tomt id', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold-vars-'));
  const fp = path.join(dir, 'gold.json');
  await fs.writeFile(
    fp,
    JSON.stringify({
      cases: [
        {
          id: '   ',
          category: 'BOOKING',
          content: 'Bekräftar tid 2026-01-01.',
          expectedBand: 'safe',
          variableValidation: {
            unknownVariables: [' {{foo}} ', '', null],
            missingRequiredVariables: [' {{disclaimer}} ', '  '],
          },
        },
      ],
    }),
    'utf8'
  );

  const dataset = await readGoldSetFile(fp);
  assert.equal(dataset.count, 1);
  assert.equal(dataset.cases[0].id, 'case-1');
  assert.deepEqual(dataset.cases[0].variableValidation.unknownVariables, ['{{foo}}']);
  assert.deepEqual(dataset.cases[0].variableValidation.missingRequiredVariables, ['{{disclaimer}}']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('evaluateGoldSetCases parsear riskThresholdVersion från sträng och normaliserar modifier', () => {
  const report = evaluateGoldSetCases({
    cases: [
      {
        id: 's1',
        category: 'LEAD',
        content: 'Hej och välkommen.',
        expectedBand: 'safe',
      },
    ],
    tenantRiskModifier: '4.4',
    riskThresholdVersion: '3',
  });
  assert.equal(report.riskThresholdVersion, 3);
  assert.equal(report.tenantRiskModifier, 4.4);
  assert.equal(report.totals.cases, 1);
});

test('readGoldSetFile hoppar rad utan giltigt band och utan härledbar risknivå', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold-no-band-'));
  const fp = path.join(dir, 'gold.json');
  await fs.writeFile(
    fp,
    JSON.stringify({
      version: 'v-no-band',
      cases: [
        {
          id: 'bad',
          category: 'BOOKING',
          content: 'Hej.',
          expectedBand: 'nope',
          expectedRiskLevel: 'not-a-number',
        },
      ],
    }),
    'utf8'
  );
  const dataset = await readGoldSetFile(fp);
  assert.equal(dataset.count, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

test('readGoldSetFile sätter variableValidation till null för tom validering', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold-empty-vars-'));
  const fp = path.join(dir, 'gold.json');
  await fs.writeFile(
    fp,
    JSON.stringify({
      cases: [
        {
          id: 'e1',
          category: 'BOOKING',
          content: 'Bekräftar.',
          expectedBand: 'safe',
          variableValidation: {},
        },
        {
          id: 'e2',
          category: 'LEAD',
          content: 'Hej!',
          expectedBand: 'safe',
          variableValidation: {
            unknownVariables: [],
            missingRequiredVariables: [],
          },
        },
      ],
    }),
    'utf8'
  );
  const dataset = await readGoldSetFile(fp);
  assert.equal(dataset.count, 2);
  assert.equal(dataset.cases[0].variableValidation, null);
  assert.equal(dataset.cases[1].variableValidation, null);
  await fs.rm(dir, { recursive: true, force: true });
});

test('readGoldSetFile ignorerar icke-objekt variableValidation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-gold-str-vars-'));
  const fp = path.join(dir, 'gold.json');
  await fs.writeFile(
    fp,
    JSON.stringify({
      cases: [
        {
          id: 's',
          category: 'BOOKING',
          content: 'Kort.',
          expectedBand: 'safe',
          variableValidation: 'not-an-object',
        },
      ],
    }),
    'utf8'
  );
  const dataset = await readGoldSetFile(fp);
  assert.equal(dataset.count, 1);
  assert.equal(dataset.cases[0].variableValidation, null);
  await fs.rm(dir, { recursive: true, force: true });
});
