const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app.js'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(startIndex, -1, `Kunde inte hitta ${functionName} i app.js.`);

  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parameterDepth += 1;
    if (character === ')') parameterDepth -= 1;
    if (character === '{' && parameterDepth === 0) {
      bodyStart = index;
      break;
    }
  }

  assert.notEqual(bodyStart, -1, `Kunde inte hitta funktionskroppen för ${functionName}.`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(startIndex, index + 1);
    }
  }

  throw new Error(`Kunde inte extrahera ${functionName} från app.js.`);
}

test('customers-shell initierar runtime utan demo-profiler som source of truth', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /duplicateMetric:\s*0,/,
    'Customers-runtime ska starta utan förifyllda duplicate-metrics från demo-state.'
  );
  assert.match(
    source,
    /directory:\s*\{\s*\},/,
    'Customers-runtime ska starta med tom directory-map.'
  );
  assert.match(
    source,
    /details:\s*\{\s*\},/,
    'Customers-runtime ska starta med tom details-map.'
  );
  assert.match(
    source,
    /profileCounts:\s*\{\s*\},/,
    'Customers-runtime ska starta med tom profileCounts-map.'
  );
});

test('applyCustomerPersistedState ersatter shellstate med backend-sanningen utan att mergea in demo-profiler', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const buildCustomerSuggestionPairIdSource = extractFunctionSource(
    source,
    'buildCustomerSuggestionPairId'
  );
  const getCustomerDirectoryMapSource = extractFunctionSource(source, 'getCustomerDirectoryMap');
  const getCustomerDetailsMapSource = extractFunctionSource(source, 'getCustomerDetailsMap');
  const applyCustomerPersistedStateSource = extractFunctionSource(
    source,
    'applyCustomerPersistedState'
  );

  const state = {
    customerRuntime: {
      mergedInto: {},
      dismissedSuggestionIds: [],
      acceptedSuggestionIds: [],
      directory: {},
      details: {},
      profileCounts: {},
      error: '',
      loaded: false,
      authRequired: false,
      duplicateMetric: 0,
    },
    customerPrimaryEmailByKey: {},
    customerSettings: {},
  };

  const buildHarness = new Function(
    'state',
    'cloneJson',
    'asArray',
    'normalizeKey',
    'DEFAULT_CUSTOMER_SETTINGS',
    'ensureCustomerRuntimeProfilesFromLive',
    'applyCustomerFilters',
    `${buildCustomerSuggestionPairIdSource}
${getCustomerDirectoryMapSource}
${getCustomerDetailsMapSource}
${applyCustomerPersistedStateSource}
return {
  getCustomerDirectoryMap,
  getCustomerDetailsMap,
  applyCustomerPersistedState,
};`
  );

  const { getCustomerDirectoryMap, getCustomerDetailsMap, applyCustomerPersistedState } =
    buildHarness(
      state,
      (value) => JSON.parse(JSON.stringify(value)),
      (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
      (value) => String(value || '').trim().toLowerCase(),
      {
        auto_merge: true,
        highlight_duplicates: true,
        strict_email: false,
      },
      () => {},
      () => {}
    );

  applyCustomerPersistedState({
    directory: {
      anna_main: { name: 'Anna Karlsson', profileCount: 2 },
      lina_main: { name: 'Lina Karlsson', profileCount: 1 },
    },
    details: {
      anna_main: {
        emails: ['anna.one@example.com'],
        phone: '0701234567',
        mailboxes: ['kons'],
      },
      lina_main: {
        emails: ['lina.one@example.com'],
        phone: '0707654321',
        mailboxes: ['contact'],
      },
    },
    profileCounts: {
      anna_main: 2,
      lina_main: 1,
    },
    primaryEmailByKey: {
      anna_main: 'anna.one@example.com',
      lina_main: 'lina.one@example.com',
    },
  });

  assert.deepEqual(
    Object.keys(getCustomerDirectoryMap()).sort(),
    ['anna_main', 'lina_main'],
    'Customers-shellen ska nu spegla backendens directory exakt i stället för att läcka in demo-profiler som johan/emma.'
  );
  assert.deepEqual(
    Object.keys(getCustomerDetailsMap()).sort(),
    ['anna_main', 'lina_main'],
    'Customers-shellens detail-map ska nu spegla backendens keys exakt.'
  );
  assert.deepEqual(
    Object.keys(state.customerPrimaryEmailByKey).sort(),
    ['anna_main', 'lina_main'],
    'Primary-email-map ska nu följa backendens payload i stället för att bära med demo-primary-emails.'
  );
});

test('customers-shell no longer falls back to johan when selection is empty', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.ok(
    !source.includes('getVisibleCustomerPoolKeys()[0] || "johan"'),
    'setSelectedCustomerIdentity får inte längre falla tillbaka till demo-kunden johan.'
  );
  assert.ok(
    !source.includes('setSelectedCustomerIdentity("johan")'),
    'Initkedjan får inte längre återvälja demo-kunden johan när Customers-shellen bootstrapar.'
  );
});

test('customers-shell visar arligt empty/error-status nar inga kunder finns', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    source,
    /if \(state\.customerRuntime\.error\) \{\s*setCustomersStatus\(state\.customerRuntime\.error,\s*"error"\);/s,
    'Customers-shellen ska behålla backend-/auth-felet i statusraden när listan är tom.'
  );
  assert.match(
    source,
    /setCustomersStatus\("Kundregistret är tomt just nu\.",\s*"loading"\);/,
    'Customers-shellen ska visa ett sannare empty-state i stället för att låtsas att ett filter alltid är orsaken.'
  );
});
