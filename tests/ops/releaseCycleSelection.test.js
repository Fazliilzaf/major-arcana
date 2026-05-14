const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { pickReusableCycleId, loadReusableCycleId } = require('../../src/ops/releaseCycleSelection');

test('pickReusableCycleId prefers latest launched cycle for tenant', () => {
  const cycles = [
    {
      id: 'rel-old',
      tenantId: 'hair-tp-clinic',
      status: 'launched',
      launch: { launchedAt: '2026-02-20T10:00:00.000Z' },
      updatedAt: '2026-02-20T10:01:00.000Z',
    },
    {
      id: 'rel-new',
      tenantId: 'hair-tp-clinic',
      status: 'launched',
      launch: { launchedAt: '2026-02-25T10:00:00.000Z' },
      updatedAt: '2026-02-25T10:01:00.000Z',
    },
    {
      id: 'rel-other-tenant',
      tenantId: 'other',
      status: 'launched',
      launch: { launchedAt: '2026-02-26T10:00:00.000Z' },
      updatedAt: '2026-02-26T10:01:00.000Z',
    },
  ];

  assert.equal(pickReusableCycleId(cycles, 'hair-tp-clinic'), 'rel-new');
});

test('pickReusableCycleId falls back to latest launch_ready when launched is missing', () => {
  const cycles = [
    {
      id: 'rel-ready-old',
      tenantId: 'hair-tp-clinic',
      status: 'launch_ready',
      updatedAt: '2026-02-21T09:00:00.000Z',
    },
    {
      id: 'rel-ready-new',
      tenantId: 'hair-tp-clinic',
      status: 'launch_ready',
      updatedAt: '2026-02-23T09:00:00.000Z',
    },
  ];

  assert.equal(pickReusableCycleId(cycles, 'hair-tp-clinic'), 'rel-ready-new');
});

test('pickReusableCycleId returns empty string when no reusable cycle exists', () => {
  const cycles = [
    {
      id: 'rel-planning',
      tenantId: 'hair-tp-clinic',
      status: 'planning',
      updatedAt: '2026-02-21T09:00:00.000Z',
    },
    {
      id: 'rel-halted',
      tenantId: 'hair-tp-clinic',
      status: 'halted',
      updatedAt: '2026-02-23T09:00:00.000Z',
    },
  ];

  assert.equal(pickReusableCycleId(cycles, 'hair-tp-clinic'), '');
});

test('loadReusableCycleId supports object options', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-select-'));
  const filePath = path.join(tempRoot, 'release-governance.json');
  await fs.writeFile(
    filePath,
    `${JSON.stringify(
      {
        cycles: [
          {
            id: 'rel-a',
            tenantId: 'hair-tp-clinic',
            status: 'launch_ready',
            updatedAt: '2026-02-21T10:00:00.000Z',
          },
          {
            id: 'rel-b',
            tenantId: 'hair-tp-clinic',
            status: 'launched',
            launch: { launchedAt: '2026-02-22T10:00:00.000Z' },
          },
        ],
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  const cycleId = await loadReusableCycleId({
    filePath,
    tenantId: 'hair-tp-clinic',
  });
  assert.equal(cycleId, 'rel-b');
});

test('pickReusableCycleId väljer senaste launched före launch_ready för samma tenant', () => {
  const cycles = [
    {
      id: 'rel-ready',
      tenantId: 't1',
      status: 'launch_ready',
      updatedAt: '2026-03-01T12:00:00.000Z',
    },
    {
      id: 'rel-live',
      tenantId: 't1',
      status: 'launched',
      launch: { launchedAt: '2026-02-01T12:00:00.000Z' },
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-live');
});

test('pickReusableCycleId med tom tenantId inkluderar alla cykler med id', () => {
  const cycles = [
    {
      id: 'rel-a',
      tenantId: 'x',
      status: 'launched',
      launch: { launchedAt: '2026-01-10T00:00:00.000Z' },
    },
    {
      id: 'rel-b',
      tenantId: 'y',
      status: 'launched',
      launch: { launchedAt: '2026-01-20T00:00:00.000Z' },
    },
  ];
  assert.equal(pickReusableCycleId(cycles, ''), 'rel-b');
});

test('pickReusableCycleId använder top-level launchedAt när launch saknas', () => {
  const cycles = [
    {
      id: 'rel-top',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-04-01T08:00:00.000Z',
    },
    {
      id: 'rel-old',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-03-01T08:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-top');
});

test('pickReusableCycleId ignorerar rader utan id', () => {
  const cycles = [
    { tenantId: 't1', status: 'launched', launchedAt: '2026-01-01T00:00:00.000Z' },
    {
      id: 'rel-ok',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-01-02T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-ok');
});

test('loadReusableCycleId tom sträng vid saknad fil eller trasig JSON', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-missing-'));
  const missingPath = path.join(tempRoot, 'no-such-release.json');
  assert.equal(await loadReusableCycleId(missingPath, 't1'), '');

  const badPath = path.join(tempRoot, 'bad.json');
  await fs.writeFile(badPath, '{ not json', 'utf8');
  assert.equal(await loadReusableCycleId(badPath, 't1'), '');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('loadReusableCycleId positional argument fungerar', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-pos-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      cycles: [
        {
          id: 'rel-pos',
          tenantId: 'tenant-q',
          status: 'launch_ready',
          updatedAt: '2026-05-01T10:00:00.000Z',
        },
      ],
    }),
    'utf8'
  );
  assert.equal(await loadReusableCycleId(filePath, 'tenant-q'), 'rel-pos');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId hanterar null eller icke-array som tom lista', () => {
  assert.equal(pickReusableCycleId(null, 't1'), '');
  assert.equal(pickReusableCycleId({ not: 'array' }, 't1'), '');
});

test('pickReusableCycleId sorterar launched med updatedAt när launch.launchedAt ogiltig', () => {
  const cycles = [
    {
      id: 'rel-newer',
      tenantId: 't1',
      status: 'launched',
      launch: { launchedAt: 'not-a-date' },
      updatedAt: '2026-06-02T12:00:00.000Z',
    },
    {
      id: 'rel-older',
      tenantId: 't1',
      status: 'launched',
      launch: { launchedAt: 'also-bad' },
      updatedAt: '2026-06-01T12:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-newer');
});

test('pickReusableCycleId matchar status case-insensitive', () => {
  const cycles = [
    {
      id: 'rel-mixed',
      tenantId: 't1',
      status: '  LAUNCHED ',
      launchedAt: '2026-07-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-mixed');
});

test('loadReusableCycleId tom cycles-array ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-empty-cycles-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, JSON.stringify({ cycles: [] }), 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 'any' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId trimmar tenantId i bade cykel och argument', () => {
  const cycles = [
    {
      id: 'rel-trimmed',
      tenantId: '  hair-tp-clinic  ',
      status: 'launched',
      launchedAt: '2026-01-15T12:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, '  hair-tp-clinic  '), 'rel-trimmed');
});

test('loadReusableCycleId saknad cycles-nyckel ger tom string', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-no-cycles-key-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, JSON.stringify({ version: 1, meta: {} }), 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId launch_ready sorterar med updatedAt nar launchedAt saknas helt', () => {
  const cycles = [
    {
      id: 'ready-a',
      tenantId: 't1',
      status: 'launch_ready',
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
    {
      id: 'ready-b',
      tenantId: 't1',
      status: 'launch_ready',
      updatedAt: '2026-08-10T10:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'ready-b');
});

test('loadReusableCycleId trimmar tenantId i options-objekt', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-opt-trim-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      cycles: [
        {
          id: 'rel-trim-opt',
          tenantId: 'acme-corp',
          status: 'launch_ready',
          updatedAt: '2026-09-01T12:00:00.000Z',
        },
      ],
    }),
    'utf8'
  );
  assert.equal(
    await loadReusableCycleId({ filePath, tenantId: '  acme-corp  ' }),
    'rel-trim-opt'
  );
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('loadReusableCycleId cycles som icke-array ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-cycles-object-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, JSON.stringify({ cycles: { id: 'oops' } }), 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId trimmar whitespace i status launch_ready', () => {
  const cycles = [
    {
      id: 'rel-padded-status',
      tenantId: 't1',
      status: '  launch_ready  ',
      updatedAt: '2026-10-01T08:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-padded-status');
});

test('pickReusableCycleId trimmar whitespace i status launched', () => {
  const cycles = [
    {
      id: 'rel-pad-launch',
      tenantId: 't1',
      status: '  Launched  ',
      launchedAt: '2026-11-05T10:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-pad-launch');
});

test('loadReusableCycleId tar tenantId fran andra argument nar options saknar tenantId', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-2nd-arg-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      cycles: [
        {
          id: 'rel-2nd',
          tenantId: 'beta-tenant',
          status: 'launch_ready',
          updatedAt: '2026-11-10T10:00:00.000Z',
        },
      ],
    }),
    'utf8'
  );
  assert.equal(await loadReusableCycleId({ filePath }, '  beta-tenant  '), 'rel-2nd');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId tenantId endast whitespace matchar alla tenants som tom sträng', () => {
  const cycles = [
    {
      id: 'rel-a',
      tenantId: 'x',
      status: 'launched',
      launch: { launchedAt: '2026-01-10T00:00:00.000Z' },
    },
    {
      id: 'rel-b',
      tenantId: 'y',
      status: 'launched',
      launch: { launchedAt: '2026-01-20T00:00:00.000Z' },
    },
  ];
  assert.equal(pickReusableCycleId(cycles, ' \t '), 'rel-b');
});

test('pickReusableCycleId launch_ready sorterar med launch.launchedAt när den finns', () => {
  const cycles = [
    {
      id: 'ready-old-launch',
      tenantId: 't1',
      status: 'launch_ready',
      launch: { launchedAt: '2026-05-01T12:00:00.000Z' },
      updatedAt: '2026-12-31T12:00:00.000Z',
    },
    {
      id: 'ready-newer-launch',
      tenantId: 't1',
      status: 'launch_ready',
      launch: { launchedAt: '2026-06-15T12:00:00.000Z' },
      updatedAt: '2026-01-01T12:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'ready-newer-launch');
});

test('pickReusableCycleId returnerar trimmat id nar cykel-id har whitespace', () => {
  const cycles = [
    {
      id: '  rel-spaced-id  ',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-12-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-spaced-id');
});

test('pickReusableCycleId använder launch.launchedAt före top-level launchedAt', () => {
  const cycles = [
    {
      id: 'rel-nested-old',
      tenantId: 't1',
      status: 'launched',
      launch: { launchedAt: '2026-02-01T12:00:00.000Z' },
      launchedAt: '2026-12-01T12:00:00.000Z',
    },
    {
      id: 'rel-newer-top',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-03-01T12:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-newer-top');
});

test('pickReusableCycleId ignorerar rader dar id bara ar whitespace', () => {
  const cycles = [
    {
      id: '   ',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-12-31T00:00:00.000Z',
    },
    {
      id: 'rel-valid',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-valid');
});

test('loadReusableCycleId tom fil ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-empty-file-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, '', 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('loadReusableCycleId tenantId i options slar andra positionsargumentet', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-opt-tenant-wins-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      cycles: [
        {
          id: 'rel-opt-wins',
          tenantId: 'tenant-alpha',
          status: 'launch_ready',
          updatedAt: '2026-12-05T10:00:00.000Z',
        },
        {
          id: 'rel-other',
          tenantId: 'tenant-beta',
          status: 'launch_ready',
          updatedAt: '2026-12-06T10:00:00.000Z',
        },
      ],
    }),
    'utf8'
  );
  assert.equal(
    await loadReusableCycleId({ filePath, tenantId: 'tenant-alpha' }, 'tenant-beta'),
    'rel-opt-wins'
  );
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId ignorerar icke-string id', () => {
  const cycles = [
    {
      id: 999,
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 'rel-string',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-05-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-string');
});

test('loadReusableCycleId JSON-array som rot ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-root-array-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, JSON.stringify([{ cycles: [] }]), 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId status med inner mellanslag matchar inte launch_ready', () => {
  const cycles = [
    {
      id: 'rel-gap',
      tenantId: 't1',
      status: 'launch ready',
      updatedAt: '2026-06-10T10:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), '');
});

test('pickReusableCycleId tom array ger tom id', () => {
  assert.equal(pickReusableCycleId([], 'any-tenant'), '');
});

test('loadReusableCycleId cycles null i JSON behandlas som tom lista', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-cycles-null-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, JSON.stringify({ version: 1, cycles: null }), 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('loadReusableCycleId JSON null som rot ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-root-null-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, 'null', 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId status null eller undefined ger ingen matchning', () => {
  const cycles = [
    {
      id: 'rel-no-status',
      tenantId: 't1',
      status: null,
      launchedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'rel-undef',
      tenantId: 't1',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), '');
});

test('pickReusableCycleId ogiltig launch.launchedAt faller tillbaka till updatedAt inte top-level launchedAt', () => {
  const cycles = [
    {
      id: 'rel-bad-nested',
      tenantId: 't1',
      status: 'launched',
      launch: { launchedAt: 'ogiltig' },
      launchedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    },
    {
      id: 'rel-clean',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-02-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-clean');
});

test('loadReusableCycleId fil med bara whitespace ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-ws-only-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, ' \n\t ', 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId numerisk tenantId på rad matchar inte sträng tenant', () => {
  const cycles = [
    {
      id: 'rel-num-tenant',
      tenantId: 42,
      status: 'launched',
      launchedAt: '2026-10-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, '42'), '');
});

test('pickReusableCycleId matchar LAUNCH_READY case-insensitive', () => {
  const cycles = [
    {
      id: 'rel-upper-ready',
      tenantId: 't1',
      status: 'LAUNCH_READY',
      updatedAt: '2026-11-20T12:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-upper-ready');
});

test('pickReusableCycleId tomt launch-objekt använder top-level launchedAt', () => {
  const cycles = [
    {
      id: 'rel-empty-launch',
      tenantId: 't1',
      status: 'launched',
      launch: {},
      launchedAt: '2026-12-12T12:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-empty-launch');
});

test('loadReusableCycleId cycles som primitivt nummer ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-cycles-number-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, JSON.stringify({ cycles: 3 }), 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('loadReusableCycleId JSON-sträng som rot ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-root-string-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, JSON.stringify('governance'), 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId hoppar över null-element i cycles-array', () => {
  const cycles = [
    null,
    {
      id: 'rel-after-null',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-06-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-after-null');
});

test('pickReusableCycleId ignorerar id som bara är nyrader och tabbar', () => {
  const cycles = [
    {
      id: '\n\t\n',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-12-31T00:00:00.000Z',
    },
    {
      id: 'rel-ok',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-ok');
});

test('loadReusableCycleId JSON boolean som rot ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-root-bool-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(filePath, 'true', 'utf8');
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId saknad tenantId på rad exkluderas vid tenant-filter', () => {
  const cycles = [
    {
      id: 'rel-no-tenant',
      status: 'launched',
      launchedAt: '2026-12-31T00:00:00.000Z',
    },
    {
      id: 'rel-with-tenant',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-with-tenant');
});

test('pickReusableCycleId launch.launchedAt null använder top-level launchedAt', () => {
  const cycles = [
    {
      id: 'rel-null-nested',
      tenantId: 't1',
      status: 'launched',
      launch: { launchedAt: null },
      launchedAt: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'rel-earlier',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-02-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-null-nested');
});

test('pickReusableCycleId launch null använder top-level launchedAt', () => {
  const cycles = [
    {
      id: 'rel-launch-null',
      tenantId: 't1',
      status: 'launched',
      launch: null,
      launchedAt: '2026-08-10T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-launch-null');
});

test('loadReusableCycleId trimmar filePath i options', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-fp-trim-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      cycles: [
        {
          id: 'rel-fp-trim',
          tenantId: 'sid-v-1',
          status: 'launch_ready',
          updatedAt: '2026-04-01T10:00:00.000Z',
        },
      ],
    }),
    'utf8'
  );
  assert.equal(
    await loadReusableCycleId({ filePath: `  ${filePath}  \n`, tenantId: 'sid-v-1' }),
    'rel-fp-trim'
  );
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('loadReusableCycleId UTF-8 BOM före JSON ger tom id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cycle-bom-'));
  const filePath = path.join(tempRoot, 'rg.json');
  await fs.writeFile(
    filePath,
    `\uFEFF${JSON.stringify({
      cycles: [
        {
          id: 'rel-bom-ignored',
          tenantId: 't1',
          status: 'launch_ready',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })}`,
    'utf8'
  );
  assert.equal(await loadReusableCycleId({ filePath, tenantId: 't1' }), '');
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('pickReusableCycleId hoppar över undefined-element i cycles-array', () => {
  const cycles = [
    undefined,
    {
      id: 'rel-after-undef',
      tenantId: 't1',
      status: 'launched',
      launchedAt: '2026-05-15T12:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), 'rel-after-undef');
});

test('pickReusableCycleId returnerar tom sträng när endast okända statusar', () => {
  const cycles = [
    {
      id: 'rel-draft',
      tenantId: 't1',
      status: 'draft',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'rel-archived',
      tenantId: 't1',
      status: 'archived',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ];
  assert.equal(pickReusableCycleId(cycles, 't1'), '');
});
